// Bounded, resumable acceptance against owned local targets. Never approves or publishes.
import {mkdir,readFile,writeFile,appendFile,rename} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ACTIVE,completed,outcome,assertSessionEnvelope,comparisonReceipt,fieldnoteInventory,sameInventoryDeclaration,eligibleFirstMemory,memoryReceiptChecks,verifyRecording} from './acceptance-journeys-guards.mjs';

const root=resolve(import.meta.dirname,'..'),out=join(root,'outputs/live-scope-acceptance'),origin='http://127.0.0.1:4319';
const fixId='54bdc5d4-5869-4704-9380-86ea0fad58e3',projectId='fieldnote-acceptance-2026-11-01';
const limits={maxSteps:12,maxTokens:150000,maxDurationMs:300000};
await mkdir(out,{recursive:true});
let state;
try{state=JSON.parse(await readFile(join(out,'state.json'),'utf8'));}
catch(error){if(error.code!=='ENOENT')throw error;state={createdAt:new Date().toISOString(),maxNewSessions:6,limits,firstKey:randomUUID(),returningKey:randomUUID()};}
async function save(event){state.updatedAt=new Date().toISOString();await appendFile(join(out,'events.jsonl'),JSON.stringify({at:state.updatedAt,event,state})+'\n');await writeFile(join(out,'state.tmp'),JSON.stringify(state,null,2));await rename(join(out,'state.tmp'),join(out,'state.json'));}
async function request(path,method='GET',body){const response=await fetch(origin+path,{method,headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});const result=await response.json();if(!response.ok){const error=Error(result.error||`HTTP ${response.status}`);error.status=response.status;error.code=result.code;error.runIds=result.runIds;throw error;}return result;}
const ws=(path,method,body)=>request('/api/workspace'+path,method,body),sleep=ms=>new Promise(done=>setTimeout(done,ms));
async function until(read,done,name,timeout=1500000){const started=Date.now();while(Date.now()-started<timeout){const value=await read();if(done(value))return value;await sleep(2000);}throw Error(`${name} did not finish within the monitoring window. No retry was launched.`);}
const summarized=run=>({id:run.id,status:run.status,outcome:outcome(run),tokens:run.totalTokens??run.usage?.reduce((n,item)=>n+(item.total_tokens||0),0),video:run.video,replay:run.replay,replayMetadata:run.replayMetadata,experienceSignals:run.experience?.length||0,evidenceFrames:run.events?.filter(e=>e.type==='screenshot').length||0,error:run.error||null,memorySnapshotId:run.memorySnapshotId,memoryEntries:run.memorySnapshot?.roles?.persona?.length||0,policy:run.executionPolicy});
const knownRunIds=()=>[...new Set([...(state.littleSteps?.runIds||[]),state.firstRunId,state.returningRunId].filter(Boolean))];
async function preservePartial(error){
  const sessions=[],unavailable=[];
  for(const id of knownRunIds())try{sessions.push(summarized(await ws(`/runs/${id}`)));}catch(readError){unavailable.push({id,error:readError.message});}
  const memory={};for(const [label,id]of [['first',state.firstRunId],['returning',state.returningRunId]])if(id)try{memory[label]=await ws(`/runs/${id}/memory?projectId=${projectId}`);}catch(readError){memory[label]={error:readError.message};}
  const report={timestamp:new Date().toISOString(),kind:'partial_real_meta_acceptance',error:error.message,sessions,unavailable,memory,limits,littleSteps:state.littleSteps||null,sessionLimit:6,knownSessionCount:sessions.length,reservedSessionCount:assertSessionEnvelope(state),complete:false,limitations:['Partial receipts are retained. Missing or inconclusive evidence is not a passed acceptance.','No automatic paid retry was launched.']};
  await writeFile(join(out,'partial-model-report.json'),JSON.stringify(report,null,2));
  state.partialReport=join(out,'partial-model-report.json');
}
async function rememberComparison(fix){
  const comparison=comparisonReceipt(fix,state.littleSteps,limits);
  if(comparison){const next={comparisonId:comparison.id,status:comparison.status,runIds:comparison.pairs.flatMap(pair=>[pair.beforeRunId,pair.afterRunId]).filter(Boolean)};
    if(Object.entries(next).some(([key,value])=>JSON.stringify(state.littleSteps[key])!==JSON.stringify(value))){Object.assign(state.littleSteps,next);await save('little_steps_comparison_receipt');}}
  return comparison;
}

