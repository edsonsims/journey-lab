import {useId} from 'react';
import {clock} from './lib';
import type {ImpactLandscape,LandscapePoint,LandscapeSide} from './impact-emotional-landscape';
import './impact-reaction-list.css';

type Props={
 before:ImpactLandscape;
 after:ImpactLandscape;
 labels:{before:string;after:string};
 currentIds:{before?:string;after?:string};
 playbackTimes?:{before?:number;after?:number};
 isExample?:boolean;
 onSelect:(side:LandscapeSide,index:number)=>void;
};
const sides:LandscapeSide[]=['before','after'];
const reactionText=(point:LandscapePoint)=>String(point.entry.reaction||point.entry.personaComment||point.entry.observation||'No reaction text provided.');

export function ImpactReactionList({before,after,labels,currentIds,playbackTimes,isExample=false,onSelect}:Props){
 const headingId=useId(),versions={before,after};
 return <section className="irl" aria-labelledby={headingId}>
  <h3 className="irl-heading" id={headingId}>All feelings</h3>
  <div className="irl-columns">{sides.map(side=>{
   const version=versions[side],name=side==='before'?'Before':'After';
   return <section className={`irl-column irl-${side}`} key={side} aria-label={`${name} feelings · ${labels[side]}`}>
    <header className="irl-column-heading"><span><strong>{name}</strong><span title={labels[side]}>{labels[side]}</span>{!isExample&&playbackTimes?.[side]!=null&&<time aria-label={`${name} recording at ${clock(playbackTimes[side])}`}>At {clock(playbackTimes[side])}</time>}</span><small>{version.points.length} {version.points.length===1?'feeling':'feelings'}</small></header>
    {version.points.length?<ol className="irl-list" aria-label={`${name} reactions`}>{version.points.map(point=>{
     const reaction=reactionText(point),time=isExample?`Step ${point.index+1}`:point.ms===null?'Untimed':clock(point.ms);
     return <li key={point.id}><button type="button" className={`irl-row irl-tone-${point.tone.key}${currentIds[side]===point.id?' is-current':''}`} aria-pressed={currentIds[side]===point.id} aria-label={`${name} feeling ${point.index+1} · ${point.tone.label} · ${time} · ${reaction}`} title={`${point.tone.label} · ${time}\n${reaction}`} onClick={()=>onSelect(side,point.index)}>
      <span className="irl-row-meta"><span className="irl-index" aria-hidden="true">{point.index+1}</span><span className="irl-tone"><i aria-hidden="true">{point.tone.symbol}</i>{point.tone.label}</span><span className="irl-time">{time}</span></span>
      <span className="irl-reaction">{reaction}</span>
     </button></li>;
    })}</ol>:<p className="irl-empty">{version.excluded?`Excluded: ${version.excluded}.`:version.missing?'Journey unavailable.':'No reactions recorded.'}</p>}
   </section>;
  })}</div>
 </section>;
}
