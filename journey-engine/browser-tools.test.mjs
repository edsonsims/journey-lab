import {test} from 'node:test';
import assert from 'node:assert/strict';
import {browserTools,parseBrowserCall,buildFunctionTurn,parseExperienceNote} from './browser-tools.mjs';
const call = (name, args) => ({type:'function_call',name,call_id:'call_abc',arguments:JSON.stringify(args)});
test('meaningful feedback captures a public takeaway and its reason without changing the browser action',()=>{
  for(const kind of ['benefit','friction','uncertainty','unmet_need']){
    const feedback={kind,summary:'  The full price is shown before selection.  ',why:'  I can compare it against my budget before entering details.  '};
    const request=call('browser_click_control',{label:'Continue',screen_observation:'The price breakdown is visible.',persona_note:'That fits my budget.',experience_feedback:feedback});
    assert.deepEqual(parseBrowserCall(request),{type:'click_control',label:'Continue'});
    assert.deepEqual(parseExperienceNote(request),{observation:'The price breakdown is visible.',reaction:'That fits my budget.',feedback:{kind,summary:feedback.summary.trim(),why:feedback.why.trim()}});
  }
  for(const tool of browserTools.filter(tool=>tool.name.startsWith('browser_'))){
    assert.deepEqual(tool.parameters.properties.experience_feedback.properties.kind.enum,['benefit','friction','uncertainty','unmet_need','routine']);
    assert.equal(tool.parameters.required.includes('experience_feedback'),false);
  }
});
test('routine narration stays recorded without a fabricated experience takeaway',()=>{
  const request=call('browser_type',{text:'Quarterly planning',persona_note:'I will type the meeting name.',valence:'positive',experience_feedback:{kind:'routine',summary:'Routine title',why:'Routine text'}});
  assert.deepEqual(parseBrowserCall(request),{type:'type',text:'Quarterly planning'});
  const result=parseExperienceNote(request);
  assert.equal(result.reaction,'I will type the meeting name.');assert.equal(result.valence,'positive');
  assert.deepEqual(result.feedback,{kind:'routine',summary:'',why:''});
});
test('invalid optional feedback cannot invent a takeaway or drop the original persona comment',()=>{
  for(const feedback of [null,[],{kind:'positive',summary:'Good',why:'Useful'},{kind:'benefit',summary:'',why:'Useful'},{kind:'friction',summary:'Missing label',why:' '},{kind:'benefit',summary:'a'.repeat(241),why:'Useful'},{kind:'benefit',summary:'Clear total',why:'a'.repeat(601)},{kind:'benefit',summary:'Clear total',why:'Useful',extra:'unsupported'},{kind:'routine'}]){
    const request=call('browser_keypress',{key:'Tab',persona_note:'A recorded reaction.',experience_feedback:feedback});
    assert.deepEqual(parseBrowserCall(request),{type:'keypress',keys:['Tab']});
    assert.deepEqual(parseExperienceNote(request),{observation:null,reaction:'A recorded reaction.'});
  }
  assert.deepEqual(parseExperienceNote(call('browser_wait',{persona_note:'Waiting for the page.'})),{observation:null,reaction:'Waiting for the page.'});
});
test('five-level experience tone survives the public annotation boundary without deriving intensity',()=>{
  for(const valence of ['very_positive','positive','neutral','negative','very_negative']){
    const note=call('browser_keypress',{key:'Tab',persona_note:'A visible moment.',valence,confidence:'high',friction:0});
    assert.equal(parseExperienceNote(note).valence,valence);
    assert(browserTools.find(t=>t.name==='browser_keypress').parameters.properties.valence.enum.includes(valence));
  }
  assert.equal(parseExperienceNote(call('browser_keypress',{key:'Tab',persona_note:'A visible moment.',confidence:'high',friction:0})).valence,undefined);
});
test('function schema maps one model action to local browser operation', () => {
  assert(browserTools.every(t => t.type === 'function'));
  assert.deepEqual(parseBrowserCall(call('browser_click',{x:400,y:200})),{type:'click',x:512,y:160});
  assert.deepEqual(parseBrowserCall(call('browser_keypress',{key:'Tab'})),{type:'keypress',keys:['Tab']});
  assert.deepEqual(parseBrowserCall(call('browser_scroll',{x:1,y:2,scroll_x:0,scroll_y:400})),{type:'scroll',x:1,y:2,scroll_x:0,scroll_y:400});
});
test('function tool rejects unknown commands, invalid arguments and extra properties', () => {
  assert.throws(() => parseBrowserCall(call('shell',{text:'echo x'})));
  assert.throws(() => parseBrowserCall(call('browser_click',{x:2,y:3,button:'right'})));
  assert.throws(() => parseBrowserCall({type:'function_call',call_id:'a',name:'browser_click',arguments:'{'}));
});
test('function result sends linked output, fresh screenshot and instructions to Meta', () => {
  const turn=buildFunctionTurn('muse-wonder-1.0','resp_1','call_abc','data:image/png;base64,AAAA','safety rules');
  assert.equal(turn.previous_response_id,'resp_1'); assert.equal(turn.parallel_tool_calls,false); assert.equal(turn.instructions,'safety rules');
  assert.equal(turn.input[0].call_id,'call_abc'); assert.equal(turn.input[0].type,'function_call_output');
  assert.equal(turn.input[1].content[1].image_url,'data:image/png;base64,AAAA');
  assert.throws(()=>buildFunctionTurn('x','r','c','not-an-image','rules'));
});
test('mock tool cycle links a driver result to its call and fresh screenshot', async () => {
  const modelReply = {id:'resp_mock',output:[call('browser_click',{x:400,y:200})]};
  const modelCall = modelReply.output[0];
  const driverEvents = [];
  const driver = {act: async action => driverEvents.push(action), screenshot: async () => 'data:image/png;base64,Q1VSUkVOVA=='};
  await driver.act(parseBrowserCall(modelCall));
  const request = buildFunctionTurn('muse-wonder-1.0',modelReply.id,modelCall.call_id,await driver.screenshot(),'only local');
  assert.deepEqual(driverEvents,[{type:'click',x:512,y:160}]);
  assert.equal(request.input[0].call_id,'call_abc');
  assert.equal(request.input[1].content[1].image_url,'data:image/png;base64,Q1VSUkVOVA==');
});

