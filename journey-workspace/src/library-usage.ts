import {collectionSummary,IMPACT_ORDER} from './collection-summary-metrics.ts';
import type {CollectionSummaryData,SummaryContext,SummaryMetric} from './collection-summary-metrics.ts';
import type {Row} from './lib.ts';

export type LibraryUsage={
 byRun:Map<string,Row[]>;
 findings:Row[];
 findingsAvailable:boolean;
 filterRows:Row[];
 summary:CollectionSummaryData;
};
const hasId=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0;
const isRow=(value:unknown):value is Row=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const format=(value:number)=>value.toLocaleString('en');
const severity=(finding:Row)=>{const index=IMPACT_ORDER.indexOf(finding.impact);return index<0?IMPACT_ORDER.length:index;};

/** The supplied, filtered journeys define the scope; findings never expand it. */
export function buildLibraryUsage(runs:Row[],data:Row={}):LibraryUsage{
 const runById=new Map(runs.filter(run=>hasId(run.id)).map(run=>[run.id,run]));
 const findingsAvailable=Array.isArray(data.findings),seen=new Set<string>();
 const findings:Row[]=(findingsAvailable?data.findings:[]).filter((finding:unknown):finding is Row=>{
  if(!isRow(finding)||!hasId(finding.runId))return false;
  const run=runById.get(finding.runId);
  if(!run||(hasId(run.projectId)&&hasId(finding.projectId)&&run.projectId!==finding.projectId))return false;
  if(hasId(finding.id)){if(seen.has(finding.id))return false;seen.add(finding.id);}
  return true;
 });
 const byRun=new Map<string,Row[]>([...runById.keys()].map(id=>[id,[]]));
 for(const finding of findings)byRun.get(finding.runId)!.push(finding);
 for(const group of byRun.values())group.sort((a,b)=>severity(a)-severity(b));
 // This view includes the whole recorded history, not only currently open findings.
 const filterRows=findingsAvailable?runs.map(run=>{
  const impactCounts:Record<string,number>=Object.fromEntries(IMPACT_ORDER.map(impact=>[impact,0]));
  for(const finding of byRun.get(run.id)||[])impactCounts[IMPACT_ORDER.includes(finding.impact)?finding.impact:'untriaged']++;
  return {...run,impactCounts};
 }):runs;

 const context:SummaryContext={
  ...(findingsAvailable?{findings}:{}),
  ...(Array.isArray(data.issues)?{issues:data.issues}:{}),
  ...(Array.isArray(data.fixes)?{fixes:data.fixes}:{}),
 };
 const journeys=collectionSummary('runs',filterRows,context);
 const recorded=collectionSummary('findings',findings,context);
 const available=findingsAvailable||runs.length===0;
 const metric=(key:string,label:string,value:number,tone:SummaryMetric['tone']='neutral'):SummaryMetric=>({
  key,label,value:available?format(value):'—',tone,
  ...(!available?{title:'Finding details are not available in this view. Missing records are not zero.'}:{}),
 });
 const problems=recorded.metrics.find(item=>item.key==='problems')!;
 const metrics:SummaryMetric[]=[
  {...metric('findings','Recorded findings',findings.length,'blue'),...(available?{title:'Distinct recorded findings linked to the visible journeys, including informational, dismissed, duplicate, and resolved observations.'}:{})},
  {...metric('findingRuns','Journeys with findings',[...byRun.values()].filter(group=>group.length>0).length),...(available?{title:'Visible journeys with at least one linked finding. Several findings from one journey count as one journey.'}:{})},
  journeys.metrics.find(item=>item.key==='goals')!,
  available?problems:{...problems,value:'—',title:'Finding details are not available in this view. Missing records are not zero.'},
 ];
 const secondary=[
  ...journeys.metrics.filter(item=>item.key!=='goals'),
  ...(findingsAvailable?recorded.metrics.filter(item=>['priority','unreviewed'].includes(item.key)):[]),
  ...journeys.secondary.filter(item=>!['findings','priority'].includes(item.key)),
 ];
 return {byRun,findings,findingsAvailable,filterRows,summary:{metrics,secondary,
  impacts:findingsAvailable?recorded.impacts:[],
  ...(!available?{impactDetail:'Finding details are unavailable for these journeys.'}:{}),
 }};
}
