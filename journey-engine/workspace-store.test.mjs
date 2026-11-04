import {retainedFixture} from './retained-test-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import http from 'node:http';
import { createWorkspaceStore, normalizeUsage } from './workspace-store.mjs';
import { createWorkspaceApi } from './workspace-api.mjs';

async function setup(t){const root=retainedFixture('journey-workspace-test-');const runsDir=join(root,'legacy');await mkdir(runsDir);const store=createWorkspaceStore({root:join(root,'state'),runsDir});t.after(()=>store.close());return {root,runsDir,store};}
function sampleRun(id=randomUUID()){return {id,status:'finished',createdAt:'2026-10-27T10:00:00.000Z',startedAt:'2026-10-27T10:00:01.000Z',completedAt:'2026-10-27T10:00:11.000Z',target:'http://127.0.0.1:4320/',personaId:'mother',persona:{id:'mother',label:'Recorded parent',context:'Original context'},events:[{index:0,type:'screenshot',at:'2026-10-27T10:00:02.000Z',url:'http://127.0.0.1:4320/',screenshot:`/runs/${id}/screen-000.png`,videoMs:1200}],experience:[{eventIndex:0,videoMs:1200,replayMs:400,reaction:'I cannot begin.',observation:'A print requirement is visible.'}],finding:{outcome:'obstacle_observed',observation:'The visible activity requires a printer.',interpretation:'This blocks this context.',evidence_indices:[0],evidence:[{index:0,screenshot:`/runs/${id}/screen-000.png`}]},usage:[{input_tokens:10,output_tokens:5,total_tokens:15,input_tokens_details:{cached_tokens:3},output_tokens_details:{reasoning_tokens:2}}],video:`/runs/${id}/journey.webm`,replay:`/runs/${id}/replay.webm`};}

test('legacy import preserves source bytes, exact IDs and unknown classification; repeat import is idempotent',async t=>{
  const {runsDir,store}=await setup(t),run=sampleRun(),dir=join(runsDir,run.id);await mkdir(dir);const path=join(dir,'run.json'),original=JSON.stringify(run,null,2);await writeFile(path,original);
  const first=await store.importLegacyRuns(),second=await store.importLegacyRuns();assert.equal(first.imported,1);assert.equal(second.imported,0);assert.equal(second.unchanged,1);assert.equal(await readFile(path,'utf8'),original);
  const saved=store.getRun(run.id);assert.equal(saved.id,run.id);assert.equal(saved.durationMs,10000);assert.equal(saved.tokens.total,15);assert.equal(saved.findingsCount,1);assert.equal(saved.impactCounts.untriaged,1);assert.equal(saved.findings[0].type,'unclassified');assert.equal(saved.findings[0].expected,null);assert.equal(saved.findings[0].originalMs,1200);assert.equal(saved.findings[0].personaComment,'I cannot begin.');
  assert.equal(store.db.prepare('SELECT source_hash FROM runs WHERE id=?').get(run.id).source_hash,createHash('sha256').update(original).digest('hex'));
});

test('saved environment and persona changes cannot rewrite an active run snapshot',async t=>{
  const {store}=await setup(t);const env=store.getEntity('environment','little-steps-local');const run=store.buildRun({charterId:'first-value',personaId:'mother',environmentId:env.id});store.syncRun(run);
  const next=store.saveEntity('environment',{name:'Changed',url:'http://127.0.0.1:4444/',projectId:'little-steps'},env.id);store.saveEntity('persona',{name:'Changed persona',context:'Knows a workaround'},'mother');
  const saved=store.getRun(run.id);assert.equal(saved.environmentVersion,1);assert.equal(saved.environmentSnapshot.url,env.url);assert.equal(saved.persona.context,run.persona.context);assert.equal(next.version,2);assert.equal(store.getEntity('environment',env.id,1).url,env.url);assert.equal(store.versions('environment',env.id).length,2);
});

test('recorded preview targets do not create configured environments',async t=>{
  const {store}=await setup(t),run=sampleRun();run.target='http://localhost:4319/improvements/recorded-preview/baseline/';run.variant='before';store.syncRun(run);
  const imported=store.getRun(run.id);assert.equal(imported.environmentId,null);assert.equal(imported.configuredEnvironment,null);assert.equal(imported.executionInstance.url,run.target);assert.equal(store.listEntities('environment','little-steps',true).length,1);
  store.syncRun({...run,id:randomUUID()});assert.equal(store.listEntities('environment','little-steps',true).length,1);
});

