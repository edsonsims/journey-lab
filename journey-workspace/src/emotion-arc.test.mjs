import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEmotionArc} from './emotion-arc.ts';

test('all five explicit valences map to ordinal heights and the existing tone vocabulary',()=>{
 const arc=buildEmotionArc({experience:['very_positive','positive','neutral','negative','very_negative'].map((valence,index)=>({valence,videoMs:index*1000}))});
 assert.deepEqual(arc.points.map(p=>p.value),[2,1,0,-1,-2]);
 assert.deepEqual(arc.points.map(p=>p.tone.key),['excellent','positive','neutral','negative','very-negative']);
 assert.equal(arc.high,arc.points[0]);assert.equal(arc.low,arc.points[4]);
 assert.equal(arc.segments.length,1);
});

test('missing mood is unrated rather than neutral, and breaks the connecting line',()=>{
 const arc=buildEmotionArc({experience:[{videoMs:0,valence:'positive'},{videoMs:1000},{videoMs:2000,valence:'neutral'},{videoMs:3000,valence:'negative'}]});
 assert.equal(arc.points[1].value,null);assert.equal(arc.points[1].tone.key,'unrated');
 assert.equal(arc.points[2].value,0);assert.equal(arc.unratedPoints[0],arc.points[1]);
 assert.deepEqual(arc.segments.map(segment=>segment.map(p=>p.index)),[[0],[2,3]]);
 assert.deepEqual(arc.summary,{total:4,timed:4,rated:3,unrated:1,unplaced:0});
});

test('friction, confidence, findings, and sibling notes do not manufacture a mood or timestamp',()=>{
 const arc=buildEmotionArc({findings:[{eventIndex:7,impact:'critical',valence:'very_negative'}],experience:[{eventIndex:7,friction:3,confidence:'high'},{eventIndex:7,videoMs:1000,valence:'positive'},{videoMs:2000,valence:'happy',friction:0}]});
 assert.equal(arc.points[0].value,null);assert.equal(arc.points[0].ms,null);
 assert.equal(arc.points[2].value,null);assert.equal(arc.points[2].tone.key,'unrated');
});

test('original time takes precedence over replay time and an exact event can supply missing timing',()=>{
 const arc=buildEmotionArc({events:[{index:2,videoMs:7000},{index:3,videoMs:9000}],experience:[{originalMs:6000,videoMs:5000,replayMs:1000,valence:'neutral'},{eventIndex:2,valence:'negative'},{actionEventIndex:3,valence:'positive'}]});
 assert.deepEqual(arc.points.map(p=>p.ms),[6000,7000,9000]);
});

test('chronological sort preserves duplicate timestamps and stable source identities',()=>{
 const arc=buildEmotionArc({experience:[{videoMs:2000,valence:'negative'},{videoMs:0,valence:'positive'},{videoMs:2000,valence:'neutral'},{videoMs:1000,valence:'positive'}]});
 assert.deepEqual(arc.timedPoints.map(p=>p.id),['emotion-1','emotion-3','emotion-0','emotion-2']);
 assert.equal(arc.high.id,'emotion-1');assert.equal(arc.low.id,'emotion-0');
 assert.equal(arc.timedPoints.length,4);assert.equal(new Set(arc.points.map(p=>p.id)).size,4);
});

test('missing or invalid timing stays unplaced and prevents bridging across incomplete history',()=>{
 const arc=buildEmotionArc({experience:[{videoMs:0,valence:'positive'},{valence:'negative'},{videoMs:3000,valence:'positive'},{videoMs:-1,valence:'neutral'},{videoMs:Infinity,valence:'positive'},{videoMs:NaN,valence:'negative'}]});
 assert.equal(arc.unplacedPoints.length,4);
 assert.deepEqual(arc.segments.map(s=>s.map(p=>p.index)),[[0],[2]]);
 assert.equal(arc.low.id,'emotion-0'); // Untimed negativity is not assigned a place on the arc.
});

test('duration uses original media metadata and never the run wall clock or condensed duration',()=>{
 const arc=buildEmotionArc({durationMs:120000,replayMetadata:{originalDuration:20,replayDuration:5},experience:[{videoMs:6000,valence:'positive'}]});
 assert.equal(arc.durationMs,20000);assert.deepEqual(arc.range,{startMs:0,endMs:20000});
 assert.equal(buildEmotionArc({replayMetadata:{originalDuration:2},experience:[{videoMs:3000,valence:'positive'}]}).durationMs,3000);
 assert.equal(buildEmotionArc({durationMs:600000,experience:[{videoMs:3000,valence:'negative'}]}).durationMs,3000);
});

test('empty, all-unrated, flat and time-zero-only data remain explicit without invented variation',()=>{
 const empty=buildEmotionArc({durationMs:9000});assert.equal(empty.durationMs,null);assert.equal(empty.range,null);assert.equal(empty.high,null);assert.deepEqual(empty.segments,[]);
 const unrated=buildEmotionArc({experience:[{videoMs:0}]});assert.equal(unrated.durationMs,0);assert.equal(unrated.high,null);assert.equal(unrated.low,null);assert.deepEqual(unrated.segments,[]);
 const flat=buildEmotionArc({experience:[{videoMs:0,valence:'neutral'},{videoMs:2000,valence:'neutral'}]});assert.equal(flat.high,flat.low);assert.equal(flat.high.value,0);assert.equal(flat.segments.length,1);
});
