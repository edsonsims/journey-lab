import { spawn } from 'node:child_process';
import { tapBrowserPoint, scrollBrowserTouch } from './browser-device.mjs';
import { performance } from 'node:perf_hooks';
import { rm, stat, mkdtemp, copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { ActionRejected, validateBrowserAction } from './browser-tools.mjs';
import { redactText } from './workspace-execution.mjs';

export class TargetNotResolved extends ActionRejected {
  constructor(message) { super(message); this.name='TargetNotResolved'; this.recoverable=true; }
}

// A presentation layer only: the actual actions always go through Playwright.
function overlayInit() {
  const key = '__journeyLabOverlay';
  window[key] = () => {
    if (document.getElementById('journey-lab-recording-overlay')) return;
    if (!document.documentElement) return;
    const host = document.createElement('div'); host.id='journey-lab-recording-overlay'; host.setAttribute('aria-hidden','true');
    Object.assign(host.style, {position:'fixed',inset:'0',zIndex:'2147483647',pointerEvents:'none',contain:'strict'});
    const shadow=host.attachShadow({mode:'closed'});
    const style=document.createElement('style');
    style.textContent=`:host{pointer-events:none}.cursor{position:fixed;left:0;top:0;opacity:0;filter:drop-shadow(0 2px 3px #0008);will-change:transform}.cursor svg{display:block}.halo{position:fixed;width:24px;height:24px;border:3px solid #e95178;background:#ff7d9b55;border-radius:50%;transform:translate(-50%,-50%) scale(.5);opacity:0}.halo.active{animation:pulse .28s ease-out}@keyframes pulse{0%{opacity:.95;transform:translate(-50%,-50%) scale(.5)}100%{opacity:0;transform:translate(-50%,-50%) scale(2.5)}}.calibration{position:fixed;left:0;top:0;width:20px;height:20px;background:linear-gradient(to right,rgb(255,0,255) 50%,rgb(0,255,255) 50%);display:none}`;
    shadow.append(style);
    const cursor=document.createElement('div');cursor.className='cursor';cursor.innerHTML='<svg width="26" height="30" viewBox="0 0 26 30" aria-hidden="true"><path d="M3 2v22l6-5 4 8 4-2-4-8h8z" fill="#fff" stroke="#15131c" stroke-width="2" stroke-linejoin="round"/></svg>';shadow.append(cursor);
    const halo=document.createElement('div');halo.className='halo';shadow.append(halo);
    const calibration=document.createElement('div');calibration.className='calibration';shadow.append(calibration);
    document.documentElement.append(host);
    window.__journeyLabDraw = ({x,y,click,mark,clearMark}) => {
      if(Number.isFinite(x)&&Number.isFinite(y)){cursor.style.opacity='1';cursor.style.transform=`translate(${x}px,${y}px)`;}
      if(click){halo.style.left=`${x}px`;halo.style.top=`${y}px`;halo.classList.remove('active');void halo.offsetWidth;halo.classList.add('active');}
      if(mark)calibration.style.display='block';if(clearMark)calibration.style.display='none';
    };
  };
  window[key]();
}

// Native select popups can be invisible to headless screenshots. This describes
// only the focused, visible select's accessible label and enabled choices.
async function selectDetails(page) {
  return page.evaluate(() => {
    const el=document.activeElement;
    if (!(el instanceof HTMLSelectElement) || el.matches(':disabled') || el.multiple) return null;
    const rect=el.getBoundingClientRect(), style=getComputedStyle(el);
    if (!rect.width || !rect.height || rect.bottom<=0 || rect.top>=innerHeight || rect.right<=0 || rect.left>=innerWidth || style.display==='none' || style.visibility!=='visible' || Number(style.opacity)===0) return null;
    const linked=el.getAttribute('aria-labelledby');
    const label=(el.getAttribute('aria-label') || (linked ? linked.split(/\s+/).map(id=>document.getElementById(id)?.innerText || '').join(' ') : '') || [...el.labels||[]].map(l=>l.innerText).join(' ') || '').trim().slice(0,200);
    const options=[...el.options].map((o,index)=>({o,index})).filter(({o})=>!o.disabled && !o.hidden && !o.closest('optgroup[disabled]') && getComputedStyle(o).display!=='none' && getComputedStyle(o).visibility!=='hidden').map(({o,index})=>({label:o.label.trim(),index})).filter(o=>o.label);
    if(!label || !options.length || options.length>50 || options.some(o=>o.label.length>200))return null;
    return {label,options};
  });
}
export async function focusedSelect(page) {
  const details=await selectDetails(page);return details ? {label:details.label,options:details.options.map(o=>o.label)} : null;
}
export async function selectVisibleOption(page,label) {
  if(typeof label!=='string' || !label.trim() || label.length>200) throw new Error('Rótulo de opção inválido.');
  const info=await selectDetails(page);
  const options=info?.options.filter(x=>x.label===label) || [];
  if(options.length!==1)throw new Error('A opção não corresponde a uma opção habilitada única do seletor visível em foco.');
  await page.locator('select:focus').selectOption({index:options[0].index});
  return {method:'playwright-selectOption',selectorLabel:info.label,optionLabel:label};
}


// Only resolve labels explicitly supplied from the screenshot; never enumerate controls to the model.
function inspectControl({mode,label,x,y}) {
  const normalize=s=>String(s||'').replace(/[←→↑↓↗↘↖↙➜➝]/gu,' ').replace(/\s+/g,' ').trim();
  const selector='a[href],button,input:not([type="hidden"]),select,textarea,[role="button"],[role="link"]';
  const labels=e=>{
    const linked=e.getAttribute('aria-labelledby');
    return [...new Set([normalize(e.getAttribute('aria-label')),normalize(linked ? linked.split(/\s+/).map(id=>document.getElementById(id)?.innerText||'').join(' ') : ''),normalize([...e.labels||[]].map(l=>l.innerText).join(' '))].filter(Boolean))];
  };
  const visibleName=e=>{
    if(!e.querySelector('[aria-hidden="true"]'))return e.innerText;
    const text=node=>{
      if(node.nodeType===Node.TEXT_NODE)return node.textContent||'';
      if(node.nodeType!==Node.ELEMENT_NODE||node.matches('[aria-hidden="true"],input,textarea,select,script,style')||node.isContentEditable)return '';
      const style=getComputedStyle(node);if(style.display==='none'||style.visibility!=='visible'||Number(style.opacity)===0)return '';
      if(node.tagName==='BR')return '\n';
      const value=[...node.childNodes].map(text).join('');
      return /^(block|flex|grid|table|list-item)/.test(style.display)?` ${value} `:value;
    };
    return text(e);
  };
  const names=e=>{
    const labelled=labels(e);let visible='';
    if(e instanceof HTMLSelectElement) visible=normalize(e.selectedOptions[0]?.label);
    else if(e instanceof HTMLInputElement && ['button','submit','reset'].includes(e.type))visible=normalize(e.value);
    else if((e instanceof HTMLInputElement && e.type!=='password' || e instanceof HTMLTextAreaElement) && e.value==='')visible=normalize(e.placeholder);
    else if(!e.matches('input,select,textarea'))visible=normalize(visibleName(e));
    return {canonical:labelled[0]||visible,aliases:[...new Set([...labelled,visible].filter(Boolean))]};
  };
  const available=e=>{
    const r=e.getBoundingClientRect(),s=getComputedStyle(e);
    return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility==='visible'&&Number(s.opacity)!==0&&!e.matches(':disabled')&&!e.closest('[aria-disabled="true"],[inert]');
  };
  if(mode==='hit'){
    const raw=document.elementFromPoint(x,y);if(!raw)return null;
    const e=raw.closest(selector)||raw;if(!available(e))return null;
    const rect=e.getBoundingClientRect(),left=Math.max(0,rect.left),top=Math.max(0,rect.top);
    return {label:(names(e).canonical||normalize(e.innerText)).slice(0,200),tag:e.tagName.toLowerCase(),bounds:{x:left,y:top,width:Math.max(0,Math.min(innerWidth,rect.right)-left),height:Math.max(0,Math.min(innerHeight,rect.bottom)-top)}};
  }
  const requested=normalize(label);if(!requested)return {error:'Rótulo vazio.'};
  const matches=[];
  for(const e of document.querySelectorAll(selector)){
    const namesForElement=names(e);if(!available(e)||!namesForElement.aliases.includes(requested))continue;
    const r=e.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
    if(cx<0||cy<0||cx>=innerWidth||cy>=innerHeight)continue;
    const hit=document.elementFromPoint(cx,cy);if(!hit||(hit!==e&&!e.contains(hit)))continue;
    matches.push({x:cx,y:cy,label:namesForElement.canonical,requestedLabel:requested,tag:e.tagName.toLowerCase()});
  }
  return matches.length===1 ? matches[0] : {error:matches.length?'Há mais de um controle visível com esse rótulo.':'Nenhum controle visível e acessível corresponde ao rótulo.'};
}
export async function resolveVisibleControl(page,label) {
  if(typeof label!=='string'||!label.trim()||label.length>200)throw new TargetNotResolved('Rótulo inválido.');
  const result=await page.evaluate(inspectControl,{mode:'resolve',label});if(result.error)throw new TargetNotResolved(result.error);return result;
}
export async function hitTarget(page,x,y) {
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0) return null;
  return page.evaluate(inspectControl,{mode:'hit',x,y});
}

