import {retainedFixture} from './retained-test-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createWorkspaceStore } from './workspace-store.mjs';
import { createInsightsService } from './workspace-insights.mjs';
import { personaMemoryForScreen } from './memory-runtime.mjs';

async function setup(t){const root=await retainedFixture('journey-memory-');const store=createWorkspaceStore({root});t.after(async()=>{store.close();});return store;}
function sourceRun(store,extra={}){const run=store.buildRun({projectId:'little-steps',charterId:'first-value',personaId:'mother',environmentId:'little-steps-local'});return store.syncRun({...run,status:'finished',completedAt:'2026-11-01T12:00:10.000Z',integrityStatus:'recorded',productFingerprint:{'index.html':'a'.repeat(64)},events:[{type:'screenshot',index:0,url:'http://127.0.0.1:4320/activities/one',screenshot:`/runs/${run.id}/screen-0.png`,videoMs:1200,at:'2026-11-01T12:00:01.000Z'},{type:'screenshot',index:2,url:'http://127.0.0.1:4320/activities/two',screenshot:`/runs/${run.id}/screen-2.png`,videoMs:3200}],...extra});}
function claim(run,extra={}){return {projectId:run.projectId,name:'Start an activity',content:'The Start button opens an activity.',kind:'navigation',subject:'activity.start',value:'Start opens activity',polarity:'affirm',audience:'persona',confidence:0.85,confidenceBasis:'The activity was visible after selecting Start.',scope:{screenPatterns:['/activities/*'],flows:[]},sources:[{runId:run.id,eventIndex:0}],...extra};}
const code=value=>error=>error.code===value;
function snapshot(store,{personaId='mother',continuity='returning',memoryPolicy='relevant',...extra}={}){return store.memory.resolveSnapshot({projectId:'little-steps',environment:store.getEntity('environment','little-steps-local'),persona:{...store.getEntity('persona',personaId),continuity},charter:{...store.getEntity('charter','first-value'),memoryPolicy},buildId:store.memory.buildIdentity({productFingerprint:{'index.html':'a'.repeat(64)}}),...extra});}

test('manual memory validates recorded screenshot sources and redacts content without inventing provenance',async t=>{
 const store=await setup(t),run=sourceRun(store),entry=store.memory.create(claim(run,{content:'Use email alice@example.test. token=private-example',confidenceBasis:'Observed password=private-example on screen.'}));
 assert.equal(entry.version,1);assert.equal(entry.status,'published');assert.equal(entry.archived,false);assert.equal(entry.provenance.origin,'local-user');
 assert.doesNotMatch(JSON.stringify(entry),/alice@example|private-example/);assert.match(entry.content,/REDACTED/);
 assert.deepEqual(entry.sources[0],{runId:run.id,eventIndex:0,type:'screenshot',screenshot:`/runs/${run.id}/screen-0.png`,screenUrl:'http://127.0.0.1:4320/activities/one',originalMs:1200,observedAt:'2026-11-01T12:00:01.000Z',environmentId:'little-steps-local',environmentVersion:1,buildId:store.memory.buildIdentity(run),personaId:'mother',experimentalStudyId:null});
 assert.equal(entry.applicability.environmentId,'little-steps-local');assert.equal(entry.applicability.environmentVersion,1);assert.equal(entry.confidence,0.85);
 for(const sources of [[],[{runId:run.id,eventIndex:1}],[{runId:'missing',eventIndex:0}]])assert.throws(()=>store.memory.create(claim(run,{sources})),error=>['MEMORY_SOURCES_REQUIRED','INVALID_MEMORY_SOURCE'].includes(error.code));
 const other=store.saveProject({name:'Other product'});assert.throws(()=>store.memory.create(claim(run,{projectId:other.id})),code('INVALID_MEMORY_SOURCE'));
 for(const confidence of [undefined,null,-1,1.1,'high'])assert.throws(()=>store.memory.create(claim(run,{confidence})),code('MEMORY_CONFIDENCE_REQUIRED'));
 assert.throws(()=>store.memory.create(claim(run,{confidenceBasis:''})),/Confidence basis/);
});

