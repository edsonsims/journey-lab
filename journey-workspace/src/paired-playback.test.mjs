import test from 'node:test';
import assert from 'node:assert/strict';
import {createPairedPlayback} from './usePairedPlayback.ts';

class Video extends EventTarget {
 duration;readyState=4;seeking=false;paused=true;error=null;dataset={recordingMode:'original'};
 #time=0;#rate=1;
 constructor(duration){super();this.duration=duration;}
 get currentTime(){return this.#time;}
 set currentTime(value){this.#time=value;this.seeking=true;queueMicrotask(()=>{this.dispatchEvent(new Event('seeking'));this.seeking=false;this.dispatchEvent(new Event('seeked'));this.dispatchEvent(new Event('timeupdate'));});}
 get playbackRate(){return this.#rate;}
 set playbackRate(value){this.#rate=value;queueMicrotask(()=>this.dispatchEvent(new Event('ratechange')));}
 play(){if(this.paused){this.paused=false;queueMicrotask(()=>{this.dispatchEvent(new Event('play'));this.dispatchEvent(new Event('playing'));});}return Promise.resolve();}
 pause(){if(!this.paused){this.paused=true;queueMicrotask(()=>this.dispatchEvent(new Event('pause')));}}
 advance(seconds){this.#time+=seconds;this.dispatchEvent(new Event('timeupdate'));}
}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function setup(options={}){const before=new Video(100),after=new Video(80);let state;const controller=createPairedPlayback(before,after,{...options,onState:value=>state=value});return{before,after,controller,get state(){return state;}};}

test('explicit milestone anchors align shared zero and include the longer recording’s remaining time',async()=>{
 const x=setup({beforeAnchorMs:10000,afterAnchorMs:20000});try{await flush();assert.equal(x.before.currentTime,10);assert.equal(x.after.currentTime,20);assert.equal(x.state.startMs,-10000);assert.equal(x.state.endMs,90000);assert.equal(x.state.commonMs,0);assert.equal(x.state.ready,true);}finally{x.controller.destroy();}
});
test('a chart seek moves both original clocks, including the longer recording’s tail',async()=>{
 const x=setup({beforeAnchorMs:10000,afterAnchorMs:20000});try{await flush();assert.equal(x.controller.seek(25000),true);await flush();assert.equal(x.before.currentTime,35);assert.equal(x.after.currentTime,45);assert.equal(x.controller.seek(75000),true);await flush();assert.equal(x.before.currentTime,85);assert.equal(x.after.currentTime,80);assert.equal(x.controller.seek(91000),false);assert.equal(x.state.commonMs,75000);}finally{x.controller.destroy();}
});
test('native play, pause, seek and rate changes work from either recording without feedback loops',async()=>{
 const x=setup({beforeAnchorMs:10000,afterAnchorMs:20000});try{await flush();await x.after.play();await flush();assert.equal(x.before.paused,false);assert.equal(x.state.playing,true);x.before.pause();await flush();assert.equal(x.after.paused,true);assert.equal(x.state.playing,false);x.after.currentTime=47;await flush();assert.equal(x.before.currentTime,37);x.after.playbackRate=1.5;await flush();assert.equal(x.before.playbackRate,1.5);x.before.playbackRate=.5;await flush();assert.equal(x.after.playbackRate,.5);x.before.currentTime=50;await flush();assert.equal(x.after.currentTime,60);}finally{x.controller.destroy();}
});
test('buffering pauses the pair and resumes together when both recordings are ready',async()=>{
 const x=setup();try{await flush();x.controller.play();await flush();x.after.readyState=2;x.after.dispatchEvent(new Event('waiting'));await flush();assert.equal(x.before.paused,true);assert.equal(x.after.paused,true);assert.equal(x.state.buffering,true);x.after.readyState=4;x.after.dispatchEvent(new Event('canplay'));await flush();assert.equal(x.before.paused,false);assert.equal(x.after.paused,false);assert.equal(x.state.buffering,false);}finally{x.controller.destroy();}
});
test('a user pause while buffering cancels automatic resume',async()=>{
 const x=setup();try{await flush();x.controller.play();await flush();x.after.readyState=2;x.after.dispatchEvent(new Event('waiting'));await flush();x.controller.pause();x.after.readyState=4;x.after.dispatchEvent(new Event('canplay'));await flush();assert.equal(x.before.paused,true);assert.equal(x.after.paused,true);assert.equal(x.state.playing,false);}finally{x.controller.destroy();}
});
test('drift is corrected, the shorter recording holds its last frame, and playback stops at the longest end',async()=>{
 const x=setup({beforeAnchorMs:10000,afterAnchorMs:20000});try{
  await flush();x.controller.play();await flush();x.before.advance(1);await flush();assert.equal(x.after.currentTime,21);
  x.controller.seek(60000);await flush();assert.equal(x.before.paused,false);assert.equal(x.after.paused,true);assert.equal(x.after.currentTime,80);assert.equal(x.state.playing,true);
  x.after.dispatchEvent(new Event('ended'));await flush();assert.equal(x.before.paused,false);
  x.before.advance(5);await flush();assert.equal(x.after.currentTime,80);assert.equal(x.state.commonMs,65000);
  x.controller.seek(89900);await flush();x.before.advance(.1);await flush();assert.equal(x.before.paused,true);assert.equal(x.after.paused,true);assert.equal(x.state.commonMs,90000);assert.equal(x.state.playing,false);
 }finally{x.controller.destroy();}
});
test('a naturally ended leader hands off to the longer recording even when pause precedes ended',async()=>{
 const x=setup();x.before.duration=40;try{
  await flush();x.controller.play();await flush();x.controller.seek(39000);await flush();
  x.before.advance(1);x.before.pause();x.before.dispatchEvent(new Event('ended'));await flush();
  assert.equal(x.before.paused,true);assert.equal(x.after.paused,false);assert.equal(x.after.currentTime,40);assert.equal(x.state.playing,true);
  x.after.advance(3);await flush();assert.equal(x.state.commonMs,43000);assert.equal(x.before.currentTime,40);
  x.before.readyState=2;x.before.dispatchEvent(new Event('waiting'));await flush();assert.equal(x.after.paused,false);
  x.controller.pause();await flush();assert.equal(x.after.paused,true);
  x.before.readyState=4;x.controller.seek(10000);await flush();x.controller.play();await flush();assert.equal(x.before.paused,false);assert.equal(x.after.paused,false);
 }finally{x.controller.destroy();}
});
test('tail buffering resumes only the remaining recording, and replay restarts both after all end',async()=>{
 const x=setup();try{
  await flush();x.controller.seek(85000);await flush();x.controller.play();await flush();
  x.before.readyState=2;x.before.dispatchEvent(new Event('waiting'));await flush();assert.equal(x.state.buffering,true);
  x.before.readyState=4;x.before.dispatchEvent(new Event('canplay'));await flush();assert.equal(x.before.paused,false);assert.equal(x.after.paused,true);
  x.controller.seek(100000);await flush();assert.equal(x.state.playing,false);
  x.controller.play();await flush();assert.equal(x.before.currentTime,0);assert.equal(x.after.currentTime,0);assert.equal(x.state.playing,true);
 }finally{x.controller.destroy();}
});
test('destroy detaches old recording events and stops active playback',async()=>{
 const x=setup();await flush();x.controller.play();await flush();x.controller.destroy();await flush();const previous=x.state;await x.after.play();await flush();assert.equal(x.before.paused,true);assert.equal(x.state,previous);x.after.pause();
});
test('failed or unavailable media cannot report a successful linked start',async()=>{
 const x=setup();try{await flush();x.after.error={code:4};x.after.dispatchEvent(new Event('error'));await flush();assert.equal(x.state.ready,false);assert.equal(x.state.playing,false);assert.equal(x.controller.play(),false);assert.match(x.state.error,/ready/);}finally{x.controller.destroy();}
});
