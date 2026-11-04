import {mkdir,readFile,writeFile,appendFile,rename,readdir,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {sourceFingerprint} from '../journey-engine/workspace-execution.mjs';
import {verifyRecording} from './acceptance-journeys-guards.mjs';
import {withGatherVariant} from '../gather/serve.mjs';

export const ROOT=resolve(import.meta.dirname,'..'), OUT=join(ROOT,'outputs/gather-pr-demo');
export const ORIGIN='http://127.0.0.1:4319', PROJECT='gather';
export const LIMITS=Object.freeze({maxSteps:16,maxTokens:350000,maxDurationMs:360000});
export const GATHER_CHANGE_DETAILS=Object.freeze({
  changeSummary:'Quick booking skips the planning step, shows room-only prices, and clears the meeting name when returning to room selection.',
  changes:Object.freeze([
    'Choose a room directly from the home page without the separate meeting-requirements step.',
    'Room cards show hourly room rates; projector and service charges appear in the review total.',
    'Returning from meeting details or review to the room list clears the entered meeting name.',
  ]),
});
export const ACTIVE=new Set(['queued','running','recording','finalizing','preparing','generating','verifying','retesting']);
const stamp=()=>new Date().toISOString(),sha=value=>createHash('sha256').update(value).digest('hex');
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const pause=ms=>new Promise(done=>setTimeout(done,ms));
export const sourceHash=fingerprint=>'source:'+sha(JSON.stringify(Object.entries(fingerprint).sort()));
export function runReceipt(run){
  const requests=run.modelRequests||[],usage=run.usage||[];
  const measured=value=>Number.isSafeInteger(value?.total_tokens)&&value.total_tokens>=0;
  const known=Array.isArray(usage)&&usage.length>0&&usage.every(measured)&&Array.isArray(requests)&&requests.length>0&&requests.every(x=>measured(x?.usage))&&requests.length===usage.length&&usage.reduce((sum,x)=>sum+x.total_tokens,0)===requests.reduce((sum,x)=>sum+x.usage.total_tokens,0);
  return {id:run.id,personaId:run.personaId,status:run.status,outcome:run.finding?.outcome||run.outcome||null,tokens:known?usage.reduce((sum,x)=>sum+x.total_tokens,0):null,usageKnown:known,model:run.model,personaVersionId:run.personaVersionId,charterVersionId:run.charterVersionId,environmentId:run.environmentId,sourceHash:run.productFingerprint?sourceHash(run.productFingerprint):null,actions:(run.events||[]).filter(e=>e.type==='action'&&!e.rejected).length,experienceSignals:run.experience?.length||0,video:run.video,replay:run.replay,error:run.error||null};
}
export function assertRun(run,persona,environment,charter,expectedHash){
  if(run.model!=='muse-wonder-1.0'||run.integrityStatus==='invalidated'||!run.productFingerprint||!Object.keys(run.productFingerprint).length)throw Error('The journey lacks the required model, intact evidence or source fingerprint.');
  const expectedEnvironment=environment.configuredEnvironment||environment;
  const recordedTarget=run.executionInstance?.targetId===environment.id;
  if(run.projectId!==PROJECT||run.personaId!==persona.id||run.personaVersionId!==persona.versionId||run.environmentId!==(recordedTarget?expectedEnvironment.id:environment.id)||run.environmentVersionId!==(recordedTarget?expectedEnvironment.versionId:environment.versionId)||run.charterVersionId!==charter.versionId)throw Error('Recorded journey controls differ from the pinned launch.');
  if(Object.entries(LIMITS).some(([key,value])=>run.executionPolicy?.[key]!==value))throw Error('A journey changed its finite execution policy.');
  if(sourceHash(run.productFingerprint||{})!==expectedHash)throw Error('The recorded product source differs from the pinned change.');
  if(run.personaSnapshot?.continuity!=='first-time'||(run.memorySnapshot?.roles?.persona||[]).length)throw Error('The fresh visitor received earlier persona memory.');
  if(!['finished','completed'].includes(run.status))throw Error(`Journey ${run.id} is ${run.status}; preserve it and diagnose before further paid work.`);
  const receipt=runReceipt(run);if(!receipt.usageKnown)throw Error('Unknown or inconsistent model usage; further paid work stopped.');
  if(receipt.tokens>LIMITS.maxTokens)throw Error('Actual journey usage exceeded its admission allowance; stop before further paid work.');
  return receipt;
}

export async function api(path,method='GET',body){
  const response=await fetch(ORIGIN+path,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||`HTTP ${response.status}`),{status:response.status,code:data.code});return data;
}
const ws=(path,method,body)=>api('/api/workspace'+path,method,body);
async function stateRead(){try{return await read(join(OUT,'state.json'));}catch(error){if(error.code!=='ENOENT')throw error;return null;}}
async function save(state,event){state.updatedAt=stamp();await mkdir(OUT,{recursive:true});await appendFile(join(OUT,'events.jsonl'),JSON.stringify({at:state.updatedAt,event,state})+'\n');await writeFile(join(OUT,'state.tmp'),JSON.stringify(state,null,2)+'\n');await rename(join(OUT,'state.tmp'),join(OUT,'state.json'));}
async function until(get,done,label,timeout=450000){const end=Date.now()+timeout;while(Date.now()<end){const result=await get();if(done(result))return result;await pause(2000);}throw Error(`${label}: monitoring window ended; existing work is retained and will not be dispatched twice.`);}