test('historical preview knowledge resolves to its configured environment without rewriting records or snapshots',async t=>{
 const store=await setup(t),parent=store.getEntity('environment','little-steps-local');
 const preview=store.saveEntity('environment',{projectId:'little-steps',name:'Recorded candidate',url:'http://127.0.0.1:4900/',isolation:'stateless-demo'});
 const run=sourceRun(store,{environmentId:preview.id,environmentVersion:preview.version,environmentSnapshot:preview,target:preview.url});
 const entry=store.memory.create(claim(run)),originalEntry=store.db.prepare('SELECT data FROM memory_versions WHERE id=?').get(entry.id).data;
 const frozen=snapshot(store,{environment:preview}),originalSnapshot=store.db.prepare('SELECT data FROM memory_snapshots WHERE id=?').get(frozen.id).data;
 store.registerEnvironmentInstance(preview.id,{parentEnvironmentId:parent.id,parentEnvironmentVersion:parent.version,source:{kind:'fix-preview'}});
 const projected=store.memory.get(entry.id);assert.equal(projected.applicability.environmentId,preview.id);assert.equal(projected.sources[0].environmentId,preview.id);assert.equal(projected.configuredEnvironment.id,parent.id);assert.equal(projected.environmentKind,'temporary');
 assert.deepEqual(snapshot(store).roles.persona.map(item=>item.id),[entry.id]);assert.equal(snapshot(store,{continuity:'first-time'}).roles.persona.length,0);
 assert.equal(store.db.prepare('SELECT data FROM memory_versions WHERE id=?').get(entry.id).data,originalEntry);assert.equal(store.db.prepare('SELECT data FROM memory_snapshots WHERE id=?').get(frozen.id).data,originalSnapshot);
 const newer=store.saveEntity('environment',{description:'Changed configuration'},parent.id);assert.ok(snapshot(store,{environment:newer}).excluded.some(item=>item.id===entry.id&&item.reason==='environment_version_mismatch'));
 const other=store.saveEntity('environment',{projectId:'little-steps',name:'Staging',url:'http://127.0.0.1:4950/'});assert.ok(snapshot(store,{environment:other}).excluded.some(item=>item.id===entry.id&&item.reason==='environment_mismatch'));
});

test('canonical environment aliases still detect conflicting knowledge and publish new parent applicability',async t=>{
 const store=await setup(t),parent=store.getEntity('environment','little-steps-local'),preview=store.saveEntity('environment',{projectId:'little-steps',name:'Recorded baseline',url:'http://127.0.0.1:4910/',isolation:'stateless-demo'});
 const historical=sourceRun(store,{environmentId:preview.id,environmentVersion:preview.version,environmentSnapshot:preview,target:preview.url}),a=store.memory.create(claim(historical));
 store.registerEnvironmentInstance(preview.id,{parentEnvironmentId:parent.id,parentEnvironmentVersion:parent.version,source:{kind:'fix-preview'}});
 const b=store.memory.create(claim(sourceRun(store),{value:'Start opens checkout'}));assert.equal(store.memory.get(a.id).conflicts[0].otherEntryId,b.id);
 const learner=sourceRun(store,{environmentId:preview.id,environmentVersion:preview.version,environmentSnapshot:preview,target:preview.url});
 store.syncRun({...learner,memoryLearnings:[{...claim(learner),subject:'another.subject',sources:[{eventIndex:0}]}]});
 const publication=store.memory.publications({runId:learner.id})[0],published=store.memory.get(publication.entryId);assert.equal(published.applicability.environmentId,parent.id);assert.equal(published.sources[0].environmentId,preview.id);
});

