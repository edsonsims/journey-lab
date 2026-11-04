import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { createWorkspaceStore } from './workspace-store.mjs';
import { createWorkspaceApi } from './workspace-api.mjs';
import { DEVICE_PRESETS, NETWORK_PRESETS, cleanDeviceProfile, cleanNetworkProfile } from './device-profiles.mjs';

async function setup(t){const root=await mkdtemp(join(tmpdir(),'journey-devices-'));const store=createWorkspaceStore({root});t.after(()=>store.close());return {root,store};}
const launch={charterId:'first-value',personaId:'mother',environmentId:'little-steps-local'};

test('every supplied device and network preset is executable by supported schema',()=>{
  assert.ok(DEVICE_PRESETS.length>=6);
  for(const preset of DEVICE_PRESETS){const profile=cleanDeviceProfile(preset);assert.equal(profile.browser,'chromium');assert.ok(profile.viewport.width>0);}
  for(const profile of NETWORK_PRESETS)assert.deepEqual(cleanNetworkProfile(profile),{offline:profile.offline,latencyMs:profile.latencyMs,downloadMbps:profile.downloadMbps,uploadMbps:profile.uploadMbps,presetId:profile.presetId});
  assert.throws(()=>cleanDeviceProfile({browser:'webkit'}),/Chromium/);
  assert.throws(()=>cleanDeviceProfile({viewport:{width:NaN,height:800}}),/width/);
  assert.throws(()=>cleanDeviceProfile({hasTouch:'true'}),/true or false/);
  assert.throws(()=>cleanNetworkProfile({downloadMbps:0}),/greater than zero/);
  assert.throws(()=>cleanNetworkProfile({latencyMs:-1}),/Latency/);
});

test('personas retain several devices and exactly one primary; references stay in project',async t=>{
  const {store}=await setup(t),devices=store.listEntities('device','little-steps'),first=devices[0],second=devices[1];
  const saved=store.saveEntity('persona',{deviceIds:[first.id,second.id],primaryDeviceId:second.id},'mother');
  assert.deepEqual(saved.deviceIds,[first.id,second.id]);assert.equal(saved.primaryDeviceId,second.id);
  assert.equal(store.buildRun(launch).deviceId,second.id);
  assert.equal(store.buildRun({...launch,deviceId:first.id}).deviceId,first.id);
  assert.throws(()=>store.saveEntity('persona',{deviceIds:[],primaryDeviceId:first.id},'mother'),/at least one/);
  assert.throws(()=>store.saveEntity('persona',{deviceIds:[first.id],primaryDeviceId:second.id},'mother'),/primary device/);
  const other=store.saveProject({name:'Other product'}),foreign=store.listEntities('device',other.id)[0];
  assert.throws(()=>store.saveEntity('persona',{deviceIds:[foreign.id],primaryDeviceId:foreign.id},'mother'),/this app/);
  assert.throws(()=>store.buildRun({...launch,deviceId:foreign.id}),/unavailable/);
  const foreignNetwork=store.listEntities('network-profile',other.id)[0];
  assert.throws(()=>store.buildRun({...launch,networkProfileId:foreignNetwork.id}),/unavailable/);
});

test('device and network definitions are pinned on runs, summaries and retries across edit/archive',async t=>{
  const {store}=await setup(t),device=store.listEntities('device','little-steps').find(x=>x.presetId==='Pixel 7'),network=store.listEntities('network-profile','little-steps').find(x=>x.presetId==='slow-mobile');
  const run=store.buildRun({...launch,deviceId:device.id,networkProfileId:network.id});store.syncRun({...run,status:'failed'});
  store.saveEntity('device',{name:'Changed phone',viewport:{width:500,height:900},expectedVersion:device.version},device.id);
  store.saveEntity('network-profile',{name:'Changed connection',latencyMs:999},network.id);
  store.archiveEntity('device',device.id);store.archiveEntity('network-profile',network.id);
  for(const recorded of [store.getRun(run.id),store.getRun(run.id,{summary:true}),store.buildRetry(run.id)]){
    assert.equal(recorded.deviceName,device.name);assert.deepEqual(recorded.deviceSnapshot.viewport,device.viewport);
    assert.equal(recorded.networkProfileSnapshot.latencyMs,150);assert.equal(recorded.networkProfileName,network.name);
  }
  assert.throws(()=>store.buildRun({...launch,deviceId:device.id}),/unavailable/);
  assert.throws(()=>store.buildRun({...launch,networkProfileId:network.id}),/unavailable/);
});

