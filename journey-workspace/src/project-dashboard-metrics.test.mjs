import test from 'node:test';
import assert from 'node:assert/strict';
import {projectDashboardSummary} from './project-dashboard-metrics.ts';

const run=(id,fields={})=>({id,projectId:'p',status:'finished',...fields});
const data=(fields={})=>({projectId:'p',runs:[],findings:[],fixes:[],issues:[],personas:[],environments:[],runsPage:{total:0},...fields});

test('project changes cannot leak loaded records, definitions, or source-linked findings',()=>{
 const input=data({runs:[run('shared',{projectId:'other',outcome:'goal_reached'}),run('shared'),run('unknown',{projectId:null})],findings:[{id:'wrong',projectId:'other',runId:'shared',impact:'critical'},{id:'local',projectId:'p',runId:'shared',impact:'low'}],personas:[{id:'p1',projectId:'p'},{id:'p2',projectId:'other'},{id:'p3',projectId:'p',archived:true}],environments:[{id:'env',projectId:'p'},{id:'temporary',projectId:'p',lifecycle:'temporary'},{id:'archived',projectId:'p',archived:true},{id:'other',projectId:'other'}],runsPage:{total:1}});
 const result=projectDashboardSummary(input);
 assert.equal(result.scope.loaded,1);assert.equal(result.scope.unscopedRuns,1);
 assert.equal(result.goalReachedCount,0);assert.equal(result.personaCount,1);assert.equal(result.environmentCount,1);
 assert.deepEqual(result.findings.map(row=>row.id),['local']);
 const switched=projectDashboardSummary({...input,projectId:'other'});
 assert.equal(switched.goalReachedCount,1);assert.deepEqual(switched.findings.map(row=>row.id),['wrong']);
 assert.equal(result.goalReachedCount,0);
});

test('partial history keeps its denominator and excludes unloaded findings from evidence counts',()=>{
 const result=projectDashboardSummary(data({runs:[run('a'),run('b')],runsPage:{total:800,nextCursor:'opaque'},findings:[{id:'loaded',projectId:'p',runId:'a',impact:'medium'},{id:'unloaded',projectId:'p',runId:'old',impact:'critical',sourceRun:{id:'old',projectId:'p'}}],fixes:[{id:'loaded-fix',projectId:'p',runId:'a',status:'awaiting_review'},{id:'old-fix',projectId:'p',runId:'old',status:'awaiting_review'},{id:'mixed-old-fix',projectId:'p',runId:'a',sourceRunIds:['old'],status:'awaiting_review'},{id:'unloaded-finding-fix',projectId:'p',runId:'a',findingId:'unloaded',status:'awaiting_review'},{id:'unknown-finding-fix',projectId:'p',runId:'a',findingId:'missing',status:'awaiting_review'}]}));
 assert.equal(result.scope.loaded,2);assert.equal(result.scope.total,800);assert.equal(result.scope.partial,true);
 assert.equal(result.findingCount,1);assert.equal(result.openFindingCount,1);assert.equal(result.pendingReviewFixCount,1);
 const unknown=projectDashboardSummary(data({runs:[run('a')],runsPage:undefined}));
 assert.equal(unknown.scope.total,null);assert.equal(unknown.scope.partial,null);
 assert.equal(projectDashboardSummary(data({runs:[run('a')],runsPage:{total:0}})).scope.total,null);
});

test('experimental and invalidated evidence never contributes to ordinary outcomes or review counts',()=>{
 const excluded=[run('invalid-status',{status:'invalidated'}),run('invalid-integrity',{integrityStatus:'invalidated'}),...['experimental','experimentalStudyId','calibrationStudyId','calibrationTrialId','experimentalCandidateId'].map((field,i)=>run('experiment'+i,{[field]:true,outcome:'goal_reached',totalTokens:100}))];
 const result=projectDashboardSummary(data({runs:[run('ordinary',{outcome:'goal_reached',totalTokens:5}),...excluded],runsPage:{total:8},findings:[...excluded.map(row=>({id:'f-'+row.id,runId:row.id,impact:'critical'})),{id:'flagged-finding',runId:'ordinary',impact:'critical',experimental:true}],fixes:[{id:'mixed',runId:'ordinary',sourceRunIds:['experiment0'],status:'awaiting_review'},{id:'flagged',runId:'ordinary',status:'awaiting_review',integrityStatus:'invalidated'},{id:'ordinary-fix',runId:'ordinary',status:'awaiting_review'}]}));
 assert.equal(result.scope.loaded,8);assert.equal(result.scope.eligible,1);assert.equal(result.scope.excluded,7);
 assert.equal(result.scope.excludedInvalidated,2);assert.equal(result.scope.excludedExperimental,5);
 assert.equal(result.goalReachedCount,1);assert.equal(result.tokens.reportedTotal,5);assert.equal(result.findingCount,0);
 assert.deepEqual(result.pendingReviewFixes.map(row=>row.id),['ordinary-fix']);
});

