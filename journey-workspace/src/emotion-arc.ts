import {list,sourceTime} from './lib.ts';
import type {Row} from './lib.ts';
import {TONES} from './moment-signals.ts';

export type EmotionTone = typeof TONES[number];
export type EmotionPoint = {
  id:string;
  index:number;
  entry:Row;
  ms:number|null;
  value:number|null;
  tone:EmotionTone;
};

const valences:Record<string,{value:number,tone:EmotionTone}>={
  very_positive:{value:2,tone:TONES[0]},
  positive:{value:1,tone:TONES[1]},
  neutral:{value:0,tone:TONES[2]},
  negative:{value:-1,tone:TONES[3]},
  very_negative:{value:-2,tone:TONES[4]},
};
const usableTime=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0;

function recordedTime(run:Row,entry:Row):number|null {
  // sourceTime can join other persona notes. An arc point may only use its own
  // original time or its explicitly referenced browser event, never a sibling.
  const own=sourceTime({experience:[]},entry);
  if(usableTime(own))return own;
  if(usableTime(entry.videoMs))return entry.videoMs;
  const index=entry.eventIndex??entry.actionEventIndex;
  const event=index==null?undefined:list(run.events).find(event=>event.index===index);
  const captured=event?sourceTime({experience:[]},event):null;
  return usableTime(captured)?captured:null;
}

/** Ordinal recorded mood, not an inferred emotion score or a continuous measure. */
export function buildEmotionArc(run:Row) {
  const points:EmotionPoint[]=list(run.experience).map((entry,index)=>{
    const signal=typeof entry.valence==='string'&&Object.hasOwn(valences,entry.valence)?valences[entry.valence]:null;
    return {id:`emotion-${index}`,index,entry,ms:recordedTime(run,entry),value:signal?.value??null,tone:signal?.tone??TONES[5]};
  });
  const timedPoints=points.filter(point=>point.ms!==null).sort((a,b)=>a.ms!-b.ms!||a.index-b.index);
  const ratedPoints=timedPoints.filter(point=>point.value!==null);
  const unratedPoints=timedPoints.filter(point=>point.value===null);
  const unplacedPoints=points.filter(point=>point.ms===null);
  const barriers=points.filter(point=>point.ms===null||point.value===null).map(point=>point.index);
  const segments:EmotionPoint[][]=[];
  let segment:EmotionPoint[]=[];
  const flush=()=>{if(segment.length)segments.push(segment);segment=[];};
  for(const point of timedPoints){
    if(point.value===null){flush();continue;}
    const previous=segment.at(-1);
    // An untimed observation cannot be sorted onto X, but still prevents a line
    // from implying that the source history is complete across that interval.
    if(previous&&barriers.some(index=>index>Math.min(previous.index,point.index)&&index<Math.max(previous.index,point.index)))flush();
    segment.push(point);
  }
  flush();
  let high:EmotionPoint|null=null,low:EmotionPoint|null=null;
  for(const point of ratedPoints){
    if(high===null||point.value!>high.value!)high=point;
    if(low===null||point.value!<low.value!)low=point;
  }
  const durations=[run.originalDurationMs,run.videoDurationMs,
    typeof run.replayMetadata?.originalDuration==='number'?run.replayMetadata.originalDuration*1000:null,
    timedPoints.at(-1)?.ms].filter(usableTime);
  // Run duration includes setup/cleanup and wall-clock waits. It is not the
  // original video's clock and must not stretch the chart's time axis.
  const durationMs=durations.length?Math.max(...durations):null;
  return {points,timedPoints,ratedPoints,unratedPoints,unplacedPoints,segments,durationMs,
    range:durationMs===null?null:{startMs:0,endMs:durationMs},high,low,
    summary:{total:points.length,timed:timedPoints.length,rated:ratedPoints.length,unrated:unratedPoints.length,unplaced:unplacedPoints.length}};
}