test('automatic preview learnings use the known reference origin while retaining exact evidence and explicit scopes',async t=>{
 const store=await setup(t),parent=store.getEntity('environment','little-steps-local');
 const run=sourceRun(store,{target:'http://127.0.0.1:4915/',memoryReferenceUrl:parent.url,executionInstance:{id:'preview-scope',kind:'fix-candidate',environmentId:parent.id}});
 const ownUrl='http://127.0.0.1:4915/activities/one',externalUrl='https://other-product.test/activities/two';
 const events=run.events.map(event=>({...event,url:event.index===0?ownUrl:externalUrl}));
 const generated=claim(run,{subject:'generated-default',scope:{screenPatterns:[],flows:[]},sources:[{eventIndex:0}]}),explicit=claim(run,{subject:'explicit-origin',scope:{screenPatterns:[ownUrl],flows:[]},sources:[{eventIndex:0}]}),external=claim(run,{subject:'external-origin',scope:{screenPatterns:[],flows:[]},sources:[{eventIndex:2}]});
 store.syncRun({...run,events,memoryLearnings:[generated,explicit,external]});
 const entries=store.memory.publications({runId:run.id}).sort((a,b)=>a.learningIndex-b.learningIndex).map(item=>store.memory.get(item.entryId));
 assert.deepEqual(entries[0].scope.screenPatterns,[new URL('/activities/one',parent.url).href]);assert.equal(entries[0].sources[0].screenUrl,ownUrl);
 assert.deepEqual(entries[1].scope.screenPatterns,[ownUrl]);assert.deepEqual(entries[2].scope.screenPatterns,[externalUrl]);
 const next=snapshot(store);assert.deepEqual(store.memory.accessForScreen(next,{audience:'persona',url:new URL('/activities/one',parent.url).href}).map(item=>item.id),[entries[0].id]);
 const unproven=sourceRun(store,{target:'http://127.0.0.1:4916/',memoryReferenceUrl:parent.url});
 store.syncRun({...unproven,events:unproven.events.map(event=>({...event,url:'http://127.0.0.1:4916/activities/one'})),memoryLearnings:[{...generated,subject:'unproven-origin'}]});
 assert.deepEqual(store.memory.get(store.memory.publications({runId:unproven.id})[0].entryId).scope.screenPatterns,['http://127.0.0.1:4916/activities/one']);
});

test('new flow snapshots canonicalize inventory environment aliases without changing saved inventories or earlier snapshots',async t=>{
 const store=await setup(t),source=sourceRun(store),parent=store.getEntity('environment','little-steps-local'),insights=createInsightsService({store});
 const preview=store.saveEntity('environment',{projectId:'little-steps',name:'Past baseline',url:'http://127.0.0.1:4917/',isolation:'stateless-demo'});
 const entry=store.memory.create(claim(source,{scope:{screenPatterns:[],flows:['checkout']}}));
 const inventory=insights.saveInventory({projectId:'little-steps',name:'Known flows',source:{kind:'curated',reference:'Fixture'},completeness:'declared-scope',flows:[{id:'checkout',name:'Checkout'}],screens:[{id:'activity',name:'Activity',routePattern:'/activities/:id',origin:new URL(parent.url).origin,environmentIds:[preview.id],flowIds:['checkout']}]});
 const before=snapshot(store),frozen=JSON.stringify(store.memory.getSnapshot(before.id));
 store.registerEnvironmentInstance(preview.id,{parentEnvironmentId:parent.id,parentEnvironmentVersion:parent.version,source:{kind:'fix-preview'}});
 const after=snapshot(store),url=new URL('/activities/one',parent.url).href;
 assert.deepEqual(after.flowContext.screens[0].environmentIds,[parent.id]);assert.deepEqual(after.flowContext.screens[0].recordedEnvironmentIds,[preview.id]);
 assert.deepEqual(store.memory.accessForScreen(after,{audience:'persona',url,flows:store.memory.flowsForScreen(after,{url}).flows}).map(item=>item.id),[entry.id]);
 assert.equal(store.memory.flowsForScreen(after,{url:'https://unrelated.test/activities/one'}).flows.length,0);
 assert.equal(JSON.stringify(store.memory.getSnapshot(before.id)),frozen);assert.deepEqual(insights.getInventory('little-steps',inventory.version).screens[0].environmentIds,[preview.id]);
});

