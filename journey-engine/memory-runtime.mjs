import {recordedDeviceContext} from './recorded-device.mjs';
import { composePersonaMemory } from './library-context.mjs';
import { redactJson } from './workspace-execution.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const learningFields = new Set(['name','content','kind','subject','value','polarity','audience','confidence','confidenceBasis','scope','sources']);
const rejected = () => ({ publicationError: 'The model learning had an unsupported or oversized structure.' });

// Selection is not delivery: a preflight or transport failure must not create an
// access receipt or suppress the same knowledge from a later valid request.
export async function sendWithMemoryReceipt(send,body,{runId,snapshotId,memory,eventIndex,recordAccess,delivered}={}){
  const receipt=memory?.entries?.length?{runId,snapshotId,audience:'persona',url:memory.url,entryIds:[...memory.entryIds],eventIndex,versionKeys:memory.entries.map(entry=>entry.versionId||`${entry.id}:${entry.version}`)}:null;
  const response=await send(body);
  const acknowledged=object(response)&&typeof response.id==='string'&&Boolean(response.id.trim())&&['completed','incomplete'].includes(response.status)&&!response.error&&Number.isSafeInteger(response.usage?.input_tokens)&&response.usage.input_tokens>0;
  if(receipt&&acknowledged){
    const {runId:id,versionKeys,...access}=receipt;
    await recordAccess(id,access);
    for(const key of versionKeys)delivered.add(key);
  }
  return response;
}

export function bindRunMemorySnapshot(run, memory) {
  const snapshot=run.memorySnapshot;
  if(!run.projectId||!snapshot||run.comparisonId)return snapshot;
  const buildId=memory.buildIdentity(run);
  if(snapshot.buildResolved===false)return memory.bindSnapshotBuild(snapshot,{buildId});
  if(snapshot.buildResolved===true&&(snapshot.environment?.buildId||null)!==(buildId||null)){
    throw Object.assign(new Error('The source build changed since this journey’s memory was pinned. Start a new journey instead of retrying stale knowledge.'),{code:'MEMORY_SOURCE_CHANGED'});
  }
  return snapshot;
}

// Invalid learning proposals must not discard an otherwise valid journey result.
// The store records their publication failure; unknown fields and secret values
// are not copied into a durable run or accepted as authority.
export function prepareMemoryLearnings(value, secrets = []) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 12) return [rejected()];
  return value.map(item => {
    if (!object(item) || Object.keys(item).some(key => !learningFields.has(key)) || JSON.stringify(item).length > 20000) return rejected();
    if (item.scope !== undefined && (!object(item.scope) || Object.keys(item.scope).some(key => !['screenPatterns','flows'].includes(key)))) return rejected();
    if (item.sources !== undefined && (!Array.isArray(item.sources) || item.sources.length > 12 || item.sources.some(source => !object(source) || Object.keys(source).some(key => !['runId','eventIndex'].includes(key))))) return rejected();
    return redactJson(item, secrets);
  });
}

// Preview origins change during a fix. Match a displayed screen to its original
// product route without resolving a fresh snapshot for the candidate.
export function memoryScreenUrl(run, visibleUrl) {
  try {
    const visible = new URL(visibleUrl), target = new URL(run.target), reference = new URL(run.memoryReferenceUrl || run.target);
    visible.search = ''; visible.hash = '';
    if (!run.memoryReferenceUrl || visible.origin !== target.origin) return visible.href;
    const base = target.pathname.endsWith('/') ? target.pathname : target.pathname.slice(0, target.pathname.lastIndexOf('/') + 1);
    if (!visible.pathname.startsWith(base)) return visible.href;
    const prefix = reference.pathname.endsWith('/') ? reference.pathname : reference.pathname.slice(0, reference.pathname.lastIndexOf('/') + 1);
    reference.pathname = `${prefix}${visible.pathname.slice(base.length)}`; reference.search = ''; reference.hash = '';
    return reference.href;
  } catch { return null; }
}

export function personaMemoryForScreen(run, memory, visibleUrl, delivered = new Set()) {
  const persona = run.personaSnapshot || run.persona, snapshot = run.memorySnapshot;
  if (!run.projectId || snapshot?.projectId !== run.projectId || persona?.continuity !== 'returning' || run.charterSnapshot?.memoryPolicy !== 'relevant' || typeof memory?.accessForScreen !== 'function') return { text: '', entries: [], entryIds: [], url: null };
  const url = memoryScreenUrl(run, visibleUrl);
  if (!url) return { text: '', entries: [], entryIds: [], url: null };
  const {device}=recordedDeviceContext(run);
  const lastScreen=[...(run.events||[])].reverse().find(event=>event.type==='screenshot');
  const state=lastScreen&&memoryScreenUrl(run,lastScreen.url)===url?(lastScreen.screenState||lastScreen.uiState||null):null;
  const flowContext=typeof memory.flowsForScreen==='function'?memory.flowsForScreen(snapshot,{url,state,device,environmentId:snapshot.environment?.id||run.environmentId}):{flows:[],reason:'flow_inventory_not_pinned'};
  const eligible = memory.accessForScreen(snapshot, { audience: 'persona', url, flows: flowContext.flows });
  const entries = []; let size = 0;
  for (const entry of eligible) {
    if (entry.audience !== 'persona' || entry.projectId !== run.projectId || delivered.has(entry.versionId || `${entry.id}:${entry.version}`)) continue;
    if (entry.applicability?.personaId && entry.applicability.personaId !== run.personaId) continue;
    const length = JSON.stringify(entry).length;
    if (entries.length >= 12 || size + length > 24000) break;
    entries.push(entry); size += length;
  }
  return { text: composePersonaMemory(entries), entries, entryIds: entries.map(entry => entry.id), url, flowContext };
}
