import {useEffect,useId,useMemo,useRef,useState} from 'react';
import type {KeyboardEvent,PointerEvent} from 'react';
import type {JourneyStep} from './journey-matching';
import {adjacentDragStep,nearestDragStep,preciseRecordingTime,recordingOffset,relativeStepPosition,timedDragSteps} from './drag-alignment';
import type {DragStepPair} from './drag-alignment';
import {Icon} from './icons';
import {JourneyStepPreview} from './JourneyStepPreview';
import type {Row} from './lib';
export type {DragStepPair} from './drag-alignment';

type Side='before'|'after';
type Phase='preview'|'drop'|'cancel';
type Gesture={pointerId:number;side:Side;start:DragStepPair;target:HTMLElement};
type Inspection={side:Side;id:string};
export type DragStepAlignmentProps={beforeSteps:JourneyStep[];afterSteps:JourneyStep[];beforeRun:Row|null;afterRun:Row|null;beforeDurationMs:number|null;afterDurationMs:number|null;value:DragStepPair;onChange:(pair:DragStepPair,phase:Phase)=>void;disabled?:boolean};
const sides:Side[]=['before','after'];
const sideName=(side:Side)=>side==='before'?'Before':'After';
const samePair=(a:DragStepPair,b:DragStepPair)=>a.beforeId===b.beforeId&&a.afterId===b.afterId;

