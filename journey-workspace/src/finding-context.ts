import type {Row} from './lib.ts';
import {list,safeMedia} from './lib.ts';

const privateKey=/password|passwd|secret|authorization|cookie|token|api.?key|credential|session|email|phone|address|birth|card.?number|ssn/i;
const privateField=/password|passwd|secret|token|api.?key|credential|one.time.code|credit.card|card.number|email|phone|address|birth|ssn/i;
const finite=(value:any):value is number=>typeof value==='number'&&Number.isFinite(value);
const has=(value:any,key:string)=>value!=null&&Object.prototype.hasOwnProperty.call(value,key);
const text=(value:any)=>typeof value==='string'?value:'';

function redactText(value:string) {
  return value.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,'Bearer [REDACTED]')
    .replace(/(["']?(?:password|secret|token|api[_-]?key|authorization|cookie)["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;}]+)/gi,'$1[REDACTED]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[EMAIL]');
}

export function displayUrl(value:any):string {
  if(typeof value!=='string'||!value)return '';
  try {
    const relative=value.startsWith('/'),url=new URL(value,relative?'https://relative.invalid':undefined);
    if(!['http:','https:'].includes(url.protocol))return '[URL unavailable]';
    url.username='';url.password='';url.hash='';
    for(const key of [...url.searchParams.keys()])url.searchParams.set(key,'[REDACTED]');
    return (relative?url.pathname+url.search:url.href).slice(0,2400);
  } catch { return redactText(value).slice(0,2400); }
}

