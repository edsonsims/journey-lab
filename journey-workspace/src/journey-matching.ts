import {buildEmotionArc} from './emotion-arc.ts';
import type {EmotionPoint} from './emotion-arc.ts';
import {safeDisplay} from './finding-context.ts';
import {list} from './lib.ts';
import type {Row} from './lib.ts';

export type JourneyAction = {kind:string;label:string|null;value:string|null;signature:string|null;exact:boolean};
export type JourneyStep = {
  id:string;runId:string;index:number;eventIndex:number|null;actionEventIndex:number|null;
  ms:number|null;point:EmotionPoint;title:string;screen:string;fromScreen:string;
  action:JourneyAction;occurrence:number;visit:number;
  /** Recorded route/action sequence only. No persona interpretation enters this context. */
  routeContext:string;sequenceContext:string;previousContext:string;contextKnown:boolean;previousContextKnown:boolean;
};
export type JourneyMatch = {
  id:string;beforeId:string;afterId:string;confidence:'high'|'review';reasons:string[];
};
export type JourneyReviewDecision = {beforeId:string;afterId:string;status:'accepted'|'rejected';source:'suggested'|'manual';note?:string};
export type ReviewedJourneyMatch = JourneyMatch & {status:'suggested'|'review'|'accepted'|'rejected';source:'suggested'|'manual'};
export type JourneyMatches = {
  version:'recorded-actions-v1';beforeSteps:JourneyStep[];afterSteps:JourneyStep[];
  beforeDurationMs:number|null;afterDurationMs:number|null;
  matches:JourneyMatch[];unmatchedBefore:JourneyStep[];unmatchedAfter:JourneyStep[];
};

const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const nonnegative=(value:unknown):value is number=>finite(value)&&value>=0;
const privateField=/password|passwd|secret|token|api.?key|credential|one.time.code|credit.card|card.number|email|phone|address|birth|ssn/i;
const redacted=/\[(?:REDACTED|EMAIL|PRIVATE|MASKED|HIDDEN)\]/i;
const str=(value:unknown)=>typeof value==='string'?value:'';
const normalized=(value:unknown)=>str(value).trim().replace(/\s+/g,' ');
const readable=(value:unknown,max=180)=>safeDisplay(str(value),max);
const pairId=(beforeId:string,afterId:string)=>`${beforeId}--${afterId}`;
const activity=(event:Row)=>event.type==='action'||event.type==='action_rejected';
function lastIndex(events:Row[],predicate:(event:Row)=>boolean,start=events.length-1){for(let i=start;i>=0;i--)if(predicate(events[i]))return i;return -1;}

/** Origins can differ between a baseline checkout and a candidate checkout. */
function page(value:unknown):{path:string;hasQuery:boolean} {
  if(typeof value!=='string'||!value)return {path:'',hasQuery:false};
  try {
    const url=new URL(value,'https://journey.invalid');
    if(!['http:','https:'].includes(url.protocol))return {path:'',hasQuery:false};
    // Hash-based app routes are routes; ordinary fragments are viewport anchors.
    const hashPath=url.hash.startsWith('#/')?url.hash.slice(1).split('?')[0]:'';
    const rawPath=url.pathname+(hashPath?`#${hashPath}`:''),path=readable(rawPath,500);
    return {path,hasQuery:!!url.search||(!!hashPath&&url.hash.includes('?'))||path!==rawPath};
  } catch {return {path:'',hasQuery:false};}
}
function safeExact(value:unknown):string|null {
  const raw=str(value);
  return raw&&raw.length<=2000&&!redacted.test(raw)&&safeDisplay(raw)===raw?raw:null;
}

