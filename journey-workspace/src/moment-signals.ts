import {list, safeMedia, sourceTime} from './lib.ts';
import type {Row} from './lib.ts';

export const TONES = [
  {key:'excellent', label:'Excellent', symbol:'✦'},
  {key:'positive', label:'Positive', symbol:'+'},
  {key:'neutral', label:'Neutral', symbol:'−'},
  {key:'negative', label:'Negative', symbol:'↓'},
  {key:'very-negative', label:'Very negative', symbol:'!'},
  {key:'unrated', label:'Unrated', symbol:'○'},
] as const;

// A finding's impact is not a sentiment score. Only use its own signal or
// the persona observation tied to the same evidence event.
export function momentSignal(run:Row, entry:Row) {
  if(entry.claimStatus==='hypothesis')return {tone:TONES[5],friction:null,reaction:null,source:entry.provenance==='review-hypothesis'?'Hypothesis added during review · unmeasured':'Business hypothesis · unmeasured'};
  const valences:Record<string,number>={very_positive:0,positive:1,neutral:2,negative:3,very_negative:4};
  const own=Object.hasOwn(valences,entry.valence);
  const linked=entry.eventIndex==null?undefined:list(run.experience).find(n=>n.eventIndex===entry.eventIndex);
  const signal=own?entry:linked;
  const tone=signal&&Object.hasOwn(valences,signal.valence)?TONES[valences[signal.valence]]:TONES[5];
  const friction=signal?.friction;
  return {tone, friction:Number.isInteger(friction)&&friction>=0&&friction<=3?friction:null,
    source:tone.key==='unrated'?'No tone recorded':own?'Recorded persona signal':'Persona signal at this evidence event',
    reaction:entry.personaComment||entry.reaction||linked?.reaction||null};
}

export function momentFrame(run:Row, entry:Row) {
  const shots=list(run.events).filter(e=>safeMedia(e.screenshot));
  const exact=shots.find(e=>entry.eventIndex!=null&&e.index===entry.eventIndex)
    ||shots.find(e=>list(entry.evidence).some(ref=>ref.index===e.index)||Array.isArray(entry.evidence_indices)&&entry.evidence_indices.includes(e.index));
  if(exact)return {src:safeMedia(exact.screenshot)!,ms:exact.videoMs??null,nearby:false};
  const ms=sourceTime(run,entry);
  const prior=ms==null?undefined:shots.filter(e=>typeof e.videoMs==='number'&&e.videoMs<=ms).sort((a,b)=>a.videoMs-b.videoMs).at(-1);
  return prior?{src:safeMedia(prior.screenshot)!,ms:prior.videoMs,nearby:true}:null;
}
