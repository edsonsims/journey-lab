import type {SummaryMetric,SummaryTone} from './collection-summary-metrics.ts';
import type {Row} from './lib.ts';

export type LibrarySummaryKind='memory'|'competitor-profiles'|'competitor-claims'|'competitor-sources'|'competitor-jobs'|'calibration-studies'|'calibration-datasets'|'calibration-mappings'|'calibration-comparison';
const list=(value:unknown):Row[]=>Array.isArray(value)?value:[];
const knownNumber=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const format=(value:number)=>value.toLocaleString('en',{maximumFractionDigits:0});
const metric=(key:string,label:string,value:number,tone:SummaryTone='neutral',title?:string):SummaryMetric=>({key,label,value:format(value),tone,title});
function measured(key:string,label:string,rows:Row[],read:(row:Row)=>unknown):SummaryMetric{
 const values=rows.map(read).filter(knownNumber);
 return {key,label,value:values.length||!rows.length?format(values.reduce((sum,value)=>sum+value,0)):'—',detail:values.length<rows.length?`${values.length}/${rows.length} recorded`:undefined,title:values.length<rows.length?'Only recorded values are included. Missing measurements are not zero.':undefined};
}
const unresolved=(rows:unknown)=>list(rows).some(row=>row.status==='unresolved');
const needsClaimReview=(row:Row)=>['unreviewed','disputed'].includes(row.reviewState)||unresolved(row.contradictions);
const cited=(row:Row)=>list(row.sources).some(source=>!!source.sourceId||!!source.runId);
const confidence=(rows:Row[])=>{
 const known=rows.filter(row=>knownNumber(row.confidence)&&row.confidence<=1);
 return {...metric('low-confidence','Low confidence',known.filter(row=>row.confidence<.65).length,'warning','Recorded confidence below 65%; confidence is a model or reviewer estimate, not a probability of correctness.'),detail:known.length<rows.length?`${known.length}/${rows.length} recorded`:undefined,value:known.length||!rows.length?format(known.filter(row=>row.confidence<.65).length):'—'};
};
function latestComparison(study:Row):Row|undefined{
 const comparisons=[...list(study.comparisons),...Object.values(study.baselineComparison||{}) as Row[]].filter(value=>value&&Array.isArray(value.metrics));
 return comparisons.sort((a,b)=>(Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0))[0];
}

