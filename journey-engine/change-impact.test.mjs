import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createChangeImpactService,changeImpactSourceHash,deriveChangeImpactPair} from './change-impact.mjs';
import {createChangeImpactApi} from './change-impact-api.mjs';
import {retainedFixture} from './retained-test-fixtures.mjs';
import {WorkspaceError} from './workspace-store.mjs';

function setup(){
  const root=retainedFixture('change-impact'),personaId=randomUUID(),charterId=randomUUID(),baselineEnvironment=randomUUID(),proposalEnvironment=randomUUID(),runs=new Map(),fixes=new Map();
  const entities=new Map([[personaId,{id:personaId,projectId:'gather',name:'Coordinator',version:1}],[baselineEnvironment,{id:baselineEnvironment,projectId:'gather',version:1}],[proposalEnvironment,{id:proposalEnvironment,projectId:'gather',version:1}]]);
  const store={requireProject:id=>{if(!['gather','other'].includes(id))throw new WorkspaceError('Project not found.',404,'NOT_FOUND');},getEntity:(kind,id,version)=>{const entity=entities.get(id);return entity&&(version==null||entity.version===version)?structuredClone(entity):null;},getRun:id=>runs.has(id)?structuredClone(runs.get(id)):null};
  const getFix=async id=>fixes.get(id)||null;
  const service=createChangeImpactService({root,store,getFix});
  const makeRun=(variant,{status='finished',outcome='goal_reached',actions=3,...overrides}={})=>{
    const id=randomUUID(),run={id,projectId:'gather',personaId,personaVersion:1,personaVersionId:'persona-v1',charterId,charterVersion:1,charterVersionId:'charter-v1',personaSnapshot:{id:personaId,name:'Coordinator',version:1,continuity:'first-time'},charterSnapshot:{id:charterId,version:1,mission:'Book a room'},executionPolicy:{maxSteps:12,maxTokens:250000},viewport:{width:1280,height:800},model:'muse-wonder-1.0',environmentId:variant==='base'?baselineEnvironment:proposalEnvironment,environmentVersion:1,productFingerprint:{'app.js':variant==='base'?'a'.repeat(64):'b'.repeat(64)},integrityStatus:'recorded',status,finding:{outcome},events:[{index:0,type:'screenshot',screenshot:`/runs/${id}/first.png`,videoMs:1000},...Array.from({length:actions},(_,index)=>({index:index+1,type:'action',action:{type:'click_control',label:'Next'}})),{index:actions+1,type:'action_rejected',action:{type:'click_control',label:'Missing'}}],experience:[{eventIndex:0,videoMs:1000,reaction:'The total is clear.',valence:'positive',friction:0}],usage:[{total_tokens:10}],video:`/runs/${id}/journey.webm`,replayMetadata:{originalDuration:20},startedAt:'2026-11-01T10:00:00Z',completedAt:'2026-11-01T10:00:30Z',...overrides};runs.set(id,run);return run;
  };
  const before=makeRun('base'),after=makeRun('proposal',{actions:2});
  const input={projectId:'gather',title:'Quick booking',intent:'Reduce booking steps.',baseline:{label:'Current',environmentId:baselineEnvironment,environmentVersion:1,sourceHash:changeImpactSourceHash(before)},proposal:{label:'Proposed',environmentId:proposalEnvironment,environmentVersion:1,sourceHash:changeImpactSourceHash(after)},personas:[{personaId,baselineRunId:before.id,proposalRunId:after.id}]};
  return {root,store,getFix,service,runs,fixes,entities,personaId,before,after,input,makeRun};
}

