import {retainedFixture} from './retained-test-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createWorkspaceStore } from './workspace-store.mjs';
import { createWorkspaceCalibration } from './workspace-calibration.mjs';

const code=value=>error=>error.code===value;
async function setup(t,options={}){
 const root=await retainedFixture('journey-calibration-'),store=createWorkspaceStore({root:join(root,'workspace')});
 store.saveEntity('environment',{maxSteps:12,maxTokens:50000,maxDurationMs:180000},'little-steps-local');
 const baseline=[];for(let i=0;i<2;i++){const run=store.buildRun({charterId:'first-value',personaId:'mother',environmentId:'little-steps-local'});baseline.push(store.syncRun({...run,status:'finished',productFingerprint:{'app.js':'a'.repeat(64)},integrityStatus:'recorded',finding:{outcome:'obstacle_observed',evidence_indices:[0]},events:[{index:0,type:'screenshot',url:run.target,screenshot:`/runs/${run.id}/initial.png`}],usage:[{total_tokens:50}]}));}
 const buildId=store.memory.buildIdentity(baseline[0]),timestamp=new Date().toISOString(),proposalCalls=[],trialCalls=[],adoptions=[];
 const proposeCandidate=async input=>{proposalCalls.push(input);return {adjustment:{kind:'persona',changes:{priorities:'Look for the visible action first.'}},rationale:'A hypothesis to test, not a measured user preference.',usage:{total_tokens:100}};};
 const executeTrial=async input=>{trialCalls.push(input);const persona={...input.study.controls.persona,...input.candidate.adjustment.changes},run={...structuredClone(baseline[0]),id:randomUUID(),name:'Experimental fixture',persona,personaSnapshot:persona,status:'finished',experimental:true,calibrationStudyId:input.study.id,experimentalCandidateId:input.candidate.id,finding:{outcome:options.afterOutcome||'goal_reached'},usage:[{total_tokens:200}]};store.syncRun(run);await input.onRunStarted?.(run.id);return {runId:run.id,usage:{total_tokens:200}};};
 const adoptCandidate=async input=>{adoptions.push(input);return store.adoptCalibrationPersona({projectId:input.study.projectId,personaId:input.study.controls.persona.id,expectedVersion:input.expectedPersonaVersion,changes:input.candidate.adjustment.changes,idempotencyKey:input.idempotencyKey,studyId:input.study.id,candidateId:input.candidate.id,resultId:input.result.id});};
 const service=createWorkspaceCalibration({root:join(root,'calibration'),store,proposeCandidate,executeTrial,adoptCandidate,...options.adapters});
 t.after(async()=>{await service.close();store.close();});
 const events=Array.from({length:10},(_,i)=>({sessionId:`visitor-${i}`,event:'complete',at:timestamp,screen:'/activity',environmentId:'little-steps-local',buildId,cohort:{device:'mobile'},traffic:'human',sessionEnded:true}));
 const dataset=service.saveDataset({projectId:'little-steps',name:'Fixture analytics',source:{kind:options.sourceKind||'fixture',label:'Isolated test fixture'},events});
 const mapping=service.saveMapping({projectId:'little-steps',name:'Completion',metrics:[{id:'completion',label:'Complete the goal',kind:'goal_complete',realEvent:'complete',synthetic:{type:'outcome',value:'goal_reached'},denominator:'sessions'}]});
 const input={projectId:'little-steps',name:'A bounded study',datasetId:dataset.id,mappingId:mapping.id,personaId:'mother',charterId:'first-value',environmentId:'little-steps-local',buildId,cohort:{device:'mobile'},personaCohort:{device:'mobile'},timeWindow:{from:new Date(Date.now()-86400000).toISOString(),to:new Date(Date.now()+1000).toISOString()},runIds:baseline.map(run=>run.id),minSessions:2};
 return {root,store,service,baseline,buildId,dataset,mapping,input,events,proposalCalls,trialCalls,adoptions};
}

test('experimental trials cannot change persona device membership or primary choice',async t=>{
 for(const changedField of ['deviceIds','primaryDeviceId']){
  let storeRef,baseline;
  const f=await setup(t,{adapters:{executeTrial:async input=>{
   const persona=structuredClone({...input.study.controls.persona,...input.candidate.adjustment.changes});
   const alternative=storeRef.listEntities('device','little-steps').find(device=>!persona.deviceIds.includes(device.id));
   assert.ok(alternative);
   if(changedField==='deviceIds')persona.deviceIds.push(alternative.id);else persona.primaryDeviceId=alternative.id;
   const run={...structuredClone(baseline),id:randomUUID(),persona,personaSnapshot:persona,status:'finished',experimental:true,calibrationStudyId:input.study.id,experimentalCandidateId:input.candidate.id,finding:{outcome:'goal_reached'},usage:[{total_tokens:200}]};
   storeRef.syncRun(run);await input.onRunStarted?.(run.id);return {runId:run.id,usage:{total_tokens:200}};
  }}});
  storeRef=f.store;baseline=f.baseline[0];const original=f.store.getEntity('persona','mother'),study=f.service.createStudy(f.input);
  f.service.start(study.id);await f.service.waitForIdle();const current=f.service.getStudy(study.id);
  assert.equal(current.status,'failed',changedField);assert.equal(current.error.code,'TRIAL_CONTROLS_CHANGED',changedField);assert.equal(current.usage.sessions,1);assert.equal(current.usage.tokens,300);
  assert.deepEqual(f.store.getEntity('persona','mother').deviceIds,original.deviceIds);assert.equal(f.store.getEntity('persona','mother').primaryDeviceId,original.primaryDeviceId);
 }
});

