import {ongoing,outcome,totals} from './lib.ts';
import type {Row} from './lib.ts';
import {configuredEnvironments} from './environment-context.ts';
import {buildRunAttention} from './run-attention.ts';

const text=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0;
const number=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const rows=(value:unknown):Row[]=>Array.isArray(value)?value.filter(row=>row&&typeof row==='object'&&!Array.isArray(row)):[];
const unique=(items:Row[])=>{const seen=new Set<string>();return items.filter(row=>{if(!text(row.id)||seen.has(row.id))return false;seen.add(row.id);return true;});};
const experimental=(row:Row)=>Boolean(row.experimental||row.experimentalStudyId||row.calibrationStudyId||row.calibrationTrialId||row.experimentalCandidateId);
const invalidated=(row:Row)=>row.status==='invalidated'||row.integrityStatus==='invalidated';
const eligible=(row:Row)=>!experimental(row)&&!invalidated(row);
const complete=(row:Row)=>['finished','completed'].includes(row.status);
const stopped=(row:Row)=>['failed','interrupted','cancelled','canceled','incomplete','blocked'].includes(row.status);
const problem=(row:Row)=>['critical','high','medium','low'].includes(row.impact);
const productObstacle=(row:Row)=>complete(row)&&['obstacle_observed','blocked'].includes(outcome(row));
const goal=(row:Row)=>complete(row)&&outcome(row)==='goal_reached';
const percentage=(numerator:number,denominator:number)=>denominator>0?numerator/denominator*100:null;
const timestamp=(row:Row)=>{
 const value=Date.parse(row.createdAt||row.startedAt||'');
 return Number.isFinite(value)?value:-Infinity;
};

export type DashboardPersonaOutcomes={
 /** A null ID represents journeys without a recorded persona identity. */
 persona:Row;
 current:boolean;
 journeys:number;
 completed:number;
 assessed:number;
 goalsReached:number;
 productObstacles:number;
 goalRate:number|null;
 withFriction:number;
 openFindings:number;
 openHighImpactFindings:number;
};
export type DashboardDailyActivity={
 from:string;
 to:string;
 timeZone:'UTC';
 days:{date:string;total:number;goalsReached:number;productObstacles:number;other:number}[];
 total:number;
 undatedCount:number;
 outsideWindowCount:number;
 futureCount:number;
};

/** Counts sessions by their recorded creation day, not by their most recent edit. */
function dailyActivity(runs:Row[],now:number):DashboardDailyActivity{
 const dayMs=86_400_000,end=Math.floor(now/dayMs)*dayMs,start=end-13*dayMs;
 const days=Array.from({length:14},(_,index)=>({date:new Date(start+index*dayMs).toISOString().slice(0,10),total:0,goalsReached:0,productObstacles:0,other:0}));
 let undatedCount=0,outsideWindowCount=0,futureCount=0;
 for(const run of runs){
  const at=timestamp(run);
  if(!Number.isFinite(at)){undatedCount++;continue;}
  if(at>now){futureCount++;continue;}
  if(at<start){outsideWindowCount++;continue;}
  const day=days[Math.floor((at-start)/dayMs)];
  day.total++;
  if(goal(run))day.goalsReached++;
  else if(productObstacle(run))day.productObstacles++;
  else day.other++;
 }
 return {from:days[0].date,to:days[13].date,timeZone:'UTC',days,total:days.reduce((sum,day)=>sum+day.total,0),undatedCount,outsideWindowCount,futureCount};
}

export type ProjectDashboardSummary={
 projectId:string|null;
 eligibleRuns:Row[];
 completedCount:number;
 inProgressCount:number;
 incompleteCount:number;
 unknownStatusCount:number;
 goalReachedCount:number;
 productBlockedCount:number;
 /** Assessed means a finished journey with a recorded goal or product obstacle. */
 goalAttainment:{reached:number;assessed:number;rate:number|null};
 /** Historical problem observations remain friction even after explicit resolution. */
 friction:{affectedCompleted:number;completed:number;rate:number|null;openHighImpactCount:number;affectedPersonas:number};
 /** All eligible records without a conclusive completed goal/product-block outcome. */
 unknownOutcomeCount:number;
 unassessedCompletedCount:number;
 findings:Row[];
 findingCount:number;
 openFindings:Row[];
 openFindingCount:number;
 pendingReviewFixes:Row[];
 pendingReviewFixCount:number;
 fixPipeline:{total:number;inProgress:number;awaitingReview:number;approved:number;needsWork:number;other:number};
 personaOutcomes:DashboardPersonaOutcomes[];
 dailyActivity:DashboardDailyActivity;
 /** Newest created first; the caller chooses the number to display. */
 recentRuns:Row[];
 personas:Row[];
 personaCount:number;
 environments:Row[];
 environmentCount:number;
 tokens:{reportedTotal:number|null;knownRuns:number;partialRuns:number;unknownRuns:number;totalRuns:number};
 scope:{available:boolean;loaded:number;total:number|null;eligible:number;excluded:number;excludedInvalidated:number;excludedExperimental:number;unscopedRuns:number;partial:boolean|null};
};