test('derived report separates goal outcome from execution effort and exact reactions',async()=>{
  const {service,input,before,after}=setup();after.events.push({index:9,type:'action',action:{type:'wait'}});
  const report=await service.create(input),pair=report.report.pairs[0];
  assert.equal(report.kind,'local_proposal');assert.equal(report.provider,'not_connected');assert.equal(report.report.status,'completed');
  assert.equal(pair.controls.status,'matched');assert.equal(pair.outcomeChange,'unchanged');assert.equal(pair.effortChange,'fewer_actions');assert.equal(pair.metrics.actionDelta,-1);
  assert.equal(pair.metrics.before.executedActions,3);assert.equal(pair.metrics.after.executedActions,3);assert.equal(pair.metrics.after.interactionActions,2);assert.equal(pair.metrics.after.rejectedActions,1);
  assert.equal(pair.metrics.before.totalTokens,10);assert.equal(pair.metrics.before.videoDurationMs,20000);assert.equal(pair.metrics.before.wallDurationMs,30000);
  assert.deepEqual(pair.observations.before[0],{runId:before.id,signalIndex:0,eventIndex:0,originalMs:1000,screenshot:`/runs/${before.id}/first.png`,observation:null,reaction:'The total is clear.',valence:'positive',friction:0,provenance:'recorded_synthetic_observation'});
  assert.equal(report.report.repair,null);
});

test('a failed goal remains a regression even with fewer actions',async()=>{
  const {service,input,after}=setup();after.finding.outcome='obstacle_observed';
  const pair=(await service.create(input)).report.pairs[0];assert.equal(pair.outcomeChange,'regressed');assert.equal(pair.effortChange,'fewer_actions');
});

test('partial, failed, unrated and invalidated runs never become successes',async()=>{
  for(const status of ['running','incomplete','failed']){
    const {service,input,after}=setup();after.status=status;
    const record=await service.create(input);assert.equal(record.report.status,status==='running'?'running':'inconclusive');assert.equal(record.report.pairs[0].outcomeChange,'inconclusive');assert.equal(record.report.pairs[0].metrics.actionDelta,null);
  }
  const {service,input,after}=setup();after.integrityStatus='invalidated';after.usage=[null];
  const pair=(await service.create(input)).report.pairs[0];assert.equal(pair.controls.status,'mismatch');assert.equal(pair.metrics.after.totalTokens,null);assert.equal(pair.outcomeChange,'inconclusive');
});

test('comparison controls detect changed persona, charter, viewport, policy and memory',()=>{
  for(const [key,value]of [['personaVersion',2],['personaSnapshot',{name:'Different'}],['charterVersion',2],['viewport',{width:390,height:844}],['executionPolicy',{maxSteps:40}],['model','another-model'],['memorySnapshot',{roles:{persona:[{id:'learning',version:1}]}}]]){
    const {before,after,personaId}=setup();after[key]=value;
    const pair=deriveChangeImpactPair({personaId,before,after});assert.equal(pair.controls.status,'mismatch',key);assert.equal(pair.outcomeChange,'inconclusive',key);
  }
});

test('same viewport cannot hide changed touch, pixel density or network settings',()=>{
 for(const change of [{deviceSnapshot:{viewport:{width:1280,height:800},hasTouch:true}},{deviceSnapshot:{viewport:{width:1280,height:800},deviceScaleFactor:2}},{networkProfileSnapshot:{offline:false,latencyMs:200,downloadMbps:1,uploadMbps:1}}]){
  const {before,after,personaId}=setup();Object.assign(after,change);
  const pair=deriveChangeImpactPair({personaId,before,after});assert.equal(pair.controls.status,'mismatch');assert.equal(pair.outcomeChange,'inconclusive');assert.ok(pair.controls.issues.some(issue=>['device_conditions_mismatch','network_conditions_mismatch'].includes(issue)));
 }
 const {before,after,personaId}=setup();before.deviceSnapshot={name:'Original name',viewport:before.viewport,hasTouch:false,isMobile:false,deviceScaleFactor:1};after.deviceSnapshot={...before.deviceSnapshot,name:'Renamed',id:'other-id'};
 assert.equal(deriveChangeImpactPair({personaId,before,after}).controls.status,'matched');
});

