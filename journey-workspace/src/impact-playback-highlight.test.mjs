import test from 'node:test';
import assert from 'node:assert/strict';
import {buildImpactLandscape} from './impact-emotional-landscape.ts';
import {findImpactPlaybackPoint} from './impact-playback-highlight.ts';

const landscape=(experience,extra={})=>buildImpactLandscape([{personaId:'person',before:{status:'finished',experience,...extra}}],'before')[0];
const at=(item,clockMs,durationMs=10000)=>findImpactPlaybackPoint(item,clockMs,{durationMs});

test('playback does not show an observation before it is recorded, including within 100ms',()=>{
 const item=landscape([{originalMs:1000,valence:'negative'}]);
 assert.equal(at(item,0),null);
 assert.equal(at(item,999),null);
 assert.strictEqual(at(item,1000),item.points[0]);
});

test('time zero, current intervals, and the final recording frame retain exact recorded observations',()=>{
 const item=landscape([{originalMs:0,valence:'neutral'},{originalMs:4000,valence:'negative'},{originalMs:7000,valence:'positive'}]);
 assert.strictEqual(at(item,0),item.points[0]);
 assert.strictEqual(at(item,3999),item.points[0]);
 assert.strictEqual(at(item,4000),item.points[1]);
 assert.strictEqual(at(item,6999),item.points[1]);
 assert.strictEqual(at(item,10000),item.points[2]);
 assert.equal(at(item,10001),null);
 assert.equal(at(item,4000).ms,4000);
 assert.equal(at(item,4000).index,1);
});

test('timestamp order takes precedence over observation progress and source array order',()=>{
 const item=landscape([{originalMs:6000,valence:'positive'},{originalMs:1000,valence:'neutral'},{originalMs:3000,valence:'negative'}]);
 const snapshot=structuredClone(item);
 assert.strictEqual(at(item,2000),item.points[1]);
 assert.strictEqual(at(item,4000),item.points[2]);
 assert.strictEqual(at(item,6500),item.points[0]);
 assert.deepEqual(item,snapshot);
});

test('equal timestamps choose the latest source observation consistently',()=>{
 const item=landscape([{originalMs:1000,valence:'positive'},{originalMs:1000,valence:'negative'},{originalMs:900,valence:'neutral'}]);
 assert.strictEqual(at(item,1000),item.points[1]);
});

test('an explicit earlier equal-time observation remains inspectable until the playback clock moves',()=>{
 const item=landscape([{originalMs:1000,valence:'positive'},{originalMs:1000,valence:'negative'},{originalMs:900,valence:'neutral'}]);
 const options={durationMs:10000,selectedPointId:item.points[0].id};
 assert.strictEqual(findImpactPlaybackPoint(item,1000,options),item.points[0]);
 assert.strictEqual(findImpactPlaybackPoint(item,1000.25,options),item.points[0]);
 assert.strictEqual(findImpactPlaybackPoint(item,999.75,options),item.points[0]);
 assert.strictEqual(findImpactPlaybackPoint(item,1000.6,options),item.points[1]);
 assert.strictEqual(findImpactPlaybackPoint(item,999.4,options),item.points[2]);
 assert.strictEqual(findImpactPlaybackPoint(item,1000,{durationMs:10000}),item.points[1]);
});

test('explicit selection cannot override availability, untimed evidence or recording bounds',()=>{
 const item=landscape([{originalMs:0,valence:'neutral'},{originalMs:1000,valence:'positive'},{valence:'negative'}]);
 const options={durationMs:10000,selectedPointId:item.points[1].id};
 assert.equal(findImpactPlaybackPoint(item,1000,{...options,available:false}),null);
 assert.equal(findImpactPlaybackPoint(item,1000,{...options,durationMs:null}),null);
 assert.strictEqual(findImpactPlaybackPoint(item,999.8,{...options,durationMs:999.9}),item.points[0]);
 assert.strictEqual(findImpactPlaybackPoint(item,500,{...options,selectedPointId:item.points[2].id}),item.points[0]);
 assert.strictEqual(findImpactPlaybackPoint(item,1000,{...options,selectedPointId:'missing'}),item.points[1]);
 assert.equal(findImpactPlaybackPoint({...item,excluded:'Invalidated evidence'},1000,options),null);
});

test('untimed observations never acquire a playback time and timed unrated observations remain current',()=>{
 const item=landscape([{originalMs:0,valence:'positive'},{valence:'very_negative'},{originalMs:2000,valence:null},{originalMs:3000,valence:'negative'}]);
 assert.strictEqual(at(item,1500),item.points[0]);
 assert.equal(item.points[1].ms,null);
 assert.strictEqual(at(item,2500),item.points[2]);
 assert.equal(at(item,2500).value,null);
 assert.strictEqual(at(item,3000),item.points[3]);
 assert.equal(at(landscape([{valence:'positive'}]),3000),null);
});

test('missing clocks, unknown recording bounds, and invalid numeric values cannot establish a highlight',()=>{
 const item=landscape([{originalMs:0,valence:'positive'}]);
 for(const value of [null,undefined,NaN,Infinity,-1]){
  assert.equal(at(item,value),null);
  assert.equal(findImpactPlaybackPoint(item,0,{durationMs:value}),null);
 }
 assert.equal(findImpactPlaybackPoint(item,0,{durationMs:10000,available:false}),null);
});

test('missing and excluded journeys never show a playback highlight',()=>{
 const missing=buildImpactLandscape([{personaId:'missing'}],'before')[0];
 const invalid=landscape([{originalMs:0,valence:'negative'}],{status:'invalidated'});
 const experimental=landscape([{originalMs:0,valence:'negative'}],{experimental:true});
 for(const item of [missing,invalid,experimental])assert.equal(at(item,1000),null);
});

test('source event timestamps are preserved without borrowing another observation time',()=>{
 const item=landscape([{eventIndex:4,valence:'positive'},{valence:'negative'}],{events:[{index:4,originalMs:800}]});
 assert.equal(at(item,799),null);
 assert.strictEqual(at(item,800),item.points[0]);
 assert.equal(at(item,800).ms,800);
 assert.equal(item.points[1].ms,null);
});