test('analytics imports and mappings keep immutable versions with explicit traffic and provenance',async t=>{
 const f=await setup(t),original=f.service.getDataset(f.dataset.id,1);
 assert.equal(original.source.kind,'fixture');assert.equal(original.externalAcceptance,'real_data_required');assert.ok(original.events.every(event=>/^s_[a-f0-9]{24}$/.test(event.sessionId)));assert.equal(original.eventCount,10);
 const next=f.service.saveDataset({name:'Renamed import',expectedVersion:1},f.dataset.id);assert.equal(next.version,2);assert.deepEqual(f.service.getDataset(f.dataset.id,1),{...original,updatedAt:next.updatedAt});
 assert.throws(()=>f.service.saveDataset({expectedVersion:1,name:'Stale'},f.dataset.id),code('VERSION_CONFLICT'));
 assert.throws(()=>f.service.saveDataset({projectId:'foreign',name:'Moved'},f.dataset.id),code('PROJECT_MISMATCH'));
 assert.throws(()=>f.service.saveDataset({projectId:'little-steps',name:'Bad',source:{kind:'fixture',label:'Test'},events:[{...f.events[0],traffic:undefined}]}),/explicit traffic/);
 assert.throws(()=>f.service.saveDataset({projectId:'little-steps',name:'Duplicate',source:{kind:'fixture',label:'Test'},events:[f.events[0],f.events[0]]}),/duplicate events/);
 const mapped=f.service.saveMapping({expectedVersion:1,metrics:[{id:'unknown',kind:'goal_start'}]},f.mapping.id);assert.equal(mapped.version,2);assert.equal(f.service.getMapping(f.mapping.id,1).metrics[0].id,'completion');
});

test('analytics import strips private URL details and pseudonymizes raw IDs including misleading prefixes',async t=>{
 const f=await setup(t),raw='s_alice@example.com',canonical='s_0123456789abcdef01234567';
 const dataset=f.service.saveDataset({projectId:'little-steps',name:'Safe identities',source:{kind:'fixture',label:'Import privacy fixture'},events:[
  {...f.events[0],sessionId:raw,screen:'https://alice:password@example.test/activity?access_token=raw-secret&email=alice@example.com#private-fragment'},
  {...f.events[1],sessionId:canonical,screen:'/activity?arbitrary=another-secret#hidden'},
  {...f.events[2],sessionId:'s_not-canonical',screen:'Checkout?customer=private-value'},
 ]});
 assert.match(dataset.events[0].sessionId,/^s_[a-f0-9]{24}$/);assert.notEqual(dataset.events[0].sessionId,raw);assert.equal(dataset.events[1].sessionId,canonical);
 assert.equal(dataset.events[0].screen,'https://example.test/activity');assert.equal(dataset.events[1].screen,'/activity');assert.equal(dataset.events[2].screen,'Checkout');
 assert.ok(!JSON.stringify(dataset).includes('raw-secret'));assert.ok(!JSON.stringify(dataset).includes('alice@example.com'));assert.ok(!JSON.stringify(dataset).includes('private-fragment'));
 const renamed=f.service.saveDataset({name:'Same safe snapshot'},dataset.id);assert.deepEqual(renamed.events,dataset.events);
 const mapping=f.service.saveMapping({projectId:'little-steps',name:'Excluded synthetic session',metrics:f.mapping.metrics,syntheticExclusions:{sessionIds:[raw]},screenMap:{'/activity?token=private':'activity'}});
 assert.deepEqual(mapping.syntheticExclusions.sessionIds,[dataset.events[0].sessionId]);assert.deepEqual(mapping.screenMap,{'/activity':'activity'});
 assert.throws(()=>f.service.saveDataset({events:[{...f.events[0],screen:'data:text/plain,private'}]},dataset.id),/HTTP or HTTPS/);
});

test('outcome rules use the actual journey enum and unknown historical outcomes remain incomparable',async t=>{
 const f=await setup(t);
 for(const value of ['goal_completed','invented_outcome'])assert.throws(()=>f.service.saveMapping({projectId:'little-steps',name:'Unsupported mapping',metrics:[{id:'completion',kind:'goal_complete',realEvent:'complete',synthetic:{type:'outcome',value}}]}),/supported exact outcome/);
 const study=f.service.createStudy(f.input),unknown=f.service.compareRuns(study,f.baseline.map(run=>({...run,finding:{outcome:'unrecorded_legacy_value'}})));
 assert.equal(unknown.metrics[0].status,'not_comparable');assert.equal(unknown.metrics[0].synthetic.rate,null);
 const historical=structuredClone(study);historical.mappingSnapshot.metrics[0].synthetic.value='goal_completed';
 const result=f.service.compareRuns(historical,f.baseline);assert.equal(result.metrics[0].status,'unmapped');assert.equal(result.metrics[0].synthetic.rate,null);assert.equal(result.metrics[0].reference.rate,null);
});

