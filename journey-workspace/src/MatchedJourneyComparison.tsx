import {useMemo,useRef,useState} from 'react';
import type {KeyboardEvent} from 'react';
import type {EmotionPoint} from './emotion-arc';
import {clock} from './lib';
import {Icon} from './icons';

export type MatchedEmotionItem={id:string,title:string,before:EmotionPoint,after:EmotionPoint,reviewed:boolean,reason:string};
export type MatchedJourneyComparisonProps={externalReview?:boolean;labels?:{before:string;after:string};heading?:string;items:MatchedEmotionItem[],selectedId:string|null,onSelect:(item:MatchedEmotionItem)=>void,onReview:()=>void,onAdjust?:(item?:MatchedEmotionItem)=>void,adjustmentDisabled?:boolean,beforeMs:number,afterMs:number,unmatchedBefore:number,unmatchedAfter:number,pendingCount:number};
type Side='before'|'after';
const sides:Side[]=['before','after'];
const levels=[{value:2,key:'excellent',label:'Excellent'},{value:1,key:'positive',label:'Positive'},{value:0,key:'neutral',label:'Neutral'},{value:-1,key:'negative',label:'Negative'},{value:-2,key:'very-negative',label:'Very negative'}];
const y=(value:number)=>(2-value)/4*176+12;
const validRating=(point:EmotionPoint)=>point.value!==null&&Number.isFinite(point.value)&&point.value>=-2&&point.value<=2;
const difference=(item:MatchedEmotionItem)=>validRating(item.before)&&validRating(item.after)?item.after.value!-item.before.value!:null;
const quote=(point:EmotionPoint)=>point.entry.reaction||point.entry.observation||'No comment recorded.';
const sideLabel=(side:Side)=>side==='before'?'Before':'After';