test('environment readiness applies only to its checked version and retains original check evidence',async t=>{
  const {store}=await setup(t),id='little-steps-local';store.recordEnvironmentCheck(id,{environmentVersion:1,status:'reachable',checks:{reachability:{status:'reachable',httpStatus:200}}});
  const original=store.getEntity('environment',id);assert.equal(original.lastCheck.status,'reachable');assert.equal(original.lastCheck.stale,false);
  store.saveEntity('environment',{url:'http://127.0.0.1:4444/'},id);const changed=store.getEntity('environment',id);assert.equal(changed.lastCheck.status,'stale');assert.equal(changed.lastCheck.recordedStatus,'reachable');assert.equal(changed.lastCheck.stale,true);assert.equal(changed.lastCheck.environmentVersion,1);assert.equal(changed.lastCheck.checks.reachability.httpStatus,200);
  const historical=store.getEntity('environment',id,1);assert.equal(historical.lastCheck.status,'reachable');assert.equal(historical.lastCheck.stale,false);assert.equal(historical.lastCheck.checkedAt,original.lastCheck.checkedAt);
});

test('multiple selected personas correspond to independent atomic run records and cross-project launch is rejected',async t=>{
  const {store}=await setup(t);const parent=store.buildRun({charterId:'first-value',personaId:'mother',environmentId:'little-steps-local'}),teacher=store.buildRun({charterId:'first-value',personaId:'teacher',environmentId:'little-steps-local'});store.syncRun(parent);store.syncRun(teacher);assert.notEqual(parent.id,teacher.id);assert.equal(store.listRuns({projectId:'little-steps'}).length,2);
  const project=store.saveProject({name:'Other product'});assert.throws(()=>store.buildRun({projectId:project.id,charterId:'first-value',personaId:'mother',environmentId:'little-steps-local'}),/unavailable/);
});

test('human triage survives run sync; fix resolution never erases past occurrence counts',async t=>{
  const {store}=await setup(t),r1=sampleRun(),r2=sampleRun();store.syncRun(r1);store.syncRun(r2);const findings=store.listFindings({projectId:'little-steps'});store.updateFinding(findings[0].id,{impact:'high',type:'broken',triage:'accepted',reason:'Observed goal blocked.'});store.updateFinding(findings[1].id,{type:'broken',reason:'Confirmed product defect.'});store.syncRun(r1);store.syncRun(r2);assert.equal(store.getFinding(findings[0].id).impact,'high');
  const issue=store.saveIssue({title:'Print requirement',findingIds:findings.map(f=>f.id)});assert.equal(issue.seen,2);assert.equal(issue.occurrences,2);
  const verified=sampleRun();verified.finding.outcome='goal_reached';verified.productFingerprint={'app.js':'a'.repeat(64)};verified.integrityStatus='verified';store.syncRun(verified);
  const resolved=store.saveIssue({status:'resolved',resolution:{runId:verified.id,eventIndices:[0],reason:'The recorded goal-reaching screen demonstrates the corrected step.'}},issue.id);assert.equal(resolved.status,'resolved');assert.equal(resolved.resolution.scope,'recorded-source; deployment-unverified');assert.match(resolved.resolution.build,/^sha256:/);assert.equal(store.getRun(r1.id).findingsCount,1);assert.equal(store.getRun(r2.id).findingsCount,1);assert.ok(store.findingRevisions(findings[0].id).length>=2);
});