test('metadata versions retain prior links and forbid replacing attached journeys or build controls',async()=>{
  const {service,input,root,makeRun}=setup();const empty={...input,personas:input.personas.map(item=>({personaId:item.personaId}))};
  const first=await service.create(empty);assert.equal(first.report.status,'pending');
  const second=await service.update(first.id,{projectId:'gather',expectedVersion:1,personas:input.personas});assert.equal(second.version,2);assert.equal(second.report.status,'completed');
  assert.equal((await service.get(first.id,'gather',1)).personas[0].baselineRunId,null);assert.deepEqual((await readdir(join(root,first.id))).filter(name=>/^\d/.test(name)).sort(),['1.json','2.json']);
  await assert.rejects(()=>service.update(first.id,{projectId:'gather',expectedVersion:1,title:'Stale'}),{code:'VERSION_CONFLICT'});
  await assert.rejects(()=>service.update(first.id,{projectId:'gather',expectedVersion:2,baseline:input.baseline}),{code:'INVALID_CHANGE_IMPACT'});
  await assert.rejects(()=>service.update(first.id,{projectId:'gather',expectedVersion:2,personas:[{...input.personas[0],proposalRunId:makeRun('proposal').id}]}),{code:'IMMUTABLE_RUN_LINK'});
  const third=await service.update(first.id,{projectId:'gather',expectedVersion:2,title:'Updated review title'});assert.equal(third.version,3);assert.equal((await service.get(first.id,'gather',2)).title,'Quick booking');
});

test('project and identity checks prevent cross-project records, fabricated builds and external claims',async()=>{
  const {service,input,before}=setup();
  await assert.rejects(()=>service.create({...input,projectId:'other'}),{code:'NOT_FOUND'});
  await assert.rejects(()=>service.create({...input,provider:'github'}),{code:'INVALID_CHANGE_IMPACT'});
  await assert.rejects(()=>service.create({...input,proposal:{...input.proposal,sourceHash:'source:'+'d'.repeat(64)}}),{code:'RUN_BUILD_MISMATCH'});
  const record=await service.create(input);await assert.rejects(()=>service.get(record.id,'other'),{code:'NOT_FOUND'});assert.deepEqual(await service.list('other'),[]);
  before.projectId='other';await assert.rejects(()=>service.create(input),{code:'NOT_FOUND'});
});

test('unsupported observations never create false screenshot citations',async()=>{
  const {service,input,after}=setup();after.experience.push({eventIndex:999,reaction:'Invented frame.'},{eventIndex:1,reaction:'Action is not screenshot.'});
  const pair=(await service.create(input)).report.pairs[0];assert.equal(pair.observations.after.length,1);assert.equal(pair.observations.after[0].eventIndex,0);
});

test('repair links preserve real fix comparisons and do not approve or mutate them',async()=>{
  const {service,input,fixes,after,makeRun}=setup();
  const repaired=makeRun('proposal',{actions:2,productFingerprint:{'app.js':'c'.repeat(64)}}),fixId=randomUUID(),roundId=randomUUID(),comparisonId=randomUUID();
  const fix={id:fixId,projectId:'gather',status:'awaiting_review',approval:null,deliveryStatus:'not_connected',rounds:[{id:roundId,candidateHash:'c'.repeat(64),comparison:{id:comparisonId,status:'completed',pairs:[{personaId:after.personaId,beforeRunId:after.id,afterRunId:repaired.id,before:after,after:repaired}]}}]};fixes.set(fixId,fix);
  const snapshot=structuredClone(fix),record=await service.create({...input,fixId,roundId,comparisonId});
  assert.equal(record.report.repair.status,'completed');assert.equal(record.report.repair.pairs[0].metrics.actionDelta,0);assert.equal(record.report.repair.approval,null);assert.deepEqual(fix,snapshot);
  await assert.rejects(()=>service.update(record.id,{projectId:'gather',expectedVersion:1,comparisonId:randomUUID()}),{code:'NOT_FOUND'});
  fix.projectId='other';assert.equal((await service.get(record.id,'gather')).report.repair,null);
});

