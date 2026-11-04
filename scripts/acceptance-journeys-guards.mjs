import {createHash} from 'node:crypto';
import {memoryFlowsForScreen} from '../journey-engine/workspace-memory.mjs';

export const ACTIVE = new Set(['queued','running','finalizing','preparing','verifying','retesting','cancelling']);
export const outcome = run => run?.finding?.outcome || run?.outcome;
export const completed = run => ['finished','completed'].includes(run?.status) && run.integrityStatus !== 'invalidated';
export const buildIdentity = run => run.productFingerprint && Object.keys(run.productFingerprint).length
  ? `source:${createHash('sha256').update(JSON.stringify(Object.entries(run.productFingerprint).sort())).digest('hex')}`
  : run.buildId || run.sourceIdentity?.buildId || null;

export function assertSessionEnvelope(state, additional = 0) {
  if (state.maxNewSessions !== 6) throw Error('The acceptance checkpoint must retain its original six-session limit.');
  const reserved = (state.littleSteps ? 4 : 0) + (state.firstRunId || state.firstLaunchIntent ? 1 : 0) + (state.returningRunId || state.returningLaunchIntent ? 1 : 0);
  if (reserved + additional > 6) throw Error('The six-session acceptance envelope is exhausted. No automatic repeat is allowed.');
  return reserved;
}

export function comparisonReceipt(fix, checkpoint, limits) {
  if (checkpoint.roundId && fix.latestRound?.id !== checkpoint.roundId) throw Error('The fix round changed during acceptance. No replacement comparison will be adopted.');
  const comparison = fix.latestRound?.comparison;
  if (!comparison || comparison.id === checkpoint.priorComparisonId) return null;
  if (checkpoint.comparisonId && checkpoint.comparisonId !== comparison.id) throw Error('A different comparison replaced the acceptance receipt.');
  if (!comparison.createdAt || Date.parse(comparison.createdAt) < Date.parse(checkpoint.launchRequestedAt)) throw Error('The comparison predates this acceptance request.');
  if (Object.entries(limits).some(([key,value]) => comparison.controlOverrides?.limits?.[key] !== value)) throw Error('The comparison did not retain the bounded acceptance controls.');
  const pairs = comparison.pairs || [];
  if (pairs.length > 2 || pairs.some(pair => !['mother','teacher'].includes(pair.personaId)) || new Set(pairs.map(pair => pair.personaId)).size !== pairs.length) throw Error('Unexpected retest personas would exceed the intended four-session scenario.');
  return comparison;
}

export function fieldnoteInventory(projectId, environmentId) {
  return {projectId,name:'Fieldnote · acceptance routes',scope:'The three declared routes in the owned local Fieldnote scenario.',source:{kind:'curated',reference:'scripts/acceptance-journeys.mjs and the owned Fieldnote route definitions; no outcomes or prior persona knowledge.'},completeness:'declared-scope',flows:[{id:'create-find-note',name:'Create and find a note'}],screens:[['home','Home','/'],['new','New note','/new'],['notes','Notes','/notes']].map(([id,name,routePattern])=>({id,name,routePattern,origin:'http://127.0.0.1:4388',device:'desktop',environmentIds:[environmentId],flowIds:['create-find-note'],criteria:[]}))};
}

export function sameInventoryDeclaration(actual, expected) {
  const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,stable(item)])):value;
  const normalize=value=>({name:value.name,scope:value.scope,source:{kind:value.source.kind,reference:value.source.reference},completeness:value.completeness,flows:value.flows,screens:value.screens.map(screen=>({...screen,state:screen.state||null}))});
  return JSON.stringify(stable(normalize(actual)))===JSON.stringify(stable(normalize(expected)));
}