test('issue reassignment, merge, split and unlink preserve unique atomic membership and history',async t=>{
  const {store}=await setup(t);const ids=[];for(let i=0;i<3;i++){const run=sampleRun();store.syncRun(run);const f=store.listFindings({runId:run.id})[0];store.updateFinding(f.id,{type:'broken'});ids.push(f.id);}
  const first=store.saveIssue({title:'First',findingIds:ids.slice(0,2)}),second=store.saveIssue({title:'Second',findingIds:[ids[2]]});
  store.updateFinding(ids[0],{issueId:second.id});assert.deepEqual(store.getIssue(first.id).findingIds,[ids[1]]);assert.equal(store.getIssue(second.id).occurrences,2);
  const merged=store.mergeIssues(first.id,second.id);assert.equal(merged.source.mergedInto,second.id);assert.equal(merged.source.occurrences,0);assert.equal(merged.target.occurrences,3);assert.ok(ids.every(id=>store.getFinding(id).issueId===second.id));
  const split=store.splitIssue(second.id,{findingIds:[ids[0]],title:'Distinct problem'});assert.equal(split.source.occurrences,2);assert.equal(split.issue.occurrences,1);assert.equal(store.getFinding(ids[0]).issueId,split.issue.id);
  store.saveIssue({findingIds:[]},split.issue.id);assert.equal(store.getFinding(ids[0]).issueId,null);assert.equal(store.getIssue(split.issue.id).occurrences,0);assert.ok(store.findingRevisions(ids[0]).length>=5);
  store.updateFinding(ids[1],{type:'experience'});assert.equal(store.getFinding(ids[1]).issueId,null);assert.equal(store.getIssue(second.id).occurrences,1);
  assert.throws(()=>store.splitIssue(second.id,{findingIds:[ids[2]],title:'No remainder'}),/subset/);
});

test('failed issue reassignment rolls back new issue, memberships and audit together',async t=>{
  const {store}=await setup(t),run=sampleRun();store.syncRun(run);const finding=store.listFindings({runId:run.id})[0];store.updateFinding(finding.id,{type:'broken'});const original=store.saveIssue({title:'Original',findingIds:[finding.id]});const audits=store.db.prepare('SELECT COUNT(*) AS n FROM audit').get().n;
  store.db.exec("CREATE TRIGGER fail_test_reassignment BEFORE UPDATE ON findings BEGIN SELECT RAISE(ABORT,'injected failure'); END;");
  assert.throws(()=>store.saveIssue({title:'Should roll back',findingIds:[finding.id]}),/injected failure/);assert.equal(store.listIssues().length,1);assert.deepEqual(store.getIssue(original.id).findingIds,[finding.id]);assert.equal(store.getFinding(finding.id).issueId,original.id);assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM audit').get().n,audits);
});

test('issue resolution refuses invented, incomplete, cross-project and mismatched-build evidence',async t=>{
  const {store}=await setup(t),run=sampleRun();store.syncRun(run);const f=store.listFindings({runId:run.id})[0];store.updateFinding(f.id,{type:'broken'});const issue=store.saveIssue({title:'Needs proof',findingIds:[f.id]});
  for(const resolution of [true,{build:'made-up',evidence:['made-up']},{runId:run.id,eventIndices:[0],reason:'Still blocked'}])assert.throws(()=>store.saveIssue({status:'resolved',resolution},issue.id),/verification/);
  const completed=sampleRun();completed.finding.outcome='goal_reached';completed.productFingerprint={'app.js':'b'.repeat(64)};completed.integrityStatus='verified';store.syncRun(completed);
  assert.throws(()=>store.saveIssue({status:'resolved',resolution:{runId:completed.id,eventIndices:[999],reason:'Wrong frame'}},issue.id),/reference/);
  assert.throws(()=>store.saveIssue({status:'resolved',resolution:{runId:completed.id,eventIndices:[0],reason:'Wrong build',build:'invented'}},issue.id),/build/);
  const project=store.saveProject({name:'Other'});store.syncRun({...completed,id:randomUUID(),projectId:project.id});const foreign=store.listRuns({projectId:project.id})[0];assert.throws(()=>store.saveIssue({status:'resolved',resolution:{runId:foreign.id,eventIndices:[0],reason:'Other project'}},issue.id),/app/);
  assert.equal(store.getIssue(issue.id).status,'open');
});

