import {buildJourneyMatches,applyJourneyReview} from './journey-matching.ts';
import type {JourneyReviewDecision} from './journey-matching.ts';
import {safeDisplay} from './finding-context.ts';
import type {Row} from './lib.ts';
import type {ImpactTone} from './change-impact.ts';

export type ImpactExperienceKey='helped'|'hurt'|'mixed'|'unchanged'|'inconclusive'|'pending';
export type ImpactExperienceHighlight={
 id:string;title:string;beforeMs:number;afterMs:number;beforeQuote:string;afterQuote:string;
 beforeObservation:string;afterObservation:string;beforeTone:string;afterTone:string;
 delta:number;direction:'higher'|'lower'|'same';reviewed:boolean;
};
export type ImpactExperience={
 key:ImpactExperienceKey;tone:ImpactTone;label:string;summary:string;outcomeChange:string;
 emotion:{direction:'higher'|'lower'|'mixed'|'same'|'unavailable';compared:number;higher:number;lower:number;same:number};
 coverage:{before:number;after:number;matched:number;unmatchedBefore:number;unmatchedAfter:number;needsReview:number};
 highlights:ImpactExperienceHighlight[];primary:ImpactExperienceHighlight|null;
};
const text=(value:unknown)=>typeof value==='string'?safeDisplay(value,600):'';
const quote=(entry:Row)=>text(entry.reaction)||text(entry.observation);
const plural=(count:number,singular:string)=>`${count} ${singular}${count===1?'':'s'}`;

/** Only comparable recorded actions enter this summary; ordinal tones are never averaged. */
export function buildImpactExperience(pair:Row,decisions:JourneyReviewDecision[]=[]):ImpactExperience{
 const matches=buildJourneyMatches(pair.before,pair.after),review=applyJourneyReview(matches,decisions);
 const before=new Map(matches.beforeSteps.map(step=>[step.id,step])),after=new Map(matches.afterSteps.map(step=>[step.id,step]));
 const comparable:ImpactExperienceHighlight[]=review.activeMatches.flatMap(match=>{
  const a=before.get(match.beforeId),b=after.get(match.afterId);
  if(!a||!b||a.ms===null||b.ms===null||a.point.value===null||b.point.value===null)return [];
  const delta=b.point.value-a.point.value;
  return [{id:match.id,title:a.title,beforeMs:a.ms,afterMs:b.ms,beforeQuote:quote(a.point.entry),afterQuote:quote(b.point.entry),
   beforeObservation:text(a.point.entry.observation),afterObservation:text(b.point.entry.observation),
   beforeTone:a.point.tone.label,afterTone:b.point.tone.label,delta,direction:delta>0?'higher':delta<0?'lower':'same',reviewed:match.status==='accepted'}];
 });
 const higher=comparable.filter(item=>item.delta>0),lower=comparable.filter(item=>item.delta<0),same=comparable.filter(item=>item.delta===0);
 const direction=higher.length&&lower.length?'mixed':higher.length?'higher':lower.length?'lower':comparable.length?'same':'unavailable';
 const strongest=(items:ImpactExperienceHighlight[])=>[...items].sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)||a.beforeMs-b.beforeMs)[0];
 // Preserve both directions, rather than letting the largest improvement hide a regression.
 const highlights=[strongest(lower),strongest(higher)].filter(Boolean) as ImpactExperienceHighlight[];
 const coverage={before:matches.beforeSteps.length,after:matches.afterSteps.length,matched:review.activeMatches.length,
  unmatchedBefore:review.unmatchedBefore.length,unmatchedAfter:review.unmatchedAfter.length,
  needsReview:review.matches.filter(match=>match.status==='review').length};
 const pending=!pair.before||!pair.after||[pair.before?.status,pair.after?.status].some(status=>['queued','running','finalizing'].includes(status));
 const valid=pair.controls?.status==='matched'&&pair.before?.status==='finished'&&pair.after?.status==='finished'&&['improved','regressed','unchanged'].includes(pair.outcomeChange);
 const emotion={direction,compared:comparable.length,higher:higher.length,lower:lower.length,same:same.length} as ImpactExperience['emotion'];
 const base={outcomeChange:pair.outcomeChange||'inconclusive',emotion,coverage,highlights,primary:highlights[0]||null};
 const unavailable={...base,emotion:{direction:'unavailable' as const,compared:0,higher:0,lower:0,same:0},highlights:[],primary:null};
 const detail=direction==='unavailable'?'No rated action matches yet.':direction==='same'?`Same recorded tone at ${plural(comparable.length,'matched moment')}.`:
  direction==='mixed'?`${plural(higher.length,'matched moment')} more positive; ${plural(lower.length,'matched moment')} less positive.`:
  `${direction==='higher'?higher.length:lower.length} of ${plural(comparable.length,'matched moment')} ${direction==='higher'?'more':'less'} positive.`;
 if(pair.controls?.status==='mismatch')return {...unavailable,key:'inconclusive',tone:'warning',label:'Controls differ',summary:'The journeys do not have equivalent comparison controls.'};
 if(pending)return {...unavailable,key:'pending',tone:'pending',label:'Awaiting journeys',summary:'Both journeys need to finish before comparing their experience.'};
 if(!valid)return {...unavailable,key:'inconclusive',tone:'warning',label:'Inconclusive',summary:'The recorded journeys do not establish a comparable goal outcome.'};
 if(pair.outcomeChange==='regressed')return {...base,key:'hurt',tone:'negative',label:'Goal regressed',summary:`The goal outcome regressed. ${detail}`};
 if(pair.outcomeChange==='improved')return {...base,key:lower.length?'mixed':'helped',tone:lower.length?'warning':'positive',label:lower.length?'Goal improved · mixed experience':'Goal improved',summary:`The goal outcome improved. ${detail}`};
 if(direction==='higher')return {...base,key:'helped',tone:'positive',label:'More positive moments',summary:`Same goal outcome. ${detail}`};
 if(direction==='lower')return {...base,key:'hurt',tone:'negative',label:'Less positive moments',summary:`Same goal outcome. ${detail}`};
 if(direction==='mixed')return {...base,key:'mixed',tone:'warning',label:'Mixed experience',summary:`Same goal outcome. ${detail}`};
 if(direction==='same')return {...base,key:'unchanged',tone:'neutral',label:'No tone change on matches',summary:`Same goal outcome. ${detail}`};
 return {...base,key:'inconclusive',tone:'warning',label:'Tone comparison unavailable',summary:`Same goal outcome. ${detail}`};
}