export function eligibleFirstMemory(run, knowledge, personaId, inventory) {
  if (!completed(run) || outcome(run) !== 'goal_reached') return [];
  const identity = buildIdentity(run), snapshot = {environment:{id:run.environmentId},flowContext:{inventoryVersion:inventory.version,inventoryVersionId:inventory.versionId,charterFlows:run.charterSnapshot?.flows || [],flows:inventory.flows,screens:inventory.screens}};
  const visited = (run.events || []).filter(event => event.type === 'screenshot' && event.url);
  return (knowledge.publications || []).filter(publication => {
    const entry = publication.entry, a = entry?.applicability;
    if (publication.status !== 'published' || entry?.audience !== 'persona' || entry.projectId !== run.projectId || !a || a.personaId !== personaId || a.environmentId !== run.environmentId || a.environmentVersion !== run.environmentVersion || !identity || a.buildId !== identity || a.experimentalStudyId || entry.archived || !['published','verified','corrected'].includes(entry.status) || entry.confidence < .65 || !entry.confidenceBasis || entry.freshness?.status === 'stale' || entry.conflicts?.some(conflict=>conflict.status==='unresolved')) return false;
    if (!entry.sources?.length || entry.sources.some(source => source.runId !== run.id || !visited.some(event => event.index === source.eventIndex && event.screenshot === source.screenshot))) return false;
    const scope = entry.scope || {}, patterns = scope.screenPatterns || [], flows = scope.flows || [];
    if (!patterns.length && !flows.length) return true;
    return visited.some(event => {
      const grounded = memoryFlowsForScreen(snapshot,{url:event.url,device:'desktop',environmentId:run.environmentId,state:event.screenState || event.uiState || null});
      if (flows.some(flow=>grounded.flows.includes(flow))) return true;
      return patterns.some(pattern=>{try{const url=new URL(event.url);return new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*')}$`).test(pattern.startsWith('/')?url.pathname:`${url.origin}${url.pathname}`);}catch{return false;}});
    });
  }).map(publication=>publication.entry);
}

export function memoryReceiptChecks(first, returning, beforeKnowledge, afterKnowledge, personaId) {
  const entries = afterKnowledge.snapshot?.roles?.persona || [], firstPublications = new Map((beforeKnowledge.publications || []).filter(p=>p.status==='published').map(p=>[`${p.entryId}:${p.entryVersion}`,p]));
  const own = entries.length > 0 && entries.every(entry=>entry.applicability?.personaId===personaId && entry.sources?.length && entry.sources.every(source=>source.runId===first.id) && firstPublications.has(`${entry.id}:${entry.version}`));
  const accessed = (afterKnowledge.accessLog || []).some(log => log.audience==='persona' && log.runId===returning.id && log.snapshotId===afterKnowledge.snapshot?.id && log.entryIds?.length && log.entryIds.every(id=>entries.some(entry=>entry.id===id)) && (returning.events || []).some(event=>event.type==='screenshot' && event.index===log.eventIndex));
  return {firstTimeNoPersonaMemory:Boolean(beforeKnowledge.snapshot) && beforeKnowledge.snapshot.policy?.continuity==='first-time' && !beforeKnowledge.snapshot.roles?.persona?.length && !(beforeKnowledge.accessLog || []).some(log=>log.audience==='persona' && log.entryIds?.length),automaticPublication:firstPublications.size>0,returningOwnPersona:Boolean(own),returningScreenAccess:Boolean(accessed)};
}

export async function verifyRecording(run, origin, fetcher = fetch) {
  const expected = `/runs/${run.id}/journey.webm`;
  if (run.video !== expected) return {runId:run.id,valid:false,reason:'Recording URL does not identify this exact journey.'};
  try {
    const response = await fetcher(origin + expected,{headers:{range:'bytes=0-1023'},signal:AbortSignal.timeout(15000)});
    const bytes = Buffer.from(await response.arrayBuffer()), contentRange = response.headers.get('content-range'), size = /^bytes 0-1023\/(\d+)$/.exec(contentRange || '')?.[1];
    const valid = response.status===206 && bytes.length===1024 && Number(size)>1024 && /^video\/webm(?:;|$)/i.test(response.headers.get('content-type') || '') && bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));
    return {runId:run.id,url:expected,valid,status:response.status,contentRange,bytes:bytes.length,sampleSha256:createHash('sha256').update(bytes).digest('hex'),...(valid?{}:{reason:'The recording did not return a valid WebM byte-range receipt.'})};
  } catch(error) {return {runId:run.id,url:expected,valid:false,reason:error.message};}
}
