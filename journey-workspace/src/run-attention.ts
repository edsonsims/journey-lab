import type {Row} from './lib.ts';

export type AttentionCategory='all'|'attention'|'critical'|'review'|'blocked';
export type RunAttentionReason={
 blocked:boolean;
 criticalFindingIds:string[];
 reviewFixIds:string[];
 /** Critical, review, blocked, then no recorded attention. */
 rank:0|1|2|3;
};
export type RunAttention={
 blockedRuns:Row[];
 criticalFindings:Row[];
 reviewFixes:Row[];
 byRun:Map<string,RunAttentionReason>;
 counts:{blocked:number;critical:number;review:number;runs:number};
};
export type RunAttentionInput={
 runs?:readonly Row[];
 findings?:readonly Row[];
 fixes?:readonly Row[];
 issues?:readonly Row[];
};

const hasId=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0;
function uniqueRows(rows:readonly Row[]=[]):Row[]{
 const seen=new Set<string>();
 return rows.filter(row=>{
  if(!row||!hasId(row.id)||seen.has(row.id))return false;
  seen.add(row.id);return true;
 });
}

/** Use recorded outcomes and effective, reviewed findings; reactions are not severity. */
export function buildRunAttention({runs=[],findings=[],fixes=[],issues=[]}:RunAttentionInput={}):RunAttention{
 const knownRuns=uniqueRows(runs),knownFindings=uniqueRows(findings);
 const findingById=new Map(knownFindings.map(finding=>[finding.id,finding]));
 const issueById=new Map(uniqueRows(issues).map(issue=>[issue.id,issue]));
 const byRun=new Map<string,RunAttentionReason>(knownRuns.map(run=>[run.id,{blocked:false,criticalFindingIds:[],reviewFixIds:[],rank:3}]));

 // A runner restriction can have status=blocked without a product obstacle.
 const blockedRuns=knownRuns.filter(run=>['obstacle_observed','blocked'].includes(run.outcome||run.finding?.outcome));
 for(const run of blockedRuns)byRun.get(run.id)!.blocked=true;

 const criticalFindings=knownFindings.filter(finding=>{
  if(finding.impact!=='critical'||['dismissed','duplicate'].includes(finding.triage))return false;
  const issue=hasId(finding.issueId)?issueById.get(finding.issueId):undefined;
  // A candidate's successful retest is not an explicit issue resolution.
  return !issue||Boolean(issue.mergedInto)||issue.status!=='resolved';
 });
 for(const finding of criticalFindings)byRun.get(finding.runId)?.criticalFindingIds.push(finding.id);

 const reviewFixes=uniqueRows(fixes).filter(fix=>fix.status==='awaiting_review');
 for(const fix of reviewFixes){
  const sourceRunIds=Array.isArray(fix.sourceRunIds)?fix.sourceRunIds:[];
  const findingIds=new Set([fix.findingId,...(Array.isArray(fix.findingIds)?fix.findingIds:[])].filter(hasId));
  const findingRunIds=[...findingIds].map(id=>findingById.get(id)?.runId);
  // Only explicit sources own the review action; comparison recordings do not.
  const runIds=new Set([fix.runId,...sourceRunIds,...findingRunIds].filter(hasId));
  for(const runId of runIds)byRun.get(runId)?.reviewFixIds.push(fix.id);
 }
 for(const reasons of byRun.values())reasons.rank=reasons.criticalFindingIds.length?0:reasons.reviewFixIds.length?1:reasons.blocked?2:3;

 return {blockedRuns,criticalFindings,reviewFixes,byRun,counts:{
  blocked:blockedRuns.length,critical:criticalFindings.length,review:reviewFixes.length,
  runs:[...byRun.values()].filter(reasons=>reasons.rank<3).length,
 }};
}

/** Keep the caller's chronology within each attention priority, without mutation. */
export function sortRunsByAttention<T extends Row>(rows:readonly T[],attention:RunAttention):T[]{
 return rows.map((row,index)=>({row,index,rank:attention.byRun.get(row.id)?.rank??3}))
  .sort((a,b)=>a.rank-b.rank||a.index-b.index).map(item=>item.row);
}

export function runMatchesAttention(runId:string,category:AttentionCategory,attention:RunAttention):boolean{
 if(category==='all')return true;
 const reasons=attention.byRun.get(runId);
 if(!reasons)return false;
 if(category==='attention')return reasons.rank<3;
 if(category==='critical')return reasons.criticalFindingIds.length>0;
 if(category==='review')return reasons.reviewFixIds.length>0;
 return reasons.blocked;
}
