import {recordedDevice,recordedNetwork,networkSummary} from './device-context.ts';
import {recordedConditionsKey} from './recorded-conditions.ts';
import type {Row} from './lib.ts';
import {setJourneyMoment} from './journey-moment.ts';

export const COVERAGE_LABELS:Record<string,string>={not_explored:'Not explored',visited:'Visited',interacted:'Interacted',evaluated:'Evaluated against a criterion',verified:'Outcome verified',inconclusive:'Unavailable / inconclusive'};
export const FRICTION_LABELS=['None','Mild','Disruptive','Blocking'];
const finiteTime=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const keys=['buildId','personaId','environmentId','device','deviceId','networkProfileId','flowId','from','to'] as const;
export function insightFiltersFromSearch(search:string):Row{
  const params=new URLSearchParams(search),filters:Row={};
  for(const key of keys){const value=params.get(key);if(value)filters[key]=value;}
  filters.includeInvalidated=params.get('includeInvalidated')==='true';return filters;
}
export function insightSearch(search:string,filters:Row):string{
  const params=new URLSearchParams(search);
  for(const key of keys){if(typeof filters[key]==='string'&&filters[key])params.set(key,filters[key]);else params.delete(key);}
  if(filters.includeInvalidated===true)params.set('includeInvalidated','true');else params.delete('includeInvalidated');
  return params.toString();
}
export function insightMomentHref(projectId:string,moment:Row,mode:'original'|'condensed'='original'):string|null{
  if(!projectId||!moment.runId||!finiteTime(moment.originalMs))return null;
  // `at` is always original time. Player maps it or explicitly falls back to
  // original footage when the condensed cut omitted the source moment.
  const params=new URLSearchParams({tab:'journey',at:String(moment.originalMs),mode});
  setJourneyMoment(params,moment,moment.originalMs);
  return `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(moment.runId)}?${params}`;
}
export function insightFindingHref(projectId:string,moment:Row):string|null{
  const id=Array.isArray(moment.findingIds)?moment.findingIds.find((id:unknown)=>typeof id==='string'&&id):null;
  return projectId&&id?`/projects/${encodeURIComponent(projectId)}/findings/${encodeURIComponent(id)}`:null;
}
export function coverageSummaryText(result:Row):string{
  const denominator=result.denominator?.screens;
  if(typeof denominator!=='number')return `${result.summary?.observedScreens??0} observed screens · inventory not defined`;
  return `${result.summary?.visited??0} of ${denominator} known in-scope screens visited`;
}
export function experienceSampleText(screen:Row):string{
  const counts=screen.counts||{};
  return `Negative signals in ${counts.negativeRuns??0} of ${counts.eligibleRuns??0} eligible journeys · ${counts.ratedRuns??0} with recorded valence`;
}
export function frictionLabel(value:unknown):string{return typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=3?`${value} · ${FRICTION_LABELS[value]}`:'Not recorded';}
export function sourceContextLabel(context:Row):string{
  return [context.personaName||context.personaId||'Unknown persona',context.personaVersion!=null?`persona v${context.personaVersion}`:'persona version unknown',context.deviceName||context.device||recordedDevice(context).name,context.environmentId||'environment unknown',context.environmentVersion!=null?`environment v${context.environmentVersion}`:'environment version unknown',context.rubricVersion||'rubric unknown'].join(' · ');
}
export function observedInventoryDraft(result:Row):Row{
  const screens=Array.isArray(result.screens)?result.screens.filter((screen:Row)=>screen.states?.visited):[];
  // This is an unsaved discovery draft, not an assertion of application completeness.
  return {name:'Known product screens',scope:'Screens observed in the selected recorded journeys.',source:{kind:'discovery',reference:`Recorded journeys: ${(result.sourceRuns||[]).map((run:Row)=>run.id).join(', ')}`},completeness:'partial',flows:[],screens:screens.map((screen:Row)=>({id:screen.id,name:screen.name,routePattern:screen.routePattern,state:screen.state||null,device:screen.device||'any',environmentIds:screen.environmentIds||[],flowIds:[],criteria:[]}))};
}

