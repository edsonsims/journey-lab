import test from 'node:test';
import assert from 'node:assert/strict';
import {boundModelRequest,estimateRequestBudget,estimateRequestTokens,modelBudgetStopEvent,safeBudgetDiagnostics,usageTotal,createReceiptAwareBudget,recordModelReceipt} from './model-budget.mjs';
import {createModelConversation} from './model-conversation.mjs';

test('preflight stop distinguishes actual usage from estimated next-request reservation without retaining content',()=>{
  const body={model:'muse-wonder-1.0',instructions:'PRIVATE_INSTRUCTION',input:[{type:'reasoning',encrypted_content:'OPAQUE_PRIVATE_REASONING'.repeat(5000)},{role:'user',content:[{type:'input_text',text:'PRIVATE_INPUT'},{type:'input_image',image_url:'data:image/png;base64,PRIVATE_IMAGE'}]}]};
  const original=JSON.stringify(body),estimate=estimateRequestBudget(body);
  assert.equal(estimate.imageCount,1);assert.equal(estimate.imageAllowance,4096);assert.equal(estimate.inputEstimate,estimate.textBytes+4096);assert.equal(estimateRequestTokens(body),estimate.inputEstimate);
  let error;try{boundModelRequest(body,{remainingTokens:78915,actualUsed:71085,tokenLimit:150000});}catch(caught){error=caught;}
  assert.equal(error.code,'TOKEN_BUDGET');
  const event=modelBudgetStopEvent(error);
  assert.deepEqual(event.budget,{reason:'estimated_next_request',estimateMethod:'full',actualUsed:71085,remaining:78915,tokenLimit:150000,...estimate,requestedMaxOutput:4096,maxOutput:0,minimumOutput:128,priorInputTokens:null,deltaTextBytes:null,deltaImageCount:null,deltaImageAllowance:null,appendedItemCount:null,margin:null});
  assert.match(event.message,/Actual recorded usage is below/);
  for(const secret of ['PRIVATE_INSTRUCTION','PRIVATE_INPUT','PRIVATE_IMAGE','OPAQUE_PRIVATE_REASONING'])assert.equal(JSON.stringify({event,error}).includes(secret),false);
  assert.equal(JSON.stringify(body),original);
});

test('exhausted and invalid allowances are classified without inspecting the request',()=>{
  const body={toJSON(){throw Error('Must not inspect a body after exhaustion');}};
  for(const [remaining,reason]of [[0,'actual_exhaustion'],[-25,'actual_exhaustion'],[undefined,'invalid_budget'],[NaN,'invalid_budget']]){
    assert.throws(()=>boundModelRequest(body,{remainingTokens:remaining,actualUsed:150025,tokenLimit:150000}),error=>{
      const event=modelBudgetStopEvent(error);assert.equal(event.budget.reason,reason);assert.equal(event.budget.inputEstimate,null);assert.equal(event.budget.textBytes,null);assert.equal(event.budget.imageCount,null);assert.equal(event.budget.imageAllowance,null);
      assert.equal(event.budget.remaining,reason==='actual_exhaustion'?0:null);assert.equal(event.budget.actualUsed,150025);return true;
    });
  }
});

test('the diagnostic addition preserves conservative estimates and accepted output limits exactly',()=>{
  const body={model:'muse-wonder-1.0',input:[{role:'user',content:[{type:'input_text',text:'Ação: observe 日本語.'},{type:'input_image',image_url:'data:image/png;base64,'+'X'.repeat(100000)}]}]};
  const text=JSON.stringify(body,(_key,value)=>value?.type==='input_image'?{type:'input_image'}:value);
  const input=Buffer.byteLength(text,'utf8')+4096;
  assert.equal(estimateRequestTokens(body),input);
  for(const output of [128,512,4096])assert.deepEqual(boundModelRequest(body,{remainingTokens:input+output,actualUsed:20,tokenLimit:input+output+20}),{...body,max_output_tokens:output});
  assert.throws(()=>boundModelRequest(body,{remainingTokens:input+127}),error=>{assert.equal(error.diagnostics.maxOutput,127);return error.code==='TOKEN_BUDGET';});
  assert.equal(boundModelRequest(body,{remainingTokens:100000}).max_output_tokens,4096);
});

