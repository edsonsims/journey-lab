import {recordedConditionsKey} from './recorded-conditions.ts';
import {presentEnvironment} from './environment-context.ts';
import type {Row} from './lib.ts';
import {groupExperiencePages} from './insights-data.ts';

const rows=(value:unknown):Row[]=>Array.isArray(value)?value:[];
const text=(value:unknown)=>typeof value==='string'?value.trim():'';
const strings=(values:unknown[])=>[...new Set(values.map(text).filter(Boolean))];
const distinct=(values:Row[],key:(value:Row,index:number)=>string)=>[...new Map(values.map((value,index)=>[key(value,index),value])).values()];
const known=(value:unknown)=>!!text(value)&&value!=='unknown';
const byTime=(a:Row,b:Row)=>(Date.parse(a.createdAt)||0)-(Date.parse(b.createdAt)||0)||text(a.id).localeCompare(text(b.id));
const personaKey=(context:Row)=>known(context.personaId)?context.personaId:`unknown:${context.runId||context.id}`;
const frameRun=(value:Row)=>value.source?.runId||value.runId;
const momentKey=(value:Row,index:number)=>value.id||`${value.runId}:${value.signalIndex??value.eventIndex??index}:${value.originalMs??'unknown'}`;
const evidenceIndex=(value:unknown)=>typeof value==='number'&&Number.isInteger(value)&&value>=0;

/** Only moments actually cited by this finding, inside its own recorded journey. */
export function experienceFindingMoments(finding:Row,moments:Row[]):Row[]{
 const runId=finding.source?.runId||finding.runId;
 if(!runId||(finding.source?.runId&&finding.runId&&finding.source.runId!==finding.runId))return [];
 const indices=new Set<number>([
  ...(Array.isArray(finding.evidence_indices)?finding.evidence_indices:[]),
  ...rows(finding.evidence).filter(item=>!item.runId||item.runId===runId).map(item=>item.index??item.eventIndex)
 ].filter(evidenceIndex));
 if(!indices.size&&evidenceIndex(finding.source?.eventIndex))indices.add(finding.source.eventIndex);
 return moments.filter(moment=>moment.runId===runId&&indices.has(moment.eventIndex));
}

function sourceMoment(finding:Row,moments:Row[]):Row|null{
 const cited=experienceFindingMoments(finding,moments),primary=cited.find(moment=>moment.eventIndex===finding.source?.eventIndex&&(finding.source?.signalIndex==null||moment.signalIndex===finding.source.signalIndex));
 // Informational findings keep their actual anchor, rather than jumping to a happier later screen.
 if(finding.impact==='informational')return primary||cited[0]||null;
 const strength=(moment:Row)=>({negative:1,very_negative:2}[moment.valence as 'negative']||0);
 const preferred=cited.filter(moment=>strength(moment)>0).sort((a,b)=>strength(b)-strength(a)||((a.originalMs??0)-(b.originalMs??0)));
 // The comparison stays within cited evidence even when a screen filter removes the primary frame.
 return preferred[0]||primary||cited[0]||null;
}

function enrichFinding(evaluation:Row,runId:string,run:Row):Row{
 if(evaluation.kind!=='finding'||(run.id&&run.id!==runId))return evaluation;
 const finding=rows(run.findings).find(item=>item.id===evaluation.id&&(!item.runId||item.runId===runId));
 // Keep the insight snapshot's title, triage and original source; fill only retained provenance and detail.
 return finding?{...finding,...evaluation,source:evaluation.source}:evaluation;
}

export type ExperienceVariant=Row&{id:string;label:string;description:string;runIds:string[];kind:'retained'|'environment'};
export type ExperienceCatalog={variants:ExperienceVariant[];comparisons:Row[];runs:Row[];defaultBeforeId:string;defaultAfterId:string};
export type ExperienceSelection={beforeId?:string;afterId?:string;beforeRuns?:Record<string,string>;afterRuns?:Record<string,string>};

