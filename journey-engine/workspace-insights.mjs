import {createHash,randomUUID} from 'node:crypto';
import {WorkspaceError} from './workspace-store.mjs';
import {normalizeExperienceFeedback} from './experience-feedback.mjs';
import {recordedDeviceContext,recordedConditionsKey} from './recorded-device.mjs';

const now=()=>new Date().toISOString();
const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const list=value=>Array.isArray(value)?value:[];
const string=(value,max=4000)=>typeof value==='string'?value.trim().slice(0,max):'';
const number=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
const score=value=>Number.isInteger(value)&&value>=0&&value<=3?value:null;
const unique=values=>[...new Set(values)];
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const hash=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const fail=(message,status=400,code='INVALID_INSIGHT')=>{throw new WorkspaceError(message,status,code);};
const valences=new Set(['very_positive','positive','neutral','negative','very_negative']);
const completed=new Set(['finished','completed']);
export const COVERAGE_STATES=['not_explored','visited','interacted','evaluated','verified','inconclusive'];

export function normalizeScreenUrl(value){
  try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return null;url.search='';url.hash='';if(url.pathname.length>1)url.pathname=url.pathname.replace(/\/+$/,'');return url.href;}catch{return null;}
}
function routePattern(value){
  let pattern=string(value,1500),origin=null;
  if(/^https?:\/\//.test(pattern)){const url=normalizeScreenUrl(pattern);if(!url||/[?#]/.test(pattern))fail('Screen patterns must not contain queries, fragments or credentials.');const parsed=new URL(url);origin=parsed.origin;pattern=parsed.pathname;}
  if(!pattern.startsWith('/')||/[?#\\\s]/.test(pattern))fail('Use a path pattern such as /activities/:id without queries or fragments.');
  if(pattern.length>1)pattern=pattern.replace(/\/+$/,'');
  return {routePattern:pattern,origin};
}
function patternRegex(pattern){
  const segments=pattern.split('/').map(segment=>segment==='**'?'.*':segment==='*'||/^:[A-Za-z_][\w-]*$/.test(segment)?'[^/]+':segment.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  return new RegExp(`^${segments.join('/')}$`);
}
export function screenMatches(screen,context){
  const url=normalizeScreenUrl(context.url);if(!url)return false;const parsed=new URL(url);
  return (!screen.origin||screen.origin===parsed.origin)&&patternRegex(screen.routePattern).test(parsed.pathname)
    &&(!screen.state||screen.state===context.state)&&(!screen.device||screen.device==='any'||screen.device===context.device)
    &&(!list(screen.environmentIds).length||screen.environmentIds.includes(context.environmentId));
}
function buildIdentity(run){
  const fingerprint=object(run.productFingerprint),deploymentMatch=run.sourceIdentity?.deploymentMatch||'unverified';
  if(Object.keys(fingerprint).length)return {id:`source:${createHash('sha256').update(JSON.stringify(Object.entries(fingerprint).sort())).digest('hex')}`,scope:'recorded-source',deploymentMatch};
  const declared=string(run.buildId)||string(run.sourceIdentity?.buildId);
  return declared?{id:declared,scope:'recorded-build',deploymentMatch}:{id:'unknown',scope:'unknown',deploymentMatch};
}
function runContext(run){
  const deviceContext=recordedDeviceContext(run);
  const configured=run.configuredEnvironment,temporary=run.environmentKind==='temporary';
  const environmentId=configured?.id||(!temporary&&(run.environmentId||run.environmentSnapshot?.id))||'unknown';
  const environmentVersion=configured?.version??(!temporary?(run.environmentVersion??run.environmentSnapshot?.version):null)??null;
  return {runId:run.id,personaId:run.personaId||run.personaSnapshot?.id||run.persona?.id||'unknown',personaName:run.personaName||run.personaSnapshot?.name||run.persona?.name||run.persona?.label||'Unknown persona',personaVersion:run.personaSnapshot?.version??run.personaVersion??run.persona?.version??null,charterId:run.charterId||null,charterVersion:run.charterSnapshot?.version??run.charterVersion??null,environmentId,environmentVersion,environmentName:configured?.name||(!temporary?run.environmentName||run.environmentSnapshot?.name:null)||null,configuredEnvironment:configured||null,environmentKind:run.environmentKind||'configured',recordedEnvironmentId:run.environmentId||null,recordedEnvironmentVersion:run.environmentVersion??null,executionInstance:run.executionInstance||null,...deviceContext,build:buildIdentity(run),model:run.model||'unknown',rubricVersion:run.frictionRubricVersion||'legacy-unversioned-0-3',integrityStatus:run.integrityStatus||'not_recorded'};
}
function normalizedFilters(input={}){
  const result={};for(const key of ['buildId','personaId','environmentId','device','deviceId','networkProfileId','flowId'])if(string(input[key],300))result[key]=string(input[key],300);
  for(const key of ['from','to'])if(input[key]){if(typeof input[key]!=='string'||!Number.isFinite(Date.parse(input[key])))fail(`Choose a valid ${key} date.`);result[key]=input[key];}
  if(result.from&&result.to&&Date.parse(result.from)>Date.parse(result.to))fail('The start date must precede the end date.');
  result.includeInvalidated=input.includeInvalidated===true;result.includeExperimental=input.includeExperimental===true;return result;
}
function runEligible(run,context,filters){
  if(filters.buildId&&context.build.id!==filters.buildId||filters.personaId&&context.personaId!==filters.personaId||filters.environmentId&&context.environmentId!==filters.environmentId||filters.device&&context.device!==filters.device||filters.deviceId&&context.deviceId!==filters.deviceId||filters.networkProfileId&&context.networkProfileId!==filters.networkProfileId)return false;
  const time=Date.parse(run.startedAt||run.createdAt),from=filters.from?Date.parse(filters.from):null,to=filters.to?Date.parse(filters.to)+(/^\d{4}-\d{2}-\d{2}$/.test(filters.to)?86399999:0):null;
  if((from!==null||to!==null)&&!Number.isFinite(time))return false;
  return !(from!==null&&time<from||to!==null&&time>to);
}
function screenshot(run,event){return event?.type==='screenshot'&&typeof event.screenshot==='string'&&event.screenshot.startsWith(`/runs/${run.id}/`)&&Number.isInteger(event.index)&&normalizeScreenUrl(event.url);}
function matchingDefinition(inventory,context){
  const matches=list(inventory?.screens).filter(screen=>screenMatches(screen,context));
  // Exact routes/states beat wildcard routes; equally specific matches stay ambiguous.
  const weight=screen=>screen.routePattern.replace(/\*\*?|:[\w-]+/g,'').length+(screen.state?10000:0)+(screen.device&&screen.device!=='any'?1000:0)+(screen.origin?100:0);
  matches.sort((a,b)=>weight(b)-weight(a)||a.id.localeCompare(b.id));
  return matches.length>1&&weight(matches[0])===weight(matches[1])?null:matches[0]||null;
}
const evidenceIndices=finding=>unique([finding.eventIndex,...list(finding.evidence_indices),...list(finding.evidence).map(item=>item.index??item.eventIndex)].filter(Number.isInteger));
function replayTime(run,originalMs){
  if(originalMs===null)return null;
  for(const segment of list(run.replayMetadata?.segments))if(originalMs>=segment.originalStart*1000&&originalMs<=segment.originalEnd*1000)return Math.round((segment.replayStart+originalMs/1000-segment.originalStart)*1000);
  return null;
}
function sourceMoment(run,event,signal,signalIndex){
  const originalMs=number(signal?.originalMs)??number(signal?.videoMs)??number(event.videoMs);
  return {runId:run.id,eventIndex:event.index,signalIndex:signalIndex??null,originalMs,replayMs:replayTime(run,originalMs),screenshot:event.screenshot,screenUrl:normalizeScreenUrl(event.url),video:typeof run.video==='string'&&run.video.startsWith(`/runs/${run.id}/`)?run.video:null,replay:typeof run.replay==='string'&&run.replay.startsWith(`/runs/${run.id}/`)?run.replay:null};
}
const reviewAnchor=(runId,eventIndex,signalIndex)=>`${runId}:${eventIndex}:${signalIndex??'screen'}`;
function latestReviews(reviews){const map=new Map();for(const review of reviews){const key=reviewAnchor(review.runId,review.eventIndex,review.signalIndex),prior=map.get(key);if(!prior||review.version>prior.version)map.set(key,review);}return map;}
const stateAnchor=(runId,eventIndex)=>`${runId}:${eventIndex}`;
const stateSourceHash=(run,event)=>hash(sourceMoment(run,event));
function latestScreenStates(assignments){const result=new Map();for(const assignment of assignments){const key=stateAnchor(assignment.runId,assignment.eventIndex),prior=result.get(key);if(!prior||assignment.version>prior.version)result.set(key,assignment);}return result;}
function inspectRun(run,inventory,reviews,stateAssignments){
  const context=runContext(run),visits=[],byShot=new Map(),byAction=new Map(),seen=new Set();let active=null;
  for(const event of list(run.events)){
    if(screenshot(run,event)){
      const proposed=stateAssignments.get(stateAnchor(run.id,event.index)),assignment=proposed?.projectId===run.projectId&&proposed.sourceHash===stateSourceHash(run,event)?proposed:null;
      const state=assignment?assignment.state:string(event.screenState||event.uiState,300)||null;
      const stateObservation=assignment?{kind:'reviewer-observation',id:assignment.id,version:assignment.version,state:assignment.state,reason:assignment.reason,reviewer:assignment.reviewer}:state?{kind:'recorded-observation',state}:{kind:'unknown',state:null};
      const screenContext={...context,url:normalizeScreenUrl(event.url),state,stateSource:stateObservation.kind};
      const key=hash({url:screenContext.url,state:screenContext.state,device:context.device,environmentId:context.environmentId});
      if(!active||active.key!==key){const definition=matchingDefinition(inventory,screenContext);active={id:`${run.id}:visit:${visits.length}`,key,definitionId:definition?.id||null,screenId:definition?.id||`observed-${key.slice(0,20)}`,name:definition?.name||new URL(screenContext.url).pathname,routePattern:definition?.routePattern||new URL(screenContext.url).pathname,flowIds:list(definition?.flowIds),context:screenContext,screenshots:[],actions:[],signals:[],findings:[],reviews:[],backtrack:seen.has(key),inconclusive:false};visits.push(active);seen.add(key);}
      active.screenshots.push({...sourceMoment(run,event),sourceHash:stateSourceHash(run,event),state,stateObservation});byShot.set(event.index,{visit:active,event});
    }else if(active&&(event.type==='action'||event.type==='action_rejected')){
      const type=string(event.action?.type,100)||'unknown';
      // Actions are attributed to the last observed source screen, not the URL after navigation.
      const action={eventIndex:event.index,type,rejected:event.type==='action_rejected',label:string(event.click?.target?.label||event.action?.label,300)||null,originalMs:number(event.videoMs),fromUrl:active.context.url,toUrl:normalizeScreenUrl(event.url)};
      active.actions.push(action);byAction.set(event.index,{visit:active,event:byShot.get(active.screenshots.at(-1)?.eventIndex)?.event});
    }
  }
  let orphanSignals=0;
  for(const [signalIndex,signal] of list(run.experience).entries()){
    const captured=byShot.get(signal.eventIndex)||byAction.get(signal.actionEventIndex),visit=captured?.visit;
    const event=captured?.event;
    if(!visit||!event){orphanSignals++;continue;}
    const source=sourceMoment(run,event,signal,signalIndex),review=reviews.get(reviewAnchor(run.id,event.index,signalIndex))||null,feedback=normalizeExperienceFeedback(signal.feedback);
    visit.signals.push({id:`${run.id}:signal:${signalIndex}`,kind:'experience',...source,source,...(feedback?{feedback}:{}),context:{...context,rubricVersion:signal.rubricVersion||context.rubricVersion},observation:string(signal.observation,16000),reaction:string(signal.reaction,16000),track:['broken','experience','product','business'].includes(signal.track)?signal.track:'unclassified',valence:valences.has(signal.valence)?signal.valence:null,aiFriction:score(signal.friction),reviewerFriction:review?.friction??null,review,confidence:number(signal.confidence),findingIds:list(run.findings).filter(finding=>evidenceIndices(finding).includes(event.index)).map(finding=>finding.id)});
  }
  for(const finding of list(run.findings))if(!['dismissed','duplicate'].includes(finding.triage))for(const eventIndex of evidenceIndices(finding)){
    const found=byShot.get(eventIndex);if(!found)continue;
    if(!found.visit.findings.some(item=>item.id===finding.id))found.visit.findings.push({id:finding.id,title:string(finding.title,300),impact:finding.impact||'untriaged',type:finding.type||'unclassified',expected:string(finding.expected,8000),expectationSource:string(finding.expectationSource||finding.expectedSource,8000),source:sourceMoment(run,found.event),outcome:finding.outcome||null});
  }
  for(const review of reviews.values())if(review.runId===run.id){const found=byShot.get(review.eventIndex);if(found)found.visit.reviews.push(review);}
  const final=visits.at(-1);if(final&&!completed.has(run.status))final.inconclusive=true;
  if(final&&(run.outcome||run.finding?.outcome)==='inconclusive')final.inconclusive=true;
  if(final&&(run.outcome||run.finding?.outcome)==='obstacle_observed'){
    const indices=evidenceIndices(run.finding||{});for(const index of indices){const visit=byShot.get(index)?.visit;if(visit)visit.blockedGoal=true;}
  }
  return {context,visits,orphanSignals};
}
function counts(visits){
  const signals=visits.flatMap(visit=>visit.signals),actions=visits.flatMap(visit=>visit.actions),runIds=unique(visits.map(visit=>visit.context.runId));
  const distribution={0:0,1:0,2:0,3:0,unknown:0},reviewerDistribution={0:0,1:0,2:0,3:0,unknown:0};
  for(const signal of signals){distribution[signal.aiFriction??'unknown']++;reviewerDistribution[signal.reviewerFriction??'unknown']++;}
  const distinctRuns=predicate=>unique(signals.filter(predicate).map(signal=>signal.runId)).length;
  const repeatedActions=visits.reduce((total,visit)=>total+visit.actions.filter((action,index)=>index>0&&!action.rejected&&!visit.actions[index-1].rejected&&JSON.stringify([action.type,action.label])===JSON.stringify([visit.actions[index-1].type,visit.actions[index-1].label])&&action.label!==null).length,0);
  return {exposures:visits.length,screenshots:visits.reduce((total,visit)=>total+visit.screenshots.length,0),eligibleRuns:runIds.length,runIds,personas:unique(visits.map(visit=>visit.context.personaId)).length,signals:signals.length,ratedRuns:distinctRuns(signal=>signal.valence!==null),positiveRuns:distinctRuns(signal=>signal.valence==='positive'||signal.valence==='very_positive'),negativeRuns:distinctRuns(signal=>signal.valence==='negative'||signal.valence==='very_negative'),positiveSignals:signals.filter(signal=>signal.valence==='positive'||signal.valence==='very_positive').length,negativeSignals:signals.filter(signal=>signal.valence==='negative'||signal.valence==='very_negative').length,unknownValence:signals.filter(signal=>signal.valence===null).length,aiFriction:distribution,reviewerFriction:reviewerDistribution,observed:{interactions:actions.filter(action=>!action.rejected&&!['wait','move','screenshot','unknown'].includes(action.type)).length,rejectedActions:actions.filter(action=>action.rejected).length,repeatedActions,backtracks:visits.filter(visit=>visit.backtrack).length,blockedGoalRuns:unique(visits.filter(visit=>visit.blockedGoal).map(visit=>visit.context.runId)).length}};
}
function aggregateScreen(definition,visits){
  const stats=counts(visits),signals=visits.flatMap(visit=>visit.signals),evaluations=visits.flatMap(visit=>[...visit.findings.filter(finding=>finding.expected&&finding.expectationSource).map(finding=>({kind:'finding',...finding})),...visit.reviews.filter(review=>review.criterion).map(review=>({kind:'review',...review}))]);
  const verified=evaluations.filter(evaluation=>evaluation.kind==='review'&&evaluation.outcome==='verified');
  const states={visited:visits.length>0,interacted:stats.observed.interactions>0,evaluated:evaluations.length>0,verified:verified.length>0,inconclusive:visits.some(visit=>visit.inconclusive||visit.reviews.some(review=>review.outcome==='inconclusive'))};
  const status=states.verified?'verified':states.evaluated?'evaluated':states.inconclusive?'inconclusive':states.interacted?'interacted':states.visited?'visited':'not_explored';
  const groups=new Map();for(const visit of visits)for(const rubricVersion of unique(visit.signals.length?visit.signals.map(signal=>signal.context.rubricVersion):[visit.context.rubricVersion])){const context={...visit.context,rubricVersion};const key=hash({personaId:context.personaId,personaVersion:context.personaVersion,environmentId:context.environmentId,environmentVersion:context.environmentVersion,conditions:recordedConditionsKey(context),state:context.state,build:context.build.id,model:context.model,rubricVersion});if(!groups.has(key))groups.set(key,{context,visits:[]});groups.get(key).visits.push({...visit,signals:visit.signals.filter(signal=>signal.context.rubricVersion===rubricVersion)});}
  const lowMoments=signals.filter(signal=>signal.valence==='negative'||signal.valence==='very_negative'||signal.aiFriction>=2&&signal.aiFriction!==null).sort((a,b)=>({very_negative:-2,negative:-1}[a.valence]??0)-({very_negative:-2,negative:-1}[b.valence]??0)||(b.aiFriction??-1)-(a.aiFriction??-1)||a.runId.localeCompare(b.runId)||(a.originalMs??Infinity)-(b.originalMs??Infinity));
  return {...definition,status,states,counts:stats,contexts:[...groups.values()].map(group=>({context:group.context,counts:counts(group.visits)})),reviews:visits.flatMap(visit=>visit.reviews),evaluations,verifiedOutcomes:verified.length,moments:signals,lowMoments,visits,sourceRefs:visits.flatMap(visit=>visit.screenshots)};
}

export function buildInsights({runs=[],inventory=null,reviews=[],stateAssignments=[],filters:rawFilters={}}={}){
  const filters=normalizedFilters(rawFilters),reviewMap=latestReviews(reviews),stateMap=latestScreenStates(stateAssignments),selected=runs.filter(run=>runEligible(run,runContext(run),filters));
  const experimental=run=>Boolean(run.experimental||run.experimentalStudyId||run.calibrationStudyId||run.calibrationTrialId||run.experimentalCandidateId);
  const invalidated=selected.filter(run=>run.integrityStatus==='invalidated'),experiments=selected.filter(experimental),excluded=selected.filter(run=>!filters.includeInvalidated&&run.integrityStatus==='invalidated'||!filters.includeExperimental&&experimental(run)),eligible=selected.filter(run=>(filters.includeInvalidated||run.integrityStatus!=='invalidated')&&(filters.includeExperimental||!experimental(run)));
  const analyzed=eligible.map(run=>inspectRun(run,inventory,reviewMap,stateMap)),allVisits=analyzed.flatMap(item=>item.visits);
  const definitions=list(inventory?.screens).filter(screen=>(!filters.device||!screen.device||screen.device==='any'||screen.device===filters.device)&&(!filters.environmentId||!screen.environmentIds?.length||screen.environmentIds.includes(filters.environmentId))&&(!filters.flowId||list(screen.flowIds).includes(filters.flowId)));
  const visits=allVisits.filter(visit=>!filters.flowId||visit.flowIds.includes(filters.flowId));
  const screenIds=new Set(definitions.map(screen=>screen.id));
  const screens=definitions.map(definition=>aggregateScreen({...definition,inInventory:true},visits.filter(visit=>visit.screenId===definition.id)));
  for(const id of unique(visits.map(visit=>visit.screenId)))if(!screenIds.has(id)){const found=visits.filter(visit=>visit.screenId===id),first=found[0];screens.push(aggregateScreen({id,name:first.name,routePattern:first.routePattern,state:first.context.state,device:first.context.device,environmentIds:[first.context.environmentId],flowIds:first.flowIds,inInventory:false},found));}
  const known=screens.filter(screen=>screen.inInventory),summary={knownScreens:inventory?known.length:null,observedScreens:screens.filter(screen=>screen.states.visited).length,unmappedScreens:screens.filter(screen=>!screen.inInventory).length,eligibleRuns:eligible.length,excludedInvalidatedRuns:filters.includeInvalidated?0:invalidated.length,excludedExperimentalRuns:filters.includeExperimental?0:experiments.length,orphanSignals:analyzed.reduce((sum,item)=>sum+item.orphanSignals,0),visited:known.filter(screen=>screen.states.visited).length,interacted:known.filter(screen=>screen.states.interacted).length,evaluated:known.filter(screen=>screen.states.evaluated).length,verified:known.filter(screen=>screen.states.verified).length,inconclusive:known.filter(screen=>screen.states.inconclusive).length,notExplored:known.filter(screen=>!screen.states.visited).length};
  summary.experience=counts(visits);
  return {projectId:inventory?.projectId||eligible[0]?.projectId||null,inventory:inventory?structuredClone(inventory):null,inventoryStatus:inventory?inventory.completeness:'not_defined',denominator:inventory?{screens:known.length,inventoryVersion:inventory.version,inventoryVersionId:inventory.versionId,source:inventory.source,scope:inventory.scope||'',completeness:inventory.completeness}:null,filters,stateAssignments:[...stateMap.values()].filter(item=>eligible.some(run=>run.id===item.runId)),trust:filters.includeInvalidated&&invalidated.length?'includes-invalidated':filters.includeExperimental&&experiments.length?'includes-experimental':'trusted-records-only',summary,screens,lowMoments:screens.flatMap(screen=>screen.lowMoments.map(moment=>({...moment,screenId:screen.id,screenName:screen.name}))),flows:list(inventory?.flows).map(flow=>({id:flow.id,name:flow.name,knownScreens:known.filter(screen=>screen.flowIds.includes(flow.id)).length,visitedScreens:known.filter(screen=>screen.flowIds.includes(flow.id)&&screen.states.visited).length})),excludedRuns:excluded.map(run=>({id:run.id,reason:run.integrityStatus==='invalidated'?'invalidated':'experimental',reasons:[...(run.integrityStatus==='invalidated'?['invalidated']:[]),...(experimental(run)?['experimental']:[])],inspectable:true})),sourceRuns:eligible.map(run=>({id:run.id,name:typeof run.name==='string'?run.name:null,...runContext(run),status:run.status,experimental:experimental(run),createdAt:run.createdAt||null,sourceHash:hash({events:run.events,experience:run.experience,findings:run.findings,integrityStatus:run.integrityStatus}),personaVersionId:run.personaVersionId||null,charterVersionId:run.charterVersionId||null,environmentVersionId:run.configuredEnvironment?.versionId||(!run.executionInstance?run.environmentVersionId:null)||null})),limitations:['Synthetic observations and reviewer assessments; no human satisfaction or business uplift is inferred.','Coverage applies only to the selected recorded context and known inventory, never the entire application by inference.',...(inventory?[]:['No curated denominator exists; only observed screen counts are available.']),...(summary.orphanSignals?['Signals without a recorded source frame are excluded from screen aggregates.']:[]),...(filters.includeInvalidated&&invalidated.length?['Invalidated evidence is included for inspection; these aggregates are not trusted coverage.']:[]),...(filters.includeExperimental&&experiments.length?['Experimental candidate journeys are included for inspection, not active-product coverage.']:[])]};
}

function stringList(value,key,max=100){if(value!==undefined&&(!Array.isArray(value)||value.some(item=>typeof item!=='string')))fail(`${key} must be a list of text values.`);return unique(list(value).map(item=>string(item,500)).filter(Boolean)).slice(0,max);}
function cleanInventory(input){
  const name=string(input.name,160);if(!name)fail('Give the inventory a name.');
  const source=object(input.source),kind=string(source.kind,60);if(!['curated','declared-routes','repository','analytics','discovery'].includes(kind))fail('Record how the inventory was obtained.');
  const reference=string(source.reference,2000);if(!reference)fail('Record a source reference or curation note.');
  const completeness=input.completeness||'partial';if(!['unknown','partial','declared-scope'].includes(completeness))fail('Inventory completeness must be unknown, partial or declared-scope.');
  if(!Array.isArray(input.screens)||input.screens.length>2000)fail('Supply up to 2,000 known screen definitions.');
  const flows=list(input.flows).map(flow=>({id:string(flow.id,100)||randomUUID(),name:string(flow.name,160)}));if(flows.some(flow=>!flow.name)||unique(flows.map(flow=>flow.id)).length!==flows.length)fail('Flows need unique IDs and names.');
  const screens=input.screens.map(screen=>{
    const id=string(screen.id,100)||randomUUID(),name=string(screen.name,160);if(!name)fail('Every screen needs a name.');
    const pattern=routePattern(screen.routePattern),origin=screen.origin?normalizeScreenUrl(screen.origin):null;if(screen.origin&&(!origin||new URL(origin).pathname!=='/'))fail('Screen origin must be a credential-free HTTP origin.');
    const device=screen.device||'any';if(!['any','mobile','tablet','desktop','unknown'].includes(device))fail('Choose a supported device context.');
    const flowIds=stringList(screen.flowIds,'flowIds');if(flowIds.some(id=>!flows.some(flow=>flow.id===id)))fail('A screen references a flow outside this inventory.');
    const criteria=list(screen.criteria).map(criterion=>({id:string(criterion.id,100)||randomUUID(),text:string(criterion.text,2000),source:string(criterion.source,2000)}));if(criteria.some(criterion=>!criterion.text||!criterion.source))fail('Criteria need their expectation and source.');
    return {id,name,...pattern,origin:origin?new URL(origin).origin:pattern.origin,state:string(screen.state,300)||null,device,environmentIds:stringList(screen.environmentIds,'environmentIds'),flowIds,criteria};
  });
  if(unique(screens.map(screen=>screen.id)).length!==screens.length)fail('Screen IDs must be unique.');
  return {name,scope:string(input.scope,6000),source:{kind,reference,observedAt:string(source.observedAt,100)||null},completeness,screens,flows};
}

export function createInsightsService({store,feedback}){
  const db=store.db;
  db.exec(`CREATE TABLE IF NOT EXISTS insight_inventory_versions(project_id TEXT NOT NULL,version INTEGER NOT NULL,version_id TEXT NOT NULL UNIQUE,data TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(project_id,version));
    CREATE TABLE IF NOT EXISTS insight_reviews(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,run_id TEXT NOT NULL,anchor TEXT NOT NULL,version INTEGER NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(anchor,version));
    CREATE INDEX IF NOT EXISTS insight_reviews_scope ON insight_reviews(project_id,run_id);
    CREATE TABLE IF NOT EXISTS insight_screen_state_versions(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,run_id TEXT NOT NULL,anchor TEXT NOT NULL,version INTEGER NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(anchor,version));
    CREATE INDEX IF NOT EXISTS insight_screen_state_scope ON insight_screen_state_versions(project_id,run_id);
    CREATE TABLE IF NOT EXISTS insight_reports(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL);`);
  const parse=row=>row?JSON.parse(row.data):null;
  const requireProject=projectId=>{if(typeof projectId!=='string'||!projectId)fail('Choose an app.');store.requireProject(projectId);};
  const transaction=callback=>{db.exec('BEGIN IMMEDIATE');try{const result=callback();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}};
  function getInventory(projectId,version){requireProject(projectId);if(version!==undefined&&(!Number.isInteger(version)||version<1))fail('Choose a valid inventory version.');return parse(version===undefined?db.prepare('SELECT data FROM insight_inventory_versions WHERE project_id=? ORDER BY version DESC LIMIT 1').get(projectId):db.prepare('SELECT data FROM insight_inventory_versions WHERE project_id=? AND version=?').get(projectId,version));}
  function listInventoryVersions(projectId){requireProject(projectId);return db.prepare('SELECT data FROM insight_inventory_versions WHERE project_id=? ORDER BY version DESC').all(projectId).map(parse);}
  function saveInventory(input){requireProject(input.projectId);const data=cleanInventory(input);for(const screen of data.screens)for(const id of screen.environmentIds){const environment=store.getEntity('environment',id);if(!environment||environment.projectId!==input.projectId)fail('Inventory environments must belong to this app.');}
    return transaction(()=>{const old=getInventory(input.projectId);if(input.expectedVersion!==undefined&&input.expectedVersion!==(old?.version||0))fail('The inventory changed. Reload before saving.',409,'VERSION_CONFLICT');const version=(old?.version||0)+1,record={...data,projectId:input.projectId,version,versionId:randomUUID(),createdAt:now()};db.prepare('INSERT INTO insight_inventory_versions VALUES(?,?,?,?,?)').run(input.projectId,version,record.versionId,JSON.stringify(record),record.createdAt);return record;});
  }
  function listReviews(projectId,{runId}={}){requireProject(projectId);return db.prepare(`SELECT data FROM insight_reviews WHERE project_id=? ${runId?'AND run_id=?':''} ORDER BY created_at,id`).all(projectId,...(runId?[runId]:[])).map(parse);}
  function listScreenStates(projectId,{runId}={}){requireProject(projectId);return db.prepare(`SELECT data FROM insight_screen_state_versions WHERE project_id=? ${runId?'AND run_id=?':''} ORDER BY created_at,id`).all(projectId,...(runId?[runId]:[])).map(parse);}
  function saveScreenState(input){
    requireProject(input.projectId);const run=store.getRun(input.runId);
    if(!run||run.projectId!==input.projectId)fail('Choose a recorded journey from this app.',404,'RUN_NOT_FOUND');
    if(run.integrityStatus==='invalidated')fail('Invalidated evidence cannot support a screen-state assignment.',409,'INVALIDATED_EVIDENCE');
    if(['queued','running','finalizing','cancelling'].includes(run.status))fail('Wait until this recording has finished before assigning its screen state.',409,'RUN_ACTIVE');
    const event=list(run.events).find(event=>event.index===input.eventIndex);if(!screenshot(run,event))fail('Select an actual recorded screenshot.',400,'SCREENSHOT_REQUIRED');
    if(typeof input.sourceHash!=='string'||input.sourceHash!==stateSourceHash(run,event))fail('The recorded screenshot changed. Reload before reviewing its state.',409,'SOURCE_CHANGED');
    if(input.state!==null&&(typeof input.state!=='string'||!input.state.trim()||input.state.length>300))fail('Use a visible state label of 1–300 characters, or null for unknown.',400,'INVALID_SCREEN_STATE');
    if(typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>4000)fail('Describe what is visible in this specific screenshot.',400,'STATE_REASON_REQUIRED');
    if(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0)fail('Provide the current screen-state assignment version.',400,'STATE_VERSION_REQUIRED');
    return transaction(()=>{
      const anchor=stateAnchor(run.id,event.index),old=parse(db.prepare('SELECT data FROM insight_screen_state_versions WHERE anchor=? ORDER BY version DESC LIMIT 1').get(anchor));
      if(input.expectedVersion!==(old?.version||0))fail('This screen-state assignment changed. Reload before revising.',409,'VERSION_CONFLICT');
      const assignment={id:randomUUID(),projectId:input.projectId,runId:run.id,eventIndex:event.index,version:(old?.version||0)+1,supersedesId:old?.id||null,state:input.state===null?null:input.state.trim(),reason:input.reason.trim(),reviewer:'local-user',kind:'screen-state-observation',source:sourceMoment(run,event),sourceHash:stateSourceHash(run,event),context:runContext(run),createdAt:now()};
      db.prepare('INSERT INTO insight_screen_state_versions VALUES(?,?,?,?,?,?,?)').run(assignment.id,input.projectId,run.id,anchor,assignment.version,JSON.stringify(assignment),assignment.createdAt);
      return assignment;
    });
  }
  function saveReview(input){
    requireProject(input.projectId);const run=store.getRun(input.runId);if(!run||run.projectId!==input.projectId)fail('Choose a recorded journey from this app.',404,'RUN_NOT_FOUND');
    if(run.integrityStatus==='invalidated')fail('Invalidated evidence can be inspected but cannot support a new score or verification.',409,'INVALIDATED_EVIDENCE');
    const event=list(run.events).find(event=>event.index===input.eventIndex);if(!screenshot(run,event))fail('Select an actual recorded screenshot.');
    const signalIndex=input.signalIndex==null?null:input.signalIndex,signal=signalIndex===null?null:list(run.experience)[signalIndex];
    if(signalIndex!==null&&(!Number.isInteger(signalIndex)||!signal||signal.eventIndex!==event.index))fail('The signal does not reference this screenshot.');
    const friction=score(input.friction);if(friction===null)fail('A reviewer friction score must be an integer from 0 to 3.');
    const reason=string(input.reason,4000);if(!reason)fail('Explain the reviewer score.');
    const criterion=string(input.criterion,4000)||null,outcome=input.outcome??null;if(![null,'verified','not_verified','inconclusive'].includes(outcome))fail('Choose a supported criterion outcome.');
    if(outcome&&!criterion)fail('An outcome review needs a criterion.');if(outcome==='verified'&&!completed.has(run.status))fail('Only a completed recorded journey can support an outcome verification.');
    return transaction(()=>{const anchor=reviewAnchor(run.id,event.index,signalIndex),old=parse(db.prepare('SELECT data FROM insight_reviews WHERE anchor=? ORDER BY version DESC LIMIT 1').get(anchor));if(input.expectedVersion!==undefined&&input.expectedVersion!==(old?.version||0))fail('This review changed. Reload before revising.',409,'VERSION_CONFLICT');const review={id:randomUUID(),projectId:input.projectId,runId:run.id,eventIndex:event.index,signalIndex,version:(old?.version||0)+1,supersedesId:old?.id||null,friction,reason,criterion,outcome,reviewer:'local-user',rubricVersion:'reviewer-friction-0-3-v1',ai:{friction:score(signal?.friction),valence:valences.has(signal?.valence)?signal.valence:null,model:run.model||'unknown',rubricVersion:signal?.rubricVersion||run.frictionRubricVersion||'legacy-unversioned-0-3'},source:sourceMoment(run,event,signal,signalIndex),context:runContext(run),createdAt:now()};db.prepare('INSERT INTO insight_reviews VALUES(?,?,?,?,?,?,?)').run(review.id,input.projectId,run.id,anchor,review.version,JSON.stringify(review),review.createdAt);return review;});
  }
  function analyze({projectId,inventoryVersion,filters={}}){requireProject(projectId);const inventory=getInventory(projectId,inventoryVersion);if(inventoryVersion!==undefined&&!inventory)fail('Inventory version not found.',404,'INVENTORY_NOT_FOUND');const runs=db.prepare('SELECT id FROM runs WHERE project_id=? ORDER BY created_at,id').all(projectId).map(row=>store.getRun(row.id));const result={...buildInsights({runs,inventory,reviews:listReviews(projectId),stateAssignments:listScreenStates(projectId),filters}),projectId},feedbackScope={projectId,runIds:result.sourceRuns.map(run=>run.id)};return {...result,derivedFeedback:feedback?feedback.listCurrent(feedbackScope):[],feedbackProcessing:feedback?.processing(feedbackScope)||false};}
  function screenDetail(input){const result=analyze(input),screen=result.screens.find(screen=>screen.id===input.screenId);if(!screen)fail('Screen not found in this recorded scope.',404,'SCREEN_NOT_FOUND');return {screen,denominator:result.denominator,filters:result.filters,trust:result.trust,sourceRuns:result.sourceRuns.filter(run=>screen.counts.runIds.includes(run.id)),limitations:result.limitations};}
  function saveReport(input){const name=string(input.name,160);if(!name)fail('Name this frozen report.');const snapshot={...analyze(input),feedbackProcessing:false},report={id:randomUUID(),projectId:input.projectId,name,kind:['coverage','experience'].includes(input.kind)?input.kind:'coverage',createdAt:now(),createdBy:'local-user',snapshot,snapshotHash:hash(snapshot)};db.prepare('INSERT INTO insight_reports VALUES(?,?,?,?)').run(report.id,input.projectId,JSON.stringify(report),report.createdAt);return report;}
  function getReport(projectId,id){
    requireProject(projectId);const report=parse(db.prepare('SELECT data FROM insight_reports WHERE id=? AND project_id=?').get(id,projectId));if(!report)fail('Report not found in this app.',404,'REPORT_NOT_FOUND');
    if(!store.resolveConfiguredEnvironment)return report;
    const environmentContexts={},visit=value=>{
      if(!value||typeof value!=='object')return;
      if(typeof value.environmentId==='string'&&!Object.hasOwn(environmentContexts,value.environmentId)){
        const entity=store.getEntity('environment',value.environmentId);
        if(entity?.projectId===projectId&&entity.lifecycle==='temporary'){
          const parent=store.resolveConfiguredEnvironment(value.environmentId,value.environmentVersion);
          environmentContexts[value.environmentId]={environmentKind:'temporary',configuredEnvironment:parent?{id:parent.id,name:parent.name,version:parent.version,versionId:parent.versionId}:null};
        }
      }
      for(const child of Object.values(value))visit(child);
    };visit(report.snapshot);
    return {...report,environmentContexts};
  }
  function listReports(projectId){requireProject(projectId);return db.prepare('SELECT data FROM insight_reports WHERE project_id=? ORDER BY created_at DESC,id').all(projectId).map(parse).map(({snapshot,...report})=>({...report,inventoryVersion:snapshot.inventory?.version??null,summary:snapshot.summary,filters:snapshot.filters}));}
  function gapCharter(input){const detail=screenDetail(input),screen=detail.screen,inventory=getInventory(input.projectId,input.inventoryVersion);const environmentIds=list(screen.environmentIds);return {draft:{name:`Explore ${screen.name}`.slice(0,100),mission:`Explore ${screen.name} and check its visible behavior against a sourced criterion.`,scope:`${screen.routePattern}${screen.state?` · state: ${screen.state}`:''}${screen.device&&screen.device!=='any'?` · ${screen.device}`:''}`,screens:[screen.routePattern],flows:list(screen.flowIds).map(id=>inventory?.flows.find(flow=>flow.id===id)?.name||id),successCriteria:list(screen.criteria).length?screen.criteria.map(criterion=>`${criterion.text} (source: ${criterion.source})`).join('\n'):'Record a supported result against an explicit criterion; do not assume the outcome.',stopCriteria:'Stop on a supported obstacle, an observed goal, an unsafe action, or an inconclusive result.',compatibleEnvironmentIds:environmentIds,defaultEnvironmentId:environmentIds.length===1?environmentIds[0]:null,personaIds:input.filters?.personaId?[input.filters.personaId]:[]},provenance:{projectId:input.projectId,inventoryVersion:inventory?.version??null,inventoryVersionId:inventory?.versionId??null,screenId:screen.id,coverageStatus:screen.status},requiresSave:true,launched:false};}
  return {getInventory,listInventoryVersions,saveInventory,coverage:analyze,experience:analyze,screenDetail,saveReview,listReviews,saveScreenState,listScreenStates,saveReport,getReport,listReports,gapCharter};
}