test('security guard rejects disallowed email, passwords and out of bounds actions', async () => {
  const {ActionRejected,validateBrowserAction} = await import('./browser-tools.mjs');
  assert.throws(() => validateBrowserAction({type:'type',text:'person@example.com'}),ActionRejected);
  assert.throws(() => validateBrowserAction({type:'type',text:'my password'}),ActionRejected);
  assert.throws(() => validateBrowserAction({type:'click',x:1280,y:2}),ActionRejected);
  assert.doesNotThrow(() => validateBrowserAction({type:'click',x:100,y:200}));
});
test('stop report returns refusal and screenshot with no tools and preserves safety context', async () => {
  const {buildStopReportTurn,usableStopReport} = await import('./browser-tools.mjs');
  const req=buildStopReportTurn('muse-wonder-1.0','resp_1','call_1','data:image/png;base64,AAAA','safety rules','Ação recusada; nenhum dado inserido.');
  assert.equal(req.tools,undefined); assert.equal(req.input[0].call_id,'call_1');
  assert.match(req.input[0].output,/recusada/); assert.match(req.instructions,/safety rules/);
  assert.equal(req.input[1].content[1].image_url,'data:image/png;base64,AAAA');
  assert.equal(usableStopReport({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'Relato de teste'}]}]}),'Relato de teste');
  assert.equal(usableStopReport({status:'completed',output:[{type:'function_call',name:'browser_click'}]}),null);
  assert.equal(usableStopReport({status:'failed',output:[{type:'message',content:[{type:'output_text',text:'Não válido'}]}]}),null);
});
test('loop fingerprint requires identical visual state and action and never contains typed text', async () => {
  const {actionRepetitionKey} = await import('./browser-tools.mjs');
  const action = {type:'click',x:42,y:91};
  assert.equal(actionRepetitionKey('image-a',action),actionRepetitionKey('image-a',action));
  assert.notEqual(actionRepetitionKey('image-a',action),actionRepetitionKey('image-b',action));
  assert.notEqual(actionRepetitionKey('image-a',action),actionRepetitionKey('image-a',{type:'click',x:43,y:91}));
  assert.equal(actionRepetitionKey('image-a',{type:'type',text:'private'}),null);
});