test('study freezes snapshots, disjoint holdout and exact cohort rather than inferring hidden constraints',async t=>{
 const f=await setup(t),study=f.service.createStudy(f.input),frozen=structuredClone(study);
 assert.equal(new Set([...study.split.developmentSessionIds,...study.split.validationSessionIds]).size,10);assert.ok(study.split.validationSessionIds.length>=2);
 f.service.saveDataset({name:'Later import'},f.dataset.id);f.store.saveEntity('persona',{priorities:'A later preference'},'mother');
 assert.deepEqual(f.service.getStudy(study.id),frozen);
 assert.throws(()=>f.service.createStudy({...f.input,cohort:{hasPrinter:false},personaCohort:{}}),code('COHORT_NOT_COMPARABLE'));
 assert.throws(()=>f.service.createStudy({...f.input,split:{developmentSessionIds:[f.dataset.events[0].sessionId],validationSessionIds:[f.dataset.events[0].sessionId]}}),code('INVALID_HOLDOUT'));
 assert.throws(()=>f.service.createStudy({...f.input,limits:{maxSessions:4,sessionsPerPhase:3}}),/session limit/);
});

test('preview baselines compare through their configured environment while keeping exact build and version controls',async t=>{
 const f=await setup(t),parent=f.store.getEntity('environment','little-steps-local');
 const preview=f.store.saveEntity('environment',{projectId:'little-steps',name:'Recorded preview',url:'http://127.0.0.1:4940/',isolation:'stateless-demo'});
 f.store.registerEnvironmentInstance(preview.id,{parentEnvironmentId:parent.id,parentEnvironmentVersion:parent.version,source:{kind:'fix-preview'}});
 const runs=f.baseline.map(run=>f.store.syncRun({...run,environmentId:preview.id,environmentVersion:preview.version,environmentSnapshot:preview,target:preview.url}));
 const originalRecords=runs.map(run=>f.store.db.prepare('SELECT data FROM runs WHERE id=?').get(run.id).data);
 const study=f.service.createStudy(f.input),frozen=structuredClone(study),comparison=f.service.compareRuns(study,runs);
 assert.equal(comparison.syntheticSessions,2);assert.deepEqual(comparison.exclusions.synthetic,[]);assert.equal(study.baselineRuns[0].environmentId,preview.id);
 const rows=f.service.baselines('little-steps');assert.equal(rows[0].environmentId,parent.id);assert.equal(rows[0].environmentVersion,parent.version);assert.equal(rows[0].recordedEnvironmentId,preview.id);
 assert.ok(f.service.compareRuns(study,runs.map(run=>({...run,productFingerprint:{'app.js':'b'.repeat(64)}}))).exclusions.synthetic.every(row=>row.reason==='build_mismatch'));
 const changed=f.store.saveEntity('environment',{description:'Next configuration'},parent.id),newer=structuredClone(study);newer.controls.environment=changed;
 assert.ok(f.service.compareRuns(newer,runs).exclusions.synthetic.every(row=>row.reason==='environment_mismatch'));
 assert.throws(()=>f.service.createStudy({...f.input,environmentId:preview.id}),code('INVALID_REFERENCE'));
 assert.deepEqual(f.service.getStudy(study.id),frozen);assert.deepEqual(runs.map(run=>f.store.db.prepare('SELECT data FROM runs WHERE id=?').get(run.id).data),originalRecords);
});

test('behavior comparison reports exact rates and exclusions without turning unknown into zero',async t=>{
 const f=await setup(t);const additional=[{...f.events[0],sessionId:'synthetic',traffic:'synthetic'},{...f.events[0],sessionId:'unknown',traffic:'unknown'},{...f.events[0],sessionId:'other-build',buildId:'unrelated'}];
 const dataset=f.service.saveDataset({events:[...f.events,...additional]},f.dataset.id),study=f.service.createStudy({...f.input,datasetVersion:dataset.version});
 const {comparison}=f.service.compare(study.id);assert.equal(comparison.metrics[0].status,'disagreement');assert.equal(comparison.metrics[0].reference.rate,1);assert.equal(comparison.metrics[0].synthetic.rate,0);assert.equal(comparison.metrics[0].synthetic.denominator,2);assert.ok(comparison.metrics[0].reference.interval.high<=1);
 assert.deepEqual(comparison.exclusions.reference,{synthetic:1,unknownTraffic:1,build:1,environment:0,cohort:0,timeWindow:0,inconsistent:0});
 const missing=f.service.saveMapping({name:'Unmapped',projectId:'little-steps',metrics:[{id:'unknown',kind:'goal_start'}]});
 const unknown=f.service.compareRuns(f.service.createStudy({...f.input,mappingId:missing.id}),f.baseline);assert.equal(unknown.metrics[0].status,'unmapped');assert.equal(unknown.metrics[0].reference.rate,null);assert.equal(unknown.metrics[0].synthetic.numerator,null);
 const unobserved=f.service.compareRuns(study,f.baseline.map(run=>({...run,finding:{},outcome:null})));assert.equal(unobserved.metrics[0].status,'not_comparable');assert.equal(unobserved.metrics[0].synthetic.rate,null);
});