async function preserve(){
  const runs=[];for(const dir of await readdir(join(ROOT,'journey-engine/runs'),{withFileTypes:true})){if(!dir.isDirectory())continue;const path=join(ROOT,'journey-engine/runs',dir.name,'run.json');try{runs.push({path,sha256:sha(await readFile(path))});}catch(error){if(error.code!=='ENOENT')throw error;}}
  const fixes=[];for(const dir of await readdir(join(ROOT,'journey-engine/workspace-data/fixes'),{withFileTypes:true})){if(!dir.isDirectory())continue;const path=join(ROOT,'journey-engine/workspace-data/fixes',dir.name,'fix.json');try{fixes.push({path,sha256:sha(await readFile(path))});}catch(error){if(error.code!=='ENOENT')throw error;}}
  const record={at:stamp(),runs,fixes};await writeFile(join(OUT,'preservation-before.json'),JSON.stringify(record,null,2)+'\n');return record;
}

export async function prepare(){
  let state=await stateRead();if(state?.prepared){await verifyPins(state);return state;}
  if(!state){await mkdir(OUT,{recursive:true});state={version:1,createdAt:stamp(),status:'preparing',limits:LIMITS,sessionLimit:8,generationLimit:1,launches:{},pins:{},mode:'local_proposal',externalPR:null,approval:null};await preserve();await save(state,'created');}
  const ensure=async(resource,id,input)=>{let existing;try{existing=await ws(`/${resource}/${id}?projectId=${PROJECT}`);}catch(error){if(error.status!==404)throw error;}
    if(existing){for(const [key,value]of Object.entries(input))if(JSON.stringify(existing[key])!==JSON.stringify(value))throw Error(`Existing ${id}.${key} differs; it will not be overwritten.`);return existing;}
    return ws('/'+resource,'POST',{id,...input});};
  const projects=(await ws('/projects')).projects;if(!projects.some(p=>p.id===PROJECT))await ws('/projects','POST',{id:PROJECT,name:'Gather',description:'Meeting room booking for teams.'});
  const viewport={width:1440,height:1000};
  const basePersona={projectId:PROJECT,role:'client',continuity:'first-time',viewport,initialKnowledge:'You have not used Gather before. You know your meeting requirements and can use ordinary room-booking websites.',skills:'Comfortable with ordinary web forms, room descriptions and checking a booking summary.',resources:'Desktop browser and fictional meeting details; no real payment information.',successCriteria:'A visible confirmed reservation for 12 attendees with a projector, the requested meeting purpose and an all-in total within your own budget. Verify the actual confirmation details.',stopCriteria:'Stop after a verified suitable reservation, a supported obstacle after reasonable recovery, or inconclusive navigation. Do not book beyond your budget.'};
  state.pins.coordinator=await ensure('personas','gather-coordinator',{...basePersona,name:'Maya · Office coordinator',context:'You organize the team’s quarterly planning meeting. The approved room budget is strict and you are accountable for the complete amount, including equipment and fees.',mission:'Book a room for 12 people with a projector for the available one-hour meeting slot. Enter the meeting purpose Quarterly planning. Keep the complete cost at or below $250.',constraints:'Total spending must not exceed $250. You cannot increase the budget. You need seats for all 12 people and a projector.',decision:'Choose a suitable room based on the full cost and requirements you can establish from the interface.',expectations:'You expect to understand what you are paying and keep the details you have already entered when changing a choice.',priorities:'Budget compliance and suitability first, then avoiding unnecessary repeated work.'});
  state.pins.assistant=await ensure('personas','gather-assistant',{...basePersona,name:'Alex · Executive assistant',context:'You are arranging the team’s quarterly planning meeting between other tasks. Any suitable room within the approved $350 total allowance is acceptable; you want to get the reservation completed efficiently.',mission:'Book a room for 12 people with a projector for the available one-hour meeting slot. Enter the meeting purpose Quarterly planning. Keep the complete cost at or below $350.',constraints:'Total spending must not exceed $350. You need seats for all 12 people and a projector.',decision:'Choose an appropriate available room and complete the booking efficiently without unnecessary comparisons.',expectations:'A clear, reliable path to a confirmed reservation and accurate final details.',priorities:'Meet the requirements and complete the reservation efficiently within the spending allowance.'});
  for(const [variant,port,label]of [['base',4390,'Development'],['proposal',4391,'Quick booking build']]){
    const directory=join(ROOT,'gather',variant),fingerprint=await sourceFingerprint(directory);
    const env=await ensure('environments',`gather-${variant}`,{projectId:PROJECT,name:label,...(variant==='proposal'?{lifecycle:'temporary',configuredEnvironmentId:'gather-base',configuredEnvironmentVersion:state.pins.base.environment.version,instanceKind:'change-preview'}:{}),url:`http://127.0.0.1:${port}/`,repositoryPath:directory,scenarioId:'gather-booking',allowedOrigins:[`http://127.0.0.1:${port}`],...LIMITS,viewport,allowMutations:true,captureBodies:false,dataPolicy:'Fictional test meeting reservations stored in this browser session only; no accounts, payments or external requests.',fixtureVersion:'gather-rooms-v1',isolation:'stateless-demo',testCommand:'node --check app.js'});
    state.pins[variant]={environment:env,fingerprint,sourceHash:sourceHash(fingerprint)};
  }
  state.pins.charter=await ensure('charters','gather-book-room',{projectId:PROJECT,name:'Book a room that fits',mission:'Explore Gather from the selected persona’s point of view and reserve a room satisfying their meeting requirements and spending limit. Verify the final reservation details. Report uncertainty, lost work and meaningful experience moments as they occur.',scope:'Commercial landing page through room selection, details, review and confirmed reservation, including reasonable recovery when a choice does not fit.',startingState:'First visit in a new independent browser session, with no prior reservation or product knowledge.',goals:'Complete one suitable test reservation and verify its details. Do not confuse a successful action with accomplishing the persona’s goal.',successCriteria:'The visible saved reservation matches the persona’s purpose, capacity, projector requirement and all-in budget. Describe any remaining incompleteness precisely.',stopCriteria:'A verified reservation, an observed obstacle after reasonable recovery, unsafe action or the session limits.',expectedBehaviorSources:'The persona’s explicit meeting requirements, product-visible prices and requirements, and actual recorded confirmation. Preserve factual prices, room capacities and existing successful booking paths when evaluating changes.',defaultEnvironmentId:'gather-base',compatibleEnvironmentIds:['gather-base'],personaIds:['gather-coordinator','gather-assistant'],memoryPolicy:'none',allowMutations:true,captureBodies:false,...LIMITS,scenarioId:'gather-booking'});
  state.prepared=true;state.status='prepared';await save(state,'controls_prepared');return state;
}