test('terminal goals, product obstacles, execution stops, and unknown outcomes remain distinct',()=>{
 const runs=[run('goal',{outcome:'goal_reached'}),run('block',{status:'completed',finding:{outcome:'obstacle_observed'}}),run('unassessed'),run('running',{status:'running',outcome:'goal_reached'}),run('queued',{status:'queued'}),run('failed',{status:'failed',outcome:'goal_reached'}),run('interrupted',{status:'interrupted'}),run('runner-block',{status:'blocked'}),run('unknown',{status:'new-status'})];
 const result=projectDashboardSummary(data({runs,runsPage:{total:runs.length}}));
 assert.equal(result.completedCount,3);assert.equal(result.inProgressCount,2);assert.equal(result.incompleteCount,3);assert.equal(result.unknownStatusCount,1);
 assert.equal(result.goalReachedCount,1);assert.equal(result.productBlockedCount,1);assert.equal(result.unknownOutcomeCount,7);assert.equal(result.unassessedCompletedCount,1);
});

test('effective findings exclude dismissed duplicates and explicit resolutions without assuming repair approval',()=>{
 const findings=[{id:'critical',impact:'critical',triage:'accepted'},{id:'low',impact:'low',triage:'unreviewed'},{id:'info',impact:'informational'},{id:'dismissed',impact:'critical',triage:'dismissed'},{id:'duplicate',impact:'critical',triage:'duplicate'},{id:'resolved',impact:'high',triage:'resolved'},{id:'resolved-issue',impact:'medium',issueId:'closed'}].map(row=>({...row,projectId:'p',runId:'a'}));
 const result=projectDashboardSummary(data({runs:[run('a',{outcome:'goal_reached'})],findings:[...findings,findings[0]],issues:[{id:'closed',projectId:'p',status:'resolved'}],fixes:[{id:'approved',projectId:'p',runId:'a',status:'approved'},{id:'review',projectId:'p',findingIds:['critical'],status:'awaiting_review'},{id:'review',projectId:'p',findingIds:['critical'],status:'awaiting_review'}],runsPage:{total:1}}));
 assert.equal(result.findingCount,5);assert.deepEqual(result.openFindings.map(row=>row.id),['critical','low']);
 assert.equal(result.pendingReviewFixCount,1);assert.equal(result.goalReachedCount,1);
});

test('reported tokens retain zero, partial receipts and unknown coverage without inventing a total',()=>{
 const runs=[run('zero',{totalTokens:0}),run('legacy',{usage:[{total_tokens:5},{total_tokens:7}]}),run('partial',{tokens:{total:9,partial:true}}),run('unknown'),run('negative',{totalTokens:-2}),run('nan',{totalTokens:NaN})];
 const result=projectDashboardSummary(data({runs,runsPage:{total:6}}));
 assert.deepEqual(result.tokens,{reportedTotal:21,knownRuns:3,partialRuns:1,unknownRuns:3,totalRuns:6});
 assert.equal(projectDashboardSummary(data({runs:[run('none')],runsPage:{total:1}})).tokens.reportedTotal,null);
 assert.equal(projectDashboardSummary(data()).tokens.reportedTotal,0);
 const unloaded=projectDashboardSummary({projectId:'p'});assert.equal(unloaded.scope.available,false);assert.equal(unloaded.tokens.reportedTotal,null);
});

test('recent journeys sort by recorded creation time without mutating input or promoting missing dates',()=>{
 const runs=[run('old',{createdAt:'2026-10-30T00:00:00Z',updatedAt:'2026-11-05T00:00:00Z'}),run('unknown'),run('new',{createdAt:'2026-11-02T00:00:00Z'}),run('tied',{createdAt:'2026-11-02T00:00:00Z'})];
 const input=data({runs,runsPage:{total:4}}),before=JSON.stringify(input);
 const result=projectDashboardSummary(input);
 assert.deepEqual(result.recentRuns.map(row=>row.id),['new','tied','old','unknown']);
 assert.equal(JSON.stringify(input),before);
});

