import {useId,useMemo,useRef,useState} from 'react';
import type {CSSProperties,KeyboardEvent,ReactNode} from 'react';
import {Row,clock} from './lib';
import {Icon} from './icons';
import {buildEmotionArc} from './emotion-arc';
import {resolveReviewMoment} from './review-moment';
import {RelatedFixLinks} from './RelatedFixes';

type Point=ReturnType<typeof buildEmotionArc>['points'][number];
type Props={run:Row,selected:Row|null,currentMs:number,onJump:(entry:Row)=>void};
type ReviewLayout=(parts:{chart:ReactNode,moment:ReactNode})=>ReactNode;
const levels=[{value:2,key:'excellent',label:'Excellent'},{value:1,key:'positive',label:'Positive'},{value:0,key:'neutral',label:'Neutral'},{value:-1,key:'negative',label:'Negative'},{value:-2,key:'very-negative',label:'Very negative'}];
const y=(value:number)=>(2-value)/4*192+12;
function isSelected(point:Point,selected:Row|null){return selected?.emotionId?selected.emotionId===point.id:point.entry.eventIndex!=null&&selected?.eventIndex===point.entry.eventIndex;}

export function JourneyEmotionArc({run,selected,currentMs,onJump,children}:Props&{children?:ReviewLayout}){
 const arc=useMemo(()=>buildEmotionArc(run),[run]);
 return <EmotionArc run={run} arc={arc} selected={selected} currentMs={currentMs} renderReview={children} onJump={onJump}/>;
}

export function JourneyView({run,selected,currentMs,onJump,showArc=true}:Props&{showArc?:boolean}){
 const arc=useMemo(()=>buildEmotionArc(run),[run]);
 const jump=(point:Point)=>{if(point.ms!=null)onJump({...point.entry,emotionId:point.id,originalMs:point.ms});};
 if(!arc.points.length)return <div className="empty-state"><div className="empty-icon"><Icon name="experience" size={30}/></div><h3>No public comments captured</h3><p>The recording and technical events are still available.</p></div>;
 return <div className="journey-experience">
  {showArc&&<EmotionArc run={run} arc={arc} selected={selected} currentMs={currentMs} onJump={onJump}/>}
  <div className="journey-sequence-heading"><h2>Moment by moment</h2><span>{arc.summary.total} observations</span></div>
  <div className="journey-list">{arc.points.map(point=><button type="button" className={`journey-step tone-${point.tone.key} ${isSelected(point,selected)?'selected':''}`} key={point.id} aria-pressed={isSelected(point,selected)} onClick={()=>jump(point)} disabled={point.ms==null} title={point.ms==null?'This observation has no recording timestamp.':undefined}>
   <span className="journey-step-number">{String(point.index+1).padStart(2,'0')}</span><div><div className="journey-step-top"><span className="journey-tone"><i/>{point.tone.label}</span><time>{point.ms==null?'Time not captured':clock(point.ms)}</time></div><h3>{point.entry.reaction||'An observed moment'}</h3><p>{point.entry.observation}</p></div><Icon name={point.ms==null?'info':'play'} size={13}/>
  </button>)}</div>
 </div>;
}

