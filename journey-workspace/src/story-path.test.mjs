import test from 'node:test';
import assert from 'node:assert/strict';
import {storyPath} from './story-path.ts';

function segments(path){
 const tokens=path.match(/[MLC]|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g)||[];
 const result=[];
 let from;
 for(let i=0;i<tokens.length;){
  const command=tokens[i++];
  const point=()=>({x:Number(tokens[i++]),y:Number(tokens[i++])});
  if(command==='M'){from=point();continue;}
  if(command==='L'){const to=point();result.push({from,to});from=to;continue;}
  assert.equal(command,'C');
  const first=point(),second=point(),to=point();
  result.push({from,first,second,to});from=to;
 }
 return result;
}
function at(segment,t){
 const {from,first,second,to}=segment;
 if(!first)return{x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t};
 const u=1-t;
 return Object.fromEntries(['x','y'].map(axis=>[axis,u*u*u*from[axis]+3*u*u*t*first[axis]+3*u*t*t*second[axis]+t*t*t*to[axis]]));
}

test('a winding itinerary reaches every stop without reversing or overshooting its scene bounds',()=>{
 const points=[{x:200,y:30},{x:720,y:410},{x:320,y:1120},{x:660,y:1460},{x:180,y:2010}];
 const trail=segments(storyPath(points));
 assert.deepEqual([trail[0].from,...trail.map(segment=>segment.to)],points);
 for(const segment of trail){
  let lastY=segment.from.y;
  for(let sample=0;sample<=100;sample++){
   const point=at(segment,sample/100);
   assert(point.x>=Math.min(segment.from.x,segment.to.x)-1e-9);
   assert(point.x<=Math.max(segment.from.x,segment.to.x)+1e-9);
   assert(point.y>=lastY-1e-9,'the route must keep moving down the story');
   assert(point.y<=segment.to.y+1e-9);
   lastY=point.y;
  }
 }
});

test('curves enter and leave waypoints vertically, including successive changes of direction',()=>{
 const trail=segments(storyPath([{x:90,y:20},{x:810,y:500},{x:270,y:850}]));
 for(const segment of trail){
  assert.equal(segment.first.x,segment.from.x);
  assert.equal(segment.second.x,segment.to.x);
  assert(segment.first.y>segment.from.y);
  assert(segment.second.y<segment.to.y);
 }
});

test('aligned mobile anchors stay on one vertical trail',()=>{
 const trail=segments(storyPath([{x:14,y:20},{x:14,y:320},{x:14,y:980}]));
 for(const segment of trail)for(const t of [0,.25,.5,.75,1])assert.equal(at(segment,t).x,14);
 assert.equal(trail.at(-1).to.y,980);
});

test('empty, single, invalid, duplicate and out-of-order anchors do not create unsafe geometry',()=>{
 assert.equal(storyPath([]),'');
 assert.equal(storyPath([{x:12,y:25}]),'M 12 25');
 assert.equal(storyPath([{x:NaN,y:0},{x:3,y:Infinity}]),'');
 const trail=segments(storyPath([
  {x:12,y:25},{x:12,y:25},{x:99,y:25},{x:4,y:10},
  {x:Infinity,y:50},{x:5,y:NaN},{x:300,y:90}
 ]));
 assert.deepEqual(trail.map(segment=>[segment.from,segment.to]),[[{x:12,y:25},{x:300,y:90}]]);
 const extreme=storyPath([{x:0,y:Number.MAX_VALUE*.75},{x:10,y:Number.MAX_VALUE}]);
 assert(!extreme.includes('Infinity'));
 assert(!extreme.includes('NaN'));
});