function describeAction(event:Row|undefined,previousShot:Row|undefined,landing:boolean):{action:JourneyAction;title:string} {
  const unknown=(title='Action not captured',kind='unknown')=>({title,action:{kind,label:null,value:null,signature:null,exact:false}});
  if(landing)return {title:'Arrived on the page',action:{kind:'landing',label:null,value:null,signature:'landing',exact:true}};
  if(!event)return unknown();
  if(event.type==='action_rejected')return unknown('Action was not executed','rejected');
  const action=event.action||{},kind=str(action.type),target=event.click?.target||{};
  if(['click','click_control','double_click'].includes(kind)) {
    const label=safeExact(normalized(target.label||target.accessibleName));
    const type=normalized(target.role||target.tag).toLowerCase();
    const interactive=['a','button','input','select','textarea','button','link','textbox','combobox','checkbox','radio','tab','menuitem','switch','option'].includes(type);
    // A coordinate alone, a requested label, or a text-bearing div does not prove
    // which control actually received the interaction.
    const title=label?`${kind==='double_click'?'Double-clicked':'Clicked'} “${readable(label)}”`:'Clicked a point on the page';
    return {title,action:{kind:kind==='double_click'?'double_click':'click',label:label?readable(label):null,value:null,
      signature:label&&interactive?JSON.stringify([kind==='double_click'?'double_click':'click',type,label]):null,exact:!!label&&interactive}};
  }
  if(kind==='select_option') {
    const field=safeExact(normalized(event.accessibility?.selectorLabel||previousShot?.accessibility?.focusedSelect?.label));
    const value=field&&!privateField.test(field)?safeExact(str(event.accessibility?.optionLabel||action.label)):null;
    return {title:field&&value?`Selected “${readable(value)}” in ${readable(field)}`:'Selected an option',
      action:{kind:'select',label:field?readable(field):null,value:value?readable(value):null,signature:field&&value?JSON.stringify(['select',field,value]):null,exact:!!field&&!!value}};
  }
  if(kind==='type'||kind==='type_text') {
    const context=event.inputContext||{},field=safeExact(normalized(context.label||context.fieldLabel||context.accessibleName));
    const type=normalized(context.inputType||context.tag);
    const raw=action.text??action.value;
    const safe=context.sensitive!==true&&context.visible!==false&&!privateField.test(`${field||''} ${type}`);
    const value=safe&&typeof raw==='string'&&(raw===''||safeExact(raw)!==null)?raw:null;
    const known=!!field&&!!type&&value!==null;
    return {title:field?`Typed into ${readable(field)}`:'Typed into an unidentified field',
      action:{kind:'input',label:field?readable(field):null,value:known?readable(value,500):null,signature:known?JSON.stringify(['input',type,field,value]):null,exact:known}};
  }
  if(kind==='scroll') {
    const x=finite(action.scroll_x)?Math.sign(action.scroll_x):0,y=finite(action.scroll_y)?Math.sign(action.scroll_y):0;
    const direction=y?(y>0?'down':'up'):x?(x>0?'right':'left'):'';
    return {title:direction?`Scrolled ${direction}`:'Scrolled the page',action:{kind:'scroll',label:direction||null,value:null,signature:direction?`scroll:${x}:${y}`:null,exact:false}};
  }
  return unknown(kind==='wait'?'Waited for the page':kind==='keypress'?'Pressed a key':'Interaction not identified',kind||'unknown');
}

export function buildJourneySteps(run:Row|null|undefined):JourneyStep[] {
  const source=run||{},events=list(source.events),points=buildEmotionArc(source).points;
  const occurrences=new Map<string,number>(),history:(string|null)[]=[],routeHistory:string[]=[],visits=new Map<string,number>(),seenShots=new Set<number>();
  let scanned=-1,lastObservedShot=-1,lastPath='';
  return points.map(point=>{
    const entry=point.entry;
    // actionEventIndex belongs to the next intended action. It is used only to
    // find its preceding screenshot when the note has no explicit screenshot.
    let shotPos=events.findIndex(event=>event.index===entry.eventIndex&&event.type==='screenshot');
    if(shotPos<0&&entry.eventIndex==null&&entry.actionEventIndex!=null) {
      const intended=events.findIndex(event=>event.index===entry.actionEventIndex);
      if(intended>=0)shotPos=lastIndex(events,event=>event.type==='screenshot',intended-1);
    }
    const shot=shotPos>=0?events[shotPos]:undefined;
    const actionPos=shotPos>=0?lastIndex(events,activity,shotPos-1):-1;
    const actionEvent=actionPos>=0?events[actionPos]:undefined;
    const previousShot=actionPos>=0?events[lastIndex(events,event=>event.type==='screenshot',actionPos-1)]:undefined;
    const destination=page(shot?.url),from=page(actionPos>=0?previousShot?.url:shot?.url);
    // Count recorded route visits independently of which screenshots received a
    // persona note. A later revisit must not be paired with an earlier visit.
    for(let i=scanned+1;i<=shotPos;i++)if(events[i].type==='screenshot'){
      const path=page(events[i].url).path;
      if(path&&path!==lastPath){routeHistory.push(path);visits.set(path,(visits.get(path)||0)+1);lastPath=path;}
    }
    scanned=Math.max(scanned,shotPos);
    const landing=shotPos>=0&&actionPos<0;
    const described=describeAction(actionEvent,previousShot,landing);
    // Persona observations are not guaranteed after every browser action. A
    // skipped action must break context equality, even when its screenshot has
    // the same page path as the next observed step.
    if(events.slice(lastObservedShot+1,Math.max(lastObservedShot+1,actionPos)).some(activity))history.push(null);
    const signature=destination.path&&from.path&&described.action.signature?JSON.stringify([from.path,destination.path,described.action.signature]):null;
    const occurrence=signature?(occurrences.get(signature)||0)+1:1;
    if(signature)occurrences.set(signature,occurrence);
    const step:JourneyStep={id:point.id,runId:str(source.id),index:point.index,eventIndex:finite(shot?.index)?shot!.index:null,
      actionEventIndex:finite(actionEvent?.index)?actionEvent!.index:null,ms:point.ms,point,title:described.title,
      screen:destination.path||'Unknown screen',fromScreen:from.path||'Unknown screen',
      action:{...described.action,signature,exact:described.action.exact&&!destination.hasQuery&&!from.hasQuery&&!seenShots.has(shotPos)},
      occurrence,visit:visits.get(destination.path)||0,routeContext:JSON.stringify(routeHistory),
      sequenceContext:JSON.stringify(history),previousContext:JSON.stringify(history.slice(-2)),contextKnown:history.every(item=>item!==null),previousContextKnown:history.slice(-2).every(item=>item!==null)};
    // Null barriers never count as matching sequence evidence on either side.
    history.push(signature);seenShots.add(shotPos);lastObservedShot=Math.max(lastObservedShot,shotPos);
    return step;
  });
}

