import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {clock,label,originalToReplay} from './lib';
import type {Row} from './lib';
import {Icon} from './icons';
import {momentFrame,momentSignal,TONES} from './moment-signals';
import tracks from '../../shared/journey-categories.json';

type Track=typeof tracks[number];
type Preview={anchor:HTMLButtonElement}&({entry:Row,track?:never}|{entry?:never,track:Track});

export function Timeline({run,markers,mode,duration,time,onJump,onSeek,compact=false}:{run:Row,markers:Row[],mode:string,duration:number,time:number,onJump:(ms:number,entry:Row)=>void,onSeek:(ms:number)=>void,compact?:boolean}) {
  const [zoom,setZoom]=useState(1),[hidden,setHidden]=useState<string[]>([]);
  const [preview,setPreview]=useState<Preview|null>(null),[position,setPosition]=useState({left:12,top:12,width:320,maxHeight:640}),[failedFrame,setFailedFrame]=useState('');
  const card=useRef<HTMLDivElement>(null),closeTimer=useRef<ReturnType<typeof setTimeout>|null>(null),pointerInCard=useRef(false);
  const previewId=useId();
  const cancelClose=()=>{if(closeTimer.current)clearTimeout(closeTimer.current);closeTimer.current=null;};
  const close=()=>{cancelClose();pointerInCard.current=false;setPreview(null);};
  const scheduleClose=()=>{cancelClose();closeTimer.current=setTimeout(()=>{if(!pointerInCard.current&&document.activeElement!==preview?.anchor)setPreview(null);},140);};
  function show(entry:Row,anchor:HTMLButtonElement){cancelClose();setPreview({entry,anchor});}
  function showTrack(track:Track,anchor:HTMLButtonElement){cancelClose();setPreview({track,anchor});}
  useEffect(()=>()=>cancelClose(),[]);
  useEffect(()=>{close();},[run.id,mode,zoom,hidden.join(',')]);
  useEffect(()=>{
    if(!preview)return;
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();close();}};
    const outside=(e:PointerEvent)=>{if(!card.current?.contains(e.target as Node)&&!preview.anchor.contains(e.target as Node))close();};
    const scroll=(e:Event)=>{if(!preview.track&&!card.current?.contains(e.target as Node))close();};
    window.addEventListener('keydown',escape,true);window.addEventListener('pointerdown',outside);
    window.addEventListener('resize',close);window.addEventListener('scroll',scroll,true);
    return()=>{window.removeEventListener('keydown',escape,true);window.removeEventListener('pointerdown',outside);window.removeEventListener('resize',close);window.removeEventListener('scroll',scroll,true);};
  },[preview]);
  useLayoutEffect(()=>{
    if(!preview||!card.current)return;
    const place=()=>{
      if(!card.current)return;
      const anchor=preview.anchor.getBoundingClientRect(),width=Math.min(preview.track?280:340,window.innerWidth-24);
      const height=card.current.scrollHeight+card.current.offsetHeight-card.current.clientHeight;
      const above=Math.max(0,anchor.top-24),below=Math.max(0,window.innerHeight-anchor.bottom-24);
      // Keep the preview off its trigger so hovering never blocks the next click.
      const placeAbove=above>=height||(below<height&&above>below),maxHeight=placeAbove?above:below;
      const next={width,maxHeight,left:Math.max(12,Math.min(window.innerWidth-width-12,anchor.left+anchor.width/2-width/2)),top:placeAbove?anchor.top-Math.min(height,maxHeight)-12:anchor.bottom+12};
      setPosition(old=>old.width===next.width&&old.left===next.left&&old.top===next.top&&old.maxHeight===next.maxHeight?old:next);
    };
    const followTrack=()=>{
      const anchor=preview.anchor.getBoundingClientRect();
      if(anchor.bottom<=0||anchor.top>=window.innerHeight||anchor.right<=0||anchor.left>=window.innerWidth)close();else place();
    };
    const observer=new ResizeObserver(place);observer.observe(card.current);place();
    if(preview.track)window.addEventListener('scroll',followTrack,true);
    return()=>{observer.disconnect();window.removeEventListener('scroll',followTrack,true);};
  },[preview]);
  const entry=preview?.entry,signal=entry?momentSignal(run,entry):null,frame=entry?momentFrame(run,entry):null;
  return <div className={`timeline ${compact?'timeline-compact':''}`}>
    <div className="timeline-header"><span className="eyebrow">{compact?'Frame by frame':'THE EXPERIENCE, FRAME BY FRAME'}</span><button className="text-button" onClick={()=>setZoom(zoom===1?2:1)}><Icon name="search" size={13}/>{zoom===1?'Zoom in':'Fit timeline'}</button></div>
    <div className="timeline-legend" aria-label="Moment tone color legend"><span>Moment tone</span>{TONES.map(t=><span key={t.key} className={`tone-legend-item tone-${t.key}`}><i aria-hidden="true">{t.symbol}</i>{t.label}</span>)}</div>
    <div className="tracks-scroller"><div className="tracks" style={{minWidth:zoom===2?'130%':undefined}}>
      <div className="ruler"><span/><div>{[0,.2,.4,.6,.8,1].map(f=><span key={f} style={{left:`${f*100}%`}}>{clock(duration*f)}</span>)}</div></div>
      {tracks.map(track=>{const {key,name}=track;return <div className={`track track-${key}`} key={key}>
        <button type="button" className="track-name" onClick={()=>setHidden(v=>v.includes(key)?v.filter(x=>x!==key):[...v,key])} aria-pressed={!hidden.includes(key)}
          aria-describedby={preview?.track?.key===key?previewId:undefined}
          onPointerEnter={e=>{if(e.pointerType!=='touch')showTrack(track,e.currentTarget);}} onPointerLeave={e=>{if(document.activeElement!==e.currentTarget)scheduleClose();}}
          onFocus={e=>showTrack(track,e.currentTarget)} onBlur={scheduleClose}>
          <span className={`track-dot ${key}`}/>{name}<Icon name={hidden.includes(key)?'eyeOff':'eye'} size={12}/></button>
        <div className="track-bed" onClick={e=>{if(e.target!==e.currentTarget)return;const rect=e.currentTarget.getBoundingClientRect();onSeek((e.clientX-rect.left)/rect.width*duration);}}>
          <span className="playhead" style={{left:`${duration?Math.min(100,time/duration*100):0}%`}}/>
          {!hidden.includes(key)&&markers.filter(m=>m.track===key&&m.originalMs!=null).map((m,i)=>{
            const ms=mode==='condensed'?originalToReplay(run,m.originalMs):m.originalMs,tone=momentSignal(run,m).tone;
            return ms==null||!duration?null:<button key={m.id||i} className={`timeline-marker tone-${tone.key} ${m.markerKind==='finding'?'marker-finding':''}`} style={{left:`${Math.max(0,Math.min(99,ms/duration*100))}%`}}
              data-marker-id={m.id} data-tone={tone.key} aria-label={`${name}: ${m.title}. Moment tone: ${tone.label}. ${clock(m.originalMs)} original. Click to jump.`}
              aria-describedby={preview?.entry?.id===m.id?previewId:undefined}
              onPointerEnter={e=>{if(e.pointerType!=='touch')show(m,e.currentTarget);}} onPointerLeave={e=>{if(document.activeElement!==e.currentTarget)scheduleClose();}}
              onFocus={e=>show(m,e.currentTarget)} onBlur={scheduleClose}
              onClick={()=>{if(compact)close();onJump(m.originalMs,m);}}><span aria-hidden="true"/></button>;
          })}
        </div>
      </div>;})}
    </div></div>
    {preview?.track&&createPortal(<div ref={card} id={previewId} role="tooltip" className="track-description" style={position}
      onPointerEnter={()=>{pointerInCard.current=true;cancelClose();}} onPointerLeave={()=>{pointerInCard.current=false;scheduleClose();}}>
      <strong><span className={`track-dot ${preview.track.key}`}/>{preview.track.name}</strong>
      <p>{preview.track.description}</p>
    </div>,document.body)}
    {preview&&entry&&signal&&createPortal(<div ref={card} id={previewId} role="tooltip" className={`moment-preview tone-${signal.tone.key}`} style={position} onPointerEnter={()=>{pointerInCard.current=true;cancelClose();}} onPointerLeave={()=>{pointerInCard.current=false;scheduleClose();}}>
      <div className="moment-preview-frame">{frame&&failedFrame!==frame.src?<img key={frame.src} src={frame.src} alt={`Captured screen for ${entry.title}`} onError={()=>setFailedFrame(frame.src)}/>:<span><Icon name="film" size={25}/>{frame?'Frame unavailable':'No frame captured'}</span>}
        {frame&&<small>{frame.nearby?'Nearby frame':'Recorded frame'}{frame.ms!=null?` · ${clock(frame.ms)}`:''}</small>}
      </div>
      <div className="moment-preview-body"><div className="moment-preview-meta"><span>{label(entry.track)}{entry.claimStatus==='hypothesis'?' · Hypothesis':entry.markerKind==='finding'?' · Finding':''}</span><time>{clock(entry.originalMs)} · original</time></div>
        <h3>{entry.title||'Recorded moment'}</h3>
        <div className="moment-preview-signals"><span className="moment-tone"><i aria-hidden="true">{signal.tone.symbol}</i>{signal.tone.label}</span>{signal.friction!=null&&signal.friction>0&&<span className={signal.friction===3?'moment-blocked':''}>{['No friction','Mild friction','Disruptive friction','Blocked'][signal.friction]}</span>}{entry.markerKind==='finding'&&entry.impact&&<span>Impact · {label(entry.impact)}</span>}</div>
        {entry.claimStatus==='hypothesis'?<p>{entry.interpretation}</p>:entry.observation&&entry.observation!==entry.title&&<p>{entry.observation}</p>}
        {signal.reaction&&signal.reaction!==entry.title&&<blockquote>“{signal.reaction}”</blockquote>}
        <footer><span>{signal.source}</span><span>Click point to jump <Icon name="arrow" size={12}/></span></footer>
      </div>
    </div>,document.body)}
  </div>;
}