// Inspect the field that will receive keyboard input. Never read its value or
// editable text; this metadata describes the control, not the user's contents.
function inspectFocusedInput({redactSelectors}) {
  if(!document.hasFocus())return {focused:false};
  let el=document.activeElement;while(el?.shadowRoot?.activeElement)el=el.shadowRoot.activeElement;
  if(!el)return {focused:true,inputContext:null};
  if(el instanceof HTMLIFrameElement)return {focused:true,framePending:true};
  if(!(el instanceof HTMLInputElement)&&!(el instanceof HTMLTextAreaElement)&&!el.isContentEditable)return {focused:true,inputContext:null};
  const normalize=value=>String(value||'').replace(/\s+/g,' ').trim().slice(0,200);
  const inputType=el instanceof HTMLInputElement?el.type:el instanceof HTMLTextAreaElement?'textarea':'contenteditable';
  const linked=el.getAttribute('aria-labelledby'),root=el.getRootNode();
  const labelText=node=>{
    if(!node||node===el)return '';
    if(node.nodeType===Node.ELEMENT_NODE&&(node.matches('input,textarea,select,script,style')||node.isContentEditable))return '';
    if(node.nodeType===Node.TEXT_NODE)return node.textContent||'';
    return [...node.childNodes].map(labelText).join(' ');
  };
  const label=normalize(el.getAttribute('aria-label')||(linked?linked.split(/\s+/).map(id=>labelText(root.getElementById?.(id))).join(' '):'')||[...el.labels||[]].map(labelText).join(' '));
  const autocomplete=el.getAttribute('autocomplete')||'';
  const privateField=/password|passwd|secret|token|api.?key|credential|one.time.code|credit.card|card.number|email|phone|address|birth|ssn/i;
  let sensitive=inputType==='password'||/one-time-code|(?:^|\s)cc-|(?:^|\s)(?:current|new)-password(?:\s|$)/i.test(autocomplete)||privateField.test(`${label} ${el.getAttribute('name')||''} ${inputType}`);
  // Respect private containers and configured selectors across open shadow roots.
  for(let node=el;node;node=node.getRootNode()?.host||null){
    if(node.closest('[data-private],[data-sensitive]'))sensitive=true;
    for(const selector of redactSelectors)try{if(node.matches(selector)||node.closest(selector))sensitive=true;}catch{}
  }
  const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
  const visible=rect.width>0&&rect.height>0&&rect.bottom>0&&rect.top<innerHeight&&rect.right>0&&rect.left<innerWidth&&style.display!=='none'&&style.visibility==='visible'&&Number(style.opacity)!==0;
  // Hidden focused controls can still receive programmatic input: keep the
  // privacy flag, but never claim that an unseen label was visible to a persona.
  return {focused:true,inputContext:{label:visible?(label||null):null,tag:el.tagName.toLowerCase(),inputType,sensitive:sensitive||!visible,visible}};
}
export async function focusedInputContext(page,redactSelectors=[]) {
  const selectors=Array.isArray(redactSelectors)?redactSelectors.filter(value=>typeof value==='string'&&value.length<=200):[];
  for(const frame of page.frames()){
    let state;try{state=await frame.evaluate(inspectFocusedInput,{redactSelectors:selectors});}catch{continue;}
    if(!state.focused||state.framePending)continue;
    return state.inputContext||null;
  }
  return null;
}
export function redactActionInput(action,inputContext,secrets=[]) {
  if(action?.type!=='type')return action;
  return {...action,text:inputContext?.sensitive?'[REDACTED]':redactText(action.text,secrets)};
}

