import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEmotionComparison,mapComparisonTime,comparisonAt,emotionChangePoints} from './emotion-comparison.ts';

const run=(seconds,experience=[],extra={})=>({video:'/runs/example/journey.webm',replayMetadata:{originalDuration:seconds},experience,...extra});

test('complete arcs use a union domain while linked playback uses the media overlap',()=>{
 const model=buildEmotionComparison(run(100,[{videoMs:90000,valence:'negative'}]),run(60,[{videoMs:50000,valence:'positive'}]));
 assert.deepEqual(model.domain,{startMs:0,endMs:100000});assert.deepEqual(model.overlap,{startMs:0,endMs:60000});
 assert.equal(model.before.points[0].commonMs,90000);assert.equal(model.after.points[0].commonMs,50000);
 assert.equal(mapComparisonTime(model,70000).beforeMs,70000);assert.equal(mapComparisonTime(model,70000).afterMs,null);assert.equal(mapComparisonTime(model,70000).afterState,'finished');
 assert.equal(comparisonAt(model,70000).delta,null);
});

test('explicit anchors retain negative history and map each clock without clamping',()=>{
 const model=buildEmotionComparison(run(100,[{videoMs:20000,valence:'negative'}]),run(60,[{videoMs:30000,valence:'positive'}]),{beforeMs:20000,afterMs:30000});
 assert.equal(model.alignment,'milestone');assert.deepEqual(model.domain,{startMs:-30000,endMs:80000});assert.deepEqual(model.overlap,{startMs:-20000,endMs:30000});
 assert.equal(mapComparisonTime(model,-25000).beforeState,'not_started');assert.equal(mapComparisonTime(model,-25000).beforeMs,null);assert.equal(mapComparisonTime(model,-25000).afterMs,5000);
 const at=comparisonAt(model,0);assert.equal(at.delta,2);assert.equal(at.basis,'paired_milestone');assert.equal(at.before.point.ms,20000);assert.equal(at.after.point.ms,30000);
 assert.equal(at.label,'More positive after');
});

test('nearest comparison keeps original timestamps and distance rather than interpolating',()=>{
 const model=buildEmotionComparison(run(10,[{videoMs:1000,valence:'negative'},{videoMs:9000,valence:'positive'}]),run(10,[{videoMs:4000,valence:'positive'}]));
 const at=comparisonAt(model,4000);assert.equal(at.before.point.ms,1000);assert.equal(at.before.distanceMs,3000);assert.equal(at.after.distanceMs,0);assert.equal(at.delta,2);assert.equal(at.basis,'nearest_recorded');
 assert.equal(comparisonAt(model,4000,{maxDistanceMs:1000}).delta,null);assert.equal(comparisonAt(model,4000,{maxDistanceMs:1000}).before.status,'too_distant');
});

test('an unrated nearest observation cannot be skipped for an older rated mood',()=>{
 const model=buildEmotionComparison(run(10,[{videoMs:1000,valence:'negative'},{videoMs:4000}]),run(10,[{videoMs:4000,valence:'positive'}]));
 const at=comparisonAt(model,4000);assert.equal(at.before.status,'unrated');assert.equal(at.before.point.value,null);assert.equal(at.delta,null);assert.equal(at.label,'No comparable signals');
 assert.deepEqual(emotionChangePoints(model),[]);
});

test('change targets include worsening and improvement with stable nearest-evidence identities',()=>{
 const model=buildEmotionComparison(run(20,[{videoMs:3000,valence:'negative'},{videoMs:10000,valence:'positive'}]),run(20,[{videoMs:4000,valence:'positive'},{videoMs:11000,valence:'negative'}]));
 const changes=emotionChangePoints(model);assert.deepEqual(changes.map(c=>c.direction),['higher','lower']);assert.deepEqual(changes.map(c=>c.distanceMs),[1000,1000]);
 assert.equal(changes[0].before.id,'emotion-0');assert.equal(changes[0].after.id,'emotion-0');assert.equal(changes[0].commonMs,4000);
});

test('unknown media duration and missing video do not fabricate linked playback',()=>{
 const model=buildEmotionComparison({experience:[{videoMs:4000,valence:'positive'}],video:'/runs/example/journey.webm'},run(10,[{videoMs:4000,valence:'negative'}]));
 assert.deepEqual(model.domain,{startMs:0,endMs:10000});assert.equal(model.overlap,null);assert.equal(mapComparisonTime(model,4000).beforeState,'unavailable');
 assert.equal(comparisonAt(model,4000).delta,-2); // The recorded signals still exist without a proven video extent.
 const missing=buildEmotionComparison(run(10,[],{video:null}),run(10));assert.equal(missing.overlap,null);assert.equal(mapComparisonTime(missing,0).beforeMs,null);
});

test('invalid anchors, invalid cursors, and time-zero signals remain explicit',()=>{
 const before=run(.5,[{videoMs:0,valence:'neutral'}]),after=run(.5,[{videoMs:0,valence:'positive'}]);
 const model=buildEmotionComparison(before,after,{beforeMs:-1,afterMs:0});assert.equal(model.alignment,'start');assert.deepEqual(model.anchors,{beforeMs:0,afterMs:0});
 assert.equal(comparisonAt(model,0).delta,1);assert.equal(mapComparisonTime(model,NaN).beforeMs,null);assert.equal(comparisonAt(model,NaN).delta,null);
 assert.equal(buildEmotionComparison(before,after,{beforeMs:0,afterMs:1000}).alignment,'start');
 assert.equal(buildEmotionComparison(null,null).domain,null);assert.equal(buildEmotionComparison(null,null).overlap,null);
});

test('invalid notes beyond media end never extend the linked window or comparisons',()=>{
 const model=buildEmotionComparison(run(2,[{videoMs:3000,valence:'negative'}]),run(5,[{videoMs:3000,valence:'positive'}]));
 assert.equal(model.domain.endMs,5000);assert.equal(model.overlap.endMs,2000);assert.equal(comparisonAt(model,3000).before.status,'finished');assert.equal(comparisonAt(model,3000).delta,null);
});

test('same-time after observations stay distinct in change targets',()=>{
 const model=buildEmotionComparison(run(5,[{videoMs:1000,valence:'neutral'}]),run(5,[{videoMs:1000,valence:'positive'},{videoMs:1000,valence:'negative'}]));
 const changes=emotionChangePoints(model);assert.deepEqual(changes.map(c=>c.direction),['higher','lower']);assert.deepEqual(changes.map(c=>c.after.id),['emotion-0','emotion-1']);
});

test('paired milestone tolerates sub-millisecond media rounding but not real timing drift',()=>{
 const model=buildEmotionComparison(run(50,[{videoMs:26350,valence:'neutral'}]),run(50,[{videoMs:25157,valence:'positive'}]),{beforeMs:26350,afterMs:25157});
 assert.equal(comparisonAt(model,-.001).basis,'paired_milestone');
 assert.equal(comparisonAt(model,1).basis,'paired_milestone');
 assert.equal(comparisonAt(model,1000).basis,'nearest_recorded');
 const missing=buildEmotionComparison(run(50,[{videoMs:26350}]),run(50,[{videoMs:25157,valence:'positive'}]),{beforeMs:26350,afterMs:25157});
 assert.equal(comparisonAt(missing,-.001).delta,null);
});
