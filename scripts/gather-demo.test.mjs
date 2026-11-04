import test from 'node:test';
import assert from 'node:assert/strict';
import {runReceipt,assertRun,sourceHash,LIMITS,PROJECT} from './gather-demo.mjs';
import {changeImpactSourceHash} from '../journey-engine/change-impact.mjs';

function fixture(){
  const persona={id:'gather-coordinator',versionId:'persona-v1'},environment={id:'gather-base',versionId:'environment-v1'},charter={id:'gather-book-room',versionId:'charter-v1'};
  const usage=[{input_tokens:70,output_tokens:30,total_tokens:100},{input_tokens:130,output_tokens:20,total_tokens:150}];
  const run={id:'00000000-0000-4000-8000-000000000001',projectId:PROJECT,personaId:persona.id,personaVersionId:persona.versionId,environmentId:environment.id,environmentVersionId:environment.versionId,charterId:charter.id,charterVersionId:charter.versionId,executionPolicy:{...LIMITS},productFingerprint:{'app.js':'a'.repeat(64),'index.html':'b'.repeat(64)},personaSnapshot:{...persona,continuity:'first-time'},memorySnapshot:{roles:{persona:[]}},status:'finished',model:'muse-wonder-1.0',finding:{outcome:'goal_reached'},integrityStatus:'recorded',usage,modelRequests:usage.map((item,index)=>({id:`request-${index}`,providerResponseId:`response-${index}`,model:'muse-wonder-1.0',usage:structuredClone(item)})),events:[{type:'action',action:{type:'click_control',label:'Choose Atlas'}},{type:'action_rejected',action:{type:'click_control',label:'Unknown control'}},{type:'action',rejected:true,action:{type:'click_control',label:'Unexecuted'}},{type:'action',action:{type:'type',text:'Quarterly planning'}}],experience:[{eventIndex:0,reaction:'The total fits.'}],video:'/runs/00000000-0000-4000-8000-000000000001/journey.webm',replay:'/runs/00000000-0000-4000-8000-000000000001/replay.webm'};
  return {run,persona,environment,charter,hash:sourceHash(run.productFingerprint)};
}

test('Gather source identities match the engine with mixed-case metadata and insertion-order changes',()=>{
  const fingerprint={'styles.css':'c','app.js':'a','FIX_PLAN.json':'f','IMPROVEMENT.md':'i','index.html':'b'};
  assert.equal(sourceHash(fingerprint),changeImpactSourceHash({productFingerprint:fingerprint}));
  assert.equal(sourceHash(Object.fromEntries(Object.entries(fingerprint).reverse())),sourceHash(fingerprint));
  assert.notEqual(sourceHash({...fingerprint,'app.js':'changed'}),sourceHash(fingerprint));
});

test('run receipt reconciles actual token receipts and excludes rejected navigation attempts',()=>{
  const {run}=fixture(),receipt=runReceipt(run);
  assert.equal(receipt.tokens,250);assert.equal(receipt.usageKnown,true);assert.equal(receipt.actions,2);assert.equal(receipt.experienceSignals,1);assert.equal(receipt.outcome,'goal_reached');assert.equal(receipt.sourceHash,sourceHash(run.productFingerprint));
});

test('null, absent and malformed usage remain unknown instead of throwing or becoming zero',()=>{
  for(const broken of [[],[null],[{}],[{total_tokens:-1}],[{total_tokens:1.5}],[{total_tokens:'100'}]]){
    const {run}=fixture();run.usage=broken;
    const receipt=runReceipt(run);assert.equal(receipt.usageKnown,false,JSON.stringify(broken));assert.equal(receipt.tokens,null);
  }
});

test('missing invocation receipts and mismatched receipt ledgers cannot authorize another paid journey',()=>{
  for(const mutate of [
    run=>{run.modelRequests=[];},
    run=>{delete run.modelRequests;},
    run=>{run.modelRequests.pop();},
    run=>{run.modelRequests[0].usage=null;},
    run=>{run.modelRequests[0].usage.total_tokens=-1;},
    run=>{run.modelRequests[0].usage.total_tokens=101;},
  ]){
    const {run,persona,environment,charter,hash}=fixture();mutate(run);
    assert.equal(runReceipt(run).usageKnown,false);assert.equal(runReceipt(run).tokens,null);
    assert.throws(()=>assertRun(run,persona,environment,charter,hash),/usage|receipt|token/i);
  }
});

