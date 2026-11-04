import {list,safeMedia} from './lib.ts';
import type {Row} from './lib.ts';

export type ImpactStage='proposal'|'repair';
export type ImpactTone='positive'|'negative'|'warning'|'neutral'|'pending';
export function impactStagePairs(record:Row|null|undefined,stage:ImpactStage):Row[]{
 return list(stage==='repair'?record?.report?.repair?.pairs:record?.report?.pairs);
}
export function completedRecordingPairs(pairs:Row[]):Row[]{
 return pairs.filter(pair=>['before','after'].every(side=>pair[side]?.status==='finished'&&!!safeMedia(pair[side]?.video)));
}
export function repairRecordingsComplete(record:Row|null|undefined):boolean{
 const pairs=impactStagePairs(record,'repair'),expected=list(record?.personas).map(persona=>persona.personaId);
 const captured=new Set(completedRecordingPairs(pairs).map(pair=>pair.personaId));
 return expected.length>0&&expected.every(personaId=>captured.has(personaId));
}
export function impactPairState(pair:Row):{label:string;tone:ImpactTone;key:string}{
 if(pair.controls?.status==='mismatch')return {label:'Controls differ',tone:'warning',key:'inconclusive'};
 if(pair.controls?.status==='pending'||!pair.before||!pair.after||[pair.before.status,pair.after.status].some(status=>['queued','running','finalizing'].includes(status)))return {label:'Awaiting journeys',tone:'pending',key:'pending'};
 if(pair.outcomeChange==='inconclusive'||pair.controls?.status!=='matched')return {label:'Inconclusive',tone:'warning',key:'inconclusive'};
 if(pair.outcomeChange==='improved')return {label:'Goal improved',tone:'positive',key:'improved'};
 if(pair.outcomeChange==='regressed')return {label:'Goal regressed',tone:'negative',key:'regressed'};
 if(pair.effortChange==='more_actions')return {label:'More actions',tone:'warning',key:'more_actions'};
 if(pair.effortChange==='fewer_actions')return {label:'Fewer actions',tone:'neutral',key:'fewer_actions'};
 if(pair.outcomeChange==='unchanged')return {label:'Same goal outcome',tone:'neutral',key:'unchanged'};
 return {label:'Not evaluated',tone:'pending',key:'pending'};
}
export function impactSummary(pairs:Row[]){
 const states=pairs.map(impactPairState);
 const comparable=pairs.filter((pair,index)=>!['pending','inconclusive'].includes(states[index].key));
 return {personas:pairs.length,regressions:states.filter(x=>x.key==='regressed').length,improvements:states.filter(x=>x.key==='improved').length,
  moreActions:comparable.filter(pair=>pair.effortChange==='more_actions').length,fewerActions:comparable.filter(pair=>pair.effortChange==='fewer_actions').length,
  inconclusive:states.filter(x=>x.key==='inconclusive').length,pending:states.filter(x=>x.key==='pending').length};
}
export function preferredImpactPair(pairs:Row[]):Row|undefined{
 return pairs.find(pair=>impactPairState(pair).key==='regressed')||pairs.find(pair=>impactPairState(pair).key==='more_actions')||pairs.find(pair=>impactPairState(pair).key==='inconclusive')||pairs[0];
}
export function impactOutcome(pair:Row,side:'before'|'after'){
 const run=pair[side],result=pair.metrics?.[side]?.outcome;
 if(!run)return 'Not recorded';
 if(['queued','running','finalizing'].includes(run.status))return 'In progress';
 if(run.status!=='finished')return 'Incomplete';
 return ({goal_reached:'Goal reached',obstacle_observed:'Obstacle observed',inconclusive:'Inconclusive'} as Record<string,string>)[result]||'Not evaluated';
}
export function recordedCount(value:unknown):number|null{return typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;}
export function impactStageLabels(record:Row,stage:ImpactStage){return stage==='repair'?{before:record.proposal?.label||'Proposed',after:'Repaired'}:{before:record.baseline?.label||'Current',after:record.proposal?.label||'Proposed'};}
