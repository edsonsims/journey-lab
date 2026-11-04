import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEmotionComparison} from './emotion-comparison.ts';
import {planImpactMomentSeek} from './impact-moment-seek.ts';

const run=(durationMs,extra={})=>({video:'/runs/example/journey.webm',originalDurationMs:durationMs,...extra});

test('a clicked observation seeks both original clocks without using observation progress',()=>{
 const model=buildEmotionComparison(run(100000,{experience:[{originalMs:100,valence:'positive'},{originalMs:90000,valence:'negative'}]}),run(60000));
 for(const side of ['before','after']){
  const plan=planImpactMomentSeek(model,side,23987);
  assert.equal(plan.commonMs,23987);assert.equal(plan.beforeMs,23987);assert.equal(plan.afterMs,23987);
  assert.equal(plan.canSeek,true);assert.equal(plan.canLink,true);assert.equal(plan.status,'linked');
 }
});

test('explicit alignment preserves the selected exact source time and offsets its peer',()=>{
 const model=buildEmotionComparison(run(100000),run(60000),{beforeMs:20000,afterMs:30000});
 const after=planImpactMomentSeek(model,'after',35000);
 assert.equal(after.commonMs,5000);assert.equal(after.afterMs,35000);assert.equal(after.beforeMs,25000);assert.equal(after.canLink,true);
 const before=planImpactMomentSeek(model,'before',24000);
 assert.equal(before.commonMs,4000);assert.equal(before.beforeMs,24000);assert.equal(before.afterMs,34000);assert.equal(before.canLink,true);
});

test('a longer recording remains seekable without pinning the exhausted peer to its last frame',()=>{
 const model=buildEmotionComparison(run(37000),run(71000));
 const plan=planImpactMomentSeek(model,'after',53000);
 assert.equal(plan.afterMs,53000);assert.equal(plan.beforeMs,null);assert.equal(plan.beforeState,'finished');
 assert.equal(plan.canSeek,true);assert.equal(plan.canLink,false);assert.equal(plan.status,'partial');
 assert.match(plan.label,/before recording has ended/);
});

test('a click before an aligned peer starts leaves that peer unavailable instead of clamping',()=>{
 const model=buildEmotionComparison(run(100000),run(60000),{beforeMs:20000,afterMs:30000});
 const plan=planImpactMomentSeek(model,'after',5000);
 assert.equal(plan.commonMs,-25000);assert.equal(plan.afterMs,5000);assert.equal(plan.beforeMs,null);
 assert.equal(plan.beforeState,'not_started');assert.equal(plan.canLink,false);assert.equal(plan.canSeek,true);
});

test('untimed and invalid observations do not seek either recording',()=>{
 const model=buildEmotionComparison(run(10000),run(10000));
 for(const ms of [null,-1,NaN,Infinity]){
  const plan=planImpactMomentSeek(model,'before',ms);
  assert.equal(plan.canSeek,false);assert.equal(plan.canLink,false);
  assert.equal(plan.beforeMs,null);assert.equal(plan.afterMs,null);assert.equal(plan.commonMs,null);
  assert.equal(plan.status,ms===null?'untimed':'unavailable');
 }
 assert.equal(planImpactMomentSeek(model,'before',0).beforeMs,0);
});

test('unknown duration and absent media cannot fabricate a source seek from observations',()=>{
 const unknown=buildEmotionComparison({video:'/runs/example/journey.webm',experience:[{originalMs:4000,valence:'negative'}]},run(10000));
 const plan=planImpactMomentSeek(unknown,'before',4000);
 assert.equal(plan.canSeek,false);assert.equal(plan.beforeMs,null);assert.equal(plan.afterMs,null);
 assert.match(plan.label,/duration is not available/);
 const missing=planImpactMomentSeek(buildEmotionComparison(run(10000,{video:null}),run(10000)),'before',4000);
 assert.equal(missing.canSeek,false);assert.equal(missing.beforeMs,null);assert.equal(missing.afterMs,null);
 assert.match(missing.label,/No before recording/);
});

test('missing peer media permits only the known source recording',()=>{
 const plan=planImpactMomentSeek(buildEmotionComparison(run(10000),null),'before',4000);
 assert.equal(plan.canSeek,true);assert.equal(plan.canLink,false);assert.equal(plan.beforeMs,4000);assert.equal(plan.afterMs,null);
 assert.equal(plan.afterState,'unavailable');assert.match(plan.label,/Only the before recording/);
});

test('an invalid late source note never seeks an unrelated in-range peer',()=>{
 const plan=planImpactMomentSeek(buildEmotionComparison(run(2000),run(10000)),'before',5000);
 assert.equal(plan.canSeek,false);assert.equal(plan.beforeState,'finished');assert.equal(plan.beforeMs,null);assert.equal(plan.afterMs,null);
 assert.match(plan.label,/outside the before recording/);
});