test('all versions, corrections, archive and restore retain immutable history and reject stale/project writes',async t=>{
 const store=await setup(t),run=sourceRun(store),entry=store.memory.create(claim(run));
 const original=store.db.prepare('SELECT * FROM memory_versions WHERE id=?').get(entry.id);
 const updated=store.memory.update(entry.id,{expectedVersion:1,content:'Start opens a lesson.',value:'Start opens lesson',status:'corrected',reviewReason:'Corrected the label.'});assert.equal(updated.version,2);
 assert.throws(()=>store.memory.update(entry.id,{expectedVersion:1,content:'Stale'}),code('VERSION_CONFLICT'));
 assert.throws(()=>store.memory.archive(entry.id,true,{projectId:'other'}),code('PROJECT_MISMATCH'));
 store.memory.archive(entry.id,true,{expectedVersion:2});assert.equal(store.memory.get(entry.id).archived,true);
 const restored=store.memory.restore(entry.id,{version:1,expectedVersion:2});assert.equal(restored.version,3);assert.equal(restored.content,entry.content);assert.equal(restored.archived,true);
 assert.deepEqual(store.db.prepare('SELECT * FROM memory_versions WHERE id=? AND version=1').get(entry.id),original);
 assert.equal(store.memory.get(entry.id,1).versionCreatedAt,original.created_at);assert.equal(store.memory.versions(entry.id).length,3);
 assert.equal(store.memory.list({projectId:run.projectId,includeArchived:false}).length,0);
});

test('contradictions stay inspectable and excluded until explicit atomic resolution',async t=>{
 const store=await setup(t),run=sourceRun(store),a=store.memory.create(claim(run)),b=store.memory.create(claim(run,{value:'Start opens a checkout',content:'Start opens a checkout.'}));
 const conflict=store.memory.get(a.id).conflicts[0];assert.equal(conflict.otherEntryId,b.id);assert.equal(conflict.status,'unresolved');
 const before=snapshot(store);assert.equal(before.roles.persona.length,0);assert.ok(before.excluded.every(item=>item.reason==='unresolved_conflict'));
 store.memory.update(a.id,{expectedVersion:1,status:'corrected'});assert.equal(snapshot(store).roles.persona.length,0);
 assert.throws(()=>store.memory.resolveConflict(conflict.id,{preferredEntryId:a.id,reason:'Observed the activity screen.',expectedVersion:99}),code('VERSION_CONFLICT'));
 const resolved=store.memory.resolveConflict(conflict.id,{projectId:run.projectId,preferredEntryId:a.id,reason:'The activity screen confirms the expected destination.',expectedVersion:conflict.version});
 assert.equal(resolved.conflict.status,'resolved');assert.equal(store.memory.get(a.id).status,'verified');assert.equal(store.memory.get(b.id).status,'superseded');assert.equal(store.memory.get(b.id).supersededById,a.id);
 assert.equal(store.memory.get(b.id,1).status,'published');assert.equal(store.memory.get(b.id,1).value,'Start opens a checkout');
 assert.deepEqual(snapshot(store).roles.persona.map(item=>item.id),[a.id]);assert.equal(before.roles.persona.length,0);
});

test('conflict resolution failures roll back both entry versions and conflict status',async t=>{
 const store=await setup(t),run=sourceRun(store),a=store.memory.create(claim(run)),b=store.memory.create(claim(run,{polarity:'deny'})),conflict=b.conflicts[0];
 store.db.exec("CREATE TRIGGER fail_memory_resolve BEFORE INSERT ON audit WHEN NEW.kind='memory-conflict-resolved' BEGIN SELECT RAISE(ABORT,'injected failure'); END;");
 assert.throws(()=>store.memory.resolveConflict(conflict.id,{preferredEntryId:a.id,reason:'Resolve'}),/injected failure/);
 assert.equal(store.memory.get(a.id).version,1);assert.equal(store.memory.get(b.id).version,1);assert.equal(store.memory.get(a.id).conflicts[0].status,'unresolved');
});