export function screenContextSubtitle(screen:Row,environments:Row[]=[]):{label:string;title:string}{
  const contexts=(Array.isArray(screen.contexts)?screen.contexts:[]).map((item:Row)=>item.context||{});
  if(!contexts.length)return {label:'',title:''};
  const environmentIds=[...new Set<string>(contexts.map((item:Row)=>item.environmentId||'unknown'))],buildIds=[...new Set<string>(contexts.map((item:Row)=>item.build?.id||'unknown'))];
  const environmentName=(id:string)=>environments.find(item=>item.id===id)?.name||(id==='unknown'?'Environment unknown':id);
  const buildLabel=buildIds.length===1?(buildIds[0]==='unknown'?'build unknown':`build ${buildIds[0].replace(/^source:/,'').slice(0,8)}`):`${buildIds.length} builds`;
  return {label:`${environmentIds.length===1?environmentName(environmentIds[0]):`${environmentIds.length} environments`} · ${buildLabel}${contexts.length>1?` · ${contexts.length} contexts`:''}`,title:contexts.map((item:Row)=>`${environmentName(item.environmentId||'unknown')} (${item.environmentId||'unknown'}, v${item.environmentVersion??'?'}) · ${item.build?.id||'build unknown'} · ${recordedDevice(item).name} · ${recordedNetwork(item).name} · ${networkSummary(recordedNetwork(item))}`).join('\n')};
}
export function screenStatePayload(projectId:string,source:Row,state:string,reason:string,expectedVersion:number):Row{
  if(!projectId||!source.runId||!Number.isInteger(source.eventIndex)||typeof source.sourceHash!=='string'||!source.sourceHash)throw Error('Select an exact recorded screenshot.');
  if(state.length>300||!reason.trim()||reason.length>4000)throw Error('Add a short state and a reason grounded in this screenshot.');
  if(!Number.isSafeInteger(expectedVersion)||expectedVersion<0)throw Error('Reload the current state assignment before saving.');
  return {projectId,runId:source.runId,eventIndex:source.eventIndex,sourceHash:source.sourceHash,state:state.trim()||null,reason:reason.trim(),expectedVersion};
}

