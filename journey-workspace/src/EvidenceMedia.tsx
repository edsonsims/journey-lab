import {useLayoutEffect,useRef,useState} from 'react';
import type {CSSProperties,ReactNode} from 'react';
import {clock} from './lib';
import type {EvidenceAnnotation} from './evidence-annotations';
import {containedMediaRect} from './evidence-annotations';
import './evidence-annotations.css';

function EmotionFace({tone}:{tone:string}){
 const smile=tone==='positive'||tone==='excellent',frown=tone==='negative'||tone==='very-negative';
 return <svg className="evidence-emotion-face" viewBox="0 0 28 28" fill="none" aria-hidden="true"><circle cx="14" cy="14" r="12" fill="currentColor" fillOpacity=".13" stroke="currentColor" strokeWidth="1.8"/>{tone==='unrated'?<><path d="M14 12v7" stroke="currentColor" strokeWidth="2"/><circle cx="14" cy="8" r="1" fill="currentColor"/></>:<><circle cx="9.5" cy="11" r="1.3" fill="currentColor"/><circle cx="18.5" cy="11" r="1.3" fill="currentColor"/><path d={smile?'M8.5 16q5.5 7 11 0':frown?'M9 19q5-6 10 0':'M9 18h10'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>{tone==='very-negative'&&<path d="m7 6 4 2m6 0 4-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>}</>}</svg>;
}

export function EmotionBadge({annotation,small=false}:{annotation:EvidenceAnnotation;small?:boolean}){
 return <span className={`evidence-emotion-badge evidence-tone-${annotation.tone.key} ${small?'is-small':''}`}><EmotionFace tone={annotation.tone.key}/><span>{annotation.tone.key==='unrated'?'Reaction':annotation.tone.label}</span></span>;
}

export function AnnotationToggle({enabled,onChange}:{enabled:boolean;onChange:(enabled:boolean)=>void}){
 return <button type="button" className="evidence-caption-toggle" aria-label="Emotion captions" aria-pressed={enabled} title="Show emotion labels, recorded reactions, and click highlights" onClick={()=>onChange(!enabled)}><svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="2" y="3.5" width="16" height="13" rx="3" stroke="currentColor" strokeWidth="1.5"/><path d="M8.5 8a2.5 2.5 0 1 0 0 4m7-4a2.5 2.5 0 1 0 0 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg><span>Emotion captions</span></button>;
}

/** The subtitle has its own band so it never hides the product being tested. */
export function EvidenceMedia({annotation,enabled=true,children,className='',caption=true,compactCaption=false}:{annotation:EvidenceAnnotation|null;enabled?:boolean;children:ReactNode;className?:string;caption?:boolean;compactCaption?:boolean}){
 const viewport=useRef<HTMLDivElement>(null);
 const [rect,setRect]=useState<ReturnType<typeof containedMediaRect>>(null);
 useLayoutEffect(()=>{
  const host=viewport.current,media=host?.querySelector('video,img');if(!host||!media)return;
  const measure=()=>{
   const size=media.getBoundingClientRect(),outer=host.getBoundingClientRect();
   const w=media instanceof HTMLVideoElement?media.videoWidth:media instanceof HTMLImageElement?media.naturalWidth:0;
   const h=media instanceof HTMLVideoElement?media.videoHeight:media instanceof HTMLImageElement?media.naturalHeight:0;
   const contained=containedMediaRect(size.width,size.height,w,h);
   setRect(contained?{...contained,left:contained.left+size.left-outer.left,top:contained.top+size.top-outer.top}:null);
  };
  const observer=new ResizeObserver(measure);observer.observe(host);observer.observe(media);
  media.addEventListener('loadedmetadata',measure);media.addEventListener('load',measure);measure();
  return()=>{observer.disconnect();media.removeEventListener('loadedmetadata',measure);media.removeEventListener('load',measure);};
 },[children]);
 const note=enabled?annotation:null,highlight=note?.highlight;
 const box=highlight&&highlight.width!=null&&highlight.height!=null;
 const markStyle:CSSProperties|undefined=rect&&highlight?{left:rect.left+highlight.x*rect.width,top:rect.top+highlight.y*rect.height,...(box?{width:highlight.width!*rect.width,height:highlight.height!*rect.height}:{})}:undefined;
 return <div className={`evidence-media ${className} ${note?'has-annotation':''}`} data-annotation-id={note?.id}>
  <div ref={viewport} className="evidence-media-viewport">
   {children}
   {note&&<div className="evidence-media-badge"><EmotionBadge annotation={note}/></div>}
   {note&&highlight&&markStyle&&<div className={`evidence-target evidence-tone-${note.tone.key} ${box?'is-box':'is-point'}`} style={markStyle} aria-label={`Recorded click: ${highlight.label}`}><span className={`evidence-target-label ${highlight.x>.65?'align-right':''} ${highlight.y<.18?'below':''}`}>Click · {highlight.label}</span></div>}
  </div>
  {note&&caption&&compactCaption&&<details className={`evidence-compact-caption evidence-tone-${note.tone.key}`}><summary><time>{note.ms!==null?clock(note.ms):'—'}</time><span>{note.caption||'AI Persona reaction'}</span><span aria-hidden="true">⌄</span></summary><div><small>AI Persona reaction</small><p>{note.caption||'No public explanation recorded.'}</p>{note.detail&&<p><strong>{note.detailLabel}</strong> {note.detail}</p>}</div></details>}
  {note&&caption&&!compactCaption&&<div className={`evidence-subtitle evidence-tone-${note.tone.key}`} aria-label="Recorded emotion caption">
   <div className="evidence-subtitle-meta"><span>AI Persona reaction</span>{note.ms!==null&&<time title="Reaction time in the original recording">{clock(note.ms)}</time>}</div>
   <p>{note.caption||'No public explanation recorded for this reaction.'}</p>
   {note.detail&&(note.detailLabel==='Why'?<p className="evidence-subtitle-why"><strong>Why</strong> {note.detail}</p>:<details className="evidence-subtitle-detail"><summary>What was on screen</summary><p>{note.detail}</p></details>)}
  </div>}
 </div>;
}
