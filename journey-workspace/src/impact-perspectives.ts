import {impactOutcome,impactPairState,recordedCount} from './change-impact.ts';
import type {ImpactTone} from './change-impact.ts';
import {buildEmotionArc} from './emotion-arc.ts';
import {buildImpactExperience} from './impact-experience.ts';
import type {ImpactExperience} from './impact-experience.ts';
import {exampleMoments} from './impact-example-experience.ts';
import type {Row} from './lib.ts';

export type PerspectiveFilter='all'|'attention'|'experience'|'improved'|'unchanged'|'incomplete';
export const perspectiveFilters:{value:PerspectiveFilter;label:string}[]=[
 {value:'all',label:'All perspectives'},
 {value:'attention',label:'Needs attention'},
 {value:'experience',label:'Better experience'},
 {value:'improved',label:'Goals improved'},
 {value:'unchanged',label:'No goal change'},
 {value:'incomplete',label:'Incomplete'},
];
const text=(value:unknown)=>typeof value==='string'?value:'';
const pairName=(pair:Row)=>text(pair.personaName)||text(pair.before?.personaSnapshot?.name)||text(pair.after?.personaSnapshot?.name)||text(pair.before?.personaName)||text(pair.personaId)||'Persona';

function reactions(run:Row|undefined|null){
 if(!run)return {negative:null,rated:0,unrated:0};
 const arc=buildEmotionArc(run),rated=arc.points.filter(point=>point.value!==null);
 // Counts can include untimed observations; their absence from a video chart is
 // not evidence that the persona had no negative reactions.
 return {negative:rated.length?rated.filter(point=>point.value!<0).length:null,rated:rated.length,unrated:arc.points.length-rated.length};
}

function exampleEmotion(pair:Row,incomplete:boolean):ImpactExperience['emotion']{
 const emotion:ImpactExperience['emotion']={direction:'unavailable',compared:0,higher:0,lower:0,same:0};
 if(incomplete)return emotion;
 for(const moment of exampleMoments(pair)){
  if(moment.before?.value==null||moment.after?.value==null)continue;
  emotion.compared++;
  const delta=moment.after.value-moment.before.value;
  if(delta>0)emotion.higher++;
  else if(delta<0)emotion.lower++;
  else emotion.same++;
 }
 emotion.direction=emotion.higher&&emotion.lower?'mixed':emotion.higher?'higher':emotion.lower?'lower':emotion.compared?'same':'unavailable';
 return emotion;
}

export function buildImpactPerspective(pair:Row,index=0){
 const state=impactPairState(pair),experience=buildImpactExperience(pair);
 const isExample=pair.isExample===true||pair.provenance==='authored_ui_example';
 const finished=pair.before?.status==='finished'&&pair.after?.status==='finished';
 const incomplete=!finished||['pending','inconclusive'].includes(state.key);
 const emotion=isExample?exampleEmotion(pair,incomplete):experience.emotion;
 const goalImproved=!incomplete&&pair.outcomeChange==='improved';
 const goalRegressed=!incomplete&&pair.outcomeChange==='regressed';
 const noGoalChange=!incomplete&&pair.outcomeChange==='unchanged';
 const beforeReactions=reactions(pair.before),afterReactions=reactions(pair.after);
 const negativeIncrease=!incomplete&&beforeReactions.negative!==null&&afterReactions.negative!==null&&afterReactions.negative>beforeReactions.negative;
 const needsAttention=!incomplete&&(goalRegressed||negativeIncrease||emotion.lower>0||pair.effortChange==='more_actions');
 const betterExperience=!incomplete&&!needsAttention&&emotion.higher>0;
 const tone:ImpactTone=goalRegressed?'negative':incomplete?'pending':needsAttention?'warning':goalImproved||betterExperience?'positive':'neutral';
 const role=text(pair.personaRole)||text(pair.role)||text(pair.before?.personaSnapshot?.role)||text(pair.after?.personaSnapshot?.role);
 const stateLabel=incomplete?(state.key==='inconclusive'?state.label:'Comparison incomplete'):goalRegressed?'Goal regressed':goalImproved?'Goal improved':'Same goal outcome';
 const sourceLabel=isExample?'in this example':'recorded';
 const observation=(isExample&&text(pair.exampleObservation))||(incomplete?stateLabel:negativeIncrease?`More negative reactions ${sourceLabel}`:emotion.lower>0?'Less positive at matched moments':
  beforeReactions.negative!==null&&afterReactions.negative!==null&&afterReactions.negative<beforeReactions.negative?`Fewer negative reactions ${sourceLabel}`:
  emotion.higher>0?'More positive at matched moments':pair.effortChange==='more_actions'?`More actions ${sourceLabel}`:pair.effortChange==='fewer_actions'?`Fewer actions ${sourceLabel}`:stateLabel);
 const outcome=(side:'before'|'after')=>isExample&&!pair[side]?'Not provided':impactOutcome(pair,side);
 return {id:String(pair.personaId||`persona-${index}`),name:pairName(pair),role,pair,index,stateLabel,tone,incomplete,goalImproved,goalRegressed,noGoalChange,needsAttention,betterExperience,emotion,
  observation,observationDetail:isExample?text(pair.exampleReason):'',isExample,experience,beforeReactions,afterReactions,
  beforeOutcome:outcome('before'),afterOutcome:outcome('after'),
  beforeActions:pair.before?recordedCount(pair.metrics?.before?.interactionActions):null,
  afterActions:pair.after?recordedCount(pair.metrics?.after?.interactionActions):null,
  attentionRank:goalRegressed?0:needsAttention?1:incomplete?2:goalImproved||betterExperience?3:4};
}
export type ImpactPerspective=ReturnType<typeof buildImpactPerspective>;