test('goal and friction rates use distinct explicit denominators without hiding successful journeys with problems',()=>{
 const runs=[run('goal',{personaId:'active',outcome:'goal_reached'}),run('obstacle',{personaId:'archived',outcome:'obstacle_observed'}),run('unknown',{personaId:'active'}),run('running',{personaId:'active',status:'running',outcome:'goal_reached'}),run('failed',{status:'failed',outcome:'goal_reached'}),run('experiment',{experimental:true,outcome:'goal_reached'}),run('invalid',{integrityStatus:'invalidated',outcome:'goal_reached'})];
 const finding=(id,runId,fields={})=>({id,runId,impact:'medium',...fields});
 const findings=[finding('goal-friction','goal',{impact:'high'}),finding('same-journey','goal',{impact:'low'}),finding('resolved','obstacle',{triage:'resolved'}),finding('resolved-issue','obstacle',{issueId:'resolved'}),finding('dismissed','unknown',{triage:'dismissed'}),finding('duplicate','unknown',{triage:'duplicate'}),finding('info','unknown',{impact:'informational'}),finding('unfinished','running',{impact:'critical'}),finding('old','not-loaded',{impact:'critical'}),finding('invalid','invalid',{impact:'critical'}),finding('experiment','experiment',{impact:'critical'})];
 const result=projectDashboardSummary(data({runs,findings,issues:[{id:'resolved',projectId:'p',status:'resolved'}],runsPage:{total:200}}));
 assert.deepEqual(result.goalAttainment,{reached:1,assessed:2,rate:50});
 const {rate,...friction}=result.friction;
 assert.deepEqual(friction,{affectedCompleted:2,completed:3,openHighImpactCount:2,affectedPersonas:2});
 assert(Math.abs(rate-66.666667)<0.000001);
 assert.equal(result.scope.partial,true);
 assert.equal(result.openFindings.length,3);
 assert.equal(projectDashboardSummary(data({runs:[run('unassessed')]})).goalAttainment.rate,null);
 assert.equal(projectDashboardSummary(data({runs:[run('goal',{outcome:'goal_reached'})],findings:undefined})).friction.rate,null);
 assert.equal(projectDashboardSummary(data()).friction.rate,null);
});

test('persona outcomes retain archived, missing and unassigned perspectives without treating current profiles as historical evidence',()=>{
 const runs=[run('active-old',{personaId:'active',personaVersion:1,outcome:'goal_reached'}),run('active-new',{personaId:'active',personaVersion:3,outcome:'obstacle_observed'}),run('archived-run',{personaId:'archived',outcome:'obstacle_observed'}),run('missing-run',{personaId:'missing',personaName:'Recorded perspective',outcome:'goal_reached'}),run('unassigned',{outcome:'goal_reached'}),run('foreign',{projectId:'other',personaId:'active',outcome:'goal_reached'})];
 const result=projectDashboardSummary(data({runs,personas:[{id:'active',projectId:'p',name:'Active',version:4},{id:'archived',projectId:'p',name:'Archived',archived:true},{id:'unused',projectId:'p',name:'Unused'},{id:'other',projectId:'other'}],findings:[{id:'critical',runId:'archived-run',impact:'critical'},{id:'medium',runId:'active-old',impact:'medium'},{id:'unassigned-friction',runId:'unassigned',impact:'low'}],runsPage:{total:5}}));
 assert.equal(result.personaCount,2);
 assert.equal(result.personaOutcomes.length,5);
 assert.equal(result.personaOutcomes[0].persona.id,'archived');
 const active=result.personaOutcomes.find(row=>row.persona.id==='active');
 assert.deepEqual({current:active.current,journeys:active.journeys,completed:active.completed,assessed:active.assessed,goals:active.goalsReached,obstacles:active.productObstacles,rate:active.goalRate,friction:active.withFriction},{current:true,journeys:2,completed:2,assessed:2,goals:1,obstacles:1,rate:50,friction:1});
 assert.equal(result.personaOutcomes.find(row=>row.persona.id==='archived').current,false);
 assert.equal(result.personaOutcomes.find(row=>row.persona.id==='missing').persona.name,'Recorded perspective');
 const unassigned=result.personaOutcomes.find(row=>row.persona.id===null);
 assert.equal(unassigned.persona.name,'Unassigned journeys');assert.equal(unassigned.current,false);assert.equal(unassigned.journeys,1);
 assert.equal(result.personaOutcomes.find(row=>row.persona.id==='unused').goalRate,null);
 assert.equal(result.friction.affectedPersonas,2,'unassigned journeys do not invent a persona identity');
 assert.equal(result.personaOutcomes.reduce((sum,row)=>sum+row.journeys,0),result.eligibleRuns.length);
});