function proposal(before:JourneyStep,after:JourneyStep,beforeCounts:Map<string,number>,afterCounts:Map<string,number>):JourneyMatch|null {
  const signature=before.action.signature;
  if(!signature||signature!==after.action.signature)return null;
  const sameRoute=before.routeContext===after.routeContext&&before.visit===after.visit;
  const sameSequence=before.contextKnown&&after.contextKnown&&before.sequenceContext===after.sequenceContext;
  const samePrevious=before.previousContextKnown&&after.previousContextKnown&&before.previousContext===after.previousContext;
  const repeated=(beforeCounts.get(signature)||0)>1||(afterCounts.get(signature)||0)>1;
  // Occurrence and route-history guards stop an earlier attempt matching a later
  // revisit after a branch. Ambiguity remains available for a manual pairing.
  if(repeated&&(!sameRoute||before.occurrence!==after.occurrence))return null;
  if(before.action.kind==='scroll'&&(!sameRoute||before.occurrence!==after.occurrence||(!sameSequence&&!samePrevious)))return null;
  const strong=before.action.exact&&after.action.exact&&sameRoute&&
    (sameSequence||(!repeated&&samePrevious));
  const reasons=[before.action.kind==='landing'?'Same recorded entry page':before.action.kind==='scroll'?'Same scroll direction and route context':'Same recorded control, action and page'];
  if(before.action.kind==='input'||before.action.kind==='select')reasons.push('Same recorded field and entered value');
  if(sameSequence)reasons.push('Same preceding action sequence');
  else if(sameRoute)reasons.push('Same route visit; preceding actions differ');
  else reasons.push('Route history differs; check the context');
  if(before.action.kind==='scroll')reasons.push('Scrolls can reveal different content; review both frames');
  if(repeated)reasons.push(`Recorded occurrence ${before.occurrence} in both journeys`);
  if(!before.action.exact||!after.action.exact)if(before.action.kind!=='scroll')reasons.push('Page or action context is incomplete');
  return {id:pairId(before.id,after.id),beforeId:before.id,afterId:after.id,confidence:strong?'high':'review',reasons};
}

/** Deterministic monotonic alignment of actions, independent of emotions and time. */
export function buildJourneyMatches(beforeRun:Row|null|undefined,afterRun:Row|null|undefined):JourneyMatches {
  const beforeSteps=buildJourneySteps(beforeRun),afterSteps=buildJourneySteps(afterRun);
  const count=(steps:JourneyStep[])=>{const result=new Map<string,number>();for(const step of steps)if(step.action.signature)result.set(step.action.signature,(result.get(step.action.signature)||0)+1);return result;};
  const bc=count(beforeSteps),ac=count(afterSteps);
  const candidates=beforeSteps.map(before=>afterSteps.map(after=>proposal(before,after,bc,ac)));
  const highWeight=beforeSteps.length+afterSteps.length+1;
  const scores=Array.from({length:beforeSteps.length+1},()=>Array(afterSteps.length+1).fill(0) as number[]);
  for(let i=beforeSteps.length-1;i>=0;i--)for(let j=afterSteps.length-1;j>=0;j--){
    const candidate=candidates[i][j],weight=candidate?(candidate.confidence==='high'?highWeight:1):0;
    scores[i][j]=Math.max(scores[i+1][j],scores[i][j+1],candidate?weight+scores[i+1][j+1]:0);
  }
  const matches:JourneyMatch[]=[];
  let i=0,j=0;
  while(i<beforeSteps.length&&j<afterSteps.length){
    const candidate=candidates[i][j],weight=candidate?(candidate.confidence==='high'?highWeight:1):0;
    if(candidate&&scores[i][j]===weight+scores[i+1][j+1]){matches.push(candidate);i++;j++;}
    else if(scores[i+1][j]>=scores[i][j+1])i++;else j++;
  }
  const beforeIds=new Set(matches.map(match=>match.beforeId)),afterIds=new Set(matches.map(match=>match.afterId));
  const mediaDuration=(run:Row|null|undefined)=>[run?.originalDurationMs,run?.videoDurationMs,typeof run?.replayMetadata?.originalDuration==='number'?run.replayMetadata.originalDuration*1000:null].find(nonnegative)??null;
  return {version:'recorded-actions-v1',beforeSteps,afterSteps,beforeDurationMs:mediaDuration(beforeRun),afterDurationMs:mediaDuration(afterRun),matches,unmatchedBefore:beforeSteps.filter(step=>!beforeIds.has(step.id)),unmatchedAfter:afterSteps.filter(step=>!afterIds.has(step.id))};
}