test('finished journeys may truthfully report either a reached goal or an observed obstacle',()=>{
  for(const outcome of ['goal_reached','obstacle_observed']){
    const {run,persona,environment,charter,hash}=fixture();run.finding.outcome=outcome;
    assert.equal(assertRun(run,persona,environment,charter,hash).outcome,outcome);
  }
});
test('temporary target receipts retain the configured parent and exact build target',()=>{
 const {run,persona,environment,charter,hash}=fixture();
 const temporary={id:'proposal-instance',versionId:'target-v1',configuredEnvironment:environment};
 run.executionInstance={targetId:temporary.id,environmentId:environment.id,kind:'change-preview'};
 assert.equal(assertRun(run,persona,temporary,charter,hash).id,run.id);
 run.executionInstance.targetId='another-instance';
 assert.throws(()=>assertRun(run,persona,temporary,charter,hash),/controls/);
});

test('launch-control mismatches stop before admitting another model session',()=>{
  for(const key of ['projectId','personaId','personaVersionId','environmentId','environmentVersionId','charterVersionId']){
    const {run,persona,environment,charter,hash}=fixture();run[key]='changed';
    assert.throws(()=>assertRun(run,persona,environment,charter,hash),/control|pin/i,key);
  }
  for(const key of Object.keys(LIMITS)){
    const {run,persona,environment,charter,hash}=fixture();run.executionPolicy[key]+=1;
    assert.throws(()=>assertRun(run,persona,environment,charter,hash),/policy|limit|budget/i,key);
  }
});

test('missing or changed source and invalidated evidence cannot be accepted as the pinned build',()=>{
  const mismatch=fixture();mismatch.run.productFingerprint['app.js']='c'.repeat(64);
  assert.throws(()=>assertRun(mismatch.run,mismatch.persona,mismatch.environment,mismatch.charter,mismatch.hash),/source|pin|build/i);
  const empty=fixture();empty.run.productFingerprint={};
  assert.throws(()=>assertRun(empty.run,empty.persona,empty.environment,empty.charter,sourceHash({})),/source|pin|build/i);
  const invalid=fixture();invalid.run.integrityStatus='invalidated';
  assert.throws(()=>assertRun(invalid.run,invalid.persona,invalid.environment,invalid.charter,invalid.hash),/source|integrity|invalidat|evidence/i);
});

test('first-time knowledge boundaries, incomplete sessions and wrong model all stop acceptance',()=>{
  for(const mutate of [run=>{run.personaSnapshot.continuity='returning';},run=>{run.memorySnapshot.roles.persona=[{id:'prior-learning'}];}]){
    const {run,persona,environment,charter,hash}=fixture();mutate(run);assert.throws(()=>assertRun(run,persona,environment,charter,hash),/fresh|memory|first.time/i);
  }
  for(const status of ['queued','running','incomplete','failed','cancelled']){
    const {run,persona,environment,charter,hash}=fixture();run.status=status;assert.throws(()=>assertRun(run,persona,environment,charter,hash),/journey|record|complet/i);
  }
  const {run,persona,environment,charter,hash}=fixture();run.model='different-model';assert.throws(()=>assertRun(run,persona,environment,charter,hash),/model|provider/i);
});

test('an in-flight request exceeding the token allowance stops subsequent paid sessions',()=>{
  const {run,persona,environment,charter,hash}=fixture();run.usage[1].total_tokens=LIMITS.maxTokens;run.modelRequests[1].usage.total_tokens=LIMITS.maxTokens;
  assert.equal(runReceipt(run).usageKnown,true);assert.ok(runReceipt(run).tokens>LIMITS.maxTokens);
  assert.throws(()=>assertRun(run,persona,environment,charter,hash),/token|budget|allowance|usage/i);
});
