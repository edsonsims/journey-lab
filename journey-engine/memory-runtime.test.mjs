import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareMemoryLearnings, personaMemoryForScreen, memoryScreenUrl, bindRunMemorySnapshot, sendWithMemoryReceipt } from './memory-runtime.mjs';
import { composePersonaContext, composeCharterContext } from './library-context.mjs';
import { browserTools, parseJourneyFinish } from './browser-tools.mjs';
import { memoryFlowsForScreen } from './workspace-memory.mjs';

const entry=(id,audience='persona')=>({id,version:1,versionId:`${id}-v1`,projectId:'p',audience,content:`Prior observation ${id}`,kind:'navigation',confidence:0.8,confidenceBasis:'A cited screenshot shows the control.',sources:[{runId:'source',eventIndex:0}],applicability:{personaId:'parent'},scope:{screenPatterns:['/activity'],flows:[]}});
const run=()=>({id:'r',projectId:'p',personaId:'parent',personaSnapshot:{continuity:'returning'},charterSnapshot:{memoryPolicy:'relevant'},target:'https://product.test/',memorySnapshot:{id:'s',projectId:'p',roles:{persona:[entry('allowed')],evaluator:[entry('requirements','evaluator')],operational:[entry('setup','operational')]}}});
const memory={accessForScreen:(snapshot,{audience,url})=>snapshot.roles[audience].filter(item=>item.scope.screenPatterns.includes(new URL(url).pathname))};

test('memory access is recorded only after a provider response using the exact pre-request selection',async()=>{
  const selection={url:'https://product.test/activity',entryIds:['allowed'],entries:[entry('allowed')]},access=[],delivered=new Set();let respond;
  const sending=sendWithMemoryReceipt(()=>new Promise(resolve=>respond=resolve),{input:[]},{runId:'r',snapshotId:'snapshot-original',memory:selection,eventIndex:8,recordAccess:(...args)=>access.push(args),delivered});
  assert.equal(access.length,0);assert.equal(delivered.size,0);
  selection.url='https://changed.test/';selection.entryIds[0]='changed';selection.entries[0].versionId='changed-v2';
  const response={status:'completed',id:'provider-receipt',usage:{input_tokens:100}};respond(response);assert.equal(await sending,response);
  assert.deepEqual(access,[['r',{snapshotId:'snapshot-original',audience:'persona',url:'https://product.test/activity',entryIds:['allowed'],eventIndex:8}]]);assert.deepEqual([...delivered],['allowed-v1']);
});

test('preflight rejection and failed transport do not manufacture memory access or mark entries delivered',async()=>{
  for(const code of ['TOKEN_BUDGET','TRANSPORT_FAILED']){
    const delivered=new Set(),access=[],selection={url:'https://product.test/activity',entryIds:['allowed'],entries:[entry('allowed')]};
    await assert.rejects(sendWithMemoryReceipt(async()=>{throw Object.assign(new Error('No provider response'),{code});},{},{runId:'r',snapshotId:'s',memory:selection,eventIndex:2,recordAccess:(...args)=>access.push(args),delivered}),{code});
    assert.equal(access.length,0);assert.equal(delivered.size,0);
  }
  const delivered=new Set();await sendWithMemoryReceipt(async()=>undefined,{},{memory:{url:'https://product.test/activity',entryIds:['allowed'],entries:[entry('allowed')]},recordAccess:()=>assert.fail('No response receipt'),delivered});assert.equal(delivered.size,0);
});

test('failed, malformed and unacknowledged provider objects do not become successful memory deliveries',async()=>{
  const selection={url:'https://product.test/activity',entryIds:['allowed'],entries:[entry('allowed')]};
  const valid={id:'provider-receipt',status:'completed',usage:{input_tokens:100}};
  for(const response of [{},{...valid,status:'failed'},{...valid,status:'cancelled'},{...valid,id:''},{...valid,usage:null},{...valid,usage:{input_tokens:0}},{...valid,usage:{input_tokens:NaN}},{...valid,error:{message:'Provider failed'}}]){
    const delivered=new Set();await sendWithMemoryReceipt(async()=>response,{},{memory:selection,recordAccess:()=>assert.fail('Unconfirmed delivery'),delivered});assert.equal(delivered.size,0);
  }
  const delivered=new Set(),access=[];await sendWithMemoryReceipt(async()=>({...valid,status:'incomplete'}),{},{memory:selection,recordAccess:(...args)=>access.push(args),delivered});assert.equal(access.length,1);assert.deepEqual([...delivered],['allowed-v1']);
});