export function applyJourneyReview(result:JourneyMatches,decisions:JourneyReviewDecision[]=[]){
  const before=new Map(result.beforeSteps.map(step=>[step.id,step])),after=new Map(result.afterSteps.map(step=>[step.id,step]));
  const matches:ReviewedJourneyMatch[]=result.matches.map(match=>({...match,status:match.confidence==='high'?'suggested':'review',source:'suggested'}));
  const conflicts:{decision:JourneyReviewDecision;index:number;reason:string}[]=[];
  const accepted:ReviewedJourneyMatch[]=[],decided=new Set<string>();
  const timed=(match:JourneyMatch)=>{
    const b=before.get(match.beforeId)?.ms,a=after.get(match.afterId)?.ms;
    return nonnegative(b)&&nonnegative(a)&&(result.beforeDurationMs===null||b<=result.beforeDurationMs)&&(result.afterDurationMs===null||a<=result.afterDurationMs);
  };
  const incompatible=(a:JourneyMatch,b:JourneyMatch)=>{
    const ab=before.get(a.beforeId)!,aa=after.get(a.afterId)!,bb=before.get(b.beforeId)!,ba=after.get(b.afterId)!;
    return ab.index===bb.index||aa.index===ba.index||(ab.index-bb.index)*(aa.index-ba.index)<=0||
      ((ab.ms!-bb.ms!)*(aa.ms!-ba.ms!)<=0)||(ab.index-bb.index)*(ab.ms!-bb.ms!)<=0||(aa.index-ba.index)*(aa.ms!-ba.ms!)<=0;
  };
  const upsert=(match:ReviewedJourneyMatch)=>{const index=matches.findIndex(item=>item.id===match.id);if(index>=0)matches[index]=match;else matches.push(match);};
  decisions.forEach((decision,index)=>{
    const fail=(reason:string)=>conflicts.push({decision,index,reason});
    if(!decision||!['accepted','rejected'].includes(decision.status)||!['suggested','manual'].includes(decision.source))return fail('Invalid review decision');
    const b=before.get(decision.beforeId),a=after.get(decision.afterId);
    if(!b||!a)return fail('The selected step no longer exists in this journey pair');
    const id=pairId(decision.beforeId,decision.afterId);
    if(decided.has(id))return fail('This pair has more than one review decision');
    const existing=matches.find(match=>match.id===id);
    if(decision.source==='suggested'&&!existing)return fail('This pair is not a recorded suggestion');
    const match:ReviewedJourneyMatch={id,beforeId:b.id,afterId:a.id,confidence:existing?.confidence||'review',
      reasons:existing?.reasons||['Paired manually during review'],status:decision.status,source:decision.source};
    if(decision.status==='accepted'){
      if(!timed(match))return fail('Both steps need valid timestamps within their original recordings');
      if(accepted.some(other=>incompatible(match,other)))return fail('Accepted matches must be one-to-one and follow both journeys in order, with distinct timestamps');
      accepted.push(match);
    }
    decided.add(id);upsert(match);
  });
  const activeMatches=[...accepted];
  for(const match of matches){
    if(match.status!=='suggested')continue;
    if(!timed(match)||activeMatches.some(other=>incompatible(match,other))){
      match.status='review';
      match.reasons=[...match.reasons,!timed(match)?'Original recording time is unavailable or outside the video':'A reviewed or earlier match takes precedence'];
    }else activeMatches.push(match);
  }
  activeMatches.sort((a,b)=>before.get(a.beforeId)!.index-before.get(b.beforeId)!.index);
  matches.sort((a,b)=>before.get(a.beforeId)!.index-before.get(b.beforeId)!.index||after.get(a.afterId)!.index-after.get(b.afterId)!.index);
  const usedBefore=new Set(activeMatches.map(match=>match.beforeId)),usedAfter=new Set(activeMatches.map(match=>match.afterId));
  return {matches,activeMatches,unmatchedBefore:result.beforeSteps.filter(step=>!usedBefore.has(step.id)),unmatchedAfter:result.afterSteps.filter(step=>!usedAfter.has(step.id)),conflicts};
}