/**
 * A read-only summary of the selected project's loaded ordinary journeys.
 * Bootstrap findings span the whole history, but their lightweight sourceRun
 * omits integrity/experiment flags: only loaded eligible source runs may support
 * these findings and fix counts. Page totals describe raw history, not eligible
 * evidence. Rates use explicit denominators within loaded evidence; no
 * all-project outcome or improvement trend is inferred from a partial page.
 */
export function projectDashboardSummary(data:Row={},now:number=Date.now()):ProjectDashboardSummary{
 const projectId=text(data.projectId)?data.projectId:null;
 const available=Boolean(projectId)&&Array.isArray(data.runs);
 const projectRows=(value:unknown)=>unique(rows(value).filter(row=>projectId&&row.projectId===projectId));
 const loaded=projectRows(data.runs),eligibleRuns=loaded.filter(eligible);
 const eligibleIds=new Set(eligibleRuns.map(run=>run.id));
 // Associated rows may inherit a project through an exact loaded source link;
 // an explicit conflicting project always wins over that inference.
 const sameProject=(row:Row)=>!text(row.projectId)||row.projectId===projectId;
 const sourceFindings=unique(rows(data.findings).filter(sameProject));
 const findings=sourceFindings.filter(finding=>eligible(finding)&&eligibleIds.has(finding.runId)&&!['dismissed','duplicate'].includes(finding.triage));
 const issues=projectRows(data.issues),issueById=new Map(issues.map(issue=>[issue.id,issue]));
 // Mirrors collection-summary-metrics' effective problem criteria. A successful
 // retest does not resolve a finding; its issue must have an explicit resolution.
 const openFindings=findings.filter(finding=>problem(finding)&&finding.triage!=='resolved'&&issueById.get(finding.issueId)?.status!=='resolved');
 const findingById=new Map(sourceFindings.map(finding=>[finding.id,finding]));
 const findingIds=(fix:Row)=>[fix.findingId,...(Array.isArray(fix.findingIds)?fix.findingIds:[])].filter(text);
 const sourceIds=(fix:Row)=>new Set([
  fix.runId,...(Array.isArray(fix.sourceRunIds)?fix.sourceRunIds:[]),
  ...findingIds(fix).map(id=>findingById.get(id)?.runId),
 ].filter(text));
 const fixes=unique(rows(data.fixes).filter(fix=>{
  if(!sameProject(fix)||!eligible(fix))return false;
  if(findingIds(fix).some(id=>{const finding=findingById.get(id);return !finding||!eligible(finding)||!text(finding.runId);}))return false;
  const sources=[...sourceIds(fix)];
  return sources.length>0&&sources.every(id=>eligibleIds.has(id));
 }));
 const pendingReviewFixes=buildRunAttention({runs:eligibleRuns,findings,fixes,issues}).reviewFixes;
 const completed=eligibleRuns.filter(complete),completedCount=completed.length;
 const inProgressCount=eligibleRuns.filter(run=>ongoing(run.status)).length;
 const incompleteCount=eligibleRuns.filter(stopped).length;
 const goalReachedCount=completed.filter(goal).length;
 const productBlockedCount=completed.filter(productObstacle).length;
 const assessed=goalReachedCount+productBlockedCount;
 const problemRunIds=new Set(findings.filter(problem).map(finding=>finding.runId));
 const withFriction=completed.filter(run=>problemRunIds.has(run.id));
 const highImpact=openFindings.filter(finding=>['critical','high'].includes(finding.impact));
 const inProgressFixes=fixes.filter(fix=>['queued','preparing','running','generating','verifying','retesting'].includes(fix.status)).length;
 const approvedFixes=fixes.filter(fix=>fix.status==='approved').length;
 const needsWorkFixes=fixes.filter(fix=>['changes_requested','failed','interrupted','rejected'].includes(fix.status)).length;
 const tokenRows=eligibleRuns.map(run=>({run,value:totals(run)})).filter(item=>number(item.value));
 const reportedTotal=tokenRows.length?tokenRows.reduce((sum,item)=>sum+item.value,0):available&&!eligibleRuns.length?0:null;
 const personas=projectRows(data.personas).filter(row=>!row.archived);
 const personaById=new Map(projectRows(data.personas).map(persona=>[persona.id,persona]));
 const currentPersonaIds=new Set(personas.map(persona=>persona.id));
 // Keep historical perspectives visible even if their current profile is archived
 // or unavailable. Missing IDs are one explicit unassigned bucket, not a persona.
 const personaIds=new Set<string|null>([...personas.map(persona=>persona.id),...eligibleRuns.map(run=>text(run.personaId)?run.personaId:null)]);
 const personaOutcomes=[...personaIds].map(id=>{
  const runs=eligibleRuns.filter(run=>(text(run.personaId)?run.personaId:null)===id),runIds=new Set(runs.map(run=>run.id));
  const recorded=runs[0],profile=id?personaById.get(id):null;
  const persona=profile||{id,name:id?(recorded?.personaName||recorded?.personaSnapshot?.name||recorded?.persona?.name||id):'Unassigned journeys'};
  const goalsReached=runs.filter(goal).length,productObstacles=runs.filter(productObstacle).length,assessed=goalsReached+productObstacles;
  return {persona,current:id!==null&&currentPersonaIds.has(id),journeys:runs.length,completed:runs.filter(complete).length,assessed,goalsReached,productObstacles,goalRate:percentage(goalsReached,assessed),withFriction:runs.filter(run=>complete(run)&&problemRunIds.has(run.id)).length,openFindings:openFindings.filter(finding=>runIds.has(finding.runId)).length,openHighImpactFindings:highImpact.filter(finding=>runIds.has(finding.runId)).length};
 }).sort((a,b)=>b.openHighImpactFindings-a.openHighImpactFindings||b.productObstacles-a.productObstacles||b.journeys-a.journeys||String(a.persona.name||a.persona.id).localeCompare(String(b.persona.name||b.persona.id)));
 const environments=configuredEnvironments(projectRows(data.environments)).filter(row=>!row.archived);
 const pageTotal=data.runsPage?.total;
 const total=available&&number(pageTotal)&&Number.isSafeInteger(pageTotal)&&pageTotal>=loaded.length?pageTotal:null;
 return {
  projectId,eligibleRuns,completedCount,inProgressCount,incompleteCount,
  unknownStatusCount:eligibleRuns.length-completedCount-inProgressCount-incompleteCount,
  goalReachedCount,productBlockedCount,unknownOutcomeCount:eligibleRuns.length-goalReachedCount-productBlockedCount,
  goalAttainment:{reached:goalReachedCount,assessed,rate:percentage(goalReachedCount,assessed)},
  friction:{affectedCompleted:withFriction.length,completed:completedCount,rate:Array.isArray(data.findings)?percentage(withFriction.length,completedCount):null,openHighImpactCount:highImpact.length,affectedPersonas:new Set(withFriction.map(run=>run.personaId).filter(text)).size},
  unassessedCompletedCount:completedCount-goalReachedCount-productBlockedCount,
  findings,findingCount:findings.length,openFindings,openFindingCount:openFindings.length,
  pendingReviewFixes,pendingReviewFixCount:pendingReviewFixes.length,
  fixPipeline:{total:fixes.length,inProgress:inProgressFixes,awaitingReview:pendingReviewFixes.length,approved:approvedFixes,needsWork:needsWorkFixes,other:fixes.length-inProgressFixes-pendingReviewFixes.length-approvedFixes-needsWorkFixes},
  personaOutcomes,dailyActivity:dailyActivity(eligibleRuns,now),
  recentRuns:[...eligibleRuns].sort((a,b)=>timestamp(b)-timestamp(a)||String(a.id).localeCompare(String(b.id))),
  personas,personaCount:personas.length,environments,environmentCount:environments.length,
  tokens:{reportedTotal,knownRuns:tokenRows.length,partialRuns:tokenRows.filter(({run})=>run.tokens?.partial===true).length,unknownRuns:eligibleRuns.length-tokenRows.length,totalRuns:eligibleRuns.length},
  scope:{available,loaded:loaded.length,total,eligible:eligibleRuns.length,excluded:loaded.length-eligibleRuns.length,
   excludedInvalidated:loaded.filter(invalidated).length,excludedExperimental:loaded.filter(experimental).length,
   unscopedRuns:rows(data.runs).filter(run=>!text(run.projectId)).length,partial:total===null?null:loaded.length<total},
 };
}