test('current journey learnings publish automatically once with own-persona applicability and observed authority',async t=>{
 const store=await setup(t),run=sourceRun(store),learning=claim(run,{scope:{screenPatterns:[],flows:[]},sources:[{eventIndex:0}],status:'verified',claimType:'approved_rule',applicability:{environmentId:null,environmentVersion:null,personaId:null}});
 store.syncRun({...run,memoryLearnings:[learning]});store.syncRun({...run,memoryLearnings:[learning]});
 const publications=store.memory.publications({runId:run.id});assert.equal(publications.length,1);assert.equal(publications[0].status,'published');
 const entry=store.memory.get(publications[0].entryId);assert.equal(entry.status,'published');assert.equal(entry.claimType,'observed');assert.equal(entry.applicability.personaId,'mother');assert.equal(entry.applicability.environmentId,run.environmentId);assert.equal(entry.provenance.origin,'journey');assert.deepEqual(entry.scope.screenPatterns,['http://127.0.0.1:4320/activities/one']);
 assert.equal(snapshot(store,{personaId:'teacher'}).roles.persona.length,0);
 assert.deepEqual(snapshot(store).roles.persona.map(item=>item.id),[entry.id]);assert.equal(store.getRun(run.id).memorySnapshot.roles.persona.length,0);
});

test('missing confidence and sources create visible retained failures rather than authoritative entries',async t=>{
 const store=await setup(t),run=sourceRun(store);
 store.syncRun({...run,memoryLearnings:[claim(run,{confidence:undefined}),claim(run,{sources:[]}),claim(run,{sources:[{eventIndex:999}]})]});
 const failures=store.memory.publicationFailures({runId:run.id});assert.equal(failures.length,3);assert.deepEqual(new Set(failures.map(item=>item.code)),new Set(['MEMORY_CONFIDENCE_REQUIRED','MEMORY_SOURCES_REQUIRED','INVALID_MEMORY_SOURCE']));
 assert.equal(store.memory.list({projectId:run.projectId}).length,0);assert.equal(snapshot(store).roles.persona.length,0);
 store.memory.publishRun(run.id);assert.equal(store.memory.publicationFailures({runId:run.id}).length,3);
});

test('legacy imports and ordinary rereads never backfill memory automatically',async t=>{
 const store=await setup(t),run=sourceRun(store),imported={...run,id:'12345678-1234-4234-8234-123456789abc',memoryLearnings:[claim(run)]};
 store.syncRun(imported,{imported:true});store.getRun(imported.id);store.memory.list({projectId:run.projectId});
 assert.equal(store.memory.publications({runId:imported.id}).length,0);assert.equal(store.memory.list({projectId:run.projectId}).length,0);
});

test('malformed proposal markers produce an accurate failure without preserving unsafe details',async t=>{
 const store=await setup(t),run=sourceRun(store);store.syncRun({...run,memoryLearnings:[{publicationError:'Do not persist this arbitrary sensitive value'}]});
 const [failure]=store.memory.publicationFailures({runId:run.id});assert.equal(failure.code,'INVALID_MEMORY_STRUCTURE');assert.equal(failure.message,'The model learning had an unsupported or oversized structure.');assert.doesNotMatch(JSON.stringify(failure),/arbitrary sensitive/);assert.equal(store.memory.list({projectId:run.projectId}).length,0);
});

test('role separation and both returning consent flags are required for prior persona knowledge',async t=>{
 const store=await setup(t),run=sourceRun(store);
 for(const audience of ['operational','evaluator','persona'])store.memory.create(claim(run,{audience,subject:`${audience}.start`}));
 for(const config of [{continuity:'first-time',memoryPolicy:'relevant'},{continuity:'returning',memoryPolicy:'none'},{continuity:'returning',memoryPolicy:'explicit'}]){
  const value=snapshot(store,config);assert.equal(value.roles.persona.length,0);assert.equal(value.roles.operational.length,1);assert.equal(value.roles.evaluator.length,1);
  assert.equal(store.memory.accessForScreen(value,{audience:'persona',url:'http://127.0.0.1:4320/activities/one'}).length,0);
 }
 const permitted=snapshot(store);assert.equal(permitted.roles.persona.length,1);assert.ok(permitted.roles.persona.every(entry=>entry.audience==='persona'));
 const wrong=store.saveProject({name:'Other project'});assert.throws(()=>snapshot(store,{projectId:wrong.id}),code('PROJECT_MISMATCH'));
});

