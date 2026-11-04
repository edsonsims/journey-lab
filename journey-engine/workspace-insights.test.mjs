import {retainedDatabasePath} from './retained-test-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {buildInsights,createInsightsService,normalizeScreenUrl,screenMatches} from './workspace-insights.mjs';
import {createWorkspaceMemory} from './workspace-memory.mjs';
import {WorkspaceError} from './workspace-store.mjs';
import {parseExperienceNote} from './browser-tools.mjs';

function recorded(id='run-1',extra={}){return {id,projectId:'p',personaId:'parent',personaVersion:1,personaName:'Parent',environmentId:'env',environmentVersion:1,model:'muse-wonder-1.0',viewport:{width:390,height:844},status:'finished',createdAt:'2026-11-01T12:00:00Z',completedAt:'2026-11-01T12:03:00Z',integrityStatus:'recorded',productFingerprint:{'app.js':'build-a'},video:`/runs/${id}/original.webm`,replay:`/runs/${id}/condensed.webm`,replayMetadata:{segments:[{originalStart:2,originalEnd:4,replayStart:0}]},events:[
  {index:0,type:'screenshot',url:'https://product.test/?email=private#hidden',screenshot:`/runs/${id}/s0.png`,videoMs:0},
  {index:1,type:'action',url:'https://product.test/activities/42',action:{type:'click_control',label:'Start'},videoMs:500},
  {index:2,type:'screenshot',url:'https://product.test/activities/42?token=private',screenshot:`/runs/${id}/s2.png`,videoMs:2500},
  {index:3,type:'action',url:'https://product.test/activities/42',action:{type:'type',text:'test data'},videoMs:2600},
  {index:4,type:'screenshot',url:'https://product.test/activities/42',screenshot:`/runs/${id}/s4.png`,videoMs:3000},
],experience:[{eventIndex:0,actionEventIndex:1,videoMs:0,reaction:'Where should I begin?',observation:'The next step is unclear.',valence:'negative',friction:2},{eventIndex:2,actionEventIndex:3,videoMs:2500,reaction:'Now I can start.',valence:'positive',friction:0},{eventIndex:4,reaction:'Reading the activity.'}],findings:[{id:`finding-${id}`,eventIndex:0,evidence_indices:[0],impact:'medium',type:'experience',expected:'A visible first step',expectationSource:'Charter goal'}],finding:{outcome:'goal_reached',evidence_indices:[4]},...extra};}
function inventory(){return {projectId:'p',name:'Known routes',version:1,versionId:'inventory-v1',scope:'Initial activity discovery.',source:{kind:'curated',reference:'Product team route list'},completeness:'partial',flows:[{id:'start',name:'First activity'}],screens:[{id:'home',name:'Home',routePattern:'/',device:'any',environmentIds:['env'],flowIds:['start'],criteria:[]},{id:'activity',name:'Activity',routePattern:'/activities/:id',device:'any',environmentIds:['env'],flowIds:['start'],criteria:[{id:'begin',text:'A first activity step is visible',source:'Charter'}]},{id:'settings',name:'Settings',routePattern:'/settings',device:'any',environmentIds:[],flowIds:[],criteria:[]}]};}
function setup(t){const db=new DatabaseSync(retainedDatabasePath('workspace-insights'));db.exec('CREATE TABLE runs(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,created_at TEXT NOT NULL)');const runs=new Map();const store={db,requireProject:id=>{if(!['p','other'].includes(id))throw new WorkspaceError('Project not found.',404);},getEntity:(kind,id)=>kind==='environment'&&id==='env'?{id,projectId:'p'}:null,getRun:id=>runs.has(id)?structuredClone(runs.get(id)):null};const put=run=>{runs.set(run.id,structuredClone(run));db.prepare('INSERT OR REPLACE INTO runs VALUES(?,?,?)').run(run.id,run.projectId,run.createdAt);};const service=createInsightsService({store});t.after(()=>db.close());return {store,service,put,runs};}

