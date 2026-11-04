import {retainedFixture} from './retained-test-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync=promisify(execFile);
import { ExperienceRecorder, focusedSelect, selectVisibleOption, resolveVisibleControl, hitTarget, TargetNotResolved, focusedInputContext, redactActionInput } from './experience-recorder.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex');
test('navegador real grava ações, conserva o original e remove somente espera medida', {timeout:60000}, async()=>{
  const dir=retainedFixture('journey-recording-');
  const server=createServer((req,res)=>{res.setHeader('content-type','text/html');res.setHeader('content-security-policy',"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'");res.end(`<!doctype html><style>body{height:2500px;margin:0}button{position:absolute;left:90px;top:90px}input{position:absolute;top:150px;left:90px}</style><button>Click</button><input aria-label="test">`)});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  let browser,ctx;
  try {
    browser=await chromium.launch({headless:true,channel:process.env.JOURNEY_BROWSER_CHANNEL||'chrome'});
    const cspContext=await browser.newContext({viewport:{width:1280,height:800}});const visual=await ExperienceRecorder.install(cspContext);const cspPage=await cspContext.newPage();await cspPage.goto(url);await visual.draw(cspPage,{mark:true});
    const markerPng=join(dir,'marker.png');await cspPage.screenshot({path:markerPng,clip:{x:0,y:0,width:20,height:20}});
    const marker=(await execFileAsync(process.env.JOURNEY_FFMPEG||'ffmpeg',['-v','error','-i',markerPng,'-vf','format=rgb24,scale=2:1:flags=neighbor','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{encoding:'buffer'})).stdout;
    assert.ok(marker[0]>190&&marker[1]<65&&marker[2]>190&&marker[3]<65&&marker[4]>190&&marker[5]>190,'marcador visível na captura sob CSP');await cspContext.close();
    ctx=await browser.newContext({viewport:{width:1280,height:800},recordVideo:{dir,size:{width:1280,height:800}}});
    const rec=await ExperienceRecorder.install(ctx),page=await ctx.newPage();await page.goto(url);
    await page.evaluate(()=>document.querySelector('button').addEventListener('click',()=>document.body.dataset.clicks=String(Number(document.body.dataset.clicks||0)+1)));await rec.calibrate(page);assert.ok(rec.markerElapsedMs()>=500);
    rec.beginModelWait();await new Promise(r=>setTimeout(r,3000));rec.endModelWait();
    await rec.perform(page,{type:'click',x:105,y:100});assert.equal(await page.evaluate(()=>document.body.dataset.clicks),'1');
    await rec.perform(page,{type:'click',x:110,y:160});await rec.perform(page,{type:'type',text:'abc'});assert.equal(await page.locator('input').inputValue(),'abc');
    await rec.perform(page,{type:'scroll',x:300,y:400,scroll_x:0,scroll_y:300});assert.ok(await page.evaluate(()=>window.scrollY)>0);
    await page.goto(url);await page.evaluate(()=>document.querySelector('button').addEventListener('click',()=>document.body.dataset.clicks=String(Number(document.body.dataset.clicks||0)+1)));await rec.perform(page,{type:'click',x:105,y:100});assert.equal(await page.evaluate(()=>document.body.dataset.clicks),'1');assert.equal(await page.locator('#journey-lab-recording-overlay').getAttribute('aria-hidden'),'true');
    await page.waitForTimeout(600);const video=page.video(), original=join(dir,'original.webm'),replay=join(dir,'replay.webm');await ctx.close();ctx=null;await video.saveAs(original);
    const originalHash=hash(await readFile(original));
    const frames=(await execFileAsync(process.env.JOURNEY_FFMPEG||'ffmpeg',['-v','error','-i',original,'-vf','crop=64:64:75:70','-fps_mode','passthrough','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{encoding:'buffer',maxBuffer:15_000_000})).stdout;
    let halo=false;for(let i=0;i<frames.length;i+=3){if(frames[i]>180 && frames[i+1]<145 && frames[i+2]>60 && frames[i+2]<190){halo=true;break;}}assert.equal(halo,true,'halo do clique aparece nos quadros do vídeo');
    const result=await rec.compact(original,replay);
    assert.equal(result.status,'compacted',JSON.stringify(result));assert.equal(hash(await readFile(original)),originalHash);assert.ok((await readFile(replay)).length>0);assert.equal(result.segments.length,2);assert.equal(result.removedModelWaits.length,1);assert.ok(result.removedModelWaits[0].end-result.removedModelWaits[0].start>1);assert.ok(!JSON.stringify(result).includes('abc'));
    const noOverwrite=await rec.compact(original,replay);assert.equal(noOverwrite.status,'original');assert.equal(hash(await readFile(original)),originalHash);
    const bad=join(dir,'bad.webm');await writeFile(bad,'invalid');const fallback=await rec.compact(bad,join(dir,'fallback.webm'));assert.equal(fallback.status,'original');assert.equal((await readFile(bad)).toString(),'invalid');
  } finally {await ctx?.close();await browser?.close();await new Promise(r=>server.close(r));}
});

test('seletor nativo focado expõe opções permitidas e emite input/change sem clique falso', {timeout:15000}, async()=>{
  const browser=await chromium.launch({headless:true,channel:process.env.JOURNEY_BROWSER_CHANNEL||'chrome'});
  try {
    const context=await browser.newContext({viewport:{width:1280,height:800}});const rec=await ExperienceRecorder.install(context);const page=await context.newPage();
    await page.setContent(`<label for="age">Age range</label><select id="age"><option value="">Choose</option><option disabled>Disabled</option><option hidden>Hidden</option><option>6–8 years</option><option>Duplicate</option><option>Duplicate</option></select>`);
    await page.evaluate(()=>{window.events=[];const s=document.querySelector('#age');for(const type of ['input','change'])s.addEventListener(type,()=>window.events.push({type,value:s.value}));});
    assert.equal(await focusedSelect(page),null);const rect=await page.locator('#age').boundingBox();await rec.perform(page,{type:'click',x:rect.x+5,y:rect.y+5});
    assert.deepEqual(await focusedSelect(page),{label:'Age range',options:['Choose','6–8 years','Duplicate','Duplicate']});
    await assert.rejects(selectVisibleOption(page,'Disabled'));await assert.rejects(selectVisibleOption(page,'Hidden'));await assert.rejects(selectVisibleOption(page,'Duplicate'));
    const result=await selectVisibleOption(page,'6–8 years');assert.equal(result.method,'playwright-selectOption');assert.equal(await page.locator('#age').inputValue(),'6–8 years');
    assert.deepEqual(await page.evaluate(()=>window.events),[{type:'input',value:'6–8 years'},{type:'change',value:'6–8 years'}]);await context.close();
  } finally {await browser.close();}
});

test('grounding exige controle único, visível, desobstruído e confirma alvo antes do clique',{timeout:15000},async()=>{
  const browser=await chromium.launch({headless:true,channel:process.env.JOURNEY_BROWSER_CHANNEL||'chrome'});
  try{const context=await browser.newContext({viewport:{width:1280,height:800}}),rec=await ExperienceRecorder.install(context),page=await context.newPage();
    await page.setContent(`<style>body{height:2000px}.hidden{display:none}.off{position:absolute;top:1500px}.block{position:absolute;top:300px;left:20px}.cover{position:absolute;top:300px;left:20px;width:160px;height:60px;background:#aaa}</style><button id="visible" style="position:absolute;top:50px;left:20px">Try preview <span aria-hidden="true">→</span></button><button class="hidden">Hidden</button><button disabled>Disabled</button><button class="off">Offscreen</button><button>Duplicate</button><button>Duplicate</button><button class="block">Blocked</button><div class="cover"></div>`);
    await page.evaluate(()=>{window.clicked=0;document.querySelector('#visible').addEventListener('click',()=>window.clicked++)});
    for(const label of ['Hidden','Disabled','Offscreen','Duplicate','Blocked'])await assert.rejects(resolveVisibleControl(page,label));
    const control=await resolveVisibleControl(page,'Try preview');assert.equal(control.tag,'button');const bounds=await page.locator('#visible').boundingBox();assert.deepEqual(await hitTarget(page,control.x,control.y),{label:'Try preview',tag:'button',bounds});
    await assert.rejects(rec.perform(page,{type:'click',x:control.x,y:control.y},{expectedLabel:'Disabled'}));assert.equal(await page.evaluate(()=>window.clicked),0);
    const result=await rec.perform(page,{type:'click',x:control.x,y:control.y},{expectedLabel:control.label});assert.deepEqual(result.target,{label:'Try preview',tag:'button',bounds});assert.equal(await page.evaluate(()=>window.clicked),1);await context.close();
  }finally{await browser.close();}
});

test('aliases visíveis de controle mantêm nome canônico e falhas recuperáveis',{timeout:15000},async()=>{
  const browser=await chromium.launch({headless:true,channel:process.env.JOURNEY_BROWSER_CHANNEL||'chrome'});
  try{const context=await browser.newContext({viewport:{width:1280,height:800}}),rec=await ExperienceRecorder.install(context),page=await context.newPage();
    await page.setContent(`<label for="age">Age range</label><select id="age"><option value="">Choose an age range</option><option>6–8 years</option></select><label for="field">Search</label><input id="field" placeholder="Find something"><label for="secret">Password</label><input id="secret" type="password" placeholder="Secret placeholder" value="never use this">`);
    const named=await resolveVisibleControl(page,'Age range'),alias=await resolveVisibleControl(page,'Choose an age range');assert.equal(named.x,alias.x);assert.equal(named.y,alias.y);assert.equal(alias.label,'Age range');assert.equal(alias.requestedLabel,'Choose an age range');
    const hit=await rec.perform(page,{type:'click',x:alias.x,y:alias.y},{expectedLabel:alias.requestedLabel});assert.equal(hit.target.label,'Age range');await selectVisibleOption(page,'6–8 years');
    await assert.rejects(resolveVisibleControl(page,'Choose an age range'),e=>e instanceof TargetNotResolved&&e.recoverable===true);
    const field=await resolveVisibleControl(page,'Find something');assert.equal(field.label,'Search');await page.locator('#field').fill('private input');await assert.rejects(resolveVisibleControl(page,'Find something'),TargetNotResolved);await assert.rejects(resolveVisibleControl(page,'private input'),TargetNotResolved);
    await assert.rejects(resolveVisibleControl(page,'Secret placeholder'),TargetNotResolved);await assert.rejects(resolveVisibleControl(page,'never use this'),TargetNotResolved);
    await context.close();
  }finally{await browser.close();}
});

test('empty textarea placeholder resolves to its canonical label, without accepting populated content or unavailable controls',{timeout:15000},async()=>{
  const browser=await chromium.launch({headless:true,channel:process.env.JOURNEY_BROWSER_CHANNEL||'chrome'});
  try{
    const context=await browser.newContext({viewport:{width:1280,height:800}}),rec=await ExperienceRecorder.install(context),page=await context.newPage();
    await page.setContent(`<style>textarea{display:block;width:240px;height:40px;margin-bottom:8px}.offscreen{position:absolute;top:1600px}</style><label for="note">Project note</label><textarea id="note" aria-label="Note" placeholder="What would you like to remember?"></textarea><label for="labelled">Research notes</label><textarea id="labelled" placeholder="Add a research observation"></textarea><textarea disabled placeholder="Disabled note"></textarea><textarea style="display:none" placeholder="Hidden note"></textarea><textarea aria-disabled="true" placeholder="Unavailable note"></textarea><div inert><textarea placeholder="Inert note"></textarea></div><textarea class="offscreen" placeholder="Offscreen note"></textarea><textarea placeholder="Duplicate note"></textarea><textarea placeholder="Duplicate note"></textarea>`);
    const alias=await resolveVisibleControl(page,'What would you like to remember?'),canonical=await resolveVisibleControl(page,'Note');
    assert.equal(alias.label,'Note');assert.equal(alias.requestedLabel,'What would you like to remember?');assert.equal(alias.tag,'textarea');assert.equal(alias.x,canonical.x);assert.equal(alias.y,canonical.y);
    assert.equal((await resolveVisibleControl(page,'Add a research observation')).label,'Research notes');
    for(const label of ['Disabled note','Hidden note','Unavailable note','Inert note','Offscreen note','Duplicate note'])await assert.rejects(resolveVisibleControl(page,label),TargetNotResolved);
    const clicked=await rec.perform(page,{type:'click',x:alias.x,y:alias.y},{expectedLabel:alias.requestedLabel});assert.deepEqual(clicked.target,{label:'Note',tag:'textarea',bounds:await page.locator('#note').boundingBox()});
    const typed=await rec.perform(page,{type:'type',text:'Fictional garden note'});assert.equal(typed.inputContext.label,'Note');assert.equal(typed.inputContext.inputType,'textarea');assert.equal(await page.locator('#note').inputValue(),'Fictional garden note');
    await assert.rejects(resolveVisibleControl(page,'What would you like to remember?'),TargetNotResolved);await assert.rejects(resolveVisibleControl(page,'Fictional garden note'),TargetNotResolved);
    const populated=await resolveVisibleControl(page,'Note');assert.equal(populated.label,'Note');assert.equal(JSON.stringify(populated).includes('Fictional garden note'),false);
    await page.locator('#note').fill('');assert.equal((await resolveVisibleControl(page,'What would you like to remember?')).label,'Note');
    await context.close();
  }finally{await browser.close();}
});

test('named buttons ignore explicitly aria-hidden decoration while retaining exact meaningful text and ambiguity',{timeout:15000},async()=>{
  const browser=await chromium.launch({headless:true,channel:process.env.JOURNEY_BROWSER_CHANNEL||'chrome'});
  try{
    const context=await browser.newContext({viewport:{width:1280,height:800}}),rec=await ExperienceRecorder.install(context),page=await context.newPage();
    await page.setContent(`<button id="preparation">Save preparation plan <span aria-hidden="true">✓</span></button><button id="picks">Save my first picks <span aria-hidden="true">✓</span></button><button id="canonical" aria-label="Save draft">Save <strong>draft</strong><span aria-hidden="true">✦</span><span style="display:none">Hidden content</span></button><button>Meaningful ✓</button><button>Ambiguous <span aria-hidden="true">✓</span></button><button>Ambiguous <span aria-hidden="true">✦</span></button><button disabled>Disabled decorated <span aria-hidden="true">✓</span></button><button style="display:none">Hidden decorated <span aria-hidden="true">✓</span></button>`);
    await page.evaluate(()=>{window.clicked=[];for(const id of ['preparation','picks','canonical'])document.getElementById(id).addEventListener('click',()=>window.clicked.push(id));});
    for(const [id,label]of [['preparation','Save preparation plan'],['picks','Save my first picks'],['canonical','Save draft']]){
      const control=await resolveVisibleControl(page,label);assert.equal(control.label,label);assert.equal(control.requestedLabel,label);assert.deepEqual(await hitTarget(page,control.x,control.y),{label,tag:'button',bounds:await page.locator('#'+id).boundingBox()});
      const result=await rec.perform(page,{type:'click',x:control.x,y:control.y},{expectedLabel:label});assert.equal(result.target.label,label);assert.equal((await page.evaluate(()=>window.clicked)).at(-1),id);
    }
    for(const label of ['Save my first','Save preparation plan ✓','Meaningful','Ambiguous','Disabled decorated','Hidden decorated','Hidden content'])await assert.rejects(resolveVisibleControl(page,label),TargetNotResolved);
    assert.equal((await resolveVisibleControl(page,'Meaningful ✓')).label,'Meaningful ✓');
    assert.deepEqual(await page.evaluate(()=>window.clicked),['preparation','picks','canonical']);await context.close();
  }finally{await browser.close();}
});

test('keyboard activation checks focused destructive controls and implicit form submissions without blocking ordinary input',{timeout:15000},async()=>{
  const browser=await chromium.launch({headless:true,channel:process.env.JOURNEY_BROWSER_CHANNEL||'chrome'});
  try{
    const context=await browser.newContext({viewport:{width:1280,height:800}}),rec=await ExperienceRecorder.install(context),page=await context.newPage();
    await page.setContent(`<base href="https://fixture.example.test/"><button id="start">Start</button><button id="danger">Delete record</button><button id="safe">Next step</button><input id="text" aria-label="Notes"><textarea id="multiline"></textarea><form id="dangerForm" action="/records/delete" method="post"><input id="confirmText" aria-label="Record name"><button id="confirm" type="submit">Confirm</button></form><form id="safeForm" action="/drafts/save" method="post"><input id="draftText" aria-label="Draft title"><button type="submit">Save draft</button></form><form id="externalForm" action="/records" method="post"><input id="externalText" aria-label="Record reference"></form><button form="externalForm" id="externalDelete" type="submit">Delete record</button><form id="methodForm" action="/records/1" method="post"><input type="hidden" name="_method" value="DELETE"><input id="methodText" aria-label="Confirmation"><button type="submit">Confirm</button></form><iframe id="frame" srcdoc="<button id='frameDelete'>Delete record</button>"></iframe>`);
    await page.evaluate(()=>{window.counts={danger:0,safe:0,dangerForm:0,safeForm:0,externalForm:0,methodForm:0};document.querySelector('#danger').addEventListener('click',()=>window.counts.danger++);document.querySelector('#safe').addEventListener('click',()=>window.counts.safe++);for(const id of ['dangerForm','safeForm','externalForm','methodForm'])document.getElementById(id).addEventListener('submit',event=>{event.preventDefault();window.counts[id]++;});});
    const press=key=>rec.perform(page,{type:'keypress',keys:[key]},{disallowDestructive:true});
    await page.locator('#start').focus();await press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'danger');
    await assert.rejects(press('Enter'),/does not permit/);await assert.rejects(press('Space'),/does not permit/);assert.equal(await page.evaluate(()=>window.counts.danger),0);
    await page.locator('#safe').focus();await press('Enter');await press('Space');assert.equal(await page.evaluate(()=>window.counts.safe),2);
    await page.locator('#text').fill('Hello');await press('Space');assert.equal(await page.locator('#text').inputValue(),'Hello ');
    await page.locator('#multiline').fill('Line one');await press('Enter');assert.equal(await page.locator('#multiline').inputValue(),'Line one\n');
    for(const selector of ['#confirmText','#confirm','#externalText','#methodText']){await page.locator(selector).focus();await assert.rejects(press('Enter'),/does not permit/);}
    assert.deepEqual(await page.evaluate(()=>({dangerForm:window.counts.dangerForm,externalForm:window.counts.externalForm,methodForm:window.counts.methodForm})),{dangerForm:0,externalForm:0,methodForm:0});
    await page.locator('#draftText').fill('A harmless draft');await press('Enter');assert.equal(await page.evaluate(()=>window.counts.safeForm),1);
    const frame=page.frames().find(item=>item.parentFrame());await frame.locator('#frameDelete').focus();await assert.rejects(press('Enter'),/does not permit/);
    await context.close();
  }finally{await browser.close();}
});

test('typing records the focused field before input without reading existing values or inventing labels',{timeout:15000},async()=>{
  const browser=await chromium.launch({headless:true,channel:process.env.JOURNEY_BROWSER_CHANNEL||'chrome'});
  try{
    const context=await browser.newContext({viewport:{width:1280,height:800}}),rec=await ExperienceRecorder.install(context),page=await context.newPage();
    await page.setContent(`<label for="title">Activity title</label><input id="title" value="previous-field-content"><span id="notes-label">Notes</span><textarea id="notes" aria-labelledby="notes-label">previous-notes-content</textarea><input id="unlabelled" placeholder="Not a captured label"><button id="button">Continue</button><div id="rich-label"><span>Entry title</span><div id="rich" contenteditable="true" aria-labelledby="rich-label">previous-editable-content</div><textarea>previous-nested-notes</textarea></div><textarea id="self-labelled" aria-labelledby="self-labelled">previous-self-labelled-content</textarea>`);
    await page.evaluate(()=>{window.valueReads=0;for(const prototype of [HTMLInputElement.prototype,HTMLTextAreaElement.prototype]){const descriptor=Object.getOwnPropertyDescriptor(prototype,'value');Object.defineProperty(prototype,'value',{...descriptor,get(){window.valueReads++;return descriptor.get.call(this);}});}document.querySelector('#title').addEventListener('input',event=>event.target.setAttribute('aria-label','Changed after typing'));});
    await page.locator('#title').focus();
    const result=await rec.perform(page,{type:'type',text:'abc'});
    assert.deepEqual(result.inputContext,{label:'Activity title',tag:'input',inputType:'text',sensitive:false,visible:true});
    await page.locator('#notes').focus();assert.equal((await focusedInputContext(page)).label,'Notes');
    await page.locator('#unlabelled').focus();assert.equal((await focusedInputContext(page)).label,null);
    await page.locator('#rich').focus();assert.equal((await focusedInputContext(page)).label,'Entry title');
    await page.locator('#self-labelled').focus();assert.equal((await focusedInputContext(page)).label,null);
    await page.locator('#button').focus();assert.equal(await focusedInputContext(page),null);
    assert.equal(await page.evaluate(()=>window.valueReads),0,'metadata never reads input or textarea value');
    assert.equal(JSON.stringify(result).includes('previous-field-content'),false);
    assert.match(await page.locator('#title').inputValue(),/abc/);
    await context.close();
  }finally{await browser.close();}
});

test('focused input metadata follows iframe and open shadow focus and identifies private fields',{timeout:15000},async()=>{
  const browser=await chromium.launch({headless:true,channel:process.env.JOURNEY_BROWSER_CHANNEL||'chrome'});
  try{
    const context=await browser.newContext({viewport:{width:1280,height:800}}),rec=await ExperienceRecorder.install(context),page=await context.newPage();
    await page.setContent(`<input id="password" type="password" aria-label="Account access"><input id="otp" autocomplete="one-time-code" aria-label="Verification"><input id="card" autocomplete="cc-number" aria-label="Payment"><input id="private" data-private aria-label="Member notes"><div class="restricted"><textarea id="configured" aria-label="Internal notes"></textarea></div><div id="shadow"></div><iframe id="frame" srcdoc="<label for='inner'>Frame title</label><input id='inner'>"></iframe>`);
    for(const selector of ['#password','#otp','#card','#private','#configured']){
      await page.locator(selector).focus();const info=await focusedInputContext(page,['.restricted']);assert.equal(info.sensitive,true,selector);
      const source={type:'type',text:'abc'},stored=redactActionInput(source,info);
      assert.equal(stored.text,'[REDACTED]');assert.equal(source.text,'abc','redaction leaves the actual action unchanged');
    }
    await page.locator('#configured').focus();const result=await rec.perform(page,{type:'type',text:'abc'},{redactSelectors:['.restricted']});
    assert.equal(result.inputContext.sensitive,true);assert.equal(await page.locator('#configured').inputValue(),'abc');
    const frame=page.frames().find(item=>item.parentFrame());await frame.locator('#inner').focus();assert.deepEqual(await focusedInputContext(page),{label:'Frame title',tag:'input',inputType:'text',sensitive:false,visible:true});
    await page.evaluate(()=>{const shadow=document.querySelector('#shadow').attachShadow({mode:'open'});shadow.innerHTML='<label for="inner">Shadow title</label><input id="inner">';shadow.querySelector('input').focus();});
    assert.equal((await focusedInputContext(page)).label,'Shadow title');
    await page.locator('#shadow').evaluate(host=>host.setAttribute('data-private',''));assert.equal((await focusedInputContext(page)).sensitive,true);
    assert.equal(redactActionInput({type:'type',text:'ordinary test input'},{sensitive:false}).text,'ordinary test input');
    assert.equal(redactActionInput({type:'type',text:'known-secret-canary'},{sensitive:false},['known-secret-canary']).text,'[REDACTED]');
    await context.close();
  }finally{await browser.close();}
});
