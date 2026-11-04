import {mapComparisonTime} from './emotion-comparison.ts';
import type {ComparisonSideName,ComparisonTimeState,EmotionComparison} from './emotion-comparison.ts';

export type ImpactMomentSeek={
 commonMs:number|null;
 beforeMs:number|null;
 afterMs:number|null;
 beforeState:ComparisonTimeState;
 afterState:ComparisonTimeState;
 canSeek:boolean;
 canLink:boolean;
 status:'linked'|'partial'|'unavailable'|'untimed';
 label:string;
};

/** Use source recording time and existing explicit anchors, never chart progress.
 * Missing media bounds cannot establish a seek target; callers may supply a
 * comparison rebuilt with actual loaded video durations once those are known. */
export function planImpactMomentSeek(model:EmotionComparison,side:ComparisonSideName,sourceMs:number|null):ImpactMomentSeek{
 const empty:ImpactMomentSeek={commonMs:null,beforeMs:null,afterMs:null,beforeState:'unavailable',afterState:'unavailable',canSeek:false,canLink:false,status:'unavailable',label:'This observation has no valid recording time.'};
 if(sourceMs===null)return {...empty,status:'untimed',label:'This observation has no recording time.'};
 if(!Number.isFinite(sourceMs)||sourceMs<0)return empty;
 const commonMs=sourceMs-model[side].anchorMs,mapped=mapComparisonTime(model,commonMs);
 const sourceState=side==='before'?mapped.beforeState:mapped.afterState;
 if(sourceState!=='available'){
  const label=sourceState==='finished'||sourceState==='not_started'?`This moment falls outside the ${side} recording.`:
   model[side].hasVideo?`The ${side} recording duration is not available yet.`:`No ${side} recording is available for this moment.`;
  return {...empty,...mapped,beforeMs:null,afterMs:null,label};
 }
 const bothAvailable=mapped.beforeState==='available'&&mapped.afterState==='available';
 const canLink=bothAvailable&&!!model.overlap&&model.overlap.endMs>model.overlap.startMs;
 const peer=side==='before'?'after':'before',peerState=peer==='before'?mapped.beforeState:mapped.afterState;
 const label=canLink?(model.alignment==='milestone'?'Both recordings follow the selected alignment.':'Both recordings at the same elapsed time.'):
  peerState==='finished'?`The ${peer} recording has ended at this moment.`:
  peerState==='not_started'?`The ${peer} recording has not started at this aligned moment.`:
  peerState==='unavailable'?`Only the ${side} recording is available at this moment.`:'These recordings have no shared playback window.';
 return {...mapped,canSeek:true,canLink,status:canLink?'linked':'partial',label};
}
