import {useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {Row} from './lib';
import {person} from './lib';
import type {JourneyStep} from './journey-matching';
import {preciseRecordingTime} from './drag-alignment';
import {journeyStepPreview} from './journey-step-preview';
import {Icon} from './icons';
import './journey-step-preview.css';

export type JourneyStepPreviewProps={
 id:string;run:Row|null;step:JourneyStep;side:'before'|'after';anchor:HTMLElement;
 dragging:boolean;onPointerEnter:()=>void;onPointerLeave:()=>void;
};

function RecordedFrame({src,title}:{src:string;title:string}){
 const [state,setState]=useState<'loading'|'ready'|'failed'>('loading');
 return <>
  {state!=='failed'&&<img src={src} alt={`Recorded screen: ${title}`} style={{visibility:state==='ready'?'visible':'hidden'}} onLoad={()=>setState('ready')} onError={()=>setState('failed')}/>}
  {state!=='ready'&&<span className="step-preview-frame-state"><Icon name="film" size={22}/>{state==='failed'?'Frame unavailable':'Loading frame…'}</span>}
 </>;
}

/** Hover inspection is read-only. The owner controls selection and drag lifetime. */
export function JourneyStepPreview({id,run,step,side,anchor,dragging,onPointerEnter,onPointerLeave}:JourneyStepPreviewProps){
 const card=useRef<HTMLDivElement>(null);
 const [position,setPosition]=useState({left:12,top:12,width:336,maxHeight:600,frameHeight:156});
 const {comment,observation,frame}=journeyStepPreview(run,step);
 useLayoutEffect(()=>{
  const place=()=>{
   if(!card.current||!anchor.isConnected)return;
   const rect=anchor.getBoundingClientRect(),width=Math.max(0,Math.min(336,window.innerWidth-24));
   // Keep both lanes available when moving between Before and After. The card
   // tracks the point horizontally, but never sits over another draggable lane.
   const lanes=anchor.closest('.drag-step-lanes')?.getBoundingClientRect()||rect;
   const viewportBottom=window.innerHeight-12;
   const upperEdge=Math.min(viewportBottom,Math.max(12,lanes.top-10));
   const lowerEdge=Math.max(12,Math.min(viewportBottom,lanes.bottom+10));
   const aboveSpace=Math.max(0,upperEdge-12),belowSpace=Math.max(0,viewportBottom-lowerEdge);
   const headerHeight=card.current.querySelector<HTMLElement>('.step-preview-header')?.getBoundingClientRect().height||0;
   const copyHeight=card.current.querySelector<HTMLElement>('.step-preview-copy')?.scrollHeight||0;
   const naturalFrameHeight=window.innerWidth<=620?140:156;
   // Choose the side using a stable desired frame size, not the last compact
   // frame size; otherwise a constrained card can flip sides on every resize.
   const naturalHeight=headerHeight+naturalFrameHeight+copyHeight;
   const above=aboveSpace>=naturalHeight||(belowSpace<naturalHeight&&aboveSpace>=belowSpace);
   const maxHeight=above?aboveSpace:belowSpace,height=Math.min(naturalHeight,maxHeight);
   const frameHeight=Math.max(48,Math.min(naturalFrameHeight,maxHeight-headerHeight-copyHeight));
   const next={width,left:Math.max(12,Math.min(window.innerWidth-width-12,rect.left+rect.width/2-width/2)),
    top:above?upperEdge-height:lowerEdge,maxHeight,frameHeight};
   setPosition(old=>old.left===next.left&&old.top===next.top&&old.width===next.width&&old.maxHeight===next.maxHeight&&old.frameHeight===next.frameHeight?old:next);
  };
  const observer=new ResizeObserver(place);
  if(card.current)observer.observe(card.current);
  place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  return()=>{observer.disconnect();window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
 },[anchor,step.id,side]);
 const sideLabel=side==='before'?'Before':'After';
 return createPortal(<div ref={card} id={id} role="tooltip" className={`journey-step-preview tone-${step.point.tone.key} ${dragging?'is-dragging':''}`} style={{left:position.left,top:position.top,width:position.width,maxHeight:position.maxHeight}}
  data-preview-side={side} data-preview-step={step.id} data-preview-ms={step.ms} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
  <div className="step-preview-header"><strong>{sideLabel}</strong><time>{preciseRecordingTime(step.ms)} <span>original</span></time></div>
  <div className="step-preview-frame" style={{height:position.frameHeight}}>
   {frame?<RecordedFrame key={`${run?.id}:${frame.src}`} src={frame.src} title={step.title}/>:<span className="step-preview-frame-state"><Icon name="film" size={22}/>No frame captured</span>}
   {frame&&<small>{frame.nearby?'Nearby frame':'Recorded frame'}{frame.ms!=null?` · ${preciseRecordingTime(frame.ms)}`:''}</small>}
  </div>
  <div className="step-preview-copy"><h3>{step.title}</h3><div className="step-preview-meta"><span className="step-preview-tone"><i aria-hidden="true"/>{step.point.tone.label}</span><span>{run?person(run):'Persona'}</span></div>
   {comment?<blockquote>{comment}</blockquote>:observation?<div className="step-preview-observation"><span>Recorded observation</span><p>{observation}</p></div>:<p className="step-preview-missing">No persona comment recorded.</p>}
  </div>
 </div>,document.body);
}
