import test from 'node:test';
import assert from 'node:assert/strict';
import {devicePayload,networkProfilePayload} from './device-authoring.ts';

test('device authoring preserves fractional preset density without rounding or identity leakage',()=>{
 const source={id:'preset',version:9,projectId:'other-project',name:'Pixel 7',description:'Mobile',category:'phone',browser:'chromium',viewport:{width:412,height:839},screen:{width:412,height:915},deviceScaleFactor:2.625,isMobile:true,hasTouch:true,userAgent:'Android',presetId:'Pixel 7'};
 const payload=devicePayload(source);assert.equal(payload.deviceScaleFactor,2.625);assert.notEqual(payload.viewport,source.viewport);assert.deepEqual(payload.screen,source.screen);for(const field of ['id','version','projectId'])assert.equal(Object.hasOwn(payload,field),false);
});
test('renaming a retained legacy profile preserves origin; editing browser behavior clears its legacy marker',()=>{
 const source={name:'Custom phone',category:'phone',browser:'chromium',viewport:{width:390,height:844},screen:{width:390,height:844},deviceScaleFactor:1,isMobile:false,hasTouch:false,userAgent:'',legacyViewport:true};
 assert.equal(devicePayload({...source,name:'Original phone'},source).legacyViewport,true);
 assert.equal(devicePayload({...source,hasTouch:true,isMobile:true},source).legacyViewport,false);
 assert.equal(devicePayload({...source,deviceScaleFactor:2.625},source).legacyViewport,false);
 assert.equal(devicePayload({...source,viewport:{width:412,height:839}},source).legacyViewport,false);
});
test('network authoring preserves fractional throughput and zero latency while blank limits mean unlimited',()=>{
 assert.deepEqual(networkProfilePayload({name:'Slow',description:'Test',offline:false,latencyMs:'0',downloadMbps:'1.6',uploadMbps:'0.75'}),{name:'Slow',description:'Test',offline:false,latencyMs:0,downloadMbps:1.6,uploadMbps:.75});
 const payload=networkProfilePayload({offline:true,latencyMs:0,downloadMbps:'',uploadMbps:null});assert.equal(payload.downloadMbps,null);assert.equal(payload.uploadMbps,null);assert.equal(payload.offline,true);
});