test('expired, experimental, disputed, low-confidence and mismatched applicability are excluded',async t=>{
 const store=await setup(t),run=sourceRun(store),environment=store.getEntity('environment','little-steps-local');
 const conditions=[{status:'disputed'},{confidence:0.5},{applicability:{expiresAt:'2000-01-01T00:00:00Z'}},{applicability:{experimentalStudyId:'study-1'}},{claimType:'approved_rule',applicability:{buildId:'different'}},{applicability:{personaId:'teacher'}}];
 for(const [index,extra] of conditions.entries())store.memory.create(claim(run,{...extra,subject:`subject-${index}`}));
 const result=snapshot(store);assert.equal(result.roles.persona.length,0);assert.deepEqual(new Set(result.excluded.map(item=>item.reason)),new Set(['disputed','low_confidence','expired','experimental','build_mismatch','persona_mismatch']));
 const active=store.memory.create(claim(run,{subject:'fresh'}));store.saveEntity('environment',{name:'Changed environment'},environment.id);
 assert.equal(snapshot(store).excluded.find(item=>item.id===active.id).reason,'environment_version_mismatch');
});

test('experimental automatic publications retain experimental isolation',async t=>{
 const store=await setup(t),run=sourceRun(store,{experimentalStudyId:'calibration-study'});store.syncRun({...run,memoryLearnings:[claim(run,{sources:[{eventIndex:0}],applicability:{experimentalStudyId:null}})]});
 const entry=store.memory.get(store.memory.publications({runId:run.id})[0].entryId);assert.equal(entry.applicability.experimentalStudyId,'calibration-study');assert.equal(snapshot(store).excluded.find(item=>item.id===entry.id).reason,'experimental');
 const manual=store.memory.create(claim(run,{subject:'manual',claimType:'approved_rule',applicability:{experimentalStudyId:null}}));assert.equal(manual.applicability.experimentalStudyId,'calibration-study');
 const edited=store.memory.update(entry.id,{expectedVersion:1,applicability:{...entry.applicability,experimentalStudyId:null}});assert.equal(edited.applicability.experimentalStudyId,'calibration-study');assert.equal(snapshot(store).roles.persona.length,0);
});

test('automatic citations cannot silently substitute another journey and inferred screens remain origin-specific',async t=>{
 const store=await setup(t),run=sourceRun(store),other=sourceRun(store);
 store.syncRun({...run,memoryLearnings:[claim(run,{sources:[{runId:other.id,eventIndex:0}]}),claim(run,{subject:'actual',scope:{screenPatterns:[],flows:[]},sources:[{eventIndex:0}]})]});
 assert.equal(store.memory.publicationFailures({runId:run.id})[0].code,'INVALID_MEMORY_SOURCE');
 const resolved=snapshot(store);
 assert.equal(store.memory.accessForScreen(resolved,{audience:'persona',url:'http://127.0.0.1:4320/activities/one'}).length,1);
 assert.equal(store.memory.accessForScreen(resolved,{audience:'persona',url:'https://unrelated.test/activities/one'}).length,0);
});

test('snapshots are immutable across library edits, publication, archive and retry',async t=>{
 const store=await setup(t),source=sourceRun(store),entry=store.memory.create(claim(source));store.saveEntity('persona',{continuity:'returning'},'mother');store.saveEntity('charter',{memoryPolicy:'relevant'},'first-value');
 const run=store.buildRun({charterId:'first-value',personaId:'mother',environmentId:'little-steps-local'}),pinned=JSON.stringify(run.memorySnapshot);store.syncRun({...run,status:'failed'});
 store.memory.update(entry.id,{content:'Changed later',expectedVersion:1});store.memory.archive(entry.id);
 assert.equal(JSON.stringify(store.getRun(run.id).memorySnapshot),pinned);assert.equal(JSON.stringify(store.memory.getSnapshot(run.memorySnapshotId)),pinned);
 const retry=store.buildRetry(run.id);assert.equal(retry.memorySnapshotId,run.memorySnapshotId);assert.equal(JSON.stringify(retry.memorySnapshot),pinned);
 assert.equal(snapshot(store).roles.persona.length,0);
});