/** Selector entries refer to exact recorded runs, never inferred deployment stages. */
export function buildExperienceCatalog(page:Row,sourceRuns:Row[]=[],environments:Row[]=[],impacts:Row[]=[]):ExperienceCatalog{
 const allowed=new Set<string>(strings([...(page.counts?.runIds||[]),...rows(page.moments).map(moment=>moment.runId),...rows(page.visits).map(visit=>visit.context?.runId)]));
 const runMap=new Map<string,Row>();
 for(const run of sourceRuns)if(allowed.has(run.id))runMap.set(run.id,presentEnvironment(run,environments));
 for(const context of rows(page.contexts))for(const id of context.counts?.runIds||[])if(allowed.has(id))runMap.set(id,presentEnvironment({...context.context,id,...runMap.get(id)},environments));
 const variants:ExperienceVariant[]=[],comparisons:Row[]=[],retainedIds=new Set<string>();
 for(const impact of [...impacts].sort(byTime))for(const stage of ['proposal','repair']){
  const pairs=rows(stage==='repair'?impact.report?.repair?.pairs:impact.report?.pairs);
  if(!pairs.some(pair=>allowed.has(pair.beforeRunId||pair.before?.id)||allowed.has(pair.afterRunId||pair.after?.id)))continue;
  const labels=stage==='repair'?{before:impact.proposal?.label||'Proposed',after:'Repaired'}:{before:impact.baseline?.label||'Current',after:impact.proposal?.label||'Proposed'};
  const ids={before:`impact:${impact.id}:${stage}:before`,after:`impact:${impact.id}:${stage}:after`};
  for(const side of ['before','after'] as const){
   const runIds=strings(pairs.map(pair=>pair[`${side}RunId`]||pair[side]?.id)).filter(id=>allowed.has(id));
   if(!runIds.length)continue;
   for(const pair of pairs){const run=pair[side],id=pair[`${side}RunId`]||run?.id;if(id&&allowed.has(id)){runMap.set(id,presentEnvironment({...run,...runMap.get(id),id},environments));retainedIds.add(id);}}
   variants.push({id:ids[side],label:labels[side],description:`${impact.title||'Recorded change'} · ${stage==='repair'?'repair retest':'original comparison'}`,kind:'retained',impactId:impact.id,stage,side,runIds,environmentIds:strings(runIds.map(id=>runMap.get(id)?.environmentId)),buildIds:strings(runIds.map(id=>runMap.get(id)?.build?.id)),createdAt:impact.updatedAt||impact.createdAt});
  }
  comparisons.push({id:`impact:${impact.id}:${stage}`,label:`${labels.before} → ${labels.after}`,beforeId:ids.before,afterId:ids.after,impactId:impact.id,stage,pairs,createdAt:impact.updatedAt||impact.createdAt});
 }
 const environmentGroups=new Map<string,Row[]>();
 for(const run of runMap.values())if(!retainedIds.has(run.id)){
  const environmentId=known(run.environmentId)?run.environmentId:`unknown:${run.id}`,buildId=known(run.build?.id)?run.build.id:`unknown:${run.id}`;
  const key=JSON.stringify([environmentId,run.environmentVersion??null,buildId]);environmentGroups.set(key,[...(environmentGroups.get(key)||[]),run]);
 }
 for(const [key,runs] of environmentGroups){const first=runs[0],env=environments.find(row=>row.id===first.environmentId),hash=text(first.build?.id).replace(/^source:/,'');variants.push({id:`environment:${key}`,label:env?.name||first.environmentName||first.environmentId||'Unknown environment',description:`${hash&&hash!=='unknown'?`Build ${hash.slice(0,8)}`:'Build not recorded'} · environment v${first.environmentVersion??'?'}`,kind:'environment',runIds:runs.sort(byTime).map(run=>run.id),environmentIds:strings(runs.map(run=>run.environmentId)),buildIds:strings(runs.map(run=>run.build?.id))});}
 const preferred=[...comparisons].reverse().find(comparison=>variants.some(v=>v.id===comparison.beforeId)&&variants.some(v=>v.id===comparison.afterId));
 return {variants,comparisons,runs:[...runMap.values()].sort(byTime),defaultBeforeId:preferred?.beforeId||variants[0]?.id||'',defaultAfterId:preferred?.afterId||''};
}

