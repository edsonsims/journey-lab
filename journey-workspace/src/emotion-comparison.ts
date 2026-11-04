import type {Row} from './lib.ts';
import {safeMedia} from './lib.ts';
import {buildEmotionArc} from './emotion-arc.ts';
import type {EmotionPoint} from './emotion-arc.ts';

export type ComparisonSideName='before'|'after';
export type ComparisonAnchor={beforeMs:number,afterMs:number};
export type ComparisonRange={startMs:number,endMs:number};
export type ComparisonPoint=EmotionPoint&{side:ComparisonSideName,commonMs:number|null};
export type EmotionComparisonSide={
 run:Row|null;
 arc:ReturnType<typeof buildEmotionArc>;
 points:ComparisonPoint[];
 segments:ComparisonPoint[][];
 anchorMs:number;
 durationMs:number|null;
 videoDurationMs:number|null;
 hasVideo:boolean;
};
export type EmotionComparison={
 before:EmotionComparisonSide;
 after:EmotionComparisonSide;
 anchors:ComparisonAnchor;
 alignment:'start'|'milestone';
 domain:ComparisonRange|null;
 overlap:ComparisonRange|null;
};
export type ComparisonTimeState='available'|'not_started'|'finished'|'unavailable';
export type SignalStatus='recorded'|'unrated'|'too_distant'|'no_signal'|'not_started'|'finished'|'unavailable';
export type ComparisonSignal={point:ComparisonPoint|null,ms:number|null,distanceMs:number|null,status:SignalStatus};
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const nonnegative=(value:unknown):value is number=>finite(value)&&value>=0;
const tolerance=(value:unknown)=>nonnegative(value)?value:5000;

function mediaDuration(run:Row|null):number|null {
 if(!run)return null;
 // Recorded observations can establish the graph's extent, but never prove a
 // video continues that long. Linked playback requires actual media duration.
 const durations=[run.originalDurationMs,run.videoDurationMs,
  finite(run.replayMetadata?.originalDuration)?run.replayMetadata.originalDuration*1000:null];
 return durations.find(nonnegative)??null;
}

function makeSide(run:Row|null,name:ComparisonSideName,anchorMs:number):EmotionComparisonSide {
 const arc=buildEmotionArc(run||{});
 const points=arc.points.map(point=>({...point,side:name,commonMs:point.ms==null?null:point.ms-anchorMs}));
 const byId=new Map(points.map(point=>[point.id,point]));
 return {run,arc,points,segments:arc.segments.map(segment=>segment.map(point=>byId.get(point.id)!)),anchorMs,
  durationMs:arc.durationMs,videoDurationMs:mediaDuration(run),hasVideo:!!safeMedia(run?.video)};
}

export function buildEmotionComparison(beforeRun:Row|null,afterRun:Row|null,anchor?:ComparisonAnchor):EmotionComparison {
 const beforeArc=buildEmotionArc(beforeRun||{}),afterArc=buildEmotionArc(afterRun||{});
 const inBounds=(ms:unknown,run:Row|null,arc:ReturnType<typeof buildEmotionArc>)=>{
  const end=mediaDuration(run)??arc.durationMs;
  return nonnegative(ms)&&end!=null&&ms<=end;
 };
 const aligned=!!anchor&&inBounds(anchor.beforeMs,beforeRun,beforeArc)&&inBounds(anchor.afterMs,afterRun,afterArc);
 const anchors=aligned?{beforeMs:anchor!.beforeMs,afterMs:anchor!.afterMs}:{beforeMs:0,afterMs:0};
 const before=makeSide(beforeRun,'before',anchors.beforeMs),after=makeSide(afterRun,'after',anchors.afterMs);
 const sides=[before,after],ranges=sides.filter(side=>side.durationMs!=null).map(side=>({startMs:-side.anchorMs,endMs:side.durationMs!-side.anchorMs}));
 const domain=ranges.length?{startMs:Math.min(...ranges.map(range=>range.startMs))||0,endMs:Math.max(...ranges.map(range=>range.endMs))||0}:null;
 let overlap:ComparisonRange|null=null;
 if(sides.every(side=>side.hasVideo&&side.videoDurationMs!=null)){
  const startMs=Math.max(-before.anchorMs,-after.anchorMs),endMs=Math.min(before.videoDurationMs!-before.anchorMs,after.videoDurationMs!-after.anchorMs);
  if(startMs<=endMs)overlap={startMs:startMs||0,endMs:endMs||0};
 }
 return {before,after,anchors,alignment:aligned?'milestone':'start',domain,overlap};
}