const destructiveLabel=/\b(delete|erase|purge|destroy|pay now|buy now|confirm payment|send invitation|send email|close account)\b/i;
const destructivePath=/(?:^|\/)(?:delete|erase|purge|destroy|remove|pay|purchase|checkout|send[-_](?:email|invitation|message)|close[-_]account)(?:\/|$)/i;
function inspectKeyboardActivation({key}) {
  if(!document.hasFocus())return {focused:false,targets:[]};
  let el=document.activeElement;while(el?.shadowRoot?.activeElement)el=el.shadowRoot.activeElement;
  if(!el)return {focused:true,targets:[]};
  if(el instanceof HTMLIFrameElement)return {focused:true,framePending:true,targets:[]};
  const normalize=value=>String(value||'').replace(/\s+/g,' ').trim().slice(0,200);
  const label=control=>{
    const linked=control.getAttribute('aria-labelledby');
    return normalize(control.getAttribute('aria-label')||(linked?linked.split(/\s+/).map(id=>document.getElementById(id)?.textContent||'').join(' '):'')||[...control.labels||[]].map(node=>node.textContent).join(' ')||(control instanceof HTMLInputElement&&['button','submit','reset','image'].includes(control.type)?control.value:control.innerText));
  };
  const describe=control=>({label:label(control),tag:control.tagName.toLowerCase()});
  const submits=control=>(control instanceof HTMLButtonElement&&control.type==='submit')||(control instanceof HTMLInputElement&&['submit','image'].includes(control.type));
  const submitTarget=(form,submitter)=>{
    const action=submitter?.hasAttribute('formaction')?submitter.formAction:form.action;
    let actionPath='';try{actionPath=decodeURIComponent(new URL(action,document.baseURI).pathname);}catch{}
    const override=[...form.elements].find(control=>control instanceof HTMLInputElement&&control.type==='hidden'&&control.name==='_method')?.value||'';
    return {...describe(submitter||form),actionPath,methodOverride:normalize(override)};
  };
  if(el instanceof HTMLTextAreaElement||el.isContentEditable)return {focused:true,targets:[]};
  const enter=key==='Enter'||key==='Return',space=key==='Space'||key===' ';
  if(!enter&&!space)return {focused:true,targets:[]};
  const targets=[];
  if(el instanceof HTMLButtonElement||(el instanceof HTMLInputElement&&['button','submit','reset','image','checkbox','radio'].includes(el.type))||el.matches('a[href],[role="button"],[role="link"]')){
    targets.push(describe(el));if(el.form&&submits(el))targets.push(submitTarget(el.form,el));
  }else if(enter&&el instanceof HTMLInputElement&&el.form){
    // Enter on a form field activates the form's default submit button, including
    // controls associated through form="id" outside the form element.
    const submitter=[...el.form.elements].find(control=>submits(control)&&!control.matches(':disabled'));
    if(submitter)targets.push(describe(submitter));targets.push(submitTarget(el.form,submitter));
  }
  return {focused:true,targets};
}
async function guardKeyboardActivation(page,key) {
  if(!['Enter','Return','Space',' '].includes(key))return;
  let framePending=false,resolved=false;
  for(const frame of page.frames()){
    let state;try{state=await frame.evaluate(inspectKeyboardActivation,{key});}catch{continue;}
    if(!state.focused)continue;if(state.framePending){framePending=true;continue;}resolved=true;
    for(const target of state.targets||[])if(destructiveLabel.test(target.label||'')||destructivePath.test(target.actionPath||'')||/^DELETE$/i.test(target.methodOverride||''))throw new ActionRejected('This environment does not permit destructive actions, payments, or external messages.');
  }
  if(framePending&&!resolved)throw new ActionRejected('The focused frame could not be checked before keyboard activation.');
}