export function experienceRunSlice(page:Row,runId:string,run:Row={}):Row{
 const visits=rows(page.visits).filter(visit=>visit.context?.runId===runId),moments=distinct(rows(page.moments).filter(moment=>moment.runId===runId),momentKey).sort((a,b)=>(a.originalMs??Infinity)-(b.originalMs??Infinity));
 const sourceRefs=rows(page.sourceRefs).filter(source=>source.runId===runId),evaluations=rows(page.evaluations).filter(item=>frameRun(item)===runId).map(item=>enrichFinding(item,runId,run));
 // Reuse the existing source-based count semantics instead of summing context rows.
 const grouped=groupExperiencePages([{id:'slice',name:page.name,routePattern:page.routePattern,visits,moments,sourceRefs,evaluations,states:page.states}])[0];
 const context=presentEnvironment({...run,...(visits[0]?.context||moments[0]?.context||{}),runId});
 const observations=experienceObservations({moments,evaluations}),negative=moments.filter(moment=>['negative','very_negative'].includes(moment.valence));
 const headline=observations[0]?.title||'No sourced observations on this page.';
 const outcome=run.outcome||run.finding?.outcome||null;
 return {...grouped,id:runId,runId,run,context,moments,evaluations,findings:evaluations.filter(item=>item.kind==='finding'),observations,headline,outcome,outcomeLabel:({goal_reached:'Goal reached',obstacle_observed:'Obstacle observed',inconclusive:'Inconclusive'} as Record<string,string>)[outcome]||'Outcome not recorded',tone:negative.length?'negative':moments.some(moment=>['positive','very_positive'].includes(moment.valence))?'positive':'neutral',mission:run.personaSnapshot?.mission||run.persona?.mission||run.charterSnapshot?.mission||'',available:!!(visits.length||moments.length||sourceRefs.length)};
}

/** Short copy is drawn from findings or recorded observations, not invented sentiment deltas. */
export function experienceObservations(slice:Row):Row[]{
 const moments=rows(slice.moments),findings=rows(slice.evaluations).filter(item=>item.kind==='finding'&&text(item.title));
 const weight=(finding:Row)=>({critical:5,high:4,medium:3,low:2,informational:0}[finding.impact as 'critical']??1);
 const relevant=findings.filter(finding=>weight(finding)>0),selected=relevant.length?relevant:findings;
 if(selected.length)return distinct([...selected].sort((a,b)=>weight(b)-weight(a)),item=>text(item.title).toLocaleLowerCase().replace(/\s+/g,' ')).map(finding=>({id:finding.id,title:finding.title,kind:'finding',impact:finding.impact,source:finding.source,moment:sourceMoment(finding,moments),findingIds:[finding.id],runIds:strings([frameRun(finding)]),details:finding.observation||finding.expected||''}));
 const negatives=moments.filter(moment=>['negative','very_negative'].includes(moment.valence)),candidates=negatives.length?negatives:[...moments].reverse();
 return distinct(candidates.filter(moment=>text(moment.observation)),item=>text(item.observation).toLocaleLowerCase().replace(/\s+/g,' ')).slice(0,3).map(moment=>({id:moment.id,title:moment.observation,kind:'moment',source:moment.source||moment,moment,findingIds:moment.findingIds||[],runIds:strings([moment.runId]),details:moment.reaction||''}));
}

