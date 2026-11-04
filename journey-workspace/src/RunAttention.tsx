import {useState} from 'react';
import {AppLink} from './App';
import {Icon} from './icons';
import {date,fullDate,person,title} from './lib';
import type {Row} from './lib';
import type {buildRunAttention} from './run-attention';

export type AttentionFilter='all'|'critical'|'review'|'blocked';
type Attention=ReturnType<typeof buildRunAttention>;
const categories=[
 {key:'critical',label:'Critical findings',icon:'findings',hint:'Critical findings, excluding dismissed, duplicate and explicitly resolved issues.'},
 {key:'review',label:'Fixes to review',icon:'fixes',hint:'Candidates awaiting your review. Opening a fix does not approve it.'},
 {key:'blocked',label:'Blocked journeys',icon:'stop',hint:'Journeys that recorded an obstacle. Historical outcomes are retained; technical execution failures are separate.'},
] as const;

export function RunAttention({attention,selected,onSelect,base,navigate,runs}:{attention:Attention,selected:AttentionFilter,onSelect:(filter:AttentionFilter)=>void,base:string,navigate:(path:string)=>void,runs:Row[]}){
 const [cursor,setCursor]=useState<{category:AttentionFilter,id:string}|null>(null);
 const newest=(rows:Row[])=>[...rows].sort((a,b)=>(Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0));
 const runById=new Map(runs.map(run=>[run.id,run]));
 const items=[
  ...newest(attention.criticalFindings).map(finding=>({key:`critical:${finding.id}`,kind:'critical' as const,name:finding.title||finding.observation||'Critical finding',to:`${base}/findings/${finding.id}`,action:'Open finding',context:person(runById.get(finding.runId)||finding),at:finding.createdAt})),
  ...newest(attention.reviewFixes).map(fix=>({key:`review:${fix.id}`,kind:'review' as const,name:fix.title||'Fix awaiting review',to:`${base}/fixes/${fix.id}`,action:'Review fix',context:person(runById.get(fix.runId)||{}),at:fix.createdAt})),
  ...newest(attention.blockedRuns).map(run=>({key:`blocked:${run.id}`,kind:'blocked' as const,name:title(run),to:`${base}/runs/${run.id}?tab=journey`,action:'Watch journey',context:'Obstacle recorded',at:run.createdAt})),
 ].filter(item=>selected==='all'||item.kind===selected);
 const index=cursor?.category===selected?Math.max(0,items.findIndex(item=>item.key===cursor.id)):0;
 const item=items[index];
 const move=(offset:number)=>setCursor({category:selected,id:items[(index+offset+items.length)%items.length].key});
 const count=attention.counts;
 return <section className="run-attention" aria-labelledby="run-attention-heading">
  <div className="run-attention-heading"><h2 id="run-attention-heading">Needs your attention</h2><span>App-wide</span></div>
  <div className="run-attention-filters" role="group" aria-label="Focus journeys by attention">
   {categories.map(category=><button key={category.key} type="button" className={`attention-filter attention-${category.key} ${count[category.key]===0?'is-zero':''}`} aria-pressed={selected===category.key} title={category.hint} onClick={()=>onSelect(selected===category.key?'all':category.key)}><Icon name={category.icon} size={15}/><strong>{count[category.key]}</strong><span>{category.label}</span></button>)}
   {selected!=='all'&&<button className="attention-reset" type="button" onClick={()=>onSelect('all')}>Clear focus<Icon name="close" size={13}/></button>}
  </div>
  {item?<div className={`attention-spotlight attention-${item.kind}`}>
   <span className="attention-spotlight-mark"><Icon name={categories.find(category=>category.key===item.kind)!.icon} size={16}/></span>
   <div className="attention-spotlight-copy" title={item.name}><AppLink to={item.to} navigate={navigate} className="attention-spotlight-title">{item.name}</AppLink><small>{item.context}{item.at&&<> · <time dateTime={item.at} title={fullDate(item.at)}>{date(item.at)}</time></>}</small></div>
   <AppLink to={item.to} navigate={navigate} className="attention-action">{item.action}<Icon name="arrow" size={14}/></AppLink>
   {items.length>1&&<div className="attention-pager"><button type="button" aria-label="Previous attention item" onClick={()=>move(-1)}><Icon name="back" size={13}/></button><span aria-live="polite" aria-label={`Attention item ${index+1} of ${items.length}`}>{index+1}<span> / {items.length}</span></span><button type="button" aria-label="Next attention item" onClick={()=>move(1)}><Icon name="arrow" size={13}/></button></div>}
  </div>:<div className="attention-clear"><Icon name="check" size={16}/><span>{selected==='all'?'No items in this queue.':selected==='critical'?'No critical findings need review.':selected==='review'?'No fixes are waiting for review.':'No journeys recorded a blocker.'}</span></div>}
 </section>;
}