test('retry creates clean execution state with original snapshots and rejects revoked environment policy',async t=>{
  const {store}=await setup(t),run=store.buildRun({charterId:'first-value',personaId:'mother',environmentId:'little-steps-local'});store.syncRun({...run,status:'failed',completedAt:new Date().toISOString(),error:'Transient failure',events:[{index:0,type:'error'}],usage:[{total_tokens:15}]});
  store.saveEntity('persona',{context:'Different later knowledge'},'mother');store.saveEntity('charter',{mission:'A different later mission'},'first-value');
  const retry=store.buildRetry(run.id);assert.notEqual(retry.id,run.id);assert.equal(retry.retryOfRunId,run.id);assert.deepEqual(retry.persona,run.persona);assert.deepEqual(retry.charterSnapshot,run.charterSnapshot);assert.deepEqual(retry.environmentSnapshot,run.environmentSnapshot);assert.deepEqual(retry.events,[]);assert.deepEqual(retry.usage,[]);assert.equal(retry.error,null);
  store.saveEntity('environment',{allowMutations:false},'little-steps-local');assert.throws(()=>store.buildRetry(run.id),/policy changed/);
  store.archiveEntity('environment','little-steps-local');assert.throws(()=>store.buildRetry(run.id),/archived/);assert.equal(store.getRun(run.id).status,'failed');
});

test('structured findings stay multiple and an empty structured findings list creates no legacy defect',async t=>{
  const {store}=await setup(t),run=sampleRun();run.findings=[{title:'First',type:'broken',impact:'high',observation:'First problem',evidence_indices:[0]},{title:'Second',type:'product',impact:'medium',observation:'Second problem',evidence_indices:[0]}];store.syncRun(run);assert.equal(store.getRun(run.id).findingsCount,2);
  const positive=sampleRun();positive.findings=[];positive.finding.outcome='goal_reached';store.syncRun(positive);assert.equal(store.getRun(positive.id).findingsCount,0);
});

test('usage components are not added to totals and identified request retries are deduplicated',()=>{
  const request={request_id:'one',input_tokens:100,output_tokens:20,total_tokens:120,input_tokens_details:{cached_tokens:60},output_tokens_details:{reasoning_tokens:10}};assert.deepEqual(normalizeUsage([request,request]),{input:100,output:20,total:120,cachedInput:60,reasoningOutput:10,partial:false,requests:1});assert.equal(normalizeUsage([]),null);assert.equal(normalizeUsage([{input_tokens:3}]).total,null);assert.equal(normalizeUsage([{input_tokens:3}]).partial,true);
});

test('environment credentials stay references and archive retains all versions/history',async t=>{
  const {store}=await setup(t);assert.throws(()=>store.saveEntity('environment',{name:'Unsafe',url:'https://user:password@example.com/'}),/credentials/);assert.throws(()=>store.saveEntity('environment',{name:'Unsafe',url:'https://example.com',password:'not-a-real-secret'}),/reference/);
  const environment=store.saveEntity('environment',{name:'Staging',url:'https://example.test/',storageStatePath:'/private/session-reference.json'});assert.equal(environment.storageStatePath,'/private/session-reference.json');assert.equal(environment.captureBodies,false);assert.equal(environment.retention,'keep-all');store.archiveEntity('environment',environment.id);assert.equal(store.getEntity('environment',environment.id).archived,true);assert.equal(store.versions('environment',environment.id).length,1);assert.ok(!store.listEntities('environment','little-steps').some(e=>e.id===environment.id));
});

test('run name edits survive later engine sync and issues do not conflate experience signals',async t=>{
  const {store}=await setup(t),run=sampleRun();store.syncRun(run);store.renameRun(run.id,'My carefully named run');store.syncRun({...run,status:'finished',name:'Old engine name'});assert.equal(store.getRun(run.id).name,'My carefully named run');
  const finding=store.listFindings({runId:run.id})[0];store.updateFinding(finding.id,{type:'experience'});assert.throws(()=>store.saveIssue({title:'Not a defect',findingIds:[finding.id]}),/Issues group product defects/);
});

