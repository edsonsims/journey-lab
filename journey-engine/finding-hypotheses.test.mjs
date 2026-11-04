import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {createWorkspaceStore} from './workspace-store.mjs';
import {createWorkspaceApi} from './workspace-api.mjs';
import {retainedFixture} from './retained-test-fixtures.mjs';

const observation=(id='keyboard')=>({id,projectId:'little-steps',status:'finished',createdAt:'2026-11-03T17:00:00Z',personaId:'mother',personaName:'Keyboard visitor',deviceSnapshot:{name:'Laptop',hasTouch:false},events:[
 {index:0,type:'screenshot',screenshot:`/runs/${id}/screen-000.png`,videoMs:100},
 {index:1,type:'action',action:{type:'keypress',keys:['Tab']}},
 {index:2,type:'action_rejected',action:{type:'click'}},
 {index:3,type:'screenshot',screenshot:`/runs/${id}/screen-003.png`,videoMs:3000},
],experience:[{eventIndex:3,reaction:'I cannot continue.',valence:'negative'}],findings:[{id:`source-${id}`,type:'broken',impact:'high',observation:'The required confirmation control cannot be reached with the keyboard.',evidence_indices:[0,3]}]});
const hypothesis={title:'Keyboard barrier may cause lost bookings',interpretation:'Visitors who rely on keyboard navigation may abandon a booking when they cannot confirm.',uncertainty:'Actual abandonment, conversion and revenue loss were not measured in this synthetic session.',validationPlan:'Compare booking completion and requests for assistance with keyboard users before and after the repair.',reason:'Capture the requested risk hypothesis separately from the observed defect.',author:'assistant'};
function setup(t){const root=retainedFixture('finding-hypotheses'),store=createWorkspaceStore({root});t.after(()=>store.close());return store;}

test('review hypothesis appends linked evidence and audit history while preserving original run and finding',t=>{
 const store=setup(t),run=observation();store.syncRun(run);
 const raw=store.db.prepare('SELECT data FROM runs WHERE id=?').get(run.id).data,source=store.getFinding('source-keyboard');
 const added=store.addBusinessHypothesis(source.id,hypothesis);
 assert.equal(added.type,'business');assert.equal(added.claimStatus,'hypothesis');assert.equal(added.provenance,'review-hypothesis');assert.equal(added.createdBy,'assistant');
 assert.match(added.title,/^Hypothesis:/);assert.equal(added.impact,'untriaged');assert.equal(added.triage,'unreviewed');assert.equal(added.personaComment,null);
 assert.equal(added.sourceFindingId,source.id);assert.equal(added.eventIndex,3);assert.equal(added.originalMs,3000);assert.deepEqual(added.evidence_indices,[0,3]);
 assert.equal(store.db.prepare('SELECT data FROM runs WHERE id=?').get(run.id).data,raw);assert.deepEqual(store.getFinding(source.id),source);
 assert.equal(store.findingRevisions(added.id)[0].author,'assistant');assert.equal(store.findingRevisions(added.id)[0].before,null);
 assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE kind='finding_hypothesis'").get().n,1);
 assert.equal(store.addBusinessHypothesis(source.id,hypothesis).id,added.id);assert.equal(store.findingRevisions(added.id).length,1);
 store.syncRun(run);assert.equal(store.getRun(run.id).findings.length,2);assert.equal(store.getFinding(added.id).claimStatus,'hypothesis');
 assert.throws(()=>store.updateFinding(added.id,{type:'broken'}),/distinct/);
 assert.throws(()=>store.saveIssue({title:'Not a defect',findingIds:[added.id]}),/product defects/);
});
test('hypotheses reject missing limits, foreign scope, unsupported evidence and unverified source states',t=>{
 const store=setup(t),run=observation();store.syncRun(run);
 for(const field of ['title','interpretation','uncertainty','validationPlan','reason'])assert.throws(()=>store.addBusinessHypothesis('source-keyboard',{...hypothesis,[field]:''}),/Provide/);
 assert.throws(()=>store.addBusinessHypothesis('source-keyboard',{...hypothesis,projectId:'another-app'}),/another app/);
 for(const evidence_indices of [[],[1],[999],[0,0,0,0,0,0,0,0,0,0,0,0,0]])assert.throws(()=>store.addBusinessHypothesis('source-keyboard',{...hypothesis,evidence_indices}),/references/);
 assert.throws(()=>store.addBusinessHypothesis('source-keyboard',{...hypothesis,author:'model'}),/author/);
 store.syncRun({...run,status:'running'});assert.throws(()=>store.addBusinessHypothesis('source-keyboard',hypothesis),/completed/);
 store.syncRun({...run,status:'finished',integrityStatus:'invalidated'});assert.throws(()=>store.addBusinessHypothesis('source-keyboard',hypothesis),/intact/);
 store.syncRun({...run,integrityStatus:'recorded',events:run.events.map(e=>e.index===3?{...e,screenshot:'/runs/foreign/frame.png'}:e)});
 assert.throws(()=>store.addBusinessHypothesis('source-keyboard',hypothesis),/retained by this journey/);
 assert.equal(store.listFindings({runId:run.id}).length,1);
});
test('journey and finding lists carry compact executed input without exposing full events',t=>{
 const store=setup(t),browserExecution={device:{hasTouch:false}};store.syncRun({...observation(),browserExecution});
 const summary=store.getRun('keyboard',{summary:true}),sourceRun=store.listFindings({includeSourceRun:true})[0].sourceRun;
 assert.deepEqual(summary.recordedActionTypes,['keypress']);assert.deepEqual(sourceRun.recordedActionTypes,['keypress']);
 assert.deepEqual(summary.browserExecution,browserExecution);assert.deepEqual(sourceRun.browserExecution,browserExecution);
 assert.equal(summary.events,undefined);assert.equal(sourceRun.events,undefined);
 store.syncRun({id:'unrecorded',projectId:'little-steps',status:'finished',findings:[]});assert.equal(store.getRun('unrecorded',{summary:true}).recordedActionTypes,null);
});
test('business hypothesis endpoint persists a scoped review record without a model call',async t=>{
 const root=retainedFixture('hypothesis-api'),runsDir=join(root,'runs');await mkdir(runsDir);
 const api=createWorkspaceApi({root:join(root,'state'),runsDir,configured:()=>false});await api.ready;
 api.store.syncRun(observation());
 const server=http.createServer((req,res)=>{void api.handle(req,res,new URL(req.url,'http://127.0.0.1'));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));api.store.close();});
 const response=await fetch(`http://127.0.0.1:${server.address().port}/api/workspace/findings/source-keyboard/hypotheses`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...hypothesis,projectId:'little-steps'})});
 assert.equal(response.status,201);const finding=await response.json();assert.equal(finding.claimStatus,'hypothesis');assert.equal(api.store.getRun('keyboard').findings.length,2);
});