test('concurrent metadata updates serialize with optimistic version checks',async()=>{
  const {service,input}=setup(),first=await service.create(input);
  const results=await Promise.allSettled([service.update(first.id,{projectId:'gather',expectedVersion:1,title:'A'}),service.update(first.id,{projectId:'gather',expectedVersion:1,title:'B'})]);
  assert.equal(results.filter(row=>row.status==='fulfilled').length,1);assert.equal(results.find(row=>row.status==='rejected').reason.code,'VERSION_CONFLICT');
});

test('bounded library IDs and partial repair coverage do not imply all personas finished',async()=>{
  const {service,input,entities,fixes}=setup();
  entities.set('gather-coordinator',{id:'gather-coordinator',projectId:'gather',name:'Coordinator',version:1});
  entities.set('gather-base',{id:'gather-base',projectId:'gather',version:1});entities.set('gather-proposal',{id:'gather-proposal',projectId:'gather',version:1});
  const fixId=randomUUID(),roundId=randomUUID(),comparisonId=randomUUID();fixes.set(fixId,{id:fixId,projectId:'gather',status:'retesting',rounds:[{id:roundId,comparison:{id:comparisonId,status:'running',pairs:[]}}]});
  const record=await service.create({...input,baseline:{...input.baseline,environmentId:'gather-base'},proposal:{...input.proposal,environmentId:'gather-proposal'},personas:[{personaId:'gather-coordinator'}],fixId,roundId,comparisonId});
  assert.equal(record.report.repair.status,'pending');assert.equal(record.report.repair.pairs.length,1);assert.equal(record.report.repair.pairs[0].outcomeChange,'inconclusive');
});

