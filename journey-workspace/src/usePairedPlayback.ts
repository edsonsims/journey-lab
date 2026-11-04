import {useCallback,useEffect,useRef,useState} from 'react';

export type PairedPlaybackState={
 ready:boolean;playing:boolean;buffering:boolean;commonMs:number|null;
 startMs:number|null;endMs:number|null;error:string;
};
const idle:PairedPlaybackState={ready:false,playing:false,buffering:false,commonMs:null,startMs:null,endMs:null,error:''};
const valid=(value:number)=>Number.isFinite(value)&&value>=0;

/** Both sources must be ORIGINAL recordings. Shared time is original time minus
 * each explicitly selected anchor; no condensed-video or progress interpolation. */
export function createPairedPlayback(before:HTMLVideoElement,after:HTMLVideoElement,
 {beforeAnchorMs=0,afterAnchorMs=0,onState}:{beforeAnchorMs?:number,afterAnchorMs?:number,onState:(state:PairedPlaybackState)=>void}){
 const videos=[before,after],anchors=[beforeAnchorMs,afterAnchorMs];
 let destroyed=false,intent=false,leader=before,initialized=false,error='',epoch=0;
 const ignoredPause=new Set<HTMLVideoElement>(),ignoredPlay=new Set<HTMLVideoElement>();
 const expectedSeeks=new Map<HTMLVideoElement,number>(),waiting=new Set<HTMLVideoElement>();
 const removers:(()=>void)[]=[];
 const anchor=(video:HTMLVideoElement)=>anchors[video===before?0:1];
 const common=(video:HTMLVideoElement)=>video.currentTime*1000-anchor(video);
 const bounds=()=>{
  if(!anchors.every(valid)||videos.some(v=>v.readyState<1||!valid(v.duration)||v.error))return null;
  const startMs=Math.max(-beforeAnchorMs,-afterAnchorMs);
  const endMs=Math.max(before.duration*1000-beforeAnchorMs,after.duration*1000-afterAnchorMs);
  return endMs>startMs?{startMs,endMs}:null;
 };
 const atEnd=(video:HTMLVideoElement)=>valid(video.duration)&&video.currentTime*1000>=video.duration*1000-12;
 const active=()=>videos.filter(v=>!atEnd(v));
 const buffered=()=>active().every(v=>v.readyState>=3&&!v.seeking);
 const publish=()=>{
  if(destroyed)return;
  const range=bounds();
  onState({ready:!!range,playing:intent&&active().length>0&&active().every(v=>!v.paused)&&!waiting.size,
   buffering:intent&&(waiting.size>0||!buffered()),commonMs:initialized?common(leader):null,
   startMs:range?.startMs??null,endMs:range?.endMs??null,error});
 };
 function pauseMedia(){for(const video of videos)if(!video.paused){ignoredPause.add(video);video.pause();}}
 function setTime(video:HTMLVideoElement,ms:number){
  if(Math.abs(video.currentTime*1000-ms)<=12)return;
  expectedSeeks.set(video,ms);video.currentTime=ms/1000;
 }
 function syncAt(ms:number){for(const video of videos){setTime(video,Math.max(0,Math.min(video.duration*1000,ms+anchor(video))));if(atEnd(video)){waiting.delete(video);if(!video.paused){ignoredPause.add(video);video.pause();}}}if(atEnd(leader))leader=active()[0]||leader;}
 function pause(){intent=false;epoch++;waiting.clear();pauseMedia();publish();}
 function fail(message:string){error=message;pause();}
 function resume(){
  if(destroyed||!intent)return;
  if(!buffered()){publish();return;}
  waiting.clear();
  const version=epoch;
  for(const video of videos){
   if(!video.paused||atEnd(video))continue;
   ignoredPlay.add(video);
   void video.play().catch(()=>{ignoredPlay.delete(video);if(!destroyed&&intent&&epoch===version)fail('Both recordings could not start. Try Play both again.');});
  }
  publish();
 }
 function seek(ms:number){
  const range=bounds();
  if(!range||!Number.isFinite(ms)||ms<range.startMs-.5||ms>range.endMs+.5)return false;
  error='';pauseMedia();syncAt(Math.max(range.startMs,Math.min(range.endMs,ms)));initialized=true;
  if(ms>=range.endMs){intent=false;epoch++;waiting.clear();}
  publish();resume();return true;
 }
 function play(){
  const range=bounds();if(!range){fail('Both original recordings must be ready to play together.');return false;}
  error='';intent=true;epoch++;
  const at=common(leader);
  const target=!initialized||at<range.startMs||at>=range.endMs-12?Math.max(range.startMs,Math.min(range.endMs,0)):at;
  initialized=true;syncAt(target);resume();publish();return true;
 }
 function initialize(){
  const range=bounds();
  if(range&&!initialized){pauseMedia();syncAt(Math.max(range.startMs,Math.min(range.endMs,0)));initialized=true;}
  if(!range&&videos.every(v=>v.readyState>=1))error='These recordings have no playable time window.';
  if(intent)resume();publish();
 }
 function changedTime(video:HTMLVideoElement){
  if(destroyed)return;
  const range=bounds();if(!range){publish();return;}
  if(video!==leader){publish();return;}
  if(intent&&atEnd(video)&&active().length){completed(video);return;}
  const at=common(video);
  if(intent&&at>=range.endMs-12){intent=false;epoch++;waiting.clear();pauseMedia();syncAt(range.endMs);publish();return;}
  if(intent&&buffered()){
   const peer=video===before?after:before;
   const target=Math.min(peer.duration*1000,at+anchor(peer));
   if(Math.abs(peer.currentTime*1000-target)>120)setTime(peer,target);
  }
  publish();
 }
 function completed(video:HTMLVideoElement){
  waiting.delete(video);
  if(!intent){publish();return;}
  if(video===leader){
   const at=common(video),next=active()[0];
   if(!next){intent=false;epoch++;waiting.clear();pauseMedia();publish();return;}
   leader=next;syncAt(at);
  }
  resume();publish();
 }
 function nativeSeek(video:HTMLVideoElement){
  const expected=expectedSeeks.get(video);
  if(expected!=null&&Math.abs(video.currentTime*1000-expected)<30){publish();return;}
  expectedSeeks.delete(video);
  const range=bounds();if(!range)return;
  leader=video;initialized=true;const at=common(video);
  if(at<range.startMs||at>range.endMs){
   intent=false;epoch++;waiting.clear();pauseMedia();syncAt(Math.max(range.startMs,Math.min(range.endMs,at)));
   error='That moment is outside the recordings.';
  }else{error='';pauseMedia();syncAt(at);}
  publish();resume();
 }
 for(const video of videos){
  const listen=(name:string,handler:()=>void)=>{video.addEventListener(name,handler);removers.push(()=>video.removeEventListener(name,handler));};
  listen('loadedmetadata',initialize);listen('durationchange',initialize);
  listen('play',()=>{
   if(ignoredPlay.delete(video)){publish();return;}
   leader=video;intent=true;epoch++;error='';
   const range=bounds();if(!range){fail('Both original recordings must be ready to play together.');return;}
   initialized=true;const at=common(video);
   syncAt(at<range.startMs||at>=range.endMs?Math.max(range.startMs,Math.min(range.endMs,0)):at);resume();publish();
  });
  listen('pause',()=>{if(ignoredPause.delete(video)){publish();return;}if(atEnd(video)){completed(video);return;}pause();});
  listen('seeking',()=>nativeSeek(video));
  listen('seeked',()=>{expectedSeeks.delete(video);waiting.delete(video);resume();publish();});
  listen('timeupdate',()=>changedTime(video));
  listen('ratechange',()=>{const peer=video===before?after:before;if(peer.playbackRate!==video.playbackRate)peer.playbackRate=video.playbackRate;publish();});
  listen('waiting',()=>{if(intent&&!atEnd(video)){waiting.add(video);pauseMedia();publish();}});
  listen('stalled',()=>{if(intent&&!atEnd(video)&&video.readyState<3){waiting.add(video);pauseMedia();publish();}});
  listen('canplay',()=>{waiting.delete(video);resume();publish();});
  listen('playing',()=>{waiting.delete(video);publish();});
  listen('ended',()=>completed(video));
  listen('error',()=>fail('One recording is unavailable. Linked playback is paused.'));
 }
 pauseMedia();initialize();
 const timer=setInterval(()=>{if(intent){for(const video of waiting)if(video.readyState>=3&&!video.seeking)waiting.delete(video);if(waiting.size===0&&videos.some(v=>v.paused))resume();changedTime(leader);}},100);
 return {play,pause,seek,destroy(){if(destroyed)return;intent=false;epoch++;removers.forEach(remove=>remove());clearInterval(timer);pauseMedia();destroyed=true;}};
}

