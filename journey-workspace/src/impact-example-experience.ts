import {buildEmotionArc} from './emotion-arc.ts';
import type {EmotionPoint} from './emotion-arc.ts';
import type {Row} from './lib.ts';

export type ExampleMoment={id:string;label:string;before:EmotionPoint|null;after:EmotionPoint|null};

/** Authored stage IDs align the illustration; timing or row order cannot prove a match. */
export function exampleMoments(pair:Row):ExampleMoment[]{
 const points=(side:'before'|'after')=>buildEmotionArc(pair[side]||{}).points.filter(point=>typeof point.entry.exampleStepId==='string'&&point.entry.exampleStepId);
 const before=points('before'),after=points('after'),same=(b:number,a:number)=>before[b].entry.exampleStepId===after[a].entry.exampleStepId;
 // Longest common subsequence preserves both narratives, including newly
 // inserted steps. Reordered actions cannot be forced onto a shared position.
 const lcs=Array.from({length:before.length+1},()=>Array(after.length+1).fill(0));
 for(let b=before.length-1;b>=0;b--)for(let a=after.length-1;a>=0;a--)lcs[b][a]=same(b,a)?1+lcs[b+1][a+1]:Math.max(lcs[b+1][a],lcs[b][a+1]);
 const moments:ExampleMoment[]=[],used=new Set<string>();
 function append(b:EmotionPoint|null,a:EmotionPoint|null){
  const entry=(b||a)!.entry,base=String(entry.exampleStepId),id=used.has(base)?`${base}:${moments.length}`:base;
  used.add(id);moments.push({id,label:entry.exampleStepLabel||base,before:b,after:a});
 }
 let b=0,a=0;
 while(b<before.length||a<after.length){
  if(b<before.length&&a<after.length&&same(b,a))append(before[b++],after[a++]);
  else if(b<before.length&&(a===after.length||lcs[b+1][a]>=lcs[b][a+1]))append(before[b++],null);
  else append(null,after[a++]);
 }
 return moments;
}

/** Keep missing and unrated steps as gaps instead of drawing a fabricated transition. */
export function exampleSegments(moments:ExampleMoment[],side:'before'|'after'){
 const segments:{index:number;point:EmotionPoint}[][]=[];
 let current:{index:number;point:EmotionPoint}[]=[];
 for(const [index,moment] of moments.entries()){
  const point=moment[side];
  if(point?.value!=null)current.push({index,point});
  else if(current.length){segments.push(current);current=[];}
 }
 if(current.length)segments.push(current);
 return segments;
}

export function exampleFocus(moments:ExampleMoment[]):number{
 const differences=moments.map((moment,index)=>({index,delta:moment.before?.value!=null&&moment.after?.value!=null?moment.after.value-moment.before.value:null})).filter(item=>item.delta!=null&&item.delta!==0);
 differences.sort((a,b)=>a.delta!-b.delta!);
 if(differences.length)return differences[0].delta!<0?differences[0].index:differences.at(-1)!.index;
 const negative=moments.findIndex(moment=>moment.after?.value!=null&&moment.after.value<0);
 return negative>=0?negative:0;
}
