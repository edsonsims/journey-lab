import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { listPersonas, PRINT_SCENARIO } from './personas.mjs';
import { createWorkspaceMemory } from './workspace-memory.mjs';
import { historicalEnvironmentInstances } from './environment-provenance.mjs';
import { DEVICE_PRESETS, NETWORK_PRESETS, cleanDeviceProfile, cleanNetworkProfile, legacyDeviceProfile } from './device-profiles.mjs';

export const DEFAULT_PROJECT = 'little-steps';
export const IMPACTS = ['critical','high','medium','low','informational','untriaged'];
export const FINDING_TYPES = ['broken','experience','product','business','unclassified'];
export const TRIAGE_STATES = ['unreviewed','accepted','dismissed','duplicate'];
const KINDS = new Set(['environment','charter','persona','device','network-profile']);
const now = () => new Date().toISOString();
const json = value => JSON.stringify(value);
const parse = value => value == null ? null : JSON.parse(value);
const stableId = value => createHash('sha256').update(value).digest('hex').slice(0,24);
const bounded = (value,max=10000) => typeof value === 'string' ? value.trim().slice(0,max) : '';
const activeStatuses = new Set(['queued','running','finalizing']);
const numberOrNull = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
// Compact action evidence for list tooltips; never infer usage from hardware or persona labels.
const recordedActionTypesSql="CASE WHEN json_type(r.data,'$.events')='array' THEN (SELECT json_group_array(DISTINCT json_extract(e.value,'$.action.type')) FROM json_each(r.data,'$.events') e WHERE json_extract(e.value,'$.type')='action') END";
export class WorkspaceError extends Error { constructor(message,status=400,code='INVALID_REQUEST'){super(message);this.status=status;this.code=code;} }

function cleanUrl(value) {
  let url; try { url = new URL(value); } catch { throw new WorkspaceError('Enter a valid http or https URL.'); }
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new WorkspaceError('URLs must use http or https and must not contain credentials.');
  url.hash=''; return url.href;
}
function stringList(value,max=30) { return Array.isArray(value) ? [...new Set(value.filter(v=>typeof v==='string').map(v=>bounded(v,2000)).filter(Boolean))].slice(0,max) : []; }
function libraryText(input,old,key,max=8000,aliases=[]) {
  const source=[key,...aliases].find(name=>Object.hasOwn(input,name));
  const value=source===undefined?(old[key]??aliases.map(name=>old[name]).find(value=>value!==undefined)):input[source];
  if(value!==undefined&&value!==null&&typeof value!=='string')throw new WorkspaceError(`${key} must be text.`);
  return bounded(value,max);
}
function libraryList(input,old,key,max=30,itemMax=2000){
  const value=Object.hasOwn(input,key)?input[key]:old[key];
  if(value!==undefined&&value!==null&&(!Array.isArray(value)||value.some(item=>typeof item!=='string')))throw new WorkspaceError(`${key} must be a list of text values.`);
  return [...new Set((value||[]).map(item=>bounded(item,itemMax)).filter(Boolean))].slice(0,max);
}
function optionalLimit(input,old,key,min,max){
  const value=Object.hasOwn(input,key)?input[key]:old[key];
  if(value===undefined||value===null||value==='')return null;
  if(typeof value!=='number'||!Number.isInteger(value)||value<min||value>max)throw new WorkspaceError(`${key} must be an integer between ${min} and ${max}, or blank to inherit.`);
  return value;
}
function optionalFlag(input,old,key){
  const value=Object.hasOwn(input,key)?input[key]:old[key];
  if(value===undefined||value===null)return null;
  if(typeof value!=='boolean')throw new WorkspaceError(`${key} must be true, false, or blank to inherit.`);
  return value;
}
function validViewport(value) { const width=Number(value?.width)||1280,height=Number(value?.height)||800; return {width:Math.max(320,Math.min(2560,width)),height:Math.max(320,Math.min(2000,height))}; }

export function normalizeUsage(usage) {
  if (!Array.isArray(usage) || !usage.length) return null;
  const seen=new Set(),result={input:0,output:0,total:0,cachedInput:0,reasoningOutput:0,partial:false,requests:0};
  const available={input:false,output:false,total:false,cachedInput:false,reasoningOutput:false};
  for (const item of usage) {
    if(!item || typeof item!=='object') {result.partial=true;continue;}
    const identity=item.requestId||item.request_id||item.response_id;
    if(identity && seen.has(identity))continue; if(identity)seen.add(identity);
    result.requests++;
    const fields={input:item.input_tokens,output:item.output_tokens,total:item.total_tokens,cachedInput:item.input_tokens_details?.cached_tokens,reasoningOutput:item.output_tokens_details?.reasoning_tokens};
    for(const [key,value] of Object.entries(fields)){if(numberOrNull(value)!==null){result[key]+=value;available[key]=true;}else if(['input','output','total'].includes(key))result.partial=true;}
  }
  for(const key of Object.keys(available))if(!available[key])result[key]=null;
  return result;
}

function eventMoment(run,eventIndex) {
  const note=(run.experience||[]).find(x=>x.eventIndex===eventIndex || x.actionEventIndex===eventIndex);
  const event=(run.events||[]).find(x=>x.index===eventIndex);
  return {originalMs:numberOrNull(event?.videoMs ?? note?.videoMs),eventIndex:eventIndex??null,screenUrl:event?.url||null};
}

export function normalizeFinding(input,run,index=0) {
  const source=input||{};
  const indices=Array.isArray(source.evidence_indices)?source.evidence_indices:[];
  const eventIndex=source.eventIndex ?? indices[0] ?? source.evidence?.[0]?.index ?? null;
  const moment=eventMoment(run,eventIndex);
  const note=(run.experience||[]).find(x=>x.eventIndex===eventIndex || x.actionEventIndex===eventIndex);
  const observation=bounded(source.observation||source.whatHappened||source.description,20000);
  return {
    ...source,
    id:source.id||`finding-${run.id}-${index}`,runId:run.id,projectId:run.projectId||DEFAULT_PROJECT,
    title:bounded(source.title,180)||observation.split(/\n/)[0].slice(0,140)||'Recorded conclusion',
    impact:IMPACTS.includes(source.impact)?source.impact:'untriaged',
    type:FINDING_TYPES.includes(source.type)?source.type:'unclassified',
    triage:TRIAGE_STATES.includes(source.triage)?source.triage:'unreviewed',
    observation,expected:source.expected||null,expectationSource:source.expectationSource||source.expectedSource||null,
    interpretation:source.interpretation||null,personaComment:source.personaComment||note?.reaction||null,
    uncertainty:source.uncertainty||null,outcome:source.outcome||run.finding?.outcome||null,
    evidence:Array.isArray(source.evidence)?source.evidence:[],evidence_indices:indices,
    ...moment,originalMs:numberOrNull(source.originalMs)??moment.originalMs,
    personaId:run.personaId||run.persona?.id,personaName:run.personaName||run.persona?.name||run.persona?.label||'Unknown persona',
    createdAt:source.createdAt||run.completedAt||run.createdAt||null,
    provenance:source.provenance||(Array.isArray(run.findings)?'model-observation':'legacy-conclusion'),
    claimStatus:source.claimStatus||(source.type==='business'&&/^Hypothesis:/i.test(source.title||'')?'hypothesis':undefined),
    confidence:source.confidence??null,issueId:source.issueId||null,fixId:source.fixId||null,
  };
}