test('build, version, controls, freshness and sample limits produce explicit non-acceptance states',async t=>{
 const f=await setup(t),study=f.service.createStudy(f.input);
 const mismatch=f.service.compareRuns(study,f.baseline.map(run=>({...run,productFingerprint:{'app.js':'b'.repeat(64)}})));assert.equal(mismatch.metrics[0].status,'not_comparable');assert.ok(mismatch.exclusions.synthetic.every(item=>item.reason==='build_mismatch'));
 const changed=f.service.compareRuns(study,f.baseline.map(run=>({...run,executionPolicy:{...run.executionPolicy,maxSteps:8}})));assert.equal(changed.exclusions.synthetic[0].reason,'execution_limits_mismatch');
 const sparse=f.service.compareRuns(study,[f.baseline[0]]);assert.equal(sparse.metrics[0].status,'insufficient_data');
 const old={...study,controls:{...study.controls,timeWindow:{from:'2000-01-01T00:00:00.000Z',to:'2000-12-31T00:00:00.000Z'}},datasetSnapshot:{...study.datasetSnapshot,events:study.datasetSnapshot.events.map(event=>({...event,at:'2000-03-01T00:00:00.000Z'}))}};
 assert.equal(f.service.compareRuns(old,f.baseline).metrics[0].status,'stale');
});

test('automatic candidates use development only, repeated held-out trials and finite receipts without changing the persona',async t=>{
 const f=await setup(t),study=f.service.createStudy(f.input),personaBefore=f.store.getEntity('persona','mother');f.service.start(study.id,{expectedVersion:study.version});await f.service.waitForIdle();const result=f.service.getStudy(study.id);
 assert.equal(result.status,'awaiting_review');assert.equal(result.usage.candidates,1);assert.equal(result.usage.sessions,4);assert.equal(result.usage.tokens,900);assert.equal(f.proposalCalls.length,1);assert.equal(f.trialCalls.length,4);
 assert.equal(f.proposalCalls[0].developmentComparison.phase,'development');assert.equal(f.proposalCalls[0].study.datasetSnapshot,undefined);assert.equal(f.proposalCalls[0].study.split,undefined);assert.equal(f.proposalCalls[0].study.baselineRuns,undefined);
 assert.deepEqual(f.trialCalls.map(call=>call.phase),['development','development','validation','validation']);assert.ok(f.trialCalls.every(call=>call.remainingBudget.sessionMaxTokens===50000));
 assert.equal(result.candidates[0].result.status,'eligible');assert.equal(result.candidates[0].result.validation.meanRateGap,0);assert.equal(result.candidates[0].result.acceptanceGate,'real_data_required');assert.deepEqual(f.store.getEntity('persona','mother'),personaBefore);
 const candidate=result.candidates[0];await assert.rejects(()=>f.service.approve(study.id,{candidateId:candidate.id,candidateVersion:1,resultId:candidate.result.id,resultHash:candidate.result.hash,expectedVersion:result.version}),code('REAL_REFERENCE_REQUIRED'));assert.equal(f.adoptions.length,0);
 assert.throws(()=>f.service.start(study.id),code('STUDY_BUDGET'));
});

test('adoption requires exact validation identity and appends one approved persona version',async t=>{
 const f=await setup(t,{sourceKind:'real_import'}),study=f.service.createStudy(f.input);f.service.start(study.id);await f.service.waitForIdle();let current=f.service.getStudy(study.id);const candidate=current.candidates[0],approval={candidateId:candidate.id,candidateVersion:candidate.version,resultId:candidate.result.id,resultHash:candidate.result.hash,expectedVersion:current.version};
 await assert.rejects(()=>f.service.approve(study.id,{...approval,resultHash:'wrong'}),code('APPROVAL_MISMATCH'));assert.equal(f.store.getEntity('persona','mother').version,1);
 current=await f.service.approve(study.id,approval);assert.equal(current.status,'adopted');assert.equal(current.adoption.priorPersonaVersion,1);assert.equal(f.store.getEntity('persona','mother').version,2);assert.equal(f.adoptions.length,1);
 await f.service.approve(study.id,{...approval,expectedVersion:current.version});assert.equal(f.adoptions.length,1);assert.equal(f.store.getEntity('persona','mother',1).priorities,'');
});

test('a failed held-out candidate cannot be adopted and previous baseline remains intact',async t=>{
 const f=await setup(t,{sourceKind:'real_import',afterOutcome:'obstacle_observed'}),study=f.service.createStudy(f.input);f.service.start(study.id);await f.service.waitForIdle();const current=f.service.getStudy(study.id),candidate=current.candidates[0];assert.equal(candidate.result.status,'not_improved');
 await assert.rejects(()=>f.service.approve(study.id,{candidateId:candidate.id,candidateVersion:1,resultId:candidate.result.id,resultHash:candidate.result.hash}),code('VALIDATION_REQUIRED'));assert.equal(f.store.getEntity('persona','mother').version,1);
});

test('paid invalid proposal usage is retained and no trial starts beyond the budget',async t=>{
 const f=await setup(t,{adapters:{proposeCandidate:async()=>({adjustment:{kind:'persona',changes:{mission:'Change the task'}},usage:{total_tokens:321}})}}),study=f.service.createStudy(f.input);f.service.start(study.id);await f.service.waitForIdle();const current=f.service.getStudy(study.id);assert.equal(current.status,'failed');assert.equal(current.usage.tokens,321);assert.equal(current.usage.sessions,0);assert.equal(current.error.code,'INVALID_ADJUSTMENT');
 const constrained=f.service.createStudy({...f.input,limits:{maxTokens:1000}});f.service.start(constrained.id);await f.service.waitForIdle();assert.equal(f.service.getStudy(constrained.id).usage.sessions,0);
});

