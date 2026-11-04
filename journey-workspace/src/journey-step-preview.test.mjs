import test from 'node:test';
import assert from 'node:assert/strict';
import {journeyStepPreview} from './journey-step-preview.ts';

const step=(entry={},extra={})=>({id:'emotion-0',ms:1500,eventIndex:2,point:{entry},...extra});
const run={id:'before',events:[{index:2,videoMs:1000,screenshot:'/runs/before/shot.png'},{index:4,videoMs:3000,screenshot:'/runs/before/later.png'}],experience:[{eventIndex:2,reaction:'Another note',videoMs:8000}]};

test('preview uses the resolved incoming screenshot and preserves its own exact comment',()=>{
 const result=journeyStepPreview(run,step({eventIndex:4,personaComment:'  Exact words.\nStill exact.  ',reaction:'Other wording'}));
 assert.deepEqual(result,{comment:'  Exact words.\nStill exact.  ',observation:null,frame:{src:'/runs/before/shot.png',ms:1000,nearby:false}});
});
test('missing comment uses only its observation, never a sibling persona reaction',()=>{
 const result=journeyStepPreview(run,step({observation:'A button is missing.'}));
 assert.equal(result.comment,null);assert.equal(result.observation,'A button is missing.');
 assert.equal(journeyStepPreview(run,step()).comment,null);
});
test('nearby preview uses this point clock, reports the frame clock, and does not borrow sibling time',()=>{
 const result=journeyStepPreview(run,step({eventIndex:9},{eventIndex:null,ms:2500}));
 assert.deepEqual(result.frame,{src:'/runs/before/shot.png',ms:1000,nearby:true});
 assert.equal(journeyStepPreview(run,step({eventIndex:9},{eventIndex:null,ms:null})).frame,null);
});
test('no available run or allowlisted frame remains missing without hiding the own reaction',()=>{
 const own=step({reaction:'I am stuck.'});
 assert.equal(journeyStepPreview(null,own).frame,null);
 const result=journeyStepPreview({events:[{index:2,videoMs:1000,screenshot:'https://external.test/frame.png'}]},own);
 assert.equal(result.frame,null);assert.equal(result.comment,'I am stuck.');
});
