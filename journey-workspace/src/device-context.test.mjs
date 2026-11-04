import test from 'node:test';
import assert from 'node:assert/strict';
import {recordedDevice,recordedNetwork,deviceDetails,networkSummary,primaryDevice,personaDeviceIds,recordedInput} from './device-context.ts';

test('recorded device and connection use immutable run snapshots over mutable-looking labels',()=>{
 const run={deviceName:'Renamed phone',deviceVersion:4,viewport:{width:1400,height:900},deviceSnapshot:{name:'Original phone',version:2,viewport:{width:390,height:844},isMobile:true,hasTouch:true},networkProfileName:'New network',networkProfileSnapshot:{name:'Slow mobile',latencyMs:180,downloadMbps:1.5,uploadMbps:0.5}};
 assert.equal(recordedDevice(run).name,'Original phone');assert.equal(recordedDevice(run).version,2);assert.deepEqual(recordedDevice(run).viewport,{width:390,height:844});assert.equal(recordedNetwork(run).name,'Slow mobile');
 const before=structuredClone(run);deviceDetails(recordedDevice(run),recordedNetwork(run));assert.deepEqual(run,before);
});
test('legacy viewport stays explicitly historical and never gains phone emulation',()=>{
 const device=recordedDevice({viewport:{width:390,height:844},persona:{viewport:{width:1280,height:800}}});
 assert.equal(device.name,'Legacy 390 × 844');assert.equal(device.isMobile,false);assert.equal(device.hasTouch,false);assert.equal(device.deviceScaleFactor,1);
 assert.equal(deviceDetails(device).find(row=>row.label==='Mode').value,'Historical viewport-only session');
 assert.equal(recordedNetwork({}).unrecorded,true);
 assert.equal(recordedDevice({}).name,'Device not recorded');
});
test('missing named snapshot is not silently reconstructed as a new device',()=>{
 const device=recordedDevice({deviceId:'phone',deviceName:'Old phone',deviceVersion:3});
 assert.equal(device.name,'Old phone');assert.equal(device.missingSnapshot,true);assert.equal(deviceDetails(device).find(row=>row.label==='Input capability').value,'Not recorded');
});

test('input used is grounded in executed actions rather than laptop capabilities or persona names',()=>{
 const run={personaName:'Keyboard access',deviceSnapshot:{name:'Laptop',hasTouch:false},events:[{type:'action',action:{type:'keypress'}},{type:'action',action:{type:'type'}},{type:'action_rejected',action:{type:'click'}},{type:'action',action:{type:'wait'}}]};
 const original=structuredClone(run);
 assert.equal(recordedInput(run),'Keyboard only');
 assert.equal(deviceDetails(recordedDevice(run),undefined,run).find(row=>row.label==='Input used').value,'Keyboard only');
 assert.equal(deviceDetails(recordedDevice(run)).find(row=>row.label==='Input capability').value,'Mouse and keyboard');
 assert.deepEqual(run,original);
 assert.equal(recordedInput({...run,events:[...run.events,{type:'action',action:{type:'click'}}]}),'Mouse + Keyboard');
 assert.equal(recordedInput({personaName:'Keyboard access',deviceSnapshot:run.deviceSnapshot}),'Not recorded');
 assert.equal(recordedInput({events:[]}),'No input recorded');
});
test('compact action evidence preserves touch, mixed and programmatic input without claiming keyboard-only',()=>{
 assert.equal(recordedInput({recordedActionTypes:['keypress','type','wait']}),'Keyboard only');
 assert.equal(recordedInput({recordedActionTypes:['click','type'],deviceSnapshot:{hasTouch:true}}),'Touch + Keyboard');
 assert.equal(recordedInput({recordedActionTypes:['click'],deviceSnapshot:{hasTouch:true},browserExecution:{device:{hasTouch:false}}}),'Mouse');
 assert.equal(recordedInput({recordedActionTypes:['keypress','select_option']}),'Keyboard + Programmatic selection');
 assert.equal(recordedInput({recordedActionTypes:['keypress','unknown']}),'Keyboard + Other input');
 assert.equal(recordedInput({events:[],recordedActionTypes:['keypress']}),'No input recorded');
});
test('network summaries distinguish unlimited, explicit latency and offline scenarios',()=>{
 assert.equal(networkSummary({latencyMs:0,downloadMbps:null,uploadMbps:null}),'Unlimited down · Unlimited up · 0 ms latency');
 assert.equal(networkSummary({latencyMs:150,downloadMbps:1.5,uploadMbps:0.5}),'1.5 Mbps down · 0.5 Mbps up · 150 ms latency');
 assert.equal(networkSummary({offline:true}),'Offline · disconnected from the start');
});
test('a persona primary device is independent from its ordered saved devices',()=>{
 const persona={deviceIds:['phone','tablet','phone'],primaryDeviceId:'tablet'},devices=[{id:'phone',name:'Phone'},{id:'tablet',name:'Tablet'}];
 assert.deepEqual(personaDeviceIds(persona),['phone','tablet']);assert.equal(primaryDevice(persona,devices).id,'tablet');assert.equal(primaryDevice({},devices),undefined);
});