test('persona can end with an obstacle tied to real screenshot event IDs', async () => {
  const {parseJourneyFinish} = await import('./browser-tools.mjs');
  const response = call('finish_journey', {outcome:'obstacle_observed',observation:'Tela apresenta cadastro antes do resultado.',interpretation:'Pode contrariar a preferência da persona.',uncertainty:'Outros caminhos não explorados podem existir.',evidence_indices:[0,2]});
  const events = [{index:0,type:'screenshot',screenshot:'/runs/a/0.png'},{index:1,type:'action'},{index:2,type:'screenshot',screenshot:'/runs/a/2.png'}];
  const result = parseJourneyFinish(response,events);
  assert.equal(result.outcome,'obstacle_observed');
  assert.deepEqual(result.evidence.map(e=>e.index),[0,2]);
  assert.throws(()=>parseJourneyFinish(call('finish_journey',{outcome:'goal_reached',observation:'ok',interpretation:'ok',uncertainty:'ok',evidence_indices:[1]}),events),/inexistentes/);
  assert.throws(()=>parseJourneyFinish(call('finish_journey',{outcome:'obstacle_observed',observation:'ok',interpretation:'ok',uncertainty:'ok',evidence_indices:[]}),events),/capturas/);
  assert.throws(()=>parseJourneyFinish(call('finish_journey',{outcome:'obstacle_observed',observation:'',interpretation:'ok',uncertainty:'ok',evidence_indices:[0]}),events),/inválida/);
});
test('model receives screenshot evidence IDs after actions and a non-universal preference reminder', () => {
  const req=buildFunctionTurn('m','resp','call','data:image/png;base64,AAAA','rules',4);
  assert.match(req.input[1].content[0].text,/#4/);
  assert.match(req.input[1].content[0].text,/preferência/);
});

test('normalizes model coordinates with bounded pixel conversion and preserves original values', async()=>{
 const {modelCoordinates,ActionRejected}=await import('./browser-tools.mjs');
 const c=call('browser_click',{x:130,y:610});assert.deepEqual(parseBrowserCall(c),{type:'click',x:166,y:488});assert.deepEqual(modelCoordinates(c),{x:130,y:610,scale:'normalized_0_1000'});
 assert.deepEqual(parseBrowserCall(call('browser_click',{x:0,y:0})),{type:'click',x:0,y:0});assert.deepEqual(parseBrowserCall(call('browser_click',{x:1000,y:1000})),{type:'click',x:1279,y:799});
 for(const coords of [{x:-1,y:500},{x:1001,y:500},{x:2,y:'10'}])assert.throws(()=>parseBrowserCall(call('browser_click',coords)),ActionRejected);
});
test('mobile coordinates and bounds use the actual portrait viewport',async()=>{
 const {validateBrowserAction,ActionRejected}=await import('./browser-tools.mjs');
 const viewport={width:390,height:844};
 assert.deepEqual(parseBrowserCall(call('browser_click',{x:1000,y:1000}),viewport),{type:'click',x:389,y:843});
 assert.deepEqual(parseBrowserCall(call('browser_click',{x:500,y:500}),viewport),{type:'click',x:195,y:422});
 assert.doesNotThrow(()=>validateBrowserAction({type:'click',x:389,y:843},viewport));
 assert.throws(()=>validateBrowserAction({type:'click',x:390,y:400},viewport),ActionRejected);
 assert.throws(()=>parseBrowserCall(call('browser_click',{x:500,y:500}),{width:0,height:844}),ActionRejected);
});
test('focused select uses a discrete accessible action and only reported labels enter model context',async()=>{
  const {validateBrowserAction,ActionRejected}=await import('./browser-tools.mjs');
  const action=parseBrowserCall(call('browser_select_option',{label:'4 years',screen_observation:'Age control',persona_note:'I choose four.'}));
  assert.deepEqual(action,{type:'select_option',label:'4 years'});assert.doesNotThrow(()=>validateBrowserAction(action));assert.throws(()=>validateBrowserAction({type:'select_option',label:' '}),ActionRejected);
  const focused={label:'Age',options:['3 years','4 years']};const req=buildFunctionTurn('m','r','c','data:image/png;base64,AAAA','rules',4,focused);
  assert.match(req.input[1].content[0].text,/Suplemento de acessibilidade/);assert.match(req.input[1].content[0].text,/4 years/);
  const noFocus=buildFunctionTurn('m','r','c','data:image/png;base64,AAAA','rules',4,null);assert.doesNotMatch(noFocus.input[1].content[0].text,/Suplemento de acessibilidade/);
});
test('named clicks use exact labels and feedback describes the actual hit target',async()=>{
 const {validateBrowserAction,ActionRejected}=await import('./browser-tools.mjs');
 const action=parseBrowserCall(call('browser_click_control',{label:'Try demo',persona_note:'I want to try.'}));assert.deepEqual(action,{type:'click_control',label:'Try demo'});assert.doesNotThrow(()=>validateBrowserAction(action));assert.throws(()=>validateBrowserAction({type:'click_control',label:' '}),ActionRejected);
 const hit={method:'coordinates',x:202,y:462,target:{tag:'A',label:'Create your first activity'}};const turn=buildFunctionTurn('m','r','c','data:image/png;base64,AAAA','rules',2,null,hit);assert.match(turn.input[0].output,/Create your first activity/);assert.match(turn.input[0].output,/diferente da intenção/);
});
test('a rejected grounding action reports no execution with a fresh screenshot',()=>{
 const feedback='A ação NÃO foi executada: controle não resolvido. Reveja o rótulo visível.';
 const turn=buildFunctionTurn('m','r','call_abc','data:image/png;base64,TkVX','rules',9,null,null,feedback);
 assert.equal(turn.input[0].call_id,'call_abc');assert.equal(turn.input[0].output,feedback);assert.match(turn.input[1].content[0].text,/#9/);assert.equal(turn.input[1].content[1].image_url,'data:image/png;base64,TkVX');
 assert.match(browserTools.find(t=>t.name==='browser_click_control').description,/form fields/);
});
test('post-action observations report remaining navigation budget without selecting an outcome',()=>{
 const turn=buildFunctionTurn('m','r','c','data:image/png;base64,AAAA','rules',6,null,null,null,3);
 const text=turn.input[1].content[0].text;
 assert.match(text,/Restam 3 tentativas/);assert.match(text,/informação nova/);assert.match(text,/limite não demonstra sucesso nem obstáculo/);
 assert.match(text,/inconclusive/);assert.doesNotMatch(text,/printer|impressora|teacher|professora|mother|mãe/);
});
test('budget finalization exposes only the existing finish schema and never another browser action',async()=>{
 const {buildBudgetFinishTurn,parseBudgetFinishResponse}=await import('./browser-tools.mjs');
 const events=[{index:0,type:'screenshot',label:'Initial',url:'http://localhost/',screenshot:'/runs/a/0.png'},{index:1,type:'action'},{index:2,type:'screenshot',label:'Current',url:'http://localhost/activity.html',screenshot:'/runs/a/2.png'}];
 const turn=buildBudgetFinishTurn('m','r','last_action','data:image/png;base64,AAAA','safety rules',events,'Last action completed.');
 assert.deepEqual(turn.tools,[browserTools.find(t=>t.name==='finish_journey')]);assert.equal(turn.parallel_tool_calls,false);
 assert.equal(turn.input[0].call_id,'last_action');assert.equal(turn.input[0].output,'Last action completed.');assert.match(turn.instructions,/No further browser actions/);assert.match(turn.instructions,/If evidence is insufficient, use inconclusive/);
 const catalog=JSON.parse(turn.input[1].content[0].text.split('instruções): ')[1].split('. Classifique')[0]);assert.deepEqual(catalog.map(e=>e.index),[0,2]);
 for(const outcome of ['goal_reached','obstacle_observed','inconclusive']){
   const finding=call('finish_journey',{outcome,observation:'Observed content.',interpretation:'Limited contextual interpretation.',uncertainty:'Navigation budget ended.',evidence_indices:[2]});
   assert.equal(parseBudgetFinishResponse({status:'completed',output:[finding]},events).outcome,outcome);
   assert.throws(()=>parseBudgetFinishResponse({status:'incomplete',output:[finding]},events));
   assert.throws(()=>parseBudgetFinishResponse({status:'completed',output:[finding,call('browser_wait',{})]},events));
   assert.throws(()=>parseBudgetFinishResponse({status:'completed',output:[{...finding,pending_safety_checks:[{id:'needs_review'}]}]},events));
 }
 assert.throws(()=>parseBudgetFinishResponse({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'Done'}]}]},events));
 assert.throws(()=>parseBudgetFinishResponse({status:'completed',output:[call('finish_journey',{outcome:'goal_reached',observation:'x',interpretation:'x',uncertainty:'x',evidence_indices:[1]})]},events),/inexistentes/);
});