test('screen/flow lookup uses only pinned role entries and logs precisely permitted access',async t=>{
 const store=await setup(t),run=sourceRun(store),screen=store.memory.create(claim(run)),flow=store.memory.create(claim(run,{subject:'flow',scope:{screenPatterns:[],flows:['checkout']}}));
 store.memory.create(claim(run,{subject:'evaluation',audience:'evaluator'}));
 store.saveEntity('persona',{continuity:'returning'},'mother');store.saveEntity('charter',{memoryPolicy:'relevant'},'first-value');
 const next=store.buildRun({charterId:'first-value',personaId:'mother',environmentId:'little-steps-local'});next.memorySnapshot=store.memory.bindSnapshotBuild(next.memorySnapshot,{buildId:store.memory.buildIdentity(run)});next.memorySnapshotId=next.memorySnapshot.id;store.syncRun(next);
 assert.deepEqual(store.memory.accessForScreen(next.memorySnapshot,{audience:'persona',url:'http://example.test/activities/one'}).map(item=>item.id),[screen.id]);
 assert.deepEqual(store.memory.accessForScreen(next.memorySnapshot,{audience:'persona',url:'http://example.test/elsewhere',flows:['checkout']}).map(item=>item.id),[flow.id]);
 assert.equal(store.memory.accessLog(next.id).length,0);
 assert.throws(()=>store.memory.recordAccess(next.id,{audience:'persona',url:'http://example.test/activities/one',entryIds:[screen.id],eventIndex:0,snapshotId:'changed-snapshot'}),code('MEMORY_SNAPSHOT_CHANGED'));
 assert.equal(store.memory.accessLog(next.id).length,0);
 const access=store.memory.recordAccess(next.id,{audience:'persona',url:'http://example.test/activities/one?token=private-example',entryIds:[screen.id],eventIndex:0,snapshotId:next.memorySnapshot.id});
 assert.equal(access.snapshotId,next.memorySnapshotId);assert.doesNotMatch(access.url,/private-example/);assert.deepEqual(store.memory.accessLog(next.id)[0].entryIds,[screen.id]);
 assert.throws(()=>store.memory.recordAccess(next.id,{audience:'persona',url:'http://example.test/elsewhere',entryIds:[screen.id]}),code('MEMORY_ACCESS_DENIED'));
 assert.throws(()=>store.memory.recordAccess(next.id,{audience:'persona',url:'http://example.test/activities/one',entryIds:[next.memorySnapshot.roles.evaluator[0].id]}),code('MEMORY_ACCESS_DENIED'));
});

test('flow inventory is pinned at launch and later curation cannot change returning knowledge',async t=>{
 const store=await setup(t),source=sourceRun(store),insights=createInsightsService({store});
 const checkout=store.memory.create(claim(source,{subject:'checkout-flow',scope:{screenPatterns:[],flows:['checkout']}}));
 const account=store.memory.create(claim(source,{subject:'account-flow',scope:{screenPatterns:[],flows:['Account']}}));
 const input={projectId:'little-steps',name:'Known product flows',source:{kind:'curated',reference:'Fixture route review'},completeness:'declared-scope',flows:[{id:'checkout',name:'Checkout'},{id:'account',name:'Account'}],screens:[{id:'activity',name:'Activity',routePattern:'/activities/:id',origin:'http://127.0.0.1:4320',flowIds:['checkout']}]};
 const inventory=insights.saveInventory(input);
 store.saveEntity('persona',{continuity:'returning'},'mother');store.saveEntity('charter',{memoryPolicy:'relevant',flows:['Checkout','Account']},'first-value');
 const current=store.buildRun({charterId:'first-value',personaId:'mother',environmentId:'little-steps-local'});current.memorySnapshot=store.memory.bindSnapshotBuild(current.memorySnapshot,{buildId:store.memory.buildIdentity(source)});current.memorySnapshotId=current.memorySnapshot.id;store.syncRun(current);
 const frozen=structuredClone(current.memorySnapshot);assert.equal(frozen.flowContext.inventoryVersionId,inventory.versionId);
 const first=personaMemoryForScreen(current,store.memory,'http://127.0.0.1:4320/activities/one');assert.deepEqual(first.entryIds,[checkout.id]);
 const access=store.memory.recordAccess(current.id,{audience:'persona',url:first.url,entryIds:first.entryIds});assert.deepEqual(access.flowContext.flows,['checkout','Checkout']);
 assert.throws(()=>store.memory.recordAccess(current.id,{audience:'persona',url:first.url,entryIds:[account.id]}),code('MEMORY_ACCESS_DENIED'));
 insights.saveInventory({...input,expectedVersion:1,screens:[{...input.screens[0],flowIds:['account']}]});
 assert.deepEqual(store.memory.getSnapshot(current.memorySnapshotId),frozen);assert.deepEqual(personaMemoryForScreen(current,store.memory,first.url).entryIds,[checkout.id]);
 const later=store.buildRun({charterId:'first-value',personaId:'mother',environmentId:'little-steps-local'});later.memorySnapshot=store.memory.bindSnapshotBuild(later.memorySnapshot,{buildId:store.memory.buildIdentity(source)});
 assert.deepEqual(personaMemoryForScreen(later,store.memory,first.url).entryIds,[account.id]);
});