function comparisonFor(before:Row|null,after:Row|null,catalog:ExperienceCatalog,beforeId:string,afterId:string):Row{
 if(!afterId)return {status:'single',label:'Single version',issues:[]};
 if(!before||!after)return {status:'missing',label:'Missing journey on one side',issues:['One selected version has no recorded journey for this persona in this scope.']};
 const comparison=catalog.comparisons.find(item=>item.beforeId===beforeId&&item.afterId===afterId),pair=rows(comparison?.pairs).find(pair=>(pair.beforeRunId||pair.before?.id)===before.runId&&(pair.afterRunId||pair.after?.id)===after.runId);
 if(pair)return {status:pair.controls?.status==='matched'?'matched':'mismatch',label:pair.controls?.status==='matched'?'Recorded pair':'Comparison controls differ',issues:rows(pair.controls?.issues).map(item=>typeof item==='string'?item:item.message||item.code||'Recorded comparison control differs'),pair,impactId:comparison?.impactId,stage:comparison?.stage};
 const issues:string[]=[];
 for(const [key,name] of [['personaVersion','Persona version'],['charterId','Mission'],['charterVersion','Mission version'],['device','Device'],['model','Model'],['rubricVersion','Scoring rubric']]){
  if(before.context[key]!==after.context[key])issues.push(`${name} differs between these journeys.`);
 }
 if(recordedConditionsKey(before.context)!==recordedConditionsKey(after.context))issues.push('Device or network configuration differs between these journeys.');
 if(!known(before.context.build?.id)||!known(after.context.build?.id))issues.push('A recorded build identity is missing.');
 return {status:'unpaired',label:issues.length?'Different test conditions':'Unpaired journeys',issues:issues.length?issues:['These journeys were not recorded as a matched comparison.']};
}

/** One visible row per persona, with exact journey picks on each selected side. */
export function buildExperiencePerspectives(page:Row,catalog:ExperienceCatalog,selection:ExperienceSelection={}):Row[]{
 const beforeId=selection.beforeId??catalog.defaultBeforeId,afterId=selection.afterId??catalog.defaultAfterId;
 const beforeVariant=catalog.variants.find(item=>item.id===beforeId),afterVariant=catalog.variants.find(item=>item.id===afterId);
 const selectedIds=new Set([...(beforeVariant?.runIds||[]),...(afterVariant?.runIds||[])]),runMap=new Map(catalog.runs.map(run=>[run.id,run]));
 const groups=new Map<string,Row[]>();
 for(const id of selectedIds){const run=runMap.get(id);if(!run)continue;const key=personaKey(run);groups.set(key,[...(groups.get(key)||[]),run]);}
 const side=(personaId:string,runs:Row[],variant:ExperienceVariant|undefined,requested:Record<string,string>|undefined):Row|null=>{
  const candidates=runs.filter(run=>variant?.runIds.includes(run.id)).sort(byTime);
  if(!candidates.length)return null;
  const chosen=candidates.find(run=>run.id===requested?.[personaId])||candidates.at(-1)!;
  return {...experienceRunSlice(page,chosen.id,chosen),variant,journeys:candidates.map(run=>({id:run.id,name:run.name||run.personaName||run.id,createdAt:run.createdAt,personaVersion:run.personaVersion,charterId:run.charterId,charterVersion:run.charterVersion,device:run.device,environmentId:run.environmentId,build:run.build})),selectionRequired:candidates.length>1,selectionExplicit:!!requested?.[personaId]&&candidates.some(run=>run.id===requested[personaId])};
 };
 return [...groups].map(([id,runs])=>{
  const before=side(id,runs,beforeVariant,selection.beforeRuns),after=side(id,runs,afterVariant,selection.afterRuns),primary=after?.run||before?.run||runs[0];
  return {id,personaId:known(primary.personaId)?primary.personaId:null,name:primary.personaName||primary.personaSnapshot?.name||primary.persona?.name||'Unknown persona',before,after,personaVersions:strings(runs.map(run=>String(run.personaVersion??'unknown'))),comparison:comparisonFor(before,after,catalog,beforeId,afterId),journeyCount:runs.length};
 }).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
}