test('unused profile CRUD is version checked; used history cannot be deleted',async t=>{
  const {store}=await setup(t),device=store.saveEntity('device',{name:'Custom phone',category:'phone',viewport:{width:400,height:800}});
  assert.equal(device.canDelete,true);
  const updated=store.saveEntity('device',{name:'Renamed',expectedVersion:1},device.id);
  assert.throws(()=>store.deleteEntity('device',device.id,{expectedVersion:1}),/changed/);
  assert.throws(()=>store.deleteEntity('device',device.id,{}),/current version/);
  const copy=store.duplicateEntity('device',device.id,{expectedVersion:updated.version});assert.notEqual(copy.id,device.id);
  assert.deepEqual(store.deleteEntity('device',copy.id,{expectedVersion:copy.version}),{id:copy.id,deleted:true});assert.equal(store.getEntity('device',copy.id),null);
  store.saveEntity('persona',{deviceIds:[device.id],primaryDeviceId:device.id},'mother');
  store.saveEntity('persona',{deviceIds:[store.getEntity('persona','teacher').primaryDeviceId],primaryDeviceId:store.getEntity('persona','teacher').primaryDeviceId},'mother');
  assert.equal(store.getEntity('device',device.id).usage.personas,0);assert.ok(store.getEntity('device',device.id).usage.historicalReferences>0);
  assert.throws(()=>store.deleteEntity('device',device.id,{expectedVersion:updated.version}),/Archive/);
  const network=store.saveEntity('network-profile',{name:'Custom connection',latencyMs:25,downloadMbps:2,uploadMbps:1});
  const run=store.buildRun({...launch,networkProfileId:network.id});store.syncRun({...run,status:'finished'});
  assert.equal(store.getEntity('network-profile',network.id).usage.runs,1);
  assert.throws(()=>store.deleteEntity('network-profile',network.id,{expectedVersion:network.version}),/Archive/);
  assert.equal(store.archiveEntity('network-profile',network.id).archived,true);
});

test('migration adds persona versions without rewriting historical run data or source bytes',async t=>{
  const root=await mkdtemp(join(tmpdir(),'journey-device-migration-')),runsDir=join(root,'runs');await mkdir(runsDir);
  let store=createWorkspaceStore({root:join(root,'state'),runsDir});
  const old=store.getEntity('persona','mother'),oldData={...old,viewport:{width:390,height:844}};
  for(const key of ['deviceIds','primaryDeviceId','networkProfileId'])delete oldData[key];
  const originalPersona=JSON.stringify(oldData);store.db.prepare("UPDATE entity_versions SET data=? WHERE kind='persona' AND id='mother' AND version=?").run(originalPersona,old.version);
  const id=randomUUID(),run={id,projectId:'little-steps',status:'finished',createdAt:'2026-10-30T00:00:00Z',personaId:'mother',persona:{name:'Historical mother',viewport:{width:390,height:844}},viewport:{width:390,height:844},target:'http://127.0.0.1:4320/',events:[],experience:[]};
  const dir=join(runsDir,id);await mkdir(dir);const path=join(dir,'run.json'),source=JSON.stringify(run);await writeFile(path,source);await store.importLegacyRuns();
  const recordedBytes=store.db.prepare('SELECT data FROM runs WHERE id=?').get(id).data;store.close();
  store=createWorkspaceStore({root:join(root,'state'),runsDir});t.after(()=>store.close());
  const migrated=store.getEntity('persona','mother'),device=store.getEntity('device',migrated.primaryDeviceId);
  assert.equal(migrated.version,old.version+1);assert.equal(device.legacyViewport,true);assert.equal(device.isMobile,false);assert.equal(device.hasTouch,false);assert.equal(device.deviceScaleFactor,1);assert.deepEqual(device.viewport,run.viewport);
  assert.equal(store.db.prepare("SELECT data FROM entity_versions WHERE kind='persona' AND id='mother' AND version=?").get(old.version).data,originalPersona);
  assert.equal(store.db.prepare('SELECT data FROM runs WHERE id=?').get(id).data,recordedBytes);assert.equal(await readFile(path,'utf8'),source);
  assert.equal(store.getRun(id).deviceSnapshot,undefined);assert.deepEqual(store.getRun(id,{summary:true}).viewport,run.viewport);
});

