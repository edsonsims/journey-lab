import test from 'node:test';
import assert from 'node:assert/strict';
import {originalToReplay,replayToOriginal,sourceTime,totals,safeMedia,hasReplay} from './lib.ts';

const run={video:'/runs/abc/journey.webm',replay:'/runs/abc/replay.webm',replayMetadata:{segments:[{originalStart:2,originalEnd:5,replayStart:0},{originalStart:8,originalEnd:12,replayStart:3}]},experience:[{eventIndex:4,actionEventIndex:5,videoMs:3500,reaction:'Visible moment'}]};
test('retained original moments map through the edit and back without using raw wall time',()=>{assert.equal(originalToReplay(run,9500),4500);assert.equal(replayToOriginal(run,4500),9500);});
test('removed model waits never become a fabricated replay moment',()=>{assert.equal(originalToReplay(run,6500),null);assert.equal(originalToReplay(run,1000),null);assert.equal(originalToReplay(run,13000),null);});
test('missing media mapping is explicit',()=>{assert.equal(hasReplay({replay:'/runs/a/replay.webm'}),false);assert.equal(replayToOriginal({},1000),null);});
test('an untimed finding does not inherit an unrelated note timestamp',()=>{assert.equal(sourceTime(run,{title:'Untimed finding'}),null);assert.equal(sourceTime(run,{eventIndex:5}),3500);assert.equal(sourceTime(run,{originalMs:0}),0);});
test('provider total is not inflated by cached or reasoning components',()=>{assert.equal(totals({tokens:{total:120,input:100,cachedInput:80,output:20,reasoningOutput:15}}),120);assert.equal(totals({usage:[{total_tokens:120},{total_tokens:30}]}),150);});
test('unavailable usage stays unknown instead of zero',()=>{assert.equal(totals({}),null);assert.equal(totals({usage:[{}]}),null);assert.equal(totals({usage:[{total_tokens:10},{}]}),null);assert.equal(totals({totalTokens:0}),0);});
test('recorded media paths are allowed without accepting active/external URLs',()=>{assert.equal(safeMedia('/runs/abc/screen-002.png'),'/runs/abc/screen-002.png');assert.equal(safeMedia('javascript:alert(1)'),undefined);assert.equal(safeMedia('https://example.com/tracker'),undefined);});