/** Relative lane position is an editing affordance, not an action-equivalence score. */
export function DragStepAlignment({beforeSteps,afterSteps,beforeRun,afterRun,beforeDurationMs,afterDurationMs,value,onChange,disabled=false}:DragStepAlignmentProps){
 const [dragging,setDragging]=useState<Side|null>(null);
 const [inspection,setInspection]=useState<Inspection|null>(null);
 const previewId=useId(),closeTimer=useRef<ReturnType<typeof setTimeout>|null>(null),pointerInPreview=useRef(false);
 const gesture=useRef<Gesture|null>(null),current=useRef(value),changed=useRef(onChange);
 const tracks=useRef<Record<Side,HTMLDivElement|null>>({before:null,after:null});
 const markerRefs=useRef(new Map<string,HTMLButtonElement>());
 current.current=value;changed.current=onChange;
 const available=useMemo(()=>({before:timedDragSteps(beforeSteps,beforeDurationMs),after:timedDragSteps(afterSteps,afterDurationMs)}),[beforeSteps,afterSteps,beforeDurationMs,afterDurationMs]);
 const durations={before:beforeDurationMs,after:afterDurationMs};
 const chosen={before:available.before.find(step=>step.id===value.beforeId),after:available.after.find(step=>step.id===value.afterId)};
 const positions={before:relativeStepPosition(chosen.before?.ms??null,beforeDurationMs),after:relativeStepPosition(chosen.after?.ms??null,afterDurationMs)};
 const preview=dragging?{side:dragging,id:value[dragging==='before'?'beforeId':'afterId']}:inspection;
 const previewStep=preview?available[preview.side].find(step=>step.id===preview.id):null;
 const previewAnchor=preview?markerRefs.current.get(`${preview.side}:${preview.id}`):null;
 const livePreview=useRef<{anchor:HTMLElement|null} >({anchor:null});livePreview.current={anchor:previewAnchor||null};
 function cancelClose(){if(closeTimer.current)clearTimeout(closeTimer.current);closeTimer.current=null;}
 function closePreview(){cancelClose();pointerInPreview.current=false;setInspection(null);}
 function showPreview(side:Side,id:string){if(disabled||gesture.current)return;cancelClose();setInspection({side,id});}
 function scheduleClose(){cancelClose();closeTimer.current=setTimeout(()=>{if(!gesture.current&&!pointerInPreview.current&&document.activeElement!==livePreview.current.anchor)setInspection(null);},160);}
 function emit(pair:DragStepPair,phase:Phase){const different=!samePair(current.current,pair);current.current=pair;if(different||phase!=='preview')changed.current(pair,phase);}
 function release(active:Gesture){if(active.target.hasPointerCapture(active.pointerId))active.target.releasePointerCapture(active.pointerId);}
 function cancel(){const active=gesture.current;if(!active)return;gesture.current=null;setDragging(null);closePreview();release(active);emit(active.start,'cancel');}
 useEffect(()=>{
  const escape=(event:globalThis.KeyboardEvent)=>{if(event.key!=='Escape')return;if(gesture.current){event.preventDefault();event.stopPropagation();cancel();}else closePreview();};
  const outside=(event:globalThis.PointerEvent)=>{const target=event.target as Node;if(!gesture.current&&!document.getElementById(previewId)?.contains(target)&&!livePreview.current.anchor?.contains(target))closePreview();};
  const scroll=(event:Event)=>{if(!gesture.current&&!document.getElementById(previewId)?.contains(event.target as Node))closePreview();};
  window.addEventListener('keydown',escape);
  window.addEventListener('pointerdown',outside);window.addEventListener('scroll',scroll,true);
  return()=>{window.removeEventListener('keydown',escape);window.removeEventListener('pointerdown',outside);window.removeEventListener('scroll',scroll,true);cancelClose();const active=gesture.current;gesture.current=null;if(active)release(active);};
 },[]);
 useEffect(()=>{if(disabled){cancel();closePreview();}},[disabled]);
 function pairWith(side:Side,step:JourneyStep){return {...current.current,[side==='before'?'beforeId':'afterId']:step.id};}
 function fromPointer(side:Side,clientX:number){const track=tracks.current[side];if(!track)return null;const rect=track.getBoundingClientRect();if(rect.width<=0)return null;return nearestDragStep(available[side],durations[side],(clientX-rect.left)/rect.width,current.current[side==='before'?'beforeId':'afterId']);}
 function start(event:PointerEvent<HTMLElement>,side:Side,step?:JourneyStep){
  if(disabled||!bothReady||gesture.current||event.button!==0||!available[side].length)return;
  const selected=step||fromPointer(side,event.clientX);if(!selected)return;
  event.preventDefault();event.stopPropagation();
  closePreview();
  gesture.current={pointerId:event.pointerId,side,start:{...current.current},target:event.currentTarget};setDragging(side);
  event.currentTarget.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);
  emit(pairWith(side,selected),'preview');
 }
 function move(event:PointerEvent<HTMLElement>){
  const active=gesture.current;if(!active||active.pointerId!==event.pointerId)return;event.preventDefault();event.stopPropagation();
  const selected=fromPointer(active.side,event.clientX);if(selected)emit(pairWith(active.side,selected),'preview');
 }
 function drop(event:PointerEvent<HTMLElement>){
  const active=gesture.current;if(!active||active.pointerId!==event.pointerId)return;move(event);gesture.current=null;setDragging(null);release(active);setInspection({side:active.side,id:current.current[active.side==='before'?'beforeId':'afterId']});emit({...current.current},'drop');
 }
 function keyboard(event:KeyboardEvent<HTMLElement>,side:Side){
  const direction=event.key==='ArrowRight'||event.key==='ArrowUp'?'next':event.key==='ArrowLeft'||event.key==='ArrowDown'?'previous':event.key==='Home'?'first':event.key==='End'?'last':null;
  if(!direction||disabled)return;event.preventDefault();if(gesture.current)return;
  const selected=adjacentDragStep(available[side],current.current[side==='before'?'beforeId':'afterId'],direction);
  if(selected){emit(pairWith(side,selected),'drop');requestAnimationFrame(()=>{if(!gesture.current)markerRefs.current.get(`${side}:${selected.id}`)?.focus({preventScroll:true});});}
 }
 function nudge(side:Side,direction:'previous'|'next'){const selected=adjacentDragStep(available[side],current.current[side==='before'?'beforeId':'afterId'],direction);if(selected){emit(pairWith(side,selected),'drop');showPreview(side,selected.id);}}
 const pointerEvents={onPointerMove:move,onPointerUp:drop,onPointerCancel:cancel,onLostPointerCapture:cancel};
 const bothReady=available.before.length>0&&available.after.length>0;
 return <section className={`drag-step-alignment ${dragging?'is-dragging':''}`} aria-label="Drag step alignment">
  <div className="drag-step-heading"><span>Drag either point to a recorded step.</span><output title="After timestamp minus before timestamp" aria-live="polite">Offset <strong>{recordingOffset(chosen.before?.ms??null,chosen.after?.ms??null)}</strong></output></div>
  <div className="drag-step-lanes">
   <div className="drag-step-labels" aria-hidden="true"><span>Before</span><span>After</span></div>
   <div className="drag-step-board">
    {positions.before!==null&&positions.after!==null&&<svg className="drag-step-connector" viewBox="0 0 1000 102" preserveAspectRatio="none" aria-hidden="true"><path d={`M ${positions.before*1000} 20 L ${positions.after*1000} 82`} vectorEffect="non-scaling-stroke"/></svg>}
    {sides.map(side=><div className={`drag-step-lane drag-step-${side}`} key={side}>
     <div className={`drag-step-track ${dragging===side?'is-active':''} ${!available[side].length?'is-unavailable':''}`} ref={element=>{tracks.current[side]=element;}} onPointerDown={event=>start(event,side)} {...pointerEvents}>
      <div className="drag-step-track-line" aria-hidden="true"/>
      {available[side].map(step=>{
       const selected=step.id===value[side==='before'?'beforeId':'afterId'];
       return <button type="button" key={step.id} ref={element=>{const key=`${side}:${step.id}`;if(element)markerRefs.current.set(key,element);else markerRefs.current.delete(key);}} role={selected?'slider':undefined} className={`drag-step-marker tone-${step.point.tone.key} ${selected?'is-selected':''}`} style={{left:`${relativeStepPosition(step.ms,durations[side])!*100}%`}} tabIndex={selected?0:-1} disabled={disabled||!bothReady} data-side={side} data-step-id={step.id} data-original-ms={step.ms} aria-label={selected?`${sideName(side)} matched step`:`${sideName(side)} step ${step.index+1}: ${step.title}`} aria-valuemin={selected?0:undefined} aria-valuemax={selected?durations[side]!/1000:undefined} aria-valuenow={selected?step.ms!/1000:undefined} aria-valuetext={selected?`${step.title}, ${preciseRecordingTime(step.ms)}, recorded step ${step.index+1}`:undefined} aria-describedby={preview?.side===side&&preview.id===step.id?previewId:undefined} onPointerEnter={event=>{if(event.pointerType!=='touch')showPreview(side,step.id);}} onPointerLeave={scheduleClose} onFocus={()=>showPreview(side,step.id)} onBlur={scheduleClose} onPointerDown={event=>start(event,side,step)} onKeyDown={event=>keyboard(event,side)} onClick={event=>{if(event.detail===0&&!disabled)emit(pairWith(side,step),'drop');}} {...pointerEvents}><span/></button>;
      })}
     </div>
     <div className="drag-step-scale" aria-hidden="true"><time>0:00</time><time>{preciseRecordingTime(durations[side])}</time></div>
    </div>)}
   </div>
  </div>
  {!bothReady&&<p className="drag-step-unavailable">Both original recordings need a known duration and timed steps to drag.</p>}
  <div className="drag-step-selections">{sides.map(side=>{
   const selected=chosen[side],index=available[side].findIndex(step=>step.id===selected?.id);
   return <div className={`drag-step-selection drag-step-${side}`} key={side}>
    <div><span>{sideName(side)} <time>{preciseRecordingTime(selected?.ms??null)}</time></span><strong>{selected?.title||'Choose a recorded step'}</strong></div>
    <div className="drag-step-nudges"><button type="button" disabled={disabled||!bothReady||index<=0} onClick={()=>nudge(side,'previous')} aria-label={`Previous ${side} step`}><Icon name="back" size={13}/></button><button type="button" disabled={disabled||!bothReady||index>=available[side].length-1} onClick={()=>nudge(side,'next')} aria-label={`Next ${side} step`}><Icon name="arrow" size={13}/></button></div>
   </div>;
  })}</div>
  {preview&&previewStep&&previewAnchor&&<JourneyStepPreview id={previewId} run={preview.side==='before'?beforeRun:afterRun} step={previewStep} side={preview.side} anchor={previewAnchor} dragging={!!dragging} onPointerEnter={()=>{pointerInPreview.current=true;cancelClose();}} onPointerLeave={()=>{pointerInPreview.current=false;scheduleClose();}}/>}
  <p className="drag-step-hint">Each lane uses its own recording time. Arrow keys adjust; Escape cancels a drag.</p>
 </section>;
}