async function verifyPins(state){
  for(const variant of ['base','proposal'])if(sourceHash(await sourceFingerprint(join(ROOT,'gather',variant)))!==state.pins[variant].sourceHash)throw Error(`The frozen ${variant} source changed.`);
  for(const [resource,pin]of [['personas',state.pins.coordinator],['personas',state.pins.assistant],['charters',state.pins.charter],['environments',state.pins.base.environment],['environments',state.pins.proposal.environment]]){
    const current=await ws(`/${resource}/${pin.id}?projectId=${PROJECT}`);if(current.versionId!==pin.versionId)throw Error(`Pinned ${resource} version changed.`);
  }
}
async function launchReceipt(key){const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(join(ROOT,'journey-engine/workspace-data/workspace.sqlite'),{readOnly:true});try{const row=db.prepare('SELECT * FROM launch_requests WHERE idempotency_key=?').get(key);return row?{...row,runIds:JSON.parse(row.run_ids)}:null;}finally{db.close();}}

export async function discover(){
  const state=await prepare();await verifyPins(state);
  if(state.status==='discovery_stopped')throw Error('The earlier discovery stopped. Diagnose its retained receipts before authorizing a separate configuration.');
  const health=await api('/api/health');if(!health.modelConfigured)throw Error('The secure Meta connection is unavailable.');
  try{
    for(const variant of ['base','proposal'])await withGatherVariant({variant,port:Number(new URL(state.pins[variant].environment.url).port),directory:join(ROOT,'gather',variant)},async()=>{for(const who of ['assistant','coordinator']){
      const key=`${variant}-${who}`,persona=state.pins[who],environment=state.pins[variant].environment;
      let launch=state.launches[key];
      if(!launch){
        launch={key:`gather-demo-v1-${key}`,at:stamp(),status:'intent',body:{projectId:PROJECT,personaIds:[persona.id],charterId:state.pins.charter.id,environmentId:environment.id,name:`${variant==='base'?'Current':'Proposed'} · ${persona.name}`,idempotencyKey:`gather-demo-v1-${key}`}};
        state.launches[key]=launch;state.status='discovering';await save(state,key+'_intent');
        try{const result=await ws('/runs','POST',launch.body);if(result.runs?.length!==1)throw Error('Expected one atomic journey.');launch.runId=result.runs[0].id;launch.status='acknowledged';await save(state,key+'_dispatched');}
        catch(error){launch.status=error.status&&error.status<500?'rejected':'uncertain';launch.error=error.message;await save(state,key+'_unresolved');throw error;}
      }else if(!launch.runId){const receipt=await launchReceipt(launch.key);if(receipt?.state!=='completed'||receipt.runIds.length!==1)throw Error('Prior launch is unresolved; it will not be resubmitted.');launch.runId=receipt.runIds[0];await save(state,key+'_reconciled');}
      const run=await until(()=>ws(`/runs/${launch.runId}?projectId=${PROJECT}`),r=>!ACTIVE.has(r.status),key);
      launch.receipt=assertRun(run,persona,environment,state.pins.charter,state.pins[variant].sourceHash);launch.status='recorded';await save(state,key+'_recorded');console.log(JSON.stringify({event:key,receipt:launch.receipt}));
    }});
    state.status='discovered';await save(state,'four_journeys_recorded');await updateImpact(state);return state;
  }catch(error){state.status='discovery_stopped';state.error=error.message;await save(state,'discovery_stopped');throw error;}
}