test('finding collection context survives journey pagination and retains recorded devices and names',async t=>{
  const {store}=await setup(t),run=store.buildRun({charterId:'first-value',personaId:'mother',environmentId:'little-steps-local'});
  const recorded=sampleRun(run.id);Object.assign(run,{status:'finished',createdAt:'2026-10-01T10:00:00.000Z',completedAt:recorded.completedAt,events:recorded.events,finding:recorded.finding});store.syncRun(run);
  store.syncRun({...sampleRun(),createdAt:'2026-10-30T10:00:00.000Z'});
  store.renameRun(run.id,'Reviewed source journey');
  store.saveEntity('persona',{name:'Renamed current persona'},'mother');
  store.saveEntity('device',{name:'Changed current device'},run.deviceId);
  store.saveEntity('network-profile',{name:'Changed current connection'},run.networkProfileId);
  assert.notEqual(store.listRunsPage({limit:1}).runs[0].id,run.id);
  const original=store.listFindings({runId:run.id})[0],stored=store.db.prepare('SELECT data,overrides FROM findings WHERE id=?').get(original.id);
  const finding=store.listFindings({runId:run.id,includeSourceRun:true})[0],source=finding.sourceRun;
  assert.equal(source.id,run.id);assert.equal(source.name,'Reviewed source journey');assert.equal(source.personaName,run.personaName);
  assert.equal(source.environmentId,run.environmentId);assert.equal(source.environmentName,run.environmentName);
  assert.deepEqual(source.deviceSnapshot,run.deviceSnapshot);assert.deepEqual(source.networkProfileSnapshot,run.networkProfileSnapshot);assert.deepEqual(source.viewport,run.viewport);
  for(const key of ['events','video','replay','experience','persona','personaSnapshot','modelRequests'])assert.equal(Object.hasOwn(source,key),false);
  assert.equal(Object.hasOwn(original,'sourceRun'),false);assert.equal(Object.hasOwn(store.getFinding(original.id),'sourceRun'),false);
  assert.deepEqual(store.db.prepare('SELECT data,overrides FROM findings WHERE id=?').get(original.id),stored);
});

test('finding source context resolves historical persona names and legacy viewports without exposing IDs as names',async t=>{
  const {store}=await setup(t),savedName=store.getEntity('persona','mother').name;
  store.saveEntity('persona',{name:'New catalog name'},'mother');
  const snapshot={...sampleRun(),personaName:'A later cached name',personaSnapshot:{name:'Recorded snapshot name',viewport:{width:390,height:844}}};store.syncRun(snapshot);
  const source=store.listFindings({runId:snapshot.id,includeSourceRun:true})[0].sourceRun;
  assert.equal(source.personaName,'Recorded snapshot name');assert.deepEqual(source.viewport,{width:390,height:844});assert.equal(source.deviceSnapshot,null);
  const historical={...sampleRun(),personaName:'mother',personaVersion:1,persona:null};store.syncRun(historical);
  assert.equal(store.listFindings({runId:historical.id,includeSourceRun:true})[0].sourceRun.personaName,savedName);
  const unknown={...sampleRun(),personaId:'missing-persona',personaName:'missing-persona',persona:null};store.syncRun(unknown);
  assert.equal(store.listFindings({runId:unknown.id,includeSourceRun:true})[0].sourceRun.personaName,'Unknown persona');
  const parent=store.getEntity('environment','little-steps-local'),preview=store.saveEntity('environment',{...parent,id:'finding-preview',name:'Candidate',url:'http://127.0.0.1:6455/',lifecycle:'temporary',configuredEnvironmentId:parent.id});
  const temporary={...sampleRun(),environmentId:preview.id,environmentVersion:preview.version,environmentName:preview.name};store.syncRun(temporary);
  const temporarySource=store.listFindings({runId:temporary.id,includeSourceRun:true})[0].sourceRun;
  assert.equal(temporarySource.environmentId,preview.id);assert.equal(temporarySource.configuredEnvironment.id,parent.id);assert.equal(temporarySource.environmentKind,'temporary');
});

test('bootstrap and finding list expose compact source context while finding detail retains its full run',async t=>{
  const root=retainedFixture('journey-findings-api-test-');let api;
  const server=http.createServer((req,res)=>api.handle(req,res,new URL(req.url,'http://127.0.0.1')));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
  api=createWorkspaceApi({root,port});t.after(()=>{server.close();api.close();});const origin=`http://127.0.0.1:${port}/api/workspace`;
  await (await fetch(`${origin}/bootstrap`)).json();const run=sampleRun();api.store.syncRun(run);api.store.renameRun(run.id,'Named source');
  for(const path of ['/bootstrap','/findings']){
    const data=await (await fetch(`${origin}${path}`)).json(),finding=data.findings.find(row=>row.runId===run.id);
    assert.equal(finding.sourceRun.name,'Named source');assert.equal(finding.sourceRun.personaName,'Recorded parent');assert.equal(finding.sourceRun.events,undefined);
  }
  const finding=api.store.listFindings({runId:run.id})[0],detail=await (await fetch(`${origin}/findings/${finding.id}`)).json();
  assert.deepEqual(detail.run.events,run.events);assert.equal(detail.sourceRun,undefined);
});