export function createWorkspaceStore({root,runsDir,productDirectory,defaultTarget='http://127.0.0.1:4320/'}={}) {
  root=resolve(root||'workspace-data');mkdirSync(root,{recursive:true});
  const db=new DatabaseSync(join(root,'workspace.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS schema_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS entities(kind TEXT NOT NULL,id TEXT NOT NULL,project_id TEXT NOT NULL,current_version INTEGER NOT NULL,archived INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(kind,id));
    CREATE INDEX IF NOT EXISTS entities_scope ON entities(project_id,kind);
    CREATE TABLE IF NOT EXISTS entity_versions(kind TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,version_id TEXT NOT NULL UNIQUE,data TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(kind,id,version));
    CREATE TABLE IF NOT EXISTS environment_instances(environment_id TEXT PRIMARY KEY,parent_environment_id TEXT,parent_environment_version INTEGER,source TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS environment_checks(environment_id TEXT PRIMARY KEY,data TEXT NOT NULL,checked_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,data TEXT NOT NULL,source_hash TEXT,source_path TEXT);
    CREATE INDEX IF NOT EXISTS runs_scope ON runs(project_id,created_at);
    CREATE INDEX IF NOT EXISTS runs_persona_page ON runs(project_id,json_extract(data,'$.personaId'),created_at DESC,id);
    CREATE INDEX IF NOT EXISTS runs_environment_page ON runs(project_id,json_extract(data,'$.environmentId'),created_at DESC,id);
    CREATE TABLE IF NOT EXISTS run_overrides(run_id TEXT PRIMARY KEY,data TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS findings(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,project_id TEXT NOT NULL,data TEXT NOT NULL,overrides TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS findings_scope ON findings(project_id,run_id);
    CREATE TABLE IF NOT EXISTS finding_revisions(id TEXT PRIMARY KEY,finding_id TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS issues(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,kind TEXT NOT NULL,entity_id TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS launch_requests(idempotency_key TEXT PRIMARY KEY,digest TEXT NOT NULL,run_ids TEXT NOT NULL,batch_id TEXT,state TEXT NOT NULL,created_at TEXT NOT NULL);
    INSERT OR IGNORE INTO schema_meta(key,value) VALUES('version','1');`);
  db.prepare("UPDATE launch_requests SET state='interrupted' WHERE state='pending'").run();
  const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const out=fn();db.exec('COMMIT');return out;}catch(error){db.exec('ROLLBACK');throw error;}};
  const audit=(kind,id,data)=>db.prepare('INSERT INTO audit VALUES(?,?,?,?,?)').run(randomUUID(),kind,id,json(data),now());
  function requireProject(id){if(!db.prepare('SELECT id FROM projects WHERE id=?').get(id))throw new WorkspaceError('App not found.',404,'NOT_FOUND');return id;}
  function listProjects(){return db.prepare('SELECT data FROM projects ORDER BY created_at,id').all().map(r=>parse(r.data));}
  function saveProject(input={}) {
    const id=input.id||randomUUID(),existing=db.prepare('SELECT data FROM projects WHERE id=?').get(id);
    const old=parse(existing?.data)||{},name=bounded(input.name??old.name,100);
    if(!name)throw new WorkspaceError('App name is required.');
    const stamp=now(),data={...old,id,name,description:bounded(input.description??old.description,2000),createdAt:old.createdAt||stamp,updatedAt:stamp};
    db.prepare('INSERT INTO projects VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,data=excluded.data,updated_at=excluded.updated_at').run(id,name,json(data),data.createdAt,stamp);if(!existing)seedProfiles(id);return data;
  }
  function getEntity(kind,id,version) {
    const row=db.prepare('SELECT * FROM entities WHERE kind=? AND id=?').get(kind,id);if(!row)return null;
    const record=db.prepare('SELECT * FROM entity_versions WHERE kind=? AND id=? AND version=?').get(kind,id,version??row.current_version);if(!record)return null;
    const data={...parse(record.data),id,projectId:row.project_id,version:record.version,versionId:record.version_id,archived:Boolean(row.archived),createdAt:row.created_at,updatedAt:row.updated_at,versionCreatedAt:record.created_at};
    if(kind==='environment'){
      const recorded=parse(db.prepare('SELECT data FROM environment_checks WHERE environment_id=?').get(id)?.data);
      const instance=db.prepare('SELECT * FROM environment_instances WHERE environment_id=?').get(id);
      data.lifecycle=instance||data.lifecycle==='temporary'?'temporary':'configured';
      if(instance){data.configuredEnvironmentId=instance.parent_environment_id;data.configuredEnvironmentVersion=instance.parent_environment_version;data.instanceSource=parse(instance.source);}
      if(data.lifecycle==='temporary'){const parent=resolveConfiguredEnvironment(data.configuredEnvironmentId,data.configuredEnvironmentVersion||undefined);data.configuredEnvironment=parent?{id:parent.id,name:parent.name,version:parent.version,versionId:parent.versionId}:null;}
      data.lastCheck=recorded?{...recorded,recordedStatus:recorded.status,stale:recorded.environmentVersion!==record.version,...(recorded.environmentVersion!==record.version?{status:'stale'}:{})}:null;
    }
    if(kind==='device'||kind==='network-profile'){data.usage=profileUsage(kind,id);data.canDelete=data.usage.personas===0&&data.usage.runs===0&&data.usage.historicalReferences===0;}
    return data;
  }
  function listEntities(kind,projectId,includeArchived=false) {
    if(projectId)requireProject(projectId);
    return db.prepare(`SELECT id FROM entities WHERE kind=? ${projectId?'AND project_id=?':''} ${includeArchived?'':'AND archived=0'} ORDER BY created_at,id`).all(...[kind,...(projectId?[projectId]:[])]).map(row=>getEntity(kind,row.id)).filter(entity=>kind!=='environment'||entity.lifecycle!=='temporary');
  }
  function cleanEntity(kind,input,old={},projectId=old.projectId||DEFAULT_PROJECT) {
    if(!KINDS.has(kind))throw new WorkspaceError('Unsupported library type.');
    if(Object.keys(input).some(key=>/^(password|secret|token|apiKey|api_key|authorization|cookies|storageState)$/i.test(key)))throw new WorkspaceError('Use a secure credential reference instead of a secret value.');
    const name=bounded(input.name??input.label??old.name??old.label,100);if(!name)throw new WorkspaceError('Name is required.');
    const common={name,description:kind==='environment'?bounded(input.description??old.description,2000):libraryText(input,old,'description',2000)};
    if(kind==='device')return {...common,...cleanDeviceProfile(input,old,WorkspaceError)};
    if(kind==='network-profile')return {...common,...cleanNetworkProfile(input,old,WorkspaceError)};
    if(kind==='environment') {
      const lifecycle=input.lifecycle??old.lifecycle??'configured';
      if(!['configured','temporary'].includes(lifecycle))throw new WorkspaceError('Invalid environment lifecycle.');
      if(old.lifecycle==='temporary'&&lifecycle!=='temporary')throw new WorkspaceError('An execution instance cannot become a configured environment.');
      let instance={lifecycle};
      if(lifecycle==='temporary'){
        const parent=resolveConfiguredEnvironment(input.configuredEnvironmentId??old.configuredEnvironmentId,input.configuredEnvironmentVersion??old.configuredEnvironmentVersion);
        if(!parent||parent.projectId!==projectId||parent.archived)throw new WorkspaceError('Choose a configured environment in this app.',400,'INVALID_REFERENCE');
        const instanceKind=input.instanceKind??old.instanceKind??'test-preview';if(!['test-preview','change-preview','fix-preview'].includes(instanceKind))throw new WorkspaceError('Invalid execution instance kind.');
        instance={lifecycle,configuredEnvironmentId:parent.id,configuredEnvironmentVersion:parent.version,instanceKind};
      }
      const url=cleanUrl(input.url??old.url??''),origins=stringList(input.allowedOrigins??old.allowedOrigins).map(value=>new URL(cleanUrl(value)).origin);
      const maxSteps=Number(input.maxSteps??old.maxSteps??24);if(!Number.isInteger(maxSteps)||maxSteps<1||maxSteps>60)throw new WorkspaceError('Action limit must be between 1 and 60.');
      const maxDurationMs=Number(input.maxDurationMs??old.maxDurationMs??600000);if(!Number.isInteger(maxDurationMs)||maxDurationMs<30000||maxDurationMs>900000)throw new WorkspaceError('Duration limit must be between 30 seconds and 15 minutes.');
      const maxTokens=Number(input.maxTokens??old.maxTokens??250000);if(!Number.isInteger(maxTokens)||maxTokens<1000||maxTokens>2000000)throw new WorkspaceError('Token limit must be between 1,000 and 2,000,000.');
      const redactSelectors=stringList(input.redactSelectors??old.redactSelectors,20);if(redactSelectors.some(s=>s.length>200||/[{};@]/.test(s)))throw new WorkspaceError('Redaction selectors must be short CSS selectors without style declarations.');
      for(const flag of ['allowMutations','captureBodies'])if(input[flag]!==undefined&&typeof input[flag]!=='boolean')throw new WorkspaceError(`${flag} must be true or false.`);
      const authStatePath=bounded(input.storageStatePath??input.authStatePath??old.storageStatePath??old.authStatePath,2000);
      if(lifecycle==='temporary'){
        const parent=resolveConfiguredEnvironment(instance.configuredEnvironmentId,instance.configuredEnvironmentVersion),target=new URL(url);
        if(!['localhost','127.0.0.1','[::1]'].includes(target.hostname))throw new WorkspaceError('Preview instances must use a local target.');
        for(const [key,value] of Object.entries({maxSteps,maxDurationMs,maxTokens}))if(value>parent[key])throw new WorkspaceError(`The instance ${key} exceeds its configured environment limit.`,400,'INSTANCE_POLICY_EXCEEDS_ENVIRONMENT');
        for(const key of ['allowMutations','captureBodies'])if((input[key]??old[key]??false)===true&&parent[key]!==true)throw new WorkspaceError(`The instance cannot enable ${key}.`,400,'INSTANCE_POLICY_EXCEEDS_ENVIRONMENT');
        if(origins.some(origin=>origin!==target.origin&&!parent.allowedOrigins.includes(origin)))throw new WorkspaceError('The instance cannot expand allowed origins.',400,'INSTANCE_POLICY_EXCEEDS_ENVIRONMENT');
      }
      return {...common,...instance,url,allowedOrigins:[...new Set([new URL(url).origin,...origins])],repositoryPath:bounded(input.repositoryPath??old.repositoryPath,2000),baseRef:bounded(input.baseRef??old.baseRef,300),buildCommand:bounded(input.buildCommand??old.buildCommand,2000),startCommand:bounded(input.startCommand??old.startCommand,2000),testCommand:bounded(input.testCommand??old.testCommand,2000),healthPath:bounded(input.healthPath??old.healthPath,1000),authStatePath,storageStatePath:authStatePath,dataPolicy:bounded(input.dataPolicy??old.dataPolicy??'dedicated-test-data',2000),fixtureVersion:bounded(input.fixtureVersion??old.fixtureVersion,300),isolation:bounded(input.isolation??old.isolation??'independent-session',500),allowMutations:input.allowMutations??old.allowMutations??false,captureBodies:input.captureBodies??old.captureBodies??false,maxSteps,maxDurationMs,maxTokens,redactSelectors,retention:'keep-all',scenarioId:input.scenarioId??old.scenarioId??'web-app',viewport:validViewport(input.viewport??old.viewport)};
    }
    if(kind==='charter'){
      const data={...common,mission:libraryText(input,old,'mission',12000),scope:libraryText(input,old,'scope'),successCriteria:libraryText(input,old,'successCriteria'),stopCriteria:libraryText(input,old,'stopCriteria'),scenarioId:input.scenarioId??old.scenarioId??'web-app',
        startingState:libraryText(input,old,'startingState',6000),goals:libraryText(input,old,'goals'),expectedBehaviorSources:libraryText(input,old,'expectedBehaviorSources'),
        defaultEnvironmentId:input.defaultEnvironmentId===null||input.defaultEnvironmentId===''?null:input.defaultEnvironmentId??old.defaultEnvironmentId??null,
        compatibleEnvironmentIds:libraryList(input,old,'compatibleEnvironmentIds'),personaIds:libraryList(input,old,'personaIds'),screens:libraryList(input,old,'screens',60,500),flows:libraryList(input,old,'flows',40,500),
        allowedActions:libraryText(input,old,'allowedActions',5000)||'Use dedicated test data within the environment policy.',memoryPolicy:input.memoryPolicy??old.memoryPolicy??'none',memoryIds:libraryList(input,old,'memoryIds',30,200),
        maxSteps:optionalLimit(input,old,'maxSteps',1,60),maxTokens:optionalLimit(input,old,'maxTokens',1000,2000000),maxDurationMs:optionalLimit(input,old,'maxDurationMs',30000,900000),
        captureBodies:optionalFlag(input,old,'captureBodies'),allowMutations:optionalFlag(input,old,'allowMutations')};
      if(data.defaultEnvironmentId!==null&&typeof data.defaultEnvironmentId!=='string')throw new WorkspaceError('defaultEnvironmentId must be an environment ID or blank.');
      if(!['none','explicit','relevant'].includes(data.memoryPolicy))throw new WorkspaceError('Memory policy must be none, explicit, or relevant.');
      for(const memoryId of data.memoryIds){const entry=memory.get(memoryId);if(!entry||entry.projectId!==projectId)throw new WorkspaceError('Choose memory entries from this app.',400,'INVALID_REFERENCE');}
      const references=[...data.compatibleEnvironmentIds.map(id=>['environment',id]),...data.personaIds.map(id=>['persona',id]),...(data.defaultEnvironmentId?[['environment',data.defaultEnvironmentId]]:[])];
      for(const [referenceKind,referenceId] of references){const reference=typeof referenceId==='string'?getEntity(referenceKind,referenceId):null;if(!reference||reference.projectId!==projectId)throw new WorkspaceError(`Choose ${referenceKind} references from this app.`,400,'INVALID_REFERENCE');}
      if(data.defaultEnvironmentId&&data.compatibleEnvironmentIds.length&&!data.compatibleEnvironmentIds.includes(data.defaultEnvironmentId))throw new WorkspaceError('The default environment must be among compatible environments.',400,'INVALID_REFERENCE');
      return data;
    }
    const assigned=personaDevices(input,old,projectId);
    const initialKnowledge=libraryText(input,old,'initialKnowledge',6000,['knowledge']),continuity=input.continuity??old.continuity??'first-time';
    if(!['first-time','returning'].includes(continuity))throw new WorkspaceError('Continuity must be first-time or returning.');
    return {...common,label:name,role:libraryText(input,old,'role',100)||'client',context:libraryText(input,old,'context',16000),mission:libraryText(input,old,'mission',12000),
      initialKnowledge,knowledge:initialKnowledge,constraints:libraryText(input,old,'constraints',6000),skills:libraryText(input,old,'skills',6000),decision:libraryText(input,old,'decision',6000),resources:libraryText(input,old,'resources',6000),expectations:libraryText(input,old,'expectations',6000),priorities:libraryText(input,old,'priorities',6000),successCriteria:libraryText(input,old,'successCriteria'),stopCriteria:libraryText(input,old,'stopCriteria'),continuity,...assigned,viewport:structuredClone(getEntity('device',assigned.primaryDeviceId).viewport)};
  }
  const profileId=(projectId,kind,presetId)=>`${kind}-${stableId(`${projectId}:${presetId}`)}`;
  function seedProfiles(projectId){
    const key=`device-profiles-v1:${projectId}`;
    if(db.prepare('SELECT value FROM schema_meta WHERE key=?').get(key))return;
    for(const [kind,presets] of [['device',DEVICE_PRESETS],['network-profile',NETWORK_PRESETS]])for(const preset of presets){const id=profileId(projectId,kind,preset.presetId);if(!getEntity(kind,id))saveEntityData(kind,{...preset,id,projectId});}
    db.prepare('INSERT INTO schema_meta(key,value) VALUES(?,?)').run(key,now());
  }
  function legacyDevice(projectId,viewport){
    const profile=legacyDeviceProfile(validViewport(viewport)),id=profileId(projectId,'device',`legacy:${profile.viewport.width}:${profile.viewport.height}`);
    let saved=getEntity('device',id);if(!saved)saved=saveEntityData('device',{...profile,id,projectId});
    return saved;
  }
  function personaDevices(input,old,projectId){
    let deviceIds;
    if(Object.hasOwn(input,'deviceIds'))deviceIds=libraryList(input,old,'deviceIds',20,200);
    else if(old.deviceIds?.length&&!Object.hasOwn(input,'viewport'))deviceIds=[...old.deviceIds];
    else if(input.viewport||old.viewport)deviceIds=[legacyDevice(projectId,input.viewport??old.viewport).id];
    else {const device=listEntities('device',projectId).find(item=>item.presetId==='desktop-1280')||listEntities('device',projectId)[0]||legacyDevice(projectId,{width:1280,height:800});deviceIds=[device.id];}
    if(!deviceIds.length)throw new WorkspaceError('Choose at least one device for this persona.',400,'DEVICE_REQUIRED');
    const primaryDeviceId=Object.hasOwn(input,'primaryDeviceId')?input.primaryDeviceId:deviceIds.includes(old.primaryDeviceId)?old.primaryDeviceId:deviceIds[0];
    if(typeof primaryDeviceId!=='string'||!deviceIds.includes(primaryDeviceId))throw new WorkspaceError('The primary device must be one of this persona’s devices.',400,'INVALID_PRIMARY_DEVICE');
    for(const id of deviceIds){const device=getEntity('device',id);if(!device||device.projectId!==projectId||device.archived&&!(old.deviceIds||[]).includes(id))throw new WorkspaceError('Choose active devices from this app.',400,'INVALID_REFERENCE');}
    const networkProfileId=Object.hasOwn(input,'networkProfileId')?(input.networkProfileId||null):old.networkProfileId||listEntities('network-profile',projectId).find(item=>item.presetId==='unthrottled')?.id||null;
    if(networkProfileId!==null&&typeof networkProfileId!=='string')throw new WorkspaceError('Choose a valid network profile ID.',400,'INVALID_REFERENCE');
    if(networkProfileId){const network=getEntity('network-profile',networkProfileId);if(!network||network.projectId!==projectId||network.archived&&old.networkProfileId!==networkProfileId)throw new WorkspaceError('Choose an active network profile from this app.',400,'INVALID_REFERENCE');}
    return {deviceIds,primaryDeviceId,networkProfileId};
  }
  function profileUsage(kind,id){
    const predicate=kind==='device'?"EXISTS (SELECT 1 FROM json_each(v.data,'$.deviceIds') WHERE value=?)":"json_extract(v.data,'$.networkProfileId')=?";
    const personas=db.prepare(`SELECT COUNT(*) AS n FROM entities e JOIN entity_versions v ON v.kind=e.kind AND v.id=e.id AND v.version=e.current_version WHERE e.kind='persona' AND ${predicate}`).get(id).n;
    const historicalReferences=db.prepare(`SELECT COUNT(*) AS n FROM entity_versions v WHERE v.kind='persona' AND ${predicate}`).get(id).n;
    const key=kind==='device'?'device':'networkProfile';
    const runs=db.prepare(`SELECT COUNT(*) AS n FROM runs WHERE json_extract(data,'$.${key}Id')=? OR json_extract(data,'$.${key}Snapshot.id')=?`).get(id,id).n;
    return {personas,runs,historicalReferences};
  }
  function deleteEntity(kind,id,input={}){
    if(!['device','network-profile'].includes(kind))throw new WorkspaceError('Records are retained. Use Archive.',405,'KEEP_ALL');
    return transaction(()=>{const current=getEntity(kind,id);if(!current)throw new WorkspaceError('Record not found.',404,'NOT_FOUND');assertEntityVersion(current,input);
      if(input.expectedVersion===undefined)throw new WorkspaceError('The current version is required to delete this record.',400,'VERSION_REQUIRED');
      if(!current.canDelete)throw new WorkspaceError('This profile is referenced by personas or recorded history. Archive it instead.',409,'PROFILE_IN_USE');
      db.prepare('DELETE FROM entity_versions WHERE kind=? AND id=?').run(kind,id);db.prepare('DELETE FROM entities WHERE kind=? AND id=?').run(kind,id);audit('delete-unused-profile',id,{kind,name:current.name,version:current.version});return {id,deleted:true};
    });
  }
  function resolveBrowserConfiguration(persona,{deviceId,networkProfileId}={}){
    for(const value of [deviceId,networkProfileId])if(value!==undefined&&value!==null&&typeof value!=='string')throw new WorkspaceError('Choose valid device and network profile IDs.',400,'INVALID_REFERENCE');
    const selectedDeviceId=deviceId||persona.primaryDeviceId,device=selectedDeviceId?getEntity('device',selectedDeviceId):legacyDeviceProfile(validViewport(persona.viewport));
    if(!device||device.projectId&&device.projectId!==persona.projectId||device.archived)throw new WorkspaceError('The selected device is unavailable in this app. Choose an active device.',409,'DEVICE_UNAVAILABLE');
    const selectedNetworkId=networkProfileId||persona.networkProfileId,network=selectedNetworkId?getEntity('network-profile',selectedNetworkId):NETWORK_PRESETS[0];
    if(!network||network.projectId&&network.projectId!==persona.projectId||network.archived)throw new WorkspaceError('The selected network profile is unavailable in this app.',409,'NETWORK_PROFILE_UNAVAILABLE');
    const snapshot=value=>{const {usage,canDelete,...definition}=value;return structuredClone(definition);};
    return {deviceId:device.id||null,deviceName:device.name,deviceVersion:device.version||null,deviceVersionId:device.versionId||null,deviceSnapshot:snapshot(device),networkProfileId:network.id||null,networkProfileName:network.name,networkProfileVersion:network.version||null,networkProfileVersionId:network.versionId||null,networkProfileSnapshot:snapshot(network),viewport:structuredClone(device.viewport)};
  }
  function assertEntityVersion(entity,input={}){
    if(input.projectId&&entity&&input.projectId!==entity.projectId)throw new WorkspaceError('A library record cannot move to another app.',400,'PROJECT_MISMATCH');
    if(input.expectedVersion===undefined)return;
    if(!Number.isInteger(input.expectedVersion)||input.expectedVersion<0)throw new WorkspaceError('expectedVersion must be a nonnegative integer.',400,'INVALID_VERSION');
    if(input.expectedVersion!==(entity?.version||0))throw new WorkspaceError('This record changed. Reload its latest version before saving.',409,'VERSION_CONFLICT');
  }
  function saveEntityData(kind,input={},id=input.id) {
    if(!KINDS.has(kind))throw new WorkspaceError('Unsupported library type.');
      const old=id?getEntity(kind,id):null;if(id&&!old&&input.mustExist)throw new WorkspaceError('Record not found.',404,'NOT_FOUND');
      assertEntityVersion(old,input);id ||= randomUUID();const projectId=input.projectId||old?.projectId||DEFAULT_PROJECT;requireProject(projectId);
      const data=cleanEntity(kind,input,old||{},projectId),version=(old?.version||0)+1,versionId=randomUUID(),stamp=now();
      db.prepare('INSERT INTO entity_versions VALUES(?,?,?,?,?,?)').run(kind,id,version,versionId,json(data),stamp);
      db.prepare('INSERT INTO entities VALUES(?,?,?,?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET current_version=excluded.current_version,updated_at=excluded.updated_at').run(kind,id,projectId,version,old?.archived?1:0,old?.createdAt||stamp,stamp);
      if(kind==='environment'&&data.lifecycle==='temporary')registerEnvironmentInstance(id,{parentEnvironmentId:data.configuredEnvironmentId,parentEnvironmentVersion:data.configuredEnvironmentVersion,source:{kind:data.instanceKind,configuredVersion:version}});
      audit('version',id,{kind,version,versionId});
      return getEntity(kind,id);
  }
  function saveEntity(kind,input={},id=input.id){return transaction(()=>saveEntityData(kind,input,id));}
  function adoptCalibrationPersona({projectId,personaId,expectedVersion,changes,idempotencyKey,studyId,candidateId,resultId}={}){
    const allowed=new Set(['context','skills','constraints','expectations','priorities','decision']);
    if(!changes||typeof changes!=='object'||Array.isArray(changes)||!Object.keys(changes).length||Object.entries(changes).some(([key,value])=>!allowed.has(key)||typeof value!=='string'))throw new WorkspaceError('Invalid calibration persona adjustment.',400,'INVALID_ADJUSTMENT');
    if(!Number.isSafeInteger(expectedVersion)||expectedVersion<1||[projectId,personaId,idempotencyKey,studyId,candidateId,resultId].some(value=>typeof value!=='string'||!value||value.length>300))throw new WorkspaceError('Exact study, candidate, result and persona version are required.',400,'INVALID_ADOPTION');
    const signature=stableId(json({projectId,personaId,expectedVersion,changes,studyId,candidateId,resultId}));
    return transaction(()=>{
      const recorded=parse(db.prepare("SELECT data FROM audit WHERE kind='calibration-adoption' AND entity_id=?").get(idempotencyKey)?.data);
      if(recorded){if(recorded.signature!==signature)throw new WorkspaceError('This adoption key belongs to another adjustment.',409,'IDEMPOTENCY_CONFLICT');return recorded.receipt;}
      const previous=getEntity('persona',personaId);
      if(!previous||previous.projectId!==projectId||previous.archived)throw new WorkspaceError('The intended persona is unavailable.',409,'PERSONA_UNAVAILABLE');
      const saved=saveEntityData('persona',{...changes,projectId,expectedVersion},personaId);
      const receipt={entityId:saved.id,version:saved.version,versionId:saved.versionId};
      audit('calibration-adoption',idempotencyKey,{signature,studyId,candidateId,resultId,previousVersion:previous.version,receipt});
      return receipt;
    });
  }
  function versions(kind,id){if(!getEntity(kind,id))throw new WorkspaceError('Record not found.',404,'NOT_FOUND');return db.prepare('SELECT version FROM entity_versions WHERE kind=? AND id=? ORDER BY version DESC').all(kind,id).map(v=>getEntity(kind,id,v.version));}
  function lifecycleSource(kind,id,input={}){
    if(!KINDS.has(kind))throw new WorkspaceError('Unsupported library type.');
    const current=getEntity(kind,id);if(!current)throw new WorkspaceError('Record not found.',404,'NOT_FOUND');assertEntityVersion(current,input);
    const version=input.version??current.version;
    if(!Number.isInteger(version)||version<1)throw new WorkspaceError('version must be a positive integer.',400,'INVALID_VERSION');
    const source=getEntity(kind,id,version);if(!source)throw new WorkspaceError('Version not found.',404,'VERSION_NOT_FOUND');
    return {current,source};
  }
  function duplicateEntity(kind,id,input={}){
    return transaction(()=>{const {current,source}=lifecycleSource(kind,id,input);
      const copy=saveEntityData(kind,{...source,id:undefined,expectedVersion:undefined,name:input.name||`${source.name} copy`,projectId:current.projectId});
      audit('duplicate',copy.id,{kind,sourceId:id,sourceVersion:source.version,sourceVersionId:source.versionId});
      return copy;
    });
  }
  function restoreEntity(kind,id,input={}){
    if(input.version===undefined)throw new WorkspaceError('Choose a version to restore.',400,'INVALID_VERSION');
    return transaction(()=>{const {current,source}=lifecycleSource(kind,id,input);
      const restored=saveEntityData(kind,{...source,projectId:current.projectId,expectedVersion:input.expectedVersion??current.version,mustExist:true},id);
      audit('restore-version',id,{kind,sourceVersion:source.version,sourceVersionId:source.versionId,version:restored.version,versionId:restored.versionId});
      return restored;
    });
  }
  function archiveEntity(kind,id,archived=true,input={}){
    if(typeof archived!=='boolean')throw new WorkspaceError('archived must be true or false.');
    return transaction(()=>{const current=getEntity(kind,id);if(!current)throw new WorkspaceError('Record not found.',404,'NOT_FOUND');assertEntityVersion(current,input);db.prepare('UPDATE entities SET archived=?,updated_at=? WHERE kind=? AND id=?').run(archived?1:0,now(),kind,id);audit('archive',id,{kind,archived,version:current.version});return getEntity(kind,id);});
  }
  function recordEnvironmentCheck(id,result){if(!getEntity('environment',id))throw new WorkspaceError('Environment not found.',404,'NOT_FOUND');const data={...result,checkedAt:now()};db.prepare('INSERT INTO environment_checks VALUES(?,?,?) ON CONFLICT(environment_id) DO UPDATE SET data=excluded.data,checked_at=excluded.checked_at').run(id,json(data),data.checkedAt);audit('environment-check',id,data);return data;}
  function seed() {
    if(!listProjects().length)saveProject({id:DEFAULT_PROJECT,name:'LittleSteps',description:'Learning activities for children, at home and in class.'});
    if(!db.prepare('SELECT id FROM projects WHERE id=?').get(DEFAULT_PROJECT))return;
    if(!getEntity('environment','little-steps-local'))saveEntity('environment',{id:'little-steps-local',projectId:DEFAULT_PROJECT,name:'Local demo',url:defaultTarget,repositoryPath:productDirectory||resolve(root,'../../little-steps'),scenarioId:PRINT_SCENARIO,dataPolicy:'Synthetic demo data only; no real registration, printing or payments.',isolation:'stateless-demo',allowMutations:true});
    for(const persona of listPersonas())if(!getEntity('persona',persona.id))saveEntity('persona',{...persona,id:persona.id,projectId:DEFAULT_PROJECT,name:persona.id==='teacher'?'The prepared teacher':'The phone-only parent',role:'client',continuity:'first-time'});
    if(!getEntity('charter','first-value'))saveEntity('charter',{id:'first-value',projectId:DEFAULT_PROJECT,name:'First useful moment',mission:'Explore the product from the selected persona’s perspective and pursue their stated activity goal. Stop when the goal is visibly reached, an obstacle is supported by evidence, or exploration is inconclusive.',scope:'Commercial website through the first concrete activity step or preparation outcome.',successCriteria:'Observe the persona’s concrete outcome on screen; report partial progress precisely.',stopCriteria:'Stop after a supported obstacle, a visible goal outcome, an unsafe action, or the action budget.',scenarioId:PRINT_SCENARIO,defaultEnvironmentId:'little-steps-local',personaIds:['teacher','mother']});
  }
  const memory=createWorkspaceMemory({db,getRun,getEntity,resolveConfiguredEnvironment,requireProject,transaction,audit,ErrorClass:WorkspaceError});
  seed();
  const defaultProjectNames=new Map([
    ['gather',{name:'Gather',previousNames:['Booking Office']}],
    [DEFAULT_PROJECT,{name:'LittleSteps',previousNames:['Kids Activities']}],
    ['fieldnote-acceptance-2026-11-01',{name:'Fieldnote',previousNames:['Project Notes','Fieldnote · acceptance']}]
  ]);
  for(const project of listProjects()){
    const names=defaultProjectNames.get(project.id);
    if(names?.previousNames.includes(project.name))saveProject({id:project.id,name:names.name});
  }
  for(const project of listProjects()){seedProfiles(project.id);for(const persona of listEntities('persona',project.id,true))if(!persona.deviceIds?.length)saveEntity('persona',{deviceIds:[legacyDevice(project.id,persona.viewport).id],primaryDeviceId:legacyDevice(project.id,persona.viewport).id},persona.id);}
  refreshEnvironmentOrigins();
  // A process restart never resumes an in-flight browser against changed state.
  // This also covers a queued experiment persisted before its run.json existed.
  transaction(()=>{
    for(const row of db.prepare("SELECT id,data FROM runs WHERE status IN ('queued','running','finalizing','cancelling')").all()){
      const previous=parse(row.data),stamp=now(),run={...previous,status:'interrupted',updatedAt:stamp,error:'The service stopped before this journey completed. Recorded experience is retained; retry starts a new journey.'};
      db.prepare("UPDATE runs SET status='interrupted',updated_at=?,data=? WHERE id=?").run(stamp,json(run),row.id);
      audit('run-interrupted',row.id,{previousStatus:previous.status});
    }
  });

  function registerEnvironmentInstance(id,{parentEnvironmentId=null,parentEnvironmentVersion=null,source={}}={}) {
    const env=getEntity('environment',id);if(!env)throw new WorkspaceError('Environment not found.',404,'NOT_FOUND');
    if(parentEnvironmentId===id||parentEnvironmentId&&resolveConfiguredEnvironment(parentEnvironmentId)?.id===id)throw new WorkspaceError('An instance cannot be its own environment.');
    const parent=parentEnvironmentId?getEntity('environment',parentEnvironmentId,parentEnvironmentVersion||undefined):null;
    if(parentEnvironmentId&&(!parent||parent.projectId!==env.projectId))throw new WorkspaceError('Instance environment belongs to another app.',400,'INVALID_REFERENCE');
    const existing=db.prepare('SELECT * FROM environment_instances WHERE environment_id=?').get(id);
    if(existing)return getEntity('environment',id);
    db.prepare('INSERT INTO environment_instances VALUES(?,?,?,?,?)').run(id,parentEnvironmentId,parentEnvironmentVersion||null,json(source),now());
    audit('environment-instance',id,{parentEnvironmentId,parentEnvironmentVersion,source});return getEntity('environment',id);
  }
  function resolveConfiguredEnvironment(id,version,seen=new Set()) {
    if(!id||seen.has(id))return null;seen.add(id);
    const env=getEntity('environment',id,version);if(!env)return null;
    if(env.lifecycle!=='temporary')return env;
    return resolveConfiguredEnvironment(env.configuredEnvironmentId,env.configuredEnvironmentVersion||undefined,seen);
  }
  function refreshEnvironmentOrigins(){
    const environments=db.prepare("SELECT id FROM entities WHERE kind='environment'").all().map(row=>getEntity('environment',row.id));
    for(const entry of historicalEnvironmentInstances({root,environments,defaultProject:DEFAULT_PROJECT}))registerEnvironmentInstance(entry.id,entry);
    return db.prepare('SELECT COUNT(*) AS count FROM environment_instances').get().count;
  }
  function configuredRunEnvironment(run){
    const env=resolveConfiguredEnvironment(run.environmentId,run.environmentVersion||undefined);
    const raw=getEntity('environment',run.environmentId),temporary=raw?.lifecycle==='temporary'||!!run.executionInstance;
    const configuredEnvironment=env?{id:env.id,name:env.name,version:env.version,versionId:env.versionId}:null;
    const executionInstance=run.executionInstance||(temporary?{id:run.environmentId,kind:raw.instanceSource?.kind||raw.instanceKind||'recorded-target',environmentId:env?.id||null,url:run.target,source:raw.instanceSource||null}:null);
    return {...run,configuredEnvironment,environmentKind:temporary?'temporary':env?'configured':'unknown',...(executionInstance?{executionInstance}:{})};
  }
  function legacyEnvironment(run) {
    if(run.environmentId)return run.environmentId;
    const explicit=run.executionInstance?.environmentId||run.environmentSnapshot?.configuredEnvironmentId||run.environmentSnapshot?.id;
    if(explicit&&getEntity('environment',explicit)?.projectId===run.projectId)return explicit;
    const matches=listEntities('environment',run.projectId,true).filter(env=>env.url===run.target);
    if(matches.length===1)return matches[0].id;
    if(run.projectId===DEFAULT_PROJECT&&(!run.target||run.target===defaultTarget))return 'little-steps-local';
    return null;
  }
  function syncRun(input,{sourceHash=null,sourcePath=null,imported=false}={}) {
    if(!input?.id||typeof input.id!=='string')throw new WorkspaceError('Run ID is required.');
    const existing=parse(db.prepare('SELECT data FROM runs WHERE id=?').get(input.id)?.data)||{};
    const run={...existing,...input};run.projectId ||= DEFAULT_PROJECT;requireProject(run.projectId);
    run.environmentId ||= legacyEnvironment(run);const env=getEntity('environment',run.environmentId,run.environmentVersion);
    run.environmentVersion ??= env?.version??null;run.environmentName ||= env?.name||'Not recorded';
    if(!env&&run.target&&!run.executionInstance)run.executionInstance={kind:'recorded-target',environmentId:null,url:run.target};
    run.personaId ||= run.persona?.id||'unknown';run.personaName ||= run.persona?.name||run.persona?.label||getEntity('persona',run.personaId)?.name||'Unknown persona';
    run.charterId ||= null;run.charterName ||= run.charterSnapshot?.name||'Legacy recorded mission';
    run.name ||= `${run.personaName} · ${run.variant||'exploration'}`;
    run.createdAt ||= now();run.updatedAt=now();if(imported&&activeStatuses.has(run.status)){run.status='interrupted';run.error ||= 'The service stopped before this run completed. Captured experience is preserved.';}
    const sourceFindings=Array.isArray(run.findings)?run.findings:run.finding?[run.finding]:[];
    transaction(()=>{
      db.prepare('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,status=excluded.status,updated_at=excluded.updated_at,data=excluded.data,source_hash=COALESCE(excluded.source_hash,runs.source_hash),source_path=COALESCE(excluded.source_path,runs.source_path)').run(run.id,run.projectId,run.status||'unknown',run.createdAt,run.updatedAt,json(run),sourceHash,sourcePath);
      sourceFindings.forEach((finding,i)=>{const normalized=normalizeFinding(finding,run,i);db.prepare('INSERT INTO findings(id,run_id,project_id,data,overrides,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(normalized.id,run.id,run.projectId,json(normalized),'{}',normalized.createdAt||now());});
    });
    if(!imported&&Object.hasOwn(input,'memoryLearnings'))memory.publishRun(run.id);
    return getRun(run.id);
  }
  function getFinding(id){const row=db.prepare('SELECT data,overrides FROM findings WHERE id=?').get(id);return row?{...parse(row.data),...parse(row.overrides)}:null;}
  function addBusinessHypothesis(sourceFindingId,input={}) {
    const source=getFinding(sourceFindingId);if(!source)throw new WorkspaceError('Supporting finding not found.',404,'NOT_FOUND');
    if(input.projectId&&input.projectId!==source.projectId)throw new WorkspaceError('The supporting finding belongs to another app.',400,'PROJECT_MISMATCH');
    const run=getRun(source.runId);
    if(!run||!['finished','completed'].includes(run.status)||run.integrityStatus==='invalidated')throw new WorkspaceError('Use a completed journey with intact recorded evidence.',409);
    if(source.claimStatus==='hypothesis'||source.type==='business'||['dismissed','duplicate'].includes(source.triage))throw new WorkspaceError('Link an observed finding rather than another hypothesis or an excluded finding.');
    const title=bounded(input.title,180),interpretation=bounded(input.interpretation,8000),uncertainty=bounded(input.uncertainty,8000),validationPlan=bounded(input.validationPlan,8000),reason=bounded(input.reason,4000);
    if(!title||!interpretation||!uncertainty||!validationPlan||!reason)throw new WorkspaceError('Provide the hypothesis, interpretation, uncertainty, validation plan and review reason.');
    const author=input.author??'local-user';if(!['assistant','local-user'].includes(author))throw new WorkspaceError('Choose a valid review author.');
    const sourceIndices=new Set([...(source.evidence_indices||[]),...(source.evidence||[]).map(item=>item.index)]);
    const indices=input.evidence_indices??[...sourceIndices];
    if(!Array.isArray(indices)||!indices.length||indices.length>12||indices.some(index=>!Number.isSafeInteger(index)||!sourceIndices.has(index)))throw new WorkspaceError('Choose 1–12 screenshot references from the supporting finding.');
    const ordered=[...new Set(indices)].sort((a,b)=>a-b),events=run.events||[];
    const evidence=ordered.map(index=>{
      const event=events.find(item=>item.index===index&&item.type==='screenshot'),prefix=`/runs/${run.id}/`;
      if(!event?.screenshot?.startsWith(prefix)||!/^[-\w]+\.(png|jpe?g|webp)$/i.test(event.screenshot.slice(prefix.length)))throw new WorkspaceError('Every reference must point to a screenshot retained by this journey.');
      return {index,screenshot:event.screenshot};
    });
    const heading=(/^Hypothesis:/i.test(title)?title:`Hypothesis: ${title}`).slice(0,180);
    const id=`finding-hypothesis-${stableId(json({sourceFindingId,title:heading,interpretation,uncertainty,validationPlan,evidence_indices:ordered}))}`;
    const existing=getFinding(id);if(existing)return existing;
    const stamp=now(),finding={...normalizeFinding({id,title:heading,type:'business',claimStatus:'hypothesis',impact:'untriaged',triage:'unreviewed',observation:source.observation,interpretation,uncertainty,validationPlan,expected:source.expected,expectationSource:source.expectationSource,evidence_indices:ordered,evidence,eventIndex:ordered.at(-1),sourceFindingId,provenance:'review-hypothesis',createdBy:author,createdAt:stamp},run),personaComment:null};
    const revision={id:randomUUID(),findingId:id,author,at:stamp,reason,before:null,changes:finding};
    transaction(()=>{
      db.prepare('INSERT INTO findings(id,run_id,project_id,data,overrides,created_at) VALUES(?,?,?,?,?,?)').run(id,run.id,run.projectId,json(finding),'{}',stamp);
      db.prepare('INSERT INTO finding_revisions VALUES(?,?,?,?)').run(revision.id,id,json(revision),stamp);
      audit('finding_hypothesis',id,{sourceFindingId,author,reason});
    });
    return getFinding(id);
  }
  function listFindings({projectId,runId,includeExcluded=true,includeSourceRun=false}={}){
    const clauses=[],args=[];if(projectId){clauses.push('f.project_id=?');args.push(projectId);}if(runId){clauses.push('f.run_id=?');args.push(runId);}
    // Findings include the whole history while the journey collection is paged.
    // Project display context directly; never load events, recordings or full persona snapshots.
    const keys=['id','projectId','personaName','personaVersion','environmentId','environmentName','environmentVersion','deviceId','deviceName','deviceVersion','deviceSnapshot','browserExecution','networkProfileId','networkProfileName','networkProfileVersion','networkProfileSnapshot'];
    const context=includeSourceRun?`,CASE WHEN r.id IS NOT NULL THEN json_object(${keys.map(key=>`'${key}',json_extract(r.data,'$.${key}')`).join(',')},
      'name',COALESCE(json_extract(o.data,'$.name'),json_extract(r.data,'$.name')),
      'recordedActionTypes',json(${recordedActionTypesSql}),
      'personaId',COALESCE(json_extract(r.data,'$.personaId'),json_extract(r.data,'$.personaSnapshot.id'),json_extract(r.data,'$.persona.id')),
      'snapshotName',COALESCE(json_extract(r.data,'$.personaSnapshot.name'),json_extract(r.data,'$.personaSnapshot.label')),
      'legacyName',COALESCE(json_extract(r.data,'$.persona.name'),json_extract(r.data,'$.persona.label')),
      'viewport',COALESCE(json_extract(r.data,'$.viewport'),json_extract(r.data,'$.personaSnapshot.viewport'),json_extract(r.data,'$.persona.viewport'))) END AS source_run`:'';
    const joins=includeSourceRun?'LEFT JOIN runs r ON r.id=f.run_id AND r.project_id=f.project_id LEFT JOIN run_overrides o ON o.run_id=r.id':'';
    return db.prepare(`SELECT f.id${context} FROM findings f ${joins} ${clauses.length?'WHERE '+clauses.join(' AND '):''} ORDER BY f.created_at DESC,f.id`).all(...args).map(row=>{
      const finding=getFinding(row.id);if(!includeSourceRun)return finding;
      const source=parse(row.source_run);if(!source)return {...finding,sourceRun:null};
      const {snapshotName,legacyName,...sourceRun}=source;
      const displayName=(...values)=>values.map(value=>bounded(value,500)).find(value=>value&&value!==sourceRun.personaId&&!['Unknown persona','Persona'].includes(value));
      sourceRun.personaName=displayName(snapshotName,legacyName,sourceRun.personaName,finding.personaName);
      if(!sourceRun.personaName){
        const persona=getEntity('persona',sourceRun.personaId,sourceRun.personaVersion||undefined)||getEntity('persona',sourceRun.personaId);
        sourceRun.personaName=persona?.projectId===finding.projectId?displayName(persona.name,persona.label):null;
      }
      sourceRun.personaName ||= 'Unknown persona';
      return {...finding,sourceRun:configuredRunEnvironment(sourceRun)};
    }).filter(f=>includeExcluded||!['dismissed','duplicate'].includes(f.triage));
  }
  function rawIssue(id){return parse(db.prepare('SELECT data FROM issues WHERE id=?').get(id)?.data);}
  function writeIssue(data,reason){const stamp=now(),{findings,seen,occurrences,lastSeen,...record}=data;record.updatedAt=stamp;db.prepare('INSERT INTO issues VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').run(record.id,record.projectId,json(record),record.createdAt||stamp,stamp);audit('issue',record.id,{...record,reason});}
  function writeFindingRevision(id,fields,reason) {
    const existing=getFinding(id),revision={id:randomUUID(),findingId:id,author:'local-user',at:now(),reason:bounded(reason,4000)||'Local review',before:existing,changes:fields};
    const overrides={...parse(db.prepare('SELECT overrides FROM findings WHERE id=?').get(id).overrides),...fields,reviewedAt:revision.at};
    db.prepare('UPDATE findings SET overrides=? WHERE id=?').run(json(overrides),id);db.prepare('INSERT INTO finding_revisions VALUES(?,?,?,?)').run(revision.id,id,json(revision),revision.at);
  }
  // Called only inside the caller's transaction: one finding owns one issue.
  function reconcileFindingOwner(id,targetIssueId,reason) {
    const finding=getFinding(id);
    for(const row of db.prepare('SELECT data FROM issues WHERE project_id=?').all(finding.projectId)){
      const issue=parse(row.data),has=(issue.findingIds||[]).includes(id),should=issue.id===targetIssueId;
      if(has===should)continue;
      issue.findingIds=should?[...issue.findingIds,id]:issue.findingIds.filter(fid=>fid!==id);
      if(should&&issue.status==='resolved')issue.status='reopened';
      writeIssue(issue,reason);
    }
  }
  function updateFinding(id,input={}) {
    const existing=getFinding(id);if(!existing)throw new WorkspaceError('Finding not found.',404,'NOT_FOUND');
    if(existing.claimStatus==='hypothesis'&&input.type!==undefined&&input.type!=='business')throw new WorkspaceError('A business hypothesis must remain distinct from an observed defect.');
    const fields={};for(const key of ['impact','type','triage'])if(input[key]!==undefined){const allowed={impact:IMPACTS,type:FINDING_TYPES,triage:TRIAGE_STATES}[key];if(!allowed.includes(input[key]))throw new WorkspaceError(`Invalid ${key}.`);fields[key]=input[key];}
    for(const key of ['title','expected','expectationSource','issueId','fixId'])if(input[key]!==undefined)fields[key]=input[key]===null?null:bounded(input[key],key==='title'?180:8000);
    if(fields.type&&fields.type!=='broken'&&existing.issueId)fields.issueId=null;
    if(fields.issueId){const issue=rawIssue(fields.issueId);if(!issue||issue.projectId!==existing.projectId||issue.mergedInto)throw new WorkspaceError('Choose an existing issue in this app.');if((fields.type||existing.type)!=='broken')throw new WorkspaceError('Only Broken findings can belong to an Issue.');}
    transaction(()=>{writeFindingRevision(id,fields,input.reason);if(Object.hasOwn(fields,'issueId'))reconcileFindingOwner(id,fields.issueId,input.reason||'Occurrence reassigned during finding review.');});return getFinding(id);
  }
  function findingRevisions(id){return db.prepare('SELECT data FROM finding_revisions WHERE finding_id=? ORDER BY created_at DESC').all(id).map(r=>parse(r.data));}
  function getRun(id,{summary=false}={}) {
    if(summary)return runSummaries('r.id=?',[id])[0]||null;
    const row=db.prepare('SELECT data FROM runs WHERE id=?').get(id);if(!row)return null;
    const run={...parse(row.data),...parse(db.prepare('SELECT data FROM run_overrides WHERE run_id=?').get(id)?.data)},findings=listFindings({runId:id}),tokens=normalizeUsage(run.usage),counts=Object.fromEntries(IMPACTS.map(i=>[i,0]));
    for(const f of findings)if(!['dismissed','duplicate'].includes(f.triage))counts[f.impact]++;
    const ended=run.completedAt?Date.parse(run.completedAt):null,started=run.startedAt?Date.parse(run.startedAt):null;
    const durationMs=Number.isFinite(ended)&&Number.isFinite(started)?Math.max(0,ended-started):null;
    const result={...run,outcome:run.finding?.outcome||run.outcome||null,tokens,totalTokens:tokens?.total??null,impactCounts:counts,findingsCount:findings.filter(f=>!['dismissed','duplicate'].includes(f.triage)).length,durationMs,thumbnail:run.events?.find(e=>e.screenshot)?.screenshot||null,eventCount:run.events?.length||0,findings};
    return configuredRunEnvironment(result);
  }
  const runSummaryKeys=['id','projectId','status','createdAt','updatedAt','startedAt','completedAt','name','personaId','personaName','personaVersion','personaVersionId','charterId','charterName','charterVersion','charterVersionId','environmentId','environmentName','environmentVersion','environmentVersionId','batchId','retryOfRunId','comparisonId','variant','target','model','video','replay','error','integrityStatus','navigationBudgetExhausted','experimental','experimentalStudyId','calibrationTrialId','executionInstance','viewport','deviceId','deviceName','deviceVersion','deviceVersionId','deviceSnapshot','browserExecution','networkProfileId','networkProfileName','networkProfileVersion','networkProfileVersionId','networkProfileSnapshot'];
  function runSummaries(where,args,{limit=1,offset=0}={}){
    // SQL projects metadata only; video maps, events, payloads, fingerprints and
    // large persona/context snapshots never cross the list boundary into JS.
    // Small frozen device/network definitions are included for history tooltips.
    const projection=runSummaryKeys.map(key=>key==='viewport'?`'viewport',COALESCE(json_extract(r.data,'$.viewport'),json_extract(r.data,'$.personaSnapshot.viewport'),json_extract(r.data,'$.persona.viewport'))`:`'${key}',json_extract(r.data,'$.${key}')`).join(',');
    const rows=db.prepare(`SELECT json_object(${projection}) AS metadata,
      ${recordedActionTypesSql} AS recorded_action_types,
      json_extract(r.data,'$.usage') AS usage,json_extract(o.data,'$.name') AS renamed,
      COALESCE(json_extract(r.data,'$.finding.outcome'),json_extract(r.data,'$.outcome')) AS outcome,
      COALESCE(json_array_length(r.data,'$.events'),0) AS event_count,
      (SELECT json_extract(e.value,'$.screenshot') FROM json_each(r.data,'$.events') e WHERE json_extract(e.value,'$.screenshot') IS NOT NULL LIMIT 1) AS thumbnail
      FROM runs r LEFT JOIN run_overrides o ON o.run_id=r.id ${where?'WHERE '+where:''}
      ORDER BY r.created_at DESC,r.id LIMIT ? OFFSET ?`).all(...args,limit,offset);
    return rows.map(row=>{
      const run={...parse(row.metadata),recordedActionTypes:parse(row.recorded_action_types)},tokens=normalizeUsage(parse(row.usage)||[]),counts=Object.fromEntries(IMPACTS.map(impact=>[impact,0]));
      for(const item of db.prepare(`SELECT COALESCE(json_extract(overrides,'$.impact'),json_extract(data,'$.impact'),'untriaged') AS impact,COUNT(*) AS n FROM findings WHERE run_id=? AND COALESCE(json_extract(overrides,'$.triage'),json_extract(data,'$.triage'),'') NOT IN ('dismissed','duplicate') GROUP BY impact`).all(run.id))if(Object.hasOwn(counts,item.impact))counts[item.impact]=item.n;
      const started=Date.parse(run.startedAt),ended=Date.parse(run.completedAt);
      return configuredRunEnvironment({...run,...(row.renamed?{name:row.renamed}:{}),outcome:row.outcome,tokens,totalTokens:tokens?.total??null,impactCounts:counts,findingsCount:Object.values(counts).reduce((a,b)=>a+b,0),durationMs:Number.isFinite(started)&&Number.isFinite(ended)?Math.max(0,ended-started):null,eventCount:row.event_count,thumbnail:row.thumbnail});
    });
  }
  function listRunsPage({projectId,status,personaId,environmentId,query,limit=500,offset=0,cursor}={}) {
    limit=Math.max(1,Math.min(Number.isSafeInteger(Number(limit))?Number(limit):500,1000));offset=Math.max(0,Number.isSafeInteger(Number(offset))?Number(offset):0);
    const clauses=[],args=[];
    if(projectId){clauses.push('r.project_id=?');args.push(projectId);}if(status){clauses.push('r.status=?');args.push(status);}
    if(personaId){clauses.push("json_extract(r.data,'$.personaId')=?");args.push(personaId);}
    if(environmentId){const canonical=resolveConfiguredEnvironment(environmentId)?.id||environmentId,ids=[canonical,...db.prepare('SELECT environment_id FROM environment_instances').all().map(row=>row.environment_id).filter(id=>resolveConfiguredEnvironment(id)?.id===canonical)];clauses.push(`json_extract(r.data,'$.environmentId') IN (${ids.map(()=>'?').join(',')})`);args.push(...ids);}
    if(query){clauses.push("instr(lower(COALESCE(json_extract(o.data,'$.name'),json_extract(r.data,'$.name'),'')||' '||COALESCE(json_extract(r.data,'$.personaName'),'')||' '||COALESCE(json_extract(r.data,'$.environmentName'),'')),?)>0");args.push(String(query).toLowerCase().slice(0,500));}
    const total=db.prepare(`SELECT COUNT(*) AS n FROM runs r LEFT JOIN run_overrides o ON o.run_id=r.id ${clauses.length?'WHERE '+clauses.join(' AND '):''}`).get(...args).n;
    if(cursor){let value;try{if(typeof cursor!=='string'||cursor.length>1000)throw Error();value=JSON.parse(Buffer.from(cursor,'base64url').toString());if(typeof value.createdAt!=='string'||typeof value.id!=='string'||value.id.length>160||!Number.isFinite(Date.parse(value.createdAt)))throw Error();}catch{throw new WorkspaceError('Invalid journey page cursor.',400,'INVALID_CURSOR');}
      clauses.push('(r.created_at<? OR (r.created_at=? AND r.id>?))');args.push(value.createdAt,value.createdAt,value.id);offset=0;
    }
    const found=runSummaries(clauses.join(' AND '),args,{limit:limit+1,offset}),hasMore=found.length>limit,runs=found.slice(0,limit),last=runs.at(-1);
    return {runs,page:{total,limit,nextCursor:hasMore&&last?Buffer.from(JSON.stringify({createdAt:last.createdAt,id:last.id})).toString('base64url'):null}};
  }
  function listRuns(options={}) {
    return listRunsPage(options).runs;
  }
  function renameRun(id,name){const run=getRun(id);if(!run)throw new WorkspaceError('Run not found.',404,'NOT_FOUND');name=bounded(name,160);if(!name)throw new WorkspaceError('Name is required.');transaction(()=>{audit('run-name',id,{previous:run.name,name});db.prepare('INSERT INTO run_overrides VALUES(?,?,?) ON CONFLICT(run_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').run(id,json({name}),now());});return getRun(id);}
  function validateResolution(value,projectId) {
    const fail=message=>{throw new WorkspaceError(`${message} Keep the issue Awaiting verification until its evidence is available.`,409,'RESOLUTION_EVIDENCE_REQUIRED');};
    if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.runId!=='string'||!bounded(value.reason,4000))fail('Resolution needs a completed Run, screenshot indices and a reviewer reason.');
    const run=getRun(value.runId);
    if(!run||run.projectId!==projectId||!['finished','completed'].includes(run.status)||!run.completedAt||run.outcome!=='goal_reached'||run.integrityStatus==='invalidated')fail('Choose a completed goal-reaching Run from this app.');
    const fingerprint=run.productFingerprint;
    if(!fingerprint||typeof fingerprint!=='object'||!Object.keys(fingerprint).length)fail('The chosen Run has no recorded source fingerprint.');
    const eventIndices=value.eventIndices??value.evidence?.map(item=>item.eventIndex);
    if(!Array.isArray(eventIndices)||!eventIndices.length||eventIndices.length>20||eventIndices.some(index=>!Number.isInteger(index)))fail('Select at least one actual screenshot from that Run.');
    const evidence=[...new Set(eventIndices)].map(eventIndex=>{const event=run.events?.find(item=>item.index===eventIndex&&item.type==='screenshot'&&typeof item.screenshot==='string');if(!event||!event.screenshot.startsWith(`/runs/${run.id}/`))fail('A resolution reference does not match a recorded screenshot.');return {runId:run.id,eventIndex,artifact:event.screenshot,originalMs:numberOrNull(event.videoMs)};});
    const build=`sha256:${createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(fingerprint).sort(([a],[b])=>a.localeCompare(b))))).digest('hex')}`;
    if(value.build&&value.build!==build)fail('The supplied build does not match the selected Run’s recorded source.');
    return {runId:run.id,eventIndices:[...new Set(eventIndices)],build,evidence,reason:bounded(value.reason,4000),reviewedAt:now(),reviewer:'local-user',sourceIdentity:run.sourceIdentity||{deploymentMatch:'unverified'},scope:run.sourceIdentity?.deploymentMatch==='verified'?'recorded-run-and-build':'recorded-source; deployment-unverified',environmentId:run.environmentId,environmentVersion:run.environmentVersion};
  }
  function applyIssue(input={},id=input.id) {
    const old=id?rawIssue(id):null;id ||= randomUUID();const projectId=input.projectId||old?.projectId||DEFAULT_PROJECT;requireProject(projectId);if(old&&old.projectId!==projectId)throw new WorkspaceError('An Issue cannot move between apps.');if(old?.mergedInto)throw new WorkspaceError('This Issue was merged. Edit its destination instead.',409);
    const title=bounded(input.title??input.name??old?.title,180);if(!title)throw new WorkspaceError('Issue title is required.');
    let status=input.status||old?.status||'open';if(!['open','investigating','fix_in_progress','awaiting_verification','resolved','reopened','dismissed'].includes(status))throw new WorkspaceError('Invalid issue status.');
    const previousIds=(old?.findingIds||[]).filter(fid=>getFinding(fid)?.issueId===id),findingIds=input.findingIds??previousIds;
    if(!Array.isArray(findingIds)||findingIds.some(fid=>getFinding(fid)?.projectId!==projectId))throw new WorkspaceError('Every occurrence must belong to this app.');
    if(findingIds.some(fid=>getFinding(fid)?.type!=='broken'))throw new WorkspaceError('Issues group product defects. Classify a finding as Broken before linking it; experience, product and business insights can have fixes without an Issue.');
    if(old?.status==='resolved'&&findingIds.some(fid=>!previousIds.includes(fid))&&input.status!=='resolved')status='reopened';
    let resolution=input.resolution??old?.resolution??null;if(status==='resolved')resolution=validateResolution(resolution,projectId);
    const stamp=now(),data={...old,id,projectId,title,status,findingIds:[...new Set(findingIds)],resolution,createdAt:old?.createdAt||stamp,updatedAt:stamp};
    writeIssue(data,input.reason||'Issue updated.');
    for(const fid of previousIds)if(!data.findingIds.includes(fid)){writeFindingRevision(fid,{issueId:null},'Removed from this issue during occurrence review.');reconcileFindingOwner(fid,null,'Occurrence unlinked.');}
    for(const fid of data.findingIds){writeFindingRevision(fid,{issueId:id},input.reason||'Linked to a recurring issue.');reconcileFindingOwner(fid,id,input.reason||'Occurrence moved to this issue.');}
    return id;
  }
  function saveIssue(input={},id=input.id) {let saved;transaction(()=>{saved=applyIssue(input,id);});return getIssue(saved);}
  function mergeIssues(sourceId,targetIssueId) {
    if(sourceId===targetIssueId)throw new WorkspaceError('Choose another Issue to merge into.');
    const source=getIssue(sourceId),target=getIssue(targetIssueId);if(!source||!target||source.projectId!==target.projectId||target.mergedInto)throw new WorkspaceError('Choose two active Issues in the same app.');
    if(source.mergedInto===targetIssueId)return {source,target};if(source.mergedInto)throw new WorkspaceError('This Issue was already merged elsewhere.',409);
    transaction(()=>{applyIssue({findingIds:[...new Set([...target.findingIds,...source.findingIds])],reason:`Merged occurrences from ${source.id}.`},targetIssueId);const updated=rawIssue(sourceId);writeIssue({...updated,findingIds:[],status:'dismissed',mergedInto:targetIssueId},`Merged into ${targetIssueId}.`);});
    return {source:getIssue(sourceId),target:getIssue(targetIssueId)};
  }
  function splitIssue(sourceId,{findingIds,title}={}) {
    const source=getIssue(sourceId);if(!source||source.mergedInto)throw new WorkspaceError('Issue not found or already merged.',404);
    if(!Array.isArray(findingIds)||!findingIds.length||findingIds.length>=source.findingIds.length||findingIds.some(fid=>!source.findingIds.includes(fid))||new Set(findingIds).size!==findingIds.length)throw new WorkspaceError('Select a distinct, non-empty subset of this Issue’s occurrences; leave at least one in the original.');
    let newId;transaction(()=>{newId=applyIssue({projectId:source.projectId,title,findingIds,reason:`Split from ${source.id}.`});audit('issue-split',sourceId,{targetIssueId:newId,findingIds});});return {source:getIssue(sourceId),issue:getIssue(newId)};
  }
  function getIssue(id){const issue=rawIssue(id);if(!issue)return null;const findings=(issue.findingIds||[]).map(getFinding).filter(f=>f?.issueId===id&&f.type==='broken');return {...issue,findingIds:findings.map(f=>f.id),findings,seen:new Set(findings.map(f=>f.runId)).size,occurrences:findings.length,lastSeen:findings.map(f=>f.createdAt).filter(Boolean).sort().at(-1)||null};}
  function listIssues(projectId){return db.prepare(`SELECT id FROM issues ${projectId?'WHERE project_id=?':''} ORDER BY updated_at DESC`).all(...(projectId?[projectId]:[])).map(r=>getIssue(r.id));}
  async function importLegacyRuns() {
    if(!runsDir)return {imported:0,unchanged:0,errors:[]};let dirs;try{dirs=await readdir(runsDir,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return {imported:0,unchanged:0,errors:[]};throw error;}
    const report={imported:0,unchanged:0,errors:[]};
    for(const dir of dirs.filter(d=>d.isDirectory()&&/^[0-9a-f-]{36}$/i.test(d.name))){const path=join(runsDir,dir.name,'run.json');try{const text=await readFile(path,'utf8'),hash=createHash('sha256').update(text).digest('hex'),stored=db.prepare('SELECT source_hash FROM runs WHERE id=?').get(dir.name);if(stored?.source_hash===hash){report.unchanged++;continue;}const run=parse(text);if(run.id!==dir.name)throw new Error('Run ID does not match folder.');syncRun(run,{sourceHash:hash,sourcePath:path,imported:true});report.imported++;}catch(error){report.errors.push({id:dir.name,error:String(error.message).slice(0,200)});}}
    return report;
  }
  function buildRun({projectId=DEFAULT_PROJECT,charterId,personaId,environmentId,name,batchId,deviceId,networkProfileId,deviceSelections}) {
    requireProject(projectId);const charter=getEntity('charter',charterId),persona=getEntity('persona',personaId),environment=getEntity('environment',environmentId);
    for(const [label,entity] of [['Mission',charter],['Persona',persona],['Environment',environment]])if(!entity||entity.projectId!==projectId||entity.archived)throw new WorkspaceError(`${label} is unavailable in this app.`);
    const configured=resolveConfiguredEnvironment(environment.id,environment.version);
    if(!configured||configured.archived)throw new WorkspaceError('Environment is unavailable in this app.');
    if(!charter.mission)throw new WorkspaceError('The mission needs an objective before it can run.');
    if(charter.compatibleEnvironmentIds?.length&&!charter.compatibleEnvironmentIds.some(id=>resolveConfiguredEnvironment(id)?.id===configured.id))throw new WorkspaceError('This mission is not compatible with the selected environment.',409,'CHARTER_INCOMPATIBLE_ENVIRONMENT');
    const executionPolicy={};
    for(const key of ['maxSteps','maxTokens','maxDurationMs']){
      if(charter[key]!=null&&charter[key]>environment[key])throw new WorkspaceError(`The mission ${key} exceeds the selected environment limit.`,409,'CHARTER_POLICY_EXCEEDS_ENVIRONMENT');
      executionPolicy[key]=charter[key]??environment[key];
    }
    for(const key of ['captureBodies','allowMutations']){
      if(charter[key]===true&&environment[key]!==true)throw new WorkspaceError(`The mission cannot enable ${key} beyond the selected environment policy.`,409,'CHARTER_POLICY_EXCEEDS_ENVIRONMENT');
      executionPolicy[key]=charter[key]??environment[key]??false;
    }
    const browserConfiguration=resolveBrowserConfiguration(persona,{deviceId:deviceSelections?.[personaId]||deviceId,networkProfileId});
    const memorySnapshot=memory.resolveSnapshot({projectId,environment:{...environment,id:configured.id,name:configured.name,version:configured.version,versionId:configured.versionId},persona,charter});
    const run={memorySnapshotId:memorySnapshot.id,memorySnapshot,id:randomUUID(),projectId,name:bounded(name,160)||`${charter.name} · ${persona.name}`,status:'queued',createdAt:now(),events:[],experience:[],usage:[],finalMessage:null,error:null,video:null,replay:null,charterId,charterVersion:charter.version,charterVersionId:charter.versionId,charterName:charter.name,charterSnapshot:charter,personaId,personaName:persona.name,personaVersion:persona.version,personaVersionId:persona.versionId,persona:structuredClone(persona),personaSnapshot:structuredClone(persona),environmentId:configured.id,environmentName:configured.name,environmentVersion:configured.version,environmentVersionId:configured.versionId,environmentSnapshot:environment,...(environment.lifecycle==='temporary'?{memoryReferenceUrl:configured.url,executionInstance:{id:environment.id,targetId:environment.id,kind:environment.instanceKind||environment.instanceSource?.kind||'test-preview',environmentId:configured.id,url:environment.url,repositoryPath:environment.repositoryPath}}:{}),target:environment.url,productDirectory:environment.repositoryPath||null,...browserConfiguration,scenarioId:environment.scenarioId||charter.scenarioId||'web-app',model:'muse-wonder-1.0',maxSteps:executionPolicy.maxSteps,executionPolicy,batchId:batchId||null,limitations:'Synthetic persona observations. Completion is distinct from achieving the goal.'};return run;
  }
  function buildRetry(runId) {
    const previous=getRun(runId);if(!previous)throw new WorkspaceError('Run not found.',404,'NOT_FOUND');
    if(activeStatuses.has(previous.status)||previous.status==='cancelling')throw new WorkspaceError('Wait for this Run to finish or cancel it before retrying.',409,'RUN_ACTIVE');
    if(!previous.charterSnapshot||!previous.environmentSnapshot||!previous.persona)throw new WorkspaceError('This legacy Run has no complete pinned configuration. Start a new Run from a saved mission instead.',409,'LEGACY_CONTEXT_INCOMPLETE');
    if(previous.executionInstance)throw new WorkspaceError('Retest this recorded build from its fix or change review.',409,'INSTANCE_RETEST_REQUIRED');
    const current=getEntity('environment',previous.environmentId),pinned=previous.environmentSnapshot;
    if(!current||current.archived||current.projectId!==previous.projectId)throw new WorkspaceError('The original environment is unavailable or archived.',409,'ENVIRONMENT_UNAVAILABLE');
    if(!current.allowedOrigins.includes(new URL(previous.target).origin)||(pinned.allowedOrigins||[]).some(origin=>!current.allowedOrigins.includes(origin))||(pinned.allowMutations&&current.allowMutations===false))throw new WorkspaceError('The environment policy changed and no longer permits this pinned Run. Start a new Run with the current configuration.',409,'ENVIRONMENT_POLICY_CHANGED');
    const configKeys=['projectId','charterId','charterVersion','charterVersionId','charterName','charterSnapshot','personaId','personaName','personaVersion','personaVersionId','persona','personaSnapshot','executionPolicy','environmentId','environmentName','environmentVersion','environmentVersionId','environmentSnapshot','target','productDirectory','viewport','deviceId','deviceName','deviceVersion','deviceVersionId','deviceSnapshot','networkProfileId','networkProfileName','networkProfileVersion','networkProfileVersionId','networkProfileSnapshot','scenarioId','model','maxSteps','memorySnapshotId','memorySnapshot','modelConfiguration','toolConfiguration','limitations'];
    return {...Object.fromEntries(configKeys.filter(key=>previous[key]!==undefined).map(key=>[key,structuredClone(previous[key])])),productDirectory:previous.productDirectory||pinned.repositoryPath||null,id:randomUUID(),name:`${previous.name} · retry`,retryOfRunId:previous.id,batchId:null,status:'queued',createdAt:now(),events:[],experience:[],usage:[],finalMessage:null,error:null,video:null,replay:null};
  }
  function getLaunchRequest(key){const row=db.prepare('SELECT * FROM launch_requests WHERE idempotency_key=?').get(key);return row?{key:row.idempotency_key,digest:row.digest,runIds:parse(row.run_ids),batchId:row.batch_id,state:row.state,createdAt:row.created_at}:null;}
  function beginLaunchRequest(key,digest,runIds,batchId){db.prepare('INSERT INTO launch_requests VALUES(?,?,?,?,?,?)').run(key,digest,json(runIds),batchId||null,'pending',now());}
  function finishLaunchRequest(key){db.prepare("UPDATE launch_requests SET state='completed' WHERE idempotency_key=?").run(key);}
  return {db,root,memory,resolveConfiguredEnvironment,registerEnvironmentInstance,refreshEnvironmentOrigins,saveProject,listProjects,requireProject,getEntity,listEntities,saveEntity,adoptCalibrationPersona,versions,duplicateEntity,restoreEntity,archiveEntity,deleteEntity,resolveBrowserConfiguration,recordEnvironmentCheck,syncRun,getRun,listRuns,listRunsPage,renameRun,getFinding,listFindings,addBusinessHypothesis,updateFinding,findingRevisions,saveIssue,getIssue,listIssues,mergeIssues,splitIssue,importLegacyRuns,buildRun,buildRetry,getLaunchRequest,beginLaunchRequest,finishLaunchRequest,close:()=>db.close(),audit};
}