async function command(exe,args,{limit=30_000_000}={}) {
  return new Promise((resolve,reject)=>{
    const p=spawn(exe,args,{stdio:['ignore','pipe','pipe']});const out=[],err=[];let bytes=0;
    p.stdout.on('data',b=>{bytes+=b.length;if(bytes<=limit)out.push(b);else p.kill();});p.stderr.on('data',b=>{if(err.reduce((n,x)=>n+x.length,0)<50000)err.push(b)});
    p.on('error',reject);p.on('close',code=>code===0&&bytes<=limit?resolve(Buffer.concat(out)):reject(new Error(`Falha ao processar vídeo (${code}).`)));
  });
}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export class ExperienceRecorder {
  static async install(context, options={}) { await context.addInitScript(overlayInit);return new ExperienceRecorder(options); }
  constructor({ffmpeg=process.env.JOURNEY_FFMPEG||'ffmpeg',ffprobe=process.env.JOURNEY_FFPROBE||'ffprobe'}={}) {this.ffmpeg=ffmpeg;this.ffprobe=ffprobe;this.point={x:0,y:0};this.waits=[];this.pending=null;this.calibration=null;this.firstActionAt=null;}
  async draw(page,data) {await page.evaluate(data=>{window.__journeyLabOverlay?.();window.__journeyLabDraw?.(data)},data).catch(()=>{});}
  async calibrate(page) {
    // Let Chromium's asynchronous video capture start before the calibration marker.
    await page.screenshot();await pause(1000);
    // Bracket marker activation in the same monotonic clock used by model waits.
    const start=performance.now();await page.evaluate(()=>{window.__journeyLabOverlay?.();if(!window.__journeyLabDraw)throw new Error('Overlay de gravação indisponível.');window.__journeyLabDraw({mark:true});});const end=performance.now();
    this.calibration={at:(start+end)/2,uncertainty:(end-start)/2};
    await page.evaluate(async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
    await pause(800);await this.draw(page,{clearMark:true});this.calibration.endAt=performance.now();await pause(100);
  }
  markerElapsedMs() { return this.calibration ? performance.now() - this.calibration.at : null; }
  markAction() {if(this.firstActionAt===null)this.firstActionAt=performance.now();}
  beginModelWait() {if(this.pending!==null)throw new Error('Espera do modelo já iniciada.');this.pending=performance.now();}
  endModelWait() {if(this.pending===null)throw new Error('Espera do modelo não iniciada.');this.waits.push({start:this.pending,end:performance.now()});this.pending=null;}
  async move(page,x,y) {
    const from=this.point;const distance=Math.hypot(x-from.x,y-from.y);const steps=Math.max(1,Math.min(18,Math.ceil(distance/60)));
    for(let i=1;i<=steps;i++){const t=i/steps;const eased=t*t*(3-2*t);const px=from.x+(x-from.x)*eased,py=from.y+(y-from.y)*eased;await page.mouse.move(px,py);await this.draw(page,{x:px,y:py});if(steps>1)await pause(14);}
    this.point={x,y};
  }
  async perform(page,action,options={}) {
    validateBrowserAction(action,page.viewportSize() || undefined);this.markAction();const type=action.type;
    if(['click','double_click','move','scroll'].includes(type)){
      if(options.hasTouch){this.point={x:action.x,y:action.y};await this.draw(page,this.point);}
      else await this.move(page,action.x,action.y);
    }
    if(type==='click'||type==='double_click') {
      const target=await hitTarget(page,action.x,action.y);
      if(options.disallowDestructive && destructiveLabel.test(target?.label||''))throw new ActionRejected('This environment does not permit destructive actions, payments, or external messages.');
      if(options.expectedLabel!==undefined) {
        const expected=await resolveVisibleControl(page,options.expectedLabel);
        if(!target || target.label!==expected.label || Math.abs(expected.x-action.x)>1 || Math.abs(expected.y-action.y)>1) throw new TargetNotResolved('O controle mudou antes do clique; nenhuma ação foi executada.');
      }
      await this.draw(page,{x:action.x,y:action.y,click:true});
      if(options.hasTouch)await tapBrowserPoint(page,action,type==='double_click');
      else if(type==='click')await page.mouse.click(action.x,action.y);else await page.mouse.dblclick(action.x,action.y);
      return {target};
    }
    else if(type==='scroll') {if(options.hasTouch)await scrollBrowserTouch(page,action);else {const steps=5;for(let i=0;i<steps;i++){await page.mouse.wheel(action.scroll_x/steps,action.scroll_y/steps);await pause(30);}}}
    else if(type==='type') {const inputContext=await focusedInputContext(page,options.redactSelectors);for(const char of action.text){await page.keyboard.insertText(char);await pause(35);}return {inputContext};}
    else if(type==='keypress') {if(options.disallowDestructive)await guardKeyboardActivation(page,action.keys[0]);await page.keyboard.press(({Return:'Enter',Esc:'Escape',Space:' '})[action.keys[0]]||action.keys[0]);}
    else if(type==='wait')await pause(700);
  }
  async compact(original,replay) {
    const fallback=(reason)=>({status:'original',reason,original,originalPreserved:true});
    if(resolve(original)===resolve(replay) || !this.calibration || this.pending!==null) return fallback('A gravação não possui calibração completa.');
    try { await stat(replay); return fallback('O caminho do replay já existe.'); } catch(error) { if(error.code!=='ENOENT') return fallback('Não foi possível verificar o caminho do replay.'); }
    let tempDir;
    try {
      const info=JSON.parse((await command(this.ffprobe,['-v','error','-select_streams','v:0','-show_entries','format=duration:frame=best_effort_timestamp_time','-of','json',original])).toString());
      const duration=Number(info.format?.duration), times=(info.frames||[]).map(f=>Number(f.best_effort_timestamp_time));
      if(!Number.isFinite(duration)||duration<=0||!times.length||times.some(x=>!Number.isFinite(x)))throw new Error('Tempos do vídeo indisponíveis.');
      const pixels=await command(this.ffmpeg,['-v','error','-i',original,'-vf','crop=20:20:0:0,format=rgb24,scale=2:1:flags=neighbor','-fps_mode','passthrough','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);
      if(pixels.length!==times.length*6) throw new Error('Não foi possível alinhar os quadros.');
      let mark=-1;for(let i=0;i<times.length;i++){const j=i*6;if(pixels[j]>190&&pixels[j+1]<65&&pixels[j+2]>190&&pixels[j+3]<65&&pixels[j+4]>190&&pixels[j+5]>190){mark=i;break;}}
      if(mark<0) throw new Error('Marcador de calibração ausente nos quadros do vídeo.');
      if(this.calibration.uncertainty>100) throw new Error('Ativação do marcador imprecisa; sincronização não confiável.');
      const origin=this.calibration.at-times[mark]*1000;
      // Safety margin includes frame quantization and marker activation uncertainty.
      const margin=0.75+this.calibration.uncertainty/1000;
      const cuts=this.waits.map(w=>({start:Math.max(0,(w.start-origin)/1000+margin),end:Math.min(duration,(w.end-origin)/1000-margin)})).filter(c=>c.end-c.start>0.25).sort((a,b)=>a.start-b.start);
      const technicalEnd=Math.min(duration,(this.calibration.endAt-origin)/1000+0.05,this.firstActionAt===null?duration:(this.firstActionAt-origin)/1000-0.05);
      const technical=technicalEnd>0 ? [{start:0,end:technicalEnd}] : [];
      const allCuts=[...technical,...cuts].sort((a,b)=>a.start-b.start);
      if(!allCuts.length)return fallback('Nenhum trecho técnico ou espera longa de API para remover.');
      const merged=[];for(const c of allCuts){const p=merged.at(-1);if(p&&c.start<=p.end)p.end=Math.max(p.end,c.end);else merged.push({...c});}
      let pos=0,replayTime=0;const segments=[];for(const c of merged){if(c.start>pos){segments.push({originalStart:pos,originalEnd:c.start,replayStart:replayTime});replayTime+=c.start-pos;}pos=c.end;}if(pos<duration){segments.push({originalStart:pos,originalEnd:duration,replayStart:replayTime});}
      if(!segments.length)throw new Error('Não há segmentos para preservar.');
      const filters=segments.map((s,i)=>`[0:v]trim=start=${s.originalStart.toFixed(6)}:end=${s.originalEnd.toFixed(6)},setpts=PTS-STARTPTS[v${i}]`).join(';')+';'+segments.map((_,i)=>`[v${i}]`).join('')+`concat=n=${segments.length}:v=1:a=0[out]`;
      tempDir=await mkdtemp(join(dirname(replay),'.replay-')); const tempReplay=join(tempDir,'replay.webm');
      await command(this.ffmpeg,['-v','error','-n','-i',original,'-filter_complex',filters,'-map','[out]','-c:v','libvpx-vp9','-deadline','realtime','-cpu-used','6','-an',tempReplay]);
      if((await stat(tempReplay)).size===0) throw new Error('Replay vazio.');
      await copyFile(tempReplay,replay,constants.COPYFILE_EXCL);
      return {status:'compacted',original,replay,originalPreserved:true,calibration:{method:'marcador visível e timestamps dos quadros',frameTime:times[mark],uncertaintyMs:this.calibration.uncertainty + (mark > 0 ? (times[mark]-times[mark-1])*1000 : 40)},removedModelWaits:cuts,removedTechnicalPreroll:technical,segments,originalDuration:duration};
    } catch(error) {return fallback(String(error.message||error).slice(0,250));} finally {if(tempDir) await rm(tempDir,{recursive:true,force:true}).catch(()=>{});}
  }
}

// Times are seconds, except markerElapsedMs. A removed moment maps to null.
export function mapMarkerToOriginal(markerElapsedMs, recording) {
  if (!Number.isFinite(markerElapsedMs) || recording?.status!=='compacted' || !Number.isFinite(recording.calibration?.frameTime)) return null;
  return markerElapsedMs / 1000 + recording.calibration.frameTime;
}
export function mapOriginalToReplay(originalSeconds, recording) {
  if (!Number.isFinite(originalSeconds) || recording?.status!=='compacted') return null;
  const s=recording.segments.find(x=>originalSeconds>=x.originalStart && originalSeconds<x.originalEnd);
  return s ? s.replayStart+originalSeconds-s.originalStart : null;
}
