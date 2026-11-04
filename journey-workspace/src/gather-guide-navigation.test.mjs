import test from 'node:test';
import assert from 'node:assert/strict';
import {guideChapterIndex} from './gather-guide-navigation.ts';

test('named chapters resolve all six positions in story order',()=>{
 for(const [index,chapter] of ['change','people','mismatch','difference','repair','retest'].entries()){
  assert.equal(guideChapterIndex(`?chapter=${chapter}`),index);
 }
});

test('legacy steps retain their original context, comparison, repair and retest destinations',()=>{
 assert.equal(guideChapterIndex('?step=1'),1);
 assert.equal(guideChapterIndex('?step=2'),3);
 assert.equal(guideChapterIndex('?step=3'),4);
 assert.equal(guideChapterIndex('?step=4'),5);
});

test('a valid named chapter wins, including the first chapter at index zero',()=>{
 assert.equal(guideChapterIndex('?step=4&chapter=change'),0);
 assert.equal(guideChapterIndex('?chapter=mismatch&step=1'),2);
 assert.equal(guideChapterIndex('?chapter=unknown&step=3'),4);
 assert.equal(guideChapterIndex('?chapter=&step=2'),3);
});

test('missing or invalid navigation is ignored without inventing a destination',()=>{
 for(const search of ['', '?', '?stage=repair', '?chapter=unknown', '?chapter=Change', '?step=0', '?step=5', '?step=1.0', '?step=-1', '?step=Infinity', '?chapter=unknown&step=invalid']){
  assert.equal(guideChapterIndex(search),null,search);
 }
});
