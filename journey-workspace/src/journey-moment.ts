import {buildEmotionArc} from './emotion-arc.ts';
import {list,sourceTime} from './lib.ts';
import type {Row} from './lib.ts';

const validIndex=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
export const validMomentTime=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const queryNumber=(value:string|null)=>value!==null&&value.trim()!==''?Number(value):NaN;

export function journeyMomentTime(params:URLSearchParams):number|null{
 const value=queryNumber(params.get('at'));return validMomentTime(value)?value:null;
}

export function journeyMomentKey(runId:string,params:URLSearchParams):string{
 return JSON.stringify([runId,...['at','signal','event','finding'].map(key=>params.get(key))]);
}

/** Update all source keys together so a later click cannot retain an older identity. */
export function setJourneyMoment(params:URLSearchParams,entry:Row,ms:number):void{
 params.set('at',String(ms));params.delete('signal');params.delete('event');params.delete('finding');
 if(entry.markerKind==='finding'&&typeof entry.id==='string'&&entry.id)params.set('finding',entry.id);
 const signal=validIndex(entry.signalIndex)?entry.signalIndex:typeof entry.emotionId==='string'&&/^emotion-\d+$/.test(entry.emotionId)?Number(entry.emotionId.slice(8)):null;
 const event=entry.eventIndex??entry.actionEventIndex??entry.index;
 if(!params.has('finding')&&validIndex(signal))params.set('signal',String(signal));
 if(validIndex(event))params.set('event',String(event));
}

/** Only exact recorded identities/times may populate a source-moment deep link. */
export function resolveJourneyMoment(run:Row,params:URLSearchParams):Row|null{
 const ms=journeyMomentTime(params);if(ms===null)return null;
 const hasSignal=params.has('signal'),hasEvent=params.has('event'),signal=queryNumber(params.get('signal')),event=queryNumber(params.get('event'));
 if(hasSignal&&!validIndex(signal)||hasEvent&&!validIndex(event))return null;
 if(params.has('finding')){
  if(hasSignal)return null;
  const finding=list(run.findings).find(entry=>entry.id===params.get('finding')&&sourceTime(run,entry)===ms&&(!hasEvent||entry.eventIndex===event));
  return finding?{...finding,markerKind:'finding',originalMs:ms}:null;
 }
 const arc=buildEmotionArc(run);
 const points=arc.points.filter(point=>point.ms===ms&&(!hasSignal||(validIndex(point.entry.signalIndex)?point.entry.signalIndex:point.index)===signal)&&(!hasEvent||point.entry.eventIndex===event||point.entry.actionEventIndex===event));
 if(points.length===1){const point=points[0];return {...point.entry,emotionId:point.id,signalIndex:validIndex(point.entry.signalIndex)?point.entry.signalIndex:point.index,originalMs:ms};}
 // A stale signal must never become a different reaction or browser event.
 if(hasSignal||points.length>1)return null;
 const events=list(run.events).filter(entry=>(!hasEvent||entry.index===event)&&sourceTime({experience:[]},entry)===ms);
 if(events.length!==1)return null;
 const entry=events[0];
 return {...entry,eventIndex:entry.index,originalMs:ms,title:entry.label||entry.message||'Recorded event',observation:entry.observation||entry.message||entry.action?.description||''};
}
