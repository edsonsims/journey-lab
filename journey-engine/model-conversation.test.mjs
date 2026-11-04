import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createModelConversation} from './model-conversation.mjs';

const image={type:'input_image',image_url:'data:image/png;base64,TESTIMAGE'};
const initial={model:'muse-wonder-1.0',instructions:'same mission',tools:[{type:'function',name:'click'}],input:[{role:'user',content:[{type:'input_text',text:'mission'},image]}]};
const firstOutput=[{type:'reasoning',id:'rs_old',summary:[],encrypted_content:'opaque-test-value'},
  {type:'message',id:'msg_old',status:'completed',role:'assistant',phase:'commentary',content:[{type:'output_text',text:'Explorando.'}]},
  {type:'function_call',id:'fc_old',status:'completed',name:'click',call_id:'c1',arguments:'{"x":130,"y":610}'}];
const followup={model:initial.model,instructions:initial.instructions,tools:initial.tools,previous_response_id:'r1',input:[{type:'function_call_output',call_id:'c1',output:'ok'},{role:'user',content:[image]}]};
test('every turn replays paired conversation and encrypted reasoning statelessly',async()=>{
  const requests=[];let limited=0;
  const ask=createModelConversation(async body=>{requests.push(body);return requests.length===1?{id:'r1',status:'completed',output:firstOutput}:{id:'r2',status:'completed',output:[]};},{onContextLimited:async()=>limited++});
  await ask(initial);await ask(followup);assert.equal(requests.length,2);assert.equal(limited,0);
  for(const r of requests){assert.equal(r.store,false);assert.deepEqual(r.include,['reasoning.encrypted_content']);assert.equal(r.previous_response_id,undefined);assert.equal(r.model,initial.model);assert.equal(r.instructions,initial.instructions);assert.deepEqual(r.tools,initial.tools);}
  const actual=requests[1].input;assert.deepEqual(actual,[...initial.input,{type:'reasoning',summary:[],encrypted_content:'opaque-test-value'},{type:'message',role:'assistant',phase:'commentary',content:firstOutput[1].content},{type:'function_call',name:'click',call_id:'c1',arguments:firstOutput[2].arguments},...followup.input]);
  assert.equal(actual.find(x=>x.type==='function_call').call_id,actual.find(x=>x.type==='function_call_output').call_id);
});
test('missing encrypted reasoning omits bare reference and reports limited retention without content',async()=>{
  const requests=[],events=[];const ask=createModelConversation(async body=>{requests.push(body);return requests.length===1?{status:'completed',output:[{type:'reasoning',id:'rs_missing',summary:[]},firstOutput[2]]}:{status:'completed',output:[]};},{onContextLimited:async(...args)=>events.push(args)});
  await ask(initial);await ask(followup);assert.equal(events.length,1);assert.deepEqual(events[0],[]);assert(!requests[1].input.some(x=>x.type==='reasoning'));assert.equal(requests[1].input.some(x=>x.id==='rs_missing'),false);
});
test('API errors propagate without a hidden retry and without sending state identifiers',async()=>{
  let n=0;const ask=createModelConversation(async body=>{n++;assert.equal(body.previous_response_id,undefined);throw new Error('API error');});
  await assert.rejects(()=>ask(followup),/API error/);assert.equal(n,1);
});

test('assistant text preceding a tool call is replayed as commentary if phase is missing',async()=>{const reqs=[];const ask=createModelConversation(async b=>{reqs.push(b);return reqs.length===1?{status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'A'}]},firstOutput[2]]}:{status:'completed',output:[]};});await ask(initial);await ask(followup);assert.equal(reqs[1].input.find(x=>x.type==='message').phase,'commentary');});
