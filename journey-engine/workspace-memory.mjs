import {recordedDeviceContext} from './recorded-device.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { redactText, safeUrl } from './workspace-execution.mjs';
import { memoryScreenUrl } from './memory-runtime.mjs';

const now=()=>new Date().toISOString(),parse=value=>value==null?null:JSON.parse(value),json=JSON.stringify;
const KINDS=['navigation','expected_behavior','rule','term','test_data'];
const AUDIENCES=['operational','evaluator','persona'];
const STATUSES=['published','verified','corrected','superseded','disputed'];
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const digest=value=>createHash('sha256').update(json(value)).digest('hex');
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const observedBuild=run=>(run.productFingerprint&&Object.keys(run.productFingerprint).length?`source:${digest(Object.entries(run.productFingerprint).sort())}`:null)||run.buildId||run.sourceIdentity?.buildId||null;

export function memoryFlowsForScreen(snapshot,{url,state=null,device='unknown',environmentId=snapshot?.environment?.id}={}){
 const context=snapshot?.flowContext;
 if(!context?.inventoryVersionId)return {flows:[],reason:'flow_inventory_not_pinned',screenId:null};
 let visible;try{visible=new URL(url);if(!['http:','https:'].includes(visible.protocol))throw Error();}catch{return {flows:[],reason:'screen_url_unavailable',screenId:null};}
 const path=visible.pathname.length>1?visible.pathname.replace(/\/+$/,''):visible.pathname;
 const matches=(context.screens||[]).filter(screen=>{
  if(screen.origin&&screen.origin!==visible.origin||screen.state&&screen.state!==state||screen.device&&screen.device!=='any'&&screen.device!==device||screen.environmentIds?.length&&!screen.environmentIds.includes(environmentId))return false;
  const pattern=screen.routePattern.split('/').map(segment=>segment==='**'?'.*':segment==='*'||/^:[A-Za-z_][\w-]*$/.test(segment)?'[^/]+':segment.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('/');
  return new RegExp(`^${pattern}$`).test(path);
 });
 const weight=screen=>screen.routePattern.replace(/\*\*?|:[\w-]+/g,'').length+(screen.state?10000:0)+(screen.device&&screen.device!=='any'?1000:0)+(screen.origin?100:0);
 matches.sort((a,b)=>weight(b)-weight(a)||a.id.localeCompare(b.id));
 if(!matches.length||matches.length>1&&weight(matches[0])===weight(matches[1]))return {flows:[],reason:matches.length?'ambiguous_flow_screen':'screen_flow_unmapped',screenId:null};
 const screen=matches[0],declared=context.charterFlows||[],flows=[];
 for(const id of screen.flowIds||[]){const definition=(context.flows||[]).find(flow=>flow.id===id);if(!definition)continue;const aliases=[definition.id,definition.name];if(declared.length&&!aliases.some(value=>declared.includes(value)))continue;flows.push(...aliases);}
 return {flows:[...new Set(flows)],reason:flows.length?null:'screen_flow_outside_charter',screenId:screen.id,inventoryVersion:context.inventoryVersion};
}

export function createWorkspaceMemory({db,getRun,getEntity,resolveConfiguredEnvironment,requireProject,transaction,audit,ErrorClass=Error}){
 const fail=(message,status=400,code='INVALID_MEMORY')=>new ErrorClass(message,status,code);
 function environmentIdentity(id,version){
  if(!id)return {id:null,version:null,metadata:null,kind:'unknown'};
  const raw=getEntity('environment',id,version??undefined),configured=typeof resolveConfiguredEnvironment==='function'?resolveConfiguredEnvironment(id,version??undefined):raw?.lifecycle==='temporary'?null:raw;
  return {id:configured?.id||id,version:raw?.lifecycle==='temporary'?configured?.version??null:version??null,metadata:configured?{id:configured.id,name:configured.name,version:configured.version,versionId:configured.versionId}:null,kind:raw?.lifecycle==='temporary'?'temporary':configured?'configured':'unknown'};
 }
 db.exec(`CREATE TABLE IF NOT EXISTS memory_entries(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,current_version INTEGER NOT NULL,archived INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS memory_versions(id TEXT NOT NULL,version INTEGER NOT NULL,version_id TEXT NOT NULL UNIQUE,data TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(id,version));
 CREATE TABLE IF NOT EXISTS memory_conflicts(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,left_id TEXT NOT NULL,right_id TEXT NOT NULL,status TEXT NOT NULL,version INTEGER NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS memory_publications(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,run_id TEXT NOT NULL,learning_index INTEGER NOT NULL,status TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(run_id,learning_index));
 CREATE TABLE IF NOT EXISTS memory_snapshots(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS memory_access(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,snapshot_id TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS memory_project ON memory_entries(project_id,archived);
 CREATE INDEX IF NOT EXISTS memory_publication_run ON memory_publications(run_id);
 CREATE INDEX IF NOT EXISTS memory_access_run ON memory_access(run_id);`);

 function text(value,key,max,required=false){
  if(value==null)value='';if(typeof value!=='string')throw fail(`${key} must be text.`);
  if(value.length>max)throw fail(`${key} must be at most ${max} characters.`);
  const clean=redactText(value.replace(/https?:\/\/[^\s<>"']+/g,url=>{try{const parsed=new URL(url);if(parsed.username||parsed.password)return safeUrl(url);return url;}catch{return url;}})).trim();if(required&&!clean)throw fail(`${key} is required.`);return clean;
 }
 function strings(value,key,max=20,itemMax=500){
  if(value==null)return [];if(!Array.isArray(value)||value.length>max)throw fail(`${key} must contain at most ${max} text values.`);
  return [...new Set(value.map(item=>text(item,key,itemMax,true)))];
 }
 function assertVersion(current,input={}){
  if(input.projectId&&current&&input.projectId!==current.projectId)throw fail('Memory belongs to another app.',400,'PROJECT_MISMATCH');
  if(input.expectedVersion!==undefined){if(!Number.isInteger(input.expectedVersion)||input.expectedVersion<0)throw fail('expectedVersion must be a nonnegative integer.',400,'INVALID_VERSION');if(input.expectedVersion!==(current?.version||0))throw fail('Memory changed. Reload the current version before saving.',409,'VERSION_CONFLICT');}
 }
 function conflictRows(id){return db.prepare('SELECT * FROM memory_conflicts WHERE left_id=? OR right_id=? ORDER BY created_at,id').all(id,id).map(row=>({...parse(row.data),id:row.id,version:row.version,status:row.status,projectId:row.project_id,createdAt:row.created_at,updatedAt:row.updated_at,otherEntryId:row.left_id===id?row.right_id:row.left_id}));}
 function get(id,version){
  const row=db.prepare('SELECT * FROM memory_entries WHERE id=?').get(id);if(!row)return null;
  const record=db.prepare('SELECT * FROM memory_versions WHERE id=? AND version=?').get(id,version??row.current_version);if(!record)return null;
  const data=parse(record.data),expired=Boolean(data.applicability.expiresAt&&Date.parse(data.applicability.expiresAt)<=Date.now());
  const environment=environmentIdentity(data.applicability.environmentId,data.applicability.environmentVersion);
  return {...data,id,projectId:row.project_id,version:record.version,versionId:record.version_id,archived:Boolean(row.archived),createdAt:row.created_at,updatedAt:row.updated_at,versionCreatedAt:record.created_at,configuredEnvironment:environment.metadata,environmentKind:environment.kind,conflicts:conflictRows(id),freshness:{status:expired?'stale':'unexpired',expiresAt:data.applicability.expiresAt}};
 }
 function list({projectId,includeArchived=true,audience,status}={}){
  if(projectId)requireProject(projectId);const clauses=[],args=[];if(projectId){clauses.push('project_id=?');args.push(projectId);}if(!includeArchived)clauses.push('archived=0');
  return db.prepare(`SELECT id FROM memory_entries ${clauses.length?`WHERE ${clauses.join(' AND ')}`:''} ORDER BY updated_at DESC,id`).all(...args).map(row=>get(row.id)).filter(entry=>(!audience||entry.audience===audience)&&(!status||entry.status===status));
 }
 function versions(id){if(!get(id))throw fail('Memory not found.',404,'NOT_FOUND');return db.prepare('SELECT version FROM memory_versions WHERE id=? ORDER BY version DESC').all(id).map(row=>get(id,row.version));}
 function validateSources(value,projectId){
  if(!Array.isArray(value)||!value.length||value.length>20)throw fail('Memory needs between one and twenty recorded source references.',400,'MEMORY_SOURCES_REQUIRED');
  const seen=new Set(),sources=[];
  for(const reference of value){
   if(!object(reference)||typeof reference.runId!=='string'||!Number.isInteger(reference.eventIndex)||reference.eventIndex<0)throw fail('Each source needs a recorded runId and eventIndex.',400,'INVALID_MEMORY_SOURCE');
   const run=getRun(reference.runId);if(!run||run.projectId!==projectId)throw fail('Memory sources must belong to an existing journey in this app.',400,'INVALID_MEMORY_SOURCE');
   const event=(run.events||[]).find(item=>item.index===reference.eventIndex);
   if(!event||event.type!=='screenshot'||typeof event.screenshot!=='string'||!event.screenshot.startsWith(`/runs/${run.id}/`)||event.screenshot.includes('..'))throw fail('Memory must cite an existing screenshot event from its source journey.',400,'INVALID_MEMORY_SOURCE');
   if(run.integrityStatus==='invalidated')throw fail('The source journey evidence is invalidated.',400,'INVALID_MEMORY_SOURCE');
   const key=`${run.id}:${event.index}`;if(seen.has(key))continue;seen.add(key);
   sources.push({runId:run.id,eventIndex:event.index,type:'screenshot',screenshot:event.screenshot,screenUrl:event.url?safeUrl(event.url):null,originalMs:Number.isFinite(event.videoMs)?event.videoMs:null,observedAt:event.at||run.completedAt||run.createdAt||null,environmentId:run.environmentId||null,environmentVersion:run.environmentVersion||null,buildId:observedBuild(run),personaId:run.personaId||null,experimentalStudyId:run.experimentalStudyId||run.calibrationStudyId||run.calibrationTrialId||(run.experimental?'unadopted-experiment':null)});
  }return sources;
 }
 function clean(input,old={},projectId){
  const read=key=>own(input,key)?input[key]:old[key];
  const kind=read('kind')||'navigation',audience=read('audience')||'evaluator',polarity=read('polarity')||'affirm',status=read('status')||'published';
  if(!KINDS.includes(kind)||!AUDIENCES.includes(audience)||!['affirm','deny'].includes(polarity)||!STATUSES.includes(status))throw fail('Choose a supported kind, audience, polarity and status.');
  const confidence=read('confidence');if(typeof confidence!=='number'||!Number.isFinite(confidence)||confidence<0||confidence>1)throw fail('Memory needs an explicit confidence between zero and one.',400,'MEMORY_CONFIDENCE_REQUIRED');
  const confidenceBasis=text(read('confidenceBasis'),'Confidence basis',2000,true),sources=validateSources(read('sources'),projectId);
  const rawScope=read('scope')??{};if(!object(rawScope))throw fail('Scope must be a screen/flow object.');
  const scope={screenPatterns:strings(rawScope.screenPatterns,'Screen patterns',20,300),flows:strings(rawScope.flows,'Flows',20,200)};
  for(const pattern of scope.screenPatterns)if(!pattern.startsWith('/')&&!/^https?:\/\//.test(pattern))throw fail('Screen patterns must be URL paths or http(s) URLs.');
  const claimType=read('claimType')||'observed';if(!['observed','approved_rule'].includes(claimType))throw fail('Claim type must be observed or approved_rule.');
  const sourceEnvironment=environmentIdentity(sources[0].environmentId,sources[0].environmentVersion);
  const defaults={environmentId:sourceEnvironment.id,environmentVersion:sourceEnvironment.version,buildId:sources[0].buildId||'unverified-source',personaId:null,expiresAt:null,experimentalStudyId:null};
  const rawApplicability=read('applicability')??{};if(!object(rawApplicability))throw fail('Applicability must be an object.');
  const applicability={...defaults,...Object.fromEntries(Object.keys(defaults).filter(key=>own(rawApplicability,key)).map(key=>[key,rawApplicability[key]||null]))};
  const experimentalSources=[...new Set(sources.map(source=>source.experimentalStudyId).filter(Boolean))];
  if(experimentalSources.length)applicability.experimentalStudyId=experimentalSources.length===1?experimentalSources[0]:'multiple-experiments';
  if(claimType==='observed'){
   applicability.buildId ||=sources[0].buildId||'unverified-source';
   if(!sources.some(source=>(source.buildId||'unverified-source')===applicability.buildId))throw fail('An observed claim must apply to a build recorded by its sources.',400,'INVALID_MEMORY_BUILD');
  }
  for(const key of ['environmentId','buildId','personaId','experimentalStudyId'])if(applicability[key]!==null)applicability[key]=text(applicability[key],key,200,true);
  if(applicability.environmentVersion!==null&&(!Number.isInteger(applicability.environmentVersion)||applicability.environmentVersion<1))throw fail('Environment version must be a positive integer.');
  if(applicability.environmentId){const environment=getEntity('environment',applicability.environmentId,applicability.environmentVersion??undefined);if(!environment||environment.projectId!==projectId)throw fail('Choose an environment version from this app.',400,'INVALID_REFERENCE');}
  else if(applicability.environmentVersion!==null)throw fail('An environment version needs its environment ID.');
  if(applicability.personaId){const persona=getEntity('persona',applicability.personaId);if(!persona||persona.projectId!==projectId)throw fail('Choose a persona from this app.',400,'INVALID_REFERENCE');}
  if(applicability.expiresAt!==null){if(typeof applicability.expiresAt!=='string'||!Number.isFinite(Date.parse(applicability.expiresAt)))throw fail('Expiry must be a valid date.');applicability.expiresAt=new Date(applicability.expiresAt).toISOString();}
  const supersededById=read('supersededById')||null;
  if(status==='superseded'){const replacement=supersededById&&get(supersededById);if(!replacement||replacement.projectId!==projectId||replacement.id===old.id)throw fail('Supersession needs another memory entry in this app.',400,'INVALID_REFERENCE');}
  return {name:text(read('name'),'Name',160),content:text(read('content'),'Content',4000,true),kind,subject:text(read('subject'),'Subject',300,true),value:text(read('value'),'Value',2000,true),polarity,audience,confidence,confidenceBasis,scope,sources,applicability,status,claimType,supersededById:status==='superseded'?supersededById:null,reviewReason:text(read('reviewReason'),'Review reason',2000),provenance:old.provenance||input.provenance||{origin:'local-user'}};
 }
 function overlapping(a,b){
  const aEnv=environmentIdentity(a.applicability.environmentId,a.applicability.environmentVersion),bEnv=environmentIdentity(b.applicability.environmentId,b.applicability.environmentVersion);
  if(aEnv.id&&bEnv.id&&aEnv.id!==bEnv.id||aEnv.version&&bEnv.version&&aEnv.version!==bEnv.version)return false;
  for(const key of ['buildId','personaId','experimentalStudyId'])if(a.applicability[key]!=null&&b.applicability[key]!=null&&a.applicability[key]!==b.applicability[key])return false;
  return true;
 }
 function detectConflicts(entry){
  for(const other of list({projectId:entry.projectId,includeArchived:false})){if(other.id===entry.id||['superseded'].includes(other.status)||other.audience!==entry.audience||other.kind!==entry.kind||other.subject.toLowerCase()!==entry.subject.toLowerCase()||!overlapping(entry,other))continue;
   if(other.polarity===entry.polarity&&other.value.toLowerCase()===entry.value.toLowerCase())continue;
   const ids=[entry.id,other.id].sort(),id=`conflict-${digest(ids).slice(0,24)}`,existing=db.prepare('SELECT * FROM memory_conflicts WHERE id=?').get(id);
   const stamp=now(),data={entryIds:ids,entryVersions:{[entry.id]:entry.version,[other.id]:other.version},reason:'Conflicting values or polarity for the same subject and overlapping applicability.',resolution:null};
   if(existing?.status==='unresolved')continue;
   db.prepare('INSERT INTO memory_conflicts VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,version=excluded.version,data=excluded.data,updated_at=excluded.updated_at').run(id,entry.projectId,ids[0],ids[1],'unresolved',(existing?.version||0)+1,json(data),existing?.created_at||stamp,stamp);
   audit('memory-conflict',id,{projectId:entry.projectId,...data});
  }
 }
 function write(input,id,{detect=true}={}){
  const old=id?get(id):null;if(id&&!old)throw fail('Memory not found.',404,'NOT_FOUND');assertVersion(old,input);
  const projectId=input.projectId||old?.projectId;if(!projectId)throw fail('Choose an app.');requireProject(projectId);
  id ||=randomUUID();const data=clean(input,old||{},projectId),version=(old?.version||0)+1,versionId=randomUUID(),stamp=now();
  db.prepare('INSERT INTO memory_versions VALUES(?,?,?,?,?)').run(id,version,versionId,json(data),stamp);
  db.prepare('INSERT INTO memory_entries VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET current_version=excluded.current_version,updated_at=excluded.updated_at').run(id,projectId,version,old?.archived?1:0,old?.createdAt||stamp,stamp);
  audit('memory-version',id,{projectId,version,versionId,status:data.status});const entry=get(id);if(detect&&data.status!=='superseded')detectConflicts(entry);return get(id);
 }
 const create=input=>transaction(()=>write({...input,provenance:{origin:'local-user'}}));
 const update=(id,input)=>transaction(()=>write(input,id));
 function archive(id,archived=true,input={}){if(typeof archived!=='boolean')throw fail('archived must be true or false.');return transaction(()=>{const entry=get(id);if(!entry)throw fail('Memory not found.',404,'NOT_FOUND');assertVersion(entry,input);db.prepare('UPDATE memory_entries SET archived=?,updated_at=? WHERE id=?').run(archived?1:0,now(),id);audit('memory-archive',id,{projectId:entry.projectId,archived});return get(id);});}
 function restore(id,input={}){return transaction(()=>{const current=get(id);if(!current)throw fail('Memory not found.',404,'NOT_FOUND');assertVersion(current,input);if(!Number.isInteger(input.version)||input.version<1)throw fail('Choose a valid historical version.',400,'INVALID_VERSION');const source=get(id,input.version);if(!source)throw fail('Memory version not found.',404,'VERSION_NOT_FOUND');return write({...source,expectedVersion:current.version},id);});}
 function resolveConflict(id,input={}){return transaction(()=>{
  const row=db.prepare('SELECT * FROM memory_conflicts WHERE id=?').get(id);if(!row)throw fail('Conflict not found.',404,'NOT_FOUND');
  assertVersion({projectId:row.project_id,version:row.version},input);if(row.status!=='unresolved')throw fail('This conflict is already resolved.',409,'CONFLICT_RESOLVED');
  const reason=text(input.reason,'Resolution reason',2000,true),ids=[row.left_id,row.right_id];if(!ids.includes(input.preferredEntryId))throw fail('Choose one of the conflicting entries.');
  const preferred=get(input.preferredEntryId),other=get(ids.find(entryId=>entryId!==input.preferredEntryId));
  if(preferred.archived)throw fail('Restore the selected memory before accepting it.',409,'MEMORY_ARCHIVED');
  write({status:'verified',reviewReason:reason,expectedVersion:preferred.version},preferred.id,{detect:false});
  write({status:'superseded',supersededById:preferred.id,reviewReason:reason,expectedVersion:other.version},other.id,{detect:false});
  const data={...parse(row.data),resolution:{preferredEntryId:preferred.id,supersededEntryId:other.id,reason,at:now()}};
  db.prepare('UPDATE memory_conflicts SET status=?,version=?,data=?,updated_at=? WHERE id=?').run('resolved',row.version+1,json(data),now(),id);audit('memory-conflict-resolved',id,{projectId:row.project_id,...data.resolution});
  return {conflict:{...data,id,status:'resolved',version:row.version+1},entries:[get(preferred.id),get(other.id)]};
 });}
 function publications({projectId,runId}={}){if(projectId)requireProject(projectId);const clauses=[],args=[];if(projectId){clauses.push('project_id=?');args.push(projectId);}if(runId){clauses.push('run_id=?');args.push(runId);}return db.prepare(`SELECT data FROM memory_publications ${clauses.length?`WHERE ${clauses.join(' AND ')}`:''} ORDER BY created_at,id`).all(...args).map(row=>parse(row.data));}
 const publicationFailures=options=>publications(options).filter(item=>item.status==='failed');
 function publishRun(runId,{learnings}={}){
  const run=getRun(runId);if(!run)throw fail('Journey not found.',404,'NOT_FOUND');
  const values=learnings??run.memoryLearnings;if(values===undefined)return [];
  const candidates=Array.isArray(values)?values.slice(0,20):[values];
  if(Array.isArray(values)&&values.length>20)candidates.push({invalidBatch:true});
  return candidates.map((claim,index)=>{
   const existing=db.prepare('SELECT data FROM memory_publications WHERE run_id=? AND learning_index=?').get(runId,index);if(existing)return parse(existing.data);
   let publication;
   try{publication=transaction(()=>{
    if(!Array.isArray(values)||claim?.invalidBatch)throw fail('A journey may publish at most twenty structured learnings.',400,'INVALID_MEMORY_BATCH');
    if(!object(claim))throw fail('A learning must be an object.');
    if(own(claim,'publicationError'))throw fail('The model learning had an unsupported or oversized structure.',400,'INVALID_MEMORY_STRUCTURE');
    const fields=['name','content','kind','subject','value','polarity','audience','confidence','confidenceBasis','scope'];
    const candidate=Object.fromEntries(fields.filter(key=>own(claim,key)).map(key=>[key,claim[key]]));
    candidate.sources=Array.isArray(claim.sources)?claim.sources.map(source=>{if(!object(source)||source.runId&&source.runId!==runId)throw fail('Automatic learnings must cite this journey.',400,'INVALID_MEMORY_SOURCE');return {...source,runId};}):claim.sources;
    if(!(candidate.scope?.screenPatterns?.length||candidate.scope?.flows?.length)){const paths=(Array.isArray(candidate.sources)?candidate.sources:[]).flatMap(source=>{const event=(run.events||[]).find(event=>event.index===source.eventIndex);try{const url=new URL(run.executionInstance&&run.memoryReferenceUrl?memoryScreenUrl(run,event?.url):event?.url);return [`${url.origin}${url.pathname}`];}catch{return [];}});candidate.scope={screenPatterns:[...new Set(paths)],flows:[]};}
    const environment=environmentIdentity(run.environmentId,run.environmentVersion);
    candidate.applicability={environmentId:environment.id,environmentVersion:environment.version,buildId:observedBuild(run)||'unverified-source',personaId:claim.audience==='persona'?run.personaId||null:null,experimentalStudyId:run.experimentalStudyId||run.calibrationStudyId||run.calibrationTrialId||(run.experimental?'unadopted-experiment':null)};
    candidate.projectId=run.projectId;candidate.claimType='observed';candidate.status='published';candidate.provenance={origin:'journey',runId,learningIndex:index,model:run.model||null};
    const entry=write(candidate);const result={id:randomUUID(),projectId:run.projectId,runId,learningIndex:index,status:'published',entryId:entry.id,entryVersion:entry.version,createdAt:now()};
    db.prepare('INSERT INTO memory_publications VALUES(?,?,?,?,?,?,?)').run(result.id,run.projectId,runId,index,result.status,json(result),result.createdAt);return result;
   });}catch(error){publication={id:randomUUID(),projectId:run.projectId,runId,learningIndex:index,status:'failed',code:error.code||'MEMORY_PUBLICATION_FAILED',message:error instanceof ErrorClass?redactText(error.message):'Memory publication failed; no authoritative entry was created.',createdAt:now()};transaction(()=>{db.prepare('INSERT INTO memory_publications VALUES(?,?,?,?,?,?,?)').run(publication.id,run.projectId,runId,index,publication.status,json(publication),publication.createdAt);audit('memory-publication-failed',publication.id,{projectId:run.projectId,runId,learningIndex:index,code:publication.code});});}
   return publication;
  });
 }
 function resolveSnapshot({projectId,environment,persona,charter,buildId=null}={}){
  requireProject(projectId);if(environment?.projectId!==projectId||persona?.projectId!==projectId||charter?.projectId!==projectId)throw fail('Memory snapshots require saved configuration for this app.',400,'PROJECT_MISMATCH');
  const targetEnvironment=environmentIdentity(environment.id,environment.version);
  const hasInventory=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='insight_inventory_versions'").get();
  const inventory=hasInventory?parse(db.prepare('SELECT data FROM insight_inventory_versions WHERE project_id=? ORDER BY version DESC LIMIT 1').get(projectId)?.data):null;
  const flowContext=inventory?{inventoryVersion:inventory.version,inventoryVersionId:inventory.versionId,charterFlows:[...(charter.flows||[])],flows:structuredClone(inventory.flows||[]),screens:(inventory.screens||[]).map(({id,routePattern,origin,state,device,environmentIds,flowIds})=>({id,routePattern,origin,state,device,recordedEnvironmentIds:environmentIds,environmentIds:environmentIds?.map(environmentId=>environmentIdentity(environmentId).id),flowIds}))}:{inventoryVersion:null,inventoryVersionId:null,charterFlows:[...(charter.flows||[])],flows:[],screens:[],reason:'flow_inventory_not_defined'};
  const snapshot={id:randomUUID(),projectId,createdAt:now(),roles:{operational:[],evaluator:[],persona:[]},pendingBuild:{operational:[],evaluator:[],persona:[]},buildResolved:Boolean(buildId),excluded:[],flowContext,policy:{memoryPolicy:charter.memoryPolicy||'none',continuity:persona.continuity||'first-time',minConfidence:0.65},environment:{id:targetEnvironment.id,version:targetEnvironment.version,buildId},personaId:persona.id};
  let totalChars=0;
  for(const entry of list({projectId})){
   const a=entry.applicability,entryEnvironment=environmentIdentity(a.environmentId,a.environmentVersion);let reason=null;
   if(entry.archived)reason='archived';else if(!['published','verified','corrected'].includes(entry.status))reason=entry.status;
   else if(entry.conflicts.some(conflict=>conflict.status==='unresolved'))reason='unresolved_conflict';
   else if(entry.sources.some(source=>{const run=getRun(source.runId);return !run||run.integrityStatus==='invalidated'||!(run.events||[]).some(event=>event.index===source.eventIndex&&event.screenshot===source.screenshot);} ))reason='source_unavailable';
   else if(entry.freshness.status==='stale')reason='expired';else if(a.experimentalStudyId)reason='experimental';
   else if(a.environmentId&&entryEnvironment.id!==targetEnvironment.id)reason='environment_mismatch';else if(entryEnvironment.version&&entryEnvironment.version!==targetEnvironment.version)reason='environment_version_mismatch';
   else if(a.personaId&&a.personaId!==persona.id)reason='persona_mismatch';
   else if(entry.confidence<snapshot.policy.minConfidence)reason='low_confidence';
   else if(entry.audience==='persona'&&(persona.continuity!=='returning'||charter.memoryPolicy!=='relevant'))reason='persona_knowledge_not_enabled';
   else if(entry.audience==='persona'&&charter.memoryIds?.length&&!charter.memoryIds.includes(entry.id))reason='not_selected_by_charter';
   else if(a.buildId==='unverified-source')reason='build_unverified';
   else if(a.buildId&&buildId&&a.buildId!==buildId)reason='build_mismatch';
   else if(snapshot.roles[entry.audience].length+snapshot.pendingBuild[entry.audience].length>=20||totalChars+json(entry).length>120000)reason='snapshot_limit';
   if(reason)snapshot.excluded.push({id:entry.id,version:entry.version,reason});else{const pending=Boolean(a.buildId&&!buildId);snapshot[pending?'pendingBuild':'roles'][entry.audience].push(entry);totalChars+=json(entry).length;}
  }
  db.prepare('INSERT INTO memory_snapshots VALUES(?,?,?,?)').run(snapshot.id,projectId,json(snapshot),snapshot.createdAt);return structuredClone(snapshot);
 }
 function bindSnapshotBuild(snapshot,{buildId=null}={}){
  const frozen=getSnapshot(snapshot?.id);if(!frozen||frozen.projectId!==snapshot?.projectId)throw fail('Choose a recorded memory snapshot.',400,'MEMORY_SNAPSHOT_REQUIRED');
  const bound={...structuredClone(frozen),id:randomUUID(),sourceSnapshotId:frozen.id,createdAt:now(),buildResolved:true,environment:{...frozen.environment,buildId},roles:{operational:[],evaluator:[],persona:[]},pendingBuild:{operational:[],evaluator:[],persona:[]}};
  for(const audience of AUDIENCES){
   for(const entry of [...(frozen.roles[audience]||[]),...(frozen.pendingBuild?.[audience]||[])]){
    const expected=entry.applicability.buildId;
    if(expected&&(!buildId||expected!==buildId))bound.excluded.push({id:entry.id,version:entry.version,reason:buildId?'build_mismatch':'build_unverified'});
    else bound.roles[audience].push(entry);
   }
  }
  db.prepare('INSERT INTO memory_snapshots VALUES(?,?,?,?)').run(bound.id,bound.projectId,json(bound),bound.createdAt);return structuredClone(bound);
 }
 const getSnapshot=id=>parse(db.prepare('SELECT data FROM memory_snapshots WHERE id=?').get(id)?.data);
 function matches(pattern,url){try{const parsed=new URL(url),target=pattern.startsWith('/')?parsed.pathname:`${parsed.origin}${parsed.pathname}`;const escaped=pattern.split('*').map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*');return new RegExp(`^${escaped}$`).test(target);}catch{return false;}}
 function accessForScreen(snapshot,{audience,url,flows=[]}={}){
  if(!AUDIENCES.includes(audience)||!snapshot?.roles)return [];
  return structuredClone((snapshot.roles[audience]||[]).filter(entry=>{const scope=entry.scope||{},screens=scope.screenPatterns||[],entryFlows=scope.flows||[];return (!screens.length&&!entryFlows.length)||screens.some(pattern=>matches(pattern,url))||entryFlows.some(flow=>flows.includes(flow));}));
 }
 function recordAccess(runId,{audience,url,entryIds,eventIndex=null,snapshotId=null}={}){
  const run=getRun(runId);if(!run?.memorySnapshot||run.memorySnapshot.projectId!==run.projectId)throw fail('This journey has no pinned memory snapshot.',409,'MEMORY_SNAPSHOT_REQUIRED');
  if(snapshotId!==null&&snapshotId!==run.memorySnapshot.id)throw fail('The memory snapshot changed before its delivery could be recorded.',409,'MEMORY_SNAPSHOT_CHANGED');
  if(!AUDIENCES.includes(audience)||!Array.isArray(entryIds)||entryIds.some(id=>typeof id!=='string'))throw fail('Choose an audience and entry IDs.');
  const {device}=recordedDeviceContext(run);
  const event=(run.events||[]).find(item=>item.index===eventIndex&&item.type==='screenshot'),flowContext=memoryFlowsForScreen(run.memorySnapshot,{url,state:event?.screenState||event?.uiState||null,device,environmentId:run.memorySnapshot.environment?.id||run.environmentId});
  const allowed=new Set(accessForScreen(run.memorySnapshot,{audience,url,flows:flowContext.flows}).map(entry=>entry.id));if(entryIds.some(id=>!allowed.has(id)))throw fail('An entry is not available to this role on this screen.',400,'MEMORY_ACCESS_DENIED');
  const result={id:randomUUID(),runId,snapshotId:run.memorySnapshotId||run.memorySnapshot.id,audience,url:safeUrl(url),entryIds:[...new Set(entryIds)],eventIndex,flowContext,at:now()};db.prepare('INSERT INTO memory_access VALUES(?,?,?,?,?)').run(result.id,runId,result.snapshotId,json(result),result.at);return result;
 }
 const accessLog=runId=>db.prepare('SELECT data FROM memory_access WHERE run_id=? ORDER BY created_at,id').all(runId).map(row=>parse(row.data));
 return {create,get,list,versions,update,archive,restore,resolveConflict,publishRun,publications,publicationFailures,resolveSnapshot,bindSnapshotBuild,buildIdentity:observedBuild,getSnapshot,accessForScreen,flowsForScreen:memoryFlowsForScreen,recordAccess,accessLog};
}
