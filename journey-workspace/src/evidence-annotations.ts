import {buildEmotionArc} from './emotion-arc.ts';
import type {EmotionTone} from './emotion-arc.ts';
import {list,person,replayToOriginal,safeMedia} from './lib.ts';
import type {Row} from './lib.ts';
import {deriveExperienceTakeaway} from './experience-takeaways.ts';

export type EvidenceHighlight={x:number;y:number;width?:number;height?:number;label:string;untilMs:number|null};
export type EvidenceAnnotation={id:string;eventIndex:number|null;signalIndex:number;ms:number|null;endMs:number|null;screenshot?:string;tone:EmotionTone;persona:string;caption:string;detail:string;detailLabel:string;highlight:EvidenceHighlight|null};
const valid=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const positive=(value:unknown):value is number=>valid(value)&&value>0;
const validIndex=(value:unknown):value is number=>valid(value)&&Number.isSafeInteger(value);
const text=(value:unknown)=>typeof value==='string'?value.trim():'';
const time=(entry:Row|undefined)=>valid(entry?.originalMs)?entry.originalMs:valid(entry?.videoMs)?entry.videoMs:null;

function recordedHighlight(run:Row,entry:Row,frame:Row|undefined):EvidenceHighlight|null{
 // Only an executed action explicitly linked to this reaction can identify a
 // control. A planned/rejected action or nearby click is not a recorded target.
 const action=validIndex(entry.actionEventIndex)?list(run.events).find(event=>event.index===entry.actionEventIndex&&event.type==='action'):undefined;
 const click=action?.click,viewport=run.viewport||run.deviceSnapshot?.viewport;
 if(!frame||!click||!valid(click.x)||!valid(click.y)||!positive(viewport?.width)||!positive(viewport?.height)||click.x>=viewport.width||click.y>=viewport.height)return null;
 const label=text(click.target?.label)||text(click.requestedLabel);
 if(!label)return null;
 const bounds=click.target?.bounds;
 const untilMs=time(action);
 if(bounds&&valid(bounds.x)&&valid(bounds.y)&&bounds.x<viewport.width&&bounds.y<viewport.height&&positive(bounds.width)&&positive(bounds.height)&&bounds.x+bounds.width<=viewport.width+1&&bounds.y+bounds.height<=viewport.height+1){
  return {x:bounds.x/viewport.width,y:bounds.y/viewport.height,width:Math.min(bounds.width,viewport.width-bounds.x)/viewport.width,height:Math.min(bounds.height,viewport.height-bounds.y)/viewport.height,label,untilMs};
 }
 return {x:click.x/viewport.width,y:click.y/viewport.height,label,untilMs};
}

/** Presentation derived from retained public notes; never infer a feeling from a finding. */
export function buildEvidenceAnnotations(run:Row):EvidenceAnnotation[]{
 const arc=buildEmotionArc(run),events=list(run.events);
 return arc.points.map(point=>{
  const entry=point.entry,frame=validIndex(entry.eventIndex)?events.find(event=>event.index===entry.eventIndex&&safeMedia(event.screenshot)):undefined;
  const takeaway=deriveExperienceTakeaway({moment:entry,reaction:entry.reaction,observation:entry.observation});
  const caption=takeaway?.summary||text(entry.reaction)||text(entry.observation);
  const detail=takeaway?.why||((text(entry.reaction)&&text(entry.observation)!==caption)?text(entry.observation):'');
  const next=point.ms===null?null:arc.timedPoints.find(other=>other.ms!>point.ms!);
  // A reaction is a discrete annotation, not a mood that lasts through the rest
  // of the recording. No cue appears before its own recorded time.
  const endMs=point.ms===null?null:Math.min(point.ms+9000,next?.ms??Infinity);
  return {id:point.id,eventIndex:Number.isInteger(entry.eventIndex)?entry.eventIndex:null,signalIndex:Number.isInteger(entry.signalIndex)?entry.signalIndex:point.index,ms:point.ms,endMs,screenshot:safeMedia(frame?.screenshot)||safeMedia(entry.screenshot),tone:point.tone,persona:person(run),caption,detail:detail===caption?'':detail,detailLabel:takeaway?.why?'Why':'On screen',highlight:recordedHighlight(run,entry,frame)};
 });
}

export function annotationAt(annotations:EvidenceAnnotation[],ms:number|null):EvidenceAnnotation|null{
 if(!valid(ms))return null;
 const position=Math.round(ms); // Stored cues use milliseconds; media clocks use floating-point seconds.
 const active=annotations.filter(note=>note.ms!==null&&note.endMs!==null&&note.ms<=position&&position<note.endMs).sort((a,b)=>a.ms!-b.ms!||a.signalIndex-b.signalIndex).at(-1);
 if(!active)return null;
 // The target belongs to the pre-action screen; clear it once the action has
 // finished. Keep the timestamped subtitle available long enough to read.
 return {...active,highlight:active.highlight?.untilMs!=null&&position<active.highlight.untilMs?active.highlight:null};
}

export function annotationForFrame(annotations:EvidenceAnnotation[],frame:Row):EvidenceAnnotation|null{
 const index=frame.eventIndex??frame.index,src=safeMedia(frame.screenshot);
 return annotations.find(note=>(index!=null?note.eventIndex===index:!!src&&note.screenshot===src)&&(!src||!note.screenshot||note.screenshot===src))||null;
}

export function annotationForMoment(annotations:EvidenceAnnotation[],moment:Row):EvidenceAnnotation|null{
 const ms=time(moment);
 if(!validIndex(moment.signalIndex)&&!validIndex(moment.eventIndex))return null;
 return annotations.find(note=>(validIndex(moment.signalIndex)?note.signalIndex===moment.signalIndex:note.eventIndex===moment.eventIndex)&&(ms===null||note.ms===ms))||null;
}

/** Do not fall back to the replay clock when its original mapping is absent. */
export function annotationClock(run:Row,mode:string,ms:number):number|null{
 return mode==='condensed'?replayToOriginal(run,ms):valid(ms)?ms:null;
}

/** Position highlights inside the rendered image, including portrait letterboxing. */
export function containedMediaRect(width:number,height:number,intrinsicWidth:number,intrinsicHeight:number){
 if(![width,height,intrinsicWidth,intrinsicHeight].every(positive))return null;
 const scale=Math.min(width/intrinsicWidth,height/intrinsicHeight),w=intrinsicWidth*scale,h=intrinsicHeight*scale;
 return {left:(width-w)/2,top:(height-h)/2,width:w,height:h};
}
