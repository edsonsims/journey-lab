import {label,list,ongoing,outcome} from './lib.ts';
import type {Row} from './lib.ts';

export type RelatedFix={fix:Row;roles:string[];sourceFindingIds:string[];status:string;summary:string;href:string};
const ids=(values:unknown[])=>values.filter((value):value is string=>typeof value==='string'&&value.length>0);

/** Follow persisted source and comparison IDs, never persona names or similar wording. */
export function relatedFixesForRun(run:Row,fixes:Row[],findings:Row[]=[]):RelatedFix[]{
 if(!run.id||!run.projectId)return [];
 const result:RelatedFix[]=[],seen=new Set<string>();
 for(const fix of fixes){
  if(!fix.id||seen.has(fix.id)||fix.projectId!==run.projectId)continue;
  const sourceFindingIds=ids([fix.findingId,...list(fix.findingIds),...findings.filter(f=>f.projectId===run.projectId&&f.fixId===fix.id).map(f=>f.id)]);
  const sourceRunIds=ids([fix.runId,...list(fix.sourceRunIds),...findings.filter(f=>f.projectId===run.projectId&&sourceFindingIds.includes(f.id)).map(f=>f.runId)]);
  const roles=new Set<string>();
  if(sourceRunIds.includes(run.id))roles.add('Source journey');
  const rounds=[...list(fix.rounds),...(fix.latestRound?[fix.latestRound]:[])];
  for(const round of rounds){
   for(const comparison of [round.comparison,...list(round.comparisons)].filter(Boolean)){
    for(const pair of list(comparison.pairs)){
     if((pair.beforeRunId||pair.before?.id)===run.id)roles.add('Before fix');
     if((pair.afterRunId||pair.after?.id)===run.id)roles.add('After fix');
    }
   }
  }
  if(!roles.size)continue;
  const latest=rounds.find(r=>r.id===fix.currentRoundId)||fix.latestRound||rounds.at(-1);
  const verification=typeof latest?.verification==='string'?latest.verification:latest?.verification?.status;
  const checks=verification==='passed'?'Checks passed':verification==='failed'?'Checks failed':verification==='not_configured'?'Code checks not configured':verification==='invalidated'?'Checks invalidated':'Checks not verified';
  const comparison=latest?.comparison,pairs=list(comparison?.pairs);
  const successful=pairs.filter(pair=>outcome(pair.after||{})==='goal_reached').length;
  const retest=comparison?.status==='completed'&&pairs.length?`Goal reached in ${successful}/${pairs.length} AI Persona retests`:comparison?`Retest ${label(comparison.status).toLowerCase()}`:'No completed retest';
  const status=fix.status==='awaiting_review'?'Fix ready for review':fix.status==='approved'?'Fix approved':ongoing(fix.status)?'Fix in progress':['failed','interrupted','invalidated'].includes(fix.status)?'Fix needs attention':`Fix · ${label(fix.status)}`;
  result.push({fix,roles:[...roles],sourceFindingIds,status,summary:`Latest candidate: ${checks} · ${retest}`,href:`/projects/${encodeURIComponent(run.projectId)}/fixes/${encodeURIComponent(fix.id)}`});
  seen.add(fix.id);
 }
 return result;
}

export function fixLinkLabel(relation:RelatedFix,entry?:Row):string{
 return entry&&(relation.sourceFindingIds.includes(entry.id)||relation.sourceFindingIds.includes(entry.sourceFindingId)||entry.fixId===relation.fix.id)?'Related fix':'Journey’s fix';
}
