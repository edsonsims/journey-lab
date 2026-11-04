import {list} from './lib.ts';
import type {Row} from './lib.ts';
import type {SummaryMetric,SummaryTone} from './collection-summary-metrics.ts';
import {impactStagePairs,impactSummary,repairRecordingsComplete} from './change-impact.ts';

const ids=(values:unknown[])=>new Set(values.filter(value=>typeof value==='string'&&value.trim()&&value!=='unknown')).size;
const metric=(key:string,label:string,value:number,tone:SummaryTone='neutral',detail?:string):SummaryMetric=>({key,label,value:value.toLocaleString('en'),tone,detail});
export function experienceSummary(rows:Row[],pageView=false){
 const hurts=rows.filter(row=>['friction','unmet_need'].includes(row.takeaway?.kind));
 return {metrics:[
  metric('friction','Friction & gaps',hurts.length,'critical'),
  metric('benefits','Benefits',rows.filter(row=>row.takeaway?.kind==='benefit').length,'positive'),
  metric('questions','Open questions',rows.filter(row=>row.takeaway?.kind==='uncertainty').length,'warning'),
  metric('affected',pageView?'Personas affected':'Pages with friction',ids(hurts.map(row=>pageView?row.personaId:row.pageId)),'blue')
 ],secondary:[metric('personas','Personas',ids(rows.map(row=>row.personaId))),metric('journeys','Journeys',ids(rows.map(row=>row.runId))),...(!pageView?[metric('pages','Pages',ids(rows.map(row=>row.pageId)))]:[])]};
}

export function coverageSummary(rows:Row[],denominator:Row|null|undefined){
 const known=rows.filter(row=>row.inInventory===true),unexplored=known.filter(row=>row.states?.visited===false).length;
 const inventoryKnown=typeof denominator?.screens==='number'&&Number.isFinite(denominator.screens)&&denominator.screens>=0;
 const missingStates=known.filter(row=>typeof row.states?.visited!=='boolean').length;
 const metrics:SummaryMetric[]=[
  metric('visited','Visited',rows.filter(row=>row.states?.visited===true).length,'blue'),
  metric('evaluated','Evaluated',rows.filter(row=>row.states?.evaluated===true).length,'blue'),
  metric('verified','Outcome verified',rows.filter(row=>row.states?.verified===true).length,'positive'),
  {...metric('unexplored','Unexplored',unexplored,'warning'),value:inventoryKnown?String(unexplored):'—',detail:!inventoryKnown?'Inventory not defined':missingStates?`${missingStates} ${missingStates===1?'state':'states'} unknown`:'Known screens in this view'}
 ];
 metrics[0].title='Visible screens with a recorded visit. A visit does not establish that the screen was tested or its outcome verified.';
 metrics[1].title='Visible screens with recorded evaluations or signals. Evaluation is distinct from a verified outcome.';
 metrics[2].title='Visible screens with an explicit verified outcome in the recorded results.';
 return {metrics,secondary:[metric('journeys','Journeys',ids(rows.flatMap(row=>list(row.counts?.runIds)))),metric('unmapped','Unmapped screens',rows.filter(row=>row.inInventory!==true).length),{key:'inventory',label:'Inventory',value:inventoryKnown?`${known.length} known screens in view`:'Not defined',title:inventoryKnown?`${denominator!.screens} screens in the ${denominator!.completeness||'recorded'} inventory. Only screens matching the current filters are summarized.`:'No product-wide coverage percentage can be established without a screen inventory.'} as SummaryMetric]};
}

export function changeImpactSummary(rows:Row[]){
 const pairs=rows.flatMap(row=>impactStagePairs(row,'proposal')),summary=impactSummary(pairs);
 const missing=rows.reduce((count,row)=>{const present=new Set(impactStagePairs(row,'proposal').map(pair=>pair.personaId));return count+list(row.personas).filter(persona=>persona.personaId&&!present.has(persona.personaId)).length;},0);
 return {metrics:[
  metric('regressions','Goal regressions',summary.regressions,'critical','Persona comparisons'),
  metric('more-actions','More actions',summary.moreActions,'warning','Persona comparisons'),
  metric('pending','Without a conclusion',summary.pending+summary.inconclusive+missing,'warning'),
  {...metric('repair-retests','Repair retests recorded',rows.filter(repairRecordingsComplete).length,'positive'),title:'Changes with before-and-after repair recordings for every selected persona. Recordings alone do not establish an approved or successful fix.'}
 ],secondary:[metric('personas','Distinct personas',ids(rows.flatMap(row=>list(row.personas).map(persona=>persona.personaId)))),metric('comparisons','Comparisons',pairs.length),metric('improvements','Goal improvements',summary.improvements),metric('fewer-actions','Fewer actions',summary.fewerActions)]};
}

export function impactStageSummary(pairs:Row[]){
 const summary=impactSummary(pairs);
 return {metrics:[metric('regressions','Goal regressions',summary.regressions,'critical'),metric('improvements','Goal improvements',summary.improvements,'positive'),metric('more-actions','More actions',summary.moreActions,'warning'),metric('pending','Without a conclusion',summary.pending+summary.inconclusive,'warning')],secondary:[metric('fewer-actions','Fewer actions',summary.fewerActions),metric('comparable','Comparable pairs',summary.personas-summary.pending-summary.inconclusive)]};
}