test('HTTP API enforces origin, project, body and keep-all boundaries',async t=>{
  const {root,store,getFix,input}=setup();let api;
  const server=http.createServer(async(req,res)=>{if(!await api.handle(req,res,new URL(req.url,'http://127.0.0.1'))){res.writeHead(404);res.end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port,origin=`http://127.0.0.1:${port}`;api=createChangeImpactApi({root,store,getFix,port});t.after(()=>new Promise(resolve=>server.close(resolve)));
  const request=async(path='',method='GET',body,requestOrigin=origin)=>{const response=await fetch(`${origin}/api/workspace/change-impacts${path}`,{method,headers:{origin:requestOrigin,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json()};};
  assert.equal((await request()).body.code,'PROJECT_REQUIRED');
  assert.equal((await request('?projectId=other','POST',input)).body.code,'PROJECT_MISMATCH');
  assert.equal((await request('','POST',input,'http://untrusted.test')).body.code,'ORIGIN_DENIED');
  assert.equal((await request('?projectId=gather','DELETE')).body.code,'KEEP_ALL');
  assert.equal((await request('','POST',[])).status,400);assert.equal((await request('','POST',{...input,intent:'x'.repeat(32769)})).status,413);
  const created=await request('','POST',input);assert.equal(created.status,201);
  assert.equal((await request('?projectId=gather')).body.changeImpacts[0].id,created.body.id);
  assert.equal((await request(`/${created.body.id}?projectId=other`)).status,404);
  assert.equal((await request(`/${created.body.id}?projectId=gather&version=abc`)).body.code,'INVALID_VERSION');
  assert.equal((await request(`/${created.body.id}?projectId=gather`,'PATCH',{expectedVersion:1,title:'Reviewed title'})).body.version,2);
});

const proposedOrigin=()=>({kind:'pull_request',provider:'github',repository:'acme/gather',number:42,url:'https://github.com/acme/gather/pull/42',state:'proposed',createdAt:'2026-10-30T09:30:00-04:00',baseRef:'main',headRef:'quick-booking',baseSha:'a'.repeat(40),headSha:'b'.repeat(40)});

test('proposed and merged PR origins carry source timestamps separately from assessment updates',async()=>{
  const {service,input}=setup();
  const created=await service.create({...input,origin:proposedOrigin(),changeSummary:'Quick booking moves the total to review.',changes:['Remove the separate requirements step.','Show the itemized total at review.']});
  assert.equal(created.kind,'pull_request');assert.equal(created.provider,'github');assert.equal(created.origin.state,'proposed');
  assert.equal(created.origin.createdAt,'2026-10-30T13:30:00.000Z');assert.equal(created.origin.mergedAt,null);assert.equal(created.origin.provenance,'user_supplied');
  assert.notEqual(created.createdAt,created.origin.createdAt);assert.equal(created.changeSummary,'Quick booking moves the total to review.');assert.equal(created.changes.length,2);
  const merged=await service.update(created.id,{projectId:'gather',expectedVersion:1,origin:{state:'merged',mergedAt:'2026-10-31T14:00:00Z',mergeSha:'c'.repeat(40)}});
  assert.equal(merged.origin.state,'merged');assert.equal(merged.origin.number,42);assert.equal(merged.origin.createdAt,created.origin.createdAt);assert.equal(merged.origin.mergedAt,'2026-10-31T14:00:00.000Z');
  assert.equal(merged.origin.headSha,'b'.repeat(40));assert.equal(merged.origin.mergeSha,'c'.repeat(40));assert.deepEqual(merged.changes,created.changes);
  assert.equal((await service.get(created.id,'gather',1)).origin.state,'proposed');assert.equal((await service.list('gather'))[0].origin.state,'merged');
  const renamed=await service.update(created.id,{projectId:'gather',expectedVersion:2,title:'Review after merge'});
  assert.deepEqual(renamed.origin,merged.origin);assert.equal(renamed.changeSummary,created.changeSummary);assert.deepEqual(renamed.changes,created.changes);
  assert.match(renamed.report.limitations[0],/does not establish deployment/);assert.equal(renamed.report.limitations.some(value=>value.startsWith('Local proposed change')),false);
});

test('old local records gain a source projection without inventing change time or rewriting history',async()=>{
  const {service,input,root}=setup(),created=await service.create(input),path=join(root,created.id,'1.json');
  const legacy=JSON.parse(await readFile(path,'utf8'));delete legacy.origin;delete legacy.changeSummary;delete legacy.changes;
  await writeFile(path,JSON.stringify(legacy));const original=await readFile(path,'utf8');
  const current=await service.get(created.id,'gather');
  assert.equal(current.kind,'local_proposal');assert.equal(current.provider,'not_connected');assert.equal(current.origin.kind,'local_change');assert.equal(current.origin.createdAt,null);assert.equal(current.origin.mergedAt,null);assert.equal(current.changeSummary,null);assert.deepEqual(current.changes,[]);
  assert.equal(await readFile(path,'utf8'),original);
  const updated=await service.update(created.id,{projectId:'gather',expectedVersion:1,changeSummary:'Now capture the real diff.',changes:['Show all-in totals.']});
  assert.equal(updated.kind,legacy.kind);assert.equal(updated.provider,legacy.provider);assert.equal(updated.createdAt,legacy.createdAt);assert.equal(updated.origin.createdAt,null);assert.equal(await readFile(path,'utf8'),original);
});

test('linking a local assessment to its PR keeps legacy source fields consistent and prior versions intact',async()=>{
  const {service,input,root}=setup(),created=await service.create(input);
  const linked=await service.update(created.id,{projectId:'gather',expectedVersion:1,origin:proposedOrigin()});
  assert.equal(linked.kind,'pull_request');assert.equal(linked.provider,'github');assert.equal(linked.origin.kind,'pull_request');assert.equal(linked.origin.provider,'github');
  const stored=JSON.parse(await readFile(join(root,created.id,'2.json'),'utf8'));assert.equal(stored.kind,'pull_request');assert.equal(stored.provider,'github');
  const original=await service.get(created.id,'gather',1);assert.equal(original.kind,'local_proposal');assert.equal(original.provider,'not_connected');assert.equal(original.origin.kind,'local_change');
  const renamed=await service.update(created.id,{projectId:'gather',expectedVersion:2,title:'Named assessment'});assert.equal(renamed.kind,'pull_request');assert.equal(renamed.provider,'github');assert.deepEqual(renamed.origin,linked.origin);
});

test('pull request origin validation rejects unsafe links, contradictory metadata and fabricated timestamps',async()=>{
  const invalid=[
    {...proposedOrigin(),url:'javascript:alert(1)'},
    {...proposedOrigin(),url:'http://github.com/acme/gather/pull/42'},
    {...proposedOrigin(),url:'https://token@github.com/acme/gather/pull/42'},
    {...proposedOrigin(),url:'https://github.com/acme/gather/pull/42?token=secret'},
    {...proposedOrigin(),url:'https://github.com/acme/other/pull/42'},
    {...proposedOrigin(),number:43},
    {...proposedOrigin(),repository:'acme/../gather'},
    {...proposedOrigin(),createdAt:'October 30, 2026'},
    {...proposedOrigin(),createdAt:'2026-02-30T10:00:00Z'},
    {...proposedOrigin(),createdAt:'2026-10-30T10:00:00'},
    {...proposedOrigin(),mergedAt:'2026-10-31T10:00:00Z'},
    {...proposedOrigin(),state:'merged',mergedAt:'2026-10-29T10:00:00Z'},
    {...proposedOrigin(),state:'deployed'},
    {...proposedOrigin(),headSha:'arbitrary-build-name'},
    {kind:'local_change',state:'merged'},
    {kind:'local_change',provider:'github'},
  ];
  for(const origin of invalid){const {service,input}=setup();await assert.rejects(()=>service.create({...input,origin}),{code:'INVALID_CHANGE_IMPACT'});}
  const {service,input}=setup();
  const gitlab=await service.create({...input,origin:{kind:'pull_request',provider:'gitlab',repository:'acme/apps/gather',number:8,url:'https://gitlab.example.com/acme/apps/gather/-/merge_requests/8',state:'merged'}});
  assert.equal(gitlab.origin.state,'merged');assert.equal(gitlab.origin.createdAt,null);assert.equal(gitlab.origin.mergedAt,null);
});

test('an assessment keeps its original PR identity, timestamps and commits when metadata evolves',async()=>{
  const {service,input}=setup(),created=await service.create({...input,origin:proposedOrigin()});
  for(const origin of [{kind:'local_change'},{number:43,url:'https://github.com/acme/gather/pull/43'},{createdAt:null},{headSha:'d'.repeat(40)}])await assert.rejects(()=>service.update(created.id,{projectId:'gather',expectedVersion:1,origin}),{code:'IMMUTABLE_CHANGE_ORIGIN'});
  const merged=await service.update(created.id,{projectId:'gather',expectedVersion:1,origin:{state:'merged',mergedAt:'2026-10-31T14:00:00Z'}});
  await assert.rejects(()=>service.update(created.id,{projectId:'gather',expectedVersion:2,origin:{state:'proposed',mergedAt:null}}),{code:'IMMUTABLE_CHANGE_ORIGIN'});
  assert.deepEqual((await service.get(created.id,'gather')).origin,merged.origin);
});

test('factual change details are bounded, versioned and remain separate from intent',async()=>{
  const {service,input}=setup();
  await assert.rejects(()=>service.create({...input,changes:Array.from({length:13},()=> 'Change')}),{code:'INVALID_CHANGE_IMPACT'});
  await assert.rejects(()=>service.create({...input,changes:['x'.repeat(501)]}),{code:'INVALID_CHANGE_IMPACT'});
  await assert.rejects(()=>service.create({...input,changeSummary:'x'.repeat(3001)}),{code:'INVALID_CHANGE_IMPACT'});
  const created=await service.create({...input,changeSummary:'First description',changes:['First change']});
  const next=await service.update(created.id,{projectId:'gather',expectedVersion:1,changeSummary:'Corrected description',changes:['Corrected change']});
  assert.equal(next.intent,input.intent);assert.equal(next.changeSummary,'Corrected description');assert.deepEqual(next.changes,['Corrected change']);
  assert.equal((await service.get(created.id,'gather',1)).changeSummary,'First description');
});
