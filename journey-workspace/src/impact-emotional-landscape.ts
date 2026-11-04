import {buildEmotionArc} from './emotion-arc.ts';
import type {EmotionPoint} from './emotion-arc.ts';
import type {Row} from './lib.ts';

export type LandscapeSide='before'|'after';
const colors=['#8052bd','#288c87','#c27045','#6480c2','#b65788','#8c8340','#587b5d','#a269a0'];
export function landscapeColor(id:string){
 let hash=0;for(const character of id)hash=(hash*31+character.charCodeAt(0))>>>0;
 return colors[hash%colors.length];
}
function collectionColors(ids:string[]){
 const assigned=new Map<string,string>(),used=new Set<string>();
 for(const id of [...new Set(ids)].sort()){
  const start=colors.indexOf(landscapeColor(id));
  const color=Array.from({length:colors.length},(_,offset)=>colors[(start+offset)%colors.length]).find(candidate=>!used.has(candidate))||`hsl(${(assigned.size*137.508)%360} 43% 44%)`;
  assigned.set(id,color);used.add(color);
 }
 return assigned;
}
const invalid=(row:Row|undefined)=>!!row&&(row.status==='invalidated'||row.integrityStatus==='invalidated'||row.verification?.status==='invalidated'||row.invalidated===true||!!row.invalidatedAt);
const experimental=(row:Row|undefined)=>!!row&&(!!row.experimental||!!row.experimentalStudyId||!!row.calibrationStudyId||!!row.calibrationTrialId||!!row.experimentalCandidateId);
export type LandscapePoint=EmotionPoint&{progress:number};

/** Progress is observation order, never elapsed time or a cross-person action match. */
export function buildImpactLandscape(pairs:Row[],side:LandscapeSide){
 const assigned=collectionColors(pairs.map((pair,index)=>String(pair.personaId||`persona-${index}`)));
 return pairs.map((pair,index)=>{
  const id=String(pair.personaId||`persona-${index}`),run=pair[side];
  const invalidRepair=Array.isArray(pair.controls?.issues)&&pair.controls.issues.includes('repair_candidate_invalidated');
  const excluded=invalidRepair||invalid(pair)||invalid(run)?'Invalidated evidence':experimental(pair)||experimental(run)?'Experimental evidence':'';
  const arc=buildEmotionArc(excluded?{}:run||{});
  const points:LandscapePoint[]=arc.points.map(point=>({...point,progress:arc.points.length>1?point.index/(arc.points.length-1):.5}));
  const segments:LandscapePoint[][]=[];let current:LandscapePoint[]=[];
  for(const point of points){
   // Unknown tone or time leaves a visible break; retain every source observation
   // in the accessible inspector rather than filling the gap with a guessed value.
   if(point.value===null||point.ms===null){if(current.length)segments.push(current);current=[];}
   else current.push(point);
  }
  if(current.length)segments.push(current);
  const plotted=segments.flat(),partial=!!run&&(run.status!=='finished'||run.scenario?.complete===false);
  const fullName=String(pair.personaName||run?.personaSnapshot?.name||run?.personaName||pair.personaId||'Persona'),[name,...roleParts]=fullName.split(' · ');
  const warning=pair.controls?.status==='mismatch'?'Controls differ':pair.controls?.status==='pending'?'Controls pending':pair.outcomeChange==='inconclusive'?'Outcome inconclusive':'';
  return {id,name,fullName,role:String(pair.personaRole||roleParts.join(' · ')||run?.personaSnapshot?.role||''),color:assigned.get(id)!,points,segments,plotted,partial,excluded,warning,
   missing:!run,unrated:points.filter(point=>point.value===null).length,untimed:points.filter(point=>point.ms===null).length,
   status:excluded||(!run?'Journey unavailable':!points.length?'No reactions':!plotted.length?'No plottable reactions':partial?'Partial journey':warning||`${plotted.length} rated moments`),
  };
 });
}
export type ImpactLandscape=ReturnType<typeof buildImpactLandscape>[number];

/** Keep both versions together without aligning or inventing observations. */
export function buildImpactLandscapeComparison(pairs:Row[]){
 const before=buildImpactLandscape(pairs,'before'),after=buildImpactLandscape(pairs,'after');
 return before.map((baseline,index)=>{
  const candidate=after[index];
  // A missing baseline must not hide a name supplied by the available journey.
  const identity=baseline.missing?candidate:baseline;
  return {id:baseline.id,name:identity.name,fullName:identity.fullName,role:identity.role,
   color:baseline.color,before:baseline,after:candidate};
 });
}
export type ImpactLandscapeComparison=ReturnType<typeof buildImpactLandscapeComparison>[number];

/** A person's two traces always occupy the same plane. */
export function landscapeComparisonLayers(items:ImpactLandscapeComparison[],selectedId?:string){
 const selected=items.find(item=>item.id===selectedId)||items[0];
 const background=items.filter(item=>item!==selected);
 return [...background.map((item,index)=>({item,depth:background.length-index})),...(selected?[{item:selected,depth:0}]:[])];
}

/** Selection changes depth only. Stable color and source order keep identity intact. */
export function landscapeLayers(items:ImpactLandscape[],selectedId?:string){
 const selected=items.find(item=>item.id===selectedId)||items[0];
 const background=items.filter(item=>item!==selected);
 return [...background.map((item,index)=>({item,depth:background.length-index})),...(selected?[{item:selected,depth:0}]:[])];
}
