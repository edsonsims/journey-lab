import {randomUUID} from 'node:crypto';
import {WorkspaceError} from './workspace-store.mjs';
import {sourceFingerprint} from './workspace-execution.mjs';
import {effectiveExecutionPolicy} from './library-context.mjs';
import {boundModelRequest,usageTotal} from './model-budget.mjs';
import {copyBrowserConfiguration} from './browser-device.mjs';

const MODEL='muse-wonder-1.0';
const fields=['context','skills','constraints','expectations','priorities','decision'];
const object=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const fail=(message,code,status=409)=>{throw new WorkspaceError(message,status,code);};
const clone=value=>structuredClone(value);

export function validateCalibrationAdjustment(value,persona){
  if(!object(value)||value.kind!=='persona'||Object.keys(value).some(key=>!['kind','changes'].includes(key))||!object(value.changes)||!Object.keys(value.changes).length)fail('Meta did not return a usable persona adjustment.','CALIBRATION_INVALID_ADJUSTMENT',502);
  const changes={};
  for(const [key,text]of Object.entries(value.changes)){
    if(!fields.includes(key)||typeof text!=='string'||text.length>6000)fail('The adjustment contains unsupported fields.','CALIBRATION_INVALID_ADJUSTMENT',502);
    if(text.trim()&&text.trim()!==persona?.[key])changes[key]=text.trim();
  }
  if(!Object.keys(changes).length)fail('The proposed adjustment did not change the declared variable.','CALIBRATION_EMPTY_ADJUSTMENT',502);
  return {kind:'persona',changes};
}

function limits(study,remainingBudget={}){
  const value=study.limits||{};
  const remaining=remainingBudget.maxTokens??remainingBudget.tokens??value.maxTokens;
  const duration=remainingBudget.maxDurationMs??remainingBudget.durationMs??value.maxDurationMs;
  if(!Number.isSafeInteger(remaining)||remaining<1||!Number.isFinite(duration)||duration<1)fail('The study budget is exhausted.','CALIBRATION_BUDGET_EXHAUSTED');
  return {maxTokens:remaining,maxDurationMs:duration};
}
function validateControls(study){
  const {persona,environment,charter,buildId}=study.controls||{};
  if(!study.id||!study.projectId||!persona||!environment||!charter||!buildId||[persona,environment,charter].some(entity=>entity.projectId!==study.projectId)||study.controls.model!==MODEL)fail('The study needs frozen, compatible Library versions.','CALIBRATION_CONTROLS_REQUIRED');
  return {persona,environment,charter,buildId};
}
async function abortable(operation,signal){
  signal?.throwIfAborted();let listener;
  try{return await Promise.race([operation(),new Promise((_,reject)=>{listener=()=>reject(signal.reason);signal?.addEventListener('abort',listener,{once:true});})]);}
  finally{signal?.removeEventListener('abort',listener);}
}

