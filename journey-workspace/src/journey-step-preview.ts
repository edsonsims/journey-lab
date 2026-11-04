import type {Row} from './lib.ts';
import type {JourneyStep} from './journey-matching.ts';
import {momentFrame} from './moment-signals.ts';

const text=(value:unknown)=>typeof value==='string'&&value.trim()?value:null;

/** A preview belongs to this observation, never a sibling persona note. */
export function journeyStepPreview(run:Row|null,step:JourneyStep){
 const entry=step.point.entry;
 const comment=text(entry.personaComment)||text(entry.reaction);
 const observation=comment?null:text(entry.observation);
 const frame=run?momentFrame({...run,experience:[]},{...entry,
  eventIndex:step.eventIndex??entry.eventIndex,
  originalMs:step.ms??undefined,videoMs:step.ms??undefined,
 }):null;
 return {comment,observation,frame};
}
