import test from 'node:test';
import assert from 'node:assert/strict';
import {adjacentDragStep,nearestDragStep,preciseRecordingTime,recordingOffset,relativeStepPosition,timedDragSteps} from './drag-alignment.ts';
const steps=[{id:'a',index:0,ms:0},{id:'b',index:1,ms:2000},{id:'c',index:2,ms:8000}];
test('relative drag position uses each original duration and rejects absent or out-of-video clocks',()=>{
 assert.equal(relativeStepPosition(2000,10000),.2);assert.equal(relativeStepPosition(2000,4000),.5);assert.equal(relativeStepPosition(0,0),0);
 for(const [ms,duration] of [[null,1000],[0,null],[-1,1000],[1001,1000],[NaN,1000],[0,Infinity]])assert.equal(relativeStepPosition(ms,duration),null);
 assert.deepEqual(timedDragSteps([...steps,{id:'missing',index:3,ms:null},{id:'late',index:4,ms:11000}],10000),steps);
 assert.deepEqual(timedDragSteps(steps,null),[]);
});
test('dragging snaps to a recorded point, clamps outside lanes and never creates an interpolated timestamp',()=>{
 assert.equal(nearestDragStep(steps,10000,.34).id,'b');assert.equal(nearestDragStep(steps,10000,.64).id,'c');
 assert.equal(nearestDragStep(steps,10000,-5).id,'a');assert.equal(nearestDragStep(steps,10000,5).id,'c');
 assert.equal(nearestDragStep(steps,null,.5),null);assert.equal(nearestDragStep(steps,10000,NaN),null);assert.equal(nearestDragStep(steps,0,.9).id,'a');
});
test('equal-distance and duplicate-time candidates keep the current point or stable source order',()=>{
 assert.equal(nearestDragStep(steps,10000,.5).id,'b');assert.equal(nearestDragStep(steps,10000,.5,'c').id,'c');
 const duplicates=[{id:'later',index:3,ms:2000},{id:'earlier',index:1,ms:2000}];
 assert.equal(nearestDragStep(duplicates,10000,.2).id,'earlier');assert.equal(nearestDragStep(duplicates,10000,.2,'later').id,'later');
});
test('keyboard navigation preserves distinct observations and bounds rather than wrapping',()=>{
 assert.equal(adjacentDragStep(steps,'a','previous').id,'a');assert.equal(adjacentDragStep(steps,'c','next').id,'c');assert.equal(adjacentDragStep(steps,'b','next').id,'c');
 assert.equal(adjacentDragStep(steps,'b','first').id,'a');assert.equal(adjacentDragStep(steps,'a','last').id,'c');assert.equal(adjacentDragStep([],'a','next'),null);
});
test('timestamp and signed offset labels retain recorded millisecond precision',()=>{
 assert.equal(preciseRecordingTime(26350),'0:26.350');assert.equal(preciseRecordingTime(100680),'1:40.680');assert.equal(preciseRecordingTime(null),'—');
 assert.equal(recordingOffset(26350,25157),'−1.193 s');assert.equal(recordingOffset(5415,5928),'+0.513 s');assert.equal(recordingOffset(0,0),'0.000 s');assert.equal(recordingOffset(null,0),'—');
});
