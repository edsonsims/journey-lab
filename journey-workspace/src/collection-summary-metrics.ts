import {duration,ongoing,outcome,totals} from './lib.ts';
import type {Row} from './lib.ts';

export type CollectionKind='runs'|'findings'|'issues'|'fixes'|'environments'|'personas'|'charters';
export type SummaryTone='neutral'|'blue'|'positive'|'warning'|'critical';
export type SummaryMetric={key:string;label:string;value:string;detail?:string;title?:string;tone?:SummaryTone};
export type ImpactTotal={impact:string;count:number};
export type CollectionSummaryData={metrics:SummaryMetric[];secondary:SummaryMetric[];impacts:ImpactTotal[];impactDetail?:string};
export type SummaryContext={runs?:Row[];findings?:Row[];fixes?:Row[];issues?:Row[]};
export const IMPACT_ORDER=['critical','high','medium','low','informational','untriaged'] as const;
const valid=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const present=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0;
const count=(value:number)=>Intl.NumberFormat('en',{maximumFractionDigits:0}).format(value);
export const compactNumber=(value:number)=>Intl.NumberFormat('en',{notation:value>=100000?'compact':'standard',maximumFractionDigits:1}).format(value);
export function elapsedLabel(ms:number){const seconds=Math.floor(ms/1000),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60);return hours?`${hours}h ${minutes}m`:minutes?`${minutes}m ${seconds%60}s`:`${seconds}s`;}
export function measuredTotal(rows:Row[],read:(row:Row)=>unknown){const values=rows.map(read).filter(valid);return {value:values.reduce((a,b)=>a+b,0),known:values.length,total:rows.length};}
const metric=(key:string,label:string,value:number,tone:SummaryTone='neutral'):SummaryMetric=>({key,label,value:count(value),tone});
function measured(key:string,label:string,rows:Row[],read:(row:Row)=>unknown,format=compactNumber):SummaryMetric{
 const total=measuredTotal(rows,read);
 return {key,label,value:total.known||!rows.length?format(total.value):'—',detail:total.known<rows.length?`${total.known}/${rows.length} known`:undefined,
  title:total.known<rows.length?`Only ${total.known} of ${rows.length} visible records have this measurement. Missing values are not zero.`:undefined};
}
function countsForRun(run:Row):Row|null{
 const counts=run.impactCounts;
 return counts&&typeof counts==='object'&&!Array.isArray(counts)&&Object.keys(counts).every(key=>IMPACT_ORDER.includes(key as typeof IMPACT_ORDER[number]))&&Object.values(counts).every(valid)?counts:null;
}
function nullableLength(value:unknown){return Array.isArray(value)?value.length:null;}
export const fixRoundCount=(fix:Row)=>valid(fix.roundCount)?fix.roundCount:nullableLength(fix.rounds);
export const fixOpenComments=(fix:Row)=>valid(fix.openComments)?fix.openComments:Array.isArray(fix.comments)?fix.comments.filter((comment:Row)=>!comment.resolved).length:null;
const uniqueRows=(rows:Row[])=>rows.filter((row,index)=>!present(row.id)||rows.findIndex(other=>other.id===row.id)===index);
const issueMap=(context?:SummaryContext)=>new Map((context?.issues||[]).map(issue=>[issue.id,issue]));
function isProblem(finding:Row,issues:Map<string,Row>){
 if(!['critical','high','medium','low'].includes(finding.impact)||['dismissed','duplicate','resolved'].includes(finding.triage))return false;
 const issue=issues.get(finding.issueId);
 return !issue||issue.status!=='resolved';
}
function relatedFixRuns(fix:Row,findings:Row[]):Set<string>{
 const findingIds=new Set([fix.findingId,...(Array.isArray(fix.findingIds)?fix.findingIds:[])].filter(present));
 return new Set([fix.runId,...(Array.isArray(fix.sourceRunIds)?fix.sourceRunIds:[]),...findings.filter(f=>findingIds.has(f.id)).map(f=>f.runId)].filter(present));
}
function knownOutcome(run:Row){
 if(ongoing(run.status)||['failed','invalidated','cancelled','canceled','incomplete'].includes(run.status)||run.integrityStatus==='invalidated')return '';
 const recorded=outcome(run);
 return ['goal_reached','obstacle_observed','blocked'].includes(recorded)?recorded:'';
}
function contextMetric(key:string,label:string,value:number,available:boolean,empty:boolean,tone:SummaryTone='neutral'):SummaryMetric{
 return {...metric(key,label,value,tone),value:available||empty?count(value):'—',title:available||empty?undefined:'Related records are not available in this view.'};
}
function linkedIssueJourneys(rows:Row[],context?:SummaryContext){
 const runs=new Set<string>();let known=0;
 const byFinding=new Map((context?.findings||[]).map(finding=>[finding.id,finding]));
 for(const issue of rows){
  let findings:Row[]|null=Array.isArray(issue.findings)?issue.findings:null;
  if(!findings&&Array.isArray(issue.findingIds))findings=issue.findingIds.map((id:string)=>byFinding.get(id)||{});
  if(!findings&&Array.isArray(context?.findings)&&present(issue.id))findings=context.findings.filter(finding=>finding.issueId===issue.id);
  if(findings){
   for(const finding of findings)if(present(finding.runId))runs.add(finding.runId);
   if(findings.every(finding=>present(finding.runId)))known++;
  }
 }
 return {...metric('affectedRuns','Affected journeys',runs.size,'blue'),value:known||runs.size||!rows.length?count(runs.size):'—',detail:known<rows.length?`${known}/${rows.length} issues linked`:undefined,
  title:'Distinct journeys linked to the visible issues. Repeated sightings are not counted as different journeys. Missing links are not zero.'};
}
function usedCurrentVersion(entity:Row,run:Row,kind:'personas'|'charters'){
 const prefix=kind==='personas'?'persona':'charter';
 if(!present(entity.id)||run[`${prefix}Id`]!==entity.id)return false;
 if(present(entity.versionId)&&present(run[`${prefix}VersionId`]))return entity.versionId===run[`${prefix}VersionId`];
 return valid(entity.version)&&valid(run[`${prefix}Version`])&&entity.version===run[`${prefix}Version`];
}

