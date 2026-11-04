import test from 'node:test';
import assert from 'node:assert/strict';
import {recordedDeviceContext,recordedConditionsKey} from './recorded-device.mjs';
import {buildInsights} from './workspace-insights.mjs';

const profile={id:'phone',name:'Saved phone',category:'phone',version:1,viewport:{width:1100,height:500},deviceScaleFactor:2,isMobile:true,hasTouch:true,browser:'chromium'};
const connection={id:'slow',name:'Slow connection',version:1,offline:false,latencyMs:400,downloadMbps:1,uploadMbps:0.5};
function run(id,extras={}){return {id,projectId:'p',status:'finished',personaId:'p1',personaVersion:1,environmentId:'env',environmentVersion:1,createdAt:'2026-11-02T12:00:00Z',deviceSnapshot:structuredClone(profile),networkProfileSnapshot:structuredClone(connection),events:[{index:0,type:'screenshot',url:'https://example.test/',screenshot:`/runs/${id}/s.png`,videoMs:0}],...extras};}

test('explicit device category wins over landscape width and copied persona dimensions',()=>{
 const input=run('one',{viewport:{width:1280,height:800},personaSnapshot:{viewport:{width:800,height:600}}});
 const before=structuredClone(input),context=recordedDeviceContext(input);
 assert.equal(context.device,'mobile');assert.deepEqual(context.viewport,profile.viewport);
 assert.equal(context.deviceName,'Saved phone');assert.equal(context.deviceVersion,1);
 assert.deepEqual(input,before);
});
test('historical viewport-only records remain honest and do not invent a network profile',()=>{
 const context=recordedDeviceContext({viewport:{width:390,height:844}});
 assert.match(context.deviceName,/Custom mobile.*390 × 844/);
 assert.equal(context.deviceSnapshot,null);assert.equal(context.networkProfileSnapshot,null);
 assert.equal(recordedDeviceContext({}).device,'unknown');
});
test('insight grouping and filters retain different devices and network conditions',()=>{
 const a=run('a'),b=run('b',{networkProfileSnapshot:{...connection,version:2,latencyMs:900}}),c=run('c',{deviceSnapshot:{...profile,id:'tablet',category:'tablet',name:'Tablet'}});
 const result=buildInsights({runs:[a,b,c]});
 assert.equal(result.screens.reduce((sum,screen)=>sum+screen.contexts.length,0),3);
 assert.equal(result.sourceRuns.find(row=>row.id==='a').deviceName,'Saved phone');
 assert.equal(result.sourceRuns.find(row=>row.id==='c').device,'tablet');
 assert.equal(buildInsights({runs:[a,b,c],filters:{deviceId:'phone'}}).summary.eligibleRuns,2);
 assert.equal(buildInsights({runs:[a,b,c],filters:{networkProfileId:'absent'}}).summary.eligibleRuns,0);
 assert.notEqual(recordedConditionsKey(a),recordedConditionsKey(b));
});