test('a valid candidate cannot start a session when the remaining token allowance cannot preserve its control cap',async t=>{
 const f=await setup(t),study=f.service.createStudy({...f.input,limits:{maxTokens:1000}});f.service.start(study.id);await f.service.waitForIdle();const current=f.service.getStudy(study.id);
 assert.equal(current.status,'budget_exhausted');assert.equal(current.usage.tokens,100);assert.equal(current.usage.sessions,0);assert.equal(f.trialCalls.length,0);assert.equal(current.error.code,'STUDY_BUDGET');
});

test('the total wall-clock allowance stops work before any additional paid trial',async t=>{
 let clock=Date.now();t.mock.method(Date,'now',()=>clock);
 const f=await setup(t,{adapters:{proposeCandidate:async()=>{clock+=600001;return {adjustment:{kind:'persona',changes:{priorities:'An explicit hypothesis'}},usage:{total_tokens:10}};}}});
 const study=f.service.createStudy(f.input);f.service.start(study.id);await f.service.waitForIdle();const current=f.service.getStudy(study.id);
 assert.equal(current.status,'budget_exhausted');assert.equal(current.usage.tokens,10);assert.equal(current.usage.sessions,0);assert.ok(current.usage.elapsedMs>current.limits.maxDurationMs);assert.equal(f.trialCalls.length,0);
});

test('adoption refuses a changed environment or a now-stale reference window',async t=>{
 const f=await setup(t,{sourceKind:'real_import'}),study=f.service.createStudy(f.input);f.service.start(study.id);await f.service.waitForIdle();const current=f.service.getStudy(study.id),candidate=current.candidates[0],approval={candidateId:candidate.id,candidateVersion:1,resultId:candidate.result.id,resultHash:candidate.result.hash};
 const actualTime=Date.now();t.mock.method(Date,'now',()=>actualTime+31*86400000);await assert.rejects(()=>f.service.approve(study.id,approval),code('STALE_REFERENCE'));t.mock.restoreAll();
 f.store.saveEntity('environment',{name:'Changed environment'},'little-steps-local');await assert.rejects(()=>f.service.approve(study.id,approval),code('CALIBRATION_ENVIRONMENT_CHANGED'));assert.equal(f.store.getEntity('persona','mother').version,1);assert.equal(f.adoptions.length,0);
});

test('cancelled in-flight proposals leave an unknown-usage gate instead of free retries',async t=>{
 let entered;const started=new Promise(resolve=>entered=resolve);const f=await setup(t,{adapters:{proposeCandidate:async()=>{entered();return new Promise(()=>{});}}}),study=f.service.createStudy({...f.input,limits:{maxCandidates:2}});
 f.service.start(study.id);await started;f.service.cancel(study.id);await f.service.waitForIdle();const stopped=f.service.getStudy(study.id);assert.equal(stopped.status,'cancelled');assert.equal(stopped.usage.tokensUncertain,true);assert.equal(stopped.usage.candidates,1);assert.throws(()=>f.service.start(study.id),code('BUDGET_UNCERTAIN'));
});

test('cancelled trials reserve a session and reconcile their actual late usage only once',async t=>{
 let entered,source,storeRef;const started=new Promise(resolve=>entered=resolve);
 const f=await setup(t,{adapters:{executeTrial:async input=>{source={...structuredClone(storeRef.getRun(storeRef.listRuns({projectId:'little-steps'})[0].id)),id:randomUUID(),status:'running',startedAt:new Date().toISOString(),usage:[]};storeRef.syncRun(source);await input.onRunStarted(source.id);entered();return new Promise(()=>{});}}});storeRef=f.store;
 const study=f.service.createStudy({...f.input,limits:{maxCandidates:2}});f.service.start(study.id);await started;f.service.cancel(study.id);await f.service.waitForIdle();let stopped=f.service.getStudy(study.id);assert.equal(stopped.usage.sessions,1);assert.equal(stopped.usage.tokensUncertain,true);assert.throws(()=>f.service.reconcile(study.id),code('USAGE_UNAVAILABLE'));
 f.store.syncRun({...source,status:'cancelled',usage:[{total_tokens:150}]});stopped=f.service.reconcile(study.id);assert.equal(stopped.usage.tokens,250);assert.equal(stopped.usage.tokensUncertain,false);assert.equal(f.service.reconcile(study.id).usage.tokens,250);
});

test('startup recovery preserves interrupted budgets and never silently resumes paid work',async t=>{
 const f=await setup(t),study=f.service.createStudy(f.input),raw=f.service.getStudy(study.id);raw.status='running';raw.pendingProposal={at:now()};raw.usage.candidates=1;raw.job={startedAt:new Date(Date.now()-1000).toISOString()};f.service.db.prepare('UPDATE calibration_studies SET data=? WHERE id=?').run(JSON.stringify(raw),study.id);
 const recovered=createWorkspaceCalibration({root:join(f.root,'calibration'),store:f.store});const current=recovered.getStudy(study.id);assert.equal(current.status,'interrupted');assert.equal(current.usage.tokensUncertain,true);assert.equal(current.usage.candidates,1);assert.ok(current.usage.elapsedMs>=1000);assert.deepEqual(recovered.active(),[]);await recovered.close();
});
function now(){return new Date().toISOString();}

