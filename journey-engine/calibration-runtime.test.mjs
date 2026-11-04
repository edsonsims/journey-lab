import {retainedFixture} from './retained-test-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {createWorkspaceStore} from './workspace-store.mjs';
import {createCalibrationRuntime} from './calibration-runtime.mjs';
import {createWorkspaceCalibration} from './workspace-calibration.mjs';

const source={'app.js':'a'.repeat(64)};
async function setup(t){
  const root=await retainedFixture('journey-calibration-runtime-'),store=createWorkspaceStore({root});t.after(()=>store.close());
  const base=store.buildRun({charterId:'first-value',personaId:'mother',environmentId:'little-steps-local'});base.productFingerprint=source;
  const buildId=store.memory.buildIdentity(base),snapshot=store.memory.bindSnapshotBuild(base.memorySnapshot,{buildId});
  const study={id:'study-one',projectId:'little-steps',controls:{persona:base.personaSnapshot,environment:base.environmentSnapshot,charter:base.charterSnapshot,model:'muse-wonder-1.0',buildId},memoryContext:{snapshot,id:snapshot.id,baselineRunId:base.id,scenarioId:base.scenarioId},limits:{maxTokens:90000,maxDurationMs:600000,maxSessions:8,maxCandidates:2,sessionMaxSteps:12,sessionMaxTokens:40000,sessionMaxDurationMs:200000,sessionsPerPhase:2}};
  return {store,study};
}
const candidate={id:'candidate-one',version:1,adjustment:{kind:'persona',changes:{priorities:'Hypothesis: investigate whether preparation effort fits the stated time before committing.'}}};
const response=changes=>({id:'resp_test',status:'completed',usage:{input_tokens:400,output_tokens:100,total_tokens:500},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({changes,rationale:'Test a bounded decision priority; this remains a hypothesis.'})}]}]});

test('Meta receives development context only and records bounded, unsaved candidate provenance',async t=>{
  const {store,study}=await setup(t),requests=[];study.datasetSnapshot={events:[{secret:'held-out data'}]};study.controls.environment.authStatePath='/private/session-reference.json';
  const runtime=createCalibrationRuntime({store,requestMeta:async(body)=>{requests.push(body);return response(candidate.adjustment.changes);}});
  const result=await runtime.proposeCandidate({study,candidateIndex:1,developmentComparison:{metrics:[{kind:'goal_complete',delta:-0.4}]},remainingBudget:{maxTokens:90000,maxDurationMs:10000}});
  assert.equal(result.usage.total_tokens,500);assert.equal(result.provenance.model,'muse-wonder-1.0');assert.deepEqual(result.adjustment,candidate.adjustment);
  assert.equal(requests.length,1);assert.ok(requests[0].max_output_tokens<=4096);assert.equal(requests[0].store,false);
  const sent=JSON.stringify(requests[0]);assert.ok(!sent.includes('held-out data'));assert.ok(!sent.includes('/private/session-reference'));assert.equal(store.getEntity('persona','mother').version,1);assert.equal(store.listRuns().length,0);
});
test('malformed paid proposals retain usage and never leak provider errors or grant permissions',async t=>{
  const {store,study}=await setup(t);
  const runtime=createCalibrationRuntime({store,requestMeta:async()=>response({allowMutations:true})});
  await assert.rejects(runtime.proposeCandidate({study,candidateIndex:1,developmentComparison:{},remainingBudget:{maxTokens:90000,maxDurationMs:10000}}),error=>error.code==='CALIBRATION_INVALID_ADJUSTMENT'&&error.usage.total_tokens===500);
  const failed=createCalibrationRuntime({store,requestMeta:async()=>{throw Error('Bearer SECRET-PROVIDER-STRING');}});
  await assert.rejects(failed.proposeCandidate({study,candidateIndex:2,developmentComparison:{},remainingBudget:{maxTokens:90000,maxDurationMs:10000}}),error=>error.code==='CALIBRATION_PROVIDER_FAILED'&&!error.message.includes('SECRET'));
  const unknown=createCalibrationRuntime({store,requestMeta:async()=>({...response(candidate.adjustment.changes),usage:undefined})});
  await assert.rejects(unknown.proposeCandidate({study,candidateIndex:3,developmentComparison:{},remainingBudget:{maxTokens:90000,maxDurationMs:10000}}),{code:'USAGE_UNAVAILABLE'});
});
test('proposal cancellation stops a stalled provider without an automatic retry',async t=>{
  const {store,study}=await setup(t),controller=new AbortController();let calls=0;
  const runtime=createCalibrationRuntime({store,requestMeta:()=>{calls++;return new Promise(()=>{});}});
  const pending=runtime.proposeCandidate({study,candidateIndex:1,developmentComparison:{},remainingBudget:{maxTokens:90000,maxDurationMs:10000},signal:controller.signal});controller.abort();
  await assert.rejects(pending,{code:'CALIBRATION_CANCELLED'});assert.equal(calls,1);
});
test('experimental journeys pin controls and memory while respecting remaining session budgets',async t=>{
  const {store,study}=await setup(t),launched=[];let capacity=0;
  const runtime=createCalibrationRuntime({store,fingerprint:async()=>source,assertCapacity:async()=>capacity++,runVariant:async run=>{launched.push(run);store.syncRun({...run,status:'finished',usage:[{total_tokens:100}],finding:{outcome:'goal_reached'},findings:[]});return run;}});
  store.saveEntity('persona',{priorities:'A later active change',expectedVersion:1},'mother');
  const result=await runtime.executeTrial({study,candidate,phase:'development',sessionIndex:0,remainingBudget:{maxTokens:12000,maxDurationMs:30000}});
  const run=store.getRun(result.runId);assert.equal(capacity,1);assert.equal(run.experimental,true);assert.equal(run.calibrationStudyId,study.id);assert.equal(run.experimentalCandidateId,candidate.id);assert.equal(run.expectedBuildId,study.controls.buildId);
  assert.equal(run.executionPolicy.maxTokens,12000);assert.equal(run.executionPolicy.maxDurationMs,30000);assert.equal(run.executionPolicy.maxSteps,12);assert.equal(run.personaVersion,1);
  assert.equal(run.personaSnapshot.priorities,candidate.adjustment.changes.priorities);assert.deepEqual(run.memorySnapshot,study.memoryContext.snapshot);assert.equal(store.getEntity('persona','mother').priorities,'A later active change');assert.equal(result.usage.total_tokens,100);
  await runtime.executeTrial({study,candidate,phase:'validation',sessionIndex:0,remainingBudget:{maxTokens:12000,maxDurationMs:30000}});assert.notEqual(launched[0].id,launched[1].id);assert.deepEqual(launched[0].memorySnapshot,launched[1].memorySnapshot);
});