export function safeRecord(value:any,depth=0):any {
  if(depth>8)return '[DEPTH LIMIT]';
  if(Array.isArray(value))return value.slice(0,1000).map(v=>safeRecord(v,depth+1));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,1000).map(([key,v])=>[key,privateKey.test(key)?'[REDACTED]':/^(?:url|fromUrl|toUrl|screenUrl|targetUrl)$/i.test(key)?displayUrl(v):safeRecord(v,depth+1)]));
  if(typeof value==='string')return redactText(value).replace(/https?:\/\/[^\s"<>]+/g,match=>displayUrl(match)).slice(0,16000);
  return value;
}

export function safeDisplay(value:any,limit=16000):string {
  const clean=safeRecord(value);
  const result=typeof clean==='string'?clean:clean===undefined?'':JSON.stringify(clean,null,2);
  return result.length>limit?result.slice(0,limit)+'…':result;
}

function evidenceIndices(finding:Row):number[] {
  return [...new Set([finding.eventIndex,...(Array.isArray(finding.evidence_indices)?finding.evidence_indices:[]),...list(finding.evidence).map(e=>e.index)].filter(finite))];
}
function anchorFor(run:Row,finding:Row) {
  const events=list(run.events),refs=evidenceIndices(finding);
  const primary=refs.find(index=>events.some(e=>e.index===index));
  const event=primary==null?undefined:events.find(e=>e.index===primary);
  const ms=finite(finding.originalMs)?finding.originalMs:finite(finding.videoMs)?finding.videoMs:finite(event?.videoMs)?event.videoMs:null;
  return {eventIndex:event?.index??null,ms,url:displayUrl(event?.url||finding.screenUrl),position:event?events.indexOf(event):-1};
}
function isAction(event:Row){return event.type==='action'||event.type==='action_rejected';}
function lastIndexWhere(events:Row[],predicate:(event:Row)=>boolean){for(let index=events.length-1;index>=0;index--)if(predicate(events[index]))return index;return -1;}
function routeName(url:string) {
  try { const u=new URL(url);return u.pathname==='/'?'the home page':u.pathname.split('/').filter(Boolean).at(-1)||'the page'; }
  catch { return 'the page'; }
}
function fieldContext(event:Row):{label:string|null,kind:string,source:string|null,sensitive?:boolean} {
  const context=event.actionContext||event.context||{};
  const target=event.inputContext||context.focusedField||context.target||context.before?.target||event.input||{};
  const name=target.label||target.fieldLabel||target.accessibleName||event.action?.fieldLabel;
  return {label:typeof name==='string'&&name.trim()?safeDisplay(name,180):null,kind:text(target.inputType||target.type),source:name?'Recorded field context':null,sensitive:target.sensitive===true};
}
function safeEvent(event:Row) {
  const copy=safeRecord(event),field=fieldContext(event);
  if(copy.action&&has(copy.action,'text')&&(field.sensitive||privateField.test(`${field.label||''} ${field.kind}`)))copy.action.text='[REDACTED]';
  return copy;
}

export function buildFindingPath(run:Row,finding:Row,{throughEvidence=false}:{throughEvidence?:boolean}={}) {
  const events=list(run.events),anchor=anchorFor(run,finding),refs=evidenceIndices(finding);
  const refPositions=refs.map(index=>events.findIndex(e=>e.index===index)).filter(pos=>pos>=0);
  let cutoff=anchor.position;
  if(throughEvidence&&refPositions.length)cutoff=Math.max(...refPositions);
  if(cutoff<0&&anchor.ms!=null){const timestamp=anchor.ms;cutoff=events.reduce((last,e,pos)=>finite(e.videoMs)&&e.videoMs<=timestamp?pos:last,-1);}
  const anchorKnown=cutoff>=0;
  // With only a timestamp anchor, an untimed event cannot safely be placed before it.
  const bounded=anchorKnown?events.slice(0,cutoff+1).filter(e=>anchor.position>=0||(finite(e.videoMs)&&e.videoMs<=anchor.ms!)):[];
  const firstShot=bounded.find(e=>e.type==='screenshot'&&safeMedia(e.screenshot));
  const steps:Row[]=[];
  const startUrl=displayUrl(firstShot?.url||run.target||run.environmentSnapshot?.url);
  let lastUrl=startUrl,lastActionPosition=-1,lastFocus:{label:string|null,kind:string,source:string|null,sensitive?:boolean}|null=null;
  if(firstShot)steps.push({id:`landing-${firstShot.index}`,eventIndex:firstShot.index,ms:finite(firstShot.videoMs)?firstShot.videoMs:null,kind:'landing',title:`Started on ${routeName(startUrl)}`,fromUrl:null,toUrl:startUrl,field:null,value:null,observation:null,reaction:null,screenshot:safeMedia(firstShot.screenshot),attempted:false});
  for(let pos=0;pos<bounded.length;pos++) {
    const event=bounded[pos];if(!isAction(event))continue;
    const action=event.action||{},kind=action.type||'unknown',rejected=event.type==='action_rejected';
    const before=bounded.slice(0,pos).filter(e=>e.type==='screenshot').at(-1);
    const nextAction=bounded.findIndex((e,index)=>index>pos&&isAction(e));
    const after=bounded.slice(pos+1,nextAction<0?bounded.length:nextAction).find(e=>e.type==='screenshot');
    const note=list(run.experience).find(n=>n.actionEventIndex===event.index);
    // An older screenshot must not overwrite a later action's recorded route.
    const beforePosition=before?bounded.indexOf(before):-1;
    const fromUrl=(beforePosition>lastActionPosition?displayUrl(before?.url):'')||lastUrl||displayUrl(before?.url);
    const toUrl=rejected?fromUrl:displayUrl(event.url||after?.url)||fromUrl;
    const target=event.click?.target||{};
    const actualLabel=safeDisplay(target.label||action.label||'',180);
    let stepKind='click',title='Interacted with the page',field:string|null=null,value:any=null,fieldSource:string|null=null,detail:string|null=null;
    if(kind==='type'||kind==='type_text') {
      const captured=fieldContext(event),focus=captured.label||captured.kind||captured.sensitive?captured:lastFocus;
      field=focus?.label||null;fieldSource=focus?.source||null;
      value=focus?.sensitive||privateField.test(`${field||''} ${focus?.kind||''}`)?'[REDACTED]':safeDisplay(action.text??action.value??'');
      stepKind='input';title=field?`Typed into ${field}`:'Typed into the focused field';
      detail=fieldSource==='Inferred from the preceding field focus'?'Field inferred from the preceding focus action. Entered text is recorded input, not a verified final field value.':field?'Entered text is recorded input; final field value was not independently captured.':'Field label was not captured. Entered text is recorded input, not a verified final field value.';
    } else if(kind==='select_option') {
      field=safeDisplay(event.accessibility?.selectorLabel||before?.accessibility?.focusedSelect?.label||'',180)||null;
      value=safeDisplay(event.accessibility?.optionLabel||action.label||'',500);
      fieldSource=field?'Recorded select label':null;stepKind='select';
      title=field?`Selected “${value}” in ${field}`:`Selected “${value}”`;
      if(!rejected)lastFocus={label:field,kind:'select',source:'Recorded select label'};
    } else if(kind==='keypress') {
      const keys=Array.isArray(action.keys)?action.keys:[action.key].filter(Boolean);
      stepKind='key';value=keys.map((key:any)=>safeDisplay(key,60)).join(' + ');title=`Pressed ${value||'a key'}`;
      if(!rejected&&keys.some((key:any)=>String(key).includes('Tab')))lastFocus=null;
    } else if(kind==='scroll') {
      stepKind='scroll';const y=Number(action.scroll_y)||0,x=Number(action.scroll_x)||0;
      title=y?`Scrolled ${y>0?'down':'up'}`:x?`Scrolled ${x>0?'right':'left'}`:'Scrolled the page';
      detail=[y?`${Math.abs(y)} px vertically`:null,x?`${Math.abs(x)} px horizontally`:null].filter(Boolean).join(' · ')||null;
    } else if(kind==='wait') {stepKind='wait';title='Waited for the page to settle';}
    else if(kind==='move') {stepKind='move';title='Moved the pointer';}
    else {
      const isField=['input','textarea','select'].includes(target.tag)||['textbox','combobox'].includes(target.role);
      stepKind=toUrl&&fromUrl&&toUrl!==fromUrl?'navigation':'click';
      title=actualLabel?`${isField?'Focused':kind==='double_click'?'Double-clicked':'Clicked'} “${actualLabel}”`:'Clicked a point on the page';
      if(!actualLabel&&finite(action.x)&&finite(action.y))detail=`Recorded coordinates: ${action.x}, ${action.y}. The control label was not captured.`;
      if(!rejected)lastFocus=isField&&actualLabel?{label:actualLabel,kind:text(target.inputType||target.type||target.tag),source:'Inferred from the preceding field focus'}:null;
    }
    if(rejected){stepKind='rejected';title=`Attempted: ${title}`;detail=safeDisplay(event.message||event.error||'The runner rejected this action; it was not executed.');}
    steps.push({id:`action-${event.index??pos}`,eventIndex:event.index??null,ms:finite(event.videoMs)?event.videoMs:null,kind:stepKind,title,fromUrl,toUrl,field,value,fieldSource,observation:note?.observation?safeDisplay(note.observation):null,reaction:note?.reaction?safeDisplay(note.reaction):null,screenshot:safeMedia(after?.screenshot)||safeMedia(before?.screenshot)||null,attempted:rejected,detail});
    if(!rejected&&toUrl!==fromUrl)lastFocus=null;
    lastUrl=rejected?fromUrl:toUrl||fromUrl;lastActionPosition=pos;
  }
  const limitations=[];
  if(!anchorKnown)limitations.push('The finding has no recorded event or usable timestamp anchor. Its navigation path cannot be reconstructed reliably.');
  else if(!firstShot)limitations.push('No initial screenshot was captured before this finding; the available actions are shown.');
  if(anchorKnown&&anchor.eventIndex==null)limitations.push('This path is bounded by the recorded timestamp; untimed events cannot be placed precisely.');
  return {steps,anchor:{eventIndex:anchor.eventIndex,ms:anchor.ms,url:anchor.url},startUrl,limited:limitations.length>0,limitation:limitations.join(' ')||null,throughEvidence,cutoffEventIndex:anchorKnown?events[cutoff]?.index??null:null};
}

export function technicalEvidence(run:Row,finding:Row,scope:'moment'|'run'='moment') {
  const events=list(run.events),anchor=anchorFor(run,finding),refs=new Set(evidenceIndices(finding));
  const shots=events.filter(e=>e.type==='screenshot'&&safeMedia(e.screenshot));
  let startPos=0,endPos=events.length-1,startMs:number|null=null,endMs:number|null=null,limited=false;
  if(scope==='moment') {
    if(anchor.position>=0) {
      const causalPos=isAction(events[anchor.position])?anchor.position:lastIndexWhere(events.slice(0,anchor.position),isAction);
      const prior=lastIndexWhere(events.slice(0,Math.max(0,causalPos)),e=>e.type==='screenshot');
      startPos=prior>=0?prior:Math.max(0,causalPos);
      const nextAction=events.findIndex((e,pos)=>pos>anchor.position&&isAction(e));
      endPos=nextAction>=0?nextAction-1:Math.min(events.length-1,anchor.position+8);
      startMs=finite(events[startPos]?.videoMs)?events[startPos].videoMs:null;
      const nextMs=nextAction>=0&&finite(events[nextAction].videoMs)?events[nextAction].videoMs:null;
      endMs=anchor.ms==null?nextMs:Math.min(anchor.ms+3000,nextMs??Infinity);
      limited=startMs==null||endMs==null;
    } else if(anchor.ms!=null) {startMs=Math.max(0,anchor.ms-3000);endMs=anchor.ms+3000;limited=true;}
    else {startPos=1;endPos=0;limited=true;}
  }
  const selected=events.filter((e,pos)=>{
    if(scope==='run')return true;
    if(refs.has(e.index)&&e.type==='screenshot')return true;
    if(anchor.position<0)return finite(e.videoMs)&&startMs!=null&&endMs!=null&&e.videoMs>=startMs&&e.videoMs<=endMs;
    if(pos<startPos||pos>endPos)return false;
    return !finite(e.videoMs)||((startMs==null||e.videoMs>=startMs)&&(endMs==null||e.videoMs<=endMs));
  });
  const network=selected.filter(e=>['network','network_error'].includes(e.type)).map(e=>({...safeEvent(e),linked:false,association:scope==='moment'?'Observed near this finding':'Recorded in this journey'}));
  const logTypes=new Set(['console','console_error','console_warning','page_error','network_error','error','report_error','action_rejected','safety_stop','budget_stop','integrity_error','video_error','context_limited','cancelled']);
  const logs=selected.filter(e=>logTypes.has(e.type)).map(e=>({...safeEvent(e),channel:e.type.startsWith('console')||e.type==='page_error'?'browser':e.type==='network_error'?'network':'runner',linked:false}));
  const payloads=selected.filter(e=>has(e,'requestBody')||has(e,'responseBody')||has(e,'payload')).map(e=>({...safeEvent(e),requestCaptured:has(e,'requestBody'),responseCaptured:has(e,'responseBody'),payloadCaptured:has(e,'payload'),linked:false}));
  const captured=run.capturePolicy?.bodies;
  const bodyCapture:'on'|'off'|'unknown'=captured===true?'on':captured===false?'off':events.some(e=>has(e,'requestBody')||has(e,'responseBody')||has(e,'payload'))?'on':'unknown';
  return {screenshots:selected.filter(e=>shots.includes(e)).map(e=>({...safeEvent(e),linked:refs.has(e.index)})),logs,network,payloads,window:{startMs,endMs},bodyCapture,limited,scope,association:scope==='moment'?'Nearby events are temporal context, not proof of cause.':'All captured events in this journey.'};
}
