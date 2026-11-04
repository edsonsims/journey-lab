import {retainedDatabasePath} from './retained-test-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {createWorkspaceInsightsApi} from './workspace-insights-api.mjs';
import {WorkspaceError} from './workspace-store.mjs';

async function setup(t){
  const db=new DatabaseSync(retainedDatabasePath('workspace-insights-api'));db.exec("CREATE TABLE runs(id TEXT PRIMARY KEY,project_id TEXT,created_at TEXT); INSERT INTO runs VALUES('r','p','2026-11-01')");
  const run={id:'r',projectId:'p',personaId:'parent',personaVersion:1,environmentId:'e',environmentVersion:1,status:'finished',createdAt:'2026-11-01',integrityStatus:'recorded',viewport:{width:390,height:844},events:[{index:0,type:'screenshot',url:'https://product.test/',screenshot:'/runs/r/frame.png',videoMs:0}],experience:[{eventIndex:0,videoMs:0,valence:'negative',friction:2,reaction:'Cannot find the next step.'}],findings:[],video:'/runs/r/video.webm'};
  const store={db,requireProject:id=>{if(!['p','other'].includes(id))throw new WorkspaceError('Unknown project.',404);},getEntity:(kind,id)=>kind==='environment'&&id==='e'?{id,projectId:'p'}:null,getRun:id=>id==='r'?structuredClone(run):null};
  let api;const server=http.createServer(async(req,res)=>{if(!await api.handle(req,res,new URL(req.url,'http://127.0.0.1'))){res.writeHead(404);res.end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port,origin=`http://127.0.0.1:${port}`;api=createWorkspaceInsightsApi({store,port});
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});
  const request=async(path,{method='GET',body,requestOrigin=origin}={})=>{const response=await fetch(`${origin}/api/workspace/insights${path}`,{method,headers:{origin:requestOrigin,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json()};};
  const inventory={projectId:'p',name:'Known screens',scope:'First view',source:{kind:'curated',reference:'Product route list'},completeness:'partial',flows:[],screens:[{id:'home',name:'Home',routePattern:'/',environmentIds:['e']},{id:'other',name:'Other screen',routePattern:'/other'}]};
  return {api,store,request,inventory};
}

test('Insights API returns honest observed-only coverage and immutable inventory versions',async t=>{
  const {request,inventory}=await setup(t);const observed=await request('/coverage?projectId=p');assert.equal(observed.status,200);assert.equal(observed.body.denominator,null);assert.equal(observed.body.summary.observedScreens,1);
  const first=await request('/inventory',{method:'POST',body:{...inventory,expectedVersion:0}});assert.equal(first.status,201);assert.equal(first.body.version,1);
  const second=await request('/inventory?projectId=p',{method:'POST',body:{...inventory,expectedVersion:1,name:'Second inventory'}});assert.equal(second.body.version,2);
  assert.equal((await request('/inventory?projectId=p&inventoryVersion=1')).body.inventory.name,'Known screens');assert.equal((await request('/inventory/versions?projectId=p')).body.versions.length,2);
  assert.equal((await request('/coverage?projectId=p&inventoryVersion=1')).body.denominator.inventoryVersion,1);
  assert.equal((await request('/inventory',{method:'POST',body:{...inventory,expectedVersion:0}})).status,409);
});
test('API project/origin/keep-all guards apply before service mutations',async t=>{
  const {request,store,inventory}=await setup(t);
  assert.equal((await request('/coverage')).body.code,'PROJECT_REQUIRED');
  assert.equal((await request('/coverage?projectId=missing')).status,404);
  assert.equal((await request('/inventory?projectId=other',{method:'POST',body:inventory})).body.code,'PROJECT_MISMATCH');
  assert.equal((await request('/inventory',{method:'POST',body:inventory,requestOrigin:'https://foreign.test'})).body.code,'ORIGIN_DENIED');
  assert.equal((await request('/inventory?projectId=p',{method:'DELETE'})).body.code,'KEEP_ALL');
  assert.equal((await request('/inventory',{method:'POST',body:[]})).status,400);
  assert.equal((await request('/inventory',{method:'POST',body:{...inventory,scope:'x'.repeat(1048577)}})).status,413);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM insight_inventory_versions').get().n,0);
});
test('screen detail, reviews and moment traces preserve recorded AI scores and enforce ownership',async t=>{
  const {request,inventory}=await setup(t);await request('/inventory',{method:'POST',body:inventory});
  const initial=await request('/screens/home?projectId=p');assert.equal(initial.status,200);assert.equal(initial.body.screen.moments[0].originalMs,0);assert.equal(initial.body.screen.moments[0].aiFriction,2);
  const review=await request('/reviews',{method:'POST',body:{projectId:'p',runId:'r',eventIndex:0,signalIndex:0,friction:1,reason:'The control is present but hard to discover.'}});assert.equal(review.status,201);assert.equal(review.body.ai.friction,2);
  const changed=await request('/experience?projectId=p');assert.equal(changed.body.screens.find(screen=>screen.id==='home').moments[0].reviewerFriction,1);assert.equal((await request('/reviews?projectId=p&runId=r')).body.reviews.length,1);
  assert.equal((await request('/reviews',{method:'POST',body:{projectId:'other',runId:'r',eventIndex:0,friction:2,reason:'Wrong scope'}})).status,404);
  assert.equal((await request('/reviews',{method:'POST',body:{projectId:'p',runId:'r',eventIndex:9,friction:2,reason:'Fake frame'}})).status,400);
});
test('reports retain their selected denominator and gap routes only prepare unsaved charters',async t=>{
  const {request,inventory,store}=await setup(t);await request('/inventory',{method:'POST',body:inventory});
  const report=await request('/reports',{method:'POST',body:{projectId:'p',name:'Initial review',kind:'coverage',inventoryVersion:1}});assert.equal(report.status,201);assert.equal(report.body.snapshot.denominator.screens,2);
  await request('/inventory',{method:'POST',body:{...inventory,screens:inventory.screens.slice(0,1),expectedVersion:1}});
  const frozen=await request(`/reports/${report.body.id}?projectId=p`);assert.deepEqual(frozen.body,report.body);assert.equal((await request(`/reports/${report.body.id}?projectId=other`)).status,404);assert.equal((await request('/reports?projectId=p')).body.reports[0].inventoryVersion,1);
  const gap=await request('/screens/other/charter?projectId=p&inventoryVersion=1');assert.equal(gap.body.requiresSave,true);assert.equal(gap.body.launched,false);assert.deepEqual(gap.body.draft.screens,['/other']);assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM runs').get().n,1);
});

test('screen-state HTTP assignments are scoped, source-bound and append-only',async t=>{
 const {request,store}=await setup(t),before=store.getRun('r');
 const body={projectId:'p',runId:'r',eventIndex:0,state:'empty',reason:'The recorded screen contains no activity yet.',expectedVersion:0,sourceHash:(await request('/coverage?projectId=p')).body.screens[0].sourceRefs[0].sourceHash};
 const first=await request('/screen-states',{method:'POST',body});assert.equal(first.status,201);assert.equal(first.body.source.screenshot,'/runs/r/frame.png');assert.equal(first.body.source.originalMs,0);assert.equal(first.body.reviewer,'local-user');
 assert.equal((await request('/screen-states?projectId=p&runId=r')).body.assignments.length,1);assert.equal((await request('/screen-states?projectId=other&runId=r')).body.assignments.length,0);
 assert.equal((await request('/screen-states',{method:'POST',body})).status,409);assert.equal((await request('/screen-states',{method:'POST',body:{...body,projectId:'other'}})).status,404);assert.equal((await request('/screen-states',{method:'POST',body:{...body,eventIndex:9}})).status,400);
 assert.equal((await request('/screen-states',{method:'POST',body,requestOrigin:'https://foreign.test'})).status,403);
 const clear=await request('/screen-states',{method:'POST',body:{...body,state:null,expectedVersion:1,reason:'Cannot determine state from this image.'}});assert.equal(clear.status,201);assert.equal(clear.body.version,2);assert.equal(clear.body.supersedesId,first.body.id);assert.deepEqual(store.getRun('r'),before);
 assert.equal((await request('/screen-states?projectId=p',{method:'DELETE'})).body.code,'KEEP_ALL');
});
