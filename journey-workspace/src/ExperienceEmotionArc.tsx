import {useEffect,useId,useRef,useState} from 'react';
import type {KeyboardEvent} from 'react';
import {Icon} from './icons';
import {clock} from './lib';
import type {Row} from './lib';
import type {buildEmotionArc,EmotionPoint} from './emotion-arc';
import './experience-emotion-arc.css';

type Props={arc:ReturnType<typeof buildEmotionArc>;selected:Row|undefined;onSelect:(moment:Row)=>void};
const momentId=(moment:Row,index=0)=>String(moment.id||`${moment.runId}:${moment.signalIndex??moment.eventIndex??index}:${moment.originalMs??'unknown'}`);
const levels=[{value:2,label:'Excellent'},{value:1,label:'Positive'},{value:0,label:'Neutral'},{value:-1,label:'Negative'},{value:-2,label:'Very negative'}];
const y=(value:number)=>10+(2-value)/4*80;

export function ExperienceEmotionArc({arc,selected,onSelect}:Props){
 const headingId=useId(),hintId=useId(),refs=useRef(new Map<string,HTMLButtonElement>());
 const points=arc.ratedPoints,timed=arc.timedPoints,domain=Math.max(1,arc.durationMs??0);
 const browsable=[...timed,...arc.unplacedPoints];
 const chosen=selected?arc.points.find(point=>momentId(point.entry)===momentId(selected)):undefined;
 const index=chosen?browsable.findIndex(point=>point.id===chosen.id):-1;
 const [focusId,setFocusId]=useState<string|null>(null);
 const tabStop=points.find(point=>point.id===focusId)?.id||(chosen&&points.some(point=>point.id===chosen.id)?chosen.id:points[0]?.id);
 useEffect(()=>{setFocusId(chosen&&points.some(point=>point.id===chosen.id)?chosen.id:null);},[chosen?.id]);
 const x=(ms:number)=>4+ms/domain*92;
 function keydown(event:KeyboardEvent<HTMLButtonElement>,point:EmotionPoint){
  const current=points.findIndex(item=>item.id===point.id);let next:number|null=null;
  if(['ArrowRight','ArrowDown'].includes(event.key))next=Math.min(points.length-1,current+1);
  if(['ArrowLeft','ArrowUp'].includes(event.key))next=Math.max(0,current-1);
  if(event.key==='Home')next=0;if(event.key==='End')next=points.length-1;
  if(next!==null&&points[next]){event.preventDefault();setFocusId(points[next].id);refs.current.get(points[next].id)?.focus();}
 }
 const missing=[arc.summary.unrated?`${arc.summary.unrated} unrated`:null,arc.summary.unplaced?`${arc.summary.unplaced} without timestamps`:null].filter(Boolean);
 return <section className="eac" aria-labelledby={headingId}>
  <header className="eac-heading"><h3 id={headingId}>Emotional arc</h3><span>{arc.summary.rated} rated moments</span></header>
  <p id={hintId} className="sr-only">Choose a point to inspect its recorded reaction. Arrow keys explore points; Enter selects. Previous and next include unrated moments. Moments without timestamps follow the timed moments.</p>
  <div className="eac-chart"><div className="eac-levels" aria-hidden="true">{levels.map(level=><span key={level.value} style={{top:`${y(level.value)}%`}}>{level.label}</span>)}</div>
   <div className="eac-plot" role="group" aria-label="Recorded emotional arc points" aria-describedby={hintId}>
    <svg viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true">
     <rect x="40" y="20" width="920" height="80" className="eac-positive-zone"/><rect x="40" y="100" width="920" height="80" className="eac-negative-zone"/>
     {levels.map(level=><line x1="40" x2="960" y1={y(level.value)*2} y2={y(level.value)*2} key={level.value} className={level.value===0?'eac-grid eac-neutral':'eac-grid'}/>)}
     {arc.segments.filter(segment=>segment.length>1).map((segment,i)=><path key={i} d={segment.map((point,j)=>`${j?'L':'M'} ${x(point.ms!)*10} ${y(point.value!)*2}`).join(' ')} className="eac-line" vectorEffect="non-scaling-stroke"/>)}
    </svg>
    {chosen?.ms!=null&&<span className="eac-selected-time" style={{left:`${x(chosen.ms)}%`}} aria-hidden="true"/>}
    {points.map(point=><button type="button" key={point.id} ref={element=>{if(element)refs.current.set(point.id,element);else refs.current.delete(point.id);}} tabIndex={tabStop===point.id?0:-1} className={`eac-point eac-tone-${point.tone.key} ${chosen?.id===point.id?'is-selected':''}`} style={{left:`${x(point.ms!)}%`,top:`${y(point.value!)}%`}} data-original-ms={point.ms} aria-label={`${point.tone.label} at ${clock(point.ms)}: ${point.entry.reaction||point.entry.observation||'Recorded moment'}`} aria-pressed={chosen?.id===point.id} title={`${clock(point.ms)} · ${point.entry.reaction||point.entry.observation||point.tone.label}`} onFocus={()=>setFocusId(point.id)} onKeyDown={event=>keydown(event,point)} onClick={()=>onSelect(point.entry)}><span/></button>)}
    {!points.length&&<p className="eac-empty">{arc.points.length?'No timed emotion ratings':'No recorded reactions'}</p>}
   </div>
  </div>
  <div className="eac-axis" aria-hidden="true"><time>0:00</time><span>Original recording time</span><time>{arc.durationMs===null?'—':clock(arc.durationMs)}</time></div>
  <div className="eac-selection"><div className={`eac-current eac-tone-${chosen?.tone.key||'unrated'}`} role="status"><strong><i/>{chosen?chosen.tone.label:'Choose a moment'}{chosen&&<time>{chosen.ms!=null?clock(chosen.ms):'Time not recorded'}</time>}</strong><span>{index>=0?`${index+1} of ${browsable.length} moments`:browsable.length?`${browsable.length} recorded moments`:'No recorded moments'}</span></div><div className="eac-step-controls" role="group" aria-label="Browse recorded moments"><button type="button" aria-label="Previous moment" title="Previous moment" disabled={index<=0} onClick={()=>onSelect(browsable[index-1].entry)}><Icon name="back" size={14}/></button><button type="button" aria-label="Next moment" title="Next moment" disabled={!browsable.length||index===browsable.length-1} onClick={()=>onSelect(browsable[index+1].entry)}><Icon name="arrow" size={14}/></button></div></div>
  {missing.length>0&&<p className="eac-missing">{missing.join(' · ')}. Browse all moments with the arrows.{arc.summary.unplaced>0&&' Untimed moments follow the timed moments.'}</p>}
 </section>;
}