export async function updateImpact(state=undefined){
  state ||=await stateRead();if(!state?.prepared)throw Error('Prepare Gather first.');
  const control=variant=>({label:variant==='base'?'Current':'Quick booking',environmentId:state.pins[variant].environment.id,environmentVersion:state.pins[variant].environment.version,sourceHash:state.pins[variant].sourceHash});
  const body={projectId:PROJECT,title:'Quick booking. Different consequences.',intent:'Reduce the steps between finding a room and confirming a reservation. Evaluate the effect on both the executive assistant and budget-constrained coordinator.',baseline:control('base'),proposal:control('proposal'),personas:['assistant','coordinator'].map(who=>({personaId:state.pins[who].id,baselineRunId:state.launches[`base-${who}`]?.runId||null,proposalRunId:state.launches[`proposal-${who}`]?.runId||null})),...(state.fixId?{fixId:state.fixId}:{}),...(state.roundId?{roundId:state.roundId}:{}),...(state.comparisonId?{comparisonId:state.comparisonId}:{})};
  let impact;
  if(state.impactId){const old=await ws(`/change-impacts/${state.impactId}?projectId=${PROJECT}`);const {baseline,proposal,...mutable}=body;impact=await ws(`/change-impacts/${state.impactId}?projectId=${PROJECT}`,'PATCH',{expectedVersion:old.version,...mutable});}
  else{
    if(state.impactIntentId){try{impact=await ws(`/change-impacts/${state.impactIntentId}?projectId=${PROJECT}`);}catch(error){if(error.status!==404)throw error;throw Error('An impact creation intent is unresolved; inspect its receipt before resubmission.');}}
    else{state.impactIntentId=randomUUID();await save(state,'impact_creation_intent');impact=await ws('/change-impacts?projectId='+PROJECT,'POST',{id:state.impactIntentId,...GATHER_CHANGE_DETAILS,...body});}
    state.impactId=impact.id;
  }
  await save(state,'impact_linked');return impact;
}