/** The row set is always the filtered collection. Related records are joined by identity. */
export function librarySummary(kind:LibrarySummaryKind,rows:Row[],context:Row={}):{metrics:SummaryMetric[];secondary:SummaryMetric[]}{
 let metrics:SummaryMetric[]=[],secondary:SummaryMetric[]=[];
 if(kind==='memory'){
  metrics=[metric('review','Needs review',rows.filter(row=>['published','disputed'].includes(row.status)).length,'warning'),metric('conflicts','Conflicting entries',rows.filter(row=>unresolved(row.conflicts)).length,'critical'),metric('stale','Stale entries',rows.filter(row=>row.freshness?.status==='stale').length,'warning'),metric('sourced','Sourced entries',rows.filter(cited).length,'positive')];
  secondary=[confidence(rows),metric('returning','Returning-persona entries',rows.filter(row=>row.audience==='persona').length,'neutral','Knowledge addressed to returning personas. Actual retrieval also requires an enabled mission and matching applicability. First-time personas receive none.'),metric('reviewed','Verified',rows.filter(row=>row.status==='verified').length)];
 }else if(kind==='competitor-profiles'){
  const ids=new Set(rows.map(row=>row.id)),claims=list(context.claims).filter(row=>row.subject==='competitor'&&ids.has(row.competitorId));
  const withClaims=rows.filter(row=>claims.some(claim=>claim.competitorId===row.id)).length;
  metrics=[metric('researched','With claims',withClaims,'positive'),metric('unresearched','Without claims',rows.length-withClaims,'warning'),metric('review','Claims to review',claims.filter(needsClaimReview).length,'warning'),metric('stale','Stale claims',claims.filter(row=>row.freshness?.status==='stale').length,'critical')];
  secondary=[metric('active','Active profiles',rows.filter(row=>!row.archived).length),metric('claims','Linked claims',claims.length),measured('urls','Supplied URLs',rows,row=>Array.isArray(row.sourceUrls)?row.sourceUrls.length:null)];
 }else if(kind==='competitor-claims'){
  metrics=[metric('review','Needs review',rows.filter(needsClaimReview).length,'warning'),metric('contradictions','Conflicting claims',rows.filter(row=>unresolved(row.contradictions)).length,'critical'),metric('stale','Stale evidence',rows.filter(row=>row.freshness?.status==='stale').length,'warning'),metric('sourced','Sourced claims',rows.filter(cited).length,'positive')];
  secondary=[metric('verified','Verified',rows.filter(row=>row.reviewState==='verified').length),confidence(rows),measured('citations','Citations',rows,row=>Array.isArray(row.sources)?row.sources.length:null)];
 }else if(kind==='competitor-sources'){
  const ids=new Set(rows.map(row=>row.id)),claims=list(context.claims).filter(claim=>list(claim.sources).some(source=>ids.has(source.sourceId)));
  const used=rows.filter(row=>claims.some(claim=>list(claim.sources).some(source=>source.sourceId===row.id))).length;
  metrics=[metric('used','Used in claims',used,'positive'),metric('unused','Unused sources',rows.length-used,'warning'),metric('claims','Supported claims',claims.length,'blue')];
  secondary=[metric('public','Public snapshots',rows.filter(row=>row.kind==='public_document').length),metric('journeys','Journey references',rows.filter(row=>row.kind==='run_evidence').length),metric('truncated','Truncated snapshots',rows.filter(row=>row.textTruncated===true).length,'warning')];
 }else if(kind==='competitor-jobs'){
  metrics=[metric('active','In progress',rows.filter(row=>['queued','fetching','researching'].includes(row.status)).length,'blue'),metric('failed','Failed',rows.filter(row=>row.status==='failed').length,'critical'),measured('claims','Claims generated',rows,row=>Array.isArray(row.claimIds)?row.claimIds.length:null),measured('sources','Sources captured',rows,row=>Array.isArray(row.sourceIds)?row.sourceIds.length:null)];
  secondary=[metric('completed','Completed',rows.filter(row=>row.status==='completed').length,'positive'),measured('tokens','Recorded tokens',rows,row=>row.receipt?.usage?.total_tokens??row.receipt?.total_tokens),metric('cancelled','Cancelled',rows.filter(row=>row.status==='cancelled').length)];
 }else if(kind==='calibration-studies'){
  const compared=rows.map(latestComparison).filter((row):row is Row=>!!row);
  metrics=[metric('review','Awaiting approval',rows.filter(row=>row.status==='awaiting_review').length,'warning'),metric('adopted','Adjustments adopted',rows.filter(row=>!!row.adoption).length,'positive'),{...metric('disagreement','With behavior gaps',compared.filter(row=>list(row.metrics).some(m=>m.status==='disagreement')).length,'critical','Studies with disagreement in their latest recorded comparison, which may be development or held-out. This is behavioral evidence, not emotional validation.'),value:compared.length||!rows.length?format(compared.filter(row=>list(row.metrics).some(m=>m.status==='disagreement')).length):'—',detail:compared.length<rows.length?`${compared.length}/${rows.length} compared`:undefined},metric('active','In progress',rows.filter(row=>['running','cancelling','adopting'].includes(row.status)).length,'blue')];
  secondary=[metric('real','Real-data studies',rows.filter(row=>row.datasetSnapshot?.source?.kind==='real_import').length),measured('sessions','Synthetic trials',rows,row=>row.usage?.sessions),measured('tokens','Recorded tokens',rows,row=>row.usage?.tokens)];
 }else if(kind==='calibration-datasets'){
  const ids=new Set(rows.map(row=>row.id)),studies=list(context.studies).filter(row=>ids.has(row.datasetSnapshot?.id));
  metrics=[metric('real','Real imports',rows.filter(row=>row.source?.kind==='real_import').length,'positive'),measured('sessions','Reference sessions',rows,row=>row.sessionCount),measured('events','Reference events',rows,row=>row.eventCount),metric('studies','Linked studies',studies.length,'blue')];
  secondary=[metric('fixtures','Fixture datasets',rows.filter(row=>row.source?.kind==='fixture').length),metric('unused','Not yet studied',rows.filter(row=>!studies.some(study=>study.datasetSnapshot?.id===row.id)).length,'warning')];
 }else if(kind==='calibration-mappings'){
  const definitions=rows.flatMap(row=>list(row.metrics)),ids=new Set(rows.map(row=>row.id)),studies=list(context.studies).filter(row=>ids.has(row.mappingSnapshot?.id));
  const known=rows.filter(row=>Array.isArray(row.metrics)).length,mapped=definitions.filter(row=>!!row.realEvent&&!!row.synthetic?.type&&!!row.synthetic?.value);
  const definitionCount=(item:SummaryMetric):SummaryMetric=>({...item,value:known||!rows.length?item.value:'—',detail:known<rows.length?`${known}/${rows.length} mappings recorded`:undefined});
  metrics=[definitionCount(metric('mapped','Mapped behaviors',mapped.length,'positive','Definitions with both a reference event and a synthetic signal. Study comparison still checks compatibility and sample size.')),definitionCount(metric('incomplete','Incomplete definitions',definitions.length-mapped.length,'warning')),metric('studies','Linked studies',studies.length,'blue')];
  secondary=[measured('definitions','Behavior definitions',rows,row=>Array.isArray(row.metrics)?row.metrics.length:null),metric('unused','Not yet used',rows.filter(row=>!studies.some(study=>study.mappingSnapshot?.id===row.id)).length)];
 }else if(kind==='calibration-comparison'){
  metrics=[metric('agreement','Agree',rows.filter(row=>row.status==='agreement').length,'positive'),metric('disagreement','Disagree',rows.filter(row=>row.status==='disagreement').length,'critical'),metric('unresolved','Not comparable yet',rows.filter(row=>!['agreement','disagreement'].includes(row.status)).length,'warning')];
  secondary=[measured('reference','Reference sessions',[context],row=>row.referenceSessions),measured('synthetic','Synthetic trials',[context],row=>row.syntheticSessions)];
 }
 return {metrics,secondary};
}
