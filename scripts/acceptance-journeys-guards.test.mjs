import test from 'node:test';
import assert from 'node:assert/strict';
import {ACTIVE,assertSessionEnvelope,comparisonReceipt,fieldnoteInventory,sameInventoryDeclaration,eligibleFirstMemory,memoryReceiptChecks,buildIdentity,verifyRecording} from './acceptance-journeys-guards.mjs';
const limits={maxSteps:12,maxTokens:150000,maxDurationMs:300000};
const inventory={...fieldnoteInventory('project','env'),version:1,versionId:'inventory-v1'};
function fixture(){
 const first={id:'first',projectId:'project',personaId:'persona',environmentId:'env',environmentVersion:1,status:'finished',integrityStatus:'verified',finding:{outcome:'goal_reached'},productFingerprint:{'index.html':'testhash'},charterSnapshot:{flows:['Create and find a note']},events:[{type:'screenshot',index:4,url:'http://127.0.0.1:4388/notes',screenshot:'/runs/first/4.png'}]};
 const entry={id:'memory',version:1,audience:'persona',projectId:'project',status:'published',confidence:.9,confidenceBasis:'The captured notes page shows the saved note.',scope:{screenPatterns:[],flows:['Create and find a note']},sources:[{runId:'first',eventIndex:4,screenshot:'/runs/first/4.png'}],applicability:{personaId:'persona',environmentId:'env',environmentVersion:1,buildId:buildIdentity(first)}};
 const before={snapshot:{id:'snapshot-first',policy:{continuity:'first-time'},roles:{persona:[]}},accessLog:[],publications:[{status:'published',entryId:entry.id,entryVersion:entry.version,entry}]};
 const returning={id:'returning',events:[{type:'screenshot',index:0,url:'http://127.0.0.1:4388/notes'}]};
 const after={snapshot:{id:'snapshot-returning',roles:{persona:[entry]}},accessLog:[{runId:'returning',snapshotId:'snapshot-returning',audience:'persona',entryIds:['memory'],eventIndex:0}]};
 return {first,entry,before,returning,after};
}