test('API launches multiple saved personas with version-pinned snapshots and exposes persistent collections',async t=>{
  const root=retainedFixture('journey-workspace-api-test-');const launched=[];let api;
  const server=http.createServer(async(req,res)=>{if(!await api.handle(req,res,new URL(req.url,'http://127.0.0.1'))){res.writeHead(404);res.end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;api=createWorkspaceApi({root,port,configured:()=>true,launchRun:async run=>{launched.push(run);return run;}});t.after(()=>{server.close();api.close();});const origin=`http://127.0.0.1:${port}`;
  const bootstrap=await (await fetch(`${origin}/api/workspace/bootstrap`)).json();assert.equal(bootstrap.projectId,'little-steps');assert.ok(Array.isArray(bootstrap.fixes));
  const launchBody={projectId:'little-steps',charterId:'first-value',environmentId:'little-steps-local',personaIds:['mother','teacher']};
  const result=await fetch(`${origin}/api/workspace/runs`,{method:'POST',headers:{'content-type':'application/json',origin,'idempotency-key':'repeat-launch'},body:JSON.stringify(launchBody)});assert.equal(result.status,202);const data=await result.json();assert.equal(data.runs.length,2);assert.equal(launched.length,2);assert.notEqual(data.runs[0].id,data.runs[1].id);assert.equal(launched[0].environmentSnapshot.version,1);
  const retry=await fetch(`${origin}/api/workspace/runs`,{method:'POST',headers:{'content-type':'application/json',origin,'idempotency-key':'repeat-launch'},body:JSON.stringify(launchBody)});assert.equal(retry.status,200);const retryData=await retry.json();assert.equal(retryData.reused,true);assert.deepEqual(retryData.runs.map(r=>r.id),data.runs.map(r=>r.id));assert.equal(launched.length,2);
  const conflict=await fetch(`${origin}/api/workspace/runs`,{method:'POST',headers:{'content-type':'application/json',origin,'idempotency-key':'repeat-launch'},body:JSON.stringify({...launchBody,personaIds:['mother']})});assert.equal(conflict.status,409);assert.equal(launched.length,2);
  const forbidden=await fetch(`${origin}/api/workspace/projects`,{method:'POST',headers:{origin:'https://outside.example','content-type':'application/json'},body:JSON.stringify({name:'No'})});assert.equal(forbidden.status,403);
  const retained=await fetch(`${origin}/api/workspace/environments/little-steps-local`,{method:'DELETE'});assert.equal(retained.status,405);assert.ok(api.store.getEntity('environment','little-steps-local'));
  for(const input of [{name:'Wrong',url:origin},{name:'Wrong',url:'http://example.test',allowedOrigins:[origin]},{name:'Wrong',url:'http://example.test',healthPath:origin},{name:'Malformed',url:'not a URL'},{name:'Malformed',url:'http://example.test',allowedOrigins:'bad'}]){
    const invalid=await fetch(`${origin}/api/workspace/environments`,{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(input)});assert.equal(invalid.status,400);
  }
  const invalidBatch=await fetch(`${origin}/api/workspace/runs`,{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({projectId:'little-steps',charterId:'first-value',environmentId:'little-steps-local',personaIds:['mother','does-not-exist']})});assert.equal(invalidBatch.status,400);assert.equal(launched.length,2);
  api.store.archiveEntity('environment','little-steps-local');const archiveBootstrap=await (await fetch(`${origin}/api/workspace/bootstrap`)).json();assert.equal(archiveBootstrap.environments.find(e=>e.id==='little-steps-local').archived,true);api.store.archiveEntity('environment','little-steps-local',false);
  api.store.syncRun({...launched[0],status:'failed',completedAt:new Date().toISOString()});const cancelled=await fetch(`${origin}/api/workspace/runs/${launched[0].id}/cancel`,{method:'POST'});assert.equal(cancelled.status,200);assert.equal((await cancelled.json()).status,'failed');
  const retried=await fetch(`${origin}/api/workspace/runs/${launched[0].id}/retry`,{method:'POST',headers:{'content-type':'application/json','idempotency-key':'atomic-retry'},body:'{}'});assert.equal(retried.status,202);const retryRun=(await retried.json()).run;assert.equal(retryRun.retryOfRunId,launched[0].id);assert.notEqual(retryRun.id,launched[0].id);const retriedAgain=await fetch(`${origin}/api/workspace/runs/${launched[0].id}/retry`,{method:'POST',headers:{'content-type':'application/json','idempotency-key':'atomic-retry'},body:'{}'});assert.equal((await retriedAgain.json()).run.id,retryRun.id);assert.equal(launched.length,3);
});

test('launch failures remain explicit separate run records instead of disappearing',async t=>{
  const root=retainedFixture('journey-workspace-failed-api-');let api;const server=http.createServer((req,res)=>api.handle(req,res,new URL(req.url,'http://127.0.0.1')));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;api=createWorkspaceApi({root,port,configured:()=>true,launchRun:async()=>{throw new Error('Worker unavailable');}});t.after(()=>{server.close();api.close();});const response=await fetch(`http://127.0.0.1:${port}/api/workspace/runs`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({charterId:'first-value',environmentId:'little-steps-local',personaIds:['mother','teacher']})});const data=await response.json();assert.deepEqual(data.launchSummary,{accepted:0,failed:2});assert.equal(data.runs.length,2);assert.ok(data.runs.every(run=>run.status==='failed'));assert.equal(api.store.listRuns().length,2);
});

test('temporary targets inherit configured identity without expanding the environment catalog',async t=>{
 const {store}=await setup(t),parent=store.getEntity('environment','little-steps-local');
 const instance=store.saveEntity('environment',{...parent,id:'temp-target',name:'Candidate instance',url:'http://127.0.0.1:6543/',allowedOrigins:[],lifecycle:'temporary',configuredEnvironmentId:parent.id,instanceKind:'fix-preview'});
 assert.equal(instance.lifecycle,'temporary');assert.equal(instance.configuredEnvironment.id,parent.id);
 assert.equal(store.listEntities('environment','little-steps',true).length,1);
 const run=store.buildRun({charterId:'first-value',personaId:'mother',environmentId:instance.id});
 assert.equal(run.environmentId,parent.id);assert.equal(run.environmentVersion,parent.version);assert.equal(run.target,instance.url);assert.equal(run.executionInstance.targetId,instance.id);assert.equal(run.memoryReferenceUrl,parent.url);assert.equal(run.environmentSnapshot.url,instance.url);assert.equal(run.memorySnapshot.environment.id,parent.id);
 store.syncRun({...run,status:'finished'});assert.throws(()=>store.buildRetry(run.id),error=>error.code==='INSTANCE_RETEST_REQUIRED');assert.equal(store.getRun(run.id).configuredEnvironment.id,parent.id);assert.equal(store.listRuns({environmentId:parent.id}).length,1);
 assert.throws(()=>store.saveEntity('environment',{...instance,id:'too-many-tokens',maxTokens:parent.maxTokens+1}),/exceeds/);
 assert.throws(()=>store.saveEntity('environment',{...instance,id:'extra-origin',allowedOrigins:['https://unapproved.example']}),/expand/);
 assert.throws(()=>store.saveEntity('environment',{...instance,id:'external-preview',url:'https://remote-preview.example/'}),/local target/);
 const foreign=store.saveProject({id:'other-project',name:'Other'});assert.throws(()=>store.saveEntity('environment',{...instance,id:'foreign',projectId:foreign.id}),/configured environment/);
});

test('historical fix provenance aliases are idempotent and never rewrite recorded runs or entity versions',async t=>{
 const {root,store}=await setup(t),parent=store.getEntity('environment','little-steps-local'),fixId=randomUUID(),roundId=randomUUID(),directory=join(store.root,'fixes',fixId),baseline=join(directory,'rounds',roundId,'baseline');await mkdir(directory,{recursive:true});
 const temp=store.saveEntity('environment',{...parent,id:'recorded-fix-preview',name:'Before',url:'http://127.0.0.1:6454/',repositoryPath:baseline});store.archiveEntity('environment',temp.id,true);
 const run={...sampleRun(),environmentId:temp.id,environmentName:temp.name,environmentVersion:temp.version,environmentSnapshot:temp,target:temp.url,comparisonId:randomUUID(),variant:'before'};store.syncRun(run);
 await writeFile(join(directory,'fix.json'),JSON.stringify({id:fixId,projectId:parent.projectId,environment:parent,rounds:[{id:roundId,baselineDirectory:baseline,candidateDirectory:join(directory,'rounds',roundId,'candidate'),comparison:{id:run.comparisonId}}]}));
 const originalRun=store.db.prepare('SELECT data FROM runs WHERE id=?').get(run.id).data,originalVersion=store.db.prepare("SELECT data FROM entity_versions WHERE kind='environment' AND id=?").get(temp.id).data;
 store.refreshEnvironmentOrigins();const audits=store.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE kind='environment-instance'").get().n;store.refreshEnvironmentOrigins();assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE kind='environment-instance'").get().n,audits);
 assert.deepEqual(store.listEntities('environment',parent.projectId,true).map(e=>e.id),[parent.id]);
 const projected=store.getRun(run.id),summary=store.listRuns({environmentId:parent.id})[0];assert.equal(projected.environmentId,temp.id);assert.equal(projected.configuredEnvironment.id,parent.id);assert.equal(summary.configuredEnvironment.id,parent.id);assert.equal(projected.executionInstance.kind,'fix-preview');assert.equal(projected.target,temp.url);assert.equal(projected.video,run.video);
 assert.equal(store.db.prepare('SELECT data FROM runs WHERE id=?').get(run.id).data,originalRun);assert.equal(store.db.prepare("SELECT data FROM entity_versions WHERE kind='environment' AND id=?").get(temp.id).data,originalVersion);
 // Names and archived status alone never classify a real environment as an instance.
 const staging=store.saveEntity('environment',{...parent,id:'real-staging',name:'Recorded before · demo',url:'https://staging.example/',repositoryPath:join(root,'different-source')});store.archiveEntity('environment',staging.id,true);store.refreshEnvironmentOrigins();assert.equal(store.getEntity('environment',staging.id).lifecycle,'configured');assert.ok(store.listEntities('environment',parent.projectId,true).some(e=>e.id===staging.id));
});

