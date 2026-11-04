import type {Row} from './lib.ts';

export type ExperienceScreenState={
 id:string;
 label:string;
 kind:'recorded'|'inferred'|'unknown';
 basis:string;
 observation:string;
 source:{runId:string|null;eventIndex:number|null;signalIndex:number|null;originalMs:number|null};
};

const text=(value:unknown)=>typeof value==='string'?value.trim():'';
const finite=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
const states=[
 {id:'gather-room-selection',label:'Room selection'},
 {id:'gather-meeting-plans',label:'Meeting plans'},
 {id:'gather-room-details',label:'Room details'},
 {id:'gather-review-booking',label:'Review booking'},
 {id:'gather-confirmation',label:'Confirmation'},
 {id:'gather-reservations',label:'My reservations'},
];
const state=(id:string)=>states.find(item=>item.id===id)!;
const knownNames:Record<string,string>={
 'room selection':'gather-room-selection','rooms':'gather-room-selection','choose a room':'gather-room-selection','find your kind of room':'gather-room-selection',
 'meeting plans':'gather-meeting-plans','your plans':'gather-meeting-plans',"what's the plan":'gather-meeting-plans',
 'room details':'gather-room-details','meeting details':'gather-room-details','your meeting':'gather-room-details','what brings you together':'gather-room-details',
 'review booking':'gather-review-booking','review':'gather-review-booking','one last look':'gather-review-booking','ready when you are':'gather-review-booking',
 'confirmation':'gather-confirmation','confirmed':'gather-confirmation',"you've got a room":'gather-confirmation',
 'my reservations':'gather-reservations','reservations':'gather-reservations',
};
const nameKey=(value:string)=>value.toLowerCase().replace(/[’‘]/g,"'").replace(/[.!?]+$/g,'').replace(/[_-]+/g,' ').trim();
const usable=(value:string)=>value&&!/^(?:unknown|unspecified|not recorded|state not specified)$/i.test(value);