test('stateless conversation preflight preserves the first receipt and makes no hidden second call',async()=>{
  const receipts=[],events=[];let calls=0;
  const conversation=createModelConversation(async body=>{
    const actualUsed=usageTotal(receipts);
    boundModelRequest(body,{remainingTokens:10000-actualUsed,actualUsed,tokenLimit:10000});calls++;
    receipts.push({total_tokens:500,input_tokens:450,output_tokens:50});
    return {id:'first-response',usage:receipts[0],output:[{type:'reasoning',encrypted_content:'OPAQUE_DO_NOT_RECORD'.repeat(1000)}]};
  });
  await conversation({model:'muse-wonder-1.0',input:[{role:'user',content:[{type:'input_text',text:'Start'}]}]});
  try{await conversation({model:'muse-wonder-1.0',input:[{role:'user',content:[{type:'input_text',text:'Continue'}]}]});}catch(error){events.push(modelBudgetStopEvent(error));}
  assert.equal(calls,1);assert.equal(receipts.length,1);assert.equal(events[0].budget.actualUsed,500);assert.equal(events[0].budget.remaining,9500);assert.equal(events[0].budget.reason,'estimated_next_request');assert.equal(JSON.stringify(events).includes('OPAQUE_DO_NOT_RECORD'),false);
});

test('budget event serialization accepts only fixed reasons and finite nonnegative integer fields',()=>{
  const malicious={reason:'estimated_next_request',actualUsed:10,remaining:5,inputEstimate:Infinity,textBytes:-1,imageCount:1.5,imageAllowance:'SECRET',requestBody:{secret:'PRIVATE_BODY'},encrypted_content:'PRIVATE_REASONING',minimumOutput:128};
  const safe=safeBudgetDiagnostics(malicious);assert.equal(safe.actualUsed,10);assert.equal(safe.imageCount,null);assert.equal(safe.imageAllowance,null);assert.equal(safe.inputEstimate,null);assert.equal(safe.textBytes,null);assert.equal(safe.tokenLimit,null);assert.equal(safe.requestBody,undefined);
  const event=modelBudgetStopEvent({diagnostics:malicious,message:'UNTRUSTED_ERROR_SECRET'});assert.equal(JSON.stringify(event).includes('SECRET'),false);
  assert.equal(safeBudgetDiagnostics({...malicious,reason:'PRIVATE_REASON'}),null);assert.equal(modelBudgetStopEvent({message:'PRIVATE_ERROR'}).budget,undefined);
});

const requestFixture=()=>({model:'muse-wonder-1.0',instructions:'Observe the visible page and preserve the mission. '.repeat(120),tools:[{type:'function',name:'click',parameters:{type:'object'}}],parallel_tool_calls:false,include:['reasoning.encrypted_content'],store:false,input:[{role:'user',content:[{type:'input_text',text:'Primeira ação: 日本語 — confira a experiência.'},{type:'input_image',image_url:'data:image/png;base64,IMAGE_NEVER_PERSIST'}]}]});
const allowance={remainingTokens:150000,actualUsed:0,tokenLimit:150000};
const responseFixture=(patch={})=>({id:'response-1',status:'completed',model:'muse-wonder-1.0',usage:{input_tokens:1000,output_tokens:100,total_tokens:1100,input_tokens_details:{cached_tokens:999}},...patch});
function anchored(body=requestFixture(),response=responseFixture()){
  const tracker=createReceiptAwareBudget(),prepared=tracker.prepare(body,allowance);assert.equal(prepared.budget.estimateMethod,'full');prepared.complete(response);return {tracker,body};
}
const append=(body,items=[{role:'user',content:[{type:'input_text',text:'Next screen'}]}])=>({...body,input:[...body.input,...items]});

