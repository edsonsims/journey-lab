import test from 'node:test';
import assert from 'node:assert/strict';
import {exampleFocus,exampleMoments,exampleSegments} from './impact-example-experience.ts';
import {getImpactExample} from './impact-examples.ts';
const point=(id,valence)=>({exampleStepId:id,exampleStepLabel:id,valence,originalMs:0});

test('example matches use explicit stages, never array position or equal clocks',()=>{
 const moments=exampleMoments({before:{experience:[point('upload','positive'),point('review','neutral')]},after:{experience:[point('review','negative'),point('done','positive')]}});
 assert.deepEqual(moments.map(item=>item.id),['upload','review','done']);
 assert.equal(moments[0].after,null);assert.equal(moments[2].before,null);
 assert.equal(moments[1].before.value,0);assert.equal(moments[1].after.value,-1);
 assert.equal(exampleFocus(moments),1);
});

test('unknown and missing moments remain gaps and cannot create positive changes',()=>{
 const moments=exampleMoments({before:{experience:[point('a','positive'),point('b',null),point('c','negative')]},after:{experience:[point('a','positive'),point('c',null)]}});
 assert.deepEqual(exampleSegments(moments,'before').map(segment=>segment.map(item=>item.index)),[[0],[2]]);
 assert.deepEqual(exampleSegments(moments,'after').map(segment=>segment.map(item=>item.index)),[[0]]);
 assert.equal(exampleFocus(moments),0);
 assert.deepEqual(exampleMoments({before:{experience:[{valence:'positive',originalMs:0}]}}),[]);
});

test('inserted and reordered steps preserve each side\'s narrative order',()=>{
 const before=['a','b','c'],after=['a','c','b'];
 const moments=exampleMoments({before:{experience:before.map(id=>point(id,'neutral'))},after:{experience:after.map(id=>point(id,'positive'))}});
 for(const [side,expected] of [['before',before],['after',after]])assert.deepEqual(moments.filter(item=>item[side]).map(item=>item[side].entry.exampleStepId),expected);
 assert.equal(new Set(moments.map(item=>item.id)).size,moments.length);
});

test('every authored example preserves both step orders; Priya finishes with successful review',()=>{
 for(const id of ['example-relay-import','example-handoff-links'])for(const pair of getImpactExample(id).report.pairs){
  const moments=exampleMoments(pair);
  for(const side of ['before','after'])assert.deepEqual(moments.filter(item=>item[side]).map(item=>item[side].entry.exampleStepId),pair[side].experience.map(entry=>entry.exampleStepId));
 }
 const priya=getImpactExample('example-handoff-links').report.pairs.find(pair=>pair.personaId==='example-handoff-priya');
 const after=exampleMoments(priya).filter(item=>item.after);
 assert.equal(after.at(-1).label,'Review access');assert.equal(after.at(-1).after.value,1);
});