test('Gather build proposal migration requires the saved fixture relationship and preserves paired IDs',async t=>{
 const {root,store}=await setup(t);store.saveProject({id:'gather',name:'Gather'});
 const baseline=store.saveEntity('environment',{id:'gather-base',projectId:'gather',name:'Current',url:'http://127.0.0.1:4390/',repositoryPath:join(root,'gather','base'),scenarioId:'gather-booking'});
 const proposal=store.saveEntity('environment',{id:'gather-proposal',projectId:'gather',name:'Proposal',url:'http://127.0.0.1:4391/',repositoryPath:join(root,'gather','proposal'),scenarioId:'gather-booking'});
 store.refreshEnvironmentOrigins();assert.equal(store.listEntities('environment','gather',true).length,2);
 const id=randomUUID(),dir=join(store.root,'change-impacts',id);await mkdir(dir,{recursive:true});await writeFile(join(dir,'1.json'),JSON.stringify({id,projectId:'gather',kind:'local_proposal',baseline:{environmentId:baseline.id,environmentVersion:1},proposal:{environmentId:proposal.id,environmentVersion:1}}));
 const run={...sampleRun(),projectId:'gather',environmentId:proposal.id,environmentVersion:1,environmentSnapshot:proposal,target:proposal.url};store.syncRun(run);store.refreshEnvironmentOrigins();
 assert.deepEqual(store.listEntities('environment','gather',true).map(e=>e.id),[baseline.id]);assert.equal(store.getRun(run.id).environmentId,proposal.id);assert.equal(store.getRun(run.id).configuredEnvironment.id,baseline.id);assert.equal(store.getEntity('environment',proposal.id).configuredEnvironment.id,baseline.id);assert.equal(store.listRuns({projectId:'gather',environmentId:baseline.id}).length,1);
});
