import {useEffect,useMemo,useRef,useState} from 'react';
import type {KeyboardEvent} from 'react';
import {clock} from './lib';
import {Icon} from './icons';
import {comparisonAt,emotionChangePoints} from './emotion-comparison';
import type {ComparisonPoint,ComparisonSideName,ComparisonSignal,EmotionComparison} from './emotion-comparison';

const levels=[{value:2,key:'excellent',label:'Excellent'},{value:1,key:'positive',label:'Positive'},{value:0,key:'neutral',label:'Neutral'},{value:-1,key:'negative',label:'Negative'},{value:-2,key:'very-negative',label:'Very negative'}];
const y=(value:number)=>(2-value)/4*176+12;
const sideLabel=(side:ComparisonSideName)=>side==='before'?'Before':'After';
function signedClock(ms:number){return `${ms<0?'−':''}${clock(Math.abs(ms))}`;}
function missingSignal(status:ComparisonSignal['status']){return ({not_started:'Recording has not started at this position.',finished:'Recording has ended at this position.',unavailable:'No timed recording context available.',too_distant:'No emotion signal within 5 seconds of this position.',unrated:'This moment has no recorded emotion rating.',no_signal:'No emotion signal captured.'})[status as Exclude<ComparisonSignal['status'],'recorded'>]||'No recorded signal.';}

