import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveImpactArcHit} from './impact-arc-hit-target.ts';

const p=(id,x,y)=>({id,x,y});

test('nearest dot wins independently of SVG paint order',()=>{
 const before=p('before',20,20),after=p('after',32,20),position={x:21,y:20};
 assert.deepEqual(resolveImpactArcHit([before,after],position),[before]);
 assert.deepEqual(resolveImpactArcHit([after,before],position),[before]);
});

test('coincident before and after dots remain separately selectable in input order',()=>{
 const before=p('before',30,40),after=p('after',30,40);
 assert.deepEqual(resolveImpactArcHit([before,after],{x:30,y:40}),[before,after]);
 assert.deepEqual(resolveImpactArcHit([after,before],{x:30,y:40}),[after,before]);
});

test('generous hit radius accepts nearby clicks but never distant dots',()=>{
 const dot=p('dot',50,50);
 assert.deepEqual(resolveImpactArcHit([dot],{x:68,y:50}),[dot]);
 assert.deepEqual(resolveImpactArcHit([dot],{x:68.01,y:50}),[]);
 assert.deepEqual(resolveImpactArcHit([dot],{x:65,y:65}),[]);
 assert.deepEqual(resolveImpactArcHit([],{x:50,y:50}),[]);
});

test('only near ties are offered, without pulling in adjacent tone bands',()=>{
 const low=p('low',10,10),high=p('high',10,19),position={x:10,y:11};
 assert.deepEqual(resolveImpactArcHit([high,low],position),[low]);
 const a=p('a',0,0),b=p('b',3,0),c=p('c',5.1,0);
 assert.deepEqual(resolveImpactArcHit([c,b,a],{x:1,y:0}),[b,a]);
 assert.deepEqual(resolveImpactArcHit([a,b],{x:1,y:0},18,0),[a]);
 assert.deepEqual(resolveImpactArcHit([a,b],{x:1,y:0},18,1),[a,b]);
});

test('tie candidates still must lie within the hit radius',()=>{
 const inside=p('inside',18,0),outside=p('outside',19,0);
 assert.deepEqual(resolveImpactArcHit([outside,inside],{x:0,y:0}),[inside]);
});

test('invalid coordinates and invalid radius or tolerance cannot establish a hit',()=>{
 const good=p('good',0,0),bad=[p('nan',NaN,0),p('infinity',0,Infinity)];
 assert.deepEqual(resolveImpactArcHit([...bad,good],{x:0,y:0}),[good]);
 for(const position of [{x:NaN,y:0},{x:0,y:Infinity}])assert.deepEqual(resolveImpactArcHit([good],position),[]);
 for(const invalid of [NaN,Infinity,-1]){
  assert.deepEqual(resolveImpactArcHit([good],{x:0,y:0},invalid),[]);
  assert.deepEqual(resolveImpactArcHit([good],{x:0,y:0},18,invalid),[]);
 }
 assert.deepEqual(resolveImpactArcHit([good],{x:0,y:0},0,0),[good]);
});

test('resolution preserves target identity and does not mutate its inputs',()=>{
 const a=p('a',5,5),b=p('b',10,10),points=[a,b],snapshot=structuredClone(points);
 const result=resolveImpactArcHit(points,{x:5,y:5});
 assert.strictEqual(result[0],a);
 assert.deepEqual(points,snapshot);
});