try{
  assertSessionEnvelope(state);
  const health=await request('/api/health');
  if(!health.modelConfigured){
    state.status='blocked_secure_key';state.blocker='Unlock 1Password, approve the existing Environment access and restart the secure launcher. No model requests were made by this acceptance attempt.';
    await save('secure_key_unavailable');console.log(JSON.stringify({status:state.status,newSessions:0,message:state.blocker}));process.exitCode=3;
  }else{
    state.status='running';delete state.blocker;delete state.error;await save('secure_health_ready');
    let current=await ws(`/fixes/${fixId}`);
    if(!state.littleSteps){
      if(current.approval)throw Error('This candidate has an approval now. Its approval will not be cleared by acceptance.');
      if(ACTIVE.has(current.status))throw Error('Existing fix work is active. No duplicate acceptance was started.');
      const profiles=current.retestPlan?.map(profile=>profile.personaId);
      if(profiles?.length!==2||!profiles.includes('mother')||!profiles.includes('teacher'))throw Error('Acceptance requires exactly the mother and teacher retest profiles before reserving four sessions.');
      assertSessionEnvelope(state,4);
      state.littleSteps={priorComparisonId:current.latestRound.comparison?.id||null,roundId:current.latestRound.id,launchRequestedAt:new Date().toISOString(),requestStatus:'dispatching',runIds:[]};
      await save('little_steps_launch_intent');
      try{current=await ws(`/fixes/${fixId}/retest`,'POST',{limits});state.littleSteps.requestStatus='acknowledged';state.littleSteps.acknowledgedAt=new Date().toISOString();await save('little_steps_launch_acknowledged');}
      catch(error){state.littleSteps.requestStatus=error.status&&error.status<500?'rejected':'uncertain';state.littleSteps.requestError=error.message;await save('little_steps_launch_unresolved');throw error;}
    }
    let receipt=await rememberComparison(current);
    if(!receipt&&!ACTIVE.has(current.status))throw Error('No new comparison was recorded for the saved retest intent. It may have been rejected or never submitted; acceptance will not automatically resend a paid retest.');
    const fixed=await until(async()=>{const fix=await ws(`/fixes/${fixId}`);await rememberComparison(fix);return fix;},fix=>!ACTIVE.has(fix.status),'LittleSteps comparison');
    const comparison=await rememberComparison(fixed);
    if(!comparison)throw Error('The retest stopped before creating a new comparison receipt.');
    if(state.littleSteps.runIds.length!==4)throw Error('The comparison ended without all four paired session receipts.');
    await save('little_steps_recorded');

    const projects=await ws('/projects');
    if(!projects.projects.some(project=>project.id===projectId))await ws('/projects','POST',{id:projectId,name:'Fieldnote',description:'Project notes and ideas, organized in one place.'});
    async function ensure(kind,key,definition){if(state[key])return ws(`/${kind}/${state[key]}?projectId=${projectId}`);const entity=await ws('/'+kind,'POST',{projectId,...definition});state[key]=entity.id;await save(key+'_created');return entity;}
    const environment=await ensure('environments','environmentId',{name:'Fieldnote · local isolated browser',url:'http://127.0.0.1:4388/',allowedOrigins:['http://127.0.0.1:4388'],repositoryPath:join(out,'fieldnote'),healthPath:'/',isolation:'stateless-demo',fixtureVersion:'fieldnote-v1',dataPolicy:'Fictional notes in independent browser-session memory. No external accounts, messages or real customer data.',allowMutations:true,captureBodies:false,...limits});
    let persona=await ensure('personas','personaId',{name:'Alex · practical note taker',role:'client',mission:'Save a project note and find it in my notes.',context:'I am collecting a small idea for my balcony garden.',skills:'Comfortable with ordinary browser forms.',initialKnowledge:'This is a note-taking web app. I have not used it before.',resources:'A laptop browser and a few minutes.',constraints:'Use only fictional note content, no accounts or external services.',successCriteria:'The saved title, category and text are visible in my notes.',stopCriteria:'Stop if there is no visible way to save or find the note after a reasonable check.',continuity:'first-time',viewport:{width:1280,height:800}});
    const charter=await ensure('charters','charterId',{name:'Save a useful project note',mission:'Save a note titled Garden plan, in the Home category, with text Pick three native plants for the balcony. Confirm the saved title, category and text are visible in Notes.',scope:'The provided local Fieldnote website only.',screens:['/','/new','/notes'],flows:['Create and find a note'],startingState:'A fresh anonymous browser session with no existing notes.',successCriteria:'The Garden plan note is visibly saved with Home category and the requested text.',stopCriteria:'Goal visibly reached, a genuine obstacle observed, or insufficient evidence.',expectedBehaviorSources:'The visible product promise to save categorized project notes and this charter.',defaultEnvironmentId:environment.id,compatibleEnvironmentIds:[environment.id],personaIds:[persona.id],memoryPolicy:'relevant',allowMutations:true,captureBodies:false,...limits});
    const definition=fieldnoteInventory(projectId,environment.id);
    let {inventory}=await ws(`/insights/inventory?projectId=${projectId}`);
    if(!inventory){if(state.firstRunId||state.firstLaunchIntent)throw Error('The first journey began without the declared inventory. Its frozen context will not be changed or rerun automatically.');inventory=await ws('/insights/inventory','POST',{...definition,expectedVersion:0});}
    if(!sameInventoryDeclaration(inventory,definition))throw Error('The Fieldnote inventory differs from the acceptance route declaration; no overwrite or new journey was launched.');
    if(state.inventoryVersionId&&state.inventoryVersionId!==inventory.versionId)throw Error('The Fieldnote inventory changed after acceptance setup.');
    state.inventoryVersion=inventory.version;state.inventoryVersionId=inventory.versionId;await save('fieldnote_inventory_pinned');

    async function journey(key,name,idempotencyKey){
      const intentKey=key==='firstRunId'?'firstLaunchIntent':'returningLaunchIntent';
      if(!state[key]){
        if(!state[intentKey]){assertSessionEnvelope(state,1);state[intentKey]={at:new Date().toISOString(),idempotencyKey,personaVersion:persona.version,charterVersion:charter.version,environmentVersion:environment.version};await save(key+'_intent');}
        const launched=await ws('/runs','POST',{projectId,personaIds:[persona.id],charterId:charter.id,environmentId:environment.id,name,idempotencyKey});
        if(launched.runs.length!==1)throw Error('Expected one atomic acceptance journey.');
        state[key]=launched.runs[0].id;await save(key+'_launched');
      }
      return until(()=>ws(`/runs/${state[key]}`),run=>!ACTIVE.has(run.status),name,450000);
    }
    const first=await journey('firstRunId','Fieldnote · first-time memory acceptance',state.firstKey);
    await save('fieldnote_first_recorded');
    const beforeKnowledge=await ws(`/runs/${first.id}/memory?projectId=${projectId}`);
    const eligible=eligibleFirstMemory(first,beforeKnowledge,persona.id,inventory);
    state.firstMemoryGate={runId:first.id,finished:completed(first),outcome:outcome(first),eligibleEntryVersions:eligible.map(entry=>({id:entry.id,version:entry.version})),publicationFailures:beforeKnowledge.publicationFailures||[]};
    await save('fieldnote_first_memory_checked');
    if(!state.returningRunId&&(!completed(first)||outcome(first)!=='goal_reached'||!eligible.length))throw Error('The first Fieldnote journey did not finish with a supported goal and eligible own-persona memory. Receipts are preserved; the returning session was not spent.');
    if(!state.returningRunId&&persona.continuity!=='returning'){persona=await ws(`/personas/${persona.id}`,'PATCH',{projectId,expectedVersion:persona.version,continuity:'returning',initialKnowledge:'This is a note-taking web app. Prior workflow knowledge is supplied only through the permitted sourced-memory snapshot.'});await save('returning_persona_version_created');}
    const returning=await journey('returningRunId','Fieldnote · returning memory acceptance',state.returningKey);
    const afterKnowledge=await ws(`/runs/${returning.id}/memory?projectId=${projectId}`);
    const runs=await Promise.all(knownRunIds().map(id=>ws(`/runs/${id}`)));
    const expectedOutcomes=comparison.pairs.map(pair=>({personaId:pair.personaId,before:pair.personaId==='mother'?'obstacle_observed':'goal_reached',after:'goal_reached',beforeActual:outcome(runs.find(run=>run.id===pair.beforeRunId)),afterActual:outcome(runs.find(run=>run.id===pair.afterRunId))}));
    const recordingReceipts=await Promise.all(runs.map(run=>verifyRecording(run,origin)));
    const report={expectedOutcomes,timestamp:new Date().toISOString(),kind:'real_meta_acceptance',sessions:runs.map(summarized),newSessionCount:runs.length,limits,comparisonId:comparison.id,comparisonStatus:comparison.status,controlOverrides:comparison.controlOverrides,recordingReceipts,memory:{first:beforeKnowledge,returning:afterKnowledge},checks:{sixSessions:runs.length===6,completedSessions:runs.every(completed),comparisonCompleted:comparison.status==='completed',expectedLittleStepsOutcomes:expectedOutcomes.length===2&&expectedOutcomes.every(pair=>pair.before===pair.beforeActual&&pair.after===pair.afterActual),fieldnoteGoalsReached:outcome(first)==='goal_reached'&&outcome(returning)==='goal_reached',recordings:recordingReceipts.every(receipt=>receipt.valid),...memoryReceiptChecks(first,returning,beforeKnowledge,afterKnowledge,persona.id),noApproval:fixed.approval===null},limitations:['These are bounded synthetic executions, not human satisfaction or business uplift.','Source fingerprints do not independently verify hosted deployment identity.','Recording checks verify journey-specific WebM byte-range receipts, not every decoded frame.','No candidate or PR was approved or published.']};
    await writeFile(join(out,'real-model-report.json'),JSON.stringify(report,null,2));
    state.status=Object.values(report.checks).every(Boolean)?'recorded_acceptance_passed':'recorded_needs_review';await save('acceptance_finished');
    console.log(JSON.stringify({status:state.status,newSessions:runs.length,checks:report.checks,report:join(out,'real-model-report.json')}));
    if(state.status!=='recorded_acceptance_passed')process.exitCode=1;
  }
}catch(error){
  state.status='stopped';state.error=error.message;
  try{await preservePartial(error);}catch(reportError){state.partialReportError=reportError.message;}
  await save('acceptance_stopped');console.error(error.message);process.exitCode=1;
}