export function FixEmotionComparison({model,beforeMs,afterMs,linked,commonMs,onSeek,onPair,labels={before:'Before',after:'After'},showTimeShortcuts=true}:{labels?:{before:string;after:string};showTimeShortcuts?:boolean;model:EmotionComparison,beforeMs:number,afterMs:number,linked:boolean,commonMs:number,onSeek:(ms:number,side?:ComparisonSideName,point?:ComparisonPoint)=>void,onPair:(beforeMs:number,afterMs:number)=>void}){
 const sideLabel=(side:ComparisonSideName)=>labels[side];
 const [hover,setHover]=useState<ComparisonPoint|null>(null),[focus,setFocus]=useState<ComparisonPoint|null>(null),[selected,setSelected]=useState<{ms:number,id?:string}|null>(null);
 const [lastSide,setLastSide]=useState<ComparisonSideName>('before');
 const refs=useRef(new Map<string,HTMLButtonElement>());
 const changes=useMemo(()=>emotionChangePoints(model),[model]);
 const start=model.domain?.startMs??0,end=model.domain?.endMs??0,span=Math.max(1,end-start);
 const x=(ms:number)=>(ms-start)/span*100;
 const ticks=model.domain?(span<=1?[start]:[0,.25,.5,.75,1].map(f=>start+f*span)):[];
 if(model.alignment==='milestone'&&start<0&&end>0){for(let i=ticks.length-2;i>0;i--)if(Math.abs(ticks[i])<span*.08)ticks.splice(i,1);ticks.push(0);ticks.sort((a,b)=>a-b);}
 const sourceMs=linked?commonMs:(lastSide==='before'?beforeMs-model.anchors.beforeMs:afterMs-model.anchors.afterMs);
 useEffect(()=>{setSelected(previous=>previous&&Math.abs(previous.ms-sourceMs)>400?null:previous);},[sourceMs]);
 const inspected=hover?.commonMs??focus?.commonMs??selected?.ms??sourceMs;
 const at=comparisonAt(model,inspected),points=[...model.before.points,...model.after.points].filter(p=>p.commonMs!=null).sort((a,b)=>a.commonMs!-b.commonMs!||a.side.localeCompare(b.side)||a.index-b.index);
 const pointKey=(point:ComparisonPoint)=>`${point.side}-${point.id}`;
 const jump=(ms:number,side?:ComparisonSideName,point?:ComparisonPoint)=>{setSelected({ms,id:point?pointKey(point):undefined});if(side)setLastSide(side);onSeek(ms,side,point);};
 function keydown(event:KeyboardEvent<HTMLButtonElement>,point:ComparisonPoint){
  const index=points.findIndex(p=>pointKey(p)===pointKey(point));let next:number|null=null;
  if(event.key==='ArrowRight'||event.key==='ArrowDown')next=Math.min(points.length-1,index+1);
  if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=Math.max(0,index-1);
  if(event.key==='Home')next=0;if(event.key==='End')next=points.length-1;
  if(event.key==='Escape'){setHover(null);setFocus(null);event.currentTarget.blur();}
  if(next!=null){event.preventDefault();refs.current.get(pointKey(points[next]))?.focus();}
 }
 const marker=(point:ComparisonPoint)=>{const key=pointKey(point);return <button type="button" key={key} ref={el=>{if(el)refs.current.set(key,el);else refs.current.delete(key);}} className={`comparison-emotion-point series-${point.side} tone-${point.tone.key} ${selected?.id===key?'selected':''}`} data-side={point.side} data-original-ms={point.ms} data-common-ms={point.commonMs} data-value={point.value??'unrated'} style={{left:`${x(point.commonMs!)}%`,top:point.value==null?'50%':`${y(point.value)/200*100}%`}} aria-label={`${sideLabel(point.side)} ${point.tone.label} at ${clock(point.ms)}: ${point.entry.reaction||point.entry.observation||'Recorded moment'}. Seek comparison.`} onPointerEnter={e=>{if(e.pointerType!=='touch')setHover(point);}} onPointerLeave={()=>setHover(null)} onFocus={()=>setFocus(point)} onBlur={()=>setFocus(null)} onKeyDown={e=>keydown(e,point)} onClick={()=>jump(point.commonMs!,point.side,point)}><span/></button>;};
 const unrated=points.filter(point=>point.value==null);
 const hiddenCount=model.before.arc.summary.unplaced+model.after.arc.summary.unplaced;
 const changesToShow=[changes.find(c=>c.direction==='higher'),changes.find(c=>c.direction==='lower')].filter((c):c is typeof changes[number]=>!!c);
 const pairable=at.before.status==='recorded'&&at.after.status==='recorded'&&model.before.hasVideo&&model.after.hasVideo;
 return <section className="fix-emotion-comparison" aria-label="Before and after emotional arcs">
  <header className="comparison-emotion-heading"><div><h2>Did it feel better?</h2><p>{labels.before} → {labels.after} · Recorded persona reactions</p></div><div className="comparison-emotion-legend"><span className="series-before"><i/>{labels.before}</span><span className="series-after"><i/>{labels.after}</span></div></header>
  {showTimeShortcuts&&changesToShow.length>0&&<div className="comparison-change-shortcuts" aria-label="Recorded tone changes">{changesToShow.map(change=><button key={change.id} className={`change-${change.direction}`} onClick={()=>jump(change.commonMs,'after',change.after)}><Icon name={change.direction==='higher'?'check':'activity'} size={12}/>{change.label}<time>{signedClock(change.commonMs)}</time></button>)}</div>}
  <div className="comparison-emotion-graph" role="group" aria-label="Before and after emotion timeline. Arrow keys explore points; Enter seeks both available recordings.">
   <div className="comparison-emotion-axis" aria-hidden="true">{levels.map(level=><span className={`tone-${level.key}`} key={level.value} style={{top:`${y(level.value)/200*100}%`}}>{level.label}</span>)}</div>
   <div className="comparison-emotion-plot" onClick={event=>{if(event.target!==event.currentTarget||!model.domain)return;const rect=event.currentTarget.getBoundingClientRect();jump(start+(event.clientX-rect.left)/rect.width*span);}}>
    <svg viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true"><rect className="emotion-positive-zone" x="0" y="12" width="1000" height="88"/><rect className="emotion-negative-zone" x="0" y="100" width="1000" height="88"/>{levels.map(level=><line key={level.value} x1="0" x2="1000" y1={y(level.value)} y2={y(level.value)} className={level.value===0?'emotion-grid neutral-line':'emotion-grid'}/>)}
     {model.overlap&&model.overlap.startMs>start&&<rect className="comparison-outside-overlap" x="0" y="12" width={x(model.overlap.startMs)*10} height="176"/>}
     {model.overlap&&model.overlap.endMs<end&&<rect className="comparison-outside-overlap" x={x(model.overlap.endMs)*10} y="12" width={1000-x(model.overlap.endMs)*10} height="176"/>}
     {(['before','after'] as const).map(side=>model[side].segments.filter(segment=>segment.length>1).map((segment,index)=><path className={`comparison-emotion-line series-${side}`} key={`${side}-${index}`} d={segment.map((point,i)=>`${i?'L':'M'} ${x(point.commonMs!)*10} ${y(point.value!)}`).join(' ')} vectorEffect="non-scaling-stroke"/>))}
    </svg>
    {points.filter(p=>p.value!=null).map(marker)}
    {model.alignment==='milestone'&&<div className="comparison-anchor" style={{left:`${x(0)}%`}} aria-hidden="true"><span>Paired</span></div>}
    {(['before','after'] as const).map(side=>{const now=(side==='before'?beforeMs:afterMs)-model[side].anchorMs;return model[side].hasVideo&&now>=start&&now<=end?<div key={side} className={`comparison-arc-playhead series-${side}`} data-side={side} data-common-ms={now} style={{left:`${x(now)}%`}} aria-hidden="true"><span>{side==='before'?'B':'A'}</span></div>:null;})}
    {(hover||focus||selected)&&<div className="comparison-inspection-line" style={{left:`${x(inspected)}%`}} aria-hidden="true"/>}
    {!points.some(p=>p.value!=null)&&<p className="emotion-plot-empty">No timed emotion ratings available for this pair</p>}
   </div>
  </div>
  {unrated.length>0&&<div className="comparison-unrated-row"><span>Unrated</span><div>{unrated.map(marker)}</div></div>}
  <div className="comparison-emotion-ticks" aria-hidden="true"><div>{model.domain?ticks.map((time,i)=><time className={i%2&&time!==0?'intermediate-tick':''} key={time} style={{left:`${x(time)}%`}}>{span<1000?`${Math.round(time)} ms`:signedClock(time)}</time>):<span>Time not captured</span>}</div></div>
  <div className="comparison-emotion-caption"><span>{model.alignment==='milestone'?'Time from paired milestone':'Original recording time'}{hiddenCount?` · ${hiddenCount} untimed observations`:''}</span>{model.overlap&&model.overlap.endMs<end&&<span>Shaded tail: only one recording continues</span>}</div>
  <div className={`comparison-tone-review change-${at.direction}`}><div className="comparison-tone-review-heading"><div><strong>{at.label}</strong><span>{at.basis==='paired_milestone'?'At the moments you paired':'Closest recorded moments · actions may differ'}</span></div>{pairable&&<button className="text-button" onClick={()=>{setSelected({ms:0});setHover(null);setFocus(null);onPair(at.before.point!.ms!,at.after.point!.ms!);}}><Icon name="calibration" size={13}/>Align these moments</button>}</div>
   <div className="comparison-tone-quotes">{(['before','after'] as const).map(side=>{const signal=at[side],point=signal.point,recorded=signal.status==='recorded'||signal.status==='unrated';return <div key={side} className={`comparison-tone-quote series-${side} tone-${recorded?point?.tone.key:'unrated'}`}><div><strong><i/>{sideLabel(side)}</strong>{recorded&&point?<><span className="comparison-recorded-tone">{point.tone.label}</span><button onClick={()=>jump(point.commonMs!,side,point)} aria-label={`Inspect ${side} signal at ${clock(point.ms)}`}><Icon name="play" size={10}/>{clock(point.ms)}</button></>:null}</div><p>{recorded&&point?(point.entry.reaction||point.entry.observation||'No public comment recorded.'):missingSignal(signal.status)}</p></div>;})}</div>
  </div>
 </section>;
}
