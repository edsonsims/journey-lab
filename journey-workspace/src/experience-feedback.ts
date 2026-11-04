import {presentEnvironment} from './environment-context.ts';
import type {Row} from './lib.ts';
import {groupExperiencePages,screenDisplayIdentity} from './insights-data.ts';
import {buildExperienceCatalog,experienceRunSlice,experienceObservations} from './experience-perspectives.ts';
import {experienceScreenState} from './experience-screen-states.ts';
import {deriveExperienceTakeaway} from './experience-takeaways.ts';

const rows=(value:unknown):Row[]=>Array.isArray(value)?value:[];
const text=(value:unknown)=>typeof value==='string'?value.trim():'';
const unique=(values:unknown[])=>[...new Set(values.map(text).filter(Boolean))];
const runIdOf=(value:Row)=>text(value.runId||value.source?.runId||value.context?.runId);
const tone=(valence:unknown)=>({very_negative:'very-negative',negative:'negative',neutral:'neutral',positive:'positive',very_positive:'excellent'}[text(valence)]||'unrated');
const impactWeight=(impact:unknown)=>({critical:5,high:4,medium:3,low:2,informational:1}[text(impact)]||0);
const feedbackType=(value:unknown)=>({broken:'broken',defect:'broken',bug:'broken',technical:'broken',experience:'experience',product:'product',business:'business'}[text(value).toLowerCase()]||'unknown');
const strongestImpact=(findings:Row[])=>[...findings].sort((a,b)=>impactWeight(b.impact)-impactWeight(a.impact))[0]?.impact||null;

function momentIdentity(moment:Row,parentId:string,index:number):string{
 const runId=runIdOf(moment);
 if(runId&&Number.isInteger(moment.signalIndex))return JSON.stringify([runId,'signal',moment.signalIndex]);
 if(text(moment.id))return JSON.stringify([runId,'id',moment.id]);
 if(runId&&Number.isInteger(moment.eventIndex))return JSON.stringify([runId,'event',moment.eventIndex,moment.originalMs??null,moment.observation??null,moment.reaction??null]);
 // Without source identity, two similar anonymous records cannot safely be collapsed.
 return JSON.stringify([parentId,'unidentified',index]);
}
const findingIdentity=(finding:Row,parentId:string,index:number)=>text(finding.id)?JSON.stringify([runIdOf(finding),'finding',finding.id]):JSON.stringify([parentId,'unidentified-finding',index]);

export type ExperienceFeedbackInput={screens:Row[];sourceRuns?:Row[];derivedFeedback?:Row[];environments?:Row[];impacts?:Row[];projectId:string;projectName?:string};
export type ExperienceFeedbackResult={feedback:Row[];takeaways:Row[];pages:Row[]};