test('fix pipeline distinguishes active preparation, awaiting review and requested changes',()=>{
 const statuses=['queued','preparing','running','generating','verifying','retesting','awaiting_review','approved','changes_requested','failed','interrupted','rejected','cancelled','unknown'];
 const fixes=statuses.map(status=>({id:status,projectId:'p',runId:'source',status}));
 const result=projectDashboardSummary(data({runs:[run('source'),run('experiment',{experimental:true})],fixes:[...fixes,fixes[0],{id:'invalid',projectId:'p',runId:'source',status:'invalidated'},{id:'mixed',projectId:'p',runId:'source',sourceRunIds:['experiment'],status:'awaiting_review'},{id:'unlinked',projectId:'p',status:'approved'},{id:'foreign',projectId:'other',runId:'source',status:'approved'}],runsPage:{total:2}}));
 assert.deepEqual(result.fixPipeline,{total:14,inProgress:6,awaitingReview:1,approved:1,needsWork:4,other:2});
 assert.equal(result.pendingReviewFixCount,result.fixPipeline.awaitingReview);
 const requested=projectDashboardSummary(data({runs:[run('source')],fixes:[{id:'revision',runId:'source',status:'changes_requested'}]}));
 assert.equal(requested.fixPipeline.needsWork,1);
 assert.equal(requested.fixPipeline.awaitingReview,0,'reviewed requests for changes are a next implementation action, not pending approval');
 assert.equal(requested.fixPipeline.other,0);
 assert.equal(Object.entries(result.fixPipeline).filter(([key])=>key!=='total').reduce((sum,[,value])=>sum+value,0),result.fixPipeline.total);
});

test('daily activity covers fourteen UTC days, with explicit missing and future timestamps',()=>{
 const now=Date.parse('2026-11-02T12:00:00Z');
 const runs=[run('first',{createdAt:'2026-10-20T00:00:00Z',outcome:'goal_reached'}),run('old',{createdAt:'2026-10-19T23:59:59Z',outcome:'goal_reached'}),run('today-goal',{createdAt:'2026-11-02T00:00:00Z',outcome:'goal_reached'}),run('local-evening',{createdAt:'2026-11-01T23:30:00-05:00',outcome:'obstacle_observed'}),run('running',{createdAt:'2026-11-02T11:00:00Z',status:'running',outcome:'goal_reached'}),run('now',{startedAt:'2026-11-02T12:00:00Z'}),run('future-today',{createdAt:'2026-11-02T13:00:00Z'}),run('future-day',{createdAt:'2026-11-03T00:00:00Z'}),run('missing'),run('bad',{createdAt:'bad-date'}),run('experimental',{createdAt:'2026-11-02T01:00:00Z',experimental:true}),run('foreign',{projectId:'other',createdAt:'2026-11-02T01:00:00Z'})];
 const input=data({runs,runsPage:{total:11}}),before=JSON.stringify(input);
 const activity=projectDashboardSummary(input,now).dailyActivity;
 assert.equal(activity.from,'2026-10-20');assert.equal(activity.to,'2026-11-02');assert.equal(activity.timeZone,'UTC');assert.equal(activity.days.length,14);
 assert.deepEqual(activity.days[0],{date:'2026-10-20',total:1,goalsReached:1,productObstacles:0,other:0});
 assert.deepEqual(activity.days.at(-1),{date:'2026-11-02',total:4,goalsReached:1,productObstacles:1,other:2});
 assert.equal(activity.total,5);assert.equal(activity.undatedCount,2);assert.equal(activity.outsideWindowCount,1);assert.equal(activity.futureCount,2);
 for(const day of activity.days)assert.equal(day.total,day.goalsReached+day.productObstacles+day.other);
 assert.equal(activity.total+activity.undatedCount+activity.outsideWindowCount+activity.futureCount,10);
 assert.equal(JSON.stringify(input),before);
 assert.equal(projectDashboardSummary(data(),now).dailyActivity.total,0);
});