test('runtime build binding admits only matching launch-frozen versions and excludes late publications',async t=>{
 const store=await setup(t),run=sourceRun(store),known=store.memory.create(claim(run));
 store.saveEntity('persona',{continuity:'returning'},'mother');store.saveEntity('charter',{memoryPolicy:'relevant'},'first-value');
 const queued=store.buildRun({charterId:'first-value',personaId:'mother',environmentId:'little-steps-local'}),original=JSON.stringify(queued.memorySnapshot);
 assert.equal(queued.memorySnapshot.buildResolved,false);assert.deepEqual(queued.memorySnapshot.roles.persona,[]);assert.deepEqual(queued.memorySnapshot.pendingBuild.persona.map(entry=>entry.id),[known.id]);
 assert.deepEqual(store.memory.accessForScreen(queued.memorySnapshot,{audience:'persona',url:run.target}),[]);
 const later=store.memory.create(claim(run,{subject:'later-discovery',value:'A later observation'}));
 store.memory.update(known.id,{value:'A later revision',content:'Changed after enqueue',expectedVersion:1});
 const bound=store.memory.bindSnapshotBuild(queued.memorySnapshot,{buildId:store.memory.buildIdentity(run)});
 assert.equal(bound.buildResolved,true);assert.equal(bound.sourceSnapshotId,queued.memorySnapshot.id);assert.notEqual(bound.id,queued.memorySnapshot.id);
 assert.deepEqual(bound.roles.persona.map(entry=>[entry.id,entry.version]),[[known.id,1]]);assert.ok(!bound.roles.persona.some(entry=>entry.id===later.id));
 assert.equal(JSON.stringify(store.memory.getSnapshot(queued.memorySnapshot.id)),original);
 const changed=store.memory.bindSnapshotBuild(queued.memorySnapshot,{buildId:store.memory.buildIdentity({...run,productFingerprint:{'index.html':'b'.repeat(64)}})});
 assert.equal(changed.roles.persona.length,0);assert.equal(changed.excluded.find(entry=>entry.id===known.id).reason,'build_mismatch');
 const unknown=store.memory.bindSnapshotBuild(queued.memorySnapshot,{buildId:null});assert.equal(unknown.roles.persona.length,0);assert.equal(unknown.excluded.find(entry=>entry.id===known.id).reason,'build_unverified');
});

test('unknown or invalidated source builds never become authoritative and cannot be forged by a manual applicability override',async t=>{
 const store=await setup(t),unknownRun=sourceRun(store,{productFingerprint:null}),unknown=store.memory.create(claim(unknownRun));
 assert.equal(unknown.applicability.buildId,'unverified-source');assert.equal(snapshot(store).excluded.find(entry=>entry.id===unknown.id).reason,'build_unverified');
 const knownRun=sourceRun(store),known=store.memory.create(claim(knownRun,{subject:'known'}));
 assert.throws(()=>store.memory.create(claim(knownRun,{subject:'forged',applicability:{buildId:'invented'}})),code('INVALID_MEMORY_BUILD'));
 store.syncRun({...knownRun,integrityStatus:'invalidated'});assert.equal(snapshot(store).excluded.find(entry=>entry.id===known.id).reason,'source_unavailable');
});
