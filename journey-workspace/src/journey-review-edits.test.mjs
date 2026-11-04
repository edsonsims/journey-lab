import test from 'node:test';
import assert from 'node:assert/strict';
import {replaceJourneyPair} from './journey-review-edits.ts';

const pair=(beforeId,afterId)=>({beforeId,afterId});
const accepted=(beforeId,afterId,source='manual')=>({...pair(beforeId,afterId),status:'accepted',source});
const rejected=(beforeId,afterId,source='manual')=>({...pair(beforeId,afterId),status:'rejected',source});

test('moving either endpoint rejects the previous edge and manually accepts the new edge',()=>{
 const old={...pair('emotion-1','emotion-2'),source:'suggested'};
 for(const next of [pair('emotion-3','emotion-2'),pair('emotion-1','emotion-4'),pair('emotion-3','emotion-4')]){
  assert.deepEqual(replaceJourneyPair([accepted(old.beforeId,old.afterId,'suggested')],next,old),[
   rejected(old.beforeId,old.afterId,'suggested'),accepted(next.beforeId,next.afterId),
  ]);
 }
});

test('adjusting back to a rejected destination leaves one current decision for each pair',()=>{
 const original={...pair('emotion-1','emotion-1'),source:'suggested'};
 const moved=replaceJourneyPair([],pair('emotion-1','emotion-2'),original);
 const restored=replaceJourneyPair(moved,original,{...pair('emotion-1','emotion-2'),source:'manual'});
 assert.deepEqual(restored,[rejected('emotion-1','emotion-2'),accepted('emotion-1','emotion-1')]);
 assert.equal(new Set(restored.map(d=>`${d.beforeId}/${d.afterId}`)).size,restored.length);
});

test('adding a manual pair replaces only its exact existing rejection without needing an old edge',()=>{
 const source=[rejected('emotion-0','emotion-0','suggested'),rejected('emotion-3','emotion-4')];
 const expected=[rejected('emotion-0','emotion-0','suggested'),accepted('emotion-3','emotion-4')];
 assert.deepEqual(replaceJourneyPair(source,pair('emotion-3','emotion-4')),expected);
 assert.deepEqual(replaceJourneyPair(source,pair('emotion-3','emotion-4'),null),expected);
});

test('unrelated accepted pairs stay intact even when they conflict with the replacement',()=>{
 const other={...accepted('emotion-3','emotion-5'),note:'Previously reviewed context'};
 const result=replaceJourneyPair([other,accepted('emotion-1','emotion-1')],pair('emotion-3','emotion-2'),{...pair('emotion-1','emotion-1'),source:'manual'});
 assert.deepEqual(result,[other,rejected('emotion-1','emotion-1'),accepted('emotion-3','emotion-2')]);
 // Duplicate endpoints are intentionally left for applyJourneyReview to explain;
 // changing one edge must not silently erase another human decision.
 assert.equal(result.filter(d=>d.status==='accepted'&&d.beforeId==='emotion-3').length,2);
});

test('saving the same pair creates one manual acceptance and no contradictory rejection',()=>{
 const old={...pair('emotion-2','emotion-3'),source:'suggested'};
 assert.deepEqual(replaceJourneyPair([accepted(old.beforeId,old.afterId,'suggested')],old,old),[
  accepted('emotion-2','emotion-3'),
 ]);
});

test('editing does not mutate source decisions, source objects, or either pair descriptor',()=>{
 const kept=Object.freeze({...rejected('emotion-7','emotion-8'),note:'Keep this separate review'});
 const old=Object.freeze({...pair('emotion-1','emotion-1'),source:'manual'}),next=Object.freeze(pair('emotion-2','emotion-3'));
 const source=Object.freeze([kept,Object.freeze(accepted(old.beforeId,old.afterId))]);
 const snapshot=structuredClone(source);
 const result=replaceJourneyPair(source,next,old);
 assert.deepEqual(source,snapshot);assert.deepEqual(old,{...pair('emotion-1','emotion-1'),source:'manual'});
 result[0].note='Local edit to a new result';
 assert.equal(source[0].note,'Keep this separate review');
});
