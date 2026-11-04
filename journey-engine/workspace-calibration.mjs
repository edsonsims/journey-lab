import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { WorkspaceError } from './workspace-store.mjs';
import { redactText } from './workspace-execution.mjs';
import { copyBrowserConfiguration, networkConditionsMatch } from './browser-device.mjs';

const now=()=>new Date().toISOString(),json=JSON.stringify,parse=JSON.parse,copy=structuredClone;
const hash=value=>createHash('sha256').update(json(value)).digest('hex');
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const failure=(message,status=400,code='INVALID_CALIBRATION')=>new WorkspaceError(message,status,code);
const text=(value,max=2000)=>typeof value==='string'?redactText(value.trim()).slice(0,max):'';
const date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const metricKinds=['goal_start','goal_complete','error','retry','backtrack','path_choice','abandonment'];
const journeyOutcomes=['goal_reached','obstacle_observed','inconclusive'];
const sessionKey=(projectId,value)=>/^s_[a-f0-9]{24}$/.test(value)?value:`s_${hash([projectId,value]).slice(0,24)}`;
function screenIdentity(value){
 if(value===undefined||value===null||value==='')return null;
 if(typeof value!=='string')throw failure('Screen identifiers must be text.');
 const raw=value.trim();
 if(/^[a-z][a-z0-9+.-]*:/i.test(raw)){
  let url;try{url=new URL(raw);}catch{throw failure('Screen URLs must be valid HTTP or HTTPS URLs.');}
  if(!['http:','https:'].includes(url.protocol))throw failure('Screen URLs must use HTTP or HTTPS.');
  return text(url.origin+url.pathname,500);
 }
 return text(raw.split(/[?#]/,1)[0],500)||null;
}
const supportedSynthetic=rule=>object(rule)&&['outcome','action_label','screen','event_type'].includes(rule.type)&&Boolean(text(rule.value,200))&&(rule.type!=='outcome'||journeyOutcomes.includes(rule.value));
const fields=['context','skills','constraints','expectations','priorities','decision'];
const controlsFields=['role','context','mission','initialKnowledge','knowledge','constraints','skills','decision','resources','expectations','priorities','successCriteria','stopCriteria','continuity','deviceIds','primaryDeviceId','networkProfileId','viewport'];
const busyStates=['running','cancelling','adopting'];
const numeric=(value,defaultValue,min,max,key)=>{const number=value??defaultValue;if(!Number.isInteger(number)||number<min||number>max)throw failure(`${key} must be an integer from ${min} to ${max}.`);return number;};
const cohort=value=>{if(!object(value))return {};const entries=Object.entries(value);if(entries.length>12||entries.some(([key,v])=>!/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(key)||/email|name|phone|address|secret|token|cookie|password/i.test(key)||!['string','number','boolean'].includes(typeof v)))throw failure('Cohorts must contain up to twelve non-identifying observed attributes.');return Object.fromEntries(entries.map(([key,value])=>[key,typeof value==='string'?text(value,120):value]));};
function interval(n,d){if(!d)return null;const z=1.96,p=n/d,k=1+z*z/d,mid=(p+z*z/(2*d))/k,width=z*Math.sqrt((p*(1-p)+z*z/(4*d))/d)/k;return {low:Math.max(0,mid-width),high:Math.min(1,mid+width),level:0.95,method:'Wilson interval'};}
const counts=(n,d)=>({numerator:n,denominator:d,rate:d?n/d:null,interval:interval(n,d)});
// Screen names are comparable only through an exact identity or an authored alias.
// A full-URL target stays origin-scoped unless that exact URL is explicitly aliased.
function matchScreen(observed,target,screenMap={}){
 const identify=value=>{try{return screenIdentity(value);}catch{return null;}};
 const actual=identify(observed),wanted=identify(target);
 if(!actual||!wanted)return null;
 const own=(key)=>Object.prototype.hasOwnProperty.call(screenMap,key),absolute=value=>/^https?:\/\//.test(value);
 if(absolute(wanted)&&!own(wanted))return absolute(actual)?actual===wanted:null;
 const targetIdentity=own(wanted)?identify(screenMap[wanted]):wanted;if(!targetIdentity)return null;
 let actualIdentity=actual,mapped=false;
 if(own(actual)){actualIdentity=identify(screenMap[actual]);mapped=true;}
 else if(absolute(actual)){const path=new URL(actual).pathname;if(own(path)){actualIdentity=identify(screenMap[path]);mapped=true;}else actualIdentity=path;}
 if(!actualIdentity)return null;if(actualIdentity===targetIdentity)return true;
 if(mapped)return false;
 if(targetIdentity.startsWith('/')&&actualIdentity.startsWith('/'))return false;
 if(Object.values(screenMap).some(value=>identify(value)===actualIdentity))return false;
 return null;
}
const anyObserved=values=>values.some(value=>value===true)?true:!values.length||values.some(value=>value===null)?null:false;
const realScreenTarget=metric=>metric?.realScreen||(metric?.synthetic?.type==='screen'?metric.synthetic.value:null);
function matchRealEvent(event,metric,screenMap){
 if(!metric?.realEvent)return null;if(event.event!==metric.realEvent)return false;
 const target=realScreenTarget(metric);return target?matchScreen(event.screen,target,screenMap):true;
}
function aggregationFor(metric){
 const rule=metric?.aggregation;
 if(metric?.kind==='retry')return rule?.type==='repeat'&&Number.isInteger(rule.minCount)&&rule.minCount>=2&&rule.minCount<=20?rule:null;
 if(metric?.kind==='backtrack')return rule?.type==='backtrack'?rule:null;
 return !rule||rule.type==='any_event'?{type:'any_event'}:null;
}
function supportedMetric(metric){
 const rule=aggregationFor(metric);return Boolean(metric?.realEvent&&supportedSynthetic(metric.synthetic)&&rule&&
  (rule.type!=='repeat'||['action_label','event_type'].includes(metric.synthetic.type))&&
  (rule.type!=='backtrack'||metric.synthetic.type==='event_type'));
}
function repeated(results,minCount,complete){
 if(results.filter(value=>value===true).length>=minCount)return true;
 return !complete||results.some(value=>value===null)?null:false;
}
function canonicalSequenceScreen(value,map){
 let identity;try{identity=screenIdentity(value);}catch{return null;}if(!identity)return null;
 const own=key=>Object.prototype.hasOwnProperty.call(map,key);let alias;
 if(own(identity))alias=map[identity];else if(/^https?:\/\//.test(identity)&&own(new URL(identity).pathname))alias=map[new URL(identity).pathname];
 if(alias!==undefined){try{const normalized=screenIdentity(alias);return normalized?`alias:${normalized}`:null;}catch{return null;}}
 if(identity.startsWith('/')||/^https?:\/\//.test(identity))return `exact:${identity}`;
 return Object.values(map).includes(identity)?`alias:${identity}`:null;
}
function backtracked(entries,map,complete,target=null){
 if(!entries.length)return null;const trail=[];let uncertain=false,previous=null;
 for(const entry of entries){
  const identity=canonicalSequenceScreen(entry.screen,map);
  if(!identity){uncertain=true;trail.length=0;previous=null;continue;}
  if(previous&&entry.at&&previous.at===entry.at&&previous.identity!==identity){uncertain=true;trail.length=0;previous={identity,at:entry.at};continue;}
  previous={identity,at:entry.at||null};
  if(trail.at(-1)?.identity===identity)continue;trail.push({identity,screen:entry.screen});if(trail.length>3)trail.shift();
  if(trail.length===3&&trail[0].identity===trail[2].identity&&trail[0].identity!==trail[1].identity){
   const matches=target?matchScreen(trail[0].screen,target,map):true;if(matches===true)return true;if(matches===null)uncertain=true;
  }
 }
 return uncertain||!complete?null:false;
}
function matchRealSession(session,metric,screenMap){
 if(!supportedMetric(metric))return null;const matching=session.events.filter(event=>event.event===metric.realEvent),rule=aggregationFor(metric);
 if(rule.type==='backtrack')return backtracked(matching.map(event=>({screen:event.screen,at:event.at})),screenMap,session.ended,metric.realScreen||null);
 const results=matching.map(event=>matchRealEvent(event,metric,screenMap));
 if(rule.type==='repeat')return repeated(results,rule.minCount,session.ended);
 return matching.length?anyObserved(results):false;
}
function syntheticEventMatch(event,rule){
 if(rule.type==='event_type')return typeof event.type==='string'?event.type===rule.value:null;
 if(event.type!=='action')return false;
 const labels=[event.click?.target?.label,event.click?.target?.text,event.click?.requestedLabel,event.action?.label].filter(label=>typeof label==='string'&&label.length);
 return labels.length?labels.includes(rule.value):null;
}
function matchSynthetic(run,metric,screenMap){
 if(!supportedMetric(metric))return null;const rule=metric.synthetic,aggregation=aggregationFor(metric),events=Array.isArray(run.events)?run.events:null;
 if(aggregation.type==='backtrack')return events?backtracked(events.filter(event=>event.type===rule.value).map(event=>({screen:event.url})),screenMap,['finished','completed'].includes(run.status),metric.realScreen||null):null;
 if(aggregation.type==='repeat')return events?.length?repeated(events.map(event=>{const matched=syntheticEventMatch(event,rule);return matched===true&&metric.realScreen?matchScreen(event.url,metric.realScreen,screenMap):matched;}),aggregation.minCount,['finished','completed'].includes(run.status)):null;
 if(rule.type==='outcome'){const outcome=run.finding?.outcome||run.outcome;return journeyOutcomes.includes(outcome)?outcome===rule.value:null;}
 if(rule.type==='action_label')return events?.some(event=>syntheticEventMatch(event,rule)===true)??null;
 if(rule.type==='event_type')return events?.some(event=>event.type===rule.value)??null;
 if(rule.type==='screen')return anyObserved((events||[]).filter(event=>event.url).map(event=>matchScreen(event.url,rule.value,screenMap)));
 return null;
}

export function createWorkspaceCalibration({root,store,proposeCandidate,executeTrial,adoptCandidate}={}){
 if(!store)throw failure('Calibration needs a workspace store.');root=resolve(root||join(store.root,'calibration'));mkdirSync(root,{recursive:true});
 const db=new DatabaseSync(join(root,'calibration.sqlite'));db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS calibration_entities(kind TEXT,id TEXT,project_id TEXT,current_version INTEGER,archived INTEGER,created_at TEXT,updated_at TEXT,PRIMARY KEY(kind,id));
 CREATE TABLE IF NOT EXISTS calibration_versions(kind TEXT,id TEXT,version INTEGER,version_id TEXT,data TEXT,created_at TEXT,PRIMARY KEY(kind,id,version));
 CREATE TABLE IF NOT EXISTS calibration_studies(id TEXT PRIMARY KEY,project_id TEXT,version INTEGER,data TEXT,updated_at TEXT);
 CREATE TABLE IF NOT EXISTS calibration_study_versions(id TEXT,version INTEGER,data TEXT,created_at TEXT,PRIMARY KEY(id,version));`);
 const jobs=new Map(),controllers=new Map();
 function canonicalEnvironment(id,version){const entity=store.resolveConfiguredEnvironment?.(id,version??undefined);return entity?{id:entity.id,version:entity.version,name:entity.name,versionId:entity.versionId}:{id,version};}
 function matchingEnvironment(run,environment){const a=canonicalEnvironment(run.environmentId,run.environmentVersion),b=canonicalEnvironment(environment.id,environment.version);return a.id===b.id&&a.version===b.version;}
 const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}};
 function stale(record,input){if(input.projectId&&record&&record.projectId!==input.projectId)throw failure('Calibration data belongs to another app.',400,'PROJECT_MISMATCH');if(input.expectedVersion!==undefined&&input.expectedVersion!==(record?.version||0))throw failure('This calibration record changed. Reload before saving.',409,'VERSION_CONFLICT');}
 function getEntity(kind,id,version){const row=db.prepare('SELECT * FROM calibration_entities WHERE kind=? AND id=?').get(kind,id);if(!row)return null;const value=db.prepare('SELECT * FROM calibration_versions WHERE kind=? AND id=? AND version=?').get(kind,id,version??row.current_version);return value?{...parse(value.data),id,projectId:row.project_id,version:value.version,versionId:value.version_id,archived:Boolean(row.archived),createdAt:row.created_at,updatedAt:row.updated_at,versionCreatedAt:value.created_at}:null;}
 function listEntities(kind,projectId){store.requireProject(projectId);return db.prepare('SELECT id FROM calibration_entities WHERE kind=? AND project_id=? ORDER BY updated_at DESC,id').all(kind,projectId).map(row=>getEntity(kind,row.id));}
 function versions(kind,id){if(!getEntity(kind,id))throw failure('Calibration record not found.',404,'NOT_FOUND');return db.prepare('SELECT version FROM calibration_versions WHERE kind=? AND id=? ORDER BY version DESC').all(kind,id).map(row=>getEntity(kind,id,row.version));}
 function saveEntity(kind,input,id){return transaction(()=>{const old=id?getEntity(kind,id):null;if(id&&!old)throw failure('Calibration record not found.',404,'NOT_FOUND');stale(old,input);const projectId=input.projectId||old?.projectId;store.requireProject(projectId);const merged={...old,...input},name=text(merged.name,120);if(!name)throw failure('A name is required.');let data;
  if(kind==='dataset'){
   if(!['fixture','real_import'].includes(merged.source?.kind)||!text(merged.source?.label))throw failure('Identify this local import as a fixture or real_import with its source label.');
   if(!Array.isArray(merged.events)||!merged.events.length||merged.events.length>5000)throw failure('Import between one and 5,000 analytics events.');
   const events=merged.events.map((event,index)=>{if(!object(event)||!text(event.sessionId,300)||!text(event.event,120)||!date(event.at)||!text(event.environmentId,200)||!text(event.buildId,200)||!['human','synthetic','unknown'].includes(event.traffic))throw failure(`Event ${index+1} needs session, event, time, environment, build and explicit traffic type.`);return {id:`event-${index}`,sessionId:sessionKey(projectId,event.sessionId),event:text(event.event,120),at:date(event.at),screen:screenIdentity(event.screen),environmentId:text(event.environmentId,200),buildId:text(event.buildId,200),cohort:cohort(event.cohort),traffic:event.traffic,sessionEnded:event.sessionEnded===true};});
   const unique=new Set();for(const event of events){const {id,...identity}=event;const key=hash(identity);if(unique.has(key))throw failure('The import contains duplicate events. Remove duplicates before importing.');unique.add(key);}
   data={name,source:{kind:merged.source.kind,label:text(merged.source.label,500),provider:text(merged.source.provider,100)||null,importType:'local-read-only-import'},events,sessionCount:new Set(events.map(event=>event.sessionId)).size,eventCount:events.length,contentHash:hash(events),externalAcceptance:merged.source.kind==='fixture'?'real_data_required':'imported_data_not_live_integration',observedFrom:events.map(event=>event.at).sort()[0],observedTo:events.map(event=>event.at).sort().at(-1)};
  }else{
   if(!Array.isArray(merged.metrics)||!merged.metrics.length||merged.metrics.length>12)throw failure('Define between one and twelve observable behavior metrics.');
   const ids=new Set(),metrics=merged.metrics.map(metric=>{const id=text(metric.id,80);if(!id||ids.has(id)||!metricKinds.includes(metric.kind))throw failure('Metrics need unique IDs and supported behavior kinds.');ids.add(id);const synthetic=metric.synthetic||null;if(synthetic&&!supportedSynthetic(synthetic))throw failure('Choose a supported exact outcome (goal_reached, obstacle_observed or inconclusive), action label, screen or event type for the synthetic mapping.');if(metric.denominator&&!['sessions','started_sessions'].includes(metric.denominator))throw failure('Metric denominator must be sessions or started_sessions.');const expected=metric.kind==='retry'?'repeat':metric.kind==='backtrack'?'backtrack':'any_event',aggregation=metric.aggregation||{type:expected,...(expected==='repeat'?{minCount:2}:{})};if(aggregation.type!==expected)throw failure('Retry needs a repeated-event rule; backtrack needs an A→B→A sequence; ordinary metrics use any event.');const normalizedAggregation=expected==='repeat'?{type:expected,minCount:numeric(aggregation.minCount,2,2,20,'Retry minimum count')}:{type:expected};if(synthetic&&expected==='repeat'&&!['action_label','event_type'].includes(synthetic.type))throw failure('Retry needs an exact action label or event type.');if(synthetic&&expected==='backtrack'&&synthetic.type!=='event_type')throw failure('Backtracking needs an ordered screen-bearing event type, such as screenshot.');return {id,label:text(metric.label,160)||id,kind:metric.kind,aggregation:normalizedAggregation,realEvent:text(metric.realEvent,120)||null,realScreen:screenIdentity(metric.realScreen),synthetic:synthetic?{type:synthetic.type,value:text(synthetic.value,200)}:null,denominator:metric.denominator||'sessions'};});
   const screenMap=object(merged.screenMap)?Object.fromEntries(Object.entries(merged.screenMap).map(([key,value])=>[screenIdentity(key),text(value,200)])):{};if(Object.keys(screenMap).length>100)throw failure('Screen mapping supports up to one hundred screens.');
   data={name,metrics,screenMap,syntheticExclusions:{sessionIds:Array.isArray(merged.syntheticExclusions?.sessionIds)?merged.syntheticExclusions.sessionIds.filter(id=>typeof id==='string'&&id.trim()).map(id=>sessionKey(projectId,id)).slice(0,500):[],eventNames:Array.isArray(merged.syntheticExclusions?.eventNames)?merged.syntheticExclusions.eventNames.map(name=>text(name,120)).slice(0,50):[]}};
  }
  const next=id||randomUUID(),version=(old?.version||0)+1,versionId=randomUUID(),stamp=now();db.prepare('INSERT INTO calibration_versions VALUES(?,?,?,?,?,?)').run(kind,next,version,versionId,json(data),stamp);db.prepare('INSERT INTO calibration_entities VALUES(?,?,?,?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET current_version=excluded.current_version,updated_at=excluded.updated_at').run(kind,next,projectId,version,old?.archived?1:0,old?.createdAt||stamp,stamp);return getEntity(kind,next);
 });}
 function baselines(projectId){store.requireProject(projectId);return store.listRuns({projectId,limit:200}).filter(run=>['finished','completed'].includes(run.status)).map(summary=>store.getRun(summary.id)).filter(run=>run&&run.integrityStatus!=='invalidated').map(run=>({id:run.id,name:run.name,status:run.status,createdAt:run.createdAt,personaId:run.personaId,personaVersion:run.personaVersion,personaVersionId:run.personaVersionId,charterId:run.charterId,charterVersion:run.charterVersion,charterVersionId:run.charterVersionId,environmentId:canonicalEnvironment(run.environmentId,run.environmentVersion).id,environmentVersion:canonicalEnvironment(run.environmentId,run.environmentVersion).version,configuredEnvironment:run.configuredEnvironment||null,environmentKind:run.environmentKind||'configured',recordedEnvironmentId:run.environmentId,recordedEnvironmentVersion:run.environmentVersion,executionInstance:run.executionInstance||null,model:run.model,executionPolicy:run.executionPolicy||null,buildId:store.memory?.buildIdentity?.(run)||run.buildId||null,outcome:run.finding?.outcome||run.outcome||null,sourceIdentity:run.sourceIdentity||null}));}
 function getStudy(id){const row=db.prepare('SELECT data FROM calibration_studies WHERE id=?').get(id);return row?parse(row.data):null;}
 function persist(study,event){const value={...study,version:(getStudy(study.id)?.version||0)+1,updatedAt:now(),history:[...(study.history||[]),...(event?[{at:now(),...event}]:[])]};transaction(()=>{db.prepare('INSERT INTO calibration_studies VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,data=excluded.data,updated_at=excluded.updated_at').run(value.id,value.projectId,value.version,json(value),value.updatedAt);db.prepare('INSERT INTO calibration_study_versions VALUES(?,?,?,?)').run(value.id,value.version,json(value),value.updatedAt);});return value;}
 function studyOrThrow(id){const value=getStudy(id);if(!value)throw failure('Calibration study not found.',404,'NOT_FOUND');return value;}
 function realSessions(study){
  const grouped=new Map();for(const event of study.datasetSnapshot.events){if(!grouped.has(event.sessionId))grouped.set(event.sessionId,[]);grouped.get(event.sessionId).push(event);}
  const sessions=[],exclusions={synthetic:0,unknownTraffic:0,build:0,environment:0,cohort:0,timeWindow:0,inconsistent:0},rules=study.mappingSnapshot.syntheticExclusions;
  for(const [id,events]of grouped){
   if(events.some(event=>event.traffic==='synthetic'||rules.sessionIds.includes(id)||rules.eventNames.includes(event.event))){exclusions.synthetic++;continue;}
   if(events.some(event=>event.traffic!=='human')){exclusions.unknownTraffic++;continue;}
   if(new Set(events.map(event=>event.buildId)).size!==1||new Set(events.map(event=>event.environmentId)).size!==1){exclusions.inconsistent++;continue;}
   if(events[0].buildId!==study.controls.buildId){exclusions.build++;continue;}if(canonicalEnvironment(events[0].environmentId).id!==canonicalEnvironment(study.controls.environment.id,study.controls.environment.version).id){exclusions.environment++;continue;}
   if(events.some(event=>Object.entries(study.controls.cohort).some(([key,value])=>event.cohort[key]!==value))){exclusions.cohort++;continue;}
   if(events.some(event=>event.at<study.controls.timeWindow.from||event.at>study.controls.timeWindow.to)){exclusions.timeWindow++;continue;}
   sessions.push({id,events:[...events].sort((a,b)=>a.at.localeCompare(b.at)),ended:events.some(event=>event.sessionEnded)});
  }return {sessions,exclusions,totalSessions:grouped.size};
 }
 function createStudy(input){
  store.requireProject(input.projectId);const dataset=getEntity('dataset',input.datasetId,input.datasetVersion),mapping=getEntity('mapping',input.mappingId,input.mappingVersion);
  const persona=store.getEntity('persona',input.personaId),charter=store.getEntity('charter',input.charterId),environment=store.getEntity('environment',input.environmentId);
  for(const item of [dataset,mapping,persona,charter,environment])if(!item||item.projectId!==input.projectId||item.archived)throw failure('Select active dataset, mapping, persona, mission and environment versions from the same app.',400,'INVALID_REFERENCE');
  if(environment.lifecycle==='temporary')throw failure('Choose a configured environment.',400,'INVALID_REFERENCE');
  const buildId=text(input.buildId,200),timeWindow={from:date(input.timeWindow?.from),to:date(input.timeWindow?.to)};if(!buildId||!timeWindow.from||!timeWindow.to||timeWindow.from>timeWindow.to)throw failure('Choose a known product build and a valid observation window.');
  const c=cohort(input.cohort),personaCohort=cohort(input.personaCohort);if(Object.entries(c).some(([key,value])=>personaCohort[key]!==value))throw failure('Declare matching observed cohort attributes for the selected persona; uncollected constraints cannot be inferred.',400,'COHORT_NOT_COMPARABLE');
  const provided=input.limits||{},limits={maxCandidates:numeric(provided.maxCandidates,1,1,5,'Candidate limit'),maxSessions:numeric(provided.maxSessions,4,4,24,'Session limit'),maxTokens:numeric(provided.maxTokens,200000,1000,2000000,'Token limit'),maxDurationMs:numeric(provided.maxDurationMs,600000,30000,1800000,'Study time limit'),sessionMaxSteps:numeric(provided.sessionMaxSteps,12,1,30,'Session action limit'),sessionMaxTokens:numeric(provided.sessionMaxTokens,50000,1000,500000,'Session token limit'),sessionMaxDurationMs:numeric(provided.sessionMaxDurationMs,180000,30000,600000,'Session time limit'),sessionsPerPhase:numeric(provided.sessionsPerPhase,2,2,6,'Repeated sessions per phase')};
  if(limits.maxSessions<limits.sessionsPerPhase*2)throw failure('The session limit must allow repeated development and held-out sessions.');
  const runIds=Array.isArray(input.runIds)?[...new Set(input.runIds)]:[];if(runIds.length>100)throw failure('Use at most one hundred baseline journeys.');
  const baselineRuns=runIds.map(id=>{const run=store.getRun(id);if(!run||run.projectId!==input.projectId||run.personaId!==persona.id)throw failure('Baseline journeys must use this app and persona.',400,'INVALID_REFERENCE');return copy(run);});
  const baseline=baselineRuns.find(run=>run.personaVersionId===persona.versionId&&run.charterVersionId===charter.versionId&&matchingEnvironment(run,environment)&&(store.memory?.buildIdentity?.(run)||run.buildId)===buildId);
  const browserConfiguration=baseline?{viewport:copy(baseline.viewport||baseline.personaSnapshot?.viewport||{width:1280,height:800}),...copyBrowserConfiguration(baseline)}:store.resolveBrowserConfiguration?.(persona)||{viewport:copy(persona.viewport||environment.viewport||{width:1280,height:800})};
  const tolerance=input.tolerance??0.1;if(typeof tolerance!=='number'||tolerance<0||tolerance>0.5)throw failure('Agreement tolerance must be between zero and 0.5.');
  const study={id:randomUUID(),projectId:input.projectId,name:text(input.name,160)||'Behavior calibration',status:'draft',createdAt:now(),controls:{persona,environment,charter,browserConfiguration,buildId,cohort:c,personaCohort,timeWindow,model:'muse-wonder-1.0'},datasetSnapshot:dataset,mappingSnapshot:mapping,baselineRuns,limits,tolerance,minSessions:numeric(input.minSessions,5,2,100,'Minimum sessions'),maxAgeDays:numeric(input.maxAgeDays,30,1,365,'Reference freshness window'),usage:{candidates:0,sessions:0,tokens:0,elapsedMs:0},candidates:[],comparisons:[],adoption:null,history:[],externalAcceptance:dataset.source.kind==='fixture'?'real_data_required':'imported_reference_only'};
  const eligible=realSessions(study).sessions.map(session=>session.id),ordered=[...eligible].sort((a,b)=>hash(a).localeCompare(hash(b))),cut=Math.max(1,Math.floor(ordered.length*0.7));
  const split=input.split||{developmentSessionIds:ordered.slice(0,cut),validationSessionIds:ordered.slice(cut)};
  if(!Array.isArray(split.developmentSessionIds)||!Array.isArray(split.validationSessionIds)||split.developmentSessionIds.some(id=>!eligible.includes(id))||split.validationSessionIds.some(id=>!eligible.includes(id))||new Set([...split.developmentSessionIds,...split.validationSessionIds]).size!==split.developmentSessionIds.length+split.validationSessionIds.length)throw failure('Development and held-out references must be disjoint eligible session IDs.',400,'INVALID_HOLDOUT');
  study.split=copy(split);return persist(study,{type:'created',datasetVersion:dataset.version,mappingVersion:mapping.version});
 }
 function compareRuns(study,runs,phase='development'){
  if(!['development','validation'].includes(phase))throw failure('Choose development or validation.');
  const real=realSessions(study),ids=new Set(study.split[`${phase}SessionIds`]),sessions=real.sessions.filter(session=>ids.has(session.id)),included=[],excluded=[];
  for(const run of runs){const build=store.memory?.buildIdentity?.(run)||run.buildId;let reason=null;if(run.projectId!==study.projectId)reason='project_mismatch';else if(!matchingEnvironment(run,study.controls.environment))reason='environment_mismatch';else if(build!==study.controls.buildId)reason='build_mismatch';else if(run.personaVersionId!==study.controls.persona.versionId)reason='persona_version_mismatch';else if(run.charterVersionId!==study.controls.charter.versionId)reason='charter_version_mismatch';else if(run.model!==study.controls.model)reason='model_mismatch';else if(study.controls.browserConfiguration&&!networkConditionsMatch(run,study.controls.browserConfiguration))reason='browser_conditions_mismatch';else if((run.executionPolicy?.maxSteps??run.maxSteps)!==study.limits.sessionMaxSteps||(run.executionPolicy?.maxTokens??run.environmentSnapshot?.maxTokens)!==study.limits.sessionMaxTokens||(run.executionPolicy?.maxDurationMs??run.environmentSnapshot?.maxDurationMs)!==study.limits.sessionMaxDurationMs)reason='execution_limits_mismatch';else if(!['finished','completed'].includes(run.status)||run.integrityStatus==='invalidated')reason='incomplete_journey';if(reason)excluded.push({runId:run.id,reason});else included.push(run);}
  const start=study.mappingSnapshot.metrics.find(metric=>metric.kind==='goal_start'),complete=study.mappingSnapshot.metrics.find(metric=>metric.kind==='goal_complete'),screenMap=study.mappingSnapshot.screenMap||{},referenceStale=Date.now()-Date.parse(study.controls.timeWindow.to)>study.maxAgeDays*86400000;
  const unknownCounts=denominator=>({numerator:null,denominator,rate:null,interval:null});
  const metrics=study.mappingSnapshot.metrics.map(metric=>{
   let reason=null,status=null;const realStarted=session=>matchRealSession(session,start,screenMap),syntheticStarted=run=>matchSynthetic(run,start,screenMap);
   const restricted=metric.denominator==='started_sessions',unknownReferenceStart=restricted?sessions.filter(session=>realStarted(session)===null).length:0,unknownSyntheticStart=restricted?included.filter(run=>syntheticStarted(run)===null).length:0;
   const reference=restricted?sessions.filter(session=>realStarted(session)===true):sessions,synthetic=restricted?included.filter(run=>syntheticStarted(run)===true):included;
   const realMatched=session=>{
    if(metric.kind!=='abandonment')return matchRealSession(session,metric,screenMap);
    if(!session.ended)return null;const completed=matchRealSession(session,complete,screenMap);if(completed===true)return false;if(completed===null)return null;
    return session.events.length?matchRealEvent(session.events.at(-1),metric,screenMap):null;
   };
   const realResults=reference.map(realMatched),syntheticResults=synthetic.map(run=>matchSynthetic(run,metric,screenMap));
   let actual=counts(realResults.filter(value=>value===true).length,reference.length),simulated=counts(syntheticResults.filter(value=>value===true).length,synthetic.length);
   const unknownReference=realResults.filter(value=>value===null).length,unknownSynthetic=syntheticResults.filter(value=>value===null).length;
   if(unknownReference)actual=unknownCounts(reference.length);if(unknownSynthetic)simulated=unknownCounts(synthetic.length);
   if(!supportedMetric(metric)||restricted&&!supportedMetric(start)||metric.kind==='abandonment'&&!supportedMetric(complete)){status='unmapped';reason='A required event mapping or grounded sequence rule is missing or unsupported.';actual=unknownCounts(null);simulated=unknownCounts(null);}
   else if(!real.sessions.length||excluded.length&&!included.length){status='not_comparable';reason='No compatible exposed reference cohort or product-build journeys.';}
   else if(unknownReferenceStart||unknownSyntheticStart){status='not_comparable';reason='A goal-start screen or signal is missing or unmapped; the started-session denominator is unknown.';if(unknownReferenceStart)actual=unknownCounts(null);if(unknownSyntheticStart)simulated=unknownCounts(null);}
   else if(metric.kind==='abandonment'&&sessions.some(session=>!session.ended)){status='not_comparable';reason='Abandonment requires explicitly ended reference sessions.';actual=unknownCounts(reference.length);}
   else if(unknownReference){status='not_comparable';reason='Reference events do not establish the mapped screen or behavior. Add exact screen identities or declared aliases.';actual=unknownCounts(reference.length);}
   else if(unknownSynthetic){status='not_comparable';reason='The recorded journeys do not establish this mapped screen or behavior.';simulated=unknownCounts(synthetic.length);}
   else if(referenceStale){status='stale';reason='The reference observation window is outside the freshness limit.';}
   else if(actual.denominator<study.minSessions||simulated.denominator<2){status='insufficient_data';reason='More compatible reference and repeated synthetic sessions are needed.';}
   else status=Math.abs(actual.rate-simulated.rate)<=study.tolerance?'agreement':'disagreement';
   return {id:metric.id,label:metric.label,kind:metric.kind,definition:{aggregation:aggregationFor(metric),sequenceSemantics:metric.kind==='retry'?'Repeated exact action/event; observed repetition alone does not prove user intent.':metric.kind==='backtrack'?'Consecutive distinct canonical screens A→B→A; repeated frames are collapsed.':'Any mapped occurrence within the eligible session.',realEvent:metric.realEvent,realScreen:metric.realScreen||null,screenTarget:realScreenTarget(metric),screenMatching:'exact_or_declared_alias',synthetic:metric.synthetic,denominator:metric.denominator},status,reason,reference:actual,synthetic:simulated,delta:actual.rate==null||simulated.rate==null?null:simulated.rate-actual.rate,matchingQuality:status==='not_comparable'?'unmatched':'exact-build-and-declared-cohort',uncertainty:'Independent session counts; Wilson intervals describe rate uncertainty, not persona realism.'};
  });
  const comparable=metrics.filter(metric=>['agreement','disagreement'].includes(metric.status)),meanRateGap=comparable.length?comparable.reduce((sum,metric)=>sum+Math.abs(metric.delta),0)/comparable.length:null;
  return {id:randomUUID(),phase,createdAt:now(),datasetId:study.datasetSnapshot.id,datasetVersion:study.datasetSnapshot.version,mappingId:study.mappingSnapshot.id,mappingVersion:study.mappingSnapshot.version,buildId:study.controls.buildId,timeWindow:study.controls.timeWindow,referenceKind:study.datasetSnapshot.source.kind,referenceSessions:sessions.length,syntheticSessions:included.length,exclusions:{reference:real.exclusions,synthetic:excluded},metrics,meanRateGap,comparableMetrics:comparable.length,runIds:runs.map(run=>run.id),limitations:['Behavioral agreement only; no emotional inference or business uplift.','Declared cohort attributes do not establish uncollected constraints.','Import is not a live analytics integration.']};
 }
 function compare(id,{phase='development',expectedVersion}={}){const study=studyOrThrow(id);stale(study,{expectedVersion});if(busyStates.includes(study.status))throw failure('Wait for the calibration job to finish.',409,'STUDY_BUSY');const result=compareRuns(study,study.baselineRuns,phase);return {study:persist({...study,comparisons:[...study.comparisons,result]},{type:'compared',resultId:result.id,phase}),comparison:result};}
 function budget(study,started){const elapsed=study.usage.elapsedMs+(started?Date.now()-started:0);return {maxTokens:Math.max(0,study.limits.maxTokens-study.usage.tokens),maxSessions:Math.max(0,study.limits.maxSessions-study.usage.sessions),maxCandidates:Math.max(0,study.limits.maxCandidates-study.usage.candidates),maxDurationMs:Math.max(0,study.limits.maxDurationMs-elapsed),sessionMaxSteps:study.limits.sessionMaxSteps,sessionMaxTokens:Math.min(study.limits.sessionMaxTokens,Math.max(0,study.limits.maxTokens-study.usage.tokens)),sessionMaxDurationMs:Math.min(study.limits.sessionMaxDurationMs,Math.max(0,study.limits.maxDurationMs-elapsed))};}
 async function bounded(call,signal){signal.throwIfAborted();let abort;const aborted=new Promise((_,reject)=>{abort=()=>reject(signal.reason||failure('Calibration cancelled.',409,'CANCELLED'));signal.addEventListener('abort',abort,{once:true});});try{return await Promise.race([Promise.resolve().then(call),aborted]);}finally{signal.removeEventListener('abort',abort);}}
 function tokenCount(value){const tokens=value?.total_tokens;if(!Number.isInteger(tokens)||tokens<0)throw failure('Token usage is unavailable; the experiment stopped to preserve its budget.',409,'USAGE_UNAVAILABLE');return tokens;}
 function runtimeStudy(study){const baseline=study.baselineRuns.find(run=>(store.memory?.buildIdentity?.(run)||run.buildId)===study.controls.buildId&&run.personaVersionId===study.controls.persona.versionId&&run.charterVersionId===study.controls.charter.versionId&&matchingEnvironment(run,study.controls.environment)&&run.model===study.controls.model&&(!study.controls.browserConfiguration||networkConditionsMatch(run,study.controls.browserConfiguration)));return {id:study.id,projectId:study.projectId,name:study.name,controls:copy(study.controls),limits:copy(study.limits),memoryContext:baseline?{snapshot:copy(baseline.memorySnapshot||null),id:baseline.memorySnapshotId||null,baselineRunId:baseline.id,scenarioId:baseline.scenarioId||null}:null};}
 function candidateProposal(value){if(value?.adjustment?.kind!=='persona'||!object(value.adjustment.changes))throw failure('Only explicit persona-field adjustments are supported.',400,'INVALID_ADJUSTMENT');const changes=value.adjustment.changes,keys=Object.keys(changes);if(!keys.length||keys.some(key=>!fields.includes(key)||typeof changes[key]!=='string'||changes[key].length>6000))throw failure('Candidate changes must stay within declared persona context fields.',400,'INVALID_ADJUSTMENT');return {kind:'persona',changes:Object.fromEntries(keys.map(key=>[key,text(changes[key],6000)]))};}
 async function perform(id,controller){let study=studyOrThrow(id),started=Date.now(),timer=setTimeout(()=>controller.abort(failure('The calibration time budget was reached.',409,'TIME_BUDGET')),Math.max(1,study.limits.maxDurationMs-study.usage.elapsedMs));
  try{
   const baselineDevelopment=compareRuns(study,study.baselineRuns,'development'),baselineValidation=compareRuns(study,study.baselineRuns,'validation');
   study=persist({...study,baselineComparison:{development:baselineDevelopment,validation:baselineValidation}},{type:'baseline_frozen'});
   if(baselineDevelopment.comparableMetrics!==study.mappingSnapshot.metrics.length||baselineValidation.comparableMetrics!==study.mappingSnapshot.metrics.length)throw failure('Comparable repeated baseline journeys and separate development/held-out reference sessions are required.',409,'REFERENCE_NOT_COMPARABLE');
   while(study.usage.candidates<study.limits.maxCandidates){
    const remaining=budget(study,started);if(remaining.maxSessions<study.limits.sessionsPerPhase*2||remaining.maxTokens<1000||remaining.maxDurationMs<=0)throw failure('The finite study budget is exhausted.',409,'STUDY_BUDGET');
    study=persist({...study,usage:{...study.usage,candidates:study.usage.candidates+1},pendingProposal:{at:now()}},{type:'proposal_requested'});
    const proposal=await bounded(()=>proposeCandidate({study:runtimeStudy(study),candidateIndex:study.usage.candidates,developmentComparison:copy(baselineDevelopment),remainingBudget:remaining,signal:controller.signal}),controller.signal);
    study=persist({...study,pendingProposal:null,usage:{...study.usage,tokens:study.usage.tokens+tokenCount(proposal.usage)}},{type:'proposal_usage_recorded'});if(study.usage.tokens>study.limits.maxTokens)throw failure('The token budget was exhausted.',409,'TOKEN_BUDGET');
    const candidate={id:randomUUID(),version:1,createdAt:now(),adjustment:candidateProposal(proposal),rationale:text(proposal.rationale,4000),status:'testing',developmentRuns:[],validationRuns:[],result:null};
    study=persist({...study,candidates:[...study.candidates,candidate]},{type:'candidate_proposed',candidateId:candidate.id});
    for(const phase of ['development','validation'])for(let sessionIndex=0;sessionIndex<study.limits.sessionsPerPhase;sessionIndex++){
     const remaining=budget(study,started);if(remaining.maxSessions<=0||remaining.maxTokens<study.limits.sessionMaxTokens||remaining.maxDurationMs<study.limits.sessionMaxDurationMs)throw failure('The finite study budget is exhausted.',409,'STUDY_BUDGET');
     study=persist({...study,usage:{...study.usage,sessions:study.usage.sessions+1},pendingTrial:{candidateId:candidate.id,phase,sessionIndex,runId:null}},{type:'trial_requested',candidateId:candidate.id,phase,sessionIndex});
     const receipt=await bounded(()=>executeTrial({study:runtimeStudy(study),candidate:copy(candidate),phase,sessionIndex,remainingBudget:remaining,signal:controller.signal,onRunStarted:runId=>{const current=studyOrThrow(id);study=persist({...current,pendingTrial:{...current.pendingTrial,runId}},{type:'trial_started',runId});}}),controller.signal);
     const run=receipt?.runId&&store.getRun(receipt.runId);if(!run)throw failure('The experimental journey receipt is unavailable.',409,'TRIAL_RECEIPT_MISSING');
     const usage=Array.isArray(run.usage)&&run.usage.length?run.usage.reduce((sum,item)=>sum+tokenCount(item),0):tokenCount(receipt.usage);study=persist({...study,pendingTrial:null,usage:{...study.usage,tokens:study.usage.tokens+usage}},{type:'trial_usage_recorded',runId:run.id});
     const actual=run.personaSnapshot||run.persona,expected={...study.controls.persona,...candidate.adjustment.changes};
     if(run.projectId!==study.projectId||run.calibrationStudyId!==study.id||run.experimental!==true||run.experimentalCandidateId!==candidate.id||controlsFields.some(key=>json(actual?.[key])!==json(expected[key]))||run.charterVersionId!==study.controls.charter.versionId||run.model!==study.controls.model||(study.controls.browserConfiguration&&!networkConditionsMatch(run,study.controls.browserConfiguration)))throw failure('The trial did not preserve the frozen experiment controls.',409,'TRIAL_CONTROLS_CHANGED');
     candidate[`${phase}Runs`].push(copy(run));study=persist({...study,candidates:study.candidates.map(item=>item.id===candidate.id?copy(candidate):item)},{type:'trial_recorded',candidateId:candidate.id,phase,runId:run.id});
     if(study.usage.tokens>study.limits.maxTokens)throw failure('The token budget was exhausted.',409,'TOKEN_BUDGET');
    }
    const development=compareRuns(study,candidate.developmentRuns,'development'),validation=compareRuns(study,candidate.validationRuns,'validation');
    const comparable=development.comparableMetrics===study.mappingSnapshot.metrics.length&&validation.comparableMetrics===study.mappingSnapshot.metrics.length;
    const improved=comparable&&development.meanRateGap<baselineDevelopment.meanRateGap&&validation.meanRateGap<=baselineValidation.meanRateGap;
    const result={id:randomUUID(),candidateId:candidate.id,candidateVersion:candidate.version,createdAt:now(),development,validation,baselineDevelopmentId:baselineDevelopment.id,baselineValidationId:baselineValidation.id,status:improved?'eligible':'not_improved',acceptanceGate:study.externalAcceptance==='real_data_required'?'real_data_required':null};result.hash=hash(result);
    candidate.result=result;candidate.status=improved?'awaiting_review':'not_improved';study=persist({...study,candidates:study.candidates.map(item=>item.id===candidate.id?copy(candidate):item)},{type:'candidate_validated',candidateId:candidate.id,resultId:result.id});
   }
   study=persist({...study,status:study.candidates.some(item=>item.status==='awaiting_review')?'awaiting_review':'completed',usage:{...study.usage,elapsedMs:study.usage.elapsedMs+Date.now()-started},job:null},{type:'job_finished'});
  }catch(error){study=studyOrThrow(id);if(error.usage){try{const charged=tokenCount(error.usage);study=persist({...study,pendingProposal:null,pendingTrial:study.pendingTrial?{...study.pendingTrial,usageCharged:(study.pendingTrial.usageCharged||0)+charged}:null,usage:{...study.usage,tokens:study.usage.tokens+charged}},{type:'failed_request_usage_recorded'});}catch{study.usage.tokensUncertain=true;}}if(study.pendingTrial||study.pendingProposal||error.code==='USAGE_UNAVAILABLE')study.usage.tokensUncertain=true;const cancelled=controller.signal.aborted&&controller.signal.reason?.code!=='TIME_BUDGET',code=error.code||controller.signal.reason?.code||'CALIBRATION_FAILED';study=persist({...study,status:cancelled?'cancelled':['STUDY_BUDGET','TOKEN_BUDGET','TIME_BUDGET','CALIBRATION_BUDGET_EXHAUSTED'].includes(code)?'budget_exhausted':'failed',error:{code,message:error instanceof WorkspaceError?error.message:'Calibration stopped; recorded trials and results are retained.'},usage:{...study.usage,elapsedMs:study.usage.elapsedMs+Date.now()-started},job:null},{type:'job_stopped',code});}
  finally{clearTimeout(timer);controllers.delete(id);jobs.delete(id);}return study;
 }
 function start(id,input={}){let study=studyOrThrow(id);stale(study,input);if(jobs.size||busyStates.includes(study.status))throw failure('A calibration job is already active.',409,'STUDY_BUSY');if(study.usage.tokensUncertain)throw failure('Reconcile the interrupted trial usage before starting more experiments.',409,'BUDGET_UNCERTAIN');if(study.adoption)throw failure('An adopted study cannot run more candidates.',409,'STUDY_ADOPTED');if(typeof proposeCandidate!=='function'||typeof executeTrial!=='function')throw failure('Connect the bounded Meta calibration runtime before starting experiments.',503,'CALIBRATION_RUNTIME_REQUIRED');if(study.usage.candidates>=study.limits.maxCandidates||study.usage.sessions>=study.limits.maxSessions)throw failure('This study has used its finite candidate/session budget. Create a new study to change its limits.',409,'STUDY_BUDGET');
  study=persist({...study,status:'running',error:null,job:{id:randomUUID(),startedAt:now()}},{type:'job_started'});const controller=new AbortController();controllers.set(id,controller);const job=Promise.resolve().then(()=>perform(id,controller));jobs.set(id,job);return study;
 }
 function reconcile(id,input={}){let study=studyOrThrow(id);stale(study,input);if(jobs.has(id))throw failure('Wait for the active trial to finish.',409,'STUDY_BUSY');if(!study.usage.tokensUncertain)return study;const run=study.pendingTrial?.runId&&store.getRun(study.pendingTrial.runId);if(!run||!['finished','completed','cancelled','failed','blocked','incomplete'].includes(run.status))throw failure('The interrupted trial has no final usage receipt yet.',409,'USAGE_UNAVAILABLE');const tokens=Array.isArray(run.usage)&&run.usage.length?run.usage.reduce((sum,item)=>sum+tokenCount(item),0):!run.startedAt?0:null;if(tokens===null)throw failure('The started trial has no trustworthy token receipt.',409,'USAGE_UNAVAILABLE');return persist({...study,pendingTrial:null,usage:{...study.usage,tokens:study.usage.tokens+Math.max(0,tokens-(study.pendingTrial.usageCharged||0)),tokensUncertain:false}},{type:'interrupted_usage_reconciled',runId:run.id,tokens});}
 function cancel(id,input={}){const study=studyOrThrow(id);stale(study,input);const controller=controllers.get(id);if(!controller)return study;const value=persist({...study,status:'cancelling'},{type:'cancel_requested'});controller.abort(failure('Cancelled by the user.',409,'CANCELLED'));return value;}
 async function approve(id,input={}){let study=studyOrThrow(id);stale(study,input);if(jobs.has(id)||busyStates.includes(study.status))throw failure('Wait for the experiment to finish.',409,'STUDY_BUSY');const candidate=study.candidates.find(item=>item.id===input.candidateId),result=candidate?.result;
  if(!candidate||candidate.version!==input.candidateVersion||result?.id!==input.resultId||result?.hash!==input.resultHash)throw failure('Approval must identify the exact candidate version and validation result.',409,'APPROVAL_MISMATCH');
  if(study.adoption)return study;if(result.status!=='eligible')throw failure('This candidate did not improve development agreement while retaining held-out behavior.',409,'VALIDATION_REQUIRED');
  if(result.acceptanceGate)throw failure('Import compatible real reference data before adopting a fixture-tested adjustment.',409,'REAL_REFERENCE_REQUIRED');
  if(Date.now()-Date.parse(study.controls.timeWindow.to)>study.maxAgeDays*86400000)throw failure('The reference observation window is now stale. Validate against fresh compatible data before adoption.',409,'STALE_REFERENCE');
  const currentEnvironment=store.getEntity('environment',study.controls.environment.id);if(!currentEnvironment||currentEnvironment.archived||currentEnvironment.version!==study.controls.environment.version)throw failure('The experiment environment changed after validation. Create a new study before adoption.',409,'CALIBRATION_ENVIRONMENT_CHANGED');
  if(typeof adoptCandidate!=='function')throw failure('The adoption runtime is not connected.',503,'ADOPTION_RUNTIME_REQUIRED');
  const idempotencyKey=`calibration:${study.id}:${candidate.id}:${result.id}`;study=persist({...study,status:'adopting',approvalIntent:{candidateId:candidate.id,candidateVersion:candidate.version,resultId:result.id,resultHash:result.hash,idempotencyKey,at:now()}},{type:'approval_requested'});
  try{const receipt=await adoptCandidate({study:runtimeStudy(study),candidate:copy(candidate),result:copy(result),idempotencyKey,expectedPersonaVersion:study.controls.persona.version});if(!receipt?.entityId||!Number.isInteger(receipt.version)||!receipt.versionId)throw failure('The adoption receipt is incomplete.',409,'ADOPTION_RECEIPT_REQUIRED');study=persist({...study,status:'adopted',adoption:{...study.approvalIntent,receipt,priorPersonaVersion:study.controls.persona.version,priorPersonaVersionId:study.controls.persona.versionId}},{type:'adopted',receipt});return study;}catch(error){persist({...study,status:'adoption_failed',error:{code:error.code||'ADOPTION_FAILED',message:error instanceof WorkspaceError?error.message:'Adoption needs reconciliation. The exact approval intent is retained.'}},{type:'adoption_failed'});throw error;}
 }
 for(const row of db.prepare('SELECT data FROM calibration_studies').all()){const study=parse(row.data);if(busyStates.includes(study.status)){const elapsed=study.job?.startedAt?Math.max(0,Date.now()-Date.parse(study.job.startedAt)):0;persist({...study,status:study.status==='adopting'?'adoption_interrupted':'interrupted',job:null,usage:{...study.usage,elapsedMs:study.usage.elapsedMs+elapsed,tokensUncertain:Boolean(study.pendingTrial||study.pendingProposal)||study.usage.tokensUncertain},error:{code:'INTERRUPTED',message:'The service stopped. Recorded trials, approvals and budgets are preserved.'}},{type:'recovered_interrupted'});}}
 return {db,root,baselines,getDataset:(id,version)=>getEntity('dataset',id,version),listDatasets:projectId=>listEntities('dataset',projectId),saveDataset:(input,id)=>saveEntity('dataset',input,id),getMapping:(id,version)=>getEntity('mapping',id,version),listMappings:projectId=>listEntities('mapping',projectId),saveMapping:(input,id)=>saveEntity('mapping',input,id),versions,createStudy,getStudy,listStudies:projectId=>{store.requireProject(projectId);return db.prepare('SELECT data FROM calibration_studies WHERE project_id=? ORDER BY updated_at DESC,id').all(projectId).map(row=>parse(row.data));},studyVersions:id=>db.prepare('SELECT data FROM calibration_study_versions WHERE id=? ORDER BY version DESC').all(id).map(row=>parse(row.data)),compareRuns,compare,start,cancel,reconcile,approve,waitForIdle:async()=>{while(jobs.size)await Promise.allSettled([...jobs.values()]);},active:()=>[...jobs.keys()],close:async()=>{for(const controller of controllers.values())controller.abort(failure('Service is closing.',409,'CANCELLED'));await Promise.allSettled([...jobs.values()]);db.close();}};
}