const records=(value:unknown):Row[]=>Array.isArray(value)?value:[];
const cleanText=(value:unknown):string=>typeof value==='string'?value.trim():'';
/** Display-only identity. Recorded grouping and source URLs remain untouched. */
export function screenDisplayIdentity(screen:Row,projectName=''): {name:string;url:string;nameSource:'curated'|'recorded'|'route'} {
 const route=cleanText(screen.routePattern),rawName=cleanText(screen.name);
 const usableName=(value:string)=>!!value&&value!==route&&!/^(?:https?:\/\/|\/|#)/i.test(value);
 const sources=[screen,...records(screen.visits),...records(screen.sourceRefs),...records(screen.moments)];
 const capturedTitle=sources.map(source=>cleanText(source.pageTitle||source.documentTitle||source.screenTitle)).find(usableName);
 const rawUrl=[screen.url,screen.origin&&route?`${screen.origin}${route}`:null,...records(screen.contexts).map(item=>item.context?.url),...records(screen.sourceRefs).map(source=>source.screenUrl),...records(screen.moments).map(moment=>moment.screenUrl)].map(cleanText).find(value=>/^https?:\/\//i.test(value));
 // Do not make credentials/query parameters newly prominent in collection rows.
 let url=route||'URL not recorded';
 if(rawUrl){try{const parsed=new URL(rawUrl);url=`${parsed.origin}${parsed.pathname}${parsed.hash}`;}catch{/* Keep the recorded route fallback. */}}
 if(usableName(rawName))return {name:rawName,url,nameSource:'curated'};
 if(capturedTitle)return {name:capturedTitle,url,nameSource:'recorded'};
 let path=route;
 try{path=new URL(route,'https://display.invalid').pathname;}catch{/* Route patterns can be non-URLs. */}
 const segment=path.split('/').filter(Boolean).at(-1)?.replace(/\.(?:html?|php|aspx?)$/i,'')||'';
 let routeName=segment;try{routeName=decodeURIComponent(segment);}catch{/* Keep an invalid escape literal. */}
 routeName=routeName.replace(/[-_]+/g,' ').replace(/\b\w/g,char=>char.toUpperCase());
 return {name:routeName&&routeName.toLowerCase()!=='index'?routeName:cleanText(projectName)||'Home',url,nameSource:'route'};
}

export type ExperienceCountPill={key:string;count:number;label:string;tone:'negative'|'positive'|'neutral'|'warning'|'finding';description:string};
/** Counts keep their units: reactions are signals, blocked outcomes are journeys. */
export function experienceCountPills(screen:Row):ExperienceCountPill[]{
 const counts=screen.counts||{},observed=counts.observed||{},number=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>0?Math.floor(value):0;
 const positive=number(counts.positiveSignals),negative=number(counts.negativeSignals),unknown=number(counts.unknownValence),neutral=Math.max(0,number(counts.signals)-positive-negative-unknown);
 const findings=new Set(records(screen.evaluations).filter(item=>item.kind==='finding'&&item.id).map(item=>item.id)).size;
 return [
  {key:'negative',count:negative,label:'negative',tone:'negative',description:`${negative} negative signals across ${number(counts.negativeRuns)} of ${number(counts.eligibleRuns)} eligible journeys`},
  {key:'positive',count:positive,label:'positive',tone:'positive',description:`${positive} positive signals`},
  {key:'neutral',count:neutral,label:'neutral',tone:'neutral',description:`${neutral} neutral signals`},
  {key:'unrated',count:unknown,label:'unrated',tone:'neutral',description:`${unknown} signals without recorded valence`},
  {key:'findings',count:findings,label:findings===1?'finding':'findings',tone:'finding',description:`${findings} distinct findings linked to this page`},
  {key:'repeated',count:number(observed.repeatedActions),label:'repeated',tone:'warning',description:`${number(observed.repeatedActions)} repeated actions`},
  {key:'backtracks',count:number(observed.backtracks),label:'backtracks',tone:'warning',description:`${number(observed.backtracks)} observed backtracks`},
  {key:'blocked',count:number(observed.blockedGoalRuns),label:'blocked',tone:'negative',description:`${number(observed.blockedGoalRuns)} blocked journeys`},
 ].filter(pill=>pill.count>0) as ExperienceCountPill[];
}

const uniqueText=(values:unknown[]):string[]=>[...new Set(values.map(cleanText).filter(Boolean))];
const uniqueRows=(values:Row[],key:(row:Row,index:number)=>string):Row[]=>[...new Map(values.map((row,index)=>[key(row,index),row])).values()];
const momentKey=(row:Row,index:number)=>cleanText(row.id)||(row.runId&&Number.isInteger(row.signalIndex)?`${row.runId}:signal:${row.signalIndex}`:row.runId&&Number.isInteger(row.eventIndex)?JSON.stringify([row.runId,row.eventIndex,row.originalMs,row.reaction,row.observation]):`unknown-moment:${index}`);
const frameKey=(row:Row,index:number)=>row.runId&&Number.isInteger(row.eventIndex)?`${row.runId}:${row.eventIndex}`:cleanText(row.sourceHash)||`unknown-frame:${index}`;
const visitKey=(row:Row,index:number)=>cleanText(row.id)||`unknown-visit:${index}`;
const evaluationKey=(row:Row,index:number)=>row.id?`${row.kind}:${row.id}`:`unknown-evaluation:${index}`;
const validValences=new Set(['very_negative','negative','neutral','positive','very_positive']);
const negative=(row:Row)=>row.valence==='negative'||row.valence==='very_negative';
const positive=(row:Row)=>row.valence==='positive'||row.valence==='very_positive';
const compareMoments=(a:Row,b:Row)=>String(a.runId||'').localeCompare(String(b.runId||''))||(finiteTime(a.originalMs)?a.originalMs:Infinity)-(finiteTime(b.originalMs)?b.originalMs:Infinity)||String(a.id||'').localeCompare(String(b.id||''));
const lowMoments=(moments:Row[])=>moments.filter(moment=>negative(moment)||(typeof moment.aiFriction==='number'&&moment.aiFriction>=2)).sort((a,b)=>({very_negative:-2,negative:-1}[a.valence as 'negative']??0)-({very_negative:-2,negative:-1}[b.valence as 'negative']??0)||(b.aiFriction??-1)-(a.aiFriction??-1)||compareMoments(a,b));

/** Product route identity deliberately ignores deployment origins, not distinct paths. */
export function experiencePageKey(screen:Row,fallback='unknown'):string{
 const route=cleanText(screen.routePattern),url=screenDisplayIdentity(screen).url;
 const routeValue=route.startsWith('/')||route.startsWith('#')||/^https?:\/\//i.test(route)?route:/^https?:\/\//i.test(url)?url:'';
 if(!routeValue)return `unknown:${cleanText(screen.id)||fallback}`;
 try{
  const parsed=new URL(routeValue,'https://page.invalid');
  let hash=parsed.hash;
  // A recorded hash route is meaningful even if the screen's path is just '/'.
  if(!hash&&/^https?:\/\//i.test(url))hash=new URL(url).hash;
  return `route:${parsed.pathname.length>1?parsed.pathname.replace(/\/+$/,''):parsed.pathname}${hash}`;
 }catch{return `unknown:${cleanText(screen.id)||fallback}`;}
}
function comparisonKey(context:Row):string{
 const known=(value:unknown)=>cleanText(value)&&value!=='unknown'?value:`unknown:${context.runId||''}`;
 return JSON.stringify([known(context.personaId),context.personaVersion??null,known(context.environmentId),context.environmentVersion??null,known(context.build?.id),context.device||'unknown',context.deviceId??null,context.deviceVersion??null,context.networkProfileId??null,context.networkProfileVersion??null,recordedConditionsKey(context),context.state??null,context.model||'unknown',context.rubricVersion||'unknown',context.charterId??null,context.charterVersion??null]);
}
function countExperience(visits:Row[],moments:Row[],sources:Row[]):Row{
 const runIds=uniqueText([...visits.map(visit=>visit.context?.runId),...moments.map(moment=>moment.runId),...sources.map(source=>source.runId)]);
 const distinctRuns=(predicate:(row:Row)=>boolean)=>uniqueText(moments.filter(predicate).map(moment=>moment.runId)).length;
 const actions=uniqueRows(visits.flatMap(visit=>records(visit.actions).map(action=>({...action,runId:visit.context?.runId}))), (action,index)=>action.runId&&Number.isInteger(action.eventIndex)?`${action.runId}:${action.eventIndex}`:`unknown-action:${index}`);
 const distribution=(field:string)=>Object.fromEntries([0,1,2,3,'unknown'].map(score=>[score,moments.filter(moment=>Number.isInteger(moment[field])&&moment[field]>=0&&moment[field]<=3?moment[field]===score:score==='unknown').length]));
 const repeatedKeys=new Set<string>();
 for(const visit of visits)records(visit.actions).forEach((action,index,all)=>{const prior=all[index-1];if(prior&&!action.rejected&&!prior.rejected&&action.label!=null&&action.type===prior.type&&action.label===prior.label)repeatedKeys.add(`${visit.context?.runId}:${action.eventIndex??`${visit.id}:${index}`}`);});
 return {exposures:visits.length,screenshots:sources.length,eligibleRuns:runIds.length,runIds,personas:uniqueText([...visits.map(visit=>visit.context?.personaId),...moments.map(moment=>moment.context?.personaId)]).length,signals:moments.length,ratedRuns:distinctRuns(moment=>validValences.has(moment.valence)),positiveRuns:distinctRuns(positive),negativeRuns:distinctRuns(negative),positiveSignals:moments.filter(positive).length,negativeSignals:moments.filter(negative).length,unknownValence:moments.filter(moment=>!validValences.has(moment.valence)).length,aiFriction:distribution('aiFriction'),reviewerFriction:distribution('reviewerFriction'),observed:{interactions:actions.filter(action=>!action.rejected&&!['wait','move','screenshot','unknown'].includes(action.type)).length,rejectedActions:actions.filter(action=>action.rejected).length,repeatedActions:repeatedKeys.size,backtracks:visits.filter(visit=>visit.backtrack).length,blockedGoalRuns:uniqueText(visits.filter(visit=>visit.blockedGoal).map(visit=>visit.context?.runId)).length}};
}
function experienceAggregate(visits:Row[],moments:Row[],sources:Row[],evaluations:Row[]):Row{
 const uniqueVisits=uniqueRows(visits,visitKey),uniqueMoments=uniqueRows(moments,momentKey).sort(compareMoments),sourceRefs=uniqueRows(sources,frameKey);
 return {visits:uniqueVisits,moments:uniqueMoments,lowMoments:lowMoments(uniqueMoments),sourceRefs,evaluations:uniqueRows(evaluations,evaluationKey),counts:countExperience(uniqueVisits,uniqueMoments,sourceRefs)};
}
/** Read-only presentation grouping. It never changes source-screen or recording identity. */
export function groupExperiencePages(screens:Row[],projectName=''):Row[]{
 const pages=new Map<string,Row[]>();
 records(screens).forEach((screen,index)=>{const key=experiencePageKey(screen,String(index));pages.set(key,[...(pages.get(key)||[]),screen]);});
 return [...pages].map(([key,sourceScreens])=>{
  const visits=uniqueRows(sourceScreens.flatMap(screen=>records(screen.visits)),visitKey);
  const moments=uniqueRows([...sourceScreens.flatMap(screen=>records(screen.moments)),...visits.flatMap(visit=>records(visit.signals))],momentKey);
  const sourceRefs=uniqueRows([...sourceScreens.flatMap(screen=>records(screen.sourceRefs)),...visits.flatMap(visit=>records(visit.screenshots))],frameKey);
  const evaluations=uniqueRows(sourceScreens.flatMap(screen=>records(screen.evaluations)),evaluationKey);
  const comparisons=new Map<string,Row>();
  const ensureContext=(context:Row,screenIds:string[]=[])=>{
   const contextId=comparisonKey(context);let row=comparisons.get(contextId);
   if(!row){row={id:contextId,context,visits:[],moments:[],sourceRefs:[],evaluations:[],screenIds:[],urls:[]};comparisons.set(contextId,row);}
   row.screenIds=uniqueText([...row.screenIds,...screenIds]);
   row.urls=uniqueText([...row.urls,screenDisplayIdentity({url:context.url}).url]).filter(url=>url!=='URL not recorded');
   return row;
  };
  for(const visit of visits){
   const context=visit.context||{},rubrics=uniqueText(records(visit.signals).map(signal=>signal.context?.rubricVersion));
   for(const rubricVersion of rubrics.length?rubrics:[context.rubricVersion||'unknown']){
    const target=ensureContext({...context,rubricVersion},[visit.screenId]);
    target.visits.push(visit);target.sourceRefs.push(...records(visit.screenshots));
    target.moments.push(...records(visit.signals).filter(signal=>(signal.context?.rubricVersion||context.rubricVersion||'unknown')===rubricVersion));
    const frames=new Set(records(visit.screenshots).map(frame=>frameKey(frame,0)));
    target.evaluations.push(...evaluations.filter(evaluation=>evaluation.source&&frames.has(frameKey(evaluation.source,0))||evaluation.runId===context.runId&&records(visit.screenshots).some(frame=>frame.eventIndex===evaluation.eventIndex)));
   }
  }
  // Retained reports may contain moments without full visit records. Keep those
  // inspectable, but do not synthesize exposures, actions, or missing ratings.
  const assignedMoments=new Set([...comparisons.values()].flatMap(row=>row.moments.map((moment:Row,index:number)=>momentKey(moment,index))));
  for(const moment of moments)if(!assignedMoments.has(momentKey(moment,0))){
   const target=ensureContext({...moment.context,runId:moment.runId,url:moment.context?.url||moment.screenUrl},sourceScreens.filter(screen=>records(screen.moments).some(source=>momentKey(source,0)===momentKey(moment,0))).map(screen=>screen.id));
   target.moments.push(moment);
   if(moment.runId&&Number.isInteger(moment.eventIndex)){
    const matches=(source:Row)=>source?.runId===moment.runId&&source?.eventIndex===moment.eventIndex;
    target.sourceRefs.push(...sourceRefs.filter(matches));
    target.evaluations.push(...evaluations.filter(evaluation=>matches(evaluation.source)||matches(evaluation)));
   }
  }
  const contexts=[...comparisons.values()].map(row=>({...row,...experienceAggregate(row.visits,row.moments,row.sourceRefs,row.evaluations)})).sort((a,b)=>String(a.context.personaName||a.context.personaId||'').localeCompare(String(b.context.personaName||b.context.personaId||''))||String(a.context.environmentId||'').localeCompare(String(b.context.environmentId||''))||String(a.context.build?.id||'').localeCompare(String(b.context.build?.id||''))||a.id.localeCompare(b.id));
  const identities=sourceScreens.map(screen=>screenDisplayIdentity(screen,projectName)),preferred=identities.find(identity=>identity.nameSource==='curated')||identities.find(identity=>identity.nameSource==='recorded')||identities[0];
  const urls=uniqueText(identities.map(identity=>identity.url));
  const states=Object.fromEntries(['visited','interacted','evaluated','verified','inconclusive'].map(state=>[state,sourceScreens.some(screen=>screen.states?.[state])]));
  const status=states.verified?'verified':states.evaluated?'evaluated':states.inconclusive?'inconclusive':states.interacted?'interacted':states.visited?'visited':'not_explored';
  return {id:`page:${key}`,pageKey:key,name:preferred.name,url:urls.length===1?urls[0]:key.startsWith('route:')?key.slice(6):preferred.url,urls,routePattern:key.startsWith('route:')?key.slice(6):'',nameSource:preferred.nameSource,sourceScreens,screenIds:uniqueText(sourceScreens.map(screen=>screen.id)),inInventory:sourceScreens.some(screen=>screen.inInventory),states,status,contexts,environmentIds:uniqueText(contexts.map(row=>row.context.environmentId)),...experienceAggregate(visits,moments,sourceRefs,evaluations)};
 });
}