test('screen metrics distinguish the same real event on different screens and preserve historical mappings',async t=>{
 const f=await setup(t),events=f.events.map((event,index)=>({...event,event:'page_view',screen:index<5?'/checkout':'/pricing'})),dataset=f.service.saveDataset({events},f.dataset.id);
 const mapping=f.service.saveMapping({name:'Checkout visits',metrics:[{id:'checkout',kind:'path_choice',realEvent:'page_view',synthetic:{type:'screen',value:'/checkout'}}]},f.mapping.id);
 const study=f.service.createStudy({...f.input,datasetVersion:dataset.version,mappingVersion:mapping.version}),ids=dataset.events.map(event=>event.sessionId);
 study.split={developmentSessionIds:ids,validationSessionIds:[]};
 const runs=f.baseline.map((run,index)=>({...run,events:[{index:0,type:'screenshot',url:index===0?'https://product.test/checkout':'https://product.test/pricing'}]}));
 const metric=f.service.compareRuns(study,runs).metrics[0];assert.equal(metric.status,'agreement');assert.equal(metric.reference.numerator,5);assert.equal(metric.reference.denominator,10);assert.equal(metric.reference.rate,.5);assert.equal(metric.synthetic.rate,.5);assert.equal(metric.definition.screenTarget,'/checkout');
 assert.deepEqual(f.service.getMapping(f.mapping.id,1).metrics,f.mapping.metrics);assert.equal(f.service.getDataset(f.dataset.id,1).events[0].event,'complete');
});

test('screen aliases connect imported names, absolute URLs and paths without erasing explicit origins',async t=>{
 const f=await setup(t),dataset=f.service.saveDataset({events:f.events.map((event,index)=>({...event,event:'page_view',screen:index<5?'Checkout page':'https://product.test/pricing?token=discard'}))},f.dataset.id);
 const mapping=f.service.saveMapping({name:'Aliased checkout',metrics:[{id:'checkout',kind:'path_choice',realEvent:'page_view',realScreen:'checkout',synthetic:{type:'screen',value:'checkout'}}],screenMap:{'Checkout page':'checkout','/checkout':'checkout','/pricing':'pricing'}},f.mapping.id);
 const study=f.service.createStudy({...f.input,datasetVersion:dataset.version,mappingVersion:mapping.version});study.split={developmentSessionIds:dataset.events.map(event=>event.sessionId),validationSessionIds:[]};
 const runs=f.baseline.map((run,index)=>({...run,events:[{index:0,type:'screenshot',url:`https://product.test/${index?'pricing':'checkout'}?tracking=discard`}]}));
 let metric=f.service.compareRuns(study,runs).metrics[0];assert.equal(metric.reference.rate,.5);assert.equal(metric.synthetic.rate,.5);
 study.mappingSnapshot.metrics[0]={...study.mappingSnapshot.metrics[0],realScreen:'https://one.test/checkout',synthetic:{type:'screen',value:'https://one.test/checkout'}};study.mappingSnapshot.screenMap={};
 study.datasetSnapshot.events=study.datasetSnapshot.events.map((event,index)=>({...event,screen:`https://${index<5?'one':'two'}.test/checkout`}));
 const origins=runs.map((run,index)=>({...run,events:[{type:'screenshot',url:`https://${index?'two':'one'}.test/checkout`}]}));metric=f.service.compareRuns(study,origins).metrics[0];assert.equal(metric.reference.rate,.5);assert.equal(metric.synthetic.rate,.5);
 study.mappingSnapshot.screenMap={'https://two.test/checkout':'checkout','https://one.test/checkout':'checkout'};metric=f.service.compareRuns(study,origins).metrics[0];assert.equal(metric.reference.rate,1);assert.equal(metric.synthetic.rate,1);
});

test('missing or unaliased screen observations stay unknown instead of becoming zero or all-page-view matches',async t=>{
 const f=await setup(t),dataset=f.service.saveDataset({events:f.events.map(event=>({...event,event:'page_view',screen:null}))},f.dataset.id),mapping=f.service.saveMapping({name:'Known screen required',metrics:[{id:'checkout',kind:'path_choice',realEvent:'page_view',synthetic:{type:'screen',value:'checkout'}}],screenMap:{'/checkout':'checkout'}},f.mapping.id),study=f.service.createStudy({...f.input,datasetVersion:dataset.version,mappingVersion:mapping.version});
 const runs=f.baseline.map(run=>({...run,events:[{type:'screenshot',url:'https://product.test/checkout'}]}));
 let metric=f.service.compareRuns(study,runs).metrics[0];assert.equal(metric.status,'not_comparable');assert.equal(metric.reference.rate,null);assert.equal(metric.reference.numerator,null);assert.equal(metric.delta,null);
 study.datasetSnapshot.events=study.datasetSnapshot.events.map(event=>({...event,screen:'Unmapped analytics screen'}));metric=f.service.compareRuns(study,runs).metrics[0];assert.equal(metric.status,'not_comparable');assert.equal(metric.reference.rate,null);
 study.datasetSnapshot.events=study.datasetSnapshot.events.map(event=>({...event,screen:'/checkout'}));metric=f.service.compareRuns(study,runs.map(run=>({...run,events:[{type:'screenshot',url:'https://product.test/unmapped'}]}))).metrics[0];assert.equal(metric.status,'not_comparable');assert.equal(metric.synthetic.rate,null);
});