test('screen normalization removes all query/hash data and rejects credentials and non-web schemes',()=>{
  assert.equal(normalizeScreenUrl('https://product.test/path/?token=secret#secret'),'https://product.test/path');
  assert.equal(normalizeScreenUrl('https://u:p@product.test/'),null);assert.equal(normalizeScreenUrl('file:///tmp/x'),null);
  assert.equal(screenMatches({routePattern:'/activities/:id',device:'mobile',state:'empty',environmentIds:['env']},{url:'https://product.test/activities/42?secret=x',device:'mobile',state:'empty',environmentId:'env'}),true);
  assert.equal(screenMatches({routePattern:'/activities/:id',state:'authenticated'},{url:'https://product.test/activities/42',state:null}),false);
  assert.equal(screenMatches({routePattern:'/activities/:id'},{url:'https://product.test/activities/42/details'}),false);
});
test('observed-only analysis never invents a coverage denominator or verified outcome',()=>{
  const result=buildInsights({runs:[recorded()]});assert.equal(result.denominator,null);assert.equal(result.inventoryStatus,'not_defined');assert.equal(result.summary.observedScreens,2);assert.equal(result.summary.knownScreens,null);assert.equal(result.screens.every(screen=>!screen.states.verified),true);assert.match(result.limitations.join(' '),/No curated denominator/);
});
test('coverage distinguishes visits, actions, sourced evaluation and untested inventory',()=>{
  const run=recorded(),before=structuredClone(run),result=buildInsights({runs:[run],inventory:inventory()}),home=result.screens.find(screen=>screen.id==='home'),activity=result.screens.find(screen=>screen.id==='activity');
  assert.equal(result.denominator.screens,3);assert.equal(result.summary.visited,2);assert.equal(result.summary.notExplored,1);assert.equal(home.status,'evaluated');assert.equal(home.counts.observed.interactions,1);assert.equal(activity.status,'interacted');assert.equal(activity.counts.exposures,1);assert.equal(activity.counts.screenshots,2);assert.equal(result.summary.verified,0);assert.deepEqual(run,before);
  assert.equal(home.visits[0].actions[0].fromUrl,'https://product.test/');assert.equal(home.visits[0].actions[0].toUrl,'https://product.test/activities/42');
  assert.doesNotMatch(JSON.stringify(result),/token=private|email=private|#hidden/);
});
test('moments keep their own original time, exact frame, finding reference and omitted-cut state',()=>{
  const result=buildInsights({runs:[recorded()],inventory:inventory()}),home=result.screens.find(screen=>screen.id==='home'),activity=result.screens.find(screen=>screen.id==='activity');
  assert.equal(home.moments[0].originalMs,0);assert.equal(home.moments[0].replayMs,null);assert.equal(home.moments[0].screenshot,'/runs/run-1/s0.png');assert.deepEqual(home.moments[0].findingIds,['finding-run-1']);assert.equal(activity.moments[0].replayMs,500);assert.equal(activity.moments[1].aiFriction,null);assert.equal(activity.counts.aiFriction.unknown,1);assert.equal(activity.counts.aiFriction[0],1);
});
test('structured public feedback survives source projection while narration and malformed legacy metadata remain intact',()=>{
  const run=recorded(),feedback={kind:'friction',summary:'The next step is unclear.',why:'I cannot tell how to begin the activity.'};
  const note=parseExperienceNote({arguments:JSON.stringify({screen_observation:'The next step is unclear.',persona_note:'Where should I begin?',experience_feedback:feedback,valence:'negative'})});
  run.experience[0]={...run.experience[0],...note};
  run.experience[1].feedback={kind:'routine',summary:'',why:''};
  run.experience[2].feedback={kind:'benefit',summary:'Unsupported conclusion',why:''};
  const original=structuredClone(run),result=buildInsights({runs:[run],inventory:inventory()}),home=result.screens.find(screen=>screen.id==='home'),activity=result.screens.find(screen=>screen.id==='activity');
  assert.deepEqual(home.moments[0].feedback,feedback);assert.equal(home.moments[0].reaction,'Where should I begin?');assert.equal(home.moments[0].eventIndex,0);assert.equal(home.moments[0].originalMs,0);assert.equal(home.moments[0].screenshot,'/runs/run-1/s0.png');
  assert.deepEqual(activity.moments[0].feedback,{kind:'routine',summary:'',why:''});assert.equal(activity.moments[0].reaction,'Now I can start.');
  assert.equal(Object.hasOwn(activity.moments[1],'feedback'),false);assert.equal(activity.moments[1].reaction,'Reading the activity.');
  assert.deepEqual(run,original);
});
test('source journeys expose the saved name and leave unnamed history explicit',()=>{
  const named=recorded('named',{name:'Budget booking · Maya'}),unnamed=recorded('unnamed'),result=buildInsights({runs:[named,unnamed]});
  assert.equal(result.sourceRuns.find(run=>run.id==='named').name,'Budget booking · Maya');
  assert.equal(result.sourceRuns.find(run=>run.id==='unnamed').name,null);
});
test('action-linked legacy signals use the frame before that action, never a later screenshot',()=>{
  const run=recorded();run.experience=[{actionEventIndex:1,reaction:'Looking at the old screen'}];run.events[2].url='https://product.test/';run.events[4].url='https://product.test/';const result=buildInsights({runs:[run]});assert.equal(result.screens[0].moments[0].eventIndex,0);assert.equal(result.screens[0].moments[0].screenshot,'/runs/run-1/s0.png');
});
test('unreferenced signals and foreign screenshot paths do not become screen evidence',()=>{
  const run=recorded();run.experience.push({eventIndex:999,friction:3,valence:'very_negative',reaction:'unsupported'});run.events.push({index:8,type:'screenshot',url:'https://product.test/settings',screenshot:'/runs/another-run/fake.png'});
  const result=buildInsights({runs:[run],inventory:inventory()});assert.equal(result.summary.orphanSignals,1);assert.equal(result.screens.find(screen=>screen.id==='settings').status,'not_explored');assert.equal(result.lowMoments.some(moment=>moment.reaction==='unsupported'),false);
});
test('persona versions, rubric versions, device and environments remain explicit separate contexts',()=>{
  const second=recorded('run-2',{personaVersion:2,environmentVersion:2,viewport:{width:1440,height:900}});second.experience[0].rubricVersion='friction-v2';const result=buildInsights({runs:[recorded(),second],inventory:inventory()}),home=result.screens.find(screen=>screen.id==='home');assert.equal(home.contexts.length,2);assert.deepEqual(home.contexts.map(item=>item.context.personaVersion),[1,2]);assert.deepEqual(home.contexts.map(item=>item.context.rubricVersion),['legacy-unversioned-0-3','friction-v2']);assert.equal(home.counts.negativeRuns,2);assert.equal(home.counts.eligibleRuns,2);assert.equal(Object.hasOwn(home.counts,'satisfaction'),false);
});
test('build, persona, environment, device, flow and dates filter actual source runs',()=>{
  const a=recorded(),b=recorded('run-2',{personaId:'teacher',environmentId:'other-env',viewport:{width:1440,height:900},createdAt:'2026-10-30T12:00:00Z',productFingerprint:{'app.js':'build-b'}}),inventoryValue=inventory();const initial=buildInsights({runs:[a,b],inventory:inventoryValue});
  const filtered=buildInsights({runs:[a,b],inventory:inventoryValue,filters:{buildId:initial.sourceRuns[0].build.id,personaId:'parent',environmentId:'env',device:'mobile',flowId:'start',from:'2026-11-01',to:'2026-11-01'}});assert.deepEqual(filtered.sourceRuns.map(run=>run.id),['run-1']);assert.equal(filtered.denominator.screens,2);assert.equal(filtered.screens.length,2);
  assert.throws(()=>buildInsights({filters:{from:'invalid'}}),/valid from/);assert.throws(()=>buildInsights({filters:{from:'2026-11-02',to:'2026-11-01'}}),/precede/);
});
test('preview executions filter under the configured environment while builds and recorded sources stay distinct',()=>{
 const configuredEnvironment={id:'env',name:'Staging',version:1,versionId:'env-v1'};
 const preview=recorded('preview',{environmentId:'generated-preview',environmentVersion:1,environmentKind:'temporary',configuredEnvironment,executionInstance:{id:'preview-instance',kind:'fix-preview',environmentId:'env'},productFingerprint:{'app.js':'candidate'}});
 const production=recorded('prod',{environmentId:'prod',environmentName:'Production'}),original=structuredClone(preview);
 const result=buildInsights({runs:[recorded(),preview,production],inventory:inventory(),filters:{environmentId:'env'}});
 assert.deepEqual(result.sourceRuns.map(run=>run.id),['run-1','preview']);
 const source=result.sourceRuns.find(run=>run.id==='preview');
 assert.equal(source.environmentId,'env');assert.equal(source.environmentName,'Staging');assert.equal(source.recordedEnvironmentId,'generated-preview');assert.equal(source.executionInstance.id,'preview-instance');
 assert.equal(new Set(result.sourceRuns.map(run=>run.build.id)).size,2);
 assert.equal(result.screens.find(screen=>screen.id==='home').contexts.length,2);
 assert.deepEqual(preview,original);
 const unresolved=buildInsights({runs:[recorded('orphan',{environmentId:'orphan-temp',environmentKind:'temporary',configuredEnvironment:null})]});
 assert.equal(unresolved.sourceRuns[0].environmentId,'unknown');
});
test('invalidated evidence is excluded by default and inspection is explicitly untrusted',()=>{
  const bad=recorded('bad',{integrityStatus:'invalidated'}),normal=buildInsights({runs:[recorded(),bad]}),inspection=buildInsights({runs:[recorded(),bad],filters:{includeInvalidated:true}});assert.equal(normal.summary.eligibleRuns,1);assert.equal(normal.summary.excludedInvalidatedRuns,1);assert.equal(normal.sourceRuns.some(run=>run.id==='bad'),false);assert.equal(inspection.trust,'includes-invalidated');assert.equal(inspection.sourceRuns.length,2);assert.match(inspection.limitations.join(' '),/not trusted coverage/);
});
test('unadopted calibration trials do not contribute to active-product insight aggregates',()=>{
  const experiment=recorded('experiment',{experimental:true,calibrationStudyId:'study',experimentalCandidateId:'candidate'}),defaultView=buildInsights({runs:[recorded(),experiment]}),inspection=buildInsights({runs:[recorded(),experiment],filters:{includeExperimental:true}});
  assert.equal(defaultView.summary.eligibleRuns,1);assert.equal(defaultView.summary.excludedExperimentalRuns,1);assert.deepEqual(defaultView.excludedRuns[0].reasons,['experimental']);assert.equal(defaultView.sourceRuns.some(run=>run.id==='experiment'),false);
  assert.equal(inspection.trust,'includes-experimental');assert.equal(inspection.sourceRuns.length,2);assert.equal(inspection.sourceRuns.find(run=>run.id==='experiment').experimental,true);assert.match(inspection.limitations.join(' '),/not active-product coverage/);
  for(const flag of ['experimentalStudyId','calibrationStudyId','calibrationTrialId','experimentalCandidateId'])assert.equal(buildInsights({runs:[recorded('flag',{[flag]:'experiment'})]}).summary.eligibleRuns,0);
});
test('driver rejection and unfinished execution stay inconclusive instead of fabricating a product defect',()=>{
  const run=recorded('stopped',{status:'incomplete',findings:[],finding:null});run.events.push({index:5,type:'action_rejected',action:{type:'click_control',label:'Missing'},message:'Driver rejected coordinates'});const result=buildInsights({runs:[run],inventory:inventory()}),screen=result.screens.find(screen=>screen.id==='activity');assert.equal(screen.states.inconclusive,true);assert.equal(screen.counts.observed.rejectedActions,1);assert.equal(screen.counts.observed.blockedGoalRuns,0);assert.equal(screen.evaluations.length,0);assert.equal(screen.states.verified,false);
});
test('inventory versions preserve their source, denominator and old definitions',t=>{
  const {service}=setup(t),first=service.saveInventory({...inventory(),expectedVersion:0});const second=service.saveInventory({...inventory(),expectedVersion:1,name:'Expanded inventory',screens:[...inventory().screens,{id:'more',name:'More',routePattern:'/more'}]});assert.equal(first.version,1);assert.equal(second.version,2);assert.equal(service.getInventory('p',1).screens.length,3);assert.equal(service.getInventory('p').screens.length,4);assert.equal(service.listInventoryVersions('p').length,2);assert.throws(()=>service.saveInventory({...inventory(),expectedVersion:1}),error=>error.code==='VERSION_CONFLICT');assert.equal(service.getInventory('other'),null);
  assert.throws(()=>service.saveInventory({...inventory(),screens:[{name:'Unsafe',routePattern:'/secret?token=x'}]}),/without queries/);assert.throws(()=>service.saveInventory({...inventory(),screens:[{name:'Other',routePattern:'/',environmentIds:['not-in-project']}]}),/this app/);
});
test('reviewer scores require actual evidence and reasons, preserve AI, and revise immutably',t=>{
  const {service,put,runs}=setup(t);put(recorded());const original=structuredClone(runs.get('run-1'));
  const first=service.saveReview({projectId:'p',runId:'run-1',eventIndex:0,signalIndex:0,friction:0,reason:'The route is clear on this frame.',expectedVersion:0});assert.equal(first.friction,0);assert.equal(first.ai.friction,2);assert.equal(first.ai.valence,'negative');
  const next=service.saveReview({projectId:'p',runId:'run-1',eventIndex:0,signalIndex:0,friction:1,reason:'Some friction remains.',expectedVersion:1});assert.equal(next.version,2);assert.equal(next.supersedesId,first.id);assert.equal(service.listReviews('p').length,2);assert.deepEqual(runs.get('run-1'),original);
  const signal=service.experience({projectId:'p'}).screens.find(screen=>screen.routePattern==='/').moments[0];assert.equal(signal.aiFriction,2);assert.equal(signal.reviewerFriction,1);
  for(const invalid of [{eventIndex:999},{signalIndex:1},{friction:null},{friction:4},{reason:''},{projectId:'other'}])assert.throws(()=>service.saveReview({projectId:'p',runId:'run-1',eventIndex:0,signalIndex:0,friction:1,reason:'Review',...invalid}));
  assert.throws(()=>service.saveReview({projectId:'p',runId:'run-1',eventIndex:0,friction:1,reason:'Proof',outcome:'verified'}),/criterion/);
});
test('outcome verified requires an explicit criterion review and can be superseded without changing history',t=>{
  const {service,put}=setup(t);put(recorded());service.saveInventory(inventory());assert.equal(service.coverage({projectId:'p'}).summary.verified,0);
  const first=service.saveReview({projectId:'p',runId:'run-1',eventIndex:2,friction:0,reason:'The first activity instruction is visible.',criterion:'First step is visible',outcome:'verified'});assert.equal(service.coverage({projectId:'p'}).summary.verified,1);
  service.saveReview({projectId:'p',runId:'run-1',eventIndex:2,friction:1,reason:'The next prerequisite is not proven.',criterion:'First step is visible',outcome:'not_verified',expectedVersion:1});assert.equal(service.coverage({projectId:'p'}).summary.verified,0);assert.equal(service.listReviews('p').find(review=>review.id===first.id).outcome,'verified');
});
test('saved reports freeze inventory, selected source hashes, scores and sample counts',t=>{
  const {service,put}=setup(t);put(recorded());service.saveInventory(inventory());const report=service.saveReport({projectId:'p',name:'Before changes',kind:'experience'}),snapshot=structuredClone(report);
  service.saveInventory({...inventory(),screens:[...inventory().screens,{id:'extra',name:'Extra',routePattern:'/extra'}]});put(recorded('later'));service.saveReview({projectId:'p',runId:'run-1',eventIndex:0,signalIndex:0,friction:0,reason:'Human reassessment'});
  assert.deepEqual(service.getReport('p',report.id),snapshot);assert.equal(report.snapshot.denominator.screens,3);assert.equal(report.snapshot.sourceRuns.length,1);assert.equal(service.coverage({projectId:'p'}).denominator.screens,4);assert.equal(service.listReports('p')[0].inventoryVersion,1);assert.throws(()=>service.getReport('other',report.id),/not found/);
});
test('gap preparation creates only an unsaved charter proposal with source provenance',t=>{
  const {service,put,store}=setup(t);put(recorded());service.saveInventory(inventory());const before=store.db.prepare('SELECT COUNT(*) AS n FROM runs').get().n,proposal=service.gapCharter({projectId:'p',screenId:'settings',filters:{personaId:'parent'}});assert.equal(proposal.launched,false);assert.equal(proposal.requiresSave,true);assert.equal(proposal.provenance.coverageStatus,'not_explored');assert.deepEqual(proposal.draft.screens,['/settings']);assert.deepEqual(proposal.draft.personaIds,['parent']);assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM runs').get().n,before);assert.equal(Object.hasOwn(proposal.draft,'allowMutations'),false);
});

test('build filters share the canonical source identity used by Memory and Calibration',t=>{
  const db=new DatabaseSync(retainedDatabasePath('workspace-insights'));t.after(()=>db.close());const memory=createWorkspaceMemory({db}),a=recorded('a',{buildId:'ignored-when-fingerprint-exists',productFingerprint:{'z.js':'z','a.js':'a'}}),b=recorded('b',{productFingerprint:{'a.js':'a','z.js':'z'}}),buildId=memory.buildIdentity(a);
  const result=buildInsights({runs:[a,b],filters:{buildId}});assert.equal(result.sourceRuns.length,2);assert.equal(result.sourceRuns[0].build.id,buildId);assert.equal(result.sourceRuns[1].build.id,memory.buildIdentity(b));
});

function stateInventory(){return {...inventory(),screens:[{id:'empty',name:'Empty activity',routePattern:'/activities/:id',state:'empty',device:'mobile',criteria:[{id:'empty-help',text:'An explanation is visible',source:'Product review'}]},{id:'filled',name:'Filled activity',routePattern:'/activities/:id',state:'filled',device:'mobile',criteria:[]}]};}
const stateRequest=(eventIndex,state,extra={})=>({projectId:'p',runId:'run-1',eventIndex,state,reason:'The selected screenshot visibly shows this state.',expectedVersion:0,sourceHash:buildInsights({runs:[recorded()]}).screens.flatMap(s=>s.sourceRefs).find(ref=>ref.eventIndex===eventIndex)?.sourceHash,...extra});
test('reviewed states match only their exact screenshots and never turn a state label into verified coverage',t=>{
  const {service,put,runs,store}=setup(t),run=recorded();run.events.push({index:5,type:'screenshot',url:'https://product.test/activities/42',screenshot:'/runs/run-1/s5.png',videoMs:4000});put(run);service.saveInventory(stateInventory());
  const original=structuredClone(runs.get(run.id));store.memory=new Proxy({}, {get(){throw Error('Insights must not publish or retrieve persona memory.');}});
  const initial=service.coverage({projectId:'p'});assert.equal(initial.screens.find(s=>s.id==='empty').status,'not_explored');assert.equal(initial.screens.find(s=>s.id==='filled').status,'not_explored');
  const empty=service.saveScreenState(stateRequest(2,'empty')),filled=service.saveScreenState(stateRequest(4,'filled')),result=service.coverage({projectId:'p'});
  assert.deepEqual(result.screens.find(s=>s.id==='empty').sourceRefs.map(s=>s.eventIndex),[2]);assert.deepEqual(result.screens.find(s=>s.id==='filled').sourceRefs.map(s=>s.eventIndex),[4]);
  const unknown=result.screens.find(s=>!s.inInventory&&s.routePattern==='/activities/42');assert.deepEqual(unknown.sourceRefs.map(s=>s.eventIndex),[5]);assert.equal(unknown.sourceRefs[0].stateObservation.kind,'unknown');
  assert.equal(result.screens.find(s=>s.id==='empty').states.verified,false);assert.equal(result.screens.find(s=>s.id==='empty').states.evaluated,false);assert.equal(result.summary.verified,0);
  assert.equal(empty.source.screenshot,'/runs/run-1/s2.png');assert.equal(filled.source.originalMs,3000);assert.equal(result.screens.find(s=>s.id==='empty').sourceRefs[0].stateObservation.id,empty.id);assert.deepEqual(runs.get(run.id),original);
});
test('state corrections append versions, unknown stays unknown and frozen reports retain exact earlier assignments',t=>{
  const {service,put}=setup(t);put(recorded());service.saveInventory(stateInventory());
  const first=service.saveScreenState(stateRequest(2,'empty')),report=service.saveReport({projectId:'p',name:'Observed empty frame',kind:'coverage'}),snapshot=structuredClone(report);
  const second=service.saveScreenState(stateRequest(2,'filled',{expectedVersion:1,reason:'Correction: an activity is already present.'}));assert.equal(second.version,2);assert.equal(second.supersedesId,first.id);assert.equal(service.coverage({projectId:'p'}).screens.find(s=>s.id==='empty').status,'not_explored');
  assert.throws(()=>service.saveScreenState(stateRequest(2,'empty',{expectedVersion:1})),e=>e.code==='VERSION_CONFLICT');
  const cleared=service.saveScreenState(stateRequest(2,null,{expectedVersion:2,reason:'The content is too small to confidently identify.'}));assert.equal(cleared.version,3);
  const result=service.coverage({projectId:'p'}),unknown=result.screens.find(s=>!s.inInventory&&s.sourceRefs.some(ref=>ref.eventIndex===2));assert.equal(unknown.state,null);assert.equal(unknown.sourceRefs[0].stateObservation.state,null);assert.equal(result.screens.find(s=>s.id==='filled').status,'not_explored');
  assert.equal(service.listScreenStates('p',{runId:'run-1'}).length,3);assert.equal(service.listScreenStates('other').length,0);assert.deepEqual(service.getReport('p',report.id),snapshot);assert.equal(report.snapshot.stateAssignments[0].id,first.id);assert.equal(report.snapshot.stateAssignments[0].version,1);
});
test('state assignment validates ownership, actual terminal evidence, reason, version and bounded labels',t=>{
  const {service,put}=setup(t);put(recorded());
  for(const invalid of [{projectId:'other'},{runId:'missing'},{eventIndex:1},{eventIndex:999},{eventIndex:'2'},{state:undefined},{state:''},{state:'x'.repeat(301)},{reason:''},{reason:'x'.repeat(4001)},{expectedVersion:undefined},{expectedVersion:-1},{sourceHash:'outdated-source'}])assert.throws(()=>service.saveScreenState(stateRequest(2,'empty',invalid)));
  for(const status of ['queued','running','finalizing','cancelling']){put(recorded('active',{status}));assert.throws(()=>service.saveScreenState(stateRequest(2,'empty',{runId:'active'})),e=>e.code==='RUN_ACTIVE');}
  put(recorded('invalid',{integrityStatus:'invalidated'}));assert.throws(()=>service.saveScreenState(stateRequest(2,'empty',{runId:'invalid'})),e=>e.code==='INVALIDATED_EVIDENCE');assert.equal(service.listScreenStates('p').length,0);
});
test('an assignment cannot silently transfer to replaced screenshot evidence',t=>{
  const {service,put}=setup(t);put(recorded());service.saveInventory(stateInventory());const assignment=service.saveScreenState(stateRequest(2,'empty')),report=service.saveReport({projectId:'p',name:'Original evidence'});
  const replaced=recorded();replaced.events[2].screenshot='/runs/run-1/replaced.png';put(replaced);
  const result=service.coverage({projectId:'p'});assert.equal(result.screens.find(s=>s.id==='empty').status,'not_explored');assert.equal(result.screens.find(s=>!s.inInventory&&s.routePattern==='/activities/42').sourceRefs[0].stateObservation.kind,'unknown');
  assert.equal(service.listScreenStates('p')[0].source.screenshot,assignment.source.screenshot);assert.equal(service.getReport('p',report.id).snapshot.screens.find(s=>s.id==='empty').sourceRefs[0].screenshot,'/runs/run-1/s2.png');
});