export function createCalibrationRuntime({store,requestMeta,runVariant,fingerprint=sourceFingerprint,assertCapacity=async()=>{},configured=()=>true}={}){
  async function proposeCandidate({study,candidateIndex,developmentComparison,remainingBudget,signal}){
    if(!configured())fail('Configure Meta before running a calibration experiment.','MODEL_API_KEY_MISSING',503);
    const {persona}=validateControls(study),budget=limits(study,remainingBudget);
    const context={persona:Object.fromEntries(['name','role','mission','resources','initialKnowledge',...fields].map(key=>[key,persona[key]||''])),developmentComparison,candidateIndex};
    if(JSON.stringify(context).length>48000)fail('Development comparison exceeds the bounded drafting context.','CALIBRATION_CONTEXT_TOO_LARGE',413);
    const body=boundModelRequest({model:MODEL,store:false,instructions:'Propose one experimental adjustment to a synthetic persona using only the supplied development comparison. These are hypotheses for testing, never established user attributes. Preserve declared resources, abilities, background, product knowledge and constraints unless directly supported by supplied research. Device type alone does not imply ability, equipment, time or intent. Prefer narrowing decision priorities when evidence supports it. Never add expected UI routes, workarounds, hidden product facts, credentials, tool instructions or permissions. Do not optimize for a desired goal outcome. No product code or active persona changes occur here. Return concise English; empty strings mean leave that field unchanged. Explain the limited behavioral hypothesis in rationale.',text:{format:{type:'json_schema',name:'calibration_persona_adjustment',strict:true,schema:{type:'object',properties:{changes:{type:'object',properties:Object.fromEntries(fields.map(key=>[key,{type:'string',description:`A proposed replacement for ${key}, grounded in supplied research or clearly framed behavioral hypothesis. Empty to preserve the current field.`}])),required:fields,additionalProperties:false},rationale:{type:'string',description:'Why this bounded hypothesis may explain the development discrepancy; include uncertainty.'}},required:['changes','rationale'],additionalProperties:false}}},input:[{role:'user',content:[{type:'input_text',text:JSON.stringify(context)}]}]}, {remainingTokens:budget.maxTokens});
    const combined=signal?AbortSignal.any([signal,AbortSignal.timeout(Math.min(90000,budget.maxDurationMs))]):AbortSignal.timeout(Math.min(90000,budget.maxDurationMs));
    let response,receipt;
    try{
      response=await abortable(()=>requestMeta(body,combined),combined);
      const total=usageTotal([response?.usage]);
      receipt={provider:'Meta',model:MODEL,requestId:typeof response?.id==='string'&&/^[a-zA-Z0-9._:-]{1,180}$/.test(response.id)?response.id:null,usage:{total_tokens:total},createdAt:new Date().toISOString()};
      if(total>budget.maxTokens)fail('The provider receipt exceeded the remaining study allowance. No further experiment will run.','CALIBRATION_BUDGET_EXHAUSTED');
      const content=(response?.output||[]).filter(item=>item?.type==='message').flatMap(item=>item.content||[]);
      if(response?.status!=='completed'||response?.error||response?.refusal||(response.output||[]).some(item=>!['message','reasoning'].includes(item?.type))||content.length!==1||content[0].type!=='output_text'||typeof content[0].text!=='string'||content[0].text.length>28000)fail('Meta did not return a complete adjustment.','CALIBRATION_INVALID_ADJUSTMENT',502);
      let parsed;try{parsed=JSON.parse(content[0].text);}catch{fail('Meta did not return a valid adjustment.','CALIBRATION_INVALID_ADJUSTMENT',502);}
      if(!object(parsed)||Object.keys(parsed).some(key=>!['changes','rationale'].includes(key))||typeof parsed.rationale!=='string'||!parsed.rationale.trim()||parsed.rationale.length>4000)fail('Meta did not explain the adjustment.','CALIBRATION_INVALID_ADJUSTMENT',502);
      const adjustment=validateCalibrationAdjustment({kind:'persona',changes:parsed.changes},persona);
      store.audit('calibration-proposal',study.id,{candidateIndex,...receipt,status:'completed'});
      return {adjustment,rationale:parsed.rationale.trim(),usage:receipt.usage,provenance:receipt};
    }catch(error){
      const safe=error instanceof WorkspaceError||['TOKEN_BUDGET','USAGE_UNAVAILABLE'].includes(error.code)?error:new WorkspaceError(combined.aborted?'Calibration drafting stopped.':'Meta could not draft a calibration adjustment.',combined.aborted?499:502,combined.aborted?'CALIBRATION_CANCELLED':'CALIBRATION_PROVIDER_FAILED');
      if(receipt){safe.usage=receipt.usage;safe.provenance=receipt;}
      store.audit('calibration-proposal',study.id,{candidateIndex,...receipt,status:'failed',code:safe.code});throw safe;
    }
  }

  async function executeTrial({study,candidate,phase,sessionIndex,remainingBudget,signal,onRunStarted}){
    if(!configured())fail('Configure Meta before running a calibration experiment.','MODEL_API_KEY_MISSING',503);
    signal?.throwIfAborted();
    const {persona,environment,charter,buildId}=validateControls(study),budget=limits(study,remainingBudget);
    if(!['development','validation'].includes(phase)||!Number.isSafeInteger(sessionIndex)||sessionIndex<0)fail('Invalid experimental session.','CALIBRATION_INVALID_SESSION');
    const adjustment=validateCalibrationAdjustment(candidate.adjustment,persona);
    const current=store.getEntity('environment',environment.id);
    if(!current||current.archived||current.lifecycle==='temporary'||current.projectId!==study.projectId||current.version!==environment.version)fail('The experiment environment changed. Create a new study.','CALIBRATION_ENVIRONMENT_CHANGED');
    if(!environment.repositoryPath)fail('A recorded source build is required for a controlled experiment.','CALIBRATION_BUILD_UNVERIFIED');
    const productFingerprint=await fingerprint(environment.repositoryPath);
    if(store.memory.buildIdentity({productFingerprint})!==buildId)fail('The product source changed since the study was frozen.','CALIBRATION_BUILD_CHANGED');
    const original=study.memoryContext;
    if(!original?.snapshot)fail('The benchmark needs a pinned memory snapshot.','CALIBRATION_MEMORY_REQUIRED');
    const basePolicy=effectiveExecutionPolicy({projectId:study.projectId,environmentSnapshot:environment,charterSnapshot:charter});
    if(basePolicy.allowMutations&&environment.isolation!=='stateless-demo')fail('Mutating experiments need an isolated test-data fixture. This environment has no supported fixture adapter.','CALIBRATION_ISOLATION_REQUIRED');
    const policy={...basePolicy,maxSteps:Math.min(basePolicy.maxSteps,study.limits.sessionMaxSteps),maxTokens:Math.min(basePolicy.maxTokens,study.limits.sessionMaxTokens,budget.maxTokens),maxDurationMs:Math.min(basePolicy.maxDurationMs,study.limits.sessionMaxDurationMs,budget.maxDurationMs)};
    if(Object.values(policy).some(value=>typeof value==='number'&&(!Number.isFinite(value)||value<1)))fail('Invalid experimental execution limits.','CALIBRATION_BUDGET_EXHAUSTED');
    await assertCapacity();
    signal?.throwIfAborted();
    const experimentalPersona={...clone(persona),...adjustment.changes};
    const browserConfiguration=copyBrowserConfiguration(study.controls.browserConfiguration||{viewport:persona.viewport||environment.viewport||{width:1280,height:800}});
    const run={id:randomUUID(),projectId:study.projectId,name:`${persona.name} · calibration ${phase} ${sessionIndex+1}`,status:'queued',createdAt:new Date().toISOString(),events:[],experience:[],usage:[],video:null,replay:null,error:null,finalMessage:null,persona:experimentalPersona,personaSnapshot:clone(experimentalPersona),personaId:persona.id,personaName:persona.name,personaVersion:persona.version,personaVersionId:persona.versionId,charterSnapshot:clone(charter),charterId:charter.id,charterName:charter.name,charterVersion:charter.version,charterVersionId:charter.versionId,environmentSnapshot:clone(environment),environmentId:environment.id,environmentName:environment.name,environmentVersion:environment.version,environmentVersionId:environment.versionId,target:environment.url,productDirectory:environment.repositoryPath,viewport:clone(persona.viewport||environment.viewport||{width:1280,height:800}),model:MODEL,scenarioId:original.scenarioId||'web-app',executionPolicy:policy,maxSteps:policy.maxSteps,memorySnapshot:clone(original.snapshot),memorySnapshotId:original.id,experimental:true,experimentalStudyId:study.id,calibrationStudyId:study.id,experimentalCandidateId:candidate.id,calibrationCandidateId:candidate.id,calibrationTrialId:randomUUID(),calibrationPhase:phase,calibrationSessionIndex:sessionIndex,expectedBuildId:buildId,limitations:'Isolated synthetic calibration experiment. The persona adjustment is unadopted; this result does not validate human feelings.'};
    Object.assign(run,browserConfiguration);
    // No expected metric, validation sample, desired outcome, or adjustment
    // rationale enters the browser model's persona/charter input.
    store.syncRun(run);
    try{await onRunStarted?.(run.id);signal?.throwIfAborted();}
    catch(error){store.syncRun({...run,status:signal?.aborted?'cancelled':'failed',completedAt:new Date().toISOString(),error:'Experimental session stopped before browser launch.'});throw error;}
    const result=await runVariant(run,signal);
    const saved=store.getRun(result?.id||run.id);
    if(!saved)fail('The experimental journey was not persisted.','CALIBRATION_RUN_MISSING');
    return {runId:saved.id,usage:{total_tokens:usageTotal(saved.usage)}};
  }

  async function adoptCandidate({study,candidate,result,idempotencyKey,expectedPersonaVersion}){
    const {persona,environment,buildId}=validateControls(study);
    const adjustment=validateCalibrationAdjustment(candidate.adjustment,persona);
    if(expectedPersonaVersion!==persona.version)fail('Approval must target the study’s exact original persona version.','VERSION_CONFLICT');
    const request={projectId:study.projectId,personaId:persona.id,expectedVersion:expectedPersonaVersion,changes:adjustment.changes,idempotencyKey,studyId:study.id,candidateId:candidate.id,resultId:result.id||result.versionId};
    // Reconcile an already-committed approval before inspecting later changes.
    // The store verifies the exact receipt signature and never appends twice.
    if(store.db.prepare("SELECT id FROM audit WHERE kind='calibration-adoption' AND entity_id=?").get(idempotencyKey))return store.adoptCalibrationPersona(request);
    const current=store.getEntity('environment',environment.id);
    if(!current||current.archived||current.lifecycle==='temporary'||current.version!==environment.version)fail('The environment changed after validation. Create a new calibration study.','CALIBRATION_ENVIRONMENT_CHANGED');
    if(!environment.repositoryPath||store.memory.buildIdentity({productFingerprint:await fingerprint(environment.repositoryPath)})!==buildId)fail('The product source changed after validation. Create a new calibration study.','CALIBRATION_BUILD_CHANGED');
    return store.adoptCalibrationPersona(request);
  }
  return {proposeCandidate,executeTrial,adoptCandidate};
}