test('started-session denominators apply the mapped start screen and do not silently drop unknown starts',async t=>{
 const f=await setup(t),events=f.events.flatMap((event,index)=>[{...event,event:'page_view',screen:index<5?'/start':'/other'},{...event,event:'complete',screen:'/done'}]),dataset=f.service.saveDataset({events},f.dataset.id),mapping=f.service.saveMapping({name:'Screen-scoped starts',metrics:[{id:'start',kind:'goal_start',realEvent:'page_view',realScreen:'/start',synthetic:{type:'screen',value:'/start'}},{id:'done',kind:'goal_complete',realEvent:'complete',synthetic:{type:'outcome',value:'goal_reached'},denominator:'started_sessions'}]},f.mapping.id),study=f.service.createStudy({...f.input,datasetVersion:dataset.version,mappingVersion:mapping.version});
 study.split={developmentSessionIds:[...new Set(dataset.events.map(event=>event.sessionId))],validationSessionIds:[]};
 const runs=f.baseline.map((run,index)=>({...run,finding:{outcome:'goal_reached'},events:[{type:'screenshot',url:`https://product.test/${index?'other':'start'}`}]}));let metric=f.service.compareRuns(study,runs).metrics.find(metric=>metric.id==='done');assert.equal(metric.reference.denominator,5);assert.equal(metric.reference.numerator,5);assert.equal(metric.synthetic.denominator,1);
 study.datasetSnapshot.events[0].screen=null;metric=f.service.compareRuns(study,runs).metrics.find(metric=>metric.id==='done');assert.equal(metric.status,'not_comparable');assert.equal(metric.reference.denominator,null);assert.equal(metric.reference.rate,null);assert.match(metric.reason,/denominator is unknown/);
});

function sequenceStudy(f,{metric,realStreams,syntheticStreams,screenMap={},otherMetrics=[]}){
 const events=realStreams.flatMap((stream,index)=>stream.map((entry,step)=>({...f.events[index%f.events.length],sessionId:`sequence-${index}`,at:new Date(Date.parse(f.events[0].at)+step).toISOString(),event:'page_view',screen:null,sessionEnded:step===stream.length-1,...entry})));
 const dataset=f.service.saveDataset({events},f.dataset.id),mapping=f.service.saveMapping({name:'Sequence fixture',metrics:[...otherMetrics,metric],screenMap},f.mapping.id),study=f.service.createStudy({...f.input,datasetVersion:dataset.version,mappingVersion:mapping.version});
 study.split={developmentSessionIds:[...new Set(dataset.events.map(event=>event.sessionId))],validationSessionIds:[]};
 const runs=syntheticStreams.map((events,index)=>({...structuredClone(f.baseline[index%f.baseline.length]),id:`sequence-run-${index}`,events:events.map((event,index)=>({index,...event}))}));return {study,runs,mapping,dataset,result:()=>f.service.compareRuns(study,runs)};
}

test('retry rules distinguish one click from repeated exact actions and honor the bounded minimum',async t=>{
 const f=await setup(t),single=[{event:'submit'}],repeat=[{event:'submit'},{event:'submit'}],click={type:'action',action:{label:'Submit'}};
 const seq=sequenceStudy(f,{metric:{id:'retry',kind:'retry',realEvent:'submit',synthetic:{type:'action_label',value:'Submit'},aggregation:{type:'repeat',minCount:2}},realStreams:[single,single,repeat,repeat],syntheticStreams:[[click],[click,click]]});
 let metric=seq.result().metrics[0];assert.equal(metric.reference.rate,.5);assert.equal(metric.synthetic.rate,.5);assert.equal(metric.status,'agreement');assert.equal(metric.definition.aggregation.minCount,2);
 seq.study.mappingSnapshot.metrics[0].aggregation.minCount=3;metric=seq.result().metrics[0];assert.equal(metric.reference.rate,0);assert.equal(metric.synthetic.rate,0);
 for(const minCount of [1,21,2.5])assert.throws(()=>f.service.saveMapping({metrics:[{...seq.mapping.metrics[0],aggregation:{type:'repeat',minCount}}]},f.mapping.id),/minimum count/);
 assert.throws(()=>f.service.saveMapping({metrics:[{...seq.mapping.metrics[0],synthetic:{type:'outcome',value:'goal_reached'}}]},f.mapping.id),/exact action label/);
});

test('ordinary occurrence remains explicit while unsupported historical sequence labels remain unmapped',async t=>{
 const f=await setup(t),seq=sequenceStudy(f,{metric:{id:'retry',kind:'retry',realEvent:'submit',synthetic:{type:'event_type',value:'submit'},aggregation:{type:'repeat',minCount:2}},realStreams:[[{event:'submit'}],[{event:'submit'}]],syntheticStreams:[[{type:'submit'}],[{type:'submit'}]]});
 delete seq.study.mappingSnapshot.metrics[0].aggregation;let metric=seq.result().metrics[0];assert.equal(metric.status,'unmapped');assert.equal(metric.reference.rate,null);assert.equal(metric.synthetic.rate,null);
 seq.study.mappingSnapshot.metrics[0].kind='path_choice';metric=seq.result().metrics[0];assert.equal(metric.status,'agreement');assert.equal(metric.reference.rate,1);assert.equal(metric.definition.aggregation.type,'any_event');
 assert.equal(f.service.getMapping(f.mapping.id,1).metrics[0].aggregation.type,'any_event');
});