test('six session envelope reserves uncertain requests once and denies a seventh',()=>{
 const state={maxNewSessions:6,littleSteps:{},firstLaunchIntent:{},returningLaunchIntent:{}};
 assert.equal(assertSessionEnvelope(state),6);assert.throws(()=>assertSessionEnvelope(state,1),/exhausted/);
 assert.equal(assertSessionEnvelope({...state,firstRunId:'first',returningRunId:'second'}),6);
 assert.throws(()=>assertSessionEnvelope({...state,maxNewSessions:8}),/original six/);assert.ok(ACTIVE.has('cancelling'));
});
test('retet receipt distinguishes old comparison and rejects replacement, wrong controls or excess personas',()=>{
 const checkpoint={priorComparisonId:'old',roundId:'round',launchRequestedAt:'2026-11-01T00:00:00Z'};
 const comparison={id:'new',createdAt:'2026-11-01T00:01:00Z',controlOverrides:{limits},pairs:[{personaId:'mother'},{personaId:'teacher'}]};
 const fix={latestRound:{id:'round',comparison}};
 assert.equal(comparisonReceipt({...fix,latestRound:{id:'round',comparison:{id:'old'}}},checkpoint,limits),null);
 assert.equal(comparisonReceipt(fix,checkpoint,limits).id,'new');
 assert.throws(()=>comparisonReceipt(fix,{...checkpoint,comparisonId:'other'},limits),/replaced/);
 assert.throws(()=>comparisonReceipt({...fix,latestRound:{id:'wrong',comparison}},checkpoint,limits),/round changed/);
 assert.throws(()=>comparisonReceipt({...fix,latestRound:{id:'round',comparison:{...comparison,controlOverrides:{limits:{...limits,maxSteps:30}}}}},checkpoint,limits),/bounded/);
 assert.throws(()=>comparisonReceipt({...fix,latestRound:{id:'round',comparison:{...comparison,pairs:[...comparison.pairs,{personaId:'extra'}]}}},checkpoint,limits),/Unexpected/);
});
test('inventory comparison is idempotent after API normalization but rejects changed routes',()=>{
 const saved={...inventory,source:{...inventory.source,observedAt:null},screens:inventory.screens.map(({id,name,routePattern,origin,device,environmentIds,flowIds,criteria})=>({id,name,routePattern,origin,state:null,device,environmentIds,flowIds,criteria}))};
 assert.ok(sameInventoryDeclaration(saved,fieldnoteInventory('project','env')));
 saved.screens[0].origin='https://other.example';assert.equal(sameInventoryDeclaration(saved,inventory),false);
});
test('returning launch requires actual first success and eligible source-grounded persona memory',()=>{
 const {first,entry,before}=fixture();assert.equal(eligibleFirstMemory(first,before,'persona',inventory).length,1);
 for(const patch of [{status:'failed'},{finding:{outcome:'inconclusive'}},{integrityStatus:'invalidated'}])assert.equal(eligibleFirstMemory({...first,...patch},before,'persona',inventory).length,0);
 for(const patch of [{audience:'evaluator'},{confidence:.4},{conflicts:[{status:'unresolved'}]},{sources:[{runId:'other',eventIndex:4,screenshot:'/runs/first/4.png'}]},{applicability:{...entry.applicability,buildId:'different'}},{applicability:{...entry.applicability,personaId:'other'}},{scope:{screenPatterns:[],flows:['unrelated-flow']}}])assert.equal(eligibleFirstMemory(first,{...before,publications:[{...before.publications[0],entry:{...entry,...patch}}]},'persona',inventory).length,0);
 assert.equal(eligibleFirstMemory(first,before,'persona',{...inventory,versionId:null}).length,0);
});
test('memory acceptance refuses empty, foreign or ungrounded access receipts',()=>{
 const {first,before,returning,after}=fixture();assert.ok(Object.values(memoryReceiptChecks(first,returning,before,after,'persona')).every(Boolean));
 assert.equal(memoryReceiptChecks(first,returning,before,{...after,snapshot:{id:'snapshot-returning',roles:{persona:[]}}},'persona').returningOwnPersona,false);
 assert.equal(memoryReceiptChecks(first,returning,before,{...after,accessLog:[{...after.accessLog[0],snapshotId:'other'}]},'persona').returningScreenAccess,false);
 assert.equal(memoryReceiptChecks(first,returning,before,{...after,accessLog:[{...after.accessLog[0],eventIndex:999}]},'persona').returningScreenAccess,false);
 assert.equal(memoryReceiptChecks(first,returning,{...before,snapshot:null},after,'persona').firstTimeNoPersonaMemory,false);
});
test('recording checks exact journey identity and WebM range instead of a truthy URL',async()=>{
 const run={id:'recorded',video:'/runs/recorded/journey.webm'},bytes=Buffer.alloc(1024);Buffer.from([0x1a,0x45,0xdf,0xa3]).copy(bytes);
 let calls=0;const fetcher=async(url,options)=>{calls++;assert.equal(url,'http://fixture/runs/recorded/journey.webm');assert.equal(options.headers.range,'bytes=0-1023');return new Response(bytes,{status:206,headers:{'content-type':'video/webm','content-range':'bytes 0-1023/123456'}});};
 assert.equal((await verifyRecording(run,'http://fixture',fetcher)).valid,true);
 assert.equal((await verifyRecording({...run,video:'/runs/other/journey.webm'},'http://fixture',fetcher)).valid,false);assert.equal(calls,1);
 assert.equal((await verifyRecording(run,'http://fixture',async()=>new Response('<html>fallback</html>',{status:200,headers:{'content-type':'text/html'}}))).valid,false);
});