test('deleted unused presets do not reappear after reopening the project',async t=>{
  const root=await mkdtemp(join(tmpdir(),'journey-device-delete-'));let store=createWorkspaceStore({root});
  const device=store.listEntities('device','little-steps').find(x=>x.presetId==='Pixel 7');store.deleteEntity('device',device.id,{expectedVersion:device.version});store.close();
  store=createWorkspaceStore({root});t.after(()=>store.close());assert.equal(store.getEntity('device',device.id),null);
});

test('API exposes CRUD, per-persona selections and config-aware launch idempotency',async t=>{
  const root=await mkdtemp(join(tmpdir(),'journey-device-api-'));let api;const launched=[];
  const server=http.createServer(async(req,res)=>{if(!await api.handle(req,res,new URL(req.url,'http://127.0.0.1'))){res.writeHead(404);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port,origin=`http://127.0.0.1:${port}`;
  api=createWorkspaceApi({root,port,configured:()=>true,launchRun:async run=>{launched.push(run);return run;}});t.after(()=>{server.close();api.close();});
  const request=(path,method='GET',body,extra={})=>fetch(`${origin}/api/workspace${path}`,{method,headers:{'content-type':'application/json',origin,...extra},body:body?JSON.stringify(body):undefined});
  const bootstrap=await (await request('/bootstrap')).json();assert.ok(bootstrap.devices.length);assert.equal(bootstrap.networkProfiles.length,4);assert.ok(bootstrap.devicePresets.length);
  const devices=bootstrap.devices.filter(x=>!x.archived),network=bootstrap.networkProfiles.find(x=>x.presetId==='slow-mobile');
  const input={projectId:'little-steps',charterId:'first-value',environmentId:'little-steps-local',personaIds:['mother','teacher'],deviceSelections:{mother:devices[0].id,teacher:devices[1].id},networkProfileId:network.id};
  assert.equal((await request('/runs','POST',input,{'idempotency-key':'devices-batch'})).status,202);
  assert.equal(launched[0].deviceId,devices[0].id);assert.equal(launched[1].deviceId,devices[1].id);assert.ok(launched.every(x=>x.networkProfileId===network.id));
  assert.equal((await request('/runs','POST',{...input,networkProfileId:bootstrap.networkProfiles[0].id},{'idempotency-key':'devices-batch'})).status,409);
  const created=await (await request('/devices','POST',{name:'API device',projectId:'little-steps'})).json();
  assert.equal((await request(`/devices/${created.id}`,'DELETE',{projectId:'little-steps',expectedVersion:created.version})).status,200);
  assert.equal((await request(`/devices/${devices[0].id}`,'DELETE',{projectId:'little-steps',expectedVersion:devices[0].version})).status,409);
  assert.equal((await request('/environments/little-steps-local','DELETE')).status,405);
});