export function usePairedPlayback({enabled,beforeId,afterId,beforeAnchorMs=0,afterAnchorMs=0}:{enabled:boolean,beforeId?:string,afterId?:string,beforeAnchorMs?:number,afterAnchorMs?:number}){
 const [before,setBefore]=useState<HTMLVideoElement|null>(null),[after,setAfter]=useState<HTMLVideoElement|null>(null);
 const [state,setState]=useState<PairedPlaybackState>(idle);
 const controller=useRef<ReturnType<typeof createPairedPlayback>|null>(null);
 const beforeRef=useCallback((video:HTMLVideoElement|null)=>setBefore(video),[]);
 const afterRef=useCallback((video:HTMLVideoElement|null)=>setAfter(video),[]);
 useEffect(()=>{
  setState(idle);
  if(!enabled||!before||!after||before.dataset.recordingMode!=='original'||after.dataset.recordingMode!=='original')return;
  const current=createPairedPlayback(before,after,{beforeAnchorMs,afterAnchorMs,onState:setState});controller.current=current;
  return()=>{current.destroy();if(controller.current===current)controller.current=null;};
 },[enabled,before,after,beforeId,afterId,beforeAnchorMs,afterAnchorMs]);
 const play=useCallback(()=>controller.current?.play()??false,[]);
 const pause=useCallback(()=>controller.current?.pause(),[]);
 const seek=useCallback((commonMs:number)=>controller.current?.seek(commonMs)??false,[]);
 return {beforeRef,afterRef,play,pause,seek,state};
}
