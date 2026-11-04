import test from 'node:test';
import assert from 'node:assert/strict';
import {momentFrame,momentSignal} from './moment-signals.ts';

const run={experience:[{eventIndex:2,valence:'positive',friction:0,reaction:'That helped.'},{eventIndex:4,valence:'negative',friction:3,reaction:'I cannot start.'}],events:[{index:2,videoMs:0,screenshot:'/runs/a/screen-002.png'},{index:4,videoMs:2000,screenshot:'/runs/a/screen-004.png'},{index:6,videoMs:8000,screenshot:'/runs/a/screen-006.png'}]};
test('a retrospective business hypothesis does not inherit a persona reaction or emotional score',()=>{
 const signal=momentSignal(run,{claimStatus:'hypothesis',provenance:'review-hypothesis',eventIndex:4,impact:'high'});
 assert.equal(signal.tone.key,'unrated');assert.equal(signal.reaction,null);assert.equal(signal.friction,null);assert.match(signal.source,/added during review/);
});
test('finding impact never determines tone; exact-event persona signal stays identifiable',()=>{
  const signal=momentSignal(run,{eventIndex:2,impact:'critical'});
  assert.equal(signal.tone.key,'positive');assert.match(signal.source,/evidence event/);
  assert.equal(momentSignal(run,{eventIndex:3,impact:'high',originalMs:1999}).tone.key,'unrated');
  assert.equal(momentSignal(run,{eventIndex:4,impact:'informational'}).tone.key,'negative');
  assert.equal(momentSignal(run,{eventIndex:4}).friction,3);
});
test('extreme tone requires explicit signal, never confidence or lack of friction',()=>{
  assert.equal(momentSignal(run,{valence:'positive',confidence:'high',friction:0}).tone.key,'positive');
  assert.equal(momentSignal(run,{valence:'very_positive'}).tone.key,'excellent');
  assert.equal(momentSignal(run,{valence:'very_negative'}).tone.key,'very-negative');
  assert.equal(momentSignal(run,{valence:'neutral'}).tone.key,'neutral');
  assert.equal(momentSignal(run,{}).tone.key,'unrated');
});
test('preview picks the linked evidence frame, supports time zero and labels fallback',()=>{
  assert.deepEqual(momentFrame(run,{eventIndex:2,originalMs:0}),{src:'/runs/a/screen-002.png',ms:0,nearby:false});
  assert.equal(momentFrame(run,{evidence:[{index:4}],originalMs:3000}).src,'/runs/a/screen-004.png');
  assert.deepEqual(momentFrame(run,{originalMs:2500}),{src:'/runs/a/screen-004.png',ms:2000,nearby:true});
  assert.equal(momentFrame(run,{}),null);
  assert.equal(momentFrame({events:[{index:1,videoMs:100,screenshot:'https://example.com/a.png'}]},{eventIndex:1,originalMs:0}),null);
});
