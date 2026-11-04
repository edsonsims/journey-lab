export type DragStepPair={beforeId:string;afterId:string};
export type TimedDragStep={id:string;index:number;ms:number|null};
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);

/** A chart extent or elapsed run wall time never substitutes for media duration. */
export function timedDragSteps<T extends TimedDragStep>(steps:T[],durationMs:number|null):T[]{
 if(!finite(durationMs)||durationMs<0)return [];
 return steps.filter(step=>finite(step.ms)&&step.ms>=0&&step.ms<=durationMs).sort((a,b)=>a.ms!-b.ms!||a.index-b.index);
}
export function relativeStepPosition(ms:number|null,durationMs:number|null):number|null{
 if(!finite(ms)||!finite(durationMs)||durationMs<0||ms<0||ms>durationMs)return null;
 return durationMs===0?0:ms/durationMs;
}
export function nearestDragStep<T extends TimedDragStep>(steps:T[],durationMs:number|null,relative:number,preferredId?:string):T|null{
 if(!finite(relative)||!finite(durationMs))return null;
 const available=timedDragSteps(steps,durationMs);
 const target=Math.max(0,Math.min(1,relative))*durationMs;
 let nearest:T|null=null,distance=Infinity;
 for(const step of available){
  const next=Math.abs(step.ms!-target);
  // At identical/midpoint times, keep the current step rather than flickering.
  if(next<distance||next===distance&&step.id===preferredId){nearest=step;distance=next;}
 }
 return nearest;
}
export function adjacentDragStep<T extends TimedDragStep>(steps:T[],currentId:string,direction:'previous'|'next'|'first'|'last'):T|null{
 if(!steps.length)return null;
 const index=steps.findIndex(step=>step.id===currentId);
 if(direction==='first')return steps[0];
 if(direction==='last')return steps.at(-1)!;
 if(index<0)return direction==='previous'?steps.at(-1)!:steps[0];
 return steps[Math.max(0,Math.min(steps.length-1,index+(direction==='next'?1:-1)))];
}
export function preciseRecordingTime(ms:number|null):string{
 if(!finite(ms)||ms<0)return '—';
 const rounded=Math.round(ms),seconds=Math.floor(rounded/1000);
 return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}.${String(rounded%1000).padStart(3,'0')}`;
}
export function recordingOffset(beforeMs:number|null,afterMs:number|null):string{
 if(!finite(beforeMs)||!finite(afterMs)||beforeMs<0||afterMs<0)return '—';
 const delta=(afterMs-beforeMs)/1000;
 return `${delta<0?'−':delta>0?'+':''}${Math.abs(delta).toFixed(3)} s`;
}