function EmotionArc({run,arc,selected,currentMs,onJump,renderReview}:Props&{arc:ReturnType<typeof buildEmotionArc>,renderReview?:ReviewLayout}){
 const gradientId=useId().replaceAll(':',''),detailId=useId();
 const [hovered,setHovered]=useState<Point|null>(null),[focused,setFocused]=useState<Point|null>(null);
 const buttons=useRef(new Map<string,HTMLButtonElement>());
 const domain=Math.max(1,arc.durationMs??0);
 const active=arc.timedPoints.filter(p=>p.ms!<=currentMs).at(-1);
 const chosen=arc.timedPoints.find(p=>isSelected(p,selected));
 const detail=resolveReviewMoment(run,arc,selected,currentMs,hovered||focused);
 const jump=(point:Point)=>{if(point.ms!=null)onJump({...point.entry,emotionId:point.id,originalMs:point.ms});};
 const selectedId=chosen?.id;
 const cursor=Math.min(100,Math.max(0,currentMs/domain*100));
 const pointStyle=(point:Point):CSSProperties=>({left:`${point.ms!/domain*100}%`,top:point.value==null?'50%':`${y(point.value)/216*100}%`});
 function keyboard(e:KeyboardEvent<HTMLButtonElement>,point:Point){
  const index=arc.timedPoints.findIndex(p=>p.id===point.id);let next:number|null=null;
  if(e.key==='ArrowRight'||e.key==='ArrowDown')next=Math.min(arc.timedPoints.length-1,index+1);
  if(e.key==='ArrowLeft'||e.key==='ArrowUp')next=Math.max(0,index-1);
  if(e.key==='Home')next=0;if(e.key==='End')next=arc.timedPoints.length-1;
  if(e.key==='Escape'){setFocused(null);setHovered(null);e.currentTarget.blur();}
  if(next!=null){e.preventDefault();buttons.current.get(arc.timedPoints[next].id)?.focus();}
 }
 const pointButton=(point:Point)=><button key={point.id} ref={el=>{if(el)buttons.current.set(point.id,el);else buttons.current.delete(point.id);}} type="button" className={`emotion-point tone-${point.tone.key} ${selectedId===point.id?'is-selected':''} ${active?.id===point.id?'is-current':''}`} style={pointStyle(point)} data-point-id={point.id} data-original-ms={point.ms} data-valence={point.value??'unrated'} aria-label={`${point.tone.label} at ${clock(point.ms)}: ${point.entry.reaction||point.entry.observation||'Recorded observation'}. Jump to recording.`} aria-describedby={detail?.pointId===point.id?detailId:undefined} aria-pressed={selectedId===point.id} onPointerEnter={e=>{if(e.pointerType!=='touch')setHovered(point);}} onPointerLeave={()=>setHovered(null)} onFocus={()=>setFocused(point)} onBlur={()=>setFocused(null)} onKeyDown={e=>keyboard(e,point)} onClick={()=>jump(point)}><span aria-hidden="true"/></button>;
 const chart=<>
  <header className="emotion-arc-heading"><div><h2>Emotional arc</h2><p>The highs, the lows, and the moments between.</p></div><span className="emotion-origin"><Icon name="personas" size={13}/>Persona signals</span></header>
  {arc.high&&arc.low&&<div className="emotion-extremes">{arc.high.value===arc.low.value?<span className={`emotion-flat tone-${arc.high.tone.key}`}><i/>Rated moments · {arc.high.tone.label}</span>:[{name:'High point',point:arc.high,icon:'arrow'},{name:'Low point',point:arc.low,icon:'arrow'}].map(({name,point})=><button key={name} className={`emotion-extreme tone-${point.tone.key}`} onClick={()=>jump(point)}><span>{name}</span><strong><i/>{point.tone.label}</strong><time>{clock(point.ms)}</time><Icon name="play" size={11}/></button>)}</div>}
  <div className="emotion-graph" role="group" aria-label="Emotion timeline. Use arrow keys to explore points, Enter to jump to the recording.">
   <div className="emotion-y-axis" aria-hidden="true">{levels.map(level=><span key={level.key} className={`tone-${level.key}`} style={{top:`${y(level.value)/216*100}%`}}>{level.label}</span>)}</div>
   <div className="emotion-plot">
    <svg viewBox="0 0 1000 216" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0" y1="12" x2="0" y2="204"><stop offset="0%" stopColor="#08766d"/><stop offset="25%" stopColor="#318354"/><stop offset="50%" stopColor="#68778a"/><stop offset="75%" stopColor="#b76409"/><stop offset="100%" stopColor="#c43850"/></linearGradient></defs>
     <rect x="0" y="12" width="1000" height="96" className="emotion-positive-zone"/><rect x="0" y="108" width="1000" height="96" className="emotion-negative-zone"/>
     {levels.map(level=><line key={level.value} x1="0" x2="1000" y1={y(level.value)} y2={y(level.value)} className={level.value===0?'emotion-grid neutral-line':'emotion-grid'}/>)}
     {arc.segments.filter(segment=>segment.length>1).map((segment,i)=><path key={i} className="emotion-line" d={segment.map((point,index)=>`${index?'L':'M'} ${point.ms!/domain*1000} ${y(point.value!)}`).join(' ')} stroke={`url(#${gradientId})`} vectorEffect="non-scaling-stroke"/>)}
    </svg>
    {arc.timedPoints.filter(p=>p.value!=null).map(pointButton)}
    {arc.timedPoints.length>0&&<div className="emotion-playhead" style={{left:`${cursor}%`}} aria-hidden="true"><span/></div>}
    {!arc.ratedPoints.length&&<p className="emotion-plot-empty">No timed emotion ratings</p>}
   </div>
  </div>
  {arc.unratedPoints.length>0&&<div className="emotion-unrated-row"><span>Unrated</span><div className="emotion-unrated-rail">{arc.unratedPoints.map(pointButton)}</div></div>}
  <div className="emotion-x-axis" aria-hidden="true"><div>{arc.durationMs==null?<span className="emotion-time-unknown">Time not captured</span>:(arc.durationMs===0?[0]:[0,.25,.5,.75,1]).map((fraction,i)=><time className={i%2?'intermediate-tick':''} key={fraction} style={{left:`${fraction*100}%`}}>{arc.durationMs!<1000?`${Math.round(arc.durationMs!*fraction)} ms`:clock(arc.durationMs!*fraction)}</time>)}</div></div>
  <div className="emotion-chart-caption"><span>{arc.summary.rated} rated{arc.summary.unrated>0?` · ${arc.summary.unrated} unrated`:''}{arc.summary.unplaced>0?` · ${arc.summary.unplaced} without timestamps`:''}</span><span>Original recording time</span></div>
 </>;
 const moment=detail&&<div className={`emotion-moment tone-${detail.tone.key}`} id={detailId}>
   <div className="emotion-moment-heading"><span><i/>{detail.tone.label}</span>{detail.track&&<small className="emotion-moment-source">{detail.track}{detail.entry.claimStatus==='hypothesis'?' · Hypothesis':detail.finding?' · Finding':''}</small>}{detail.ms!=null?<button onClick={()=>onJump({...detail.entry,originalMs:detail.ms})} aria-label={`Replay ${detail.finding?'finding':`${detail.tone.label.toLowerCase()} moment`} at ${clock(detail.ms)}`}><Icon name="play" size={12}/>{clock(detail.ms)}<span>Replay moment</span></button>:<small>Time not captured</small>}</div>
   <div className="emotion-moment-persona">{detail.title&&<h3 className="emotion-moment-title">{detail.title}</h3>}{detail.entry.claimStatus==='hypothesis'?<span className="emotion-moment-label">{detail.entry.provenance==='review-hypothesis'?'Added during review':'Business hypothesis'} · Unmeasured</span>:<><span className="emotion-moment-label">AI Persona reaction</span><p className="emotion-moment-reaction">{detail.reaction||'No public persona reaction recorded for this moment.'}</p></>}</div>
   {detail.sections.length>0&&<div className="emotion-moment-context">
    {detail.sections.map(section=><div className="emotion-moment-observation" key={section.label}><span>{section.label}</span><p>{section.text}</p></div>)}
   </div>}
   <RelatedFixLinks entry={detail.entry}/>
  </div>;
 const chartPanel=<section className="emotion-arc" aria-label="Emotional arc, recorded persona signals over original recording time">{chart}{!renderReview&&moment}</section>;
 return renderReview?renderReview({chart:chartPanel,moment}):chartPanel;
}