/** Only the supplied visible rows define the scope. Context supplies exact relationships. */
export function collectionSummary(kind:CollectionKind,rows:Row[],context?:SummaryContext):CollectionSummaryData{
 const metrics:SummaryMetric[]=[],secondary:SummaryMetric[]=[],impactCounts:Record<string,number>=Object.fromEntries(IMPACT_ORDER.map(impact=>[impact,0]));
 let impactDetail:string|undefined;
 if(kind==='runs'){
  const captured=rows.map(countsForRun).filter((counts):counts is Row=>counts!==null);
  for(const counts of captured)for(const impact of IMPACT_ORDER)impactCounts[impact]+=valid(counts[impact])?counts[impact]:0;
  if(captured.length<rows.length)impactDetail=`Impact counts: ${captured.length}/${rows.length} journeys known`;
  const reached=rows.filter(row=>knownOutcome(row)==='goal_reached').length;
  const blocked=rows.filter(row=>['obstacle_observed','blocked'].includes(knownOutcome(row)));
  const assessed=reached+blocked.length;
  metrics.push({...metric('goals','Goals reached',reached,'positive'),detail:assessed?`of ${assessed} assessed`:rows.length?'No assessed journeys':undefined,
   title:'Recorded goal outcomes, not a quality score. Journeys may reach their goal and still contain problems. Assessed journeys have a goal or product-obstacle outcome.'});
  const runIds=new Set(rows.map(row=>row.id).filter(present));
  const findings=uniqueRows((context?.findings||[]).filter(finding=>runIds.has(finding.runId)));
  const issues=issueMap(context),problems=findings.filter(finding=>isProblem(finding,issues));
  const problemRunIds=new Set([...blocked.map(run=>run.id).filter(present),...problems.map(finding=>finding.runId)]);
  // Historical impact totals cannot establish which findings remain actionable.
  const hasFindings=Array.isArray(context?.findings);
  metrics.push({...contextMetric('problemRuns','Journeys with problems',problemRunIds.size,hasFindings,!rows.length,'warning'),
   detail:hasFindings&&problems.length?`${count(problems.length)} problem findings`:undefined,
   title:'Visible journeys with a recorded product block or a non-informational finding that is not dismissed, duplicate, or linked to a resolved issue. Goal completion does not mean a friction-free experience.'});
  metrics.push({...metric('blocked','Product blocks',blocked.length,'critical'),title:'Recorded obstacle outcomes only. Execution failures, model limits, and unfinished journeys are reported separately.'});
  const reviews=uniqueRows((context?.fixes||[]).filter(fix=>fix.status==='awaiting_review'&&[...relatedFixRuns(fix,context?.findings||[])].some(id=>runIds.has(id))));
  metrics.push({...contextMetric('review','Fixes to review',reviews.length,Array.isArray(context?.fixes),!rows.length,'blue'),title:'Distinct fixes awaiting review linked to one or more visible journeys.'});
  const urgent=problems.filter(finding=>['critical','high'].includes(finding.impact)).length;
  if(hasFindings&&urgent)secondary.push(metric('priority','Critical / high problems',urgent,'critical'));
  secondary.push(measured('findings','Recorded findings',rows,row=>{const counts=countsForRun(row);return counts?IMPACT_ORDER.reduce((total,key)=>total+(valid(counts[key])?counts[key]:0),0):null;}));
  const active=rows.filter(row=>ongoing(row.status)).length;if(active)secondary.push(metric('active','In progress',active,'blue'));
  const stopped=rows.filter(row=>!ongoing(row.status)&&['failed','invalidated','cancelled','canceled','incomplete'].includes(row.status)).length;
  if(stopped)secondary.push({...metric('executionStops','Execution stops',stopped,'warning'),title:'Failed, invalidated, cancelled or incomplete executions. These are not treated as product blocks.'});
  const unassessed=rows.length-assessed-active-stopped;
  if(unassessed>0)secondary.push({...metric('unassessed','Unassessed',unassessed),title:'No conclusive goal or product-obstacle outcome was recorded.'});
  const elapsed=measured('time','Journey time',rows,duration,elapsedLabel);
  secondary.push({...elapsed,title:[elapsed.title,'Sum of recorded elapsed journey durations, including model waits. Separate journeys may overlap.'].filter(Boolean).join(' ')},measured('tokens','Tokens',rows,totals));
 }else if(kind==='findings'){
  for(const row of rows)impactCounts[IMPACT_ORDER.includes(row.impact)?row.impact:'untriaged']++;
  const issues=issueMap(context),problems=rows.filter(row=>isProblem(row,issues));
  metrics.push({...metric('problems','Problem findings',problems.length,'warning'),title:'Critical, high, medium or low impact findings; excludes informational, dismissed, duplicate, resolved, and findings linked to resolved issues.'});
  metrics.push(metric('priority','Critical / high',problems.filter(row=>['critical','high'].includes(row.impact)).length,'critical'));
  metrics.push({...metric('unreviewed','Unreviewed',rows.filter(row=>row.triage==='unreviewed').length,'blue'),title:'All findings explicitly marked unreviewed, including informational observations.'});
  const runIds=new Set(rows.map(row=>row.runId).filter(present)),unknownRuns=rows.filter(row=>!present(row.runId)).length;
  metrics.push({...metric('runs','Journeys',runIds.size),detail:unknownRuns?`${unknownRuns} unlinked`:undefined,title:'Distinct journeys linked to all visible findings, including informational observations.'});
  const defects=rows.filter(row=>['broken','defect'].includes(row.type)).length,experience=rows.filter(row=>row.type==='experience').length;
  if(defects)secondary.push(metric('defects','Defects',defects,'critical'));
  if(experience)secondary.push(metric('experience','Experience',experience,'blue'));
  const dismissed=rows.filter(row=>['dismissed','duplicate'].includes(row.triage)).length;if(dismissed)secondary.push(metric('dismissed','Dismissed / duplicate',dismissed));
  const noTriage=rows.filter(row=>!present(row.triage)).length;if(noTriage)secondary.push(metric('unknownReview','Review status unknown',noTriage));
 }else if(kind==='fixes'){
  metrics.push(metric('review','Awaiting review',rows.filter(row=>row.status==='awaiting_review').length,'warning'));
  metrics.push(metric('active','In progress',rows.filter(row=>ongoing(row.status)).length,'blue'));
  metrics.push({...metric('failed','Needs another pass',rows.filter(row=>['failed','invalidated','rejected'].includes(row.status)).length,'critical'),title:'Failed, invalidated or rejected fixes.'});
  metrics.push(measured('comments','Open comments',rows,fixOpenComments));
  const approved=rows.filter(row=>row.status==='approved').length;if(approved)secondary.push({...metric('approved','Approved',approved,'positive'),title:'Approved fixes. Approval alone does not establish deployment or a merged pull request.'});
  secondary.push(measured('rounds','Rounds',rows,fixRoundCount));
 }else if(kind==='issues'){
  const active=rows.filter(row=>!row.mergedInto);
  metrics.push(metric('open','Open',active.filter(row=>['open','investigating','fix_in_progress','awaiting_verification','reopened'].includes(row.status||'open')).length,'warning'));
  metrics.push({...metric('reopened','Reopened',active.filter(row=>row.status==='reopened').length,'critical'),title:'Reopened issues are included in Open.'});
  metrics.push(metric('resolved','Resolved',active.filter(row=>row.status==='resolved').length,'positive'));
  metrics.push(linkedIssueJourneys(active,context));
  const merged=rows.filter(row=>row.mergedInto).length;if(merged)secondary.push(metric('merged','Merged history',merged));
  secondary.push(measured('occurrences','Occurrences',rows,row=>valid(row.occurrences)?row.occurrences:nullableLength(row.findings)??nullableLength(row.findingIds)));
  const last=rows.map(row=>typeof row.lastSeen==='string'?Date.parse(row.lastSeen):NaN).filter(Number.isFinite).sort((a,b)=>b-a)[0];
  if(last!==undefined)secondary.push({key:'lastSeen',label:'Last seen',value:new Date(last).toLocaleDateString('en',{month:'short',day:'numeric'}),title:new Date(last).toLocaleString('en')});
 }else if(kind==='environments'){
  const active=rows.filter(row=>!row.archived),fresh=(row:Row)=>row.lastCheck&&!row.lastCheck.stale&&valid(row.version)&&row.lastCheck.environmentVersion===row.version;
  const reachable=(row:Row)=>fresh(row)&&(row.lastCheck.status==='reachable'||row.lastCheck.reachable===true||row.lastCheck.ok===true);
  const unreachable=(row:Row)=>fresh(row)&&(row.lastCheck.status==='unreachable'||row.lastCheck.reachable===false||row.lastCheck.ok===false);
  metrics.push({...metric('reachable','Reachable',active.filter(reachable).length,'positive'),title:'Active environments with a successful check for the current configuration version. This is not a test-readiness guarantee.'});
  metrics.push({...metric('needsCheck','Needs check',active.filter(row=>!reachable(row)&&!unreachable(row)).length,'warning'),title:'Active environments whose check is missing, stale, inconclusive, or from an older configuration version.'});
  metrics.push(metric('unreachable','Unreachable',active.filter(unreachable).length,'critical'));
  metrics.push({...metric('source','Source configured',active.filter(row=>present(row.repositoryPath)).length,'blue'),title:'Active environments with a repository path configured. This does not verify repository access.'});
  secondary.push(metric('active','Active',active.length));
  const archived=rows.filter(row=>row.archived).length;if(archived)secondary.push(metric('archived','Archived',archived));
 }else{
  const active=rows.filter(row=>!row.archived),hasRuns=Array.isArray(context?.runs);
  const used=active.filter(entity=>(context?.runs||[]).some(run=>usedCurrentVersion(entity,run,kind))).length;
  metrics.push({...contextMetric('used','Current version used',used,hasRuns,!active.length,'positive'),title:'Active definitions with a recorded journey matching this exact version. A journey does not by itself prove the goal was reached.'});
  metrics.push({...contextMetric('unused','No current journey',active.length-used,hasRuns,!active.length,'warning'),title:'Active definitions without a journey matching this version. Unversioned history is not proof of current-version use.'});
  metrics.push(metric('missingMission',kind==='personas'?'Missing goal':'Missing objective',active.filter(row=>!present(row.mission)).length,'critical'));
  if(kind==='personas')metrics.push({...metric('returning','Returning memory',active.filter(row=>row.continuity==='returning').length,'blue'),title:'Active personas explicitly configured to retain knowledge from earlier journeys.'});
  else metrics.push({...metric('noTarget','No default target',active.filter(row=>!present(row.defaultEnvironmentId)).length,'blue'),title:'Active missions without a default environment. A target may still be selected when launching a journey.'});
  secondary.push(metric('active','Active',active.length));
  const revised=rows.filter(row=>typeof row.version==='number'&&row.version>1).length;if(revised)secondary.push(metric('revised','Revised',revised));
  if(kind==='personas')secondary.push(metric('firstVisit','First-time',rows.filter(row=>row.continuity==='first-time').length));
  else secondary.push(metric('mission','Objective defined',rows.filter(row=>present(row.mission)).length));
  if(hasRuns){
   const prefix=kind==='personas'?'persona':'charter',ids=new Set(rows.map(row=>row.id).filter(present));
   secondary.push({...metric('linkedRuns','Linked journeys',uniqueRows((context?.runs||[]).filter(run=>ids.has(run[`${prefix}Id`]))).length),title:'Recorded journeys for the visible definitions, across all their versions.'});
  }
  const archived=rows.filter(row=>row.archived).length;if(archived)secondary.push(metric('archived','Archived',archived));
 }
 return {metrics,secondary,impacts:IMPACT_ORDER.filter(impact=>impactCounts[impact]>0).map(impact=>({impact,count:impactCounts[impact]})),impactDetail};
}
