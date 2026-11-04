import {retainedFixture} from './retained-test-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { join } from 'node:path';
import { createWorkspaceStore } from './workspace-store.mjs';
import { createWorkspaceCalibrationApi } from './workspace-calibration-api.mjs';

async function setup(t){
 const root=await retainedFixture('journey-calibration-http-'),store=createWorkspaceStore({root:join(root,'workspace')});let api;
 const server=http.createServer(async(req,res)=>{if(!await api.handle(req,res,new URL(req.url,'http://127.0.0.1'))){res.writeHead(404);res.end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=server.address().port,origin=`http://127.0.0.1:${port}`;api=createWorkspaceCalibrationApi({root:join(root,'calibration'),store,port});
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));await api.close();store.close();});
 const request=async(path,method='GET',input,requestOrigin=origin)=>{const response=await fetch(`${origin}/api/workspace/calibration${path}`,{method,headers:{origin:requestOrigin,'content-type':'application/json'},...(input===undefined?{}:{body:JSON.stringify(input)})});return {status:response.status,data:await response.json()};};
 const run=store.buildRun({personaId:'mother',charterId:'first-value',environmentId:'little-steps-local'});store.syncRun({...run,status:'finished',productFingerprint:{'app.js':'a'.repeat(64)},finding:{outcome:'goal_reached'},events:[{index:0,type:'screenshot',screenshot:`/runs/${run.id}/initial.png`,url:run.target}]});
 const buildId=store.memory.buildIdentity(store.getRun(run.id)),at=new Date().toISOString(),datasetInput={projectId:'little-steps',name:'Imported fixture',source:{kind:'fixture',label:'HTTP fixture'},events:Array.from({length:8},(_,i)=>({sessionId:`visitor-${i}`,event:'done',at,environmentId:'little-steps-local',buildId,traffic:'human',cohort:{},sessionEnded:true}))};
 return {store,api,request,run,buildId,datasetInput};
}

test('calibration HTTP import/mapping/study endpoints preserve versions and compact frozen study presentations',async t=>{
 const f=await setup(t),dataset=await f.request('/datasets','POST',f.datasetInput);assert.equal(dataset.status,201);assert.equal(dataset.data.version,1);
 const mapping=await f.request('/mappings','POST',{projectId:'little-steps',name:'Completion mapping',metrics:[{id:'complete',kind:'goal_complete',realEvent:'done',synthetic:{type:'outcome',value:'goal_reached'}}]});assert.equal(mapping.status,201);
 const study=await f.request('/studies','POST',{projectId:'little-steps',name:'Frozen controls',datasetId:dataset.data.id,mappingId:mapping.data.id,personaId:'mother',charterId:'first-value',environmentId:'little-steps-local',buildId:f.buildId,cohort:{},personaCohort:{},timeWindow:{from:new Date(Date.now()-86400000).toISOString(),to:new Date(Date.now()+1000).toISOString()},runIds:[f.run.id]});assert.equal(study.status,201);assert.equal(study.data.datasetSnapshot.events,undefined);assert.equal(study.data.baselineRuns[0].events,undefined);assert.equal(study.data.externalAcceptance,'real_data_required');
 const id=study.data.id,comparison=await f.request(`/studies/${id}/compare`,'POST',{expectedVersion:study.data.version});assert.equal(comparison.status,200);assert.equal(comparison.data.comparison.metrics[0].status,'not_comparable');
 const renamed=await f.request(`/datasets/${dataset.data.id}`,'PATCH',{name:'Later name',expectedVersion:1});assert.equal(renamed.data.version,2);
 assert.equal((await f.request(`/datasets/${dataset.data.id}/versions`)).data.versions.length,2);assert.equal((await f.request(`/studies/${id}`)).data.datasetSnapshot.name,'Imported fixture');
 const overview=await f.request('/overview?projectId=little-steps');assert.equal(overview.data.datasets[0].events,undefined);assert.equal(overview.data.studies.length,1);assert.deepEqual(overview.data.activeStudyIds,[]);
 const baselines=await f.request('/baselines?projectId=little-steps');assert.equal(baselines.data.baselines[0].buildId,f.buildId);assert.equal(baselines.data.baselines[0].personaVersionId,f.run.personaVersionId);
 assert.equal((await f.request(`/studies/${id}/start`,'POST',{})).data.code,'CALIBRATION_RUNTIME_REQUIRED');
});

test('calibration HTTP rejects cross-project, cross-origin, invalid and destructive actions without mutation',async t=>{
 const f=await setup(t),dataset=await f.request('/datasets','POST',f.datasetInput),other=f.store.saveProject({name:'Another project'});
 assert.equal((await f.request(`/datasets/${dataset.data.id}?projectId=${other.id}`)).data.code,'PROJECT_MISMATCH');
 assert.equal((await f.request(`/datasets/${dataset.data.id}`,'PATCH',{projectId:other.id,name:'Moved'})).data.code,'PROJECT_MISMATCH');
 assert.equal((await f.request('/datasets','POST',f.datasetInput,'https://untrusted.test')).status,403);
 assert.equal((await f.request(`/datasets/${dataset.data.id}`,'DELETE')).data.code,'KEEP_ALL');
 assert.equal((await f.request(`/datasets/${dataset.data.id}?version=1.2`)).data.code,'INVALID_VERSION');
 const tooLarge=await f.request('/datasets','POST',{...f.datasetInput,name:'x'.repeat(2_000_000)});assert.equal(tooLarge.status,413);assert.equal(tooLarge.data.code,'IMPORT_TOO_LARGE');
 assert.equal(f.api.service.listDatasets('little-steps').length,1);assert.equal(f.api.service.listStudies('little-steps').length,0);
});