test('experimental journeys use frozen device conditions even after the saved device is edited',async t=>{
 const {store,study}=await setup(t),original=store.resolveBrowserConfiguration(study.controls.persona);study.controls.browserConfiguration=structuredClone(original);
 store.saveEntity('device',{expectedVersion:original.deviceVersion,viewport:{width:430,height:930}},original.deviceId);
 const runtime=createCalibrationRuntime({store,fingerprint:async()=>source,runVariant:async run=>{store.syncRun({...run,status:'finished',usage:[{total_tokens:1}]});return run;}});
 const result=await runtime.executeTrial({study,candidate,phase:'development',sessionIndex:0,remainingBudget:{maxTokens:12000,maxDurationMs:30000}});
 const run=store.getRun(result.runId);assert.deepEqual(run.deviceSnapshot,original.deviceSnapshot);assert.deepEqual(run.networkProfileSnapshot,original.networkProfileSnapshot);assert.deepEqual(run.viewport,original.viewport);assert.notEqual(store.getEntity('device',original.deviceId).version,run.deviceVersion);
});
test('source drift, missing isolation and revoked environment prevent any experimental launch',async t=>{
  const {store,study}=await setup(t);let calls=0;
  const input={study,candidate,phase:'development',sessionIndex:0,remainingBudget:{maxTokens:12000,maxDurationMs:30000}};
  const changed=createCalibrationRuntime({store,fingerprint:async()=>({'app.js':'b'.repeat(64)}),runVariant:async()=>calls++});await assert.rejects(changed.executeTrial(input),{code:'CALIBRATION_BUILD_CHANGED'});
  const unsafe=structuredClone(study);unsafe.controls.environment.isolation='independent-session';
  const runtime=createCalibrationRuntime({store,fingerprint:async()=>source,runVariant:async()=>calls++});await assert.rejects(runtime.executeTrial({...input,study:unsafe}),{code:'CALIBRATION_ISOLATION_REQUIRED'});
  store.saveEntity('environment',{allowMutations:false,expectedVersion:1},'little-steps-local');await assert.rejects(runtime.executeTrial(input),{code:'CALIBRATION_ENVIRONMENT_CHANGED'});assert.equal(calls,0);
});
test('a frozen temporary target cannot be relaunched or adopted as a configured calibration environment',async t=>{
 const {store,study}=await setup(t),parent=study.controls.environment;
 const preview=store.saveEntity('environment',{projectId:'little-steps',name:'Historical preview',url:'http://127.0.0.1:4945/',repositoryPath:parent.repositoryPath,isolation:'stateless-demo'});
 study.controls.environment=preview;store.registerEnvironmentInstance(preview.id,{parentEnvironmentId:parent.id,parentEnvironmentVersion:parent.version,source:{kind:'fix-preview'}});
 let launches=0;const runtime=createCalibrationRuntime({store,fingerprint:async()=>source,runVariant:async()=>launches++});
 await assert.rejects(runtime.executeTrial({study,candidate,phase:'development',sessionIndex:0,remainingBudget:{maxTokens:12000,maxDurationMs:30000}}),{code:'CALIBRATION_ENVIRONMENT_CHANGED'});
 await assert.rejects(runtime.adoptCandidate({study,candidate,result:{id:'result-one'},idempotencyKey:'old-preview-approval',expectedPersonaVersion:1}),{code:'CALIBRATION_ENVIRONMENT_CHANGED'});
 assert.equal(launches,0);assert.equal(store.getEntity('persona','mother').version,1);
});
test('exact-version adoption is atomic and idempotent while stale active changes remain untouched',async t=>{
  const {store,study}=await setup(t);const runtime=createCalibrationRuntime({store,fingerprint:async()=>source});
  const input={study,candidate,result:{id:'result-one',hash:'immutable-result'},idempotencyKey:'approval-one',expectedPersonaVersion:1};
  const receipt=await runtime.adoptCandidate(input);assert.equal(receipt.version,2);assert.deepEqual(await runtime.adoptCandidate(input),receipt);assert.equal(store.versions('persona','mother').length,2);assert.equal(store.getEntity('persona','mother',1).priorities,study.controls.persona.priorities);
  await assert.rejects(runtime.adoptCandidate({...input,idempotencyKey:'approval-two'}),{code:'VERSION_CONFLICT'});
  await assert.rejects(runtime.adoptCandidate({...input,candidate:{...candidate,id:'another'}}),{code:'IDEMPOTENCY_CONFLICT'});
  assert.equal(store.getEntity('persona','mother').version,2);
});
test('a failed adoption receipt rolls back the appended persona version',async t=>{
  const {store,study}=await setup(t),runtime=createCalibrationRuntime({store,fingerprint:async()=>source});
  store.db.exec("CREATE TRIGGER fail_calibration_audit BEFORE INSERT ON audit WHEN NEW.kind='calibration-adoption' BEGIN SELECT RAISE(ABORT,'injected receipt failure'); END;");
  await assert.rejects(runtime.adoptCandidate({study,candidate,result:{id:'result-one'},idempotencyKey:'approval-one',expectedPersonaVersion:1}),/injected/);
  assert.equal(store.getEntity('persona','mother').version,1);assert.equal(store.versions('persona','mother').length,1);
});
test('adoption refuses a product source that changed after held-out validation',async t=>{
  const {store,study}=await setup(t),runtime=createCalibrationRuntime({store,fingerprint:async()=>({'app.js':'b'.repeat(64)})});
  await assert.rejects(runtime.adoptCandidate({study,candidate,result:{id:'result-one'},idempotencyKey:'approval-one',expectedPersonaVersion:1}),{code:'CALIBRATION_BUILD_CHANGED'});assert.equal(store.getEntity('persona','mother').version,1);
});
test('domain and runtime complete four isolated fixture sessions without adopting or exposing held-out data',async t=>{
  const {store,study:template}=await setup(t),ids=[],launched=[];
  for(let index=0;index<2;index++){
    const run=store.buildRun({charterId:'first-value',personaId:'mother',environmentId:'little-steps-local'});Object.assign(run,{status:'finished',integrityStatus:'verified',productFingerprint:source,memorySnapshot:template.memoryContext.snapshot,memorySnapshotId:template.memoryContext.id,finding:{outcome:'obstacle_observed'},findings:[],usage:[{total_tokens:100}]});store.syncRun(run);ids.push(run.id);
  }
  const runtime=createCalibrationRuntime({store,fingerprint:async()=>source,requestMeta:async()=>response(candidate.adjustment.changes),runVariant:async run=>{launched.push(run);store.syncRun({...run,status:'finished',integrityStatus:'verified',productFingerprint:source,finding:{outcome:'goal_reached'},findings:[],usage:[{total_tokens:100}]});return run;}});
  const service=createWorkspaceCalibration({store,...runtime});t.after(()=>service.close());
  const at=new Date().toISOString(),dataset=service.saveDataset({projectId:'little-steps',name:'Explicit synthetic fixture',source:{kind:'fixture',label:'Test-generated reference sessions'},events:Array.from({length:8},(_,index)=>({sessionId:`fixture-${index}`,event:'completed',at,environmentId:'little-steps-local',buildId:template.controls.buildId,traffic:'human',sessionEnded:true}))});
  const mapping=service.saveMapping({projectId:'little-steps',name:'Completion fixture',metrics:[{id:'complete',kind:'goal_complete',realEvent:'completed',synthetic:{type:'outcome',value:'goal_reached'}}]});
  const study=service.createStudy({projectId:'little-steps',name:'Runtime integration fixture',datasetId:dataset.id,mappingId:mapping.id,personaId:'mother',environmentId:'little-steps-local',charterId:'first-value',buildId:template.controls.buildId,timeWindow:{from:at,to:at},runIds:ids,minSessions:2,limits:{sessionMaxSteps:24,sessionMaxTokens:250000,sessionMaxDurationMs:600000,maxTokens:2000000,maxDurationMs:1800000}});
  service.start(study.id);await service.waitForIdle();const result=service.getStudy(study.id);
  assert.equal(result.status,'awaiting_review',JSON.stringify({error:result.error,baseline:result.baselineComparison}));assert.equal(launched.length,4);assert.equal(result.usage.tokens,900);assert.equal(store.getEntity('persona','mother').version,1);assert.equal(result.candidates[0].result.acceptanceGate,'real_data_required');assert.ok(launched.every(run=>run.experimental&&run.memorySnapshotId===template.memoryContext.id));
});
