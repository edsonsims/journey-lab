import {retainedFixture} from './retained-test-fixtures.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, readFile, writeFile, rename, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createComparisonsApi } from './comparisons-api.mjs';
import { productFingerprint } from './product-integrity.mjs';

const root=retainedFixture('journey-comparison-test-');
const iid='83cb71bf-0ea3-4ec6-96ab-8e5332a24d47';const job=join(root,'improvements',iid);await mkdir(join(job,'baseline'),{recursive:true});await mkdir(join(job,'candidate'));
await writeFile(join(job,'baseline','index.html'),'before');await writeFile(join(job,'candidate','index.html'),'after');
const status={experimentId:iid,status:'awaiting_review',verification:{status:'passed'}};await writeFile(join(job,'status.json'),JSON.stringify(status));
const runs=new Map(), calls=[];let invalidate=false, waitForCancellation=false;let release;const gate=new Promise(r=>release=r);
const api=createComparisonsApi({root:join(root,'comparisons'),improvementsRoot:join(root,'improvements'),port:4391,configured:()=>true,isBusy:()=>false,getRun:async id=>runs.get(id)||null,runVariant:async x=>{calls.push(x);if(x.variant==='baseline'){if(waitForCancellation){await new Promise(resolve=>{if(x.signal.aborted)resolve();else x.signal.addEventListener('abort',resolve,{once:true});});const run={id:x.id,status:'cancelled',video:`/runs/${x.id}/journey.webm`,events:[]};runs.set(x.id,run);return run;}await gate;if(invalidate)await writeFile(join(job,'baseline','index.html'),'changed');}const run={id:x.id,variant:x.variant,comparisonId:x.comparisonId,status:'finished',video:`/runs/${x.id}/journey.webm`,finding:{outcome:x.persona?.id==='teacher'?'goal_reached':x.variant==='baseline'?'obstacle_observed':'goal_reached'},events:[{type:'action'}]};runs.set(x.id,run);return run;}});
const server=http.createServer(async(req,res)=>{if(!await api.handle(req,res,new URL(req.url,'http://localhost')))res.writeHead(404).end();});await new Promise(r=>server.listen(0,'127.0.0.1',r));const host=`http://127.0.0.1:${server.address().port}`;after(async()=>{await new Promise(r=>server.close(r));});
const post=async data=>fetch(host+'/api/comparisons',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
test('requires a valid id and a previously verified candidate',async()=>{assert.equal((await post({improvementId:'../bad'})).status,400);await writeFile(join(job,'status.json'),JSON.stringify({...status,verification:{status:'failed'}}));assert.equal((await post({improvementId:iid})).status,400);await writeFile(join(job,'status.json'),JSON.stringify(status));});
test('executes separate runs sequentially, retains real facts, and rejects overlap',async()=>{let res=await post({improvementId:iid});assert.equal(res.status,202);const started=await res.json();assert.equal((await post({improvementId:iid})).status,409);for(let i=0;i<200&&calls.length===0;i++)await new Promise(r=>setTimeout(r,10));assert.equal(calls.length,1);assert.match(calls[0].target,/\/baseline\/$/);release();let result;for(let i=0;i<100;i++){result=await(await fetch(host+'/api/comparisons/'+started.id)).json();if(result.status==='completed')break;await new Promise(r=>setTimeout(r,10));}assert.equal(result.status,'completed');assert.equal(calls.length,2);assert.match(calls[1].target,/\/candidate\/$/);assert.notEqual(result.baselineRunId,result.candidateRunId);assert.equal(result.comparison.before.outcome,'obstacle_observed');assert.equal(result.comparison.after.outcome,'goal_reached');assert.equal(result.comparison.after.actionCount,1);assert.ok(result.comparison.limitations.includes('não medem sentimentos reais'));assert.equal((await(await fetch(host+'/api/comparisons')).json()).comparisons.length,1);});
test('a version change invalidates the comparison',async()=>{invalidate=true;const result=await(await post({improvementId:iid})).json();let detail;for(let i=0;i<100;i++){detail=await(await fetch(host+'/api/comparisons/'+result.id)).json();if(detail.status==='invalidated')break;await new Promise(r=>setTimeout(r,10));}assert.equal(detail.status,'invalidated');assert.equal(detail.comparison,null);invalidate=false;});
test('cancellation aborts the active run and preserves its video without starting the other variant',async()=>{waitForCancellation=true;const previous=calls.length;const x=await(await post({improvementId:iid})).json();for(let i=0;i<100&&calls.length===previous;i++)await new Promise(r=>setTimeout(r,5));assert.equal(calls.length,previous+1);let r=await fetch(host+'/api/comparisons/'+x.id+'/cancel',{method:'POST'});assert.equal(r.status,202);assert(['cancelling','cancelled'].includes((await r.json()).status));let detail;for(let i=0;i<100;i++){detail=await(await fetch(host+'/api/comparisons/'+x.id)).json();if(detail.status==='cancelled')break;await new Promise(r=>setTimeout(r,10));}assert.equal(detail.status,'cancelled');assert.ok(detail.before.video);assert.equal(detail.after,null);assert.equal(calls.length,previous+1);assert.equal((await fetch(host+'/api/comparisons/'+x.id+'/cancel',{method:'POST'})).status,409);waitForCancellation=false;});

test('new scenario runs both personas on isolated before/after contexts and keeps their outcomes separate',async()=>{
  const productFingerprintValue=await productFingerprint(join(job,'baseline'));
  await writeFile(join(job,'status.json'),JSON.stringify({...status,scenarioId:'print-context-v1',productFingerprint:productFingerprintValue,verification:{status:'passed',candidateFingerprint:await productFingerprint(join(job,'candidate'))}}));
  const previous=calls.length;
  const response=await post({improvementId:iid});assert.equal(response.status,202);
  const started=await response.json();let detail;
  for(let i=0;i<100;i++){detail=await(await fetch(host+'/api/comparisons/'+started.id)).json();if(detail.status==='completed')break;await new Promise(r=>setTimeout(r,10));}
  assert.equal(detail.status,'completed');assert.equal(detail.scenarioId,'print-context-v1');assert.equal(detail.pairs.length,2);
  assert.deepEqual(detail.pairs.map(p=>p.personaId),['teacher','mother']);
  const actual=calls.slice(previous);assert.equal(actual.length,4);assert.equal(new Set(actual.map(x=>x.id)).size,4);
  assert.deepEqual(actual.map(x=>[x.persona.id,x.variant]),[['teacher','baseline'],['teacher','candidate'],['mother','baseline'],['mother','candidate']]);
  for(const pair of detail.pairs){assert.ok(pair.before.video);assert.ok(pair.after.video);assert.notEqual(pair.baselineRunId,pair.candidateRunId);}
  assert.deepEqual(actual[0].persona,actual[1].persona);assert.deepEqual(actual[2].persona,actual[3].persona);
  assert.deepEqual(actual[0].persona.viewport,{width:1280,height:800});assert.deepEqual(actual[2].persona.viewport,{width:390,height:844});
  assert.equal(detail.pairs[0].comparison.before.outcome,'goal_reached');assert.equal(detail.pairs[1].comparison.before.outcome,'obstacle_observed');
  assert.equal(detail.pairs[0].comparison.after.outcome,'goal_reached');assert.equal(detail.pairs[1].comparison.after.outcome,'goal_reached');
  assert.equal(detail.comparison.personas.length,2);assert.equal(detail.currentPersonaId,'mother');
  await writeFile(join(job,'status.json'),JSON.stringify(status));
});
test('new scenario cannot compare a baseline different from the observed discovery',async()=>{
  const previous=calls.length;
  await writeFile(join(job,'status.json'),JSON.stringify({...status,scenarioId:'print-context-v1',productFingerprint:{'index.html':'wrong'}}));
  const response=await post({improvementId:iid});assert.equal(response.status,400);assert.equal(calls.length,previous);
  await writeFile(join(job,'status.json'),JSON.stringify(status));
});
test('new scenario rejects files changed after the successful candidate verification',async()=>{
  const previous=calls.length;
  const originalCandidate=await readFile(join(job,'candidate','index.html'),'utf8');
  const verified={...status,scenarioId:'print-context-v1',productFingerprint:await productFingerprint(join(job,'baseline')),verification:{status:'passed',candidateFingerprint:await productFingerprint(join(job,'candidate'))}};
  await writeFile(join(job,'status.json'),JSON.stringify(verified));
  await writeFile(join(job,'candidate','index.html'),'changed after verifier');
  const response=await post({improvementId:iid});assert.equal(response.status,400);assert.match((await response.json()).error,/mudou desde a verificação/);assert.equal(calls.length,previous);
  await writeFile(join(job,'candidate','index.html'),originalCandidate);
  await writeFile(join(job,'status.json'),JSON.stringify(status));
});
test('rejects symlinked candidate files',async()=>{await rename(join(job,'candidate','index.html'),join(root,'retained-candidate-before-symlink.html'));await symlink(join(job,'baseline','index.html'),join(job,'candidate','index.html'));assert.equal((await post({improvementId:iid})).status,400);});