/** Summarize observed counts without turning effort or coverage into an overall score. */
export function impactPerspectiveTakeaway(item:ImpactPerspective){
 if(item.incomplete)return {goal:item.stateLabel,changes:[],text:item.stateLabel};
 const knownOutcomes=['Goal reached','Obstacle observed'];
 const known=knownOutcomes.includes(item.beforeOutcome)&&knownOutcomes.includes(item.afterOutcome);
 const goal=!known?'Goal outcome not established':item.beforeOutcome===item.afterOutcome?
  item.beforeOutcome==='Goal reached'?'Goal reached in both':'Obstacle observed in both':`${item.beforeOutcome} → ${item.afterOutcome}`;
 const delta=(before:number|null,after:number|null,noun:string,unchanged:string)=>{
  if(before===null||after===null)return null;
  const change=after-before;
  return change===0?unchanged:`${Math.abs(change)} ${change>0?'more':'fewer'} ${noun}${Math.abs(change)===1?'':'s'}`;
 };
 const changes=[
  delta(item.beforeActions,item.afterActions,'action','Same action count'),
  delta(item.beforeReactions.negative,item.afterReactions.negative,'negative reaction','Same negative reaction count'),
 ].filter((value):value is string=>value!==null);
 return {goal,changes,text:[goal,...changes].join(' · ')};
}

export function buildImpactPerspectives(pairs:Row[]):ImpactPerspective[]{
 return pairs.map(buildImpactPerspective).sort((a,b)=>a.attentionRank-b.attentionRank||a.index-b.index);
}

export function filterImpactPerspectives(items:ImpactPerspective[],query='',filter:PerspectiveFilter='all'){
 const words=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
 return items.filter(item=>{
  const haystack=[item.name,item.role,item.observation,item.observationDetail,item.beforeOutcome,item.afterOutcome,item.stateLabel,impactPerspectiveTakeaway(item).text].join(' ').toLocaleLowerCase();
  if(!words.every(word=>haystack.includes(word)))return false;
  return filter==='all'||filter==='attention'&&item.needsAttention||filter==='experience'&&item.betterExperience||filter==='improved'&&item.goalImproved||filter==='unchanged'&&item.noGoalChange||filter==='incomplete'&&item.incomplete;
 });
}

export function impactPerspectiveSummary(items:ImpactPerspective[]){
 return {total:items.length,attention:items.filter(item=>item.needsAttention).length,improved:items.filter(item=>item.goalImproved).length,betterExperience:items.filter(item=>item.betterExperience).length,incomplete:items.filter(item=>item.incomplete).length};
}
