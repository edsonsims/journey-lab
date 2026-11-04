import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Row,clock,list,person,safeMedia} from './lib';
import {Icon} from './icons';
import './fix-code-review.css';

type Visual={title:string;credit:string;caption:string;src?:string};
function proposalImage(value:unknown){return typeof value==='string'&&/^\/api\/workspace\/media-assist\/assets\/[a-f0-9-]+\.png$/.test(value)?value:undefined;}

export function FixDesignEvidence({round,after,onWatch}:{round:Row;after:Row|null;onWatch:()=>void}){
 const proposal=round.designProposal;
 const frames=list(after?.events).filter(frame=>safeMedia(frame.screenshot));
 const [selected,setSelected]=useState(''),[expanded,setExpanded]=useState<number|null>(null);
 const frame=frames.find(item=>String(item.index)===selected)||frames[0];
 if(!proposal)return null;
 const visuals:Visual[]=[
  {title:'Original screen',credit:'Recorded starting point',caption:`Source frame ${proposal.source?.eventIndex??'—'}${typeof proposal.source?.originalMs==='number'?` · ${clock(proposal.source.originalMs)}`:''}`,src:safeMedia(proposal.source?.screenshot)},
  {title:'Visual proposal',credit:proposal.model==='muse-image-1.0'?'Designed with Muse Image':proposal.model||'Generated concept',caption:'Saved concept · visual direction',src:proposalImage(proposal.imageUrl)},
  {title:'Implemented result',credit:'Implemented with Muse Code',caption:frame?`Candidate frame ${frame.index}${typeof frame.videoMs==='number'?` · ${clock(frame.videoMs)}`:''}`:'Waiting for a recorded candidate',src:safeMedia(frame?.screenshot)},
 ];
 return <section className="fix-design-evidence" aria-label="From image to implementation">
  <header className="design-story-heading"><div><span className="eyebrow">THE DESIGN BEHIND THE CHANGE</span><h2>From image to implementation</h2><p>A captured screen becomes a visual direction, then a working candidate.</p></div><span className="design-round">Round {round.number}</span></header>
  <div className="design-story-grid">{visuals.map((visual,index)=><figure key={visual.title} className={`design-story-card design-story-card-${index}`}>
   <figcaption><span className="design-step-number">0{index+1}</span><div><h3>{visual.title}</h3><p>{visual.credit}</p></div>{index<2&&<Icon name="arrow" size={17}/>}</figcaption>
   <VisualImage key={visual.src||'missing'} visual={visual} onOpen={()=>setExpanded(index)}/>
   <div className="design-image-caption"><span>{visual.caption}</span>{visual.src&&<span aria-hidden="true"><Icon name="external" size={12}/>Enlarge</span>}</div>
  </figure>)}</div>
  <div className="design-story-context"><p><Icon name="spark" size={16}/><span>The proposal guides the layout. The recorded candidate shows what was actually built.</span></p>{after&&frames.length>0&&<label>Candidate screen<select aria-label="Candidate screenshot" value={String(frame?.index??'')} onChange={event=>setSelected(event.target.value)}>{frames.map(item=><option key={item.index} value={String(item.index)}>Frame {item.index}{typeof item.videoMs==='number'?` · ${clock(item.videoMs)}`:''}</option>)}</select><span>{person(after)}</span></label>}</div>
  <details className="design-brief"><summary><Icon name="edit" size={15}/><span>View design brief & handoff</span><Icon name="down" size={14}/></summary><div className="design-brief-columns"><div><span className="eyebrow">PROMPT TO {proposal.model==='muse-image-1.0'?'MUSE IMAGE':'THE IMAGE MODEL'}</span><p>{proposal.prompt||'No design prompt was saved.'}</p></div><div><span className="eyebrow">DIRECTION FOR MUSE CODE</span><p>{round.requestMessage||'No implementation direction was saved.'}</p></div></div><small>Image model: {proposal.model||'Not recorded'} · Original saved proposal</small></details>
  {round.comparison?.status==='completed'&&<div className="design-retest"><div><Icon name="film" size={18}/><span><strong>Follow the change into the journey</strong><small>Muse Wonder · recorded synthetic before / after sessions</small></span></div><button type="button" onClick={onWatch}>Watch the retest<Icon name="arrow" size={15}/></button></div>}
  {expanded!==null&&<DesignLightbox visuals={visuals} initial={expanded} onClose={()=>setExpanded(null)}/>}
 </section>;
}

function VisualImage({visual,onOpen}:{visual:Visual;onOpen:()=>void}){
 const [failed,setFailed]=useState(false);
 return visual.src&&!failed?<button type="button" className="design-image-button" onClick={onOpen} aria-label={`Enlarge ${visual.title.toLowerCase()}`}><img src={visual.src} alt={visual.title} onError={()=>setFailed(true)}/><span className="design-image-zoom"><Icon name="external" size={18}/></span></button>:<div className="design-image-unavailable"><Icon name="film" size={26}/><span>{failed?'Image unavailable':'No saved image yet'}</span></div>;
}

function DesignLightbox({visuals,initial,onClose}:{visuals:Visual[];initial:number;onClose:()=>void}){
 const [index,setIndex]=useState(initial),[failed,setFailed]=useState<string|null>(null);
 const dialog=useRef<HTMLDialogElement>(null),close=useRef<HTMLButtonElement>(null),title=useId(),visual=visuals[index];
 useEffect(()=>{const el=dialog.current,opener=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;if(!el)return;el.showModal();document.body.style.overflow='hidden';close.current?.focus();return()=>{el.close();document.body.style.overflow=overflow;if(opener?.isConnected)opener.focus({preventScroll:true});};},[]);
 return createPortal(<dialog ref={dialog} className="design-lightbox" aria-labelledby={title} onCancel={event=>{event.preventDefault();onClose();}} onKeyDown={event=>{if(event.altKey||event.ctrlKey||event.metaKey)return;if(event.key==='ArrowRight'){event.preventDefault();setIndex(value=>Math.min(visuals.length-1,value+1));}if(event.key==='ArrowLeft'){event.preventDefault();setIndex(value=>Math.max(0,value-1));}}}>
  <header><div><span>{visual.credit}</span><h2 id={title}>{visual.title}</h2></div><button ref={close} type="button" onClick={onClose} aria-label="Close design preview"><Icon name="close" size={22}/></button></header>
  <div className="design-lightbox-stage">{visual.src&&failed!==visual.src?<img src={visual.src} alt={visual.title} onError={()=>setFailed(visual.src!)}/>:<p>This image is unavailable.</p>}</div>
  <footer><span aria-live="polite">{index+1} / {visuals.length} · {visual.caption}</span><div>{visual.src&&<a href={visual.src} target="_blank" rel="noreferrer">Open original<Icon name="external" size={14}/></a>}<button type="button" disabled={index===0} onClick={()=>setIndex(index-1)} aria-label="Previous design image"><Icon name="back" size={18}/></button><button type="button" disabled={index===visuals.length-1} onClick={()=>setIndex(index+1)} aria-label="Next design image"><Icon name="arrow" size={18}/></button></div></footer>
 </dialog>,document.body);
}