test('receipt prefix uses full previous input usage and conservatively adds multilingual text, opaque reasoning and images',()=>{
  const {tracker,body}=anchored();
  const items=[{type:'reasoning',encrypted_content:'OPAQUE_ENCRYPTED_CONTENT'.repeat(80)},{type:'function_call',name:'click',call_id:'c1',arguments:'{"x":3,"y":4}'},{type:'function_call_output',call_id:'c1',output:'Clicado: 日本語'},{role:'user',content:[{type:'input_text',text:'Próxima ação: confira a experiência.'},{type:'input_image',image_url:'data:image/png;base64,NEW_IMAGE_PRIVATE'}]}];
  const delta=estimateRequestBudget({input:items}),margin=1024+64*items.length;
  const prepared=tracker.prepare(append(body,items),{...allowance,remainingTokens:148900,actualUsed:1100});
  assert.equal(prepared.budget.estimateMethod,'receipt_prefix');assert.equal(prepared.budget.priorInputTokens,1000);assert.equal(prepared.budget.inputEstimate,1000+delta.inputEstimate+margin);assert.equal(prepared.budget.deltaTextBytes,delta.textBytes);assert.equal(prepared.budget.deltaImageCount,1);assert.equal(prepared.budget.deltaImageAllowance,4096);assert.equal(prepared.budget.margin,margin);
  assert.ok(delta.textBytes>items[0].encrypted_content.length);assert.equal(prepared.request.max_output_tokens,4096);
  const serialized=JSON.stringify(prepared.budget);for(const secret of ['OPAQUE_ENCRYPTED_CONTENT','NEW_IMAGE_PRIVATE','IMAGE_NEVER_PERSIST','signature','prefixSHA256','response-1'])assert.equal(serialized.includes(secret),false);
});

test('any caller metadata change or edited/reordered/shortened prior input falls back to full estimation',()=>{
  const edits=[body=>({...append(body),model:'other'}),body=>({...append(body),instructions:'Changed mission'}),body=>({...append(body),tools:[]}),body=>({...append(body),tool_choice:'required'}),body=>({...append(body),parallel_tool_calls:true}),body=>({...append(body),reasoning:{effort:'high'}}),body=>({...append(body),text:{format:{type:'json_object'}}}),body=>({...append(body),temperature:0.2}),body=>({...append(body),metadata:{new:'value'}}),body=>({...append(body),unknown_field:'changed'}),body=>({...append(body),max_output_tokens:2000}),body=>({...append(body),store:true}),body=>({...append(body),include:[]}),body=>({...body,input:[]}),body=>({...body,input:[{role:'user',content:[{type:'input_text',text:'Edited old content'}]}]}),body=>({...body,input:[...body.input].reverse()})];
  for(const edit of edits){const body=requestFixture();body.input.push({role:'user',content:[{type:'input_text',text:'Second prefix item'}]});const {tracker}=anchored(body);const next=edit(body),prepared=tracker.prepare(next,allowance);assert.equal(prepared.budget.estimateMethod,'full');assert.equal(prepared.budget.inputEstimate,estimateRequestTokens(next));}
});

test('derived output cap changes are not metadata changes, but explicit caller caps remain signature-covered',()=>{
  const {tracker,body}=anchored();assert.equal(Object.hasOwn(body,'max_output_tokens'),false);
  const same=append(body),probe=tracker.prepare(same,allowance);const inputEstimate=probe.budget.inputEstimate;probe.abandon();
  const second=anchored(body);const bounded=second.tracker.prepare(same,{...allowance,remainingTokens:inputEstimate+200});assert.equal(bounded.request.max_output_tokens,200);assert.equal(bounded.budget.estimateMethod,'receipt_prefix');
  const explicit={...requestFixture(),max_output_tokens:1000},{tracker:third}=anchored(explicit);assert.equal(third.prepare({...append(explicit),max_output_tokens:2000},allowance).budget.estimateMethod,'full');
});