test('first-time and explicit-only personas receive no prior memory even if a snapshot contains it',()=>{
  for(const variant of [{personaSnapshot:{continuity:'first-time'}},{charterSnapshot:{memoryPolicy:'explicit'}},{charterSnapshot:{memoryPolicy:'none'}},{memorySnapshot:{projectId:'foreign',roles:{persona:[entry('foreign')]}}}]){
    let calls=0;const result=personaMemoryForScreen({...run(),...variant},{accessForScreen:()=>{calls++;return [entry('hidden')];}},'https://product.test/activity');
    assert.equal(result.text,'');assert.equal(calls,0);
  }
});

test('returning persona receives only own eligible current-screen entries and never other audiences',()=>{
  const current=run();current.memorySnapshot.roles.persona.push({...entry('other-persona'),applicability:{personaId:'teacher'}},entry('wrong-role','evaluator'),{...entry('foreign'),projectId:'other'});
  const result=personaMemoryForScreen(current,memory,'https://product.test/activity?session=private');
  assert.deepEqual(result.entryIds,['allowed']);assert.match(result.text,/sourced claims with uncertainty/);assert.doesNotMatch(result.text,/Prior observation (setup|requirements)|wrong-role|other-persona|foreign/);
  assert.equal(personaMemoryForScreen(current,memory,'https://product.test/pricing').text,'');
  assert.equal(personaMemoryForScreen(current,memory,'https://product.test/activity',new Set(['allowed-v1'])).text,'');
});

test('before and after preview routes resolve against the same frozen source knowledge',()=>{
  const original=run(),snapshot=structuredClone(original.memorySnapshot);
  for(const variant of ['before','after']){
    const preview={...original,target:`http://127.0.0.1:4400/${variant}/`,memoryReferenceUrl:'https://product.test/',memorySnapshot:structuredClone(snapshot)};
    const result=personaMemoryForScreen(preview,memory,`http://127.0.0.1:4400/${variant}/activity?secret=discard`);
    assert.deepEqual(result.entryIds,['allowed']);assert.equal(result.url,'https://product.test/activity');assert.deepEqual(preview.memorySnapshot,snapshot);
  }
  assert.equal(memoryScreenUrl({...original,target:'http://127.0.0.1:4400/before/',memoryReferenceUrl:original.target},'https://other.test/activity'),'https://other.test/activity');
});

test('memory context remains bounded and never silently imports later Library entries',()=>{
  const current=run();current.memorySnapshot.roles.persona=Array.from({length:30},(_,i)=>({...entry(`m${i}`),content:'x'.repeat(3000)}));
  const frozen=structuredClone(current.memorySnapshot);
  const result=personaMemoryForScreen(current,memory,'https://product.test/activity');assert.ok(result.entries.length>0&&result.entries.length<12);assert.ok(result.text.length<26000);assert.deepEqual(current.memorySnapshot,frozen);
});

test('bounded learning proposals preserve invalid-source failures while removing unknown authority and secrets',()=>{
  const value={content:'Use test token=example-private and Bearer sample-credential',kind:'navigation',subject:'Navigation',value:'Available',polarity:'affirm',audience:'persona',confidence:0.8,confidenceBasis:'Seen',scope:{screenPatterns:[],flows:[]},sources:[{eventIndex:999}]};
  const prepared=prepareMemoryLearnings([value],['example-private']);assert.equal(prepared[0].sources[0].eventIndex,999);assert.doesNotMatch(JSON.stringify(prepared),/example-private|sample-credential/);
  assert.ok(prepareMemoryLearnings([{...value,applicability:{personaId:'other'},credentials:'secret'}])[0].publicationError);
  assert.ok(prepareMemoryLearnings('malformed')[0].publicationError);assert.ok(prepareMemoryLearnings(Array.from({length:13},()=>value))[0].publicationError);
});