export async function fix(){
  const state=await stateRead();if(!state||!['discovered','fixing','awaiting_review'].includes(state.status))throw Error('Finish and inspect discovery before generating the single candidate.');await verifyPins(state);
  const findings=(await ws('/findings?projectId='+PROJECT)).findings;
  if(!state.fixIntent){
    const source=state.launches['proposal-coordinator'].runId,candidates=findings.filter(f=>f.runId===source);
    const finding=candidates.find(f=>/fee|cost|total|price|budget/i.test([f.title,f.observation].join(' ')))||candidates.find(f=>/lost|reset|re.enter|clear|discard/i.test([f.title,f.observation].join(' ')))||candidates[0];
    if(!finding)throw Error('No recorded coordinator finding exists; do not fabricate one.');
    if(!state.acceptanceReview){
      const related=candidates.find(f=>/lost|reset|re.enter|clear|discard/i.test([f.title,f.observation].join(' ')));
      const expected=finding.expected+' Repair acceptance: show the all-in cost while comparing rooms, before entering a meeting name. Preserve entered meeting details when switching rooms. Retain the current quick path from the home room cards through meeting details and review to confirmation; do not reintroduce a mandatory planning step. Preserve room prices, capacity, selected projector and valid saved reservations: Atlas remains $280 total and Willow $245 for 12 people with a projector. Do not remove charges or requirements to meet a budget.';
      state.acceptanceReview={at:stamp(),findingId:finding.id,relatedFindingId:related?.id||null,expected,source:'Codex acceptance synthesis from the user-requested Gather trade-off demo, fixed fixture contract, the recorded price finding and the related recorded loss-of-work finding. This is a review requirement, not a new model observation.'};await save(state,'acceptance_review_intent');
      await ws(`/findings/${finding.id}?projectId=${PROJECT}`,'PATCH',{expected,expectationSource:state.acceptanceReview.source,reason:'Recorded repair criteria and preservation of the working quick-booking path; original AI observations and journey remain unchanged.'});state.acceptanceReview.status='recorded';await save(state,'acceptance_review_recorded');
    }else if(state.acceptanceReview.status!=='recorded')throw Error('Acceptance review dispatch is unresolved; inspect its revision before generating.');
    state.fixIntent={at:stamp(),findingId:finding.id,supportRunIds:[state.launches['proposal-assistant'].runId],sessionReservation:4,status:'intent'};state.status='fixing';await save(state,'fix_intent');
    try{const created=await ws('/fixes','POST',{projectId:PROJECT,findingId:finding.id,supportRunIds:state.fixIntent.supportRunIds});state.fixId=created.id;state.roundId=created.currentRoundId;state.fixIntent.status='acknowledged';await save(state,'muse_code_dispatched');}
    catch(error){state.fixIntent.status=error.status&&error.status<500?'rejected':'uncertain';state.fixIntent.error=error.message;await save(state,'fix_unresolved');throw error;}
  }else if(!state.fixId){const records=(await ws('/fixes?projectId='+PROJECT)).fixes.filter(f=>f.findingId===state.fixIntent.findingId);if(records.length!==1)throw Error('Fix dispatch unresolved; no second generation will be started.');state.fixId=records[0].id;state.roundId=records[0].currentRoundId;await save(state,'fix_reconciled');}
  await updateImpact(state);
  const result=await until(()=>ws(`/fixes/${state.fixId}?projectId=${PROJECT}`),f=>!ACTIVE.has(f.status),'Muse Code + four fresh retests',2400000);
  state.roundId=result.currentRoundId;const round=result.rounds.find(r=>r.id===state.roundId);state.comparisonId=round?.comparison?.id||null;state.status=result.status;state.approval=result.approval||null;await save(state,'fix_finalized');await updateImpact(state);return result;
}