function mapSide(side:EmotionComparisonSide,commonMs:number):{ms:number|null,state:ComparisonTimeState} {
 if(!finite(commonMs)||!side.hasVideo||side.videoDurationMs==null)return {ms:null,state:'unavailable'};
 const ms=commonMs+side.anchorMs;
 if(ms<0)return {ms:null,state:'not_started'};
 if(ms>side.videoDurationMs)return {ms:null,state:'finished'};
 return {ms,state:'available'};
}

/** Never clamp an exhausted or not-yet-started recording onto an unrelated frame. */
export function mapComparisonTime(comparison:EmotionComparison,commonMs:number) {
 const before=mapSide(comparison.before,commonMs),after=mapSide(comparison.after,commonMs);
 return {commonMs,beforeMs:before.ms,afterMs:after.ms,beforeState:before.state,afterState:after.state};
}

function nearestSignal(side:EmotionComparisonSide,commonMs:number,maxDistanceMs:number):ComparisonSignal {
 if(!finite(commonMs)||side.durationMs==null)return {point:null,ms:null,distanceMs:null,status:'unavailable'};
 const ms=commonMs+side.anchorMs;
 if(ms<0)return {point:null,ms,distanceMs:null,status:'not_started'};
 // Prefer actual media bounds even when an invalid late note extends the chart.
 if(ms>(side.videoDurationMs??side.durationMs))return {point:null,ms,distanceMs:null,status:'finished'};
 const timed=side.points.filter(point=>point.ms!=null).sort((a,b)=>a.ms!-b.ms!||a.index-b.index);
 let nearest:ComparisonPoint|null=null,distanceMs=Infinity;
 for(const point of timed){
  if(point.ms!>(side.videoDurationMs??side.durationMs))continue;
  const distance=Math.abs(point.ms!-ms);
  if(distance<distanceMs){nearest=point;distanceMs=distance;}
 }
 if(!nearest)return {point:null,ms,distanceMs:null,status:'no_signal'};
 return {point:nearest,ms,distanceMs,status:distanceMs>maxDistanceMs?'too_distant':nearest.value==null?'unrated':'recorded'};
}

/** A discrete comparison of recorded observations, never an interpolated mood. */
export function comparisonAt(comparison:EmotionComparison,commonMs:number,{maxDistanceMs=5000}:{maxDistanceMs?:number}={}) {
 const before=nearestSignal(comparison.before,commonMs,tolerance(maxDistanceMs)),after=nearestSignal(comparison.after,commonMs,tolerance(maxDistanceMs));
 const delta=before.status==='recorded'&&after.status==='recorded'?after.point!.value!-before.point!.value!:null;
 const direction: 'higher'|'lower'|'same'|'unavailable'=delta==null?'unavailable':delta>0?'higher':delta<0?'lower':'same';
 const label=direction==='higher'?'More positive after':direction==='lower'?'Less positive after':direction==='same'?'Same recorded tone':'No comparable signals';
 // Media clocks round fractional seconds; allow one millisecond of numerical
 // drift without treating a genuinely different observation as the anchor.
 const basis: 'paired_milestone'|'nearest_recorded'=comparison.alignment==='milestone'&&Math.abs(commonMs)<=1&&before.distanceMs!=null&&before.distanceMs<=1&&after.distanceMs!=null&&after.distanceMs<=1?'paired_milestone':'nearest_recorded';
 return {commonMs,before,after,delta,direction,label,basis};
}

/** Jump targets are nearest recorded moments, not automatically matched actions. */
export function emotionChangePoints(comparison:EmotionComparison,{maxDistanceMs=5000}:{maxDistanceMs?:number}={}) {
 const seen=new Set<string>();
 const changes:{id:string,commonMs:number,before:ComparisonPoint,after:ComparisonPoint,delta:number,direction:'higher'|'lower',label:string,distanceMs:number}[]=[];
 for(const point of comparison.after.points.filter(point=>point.commonMs!=null&&point.value!=null).sort((a,b)=>a.commonMs!-b.commonMs!||a.index-b.index)){
  const at=comparisonAt(comparison,point.commonMs!,{maxDistanceMs});
  if(at.before.status!=='recorded'||!at.before.point||['finished','not_started','unavailable'].includes(at.after.status))continue;
  // Preserve each explicit after observation when timestamps are duplicated.
  const delta=point.value!-at.before.point.value!;
  if(delta===0)continue;
  const key=`${at.before.point.id}:${point.id}`;
  if(seen.has(key))continue;
  seen.add(key);
  changes.push({id:`change-${key}`,commonMs:point.commonMs!,before:at.before.point,after:point,delta,
   direction:delta>0?'higher':'lower',label:delta>0?'More positive after':'Less positive after',distanceMs:Math.abs(at.before.point.commonMs!-point.commonMs!)});
 }
 return changes;
}
