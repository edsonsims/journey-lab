import {retainedFixture} from './retained-test-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {createWorkspaceStore} from './workspace-store.mjs';

test('metadata cursor pages retain tie ordering, triage, totals and independent snapshots',async t=>{
  const root=await retainedFixture('journey-paging-'),store=createWorkspaceStore({root});t.after(()=>store.close());
  for(const id of ['a','b','c','d','e'])store.syncRun({id,projectId:'little-steps',name:`Journey ${id}`,personaId:id==='e'?'teacher':'mother',environmentId:'little-steps-local',status:'finished',createdAt:'2026-11-01T10:00:00.000Z',startedAt:'2026-11-01T10:00:01.000Z',completedAt:'2026-11-01T10:00:11.000Z',events:[{type:'screenshot',index:0,screenshot:`/runs/${id}/frame.png`}],usage:[{input_tokens:20,output_tokens:10,total_tokens:30}],personaSnapshot:{context:'private full context'},memorySnapshot:{roles:{persona:[{content:'large context'}]}},modelRequests:[{large:'not list metadata'}],replayMetadata:{segments:[{large:'not list metadata'}]},findings:[{title:'Observed',impact:'high',type:'broken',observation:'A blocked control',evidence_indices:[0]}]});
  store.renameRun('b','Reviewed name');const finding=store.listFindings({runId:'c'})[0];store.updateFinding(finding.id,{impact:'critical',reason:'Reviewed impact'});
  const first=store.listRunsPage({projectId:'little-steps',personaId:'mother',limit:2});assert.equal(first.page.total,4);assert.deepEqual(first.runs.map(x=>x.id),['a','b']);assert.equal(first.runs[1].name,'Reviewed name');
  const second=store.listRunsPage({projectId:'little-steps',personaId:'mother',limit:2,cursor:first.page.nextCursor});assert.deepEqual(second.runs.map(x=>x.id),['c','d']);assert.equal(second.page.nextCursor,null);assert.equal(second.runs[0].impactCounts.critical,1);
  for(const row of [...first.runs,...second.runs]){for(const key of ['events','usage','personaSnapshot','memorySnapshot','modelRequests','replayMetadata'])assert.equal(Object.hasOwn(row,key),false);assert.equal(row.totalTokens,30);assert.equal(row.durationMs,10000);assert.equal(row.findingsCount,1);}
  assert.ok(store.getRun('a').memorySnapshot);assert.equal(store.listRunsPage({query:'Reviewed'}).page.total,1);assert.throws(()=>store.listRunsPage({cursor:'garbage'}),{code:'INVALID_CURSOR'});
});

test('restart marks orphaned records interrupted without losing pinned state or duplicating recovery audits',async()=>{
  const root=await retainedFixture('journey-recovery-');let store=createWorkspaceStore({root});
  const run=store.buildRun({charterId:'first-value',personaId:'mother',environmentId:'little-steps-local'});run.status='running';run.events=[{index:0,type:'screenshot',screenshot:`/runs/${run.id}/frame.png`}];store.syncRun(run);store.close();
  store=createWorkspaceStore({root});const restored=store.getRun(run.id);assert.equal(restored.status,'interrupted');assert.deepEqual(restored.events,run.events);assert.deepEqual(restored.personaSnapshot,run.personaSnapshot);assert.deepEqual(restored.memorySnapshot,run.memorySnapshot);
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE kind='run-interrupted'").get().n,1);store.close();
  store=createWorkspaceStore({root});assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE kind='run-interrupted'").get().n,1);store.close();
});
