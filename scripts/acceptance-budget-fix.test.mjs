// Isolated dispatch tests: every API response, model receipt and recording is synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {acceptanceBudgetFix,ACCEPTANCE_CONFIGS,LIMITS,runSummary,supportedGoal} from './acceptance-budget-fix.mjs';
import {fieldnoteInventory,buildIdentity} from './acceptance-journeys-guards.mjs';

const projectId='fieldnote-acceptance-2026-11-01',now='2026-11-01T12:00:00.000Z';
const copy=value=>structuredClone(value),sha=value=>createHash('sha256').update(value).digest('hex');
async function fixture(t,options={}) {
  const root=await mkdtemp(join(tmpdir(),'budget-fix-fixture-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const parent=join(root,'outputs/live-scope-acceptance');await mkdir(join(parent,'pre-release'),{recursive:true});
  const original={status:'stopped',limits:LIMITS,environmentId:'env',personaId:'persona',charterId:'charter',inventoryVersionId:'inventory-v1',firstRunId:'original-first',littleSteps:{roundId:'round',comparisonId:'original-comparison',runIds:['old-mother-before','old-mother-after','old-teacher-before','old-teacher-after']}};
  await writeFile(join(parent,'state.json'),JSON.stringify(original));await writeFile(join(parent,'partial-model-report.json'),'{"fixture":true}');await writeFile(join(parent,'pre-release/receipts.json'),'{}');
  for(const id of [original.firstRunId,...original.littleSteps.runIds]){await mkdir(join(root,'journey-engine/runs',id),{recursive:true});await writeFile(join(root,'journey-engine/runs',id,'run.json'),JSON.stringify({id,status:'incomplete'}));}
  if(options.completion) {
    await mkdir(join(parent,'budget-fix'),{recursive:true});
    await writeFile(join(parent,'budget-fix/state.json'),JSON.stringify({phase:'budget-estimator-correction',status:'stopped',limits:LIMITS,firstRunId:'budget-first',firstMemoryGate:{supportedGoal:false}}));
    await writeFile(join(parent,'budget-fix/partial-model-report.json'),'{"fixture":true}');await writeFile(join(parent,'budget-fix/audit-pairs.json'),'{"fixture":true}');
    await mkdir(join(root,'journey-engine/runs/budget-first'),{recursive:true});await writeFile(join(root,'journey-engine/runs/budget-first/run.json'),'{"status":"incomplete"}');
  }
  const selectedLimits=options.completion?ACCEPTANCE_CONFIGS['completion-budget'].limits:LIMITS;
  const originals=await readFile(join(parent,'state.json'),'utf8');
  const environment={id:'env',version:1,versionId:'env-v1',projectId,url:'http://127.0.0.1:4388/',isolation:'stateless-demo',allowMutations:true,captureBodies:false,...LIMITS};
  const charter={id:'charter',version:1,versionId:'charter-v1',projectId,memoryPolicy:'relevant',flows:['Create and find a note'],...LIMITS};
  let persona={id:'persona',version:1,versionId:'persona-v1',projectId,continuity:'first-time',initialKnowledge:'A note-taking app.',knowledge:'A note-taking app.'};
  const inventory={...fieldnoteInventory(projectId,'env'),version:1,versionId:'inventory-v1'};
  const runs=new Map(),launches=new Map(),calls=[];let nextRun=0,firstId,returningId,patches=0;
  let fix={approval:null,status:'awaiting_review',retestPlan:[{personaId:'mother'},{personaId:'teacher'}],latestRound:{id:'round',candidateHash:'candidate',comparison:{id:'original-comparison',status:'inconclusive'}}};
  function run(id,selectedPersona=persona,status='finished',result='goal_reached') {
    const entry={id,projectId,personaId:selectedPersona.id,charterId:charter.id,environmentId:environment.id,environmentVersion:environment.version,createdAt:now,status,integrityStatus:'verified',model:'muse-wonder-1.0',personaSnapshot:copy(selectedPersona),personaVersionId:selectedPersona.versionId,charterSnapshot:copy(charter),charterVersionId:charter.versionId,environmentSnapshot:copy(environment),environmentVersionId:environment.versionId,executionPolicy:{...selectedLimits,allowMutations:true,captureBodies:false},capturePolicy:{bodies:false},viewport:{width:1280,height:800},scenarioId:'fixture',productFingerprint:{'index.html':'fixture-only'},usage:[{total_tokens:100,input_tokens:80,output_tokens:20}],modelRequests:[{id:'fixture-response',usage:{total_tokens:100,input_tokens:80,output_tokens:20},budget:{estimateMethod:'receipt_prefix',inputEstimate:90,priorInputTokens:60}}],events:[{type:'screenshot',index:4,url:'http://127.0.0.1:4388/notes',screenshot:`/runs/${id}/screen-004.png`}],video:`/runs/${id}/journey.webm`,replay:`/runs/${id}/replay.webm`,finding:{outcome:result,evidence_indices:[4]}};
    if(status==='incomplete'){entry.finding=null;entry.error='Fixture budget stop.';}runs.set(id,entry);return entry;
  }
  function memory() {
    const first=runs.get(firstId),entry={id:'own-memory',version:1,projectId,audience:'persona',status:'published',confidence:.9,confidenceBasis:'Fixture source screenshot.',scope:{screenPatterns:['/notes'],flows:[]},sources:[{runId:firstId,eventIndex:4,screenshot:`/runs/${firstId}/screen-004.png`}],applicability:{personaId:'persona',environmentId:'env',environmentVersion:environment.version,buildId:buildIdentity(first)}};
    return entry;
  }
  const request=async(path,method='GET',body)=>{
    calls.push({path,method,body:copy(body)});
    if(path==='/api/health')return {modelConfigured:true};
    const url=new URL(path,'http://fixture'),p=url.pathname.replace('/api/workspace','');
    if(p==='/projects')return {projects:[{id:projectId}]};
    if(p==='/environments/env'||p==='/charters/charter') {
      const entity=p==='/environments/env'?environment:charter;
      if(method==='PATCH') {
        assert.equal(body.expectedVersion,entity.version);assert.deepEqual(Object.keys(body).sort(),['expectedVersion','maxTokens','projectId']);
        Object.assign(entity,{version:entity.version+1,versionId:entity.id+'-v2',maxTokens:body.maxTokens});
        if(options.uncertainEnvironment&&p==='/environments/env')throw Error('Fixture lost environment version response.');
      }
      return copy(entity);
    }
    if(p==='/personas/persona') {
      if(method==='PATCH') {
        patches++;assert.equal(body.expectedVersion,persona.version);persona={...persona,continuity:body.continuity,initialKnowledge:body.initialKnowledge,knowledge:body.initialKnowledge,version:persona.version+1,versionId:'persona-v2'};
        if(options.uncertainPatch&&patches===1)throw Error('Fixture lost PATCH response.');
      }
      return copy(persona);
    }
    if(p==='/insights/inventory')return {inventory:copy(options.changedInventory?{...inventory,versionId:'other'}:inventory)};
    if(p==='/runs'&&method==='POST') {
      const digest=sha(JSON.stringify({projectId:body.projectId,charterId:body.charterId,personaIds:body.personaIds,environmentId:body.environmentId,name:body.name}));
      assert.equal(launches.has(body.idempotencyKey),false,'a dispatched key must never be sent again');
      const id=`phase-two-${++nextRun}`;if(!firstId)firstId=id;else returningId=id;
      const current=run(id,persona,id===firstId&&options.firstIncomplete?'incomplete':'finished');
      launches.set(body.idempotencyKey,{digest,runIds:[id],state:'completed'});
      if(options.uncertainLaunch&&nextRun===1)throw Error('Fixture lost POST response.');
      return {runs:[copy(current)]};
    }
    const match=p.match(/^\/runs\/([^/]+)(\/memory)?$/);
    if(match) {
      if(!match[2])return copy(runs.get(match[1]));
      const entry=memory();
      if(match[1]===firstId)return {snapshot:{id:'first-snapshot',policy:{continuity:'first-time'},roles:{persona:[]}},accessLog:[],publications:options.noMemory?[]:[{status:'published',entryId:entry.id,entryVersion:1,entry}]};
      return {snapshot:{id:'returning-snapshot',policy:{continuity:'returning'},roles:{persona:[entry]}},accessLog:options.noAccess?[]:[{audience:'persona',runId:returningId,snapshotId:'returning-snapshot',entryIds:[entry.id],eventIndex:4}]};
    }
    if(p.startsWith('/fixes/')) {
      if(method==='POST') {
        assert.equal(firstId!==undefined&&returningId!==undefined,true);assert.deepEqual(body.limits,selectedLimits);
        const pairs=['mother','teacher'].map(personaId=>{const selected={...persona,id:personaId},beforeRunId=`${personaId}-new-before`,afterRunId=`${personaId}-new-after`;run(beforeRunId,selected,'finished',personaId==='mother'?'obstacle_observed':'goal_reached');run(afterRunId,selected);return {personaId,beforeRunId,afterRunId};});
        fix={...fix,latestRound:{...fix.latestRound,comparison:{id:'new-comparison',status:'completed',createdAt:now,controlOverrides:{limits:selectedLimits},pairs}}};
      }
      return copy(fix);
    }
    throw Error(`Unexpected fixture request ${method} ${path}`);
  };
  const bytes=Buffer.alloc(1024);Buffer.from([0x1a,0x45,0xdf,0xa3]).copy(bytes);
  const invoke=()=>acceptanceBudgetFix({root,configuration:options.completion?'completion-budget':'budget-fix',request,fetcher:async()=>new Response(bytes,{status:206,headers:{'content-type':'video/webm','content-range':'bytes 0-1023/2048'}}),lookupLaunch:async key=>copy(launches.get(key)),now:()=>now,sleep:async()=>{throw Error('Fixture should already be terminal.');}});
  return {root,parent,calls,invoke,patches:()=>patches,state:()=>readFile(join(parent,options.completion?'completion-budget':'budget-fix','state.json'),'utf8').then(JSON.parse),assertOriginal:async()=>assert.equal(await readFile(join(parent,'state.json'),'utf8'),originals)};
}

test('unknown usage remains null and budget methods/drift are retained',()=>{
  assert.equal(runSummary({id:'x',totalTokens:0}).tokens,null);assert.equal(runSummary({id:'x',usage:[]}).tokens,null);
  assert.equal(runSummary({id:'x',usage:[{total_tokens:100},{}]}).tokens,null);
  const summary=runSummary({id:'x',usage:[{total_tokens:100}],modelRequests:[{id:'r',usage:{total_tokens:100},budget:{estimateMethod:'receipt_prefix',inputEstimate:99}}],events:[{index:4,type:'budget_estimate_drift',budget:{actualInputTokens:100}}]});
  assert.equal(summary.tokens,100);assert.deepEqual(summary.estimateMethods,['receipt_prefix']);assert.equal(summary.estimateDrift.length,1);
  assert.equal(supportedGoal({status:'finished',finding:{outcome:'goal_reached',evidence_indices:[4]},events:[]}),false);
});
test('the six-session phase gates memory before pairs and never relaunches completed state',async t=>{
  const f=await fixture(t),result=await f.invoke();assert.equal(result.status,'recorded_acceptance_passed');
  const writes=f.calls.filter(call=>call.method!=='GET');assert.deepEqual(writes.map(call=>call.method+' '+call.path),['POST /api/workspace/runs','PATCH /api/workspace/personas/persona','POST /api/workspace/runs','POST /api/workspace/fixes/54bdc5d4-5869-4704-9380-86ea0fad58e3/retest']);
  assert.equal(f.patches(),1);const state=await f.state();assert.equal(state.littleSteps.runIds.length,4);assert.notEqual(state.firstKey,state.returningKey);await f.assertOriginal();
  const count=f.calls.length;assert.equal((await f.invoke()).resumedWithoutLaunch,true);assert.equal(f.calls.length,count);
});
test('incomplete first journey, missing memory or missing returning access stop before paired retest',async t=>{
  for(const mode of ['firstIncomplete','noMemory','noAccess'])await t.test(mode,async t=>{
    const f=await fixture(t,{[mode]:true});assert.equal((await f.invoke()).status,'stopped');
    assert.equal(f.calls.filter(call=>call.method==='POST'&&call.path==='/api/workspace/runs').length,mode==='noAccess'?2:1);
    assert.equal(f.calls.some(call=>call.method==='POST'&&call.path.includes('/fixes/')),false);
    const count=f.calls.length;await f.invoke();assert.equal(f.calls.length,count);await f.assertOriginal();
  });
});
test('uncertain journey delivery reconciles read-only with the existing key, without another POST',async t=>{
  const f=await fixture(t,{uncertainLaunch:true});assert.equal((await f.invoke()).status,'needs_reconciliation');
  const firstKey=(await f.state()).firstKey;assert.equal((await f.invoke()).status,'recorded_acceptance_passed');
  assert.equal(f.calls.filter(call=>call.method==='POST'&&call.body?.idempotencyKey===firstKey).length,1);await f.assertOriginal();
});
test('uncertain returning version is reconciled exactly without a second PATCH',async t=>{
  const f=await fixture(t,{uncertainPatch:true});assert.equal((await f.invoke()).status,'needs_reconciliation');
  assert.equal((await f.invoke()).status,'recorded_acceptance_passed');assert.equal(f.patches(),1);await f.assertOriginal();
});
test('changed inventory stops without any mutation',async t=>{
  const f=await fixture(t,{changedInventory:true});assert.equal((await f.invoke()).status,'stopped');assert.equal(f.calls.some(call=>call.method!=='GET'),false);
});
test('explicit completion configuration versions only tokens once, reconciles lost acknowledgement, and preserves prior phases',async t=>{
  const f=await fixture(t,{completion:true,uncertainEnvironment:true});const prior=await readFile(join(f.parent,'budget-fix/state.json'),'utf8');
  assert.equal((await f.invoke()).status,'needs_reconciliation');assert.equal(f.calls.some(call=>call.method==='POST'),false);
  const result=await f.invoke();assert.equal(result.status,'recorded_acceptance_passed');
  for(const path of ['/api/workspace/environments/env','/api/workspace/charters/charter']) {
    const writes=f.calls.filter(call=>call.path===path&&call.method==='PATCH');assert.equal(writes.length,1);assert.deepEqual(writes[0].body,{projectId,expectedVersion:1,maxTokens:250000});
  }
  const state=await f.state();assert.deepEqual(state.limits,{maxSteps:12,maxTokens:250000,maxDurationMs:300000});assert.equal(state.pins.environment.version,2);assert.equal(state.pins.charter.version,2);assert.equal(state.returningPersona.knowledge,state.returningPersona.initialKnowledge);
  assert.deepEqual(f.calls.filter(call=>call.method==='POST'&&call.path==='/api/workspace/runs').map(call=>call.body.name),['Fieldnote · first visit','Fieldnote · returning visit']);
  assert.equal(await readFile(join(f.parent,'budget-fix/state.json'),'utf8'),prior);await f.assertOriginal();
});
test('real isolated store normalization matches the expected knowledge alias and token-only revisions',async t=>{
  const {createWorkspaceStore}=await import('../journey-engine/workspace-store.mjs');
  const root=await mkdtemp(join(tmpdir(),'completion-controls-fixture-')),store=createWorkspaceStore({root:join(root,'state'),runsDir:join(root,'runs')});
  t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});
  const clean=entity=>Object.fromEntries(Object.entries(entity).filter(([key])=>!['version','versionId','createdAt','updatedAt','versionCreatedAt','lastCheck'].includes(key)));
  const persona=store.saveEntity('persona',{name:'Fixture knowledge aliases',initialKnowledge:'Before',continuity:'first-time'});
  const returning=store.saveEntity('persona',{expectedVersion:persona.version,continuity:'returning',initialKnowledge:'After'},persona.id);
  assert.deepEqual(clean(returning),clean({...persona,continuity:'returning',initialKnowledge:'After',knowledge:'After'}));
  for(const kind of ['environment','charter']) {
    const before=store.saveEntity(kind,{name:'Fixture token allowance',...(kind==='environment'?{url:'http://127.0.0.1:4388/'}:{}),...LIMITS});
    const after=store.saveEntity(kind,{expectedVersion:before.version,maxTokens:250000},before.id);
    assert.equal(after.version,before.version+1);assert.deepEqual(clean(after),clean({...before,maxTokens:250000}));
  }
});