test('missing or malformed usage, wrong model, failed/incomplete responses and abandoned calls cannot establish an anchor',()=>{
  const bad=[responseFixture({usage:undefined}),responseFixture({usage:{total_tokens:1100}}),responseFixture({usage:{input_tokens:1000,output_tokens:100,total_tokens:999}}),responseFixture({usage:{input_tokens:NaN,output_tokens:100,total_tokens:1100}}),responseFixture({usage:{input_tokens:1000.5,output_tokens:100,total_tokens:1100.5}}),responseFixture({usage:{input_tokens:-1,output_tokens:100,total_tokens:99}}),responseFixture({usage:{input_tokens:1000,output_tokens:100,total_tokens:1100,input_tokens_details:{cached_tokens:1001}}}),responseFixture({usage:{input_tokens:1000,output_tokens:100,total_tokens:1100,output_tokens_details:{reasoning_tokens:101}}}),responseFixture({model:'another-model'}),responseFixture({status:'incomplete'}),responseFixture({status:'failed'}),responseFixture({error:{message:'failure'}})];
  for(const response of bad){const {tracker,body}=anchored(requestFixture(),response);assert.equal(tracker.prepare(append(body),allowance).budget.estimateMethod,'full');}
  const {tracker,body}=anchored();const pending=tracker.prepare(append(body),allowance);pending.abandon();assert.equal(tracker.prepare(append(body),allowance).budget.estimateMethod,'full');
  const missingModel=responseFixture();delete missingModel.model;const allowed=anchored(requestFixture(),missingModel);assert.equal(allowed.tracker.prepare(append(allowed.body),allowance).budget.estimateMethod,'receipt_prefix');
});

test('a trustworthy receipt after metadata change establishes a fresh anchor; finish-report tools remain full fallback',()=>{
  const {tracker,body}=anchored(),changed={...append(body),instructions:'New task instructions '.repeat(200)};
  const fresh=tracker.prepare(changed,allowance);assert.equal(fresh.budget.estimateMethod,'full');fresh.complete(responseFixture());assert.equal(tracker.prepare(append(changed),allowance).budget.estimateMethod,'receipt_prefix');
  const after=anchored(),finish={...append(after.body),instructions:after.body.instructions+' No further actions; finish only.',tools:[{type:'function',name:'finish_journey'}]};assert.equal(after.tracker.prepare(finish,allowance).budget.estimateMethod,'full');
});

test('actual input estimate drift retains actual usage and disables reuse for the rest of the conversation',()=>{
  const {tracker,body}=anchored(),next=append(body),prepared=tracker.prepare(next,allowance),actual=prepared.budget.inputEstimate+1;
  const response=responseFixture({usage:{input_tokens:actual,output_tokens:100,total_tokens:actual+100}}),event=prepared.complete(response);
  assert.equal(event.type,'budget_estimate_drift');assert.equal(event.budget.reason,'estimate_drift');assert.equal(event.budget.actualInputTokens,actual);assert.equal(event.budget.inputEstimate,actual-1);assert.equal(usageTotal([{total_tokens:1100},response.usage]),1100+actual+100);
  const fallback=tracker.prepare(append(next),allowance);assert.equal(fallback.budget.estimateMethod,'full');fallback.complete(responseFixture());assert.equal(tracker.prepare(append(append(next)),allowance).budget.estimateMethod,'full');
});

test('full receipt ledger still prevents spending when actual total is exhausted',()=>{
  const {tracker,body}=anchored();const total=usageTotal([{total_tokens:71085},{total_tokens:78915}]);
  assert.throws(()=>tracker.prepare(append(body),{remainingTokens:150000-total,actualUsed:total,tokenLimit:150000}),error=>error.diagnostics.reason==='actual_exhaustion'&&error.diagnostics.actualUsed===150000);
});

test('each provider invocation is charged even when its response ID repeats, with distinct local receipts',()=>{
  const run={},response=responseFixture();
  const first=recordModelReceipt(run,{response,model:'muse-wonder-1.0',startedAt:'2026-11-01T00:00:00Z',budget:{estimateMethod:'full',inputEstimate:2000}});
  const second=recordModelReceipt(run,{response,model:'muse-wonder-1.0',startedAt:'2026-11-01T00:00:01Z',budget:{estimateMethod:'receipt_prefix',inputEstimate:2000}});
  assert.notEqual(first.id,second.id);assert.equal(first.providerResponseId,'response-1');assert.equal(second.providerResponseId,'response-1');assert.equal(run.modelRequests.length,2);assert.equal(run.usage.length,2);assert.equal(usageTotal(run.usage),2200);
  recordModelReceipt(run,{response:{},model:'muse-wonder-1.0'});assert.equal(run.usage.at(-1),null);assert.throws(()=>usageTotal(run.usage),{code:'USAGE_UNAVAILABLE'});
});