test('finish_journey carries learnings without converting a publication problem into a lost finding',()=>{
  const schema=browserTools.find(tool=>tool.name==='finish_journey').parameters.properties.learnings;
  assert.equal(schema.maxItems,12);assert.ok(schema.items.required.includes('confidenceBasis'));assert.equal(schema.items.properties.sources.items.properties.runId,undefined);
  const data={outcome:'obstacle_observed',observation:'A print button is shown.',interpretation:'This may block the stated resources.',uncertainty:'Other paths are untested.',evidence_indices:[0],learnings:[{content:'No confidence or sources'}]};
  const result=parseJourneyFinish({type:'function_call',name:'finish_journey',arguments:JSON.stringify(data)},[{index:0,type:'screenshot',screenshot:'/runs/r/screen.png'}]);
  assert.equal(result.outcome,'obstacle_observed');assert.equal(result.learnings.length,1);assert.equal(result.learnings[0].content,'No confidence or sources');
});

test('prompts distinguish permitted returning knowledge from first-time experience and evaluator instructions',()=>{
  assert.match(composePersonaContext({continuity:'returning'},{memoryPolicy:'relevant',hasSnapshot:true}),/permitted prior observations from the pinned snapshot/);
  assert.match(composePersonaContext({continuity:'first-time'},{memoryPolicy:'relevant',hasSnapshot:true}),/Do not import previous journey outcomes/);
  assert.match(composeCharterContext({memoryPolicy:'relevant'}),/Operational and evaluator memory are never explorer knowledge/);
});

test('normal retries reject changed source builds while controlled fix pairs retain identical knowledge',()=>{
  const snapshot={...run().memorySnapshot,buildResolved:true,environment:{buildId:'source:old'}};
  const memory={buildIdentity:()=> 'source:new',bindSnapshotBuild:()=>{throw Error('Must not resolve fresh Library contents');}};
  assert.throws(()=>bindRunMemorySnapshot({...run(),memorySnapshot:snapshot},memory),error=>error.code==='MEMORY_SOURCE_CHANGED');
  assert.equal(bindRunMemorySnapshot({...run(),comparisonId:'fix-pair',memorySnapshot:snapshot},memory),snapshot);
  assert.equal(bindRunMemorySnapshot({...run(),memorySnapshot:snapshot},{...memory,buildIdentity:()=> 'source:old'}),snapshot);
});

test('flow-only knowledge follows a grounded current screen instead of every charter flow',()=>{
 const current=run();current.viewport={width:390,height:844};current.environmentId='staging';
 current.charterSnapshot.flows=['Checkout','Account'];
 current.memorySnapshot.flowContext={inventoryVersion:1,inventoryVersionId:'inventory-v1',charterFlows:['Checkout','Account'],flows:[{id:'checkout',name:'Checkout'},{id:'account',name:'Account'}],screens:[
  {id:'checkout-screen',routePattern:'/checkout/:step',origin:'https://product.test',device:'mobile',flowIds:['checkout']},
  {id:'account-screen',routePattern:'/account',origin:'https://product.test',flowIds:['account']},
 ]};
 current.memorySnapshot.roles.persona=[{...entry('checkout'),scope:{screenPatterns:[],flows:['checkout']}},{...entry('account'),scope:{screenPatterns:[],flows:['Account']}}];
 const scoped={flowsForScreen:memoryFlowsForScreen,accessForScreen:(snapshot,{audience,flows})=>snapshot.roles[audience].filter(item=>item.scope.flows.some(flow=>flows.includes(flow)))};
 const received=personaMemoryForScreen(current,scoped,'https://product.test/checkout/payment');assert.deepEqual(received.entryIds,['checkout']);assert.equal(received.flowContext.screenId,'checkout-screen');
 assert.deepEqual(personaMemoryForScreen(current,scoped,'https://product.test/account').entryIds,['account']);
 assert.deepEqual(personaMemoryForScreen(current,scoped,'https://another.test/checkout/payment').entryIds,[]);
 assert.deepEqual(personaMemoryForScreen({...current,viewport:{width:1280,height:800}},scoped,'https://product.test/checkout/payment').entryIds,[]);
 const noInventory={...current,memorySnapshot:{...current.memorySnapshot,flowContext:null}};const unavailable=personaMemoryForScreen(noInventory,scoped,'https://product.test/checkout/payment');assert.deepEqual(unavailable.entryIds,[]);assert.equal(unavailable.flowContext.reason,'flow_inventory_not_pinned');
 current.memorySnapshot.flowContext.screens.push({...current.memorySnapshot.flowContext.screens[0],id:'ambiguous',flowIds:['account']});assert.deepEqual(personaMemoryForScreen(current,scoped,'https://product.test/checkout/payment').entryIds,[]);
});