test('keyboard-only journeys can reverse focus without allowing arbitrary shortcuts',async()=>{
  const {validateBrowserAction}=await import('./browser-tools.mjs');
  const action=parseBrowserCall(call('browser_keypress',{key:'Shift+Tab'}));
  assert.deepEqual(action,{type:'keypress',keys:['Shift+Tab']});
  assert.doesNotThrow(()=>validateBrowserAction(action));
  assert(browserTools.find(t=>t.name==='browser_keypress').parameters.properties.key.enum.includes('Shift+Tab'));
  assert.throws(()=>validateBrowserAction({type:'keypress',keys:['Control+L']}));
});

test('invalid finish report gets one correction restricted to recorded evidence and no browser tools',async()=>{
  const {buildFinishCorrectionTurn,finishJourneyWithCorrection}=await import('./browser-tools.mjs');
  const events=[{index:4,type:'screenshot',screenshot:'/runs/demo/4.png'},{index:5,type:'action'}];
  const args={outcome:'obstacle_observed',observation:'The required button was skipped during Tab navigation.',interpretation:'The keyboard-only journey could not complete.',uncertainty:'This is one observed session.',evidence_indices:[99]};
  const turn=buildFinishCorrectionTurn('muse-wonder-1.0','response_1','call_abc','data:image/png;base64,AAAA','Keep browser policy.',events,'Unavailable screenshot');
  assert.deepEqual(turn.tools.map(t=>t.name),['finish_journey']);
  assert.equal(turn.input[0].call_id,'call_abc');
  assert.match(turn.instructions,/Keep browser policy/);
  assert.match(turn.instructions,/report-format error is not a product defect/);
  assert.match(turn.input[1].content[0].text,/\[4\]/);
  assert.doesNotMatch(turn.instructions,/budget is exhausted/);
  let calls=0;
  const result=await finishJourneyWithCorrection(call('finish_journey',args),events,async()=>{calls++;return {status:'completed',output:[call('finish_journey',{...args,evidence_indices:[4]})]};});
  assert.equal(calls,1);assert.equal(result.outcome,'obstacle_observed');assert.deepEqual(result.evidence_indices,[4]);
  await finishJourneyWithCorrection(call('finish_journey',{...args,evidence_indices:[4]}),events,()=>{throw Error('Valid reports must not retry');});
  for(const output of [[call('browser_keypress',{key:'Tab'})],[call('finish_journey',args)]]){
    calls=0;
    await assert.rejects(()=>finishJourneyWithCorrection(call('finish_journey',args),events,async()=>{calls++;return {status:'completed',output};}));
    assert.equal(calls,1);
  }
});