test('retry negatives require complete reference observations and known action labels, with shared screen constraints',async t=>{
 const f=await setup(t),seq=sequenceStudy(f,{metric:{id:'retry',kind:'retry',realEvent:'submit',realScreen:'checkout',synthetic:{type:'action_label',value:'Submit'},aggregation:{type:'repeat',minCount:2}},screenMap:{'/checkout':'checkout','Checkout page':'checkout','/other':'other'},realStreams:[[{event:'submit',screen:'Checkout page'},{event:'submit',screen:'Checkout page'}],[{event:'submit',screen:'/other'},{event:'submit',screen:'/other'}]],syntheticStreams:[[{type:'action',url:'https://p.test/checkout',action:{label:'Submit'}},{type:'action',url:'https://p.test/checkout',action:{label:'Submit'}}],[{type:'action',url:'https://p.test/other',action:{label:'Submit'}},{type:'action',url:'https://p.test/other',action:{label:'Submit'}}]]});
 assert.equal(seq.result().metrics[0].reference.rate,.5);assert.equal(seq.result().metrics[0].synthetic.rate,.5);
 seq.study.datasetSnapshot.events.forEach(event=>{if(event.screen==='/other')event.sessionEnded=false;});let metric=seq.result().metrics[0];assert.equal(metric.status,'not_comparable');assert.equal(metric.reference.rate,null);
 seq.runs[1].events=[{type:'action',url:'https://p.test/checkout',action:{label:'Submit'}},{type:'action',url:'https://p.test/checkout'}];metric=seq.result().metrics[0];assert.equal(metric.synthetic.rate,null);
});

test('backtracking requires A to B to A and collapses repeated screen frames',async t=>{
 const f=await setup(t),paths=[['/a','/a','/a'],['/a','/b','/c'],['/a','/a','/b','/b','/a'],['/a','/b','/a']];
 const seq=sequenceStudy(f,{metric:{id:'back',kind:'backtrack',realEvent:'page_view',synthetic:{type:'event_type',value:'screenshot'},aggregation:{type:'backtrack'}},realStreams:paths.map(path=>path.map(screen=>({screen}))),syntheticStreams:paths.map(path=>path.map(screen=>({type:'screenshot',url:`https://p.test${screen}`})))});
 const metric=seq.result().metrics[0];assert.equal(metric.reference.numerator,2);assert.equal(metric.reference.denominator,4);assert.equal(metric.synthetic.rate,.5);assert.equal(metric.status,'agreement');assert.equal(metric.definition.aggregation.type,'backtrack');
});

test('backtracking uses declared aliases and keeps origins distinct without inventing order or missing screens',async t=>{
 const f=await setup(t),seq=sequenceStudy(f,{metric:{id:'back',kind:'backtrack',realEvent:'page_view',synthetic:{type:'event_type',value:'screenshot'}},screenMap:{'Screen A':'a','Screen B':'b','/a':'a','/b':'b'},realStreams:[[{screen:'Screen A'},{screen:'Screen B'},{screen:'Screen A'}],[{screen:'Screen A'},{screen:'Screen A'}]],syntheticStreams:[[{type:'screenshot',url:'https://p.test/a'},{type:'screenshot',url:'https://p.test/b'},{type:'screenshot',url:'https://p.test/a'}],[{type:'screenshot',url:'https://p.test/a'},{type:'screenshot',url:'https://p.test/a'}]]});
 assert.equal(seq.result().metrics[0].reference.rate,.5);assert.equal(seq.result().metrics[0].synthetic.rate,.5);
 seq.study.mappingSnapshot.screenMap={};seq.study.datasetSnapshot.events=seq.study.datasetSnapshot.events.map((event,index)=>({...event,screen:index<3?['https://one.test/a','https://one.test/b','https://two.test/a'][index]:'https://one.test/a'}));seq.runs[0].events[2].url='https://two.test/a';let metric=seq.result().metrics[0];assert.equal(metric.reference.rate,0);assert.equal(metric.synthetic.rate,0);
 seq.study.datasetSnapshot.events[1].screen=null;seq.runs[0].events[1].url=null;metric=seq.result().metrics[0];assert.equal(metric.reference.rate,null);assert.equal(metric.synthetic.rate,null);assert.equal(metric.status,'not_comparable');
 seq.study.datasetSnapshot.events[1].screen='https://one.test/b';seq.study.datasetSnapshot.events[2].screen='https://one.test/a';seq.study.datasetSnapshot.events[1].at=seq.study.datasetSnapshot.events[0].at;metric=seq.result().metrics[0];assert.equal(metric.reference.rate,null);
});

test('sequence metrics retain the screen-scoped goal-start denominator',async t=>{
 const f=await setup(t),start={id:'start',kind:'goal_start',realEvent:'page_view',realScreen:'/start',synthetic:{type:'screen',value:'/start'}},seq=sequenceStudy(f,{metric:{id:'retry',kind:'retry',realEvent:'submit',synthetic:{type:'action_label',value:'Submit'},denominator:'started_sessions'},otherMetrics:[start],realStreams:[[{screen:'/start'},{event:'submit'},{event:'submit'}],[{screen:'/other'},{event:'submit'},{event:'submit'}]],syntheticStreams:[[{type:'screenshot',url:'https://p.test/start'},{type:'action',action:{label:'Submit'}},{type:'action',action:{label:'Submit'}}],[{type:'screenshot',url:'https://p.test/other'},{type:'action',action:{label:'Submit'}},{type:'action',action:{label:'Submit'}}]]});
 const metric=seq.result().metrics.find(metric=>metric.id==='retry');assert.equal(metric.reference.denominator,1);assert.equal(metric.reference.numerator,1);assert.equal(metric.synthetic.denominator,1);assert.equal(metric.synthetic.numerator,1);assert.equal(metric.status,'insufficient_data');
});