export async function report(){
  const state=await stateRead();if(!state)throw Error('No Gather checkpoint.');const sessions=[],recordings=[],rawRuns=new Map();
  const ids=new Set(Object.values(state.launches).map(x=>x.runId).filter(Boolean));let fixRecord=null;
  if(state.fixId){fixRecord=await ws(`/fixes/${state.fixId}?projectId=${PROJECT}`);for(const round of fixRecord.rounds||[])for(const comparison of round.comparisons||[])for(const pair of comparison.pairs||[]){if(pair.beforeRunId)ids.add(pair.beforeRunId);if(pair.afterRunId)ids.add(pair.afterRunId);}}
  for(const id of ids){const run=await ws(`/runs/${id}?projectId=${PROJECT}`);rawRuns.set(id,run);sessions.push(runReceipt(run));recordings.push(await verifyRecording(run,ORIGIN,fetch));}
  const prior=await read(join(OUT,'preservation-before.json')),preserved=await Promise.all([...prior.runs,...prior.fixes].map(async file=>({path:file.path,unchanged:sha(await readFile(file.path))===file.sha256})));
  const report={at:stamp(),status:state.status,localProposal:true,impactId:state.impactId,fixId:state.fixId,roundId:state.roundId,comparisonId:state.comparisonId,limits:LIMITS,sessions,recordings,reportedJourneyTokens:sessions.every(x=>x.usageKnown)?sessions.reduce((sum,x)=>sum+x.tokens,0):null,checks:{withinEightSessions:sessions.length<=8,allRecorded:sessions.length===8&&sessions.every(x=>['finished','completed'].includes(x.status)),knownJourneyUsage:sessions.every(x=>x.usageKnown),originalHistoryPreserved:preserved.every(x=>x.unchanged),unapproved:!fixRecord?.approval,externalPRNotCreated:!fixRecord?.pullRequestUrl},preserved,limitations:['Independent synthetic sessions; no measured human sentiment or causal business uplift.','The proposed change is local; no external PR provider or webhook was connected.','Goal outcome, navigation effort and simulated reaction remain separate.','Muse Code usage is retained separately in its process receipt, not included in journey-token totals.']};
  const comparison=fixRecord?.rounds?.find(round=>round.id===state.roundId)?.comparison;
  const describe=id=>{const run=rawRuns.get(id);if(!run)return null;const receipt=runReceipt(run),signals=run.experience||[],actions=(run.events||[]).filter(event=>event.type==='action');return {...receipt,negativeSignals:signals.filter(item=>['negative','very_negative'].includes(item.valence)).map(item=>({eventIndex:item.eventIndex,originalMs:item.videoMs,reaction:item.reaction})),lastAction:actions.at(-1)?.action||null,recordedConclusion:run.finding?.observation||null};};
  report.personaComparisons=['assistant','coordinator'].map(who=>{const personaId=state.pins[who].id,pair=comparison?.pairs?.find(item=>item.personaId===personaId);return {personaId,current:describe(state.launches[`base-${who}`]?.runId),proposed:describe(state.launches[`proposal-${who}`]?.runId),freshProposed:describe(pair?.beforeRunId),repaired:describe(pair?.afterRunId)};});
  const alex=report.personaComparisons[0],maya=report.personaComparisons[1];
  Object.assign(report.checks,{allGoalsReached:sessions.length===8&&sessions.every(item=>item.outcome==='goal_reached'),reportedJourneyUsageWithinAllowance:sessions.every(item=>item.tokens!==null&&item.tokens<=LIMITS.maxTokens),observedAssistantShortcut:!!alex.current&&!!alex.proposed&&alex.proposed.actions<alex.current.actions,observedCoordinatorExtraWork:!!maya.current&&!!maya.proposed&&maya.proposed.actions>maya.current.actions,observedCoordinatorRepair:!!maya.freshProposed&&!!maya.repaired&&maya.repaired.actions<maya.freshProposed.actions,assistantGoalPreserved:alex.repaired?.outcome==='goal_reached'});
  report.limitations.push('Alex’s repaired run stopped at confirmation; the unrepaired retest also opened My reservations. The one-action difference does not establish an additional product optimization. The independent functional verifier checks the unchanged four-interaction booking path for both rooms.');
  await writeFile(join(OUT,'report.json'),JSON.stringify(report,null,2)+'\n');return report;
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const action=process.argv[2];const actions={'--prepare':prepare,'--discover':discover,'--fix':fix,'--link':updateImpact,'--report':report};
  if(!actions[action])console.log('Explicit phases: --prepare, --discover (four real journeys), --fix (one Muse Code candidate + four real retests), --link, --report. No automatic paid retries.');
  else try{const result=await actions[action]();console.log(JSON.stringify({status:result.status||'saved',impactId:result.impactId||(action==='--link'?result.id:undefined),fixId:action==='--fix'?result.id:result.fixId,report:action==='--report'?join(OUT,'report.json'):undefined}));}catch(error){console.error(error.message);process.exitCode=1;}
}
