import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Row,clock,safeMedia} from './lib';
import {displayUrl} from './finding-context';
import {Icon} from './icons';
import {AnnotationToggle,EvidenceMedia} from './EvidenceMedia';
import {annotationForFrame,buildEvidenceAnnotations} from './evidence-annotations';
import './screenshot-slideshow.css';

export function ScreenshotSlideshow({run,frames,initialIndex,onClose,onSeek}:{run:Row;frames:Row[],initialIndex:number,onClose:()=>void,onSeek:(ms:number)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),closeButton=useRef<HTMLButtonElement>(null),backdropPressed=useRef(false);
 const headingId=useId();
 const [index,setIndex]=useState(()=>Math.max(0,Math.min(initialIndex,frames.length-1)));
 const [failedSource,setFailedSource]=useState<string|null>(null);
 const [annotationsEnabled,setAnnotationsEnabled]=useState(true);
 const annotations=useMemo(()=>buildEvidenceAnnotations(run),[run]);
 const frame=frames[index],source=safeMedia(frame?.screenshot),url=displayUrl(frame?.url);
 const hasTime=typeof frame?.videoMs==='number'&&Number.isFinite(frame.videoMs);
 const previous=()=>setIndex(value=>Math.max(0,value-1));
 const next=()=>setIndex(value=>Math.min(frames.length-1,value+1));
 useEffect(()=>{
  const element=dialog.current,opener=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
  if(!element)return;
  element.showModal();document.body.style.overflow='hidden';closeButton.current?.focus();
  return()=>{element.close();document.body.style.overflow=overflow;if(opener?.isConnected)opener.focus({preventScroll:true});};
 },[]);
 if(!frame)return null;
 return createPortal(<dialog ref={dialog} className="screenshot-slideshow" aria-labelledby={headingId} aria-modal="true"
  onCancel={event=>{event.preventDefault();onClose();}}
  onKeyDown={event=>{
   event.stopPropagation();
   if(event.altKey||event.ctrlKey||event.metaKey)return;
   if(event.key==='ArrowLeft'){event.preventDefault();previous();}
   if(event.key==='ArrowRight'){event.preventDefault();next();}
   if(event.key==='Home'){event.preventDefault();setIndex(0);}
   if(event.key==='End'){event.preventDefault();setIndex(frames.length-1);}
  }}
  onPointerDown={event=>{const r=event.currentTarget.getBoundingClientRect();backdropPressed.current=event.target===event.currentTarget&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom);}}
  onClick={event=>{const r=event.currentTarget.getBoundingClientRect();if(backdropPressed.current&&event.target===event.currentTarget&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))onClose();backdropPressed.current=false;}}>
  <header className="screenshot-slideshow-header"><div><h2 id={headingId}>Screenshots</h2><p role="status" aria-live="polite">Screenshot {index+1} of {frames.length} · Frame {frame.index??index+1}</p></div><div><AnnotationToggle enabled={annotationsEnabled} onChange={setAnnotationsEnabled}/><button ref={closeButton} type="button" className="screenshot-slideshow-icon" onClick={onClose} aria-label="Close screenshot slideshow"><Icon name="close" size={20}/></button></div></header>
  <div className="screenshot-slideshow-stage">
   {source&&failedSource!==source?<EvidenceMedia annotation={annotationForFrame(annotations,frame)} enabled={annotationsEnabled}><img key={source} src={source} alt={`Captured screen, frame ${frame.index??index+1}${url?`: ${url}`:''}`} onError={()=>setFailedSource(source)}/></EvidenceMedia>:<div className="screenshot-slideshow-empty" role="status"><Icon name="film" size={32}/><p>This screenshot is unavailable.</p><span>You can still browse the other frames.</span></div>}
  </div>
  <footer className="screenshot-slideshow-footer">
   <div className="screenshot-slideshow-context"><span>{hasTime?`Frame captured at ${clock(frame.videoMs)} · original recording`:'Time not recorded'}{frame.linked&&' · Linked evidence'}</span>{url&&<p title={url}>{url}</p>}</div>
   <div className="screenshot-slideshow-controls"><div className="screenshot-slideshow-links">{hasTime&&<button type="button" onClick={()=>{onClose();onSeek(frame.videoMs);}}><Icon name="play" size={14}/>View in recording</button>}{source&&<a href={source} target="_blank" rel="noreferrer">Open original<Icon name="external" size={13}/></a>}</div><div className="screenshot-slideshow-navigation" aria-label="Screenshot navigation"><button type="button" disabled={index===0} onClick={previous} aria-label="Previous screenshot"><Icon name="back" size={16}/><span>Previous</span></button><button type="button" disabled={index===frames.length-1} onClick={next} aria-label="Next screenshot"><span>Next</span><Icon name="arrow" size={16}/></button></div></div>
  </footer>
 </dialog>,document.body);
}
