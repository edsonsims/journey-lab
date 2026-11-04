// Phase two is an explicitly launched acceptance after the estimator correction.
// It never retries a failed journey, replaces an uncertain dispatch, approves a fix,
// changes an undeclared limit, or edits the original acceptance receipts.
import {mkdir, readFile, writeFile, appendFile, rename} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
import {ACTIVE, completed, outcome, assertSessionEnvelope, comparisonReceipt, fieldnoteInventory, sameInventoryDeclaration, eligibleFirstMemory, memoryReceiptChecks, verifyRecording} from './acceptance-journeys-guards.mjs';

export const LIMITS = Object.freeze({maxSteps:12, maxTokens:150000, maxDurationMs:300000});
const ROOT = resolve(import.meta.dirname, '..');
const ORIGIN = 'http://127.0.0.1:4319';
const PROJECT = 'fieldnote-acceptance-2026-11-01';
const FIX = '54bdc5d4-5869-4704-9380-86ea0fad58e3';
const RATIONALE = 'Separate finite acceptance after correcting conservative repeated-history token admission using a verified provider input-token prefix. The original five incomplete attempts and their receipts remain preserved; action, token and duration caps are unchanged.';
export const ACCEPTANCE_CONFIGS = Object.freeze({
  'budget-fix':Object.freeze({directory:'budget-fix',phase:'budget-estimator-correction',limits:LIMITS,rationale:RATIONALE,versionCompletionBudget:false}),
  'completion-budget':Object.freeze({directory:'completion-budget',phase:'explicit-completion-budget-validation',limits:Object.freeze({...LIMITS,maxTokens:250000}),rationale:'Explicit new validation configuration: the previous session visibly saved its note at 140210 tokens, but a further finalization request could not fit its 150000-token cap. This phase selects 250000 tokens, retaining twelve actions and five minutes, so finalization has a reasonable allowance. This is a versioned test-configuration change, not a guaranteed outcome or a reinterpretation of the original incomplete sessions.',versionCompletionBudget:true}),
});
const sha = value => createHash('sha256').update(value).digest('hex');
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,stable(item)])) : value;
const equal = (a,b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const entityContent = entity => Object.fromEntries(Object.entries(entity).filter(([key])=>!['version','versionId','createdAt','updatedAt','versionCreatedAt','lastCheck'].includes(key)));
const readJson = async path => JSON.parse(await readFile(path,'utf8'));
const sleep = ms => new Promise(done=>setTimeout(done,ms));

export function supportedGoal(run) {
  const indices=run.finding?.evidence_indices;
  return completed(run) && outcome(run)==='goal_reached' && Array.isArray(indices) && indices.length>0 && indices.every(index=>(run.events||[]).some(event=>event.type==='screenshot' && event.index===index && event.screenshot===`/runs/${run.id}/screen-${String(index).padStart(3,'0')}.png`));
}

export function assertRunControls(run, pins, persona, intent, limits=LIMITS) {
  if(run.projectId!==PROJECT || run.personaId!==persona.id || run.charterId!==pins.charter.id || run.environmentId!==pins.environment.id) throw Error('The journey receipt belongs to different controls.');
  for(const [label,actual,expected] of [['persona',run.personaSnapshot,persona],['charter',run.charterSnapshot,pins.charter],['environment',run.environmentSnapshot,pins.environment]]) {
    if(!actual || actual.versionId!==expected.versionId || !equal(entityContent(actual),entityContent(expected))) throw Error(`The frozen ${label} snapshot differs from the launch checkpoint.`);
  }
  if(Object.entries(limits).some(([key,value])=>run.executionPolicy?.[key]!==value) || run.executionPolicy?.allowMutations!==true || run.executionPolicy?.captureBodies!==false) throw Error('The journey did not retain the exact finite execution policy.');
  if(run.createdAt && Date.parse(run.createdAt)<Date.parse(intent.at)) throw Error('The journey predates its phase-two launch intent.');
  if(run.model!=='muse-wonder-1.0') throw Error('The acceptance journey used an unexpected model.');
  return true;
}

export function runSummary(run, origin=ORIGIN) {
  const usage=run.usage,knownUsage=Array.isArray(usage)&&usage.length>0&&usage.every(item=>Number.isSafeInteger(item?.total_tokens)&&item.total_tokens>=0);
  const requests=run.modelRequests||[],usageComplete=knownUsage&&(!requests.length||requests.every(item=>Number.isSafeInteger(item.usage?.total_tokens)&&item.usage.total_tokens>=0));
  return {id:run.id,projectId:run.projectId,url:`${origin}/projects/${run.projectId}/runs/${run.id}`,status:run.status,outcome:outcome(run)||null,supportedGoal:supportedGoal(run),tokens:usageComplete?usage.reduce((n,item)=>n+item.total_tokens,0):null,usageComplete,model:run.model,modelRequests:requests.length,budgetReceipts:requests.map(item=>({id:item.id,usage:item.usage||null,budget:item.budget||null})),estimateMethods:[...new Set(requests.map(item=>item.budget?.estimateMethod).filter(Boolean))],estimateDrift:(run.events||[]).filter(event=>event.type==='budget_estimate_drift').map(event=>({index:event.index,at:event.at,budget:event.budget})),video:run.video?origin+run.video:null,replay:run.replay?origin+run.replay:null,replayMetadata:run.replayMetadata,experienceSignals:run.experience?.length||0,evidenceFrames:run.events?.filter(event=>event.type==='screenshot').length||0,error:run.error||null,memorySnapshotId:run.memorySnapshotId||null,personaVersionId:run.personaVersionId,charterVersionId:run.charterVersionId,environmentVersionId:run.environmentVersionId,policy:run.executionPolicy,sourceIdentity:run.sourceIdentity,productFingerprint:run.productFingerprint};
}

// An uncertain dispatch is reconciled using the existing durable launch receipt.
// This read-only lookup cannot create a journey, even if the prior POST never arrived.
async function readLaunchReceipt(root,key) {
  const {DatabaseSync}=await import('node:sqlite');
  const db=new DatabaseSync(join(root,'journey-engine/workspace-data/workspace.sqlite'),{readOnly:true});
  try { const row=db.prepare('SELECT digest,run_ids,state FROM launch_requests WHERE idempotency_key=?').get(key); return row?{digest:row.digest,runIds:JSON.parse(row.run_ids),state:row.state}:null; }
  finally { db.close(); }
}

export async function acceptanceBudgetFix(options={}) {
  const configuration=options.configuration||'budget-fix',config=ACCEPTANCE_CONFIGS[configuration];
  if(!config)throw Error('Choose one of the explicit acceptance configurations. Arbitrary limits are not supported.');
  const limits=config.limits,root=options.root||ROOT, origin=options.origin||ORIGIN, parent=join(root,'outputs/live-scope-acceptance'), out=join(parent,config.directory);
  const fetcher=options.fetcher||fetch, pause=options.sleep||sleep, clock=options.now||(()=>new Date().toISOString());
  const lookupLaunch=options.lookupLaunch||((key)=>readLaunchReceipt(root,key));
  const request=options.request||async function(path,method='GET',body) {
    const response=await fetcher(origin+path,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    const result=await response.json();
    if(!response.ok) {const error=Error(result.error||`HTTP ${response.status}`);Object.assign(error,{status:response.status,code:result.code,runIds:result.runIds});throw error;}
    return result;
  };
  const ws=(path,method,body)=>request('/api/workspace'+path,method,body);
  const runRead=id=>ws(`/runs/${id}`);
  await mkdir(out,{recursive:true});
  let state;
  try { state=await readJson(join(out,'state.json')); }
  catch(error) {if(error.code!=='ENOENT')throw error;}
  const save=async event=>{state.updatedAt=clock();await appendFile(join(out,'events.jsonl'),JSON.stringify({at:state.updatedAt,event,state})+'\n');await writeFile(join(out,'state.tmp'),JSON.stringify(state,null,2)+'\n');await rename(join(out,'state.tmp'),join(out,'state.json'));};
  const knownIds=()=>[...new Set([state.firstRunId,state.returningRunId,...(state.littleSteps?.runIds||[])].filter(Boolean))];
  const originalUnchanged=async()=>{
    const records=await Promise.all(state.original.files.map(async file=>({path:file.path,unchanged:sha(await readFile(join(root,file.path)))===file.sha256})));
    if(records.some(record=>!record.unchanged))throw Error('An original acceptance receipt changed. Phase two will not overwrite or reinterpret it.');
    return records;
  };
  const until=async(read,done,label,timeout)=>{const deadline=Date.now()+timeout;while(Date.now()<deadline){const value=await read();if(done(value))return value;await pause(2000);}throw Error(`${label} exceeded the monitoring window. Its receipt is retained; no retry was launched.`);};
  const record=async(kind,error=null,extra={})=>{
    const sessions=[],unavailable=[],recordingReceipts=[];
    for(const id of knownIds())try {const run=await runRead(id);sessions.push(runSummary(run,origin));recordingReceipts.push(await verifyRecording(run,origin,fetcher));} catch(readError) {unavailable.push({id,error:readError.message});}
    const report={timestamp:clock(),kind,configuration,rationale:config.rationale,complete:false,error:error?.message||null,sessionLimit:6,reservedSessionCount:assertSessionEnvelope(state),knownSessionCount:sessions.length,limits,controlVersionIntents:state.controlVersionIntents||{},controlVersions:state.controlVersions||{},original:state.original,sessions,unavailable,recordingReceipts,firstMemoryGate:state.firstMemoryGate||null,returningMemoryGate:state.returningMemoryGate||null,littleSteps:state.littleSteps||null,...extra,limitations:['Synthetic sessions are not measurements of real-human satisfaction or uplift.','Source fingerprints do not independently attest a deployed build.','Recording receipts check exact journey WebM range bytes, not every frame.','No automatic paid retry, fix approval, PR or publication is performed.']};
    const path=join(out,kind.startsWith('real_meta_')?'real-model-report.json':'partial-model-report.json');await writeFile(path,JSON.stringify(report,null,2)+'\n');state.report=path;return report;
  };
  try {
    if(!state) {
      const original=await readJson(join(parent,'state.json'));
      const ids=[original.firstRunId,...(original.littleSteps?.runIds||[])].filter(Boolean);
      if(original.status!=='stopped' || ids.length!==5 || original.returningRunId || !original.environmentId || !original.personaId || !original.charterId || !equal(original.limits,LIMITS)) throw Error('The original five-session checkpoint does not match this separate acceptance phase.');
      const files=['outputs/live-scope-acceptance/state.json','outputs/live-scope-acceptance/partial-model-report.json','outputs/live-scope-acceptance/pre-release/receipts.json',...ids.map(id=>`journey-engine/runs/${id}/run.json`)];
      let priorBudgetFix=null;
      if(config.versionCompletionBudget) {
        const prior=await readJson(join(parent,'budget-fix/state.json'));
        if(prior.phase!=='budget-estimator-correction'||prior.status!=='stopped'||!equal(prior.limits,LIMITS)||!prior.firstRunId||prior.returningRunId||prior.littleSteps||prior.firstMemoryGate?.supportedGoal!==false)throw Error('The preceding budget-fix checkpoint must be the preserved single incomplete first-session attempt.');
        priorBudgetFix={firstRunId:prior.firstRunId,status:prior.status,limits:prior.limits};
        files.push('outputs/live-scope-acceptance/budget-fix/state.json','outputs/live-scope-acceptance/budget-fix/partial-model-report.json','outputs/live-scope-acceptance/budget-fix/audit-pairs.json',`journey-engine/runs/${prior.firstRunId}/run.json`);
      }
      state={createdAt:clock(),phase:config.phase,configuration,rationale:config.rationale,status:'prepared',maxNewSessions:6,limits,firstKey:randomUUID(),returningKey:randomUUID(),projectId:PROJECT,environmentId:original.environmentId,personaId:original.personaId,charterId:original.charterId,inventoryVersionId:original.inventoryVersionId,original:{runIds:ids,firstRunId:original.firstRunId,comparisonId:original.littleSteps.comparisonId,roundId:original.littleSteps.roundId,priorBudgetFix,files:await Promise.all(files.map(async path=>({path,sha256:sha(await readFile(join(root,path)))})))}};
      await save('phase_two_created');
    }
    if(state.phase!==config.phase||!equal(state.limits,limits)||(state.configuration&&state.configuration!==configuration))throw Error('The saved acceptance controls were changed.');
    assertSessionEnvelope(state);await originalUnchanged();
    if(['stopped','recorded_acceptance_passed','recorded_needs_review'].includes(state.status))return {status:state.status,report:state.report,resumedWithoutLaunch:true};
    const health=await request('/api/health');
    if(!health.modelConfigured)throw Error('The existing secure Meta configuration is unavailable. No session will be launched.');
    const projects=await ws('/projects');if(!projects.projects.some(project=>project.id===PROJECT))throw Error('The existing Fieldnote acceptance project is missing. No replacement project will be created.');
    const loadEntity=(kind,id)=>ws(`/${kind}/${id}?projectId=${PROJECT}`);
    let [environment,charter,currentPersona,{inventory}]=await Promise.all([loadEntity('environments',state.environmentId),loadEntity('charters',state.charterId),loadEntity('personas',state.personaId),ws(`/insights/inventory?projectId=${PROJECT}`)]);
    if(!inventory || inventory.versionId!==state.inventoryVersionId || !sameInventoryDeclaration(inventory,fieldnoteInventory(PROJECT,state.environmentId)))throw Error('The original Fieldnote screen inventory is missing or changed. It will not be rewritten.');
    if(environment.url!=='http://127.0.0.1:4388/'||environment.isolation!=='stateless-demo'||environment.authStatePath||environment.storageStatePath||environment.allowMutations!==true||environment.captureBodies!==false||charter.memoryPolicy!=='relevant')throw Error('The existing Fieldnote isolation or memory policy changed.');
    async function versionCompletionBudget(kind,entity) {
      if(!config.versionCompletionBudget)return entity;
      state.controlVersionIntents||={};state.controlVersions||={};
      if(state.controlVersions[kind]) {
        if(!equal(entity,state.controlVersions[kind]))throw Error(`The recorded ${kind} completion-budget version changed.`);
        return entity;
      }
      const existing=state.controlVersionIntents[kind],changes={maxTokens:limits.maxTokens};
      if(existing) {
        if(entity.version!==existing.before.version+1||!equal(entityContent(entity),entityContent({...existing.before,...changes})))throw Error(`The ${kind} limit-version intent cannot be reconciled exactly. It will not be sent again.`);
        state.controlVersions[kind]=entity;existing.requestStatus='reconciled';await save(kind+'_completion_budget_reconciled');return entity;
      }
      if(entity.archived||Object.entries(LIMITS).some(([key,value])=>entity[key]!==value))throw Error(`The ${kind} no longer has the original 150000-token, twelve-action, five-minute controls.`);
      state.controlVersionIntents[kind]={at:clock(),before:entity,expectedVersion:entity.version,changes,requestStatus:'dispatching'};await save(kind+'_completion_budget_intent');
      let changed;
      try {changed=await ws(`/${kind==='environment'?'environments':'charters'}/${entity.id}`,'PATCH',{projectId:PROJECT,expectedVersion:entity.version,...changes});}
      catch(error) {Object.assign(state.controlVersionIntents[kind],{requestStatus:error.status&&error.status<500?'rejected':'uncertain',error:error.message});await save(kind+'_completion_budget_unresolved');throw error;}
      if(changed.version!==entity.version+1||!equal(entityContent(changed),entityContent({...entity,...changes})))throw Error(`The ${kind} version changed more than the explicitly selected completion token allowance.`);
      state.controlVersions[kind]=changed;state.controlVersionIntents[kind].requestStatus='acknowledged';await save(kind+'_completion_budget_acknowledged');return changed;
    }
    if(!state.pins&&(!currentPersona||currentPersona.archived||currentPersona.version!==1||currentPersona.continuity!=='first-time'))throw Error('The first persona must still be first-time version one before any control version changes.');
    environment=await versionCompletionBudget('environment',environment);
    charter=await versionCompletionBudget('charter',charter);
    for(const entity of [environment,charter])if(entity.archived||Object.entries(limits).some(([key,value])=>entity[key]!==value))throw Error('The existing environment or charter changed its declared finite controls.');
    if(!state.pins) {
      if(currentPersona.archived||currentPersona.version!==1||currentPersona.continuity!=='first-time')throw Error('The initial persona must still be the existing first-time version one. No rollback or replacement will be created.');
      state.pins={environment,charter,persona:currentPersona,inventory};await save('existing_controls_pinned');
    }
    for(const [kind,actual] of [['environment',environment],['charter',charter]])if(!equal(actual,state.pins[kind]))throw Error(`The pinned ${kind} changed. No version will be silently adopted.`);
    state.status='running';await save('phase_two_ready');

    async function journey(key,label,persona) {
      const intentKey=key==='firstRunId'?'firstLaunchIntent':'returningLaunchIntent',idempotencyKey=key==='firstRunId'?state.firstKey:state.returningKey;
      if(!state[key]) {
        if(state[intentKey]) {
          const intent=state[intentKey],receipt=await lookupLaunch(intent.idempotencyKey);
          if(!receipt || receipt.digest!==intent.digest || receipt.runIds?.length!==1 || receipt.state!=='completed')throw Error('An earlier journey dispatch has no unambiguous completed launch receipt. It will not be sent again.');
          state[key]=receipt.runIds[0];intent.requestStatus='reconciled';await save(key+'_reconciled_read_only');
        } else {
          const latest=await loadEntity('personas',persona.id);if(!equal(latest,persona))throw Error('The persona changed before dispatch. No different version will be launched.');
          assertSessionEnvelope(state,1);
          const body={projectId:PROJECT,personaIds:[persona.id],charterId:charter.id,environmentId:environment.id,name:config.versionCompletionBudget?label:`${label} · ${configuration} ${idempotencyKey}`,idempotencyKey};
          const digest=sha(JSON.stringify({projectId:body.projectId,charterId:body.charterId,personaIds:body.personaIds,environmentId:body.environmentId,name:body.name}));
          state[intentKey]={at:clock(),idempotencyKey,digest,body,personaVersionId:persona.versionId,requestStatus:'dispatching'};await save(key+'_intent');
          try {const launched=await ws('/runs','POST',body);if(launched.runs?.length!==1)throw Error('Expected exactly one atomic journey receipt.');state[key]=launched.runs[0].id;state[intentKey].requestStatus='acknowledged';await save(key+'_acknowledged');}
          catch(error) {state[intentKey].requestStatus=error.status&&error.status<500?'rejected':'uncertain';state[intentKey].error=error.message;await save(key+'_dispatch_unresolved');throw error;}
        }
      }
      const run=await until(()=>runRead(state[key]),run=>!ACTIVE.has(run.status),label,450000);
      assertRunControls(run,state.pins,persona,state[intentKey],limits);await save(key+'_finalized');return run;
    }

    const first=await journey('firstRunId',config.versionCompletionBudget?'Fieldnote · first visit':'Fieldnote · first-time acceptance',state.pins.persona);
    const beforeKnowledge=await ws(`/runs/${first.id}/memory?projectId=${PROJECT}`),eligible=eligibleFirstMemory(first,beforeKnowledge,state.personaId,inventory);
    const noFirstMemory=memoryReceiptChecks(first,{id:'not-launched',events:[]},beforeKnowledge,{},state.personaId).firstTimeNoPersonaMemory;
    state.firstMemoryGate={runId:first.id,supportedGoal:supportedGoal(first),outcome:outcome(first)||null,firstTimeNoPersonaMemory:noFirstMemory,eligibleEntryVersions:eligible.map(entry=>({id:entry.id,version:entry.version,sources:entry.sources})),publicationFailures:beforeKnowledge.publicationFailures||[]};await save('first_sourced_memory_checked');
    if(!supportedGoal(first)||!noFirstMemory||!eligible.length)throw Error('The first Fieldnote journey lacks a supported goal and eligible own-persona sourced memory. No returning or LittleSteps journey was launched.');

    let returningPersona=state.returningPersona;
    if(!returningPersona) {
      const changes={continuity:'returning',initialKnowledge:'This is a note-taking web app. Prior workflow knowledge is supplied only through the permitted sourced-memory snapshot.'};
      const canonicalChanges={...changes,knowledge:changes.initialKnowledge};
      const latest=await loadEntity('personas',state.personaId);
      if(state.returningVersionIntent) {
        if(latest.version!==state.pins.persona.version+1 || !equal(entityContent(latest),entityContent({...state.pins.persona,...canonicalChanges})))throw Error('The returning-persona version intent could not be reconciled exactly. No second version request will be made.');
        returningPersona=latest;
      } else {
        if(!equal(latest,state.pins.persona))throw Error('The first-time persona changed before its returning version.');
        state.returningVersionIntent={at:clock(),expectedVersion:latest.version,changes,requestStatus:'dispatching'};await save('returning_persona_version_intent');
        try {returningPersona=await ws(`/personas/${state.personaId}`,'PATCH',{projectId:PROJECT,expectedVersion:latest.version,...changes});state.returningVersionIntent.requestStatus='acknowledged';}
        catch(error) {state.returningVersionIntent.requestStatus=error.status&&error.status<500?'rejected':'uncertain';state.returningVersionIntent.error=error.message;await save('returning_persona_version_unresolved');throw error;}
        if(returningPersona.version!==latest.version+1 || !equal(entityContent(returningPersona),entityContent({...latest,...canonicalChanges})))throw Error('The returned persona version is not the exact requested continuity change.');
      }
      state.returningVersionIntent.requestStatus='recorded';state.returningPersona=returningPersona;await save('returning_persona_version_recorded');
    }
    const returning=await journey('returningRunId',config.versionCompletionBudget?'Fieldnote · returning visit':'Fieldnote · returning acceptance',returningPersona);
    const afterKnowledge=await ws(`/runs/${returning.id}/memory?projectId=${PROJECT}`),memoryChecks=memoryReceiptChecks(first,returning,beforeKnowledge,afterKnowledge,state.personaId);
    const eligibleKeys=new Set(eligible.map(entry=>`${entry.id}:${entry.version}`)),returnedEntries=afterKnowledge.snapshot?.roles?.persona||[];
    state.returningMemoryGate={runId:returning.id,supportedGoal:supportedGoal(returning),outcome:outcome(returning)||null,...memoryChecks,onlyEligibleFirstEntries:returnedEntries.length>0&&returnedEntries.every(entry=>eligibleKeys.has(`${entry.id}:${entry.version}`)),snapshotId:afterKnowledge.snapshot?.id||null,entryVersions:returnedEntries.map(entry=>({id:entry.id,version:entry.version})),accessLog:afterKnowledge.accessLog||[]};await save('returning_sourced_memory_checked');
    if(!supportedGoal(returning)||!Object.values(memoryChecks).every(Boolean)||!state.returningMemoryGate.onlyEligibleFirstEntries)throw Error('The returning journey did not reach its goal with eligible first-session memory and grounded screen access. The four LittleSteps sessions were not launched.');

    let fix=await ws(`/fixes/${FIX}`);
    if(fix.approval!==null || fix.latestRound?.id!==state.original.roundId)throw Error('The LittleSteps approval or round changed. No retest will be launched.');
    if(!state.littleSteps) {
      if(ACTIVE.has(fix.status))throw Error('LittleSteps already has active work. No duplicate retest will be launched.');
      if(fix.latestRound.comparison?.id!==state.original.comparisonId)throw Error('Another comparison replaced the original phase-one receipt.');
      const profiles=fix.retestPlan?.map(profile=>profile.personaId);
      if(profiles?.length!==2||!profiles.includes('mother')||!profiles.includes('teacher'))throw Error('The retest must contain exactly the mother and teacher.');
      assertSessionEnvelope(state,4);
      state.littleSteps={priorComparisonId:fix.latestRound.comparison.id,roundId:fix.latestRound.id,candidateHash:fix.latestRound.candidateHash,launchRequestedAt:clock(),requestStatus:'dispatching',runIds:[]};await save('little_steps_launch_intent');
      try {fix=await ws(`/fixes/${FIX}/retest`,'POST',{limits});state.littleSteps.requestStatus='acknowledged';state.littleSteps.acknowledgedAt=clock();await save('little_steps_acknowledged');}
      catch(error) {state.littleSteps.requestStatus=error.status&&error.status<500?'rejected':'uncertain';state.littleSteps.error=error.message;await save('little_steps_dispatch_unresolved');throw error;}
    }
    const remember=async value=>{if(value.latestRound?.candidateHash!==state.littleSteps.candidateHash||value.approval!==null)throw Error('The candidate or approval changed during retest.');const receipt=comparisonReceipt(value,state.littleSteps,limits);if(receipt){const next={comparisonId:receipt.id,status:receipt.status,runIds:receipt.pairs.flatMap(pair=>[pair.beforeRunId,pair.afterRunId]).filter(Boolean)};if(Object.entries(next).some(([key,value])=>!equal(state.littleSteps[key],value))){Object.assign(state.littleSteps,next);await save('little_steps_comparison_receipt');}}return receipt;};
    if(!await remember(fix)&&!ACTIVE.has(fix.status))throw Error('The saved retest dispatch has no new comparison. It will not be sent again.');
    fix=await until(async()=>{const current=await ws(`/fixes/${FIX}`);await remember(current);return current;},current=>!ACTIVE.has(current.status),'LittleSteps paired comparison',1500000);
    const comparison=await remember(fix);if(!comparison||state.littleSteps.runIds.length!==4)throw Error('The retest did not produce all four paired session receipts.');
    const runs=await Promise.all(knownIds().map(runRead));
    const expectedOutcomes=comparison.pairs.map(pair=>({personaId:pair.personaId,beforeExpected:pair.personaId==='mother'?'obstacle_observed':'goal_reached',afterExpected:'goal_reached',beforeActual:outcome(runs.find(run=>run.id===pair.beforeRunId))||null,afterActual:outcome(runs.find(run=>run.id===pair.afterRunId))||null}));
    const pairControls=comparison.pairs.map(pair=>{const before=runs.find(run=>run.id===pair.beforeRunId),after=runs.find(run=>run.id===pair.afterRunId);return {personaId:pair.personaId,equal:['personaSnapshot','personaVersionId','charterSnapshot','charterVersionId','model','viewport','executionPolicy','capturePolicy','scenarioId'].every(key=>equal(before[key],after[key])),limits:!!before.executionPolicy&&Object.entries(limits).every(([key,value])=>before.executionPolicy[key]===value)};});
    const preservation=await originalUnchanged();
    const report=await record(`real_meta_${configuration.replaceAll('-','_')}_acceptance`,null,{expectedOutcomes,pairControls,comparisonId:comparison.id,comparisonStatus:comparison.status,originalPreservation:preservation,memory:{first:beforeKnowledge,returning:afterKnowledge},checks:{sixSessions:runs.length===6,allCompleted:runs.every(completed),comparisonCompleted:comparison.status==='completed',expectedLittleStepsOutcomes:expectedOutcomes.length===2&&expectedOutcomes.every(pair=>pair.beforeActual===pair.beforeExpected&&pair.afterActual===pair.afterExpected),pairedControls:pairControls.every(pair=>pair.equal&&pair.limits),fieldnoteGoals:supportedGoal(first)&&supportedGoal(returning),...memoryChecks,onlyEligibleFirstEntries:state.returningMemoryGate.onlyEligibleFirstEntries,noApproval:fix.approval===null}});
    const finalFix=await ws(`/fixes/${FIX}`);
    report.checks.noApproval=finalFix.approval===null;
    report.checks.finalCandidateUnchanged=finalFix.latestRound?.id===state.littleSteps.roundId&&finalFix.latestRound?.candidateHash===state.littleSteps.candidateHash&&finalFix.latestRound?.comparison?.id===comparison.id;
    report.checks.recordings=report.recordingReceipts.length===6&&report.recordingReceipts.every(receipt=>receipt.valid);
    report.checks.providerReceiptPrefixObserved=report.sessions.some(session=>session.estimateMethods.includes('receipt_prefix'));
    report.checks.reportedUsageWithinCaps=report.sessions.every(session=>session.usageComplete&&session.tokens<=limits.maxTokens);
    report.complete=Object.values(report.checks).every(Boolean);
    await writeFile(state.report,JSON.stringify(report,null,2)+'\n');state.status=report.complete?'recorded_acceptance_passed':'recorded_needs_review';await save('phase_two_finished');return {status:state.status,report:state.report,checks:report.checks};
  } catch(error) {
    if(!state)throw error;
    // A caller can explicitly resume unresolved delivery for read-only reconciliation.
    // Rejected and completed-but-inconclusive attempts are terminal for this phase.
    const uncertain=[state.firstLaunchIntent,state.returningLaunchIntent,state.returningVersionIntent,state.littleSteps,...Object.values(state.controlVersionIntents||{})].some(intent=>intent?.requestStatus==='uncertain');
    state.status=uncertain?'needs_reconciliation':'stopped';state.error=error.message;
    try {await record(`partial_real_meta_${configuration.replaceAll('-','_')}_acceptance`,error);}catch(reportError){state.partialReportError=reportError.message;}
    await save('phase_two_stopped');return {status:state.status,error:error.message,report:state.report};
  }
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  if(!process.argv.includes('--execute'))console.log('Prepared only. After verifying the estimator correction, explicitly run: node scripts/acceptance-budget-fix.mjs --execute');
  else {const result=await acceptanceBudgetFix();console.log(JSON.stringify(result));if(result.status!=='recorded_acceptance_passed')process.exitCode=1;}
}