/** Only assert the current visible screen, not a requested action or a future destination. */
function observedStateIds(observation:string):string[]{
 const ids=new Set<string>();
 const clauses=observation.replace(/[“”]/g,'"').split(/(?<=[.!?])\s+|\n+/).map(value=>value.trim());
 for(const clause of clauses){
  // Direct present-tense descriptions are deliberate: a Review booking button
  // on the details form must never turn that form into the review screen.
  if(/^(?:the\s+)?confirmation(?:\s+(?:page|screen|view))?\s+(?:shows|says|displays|is visible)\b/i.test(clause))ids.add('gather-confirmation');
  if(/^(?:the\s+)?(?:my reservations(?:\s+(?:page|screen|view))?|reservations?\s+(?:page|screen|list|view))\s+(?:shows|lists|displays|is visible)\b/i.test(clause))ids.add('gather-reservations');
  if(/^(?:(?!(?:previous|earlier|next|before|after|expected|no)\b)[a-z][\w'-]*\s+)?review(?:\s+(?:page|screen|step|view))?\s+(?:shows|lists|displays|is visible)\b/i.test(clause))ids.add('gather-review-booking');
  if(/^(?:(?!(?:previous|earlier|next|before|after|expected|no)\b)[a-z][\w'-]*\s+)?(?:meeting\s+)?details\s+(?:page|screen|form)(?:\s+for\s+[a-z][\w'-]*)?\s+(?:shows|displays|is visible)\b/i.test(clause)
   ||/^your meeting\s+(?:page|step|form)(?:\s+for\s+[a-z][\w'-]*)?\s+(?:shows|displays|is visible)\b/i.test(clause)
   ||/^(?:(?!(?:previous|earlier|next|before|after|expected|no)\b)[a-z][\w'-]*\s+)?meeting name(?:\s+(?:field|input))?\s+(?:(?:now|again|still)\s+)*(?:reads|shows|is focused|is empty)\b/i.test(clause)
   ||/^(?:[a-z][\w'-]*\s+)?form\s+(?:again\s+)?shows\b.*\bentered\b.*\breview booking\b.*\b(?:available|visible)\b/i.test(clause))ids.add('gather-room-details');
  if((/^(?:landing(?:\s+page)?|gather home)\s+(?:shows|lists|displays)\b/i.test(clause)&&/\b(?:rooms?|seats|available)\b/i.test(observation))
   ||/^room list\s+(?:again\s+)?(?:shows|confirms|lists|displays)\b/i.test(clause)
   ||/\b(?:same\s+)?(?:two|several|available) rooms\s+(?:remain|are|still)\s+visible\b/i.test(clause)
   ||/^scrolling did not reveal additional rooms;\s*only .+\bare listed\b/i.test(clause))ids.add('gather-room-selection');
  if(/^form\s+(?:shows|displays)\b/i.test(clause)&&/\b(?:people|attendees)\b/i.test(clause)&&/\bprojector\b/i.test(clause)&&/\bchecked\b/i.test(clause))ids.add('gather-meeting-plans');
 }
 return [...ids];
}

/** Display-only classification. Explicit source state wins; old recordings stay intact. */
export function experienceScreenState(projectId:string,moment:Row):ExperienceScreenState{
 const observation=text(moment.observation),source={runId:text(moment.runId||moment.source?.runId)||null,eventIndex:finite(moment.eventIndex??moment.source?.eventIndex),signalIndex:finite(moment.signalIndex??moment.source?.signalIndex),originalMs:finite(moment.originalMs??moment.source?.originalMs)};
 const unknown=(basis:string):ExperienceScreenState=>({id:'unknown',label:'Unknown screen',kind:'unknown',basis,observation,source});
 const explicit=[['state',moment.state],['source.state',moment.source?.state],['context.state',moment.context?.state]] as const;
 for(const [field,value] of explicit){
  const recorded=text(value);if(!usable(recorded))continue;
  const known=projectId==='gather'?(states.some(item=>item.id===recorded)?recorded:knownNames[nameKey(recorded)]):undefined;
  return {id:known||`recorded:${recorded}`,label:known?state(known).label:recorded,kind:'recorded',basis:`Recorded screen state (${field}).`,observation,source};
 }
 if(projectId!=='gather')return unknown('No recorded screen state.');
 // Heading metadata is supported only when explicitly supplied as a screen
 // heading. Browser document titles and button text are not screen identity.
 const headings=[moment.screenHeading,moment.pageHeading,moment.source?.screenHeading,moment.source?.pageHeading].map(text).filter(Boolean);
 const headingIds=[...new Set(headings.map(heading=>knownNames[nameKey(heading)]).filter(Boolean))];
 const observedIds=observedStateIds(observation),ids=[...new Set([...headingIds,...observedIds])];
 if(ids.length!==1)return unknown(ids.length>1?'Recorded observations describe multiple screen states.':'Recorded observation does not identify a screen state.');
 return {...state(ids[0]),kind:'inferred',basis:headingIds.length?'Inferred from recorded screen heading.':'Inferred from recorded observation.',observation,source};
}

/** Moments remain exact source objects, in the order supplied by the caller. */
export function experienceStateGroups(projectId:string,moments:Row[]):Array<{id:string;label:string;moments:Row[];recordedCount:number;inferredCount:number}>{
 const groups=new Map<string,{id:string;label:string;moments:Row[];recordedCount:number;inferredCount:number}>();
 for(const moment of moments){
  const result=experienceScreenState(projectId,moment);
  if(!groups.has(result.id))groups.set(result.id,{id:result.id,label:result.label,moments:[],recordedCount:0,inferredCount:0});
  const group=groups.get(result.id)!;group.moments.push(moment);if(result.kind==='recorded')group.recordedCount++;if(result.kind==='inferred')group.inferredCount++;
 }
 return [...groups.values()];
}
