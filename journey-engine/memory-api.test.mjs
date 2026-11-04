import {retainedFixture} from './retained-test-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdir} from 'node:fs/promises';
import { join } from 'node:path';
import { createWorkspaceApi } from './workspace-api.mjs';
import { parseJourneyFinish } from './browser-tools.mjs';
import { personaMemoryForScreen } from './memory-runtime.mjs';

async function setup(t) {
  const root=await retainedFixture('journey-memory-api-'),runsDir=join(root,'runs');await mkdir(runsDir);
  let api;const server=http.createServer((req,res)=>api.handle(req,res,new URL(req.url,'http://127.0.0.1')));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port,origin=`http://127.0.0.1:${port}`;
  api=createWorkspaceApi({root:join(root,'state'),runsDir,port});await api.ready;
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));api.close();});
  const request=async(path,method='GET',body)=>{const result=await fetch(`${origin}/api/workspace${path}`,{method,headers:{origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:result.status,data:await result.json()};};
  const source=api.store.buildRun({projectId:'little-steps',charterId:'first-value',personaId:'mother',environmentId:'little-steps-local'});
  Object.assign(source,{status:'finished',completedAt:new Date().toISOString(),productFingerprint:{'app.js':'a'.repeat(64)},integrityStatus:'verified',events:[{index:0,type:'screenshot',url:'http://127.0.0.1:4320/activity',screenshot:`/runs/${source.id}/screen-0.png`,videoMs:1200}]});api.store.syncRun(source);
  const input={projectId:'little-steps',name:'Start control',content:'The activity page shows a Start button.',kind:'navigation',subject:'Activity start control',value:'Start button',polarity:'affirm',audience:'persona',confidence:0.85,confidenceBasis:'Screenshot zero shows the labelled control.',scope:{screenPatterns:['/activity'],flows:[]},sources:[{runId:source.id,eventIndex:0}]};
  return {api,request,source,input};
}

test('Memory API validates sources, versions edits, preserves archive history and guards projects',async t=>{
  const {api,request,source,input}=await setup(t);
  const made=await request('/memory','POST',{...input,expectedVersion:0});assert.equal(made.status,201);const id=made.data.id;
  assert.equal(made.data.sources[0].originalMs,1200);assert.equal(made.data.sources[0].screenshot,source.events[0].screenshot);
  const edited=await request(`/memory/${id}`,'PATCH',{projectId:'little-steps',expectedVersion:1,content:'The activity page has a labelled Start control.',status:'corrected'});assert.equal(edited.data.version,2);
  assert.equal((await request(`/memory/${id}/verify`,'POST',{projectId:'little-steps',expectedVersion:1})).data.code,'VERSION_CONFLICT');
  assert.equal((await request(`/memory/${id}/dispute`,'POST',{projectId:'little-steps',expectedVersion:2,reviewReason:'Needs another observation.'})).data.status,'disputed');
  const restored=await request(`/memory/${id}/restore`,'POST',{projectId:'little-steps',expectedVersion:3,version:1});assert.equal(restored.data.version,4);assert.equal(restored.data.content,input.content);
  const archived=await request(`/memory/${id}/archive`,'POST',{projectId:'little-steps',expectedVersion:4,archived:true});assert.equal(archived.data.archived,true);
  assert.equal((await request(`/memory/${id}/versions?projectId=little-steps`)).data.versions.length,4);
  assert.equal((await request('/memory?projectId=little-steps&archived=false')).data.entries.length,0);
  assert.equal((await request('/memory?projectId=little-steps&archived=true')).data.entries.length,1);
  const other=api.store.saveProject({name:'Other'});
  for(const path of [`/memory/${id}?projectId=${other.id}`,`/memory/${id}/versions?projectId=${other.id}`,`/runs/${source.id}/memory?projectId=${other.id}`,`/memory/failures?projectId=${other.id}&runId=${source.id}`])assert.equal((await request(path)).data.code,'PROJECT_MISMATCH');
  assert.equal((await request(`/memory/${id}`,'PATCH',{projectId:other.id,content:'Cross-project edit'})).data.code,'PROJECT_MISMATCH');
  assert.equal((await request(`/memory/${id}`,'DELETE')).status,405);
  assert.equal((await request('/memory','POST',{...input,sources:[{runId:source.id,eventIndex:999}]})).data.code,'INVALID_MEMORY_SOURCE');
});

test('finish learnings automatically publish real sources and expose failures without changing pinned knowledge',async t=>{
  const {api,request,source,input}=await setup(t),before=structuredClone(source.memorySnapshot);
  const learning={...input};delete learning.projectId;learning.sources=[{eventIndex:0}];
  const finish=parseJourneyFinish({type:'function_call',name:'finish_journey',arguments:JSON.stringify({outcome:'goal_reached',observation:'The start control is visible.',interpretation:'The next step is available.',uncertainty:'The full activity was not tested.',evidence_indices:[0],learnings:[learning,{...learning,confidence:undefined},{...learning,sources:[{eventIndex:999}]}]})},source.events);
  api.store.syncRun({...source,memoryLearnings:finish.learnings});api.store.syncRun({...source,memoryLearnings:finish.learnings});
  const result=await request(`/runs/${source.id}/memory?projectId=little-steps`);
  assert.equal(result.status,200);assert.equal(result.data.publications.length,3);assert.equal(result.data.publicationFailures.length,2);assert.deepEqual(result.data.snapshot,before);
  const published=result.data.publications.find(item=>item.status==='published');assert.equal(published.entry.sources[0].runId,source.id);assert.equal(published.entry.sources[0].originalMs,1200);assert.equal(published.entry.claimType,'observed');assert.equal(published.entry.applicability.personaId,'mother');
  assert.equal((await request('/memory/failures?projectId=little-steps')).data.failures.length,2);
  assert.equal(api.store.listRuns().length,1);assert.equal(api.store.memory.list({projectId:'little-steps'}).length,1);
});

test('run memory inspection reports exact role access and later edits cannot rewrite the snapshot',async t=>{
  const {api,request,source,input}=await setup(t);const entry=api.store.memory.create(input);
  api.store.saveEntity('persona',{continuity:'returning'},'mother');api.store.saveEntity('charter',{memoryPolicy:'relevant'},'first-value');
  const run=api.store.buildRun({projectId:'little-steps',charterId:'first-value',personaId:'mother',environmentId:'little-steps-local'});run.productFingerprint=source.productFingerprint;
  run.memorySnapshot=api.store.memory.bindSnapshotBuild(run.memorySnapshot,{buildId:api.store.memory.buildIdentity(run)});run.memorySnapshotId=run.memorySnapshot.id;api.store.syncRun(run);
  const context=personaMemoryForScreen(run,api.store.memory,'http://127.0.0.1:4320/activity');assert.deepEqual(context.entryIds,[entry.id]);
  api.store.memory.recordAccess(run.id,{audience:'persona',url:context.url,entryIds:context.entryIds,eventIndex:0});
  api.store.memory.update(entry.id,{expectedVersion:1,content:'A later edit must not appear in this run.'});
  const result=await request(`/runs/${run.id}/memory?projectId=little-steps`);assert.equal(result.data.accessLog.length,1);assert.deepEqual(result.data.accessLog[0].entryIds,[entry.id]);assert.equal(result.data.snapshot.roles.persona[0].content,input.content);
  assert.equal((await request(`/runs/${run.id}/memory?projectId=little-steps`)).data.accessLog.length,1);
});

test('contradiction resolution is explicit, project-scoped and preserves both version histories',async t=>{
  const {api,request,input}=await setup(t);const first=api.store.memory.create(input),second=api.store.memory.create({...input,content:'A different control is visible.',value:'Begin button'});
  const conflict=api.store.memory.get(first.id).conflicts.find(item=>item.status==='unresolved');assert.ok(conflict);
  const other=api.store.saveProject({name:'Elsewhere'});
  assert.equal((await request(`/memory/conflicts/${conflict.id}/resolve`,'POST',{projectId:other.id,preferredEntryId:first.id,expectedVersion:conflict.version,reason:'Wrong project'})).data.code,'PROJECT_MISMATCH');
  const result=await request(`/memory/conflicts/${conflict.id}/resolve`,'POST',{projectId:'little-steps',preferredEntryId:first.id,expectedVersion:conflict.version,reason:'The current screenshot shows Start.'});assert.equal(result.status,200);assert.equal(result.data.conflict.status,'resolved');
  assert.equal(api.store.memory.get(first.id).status,'verified');assert.equal(api.store.memory.get(second.id).status,'superseded');assert.equal(api.store.memory.versions(first.id).length,2);assert.equal(api.store.memory.versions(second.id).length,2);
});