/** All recorded feedback, with one source moment per row and no top-N or semantic deduplication. */
export function buildExperienceFeedback({screens,sourceRuns=[],derivedFeedback=[],environments=[],impacts=[],projectId,projectName=''}:ExperienceFeedbackInput):ExperienceFeedbackResult{
 const parents=groupExperiencePages(screens,projectName),feedback:Row[]=[],pageMap=new Map<string,Row>(),momentRows=new Map<string,Row>(),pendingFindings:Row[]=[],seenFindings=new Set<string>();
 const environmentNames=new Map(environments.map(environment=>[environment.id,environment.name]));
 const ensurePage=(parent:Row,state:Row):Row=>{
  const id=`experience-page:${JSON.stringify([parent.id,state.id])}`;
  if(!pageMap.has(id)){
   const identity=screenDisplayIdentity(parent,projectName),name=state.kind==='unknown'?identity.name:state.label,url=parent.url||identity.url;
   pageMap.set(id,{id,name,url,pageName:name,pageUrl:url,parentPageId:parent.id,state,sourcePage:parent,moments:[],evaluations:[],feedbackIds:[],runIds:[],personaIds:[],environmentIds:[]});
  }
  return pageMap.get(id)!;
 };
 const register=(row:Row,page:Row)=>{
  feedback.push(row);page.feedbackIds.push(row.id);if(row.moment)page.moments.push(row.moment);
  page.runIds=unique([...page.runIds,row.runId]);page.personaIds=unique([...page.personaIds,row.personaId]);page.environmentIds=unique([...page.environmentIds,row.environmentId]);
 };
 for(const parent of parents){
  const recordedRunIds=unique([...(parent.counts?.runIds||[]),...rows(parent.evaluations).map(runIdOf)]);
  // A standalone evaluation itself is a scoped source; it may have no recorded signal or visit.
  const catalog=buildExperienceCatalog({...parent,counts:{...parent.counts,runIds:recordedRunIds}},sourceRuns,environments,impacts),runs=new Map(catalog.runs.map(run=>[run.id,run]));
  const sides=new Map(recordedRunIds.map(id=>[id,experienceRunSlice(parent,id,runs.get(id)||{id})]));
  const identityFields=(source:Row,side:Row|null,page:Row)=>{
   const run=side?.run||{},context=presentEnvironment({...run,...side?.context,...source.context},environments),runId=runIdOf(source)||text(side?.runId),personaId=text(context.personaId)||null,environmentId=text(context.environmentId)||null;
   const displayUrl=screenDisplayIdentity({url:source.screenUrl||source.source?.screenUrl||context.url||page.url,routePattern:parent.routePattern}).url;
   return {runId:runId||null,journeyName:text(run.name)||text(context.journeyName)||null,personaId,personaName:context.personaName||run.personaSnapshot?.name||run.persona?.name||'Unknown persona',environmentId,environmentName:environmentNames.get(environmentId)||context.environmentName||environmentId||'Unknown environment',createdAt:context.createdAt||run.createdAt||null,originalMs:source.originalMs??source.source?.originalMs??null,pageId:page.id,pageName:page.name,pageUrl:displayUrl,parentPageId:parent.id,state:page.state,context,journeySide:side};
  };
  rows(parent.moments).forEach((moment,index)=>{
   const key=momentIdentity(moment,parent.id,index);if(momentRows.has(key))return;
   const state=experienceScreenState(projectId,moment),page=ensurePage(parent,state),side=sides.get(runIdOf(moment))||null;
   const row={id:`feedback:${key}`,kind:'moment',title:moment.observation||moment.reaction||'Recorded feedback',observation:moment.observation||'',reaction:moment.reaction||'',valence:moment.valence??null,tone:tone(moment.valence),types:[feedbackType(moment.track)],impact:null,findings:[],moment,source:moment.source||moment,...identityFields(moment,side,page),state};
   momentRows.set(key,row);register(row,page);
  });
  const evaluations=[...sides.values()].flatMap(side=>rows(side.evaluations)),unlocated=rows(parent.evaluations).filter(item=>!runIdOf(item));
  [...evaluations,...unlocated].filter(item=>item.kind==='finding').forEach((finding,index)=>{
   pendingFindings.push({finding,index,parent,side:sides.get(runIdOf(finding))||null,identityFields});
  });
 }
 // Resolve after all routes are present: a finding can cite the discovery on one URL
 // and the actual problem on another. Candidate moments remain inside this source scope.
 const scopedMomentRows=[...momentRows.values()],scopedMoments=scopedMomentRows.map(row=>row.moment),rowForMoment=new Map(scopedMomentRows.map(row=>[row.moment,row]));
 for(const {finding,index,parent,side,identityFields} of pendingFindings){
   const key=findingIdentity(finding,parent.id,index);if(seenFindings.has(key))continue;seenFindings.add(key);
   // One finding at a time preserves informational findings even beside defects.
   const selected=experienceObservations({moments:scopedMoments,evaluations:[{...finding,title:finding.title||'Untitled finding'}]})[0]?.moment||null,linked=selected?rowForMoment.get(selected):null;
   if(linked){
    linked.findings.push(finding);linked.types=unique([...linked.types,feedbackType(finding.type)]);linked.impact=strongestImpact(linked.findings);
    const problem=[...linked.findings].filter(item=>['critical','high','medium','low'].includes(item.impact)&&text(item.title)).sort((a,b)=>impactWeight(b.impact)-impactWeight(a.impact))[0];
    // Informational conclusions can cite an earlier screen; keep that moment's own observation in the feed.
    linked.title=problem?.title||linked.moment.observation||linked.moment.reaction||'Recorded feedback';
    pageMap.get(linked.pageId)!.evaluations.push(finding);
    continue;
   }
   const source=finding.source||finding;
   // A retrospective finding narrative can describe many screens. Only source state/heading may locate an unlinked finding.
   const state=experienceScreenState(projectId,{...source,observation:''}),page=ensurePage(parent,state);
   const row={id:`feedback:${key}`,kind:'finding',title:finding.title||'Untitled finding',observation:finding.observation||'',reaction:finding.personaComment||'',valence:null,tone:'unrated',types:[feedbackType(finding.type)],impact:finding.impact||null,findings:[finding],moment:null,source,...identityFields({...finding,...source,context:side?.context},side,page),state};
   register(row,page);page.evaluations.push(finding);
 }
 for(const parent of parents)if(![...pageMap.values()].some(page=>page.parentPageId===parent.id))ensurePage(parent,experienceScreenState(projectId,{}));
 feedback.sort((a,b)=>(Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0)||String(a.runId||'').localeCompare(String(b.runId||''))||(a.originalMs??Infinity)-(b.originalMs??Infinity)||a.id.localeCompare(b.id));
 const pages=[...pageMap.values()].map((page):Row=>{
  const evaluations=new Map<string,Row>();
  [...rows(page.sourcePage.evaluations),...rows(page.evaluations)].forEach((evaluation,index)=>{
   const key=text(evaluation.id)?JSON.stringify([evaluation.kind,runIdOf(evaluation),evaluation.id]):`unidentified:${index}`;
   evaluations.set(key,evaluation);
  });
  // A finding first indexed on another route still belongs in this page's comparison
  // when its exact cited problem moment is here. The original grouping stays intact.
  return {...page,comparisonPage:{...page.sourcePage,evaluations:[...evaluations.values()]}};
 }).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
 // Keep every recorded moment for existing deep links and full journey details.
 // The Experience feed is a separate, source-grounded view of meaningful feedback.
 const derivedById=new Map(rows(derivedFeedback).filter(item=>text(item?.id)).map(item=>[item.id,item]));
 const takeaways=feedback.flatMap(row=>{const takeaway=deriveExperienceTakeaway({...row,derivedFeedback:derivedById.get(row.id)});return takeaway?[{...row,title:takeaway.summary,why:takeaway.why,takeaway}]:[];});
 return {feedback,takeaways,pages};
}
