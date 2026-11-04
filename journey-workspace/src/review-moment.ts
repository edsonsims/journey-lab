import {label,sourceTime} from './lib.ts';
import type {Row} from './lib.ts';
import type {buildEmotionArc,EmotionPoint} from './emotion-arc.ts';
import {deriveExperienceTakeaway} from './experience-takeaways.ts';
import {momentSignal} from './moment-signals.ts';

const text=(value:unknown)=>typeof value==='string'?value.trim():'';
const readable=(entry:Row)=>[entry.title,entry.reaction,entry.personaComment,entry.observation,entry.interpretation,entry.label,entry.message].some(value=>text(value));

/** An explicit marker owns the card until playback or a new seek clears it. */
export function resolveReviewMoment(run:Row,arc:ReturnType<typeof buildEmotionArc>,selected:Row|null,currentMs:number,preview?:EmotionPoint|null){
 const active=arc.timedPoints.filter(point=>point.ms!<=currentMs).at(-1)||arc.timedPoints[0]||arc.points[0];
 const explicit=selected&&readable(selected)?selected:null;
 const point=preview||(!explicit?active:null);
 const entry=point?{...point.entry,emotionId:point.id}:explicit;
 if(!entry)return null;
 const finding=entry.markerKind==='finding'||entry.kind==='finding';
 const signal=momentSignal(run,entry),reaction=text(signal.reaction);
 const observation=text(entry.observation)||text(entry.message)||text(entry.action?.description);
 const title=finding||!reaction?text(entry.title)||text(entry.label):'';
 const takeaway=deriveExperienceTakeaway({moment:entry,reaction,observation,...(finding?{kind:'finding',findings:[entry]}:{})});
 const sections:{label:string,text:string}[]=[];
 const seen=new Set([title,reaction].filter(Boolean));
 const add=(name:string,value:unknown)=>{const content=text(value);if(content&&!seen.has(content)){sections.push({label:name,text:content});seen.add(content);}};
 add('What happened',observation);
 add('Takeaway',takeaway?.summary);
 add('Why',takeaway?.why);
 if(finding)add('Interpretation',entry.interpretation);
 const track=text(entry.track)||(finding?(entry.type==='defect'?'broken':text(entry.type)):'');
 const ms=point?point.ms:sourceTime(run,entry);
 return {entry,title,reaction,sections,finding,track:track?label(track):'',tone:signal.tone,
  ms:typeof ms==='number'&&Number.isFinite(ms)&&ms>=0?ms:null,
  pointId:point?.id||(!finding&&typeof entry.emotionId==='string'?entry.emotionId:null)};
}