/** Match order is an ordinal axis. Source times are only used to seek recordings. */
export function MatchedJourneyComparison({items,selectedId,onSelect,onReview,onAdjust,adjustmentDisabled,beforeMs,afterMs,unmatchedBefore,unmatchedAfter,pendingCount,labels={before:'Before',after:'After'},heading='Same steps. Different experience.',externalReview=false}:MatchedJourneyComparisonProps){
 const sideLabel=(side:Side)=>labels[side];
 const [hoverId,setHoverId]=useState<string|null>(null),[focusId,setFocusId]=useState<string|null>(null);
 const refs=useRef(new Map<string,HTMLButtonElement>());
 const selectedIndex=items.findIndex(item=>item.id===selectedId);
 const inspected=items.find(item=>item.id===hoverId)||items.find(item=>item.id===focusId)||items[selectedIndex]||items[0];
 const inspectedIndex=inspected?items.indexOf(inspected):-1;
 const x=(index:number)=>items.length===1?50:4+index/Math.max(1,items.length-1)*92;
 const segments=useMemo(()=>{
  const result:Record<Side,{point:EmotionPoint,index:number}[][]>={before:[],after:[]};
  for(const side of sides){
   let current:{point:EmotionPoint,index:number}[]=[];
   const flush=()=>{if(current.length)result[side].push(current);current=[];};
   items.forEach((item,index)=>{
    const point=item[side],previous=current.at(-1)?.point;
    if(!validRating(point)){flush();return;}
    // A skipped source observation is a real gap, even when its neighbours match.
    if(previous&&point.index!==previous.index+1)flush();
    current.push({point,index});
   });flush();
  }return result;
 },[items]);
 const changes=useMemo(()=>{
  let higher:MatchedEmotionItem|null=null,lower:MatchedEmotionItem|null=null;
  for(const item of items){const delta=difference(item);if(delta===null)continue;if(delta>0&&(!higher||delta>difference(higher)!))higher=item;if(delta<0&&(!lower||delta<difference(lower)!))lower=item;}
  return [{item:higher,direction:'higher',label:'Largest rise'},{item:lower,direction:'lower',label:'Largest drop'}].filter(change=>change.item!==null) as {item:MatchedEmotionItem,direction:string,label:string}[];
 },[items]);
 const unrated=items.map((item,index)=>({item,index})).filter(({item})=>sides.some(side=>!validRating(item[side])));
 // Preserve both series when recorded moods agree; no axis offset or invented value.
 const overlappingEdges=items.flatMap((item,index)=>{const previous=items[index-1];return previous&&difference(item)===0&&difference(previous)===0&&sides.every(side=>item[side].index===previous[side].index+1)?[{from:index-1,to:index}]:[];});
 const tickIndices=items.length<=7?items.map((_,index)=>index):Array.from(new Set([0,.25,.5,.75,1].map(f=>Math.round(f*(items.length-1)))));
 const select=(item:MatchedEmotionItem)=>{setHoverId(null);onSelect(item);};
 function keydown(event:KeyboardEvent<HTMLButtonElement>,index:number){
  let next:number|null=null;
  if(event.key==='ArrowRight'||event.key==='ArrowDown')next=Math.min(items.length-1,index+1);
  if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=Math.max(0,index-1);
  if(event.key==='Home')next=0;
  if(event.key==='End')next=items.length-1;
  if(event.key==='Escape'){setHoverId(null);setFocusId(null);event.currentTarget.blur();}
  if(next!==null){event.preventDefault();refs.current.get(items[next].id)?.focus();}
 }
 function pointButton(item:MatchedEmotionItem,index:number,rail=false){
  const onlyUnrated=!validRating(item.before)&&!validRating(item.after);
  return <button type="button" key={item.id} ref={el=>{if(rail!==onlyUnrated)return;if(el)refs.current.set(item.id,el);else refs.current.delete(item.id);}} className={`matched-step-hit ${selectedId===item.id?'is-selected':''} ${inspected?.id===item.id?'is-inspected':''}`} style={{left:`${x(index)}%`}} data-match-id={item.id} data-before-ms={item.before.ms} data-after-ms={item.after.ms} aria-pressed={selectedId===item.id} aria-label={`Step ${index+1}: ${item.title}. Before ${item.before.tone.label}, ${clock(item.before.ms)}; after ${item.after.tone.label}, ${clock(item.after.ms)}. ${item.reviewed?'Reviewed':'Suggested'} match. Seek both recordings.`} onPointerEnter={event=>{if(event.pointerType!=='touch')setHoverId(item.id);}} onPointerLeave={()=>setHoverId(null)} onFocus={()=>setFocusId(item.id)} onBlur={()=>setFocusId(null)} onKeyDown={event=>keydown(event,index)} onClick={()=>select(item)}>
   {sides.filter(side=>rail?!validRating(item[side]):validRating(item[side])).map(side=><span key={side} className={`matched-dot matched-${side} tone-${item[side].tone.key} ${rail?'is-unrated':''}`} data-side={side} data-value={item[side].value??'unrated'} style={{top:rail?'50%':`${y(item[side].value!)/200*100}%`}}/>)}
  </button>;
 }
 const delta=inspected?difference(inspected):null;
 const direction=delta===null?'unknown':delta>0?'higher':delta<0?'lower':'equal';
 const changeLabel=delta===null?'Rating missing':delta===0?'Same recorded tone':`${Math.abs(delta)} ${Math.abs(delta)===1?'level':'levels'} ${delta>0?'higher':'lower'}`;
 return <section className="matched-journey" aria-label="Emotional comparison by matching action">
  {!externalReview&&<header className="matched-heading"><div><h2>{heading}</h2><p>{items.length?`${items.length} matched ${items.length===1?'step':'steps'}`:'Match the actions to compare the experience.'}{items.length&&pendingCount?` · ${pendingCount} to review`:''}</p></div><div className="matched-heading-actions">{onAdjust&&<button type="button" className="matched-review-button" disabled={adjustmentDisabled} onClick={()=>onAdjust(items[selectedIndex])}><Icon name="edit" size={13}/>Drag to align</button>}<button type="button" className="matched-review-button" onClick={onReview}><Icon name="calibration" size={13}/>Review matches{pendingCount>0&&<span>{pendingCount}</span>}</button></div></header>}
  {!items.length?<div className="matched-empty"><Icon name="calibration" size={22}/><strong>No comparable steps yet</strong><p>{externalReview?'Choose Review matches below to pair observed steps.':`${unmatchedBefore} before · ${unmatchedAfter} after unmatched`}</p>{!externalReview&&<button type="button" onClick={onReview}>Review matches<Icon name="arrow" size={13}/></button>}</div>:<>
   <div className="matched-tools"><div className="matched-legend" aria-label="Chart legend"><span className="matched-before"><i/>{labels.before}</span><span className="matched-after"><i/>{labels.after}</span></div>{changes.length>0&&<div className="matched-changes" aria-label="Recorded tone changes">{changes.map(change=><button type="button" key={change.direction} className={`matched-change-${change.direction}`} onClick={()=>select(change.item)} title={change.item.title}><Icon name={change.direction==='higher'?'check':'activity'} size={12}/>{change.label}<span>Step {items.indexOf(change.item)+1}</span></button>)}</div>}</div>
   <div className="matched-graph" role="group" aria-label="Emotion by matched step. Arrow keys explore; Enter seeks both recordings.">
    <div className="matched-y-axis" aria-hidden="true">{levels.map(level=><span key={level.value} className={`tone-${level.key}`} style={{top:`${y(level.value)/200*100}%`}}>{level.label}</span>)}</div>
    <div className="matched-plot"><svg viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true"><rect className="matched-positive-zone" x="0" y="12" width="1000" height="88"/><rect className="matched-negative-zone" x="0" y="100" width="1000" height="88"/>{levels.map(level=><line key={level.value} x1="0" x2="1000" y1={y(level.value)} y2={y(level.value)} className={`matched-grid ${level.value===0?'is-neutral':''}`}/>)}{overlappingEdges.map(({from,to})=><path key={`overlap-${from}`} className="matched-shared-curve" d={`M ${x(from)*10} ${y(items[from].before.value!)} L ${x(to)*10} ${y(items[to].before.value!)}`} vectorEffect="non-scaling-stroke"/>)}{sides.map(side=>segments[side].filter(segment=>segment.length>1).map((segment,index)=><path key={`${side}-${index}`} className={`matched-curve matched-${side}`} d={segment.map(({point,index},i)=>`${i?'L':'M'} ${x(index)*10} ${y(point.value!)}`).join(' ')} vectorEffect="non-scaling-stroke"/>))}</svg>
     {selectedIndex>=0&&<div className="matched-selection-line" style={{left:`${x(selectedIndex)}%`}} aria-hidden="true"/>}
     {inspectedIndex>=0&&inspectedIndex!==selectedIndex&&<div className="matched-inspection-line" style={{left:`${x(inspectedIndex)}%`}} aria-hidden="true"/>}
     {items.map((item,index)=>sides.some(side=>validRating(item[side]))?pointButton(item,index):null)}
     {!items.some(item=>sides.some(side=>validRating(item[side])))&&<p className="matched-no-ratings">No emotion ratings on these matches</p>}
    </div>
   </div>
   {unrated.length>0&&<div className="matched-unrated-row"><span>Unrated</span><div>{unrated.map(({item,index})=>pointButton(item,index,true))}</div></div>}
   <div className="matched-x-axis" aria-hidden="true"><div>{tickIndices.map((index,i)=><span className={i>0&&i<tickIndices.length-1?'matched-intermediate-tick':''} key={index} style={{left:`${x(index)}%`}}>{index+1}</span>)}</div></div>
   <div className="matched-caption"><span>Matched-step order{!externalReview&&unmatchedBefore+unmatchedAfter>0?` · ${unmatchedBefore+unmatchedAfter} unmatched`:''}</span><span className="matched-video-clocks"><span>Before <time>{clock(beforeMs)}</time></span><span>After <time>{clock(afterMs)}</time></span></span></div>
   {inspected&&<div className={`matched-detail matched-change-${direction}`}>
    <div className="matched-detail-heading"><div className="matched-step-title"><span>Step {inspectedIndex+1}</span><h3>{inspected.title}</h3></div><div className="matched-step-navigation"><button type="button" onClick={()=>select(items[inspectedIndex-1])} disabled={inspectedIndex<=0} aria-label="Previous matched step"><Icon name="back" size={14}/></button><button type="button" onClick={()=>select(items[inspectedIndex+1])} disabled={inspectedIndex>=items.length-1} aria-label="Next matched step"><Icon name="arrow" size={14}/></button></div></div>
    <div className="matched-status"><strong>{changeLabel}</strong>{externalReview?<span title={inspected.reason}>{inspected.reviewed?'Reviewed match':'Suggested match'}</span>:<button type="button" className={inspected.reviewed?'is-reviewed':''} title={inspected.reason} onClick={onReview}><Icon name={inspected.reviewed?'check':'calibration'} size={11}/>{inspected.reviewed?'Reviewed match':'Suggested match'}</button>}</div>
    <div className="matched-quotes">{sides.map(side=>{const point=inspected[side];return <div key={side} className={`matched-quote matched-${side} tone-${point.tone.key}`}><div><strong><i/>{sideLabel(side)}</strong><span>{validRating(point)?point.tone.label:'Unrated'}</span><button type="button" onClick={()=>select(inspected)} aria-label={`Seek both matched moments. ${sideLabel(side)} at ${clock(point.ms)}.`} disabled={point.ms===null}><Icon name="play" size={10}/><time>{point.ms===null?'Untimed':clock(point.ms)}</time></button></div><p>{quote(point)}</p></div>;})}</div>
   </div>}
  </>}
 </section>;
}
