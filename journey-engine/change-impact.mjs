import {createHash,randomUUID} from 'node:crypto';
import {link,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {WorkspaceError} from './workspace-store.mjs';
import {effectiveBrowserConditions} from './browser-device.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH=/^source:[0-9a-f]{64}$/;
const COMPLETE=new Set(['finished','completed']);
const ACTIVE=new Set(['queued','running','finalizing']);
const plain=x=>x&&typeof x==='object'&&!Array.isArray(x);
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fail=(message,status=400,code='INVALID_CHANGE_IMPACT')=>{throw new WorkspaceError(message,status,code);};
const stamp=()=>new Date().toISOString();
const bounded=(value,label,max)=>{if(typeof value!=='string'||!value.trim()||value.length>max)fail(`${label} must contain 1–${max} characters.`);return value.trim();};
const uuid=(value,label)=>{if(typeof value!=='string'||!UUID.test(value))fail(`Choose a valid ${label}.`);return value;};
const optionalUuid=(value,label)=>value==null?null:uuid(value,label);
const int=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const numeric=value=>Number.isFinite(value)&&value>=0?value:null;
const rejectUnknown=(value,keys)=>{if(Object.keys(value).some(key=>!keys.includes(key)))fail('This request contains unsupported fields.');};

const ORIGIN_FIELDS=['kind','state','provider','repository','number','url','createdAt','mergedAt','baseRef','headRef','baseSha','headSha','mergeSha'];
const ORIGIN_TEXT_FIELDS=['baseRef','headRef','baseSha','headSha','mergeSha'];
function originDate(value,label){
  if(value==null)return null;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))fail(`${label} must be a timestamp with a timezone.`);
  const date=new Date(value),calendar=value.slice(0,10).split('-').map(Number);
  if(calendar[1]<1||calendar[1]>12||calendar[2]<1||calendar[2]>new Date(Date.UTC(calendar[0],calendar[1],0)).getUTCDate())fail(`${label} must be a valid date.`);
  return date.toISOString();
}
function origin(input){
  if(input===undefined)return {kind:'local_change',state:'proposed',provider:null,repository:null,number:null,url:null,createdAt:null,mergedAt:null,baseRef:null,headRef:null,baseSha:null,headSha:null,mergeSha:null,provenance:'local_record'};
  if(!plain(input))fail('Describe the origin of this change.');rejectUnknown(input,ORIGIN_FIELDS);
  if(!['local_change','pull_request'].includes(input.kind))fail('Choose a local change or pull request origin.');
  const result={kind:input.kind,state:input.state||'proposed',provider:null,repository:null,number:null,url:null,createdAt:originDate(input.createdAt,'Change creation time'),mergedAt:originDate(input.mergedAt,'Merge time'),provenance:input.kind==='pull_request'?'user_supplied':'local_record'};
  if(!['proposed','merged'].includes(result.state))fail('Choose a proposed or merged change.');
  for(const key of ORIGIN_TEXT_FIELDS){
    result[key]=input[key]==null?null:bounded(input[key],key,240);
    if(result[key]&&(/[\u0000-\u001f\u007f]/.test(result[key])||key.endsWith('Sha')&&!/^[a-f0-9]{7,64}$/i.test(result[key])))fail(`Provide a valid ${key}.`);
  }
  if(result.kind==='local_change'){
    if(result.state!=='proposed'||['provider','repository','number','url','mergedAt','mergeSha'].some(key=>input[key]!=null))fail('A local change cannot claim a pull request or merge.');
    return result;
  }
  if(!['github','gitlab'].includes(input.provider))fail('Choose a GitHub or GitLab pull request.');result.provider=input.provider;
  result.repository=bounded(input.repository,'Repository',240);
  const segments=result.repository.split('/');
  if(segments.length<2||input.provider==='github'&&segments.length!==2||segments.some(segment=>!segment||['.','..'].includes(segment)||!/^[-\w.]+$/.test(segment)))fail('Use the repository owner/group and name.');
  if(!Number.isSafeInteger(input.number)||input.number<1)fail('Provide a positive pull request number.');result.number=input.number;
  let url;try{url=new URL(bounded(input.url,'Pull request URL',1200));}catch(error){if(error instanceof WorkspaceError)throw error;fail('Provide a valid pull request URL.');}
  const pathname=input.provider==='github'?`/${result.repository}/pull/${result.number}`:`/${result.repository}/-/merge_requests/${result.number}`;
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname.replace(/\/$/,'')!==pathname)fail('Use the HTTPS pull request URL matching its repository and number.');
  url.pathname=pathname;result.url=url.href;
  if(result.state==='proposed'&&(result.mergedAt||result.mergeSha))fail('A proposed pull request cannot include merge metadata.');
  if(result.createdAt&&result.mergedAt&&Date.parse(result.mergedAt)<Date.parse(result.createdAt))fail('The merge cannot precede pull request creation.');
  return result;
}
function originUpdate(previous,input){
  if(!plain(input))fail('Describe the origin of this change.');
  if(previous?.kind==='pull_request'&&Object.hasOwn(input,'kind')&&input.kind!==previous.kind)fail('Keep this assessment linked to its original pull request.',409,'IMMUTABLE_CHANGE_ORIGIN');
  const next=origin({...Object.fromEntries(ORIGIN_FIELDS.filter(key=>previous&&Object.hasOwn(previous,key)).map(key=>[key,previous[key]])),...input});
  if(previous?.kind==='pull_request'){
    if(['kind','provider','repository','number','url'].some(key=>previous[key]!==next[key]))fail('Keep this assessment linked to its original pull request.',409,'IMMUTABLE_CHANGE_ORIGIN');
    if(previous.state==='merged'&&next.state!=='merged')fail('A recorded merge cannot become a proposal.',409,'IMMUTABLE_CHANGE_ORIGIN');
    for(const key of ['createdAt','mergedAt','baseSha','headSha','mergeSha'])if(previous[key]&&previous[key]!==next[key])fail('Keep the original source timestamps and pinned commits.',409,'IMMUTABLE_CHANGE_ORIGIN');
  }
  return next;
}
const changeSummary=value=>value==null?null:bounded(value,'Change summary',3000);
function changeList(value){if(value===undefined)return [];if(!Array.isArray(value)||value.length>12)fail('List at most twelve changes.');return value.map(item=>bounded(item,'Change detail',500));}

export function changeImpactSourceHash(run){
  return plain(run?.productFingerprint)&&Object.keys(run.productFingerprint).length?`source:${digest(Object.entries(run.productFingerprint).sort())}`:null;
}

export function changeImpactMetrics(run){
  if(!run)return null;
  const actions=(run.events||[]).filter(event=>event.type==='action'&&plain(event.action));
  const interactions=actions.filter(event=>!['wait','screenshot'].includes(event.action.type));
  const usage=Array.isArray(run.usage)&&run.usage.length&&run.usage.every(item=>int(item?.total_tokens)!==null)?run.usage.reduce((sum,item)=>sum+item.total_tokens,0):null;
  const started=Date.parse(run.startedAt),ended=Date.parse(run.completedAt);
  return {status:run.status||'unknown',outcome:COMPLETE.has(run.status)?run.finding?.outcome||run.outcome||'unknown':null,executedActions:actions.length,interactionActions:interactions.length,rejectedActions:(run.events||[]).filter(event=>event.type==='action_rejected').length,videoDurationMs:numeric(run.replayMetadata?.originalDuration)==null?null:run.replayMetadata.originalDuration*1000,wallDurationMs:Number.isFinite(started)&&Number.isFinite(ended)&&ended>=started?ended-started:null,totalTokens:usage,sourceHash:changeImpactSourceHash(run),recording:typeof run.video==='string'?run.video:null};
}

function observations(run){
  if(!run)return [];
  return (run.experience||[]).flatMap((item,index)=>{
    const frame=(run.events||[]).find(event=>event.type==='screenshot'&&event.index===item.eventIndex&&typeof event.screenshot==='string'&&event.screenshot.startsWith(`/runs/${run.id}/`));
    if(!frame)return [];
    return [{runId:run.id,signalIndex:index,eventIndex:frame.index,originalMs:numeric(item.videoMs)??numeric(frame.videoMs),screenshot:frame.screenshot,observation:typeof item.observation==='string'?item.observation:null,reaction:typeof item.reaction==='string'?item.reaction:null,valence:item.valence??null,friction:numeric(item.friction),provenance:'recorded_synthetic_observation'}];
  });
}

function controls(before,after,expected={}){
  if(!before||!after)return {status:'pending',issues:[]};
  const issues=[];
  for(const key of ['personaId','personaVersion','personaVersionId','charterId','charterVersion','charterVersionId','model']){
    if(before[key]==null||after[key]==null)issues.push(`${key}_missing`);
    else if(before[key]!==after[key])issues.push(`${key}_mismatch`);
  }
  for(const key of ['personaSnapshot','charterSnapshot','executionPolicy','viewport']){
    if(!plain(before[key])||!plain(after[key]))issues.push(`${key}_missing`);
    else if(!same(before[key],after[key]))issues.push(`${key}_mismatch`);
  }
  try{
    const first=effectiveBrowserConditions(before),second=effectiveBrowserConditions(after);
    if(!same(first.device,second.device))issues.push('device_conditions_mismatch');
    if(!same(first.network,second.network))issues.push('network_conditions_mismatch');
  }catch{issues.push('browser_conditions_invalid');}
  const personaMemory=run=>(run.memorySnapshot?.roles?.persona||[]).map(item=>({id:item.id,version:item.version,versionId:item.versionId}));
  if(!same(personaMemory(before),personaMemory(after)))issues.push('persona_memory_mismatch');
  for(const [side,run]of [['baseline',before],['proposal',after]]){
    if(run.integrityStatus==='invalidated')issues.push(`${side}_evidence_invalidated`);
    if(run.experimental||run.experimentalStudyId||run.calibrationTrialId)issues.push(`${side}_experimental_run`);
    const build=expected[side];
    if(build){
      if(build.environmentId&&run.environmentId!==build.environmentId)issues.push(`${side}_environment_mismatch`);
      if(build.environmentVersion&&run.environmentVersion!==build.environmentVersion)issues.push(`${side}_environment_version_mismatch`);
      if(build.sourceHash&&changeImpactSourceHash(run)!==build.sourceHash){
        if(COMPLETE.has(run.status)||changeImpactSourceHash(run))issues.push(`${side}_source_mismatch`);
      }
    }
    if(COMPLETE.has(run.status)&&!changeImpactSourceHash(run))issues.push(`${side}_source_missing`);
  }
  if(issues.length)return {status:'mismatch',issues};
  return {status:COMPLETE.has(before.status)&&COMPLETE.has(after.status)?'matched':'pending',issues:[]};
}

export function deriveChangeImpactPair({personaId,personaName,before,after,baselineRunId,proposalRunId,expected}){
  const checked=controls(before,after,expected),a=changeImpactMetrics(before),b=changeImpactMetrics(after);
  if([before,after].some(run=>run&&run.personaId!==personaId)){checked.status='mismatch';checked.issues.push('selected_persona_mismatch');}
  const valid=checked.status==='matched'&&['goal_reached','obstacle_observed'].includes(a?.outcome)&&['goal_reached','obstacle_observed'].includes(b?.outcome);
  const outcomeChange=!valid?'inconclusive':a.outcome===b.outcome?'unchanged':b.outcome==='goal_reached'?'improved':'regressed';
  const actionDelta=valid?b.interactionActions-a.interactionActions:null;
  const effortChange=actionDelta===null?'unknown':actionDelta<0?'fewer_actions':actionDelta>0?'more_actions':'same';
  return {personaId,personaName:personaName||before?.personaSnapshot?.name||after?.personaSnapshot?.name||before?.persona?.name||after?.persona?.name||personaId,beforeRunId:before?.id||baselineRunId||null,afterRunId:after?.id||proposalRunId||null,before:before||null,after:after||null,controls:checked,metrics:{before:a,after:b,actionDelta},outcomeChange,effortChange,observations:{before:observations(before),after:observations(after)}};
}

function reportStatus(pairs){
  if(pairs.every(pair=>!pair.before&&!pair.after))return 'pending';
  if(pairs.some(pair=>[pair.before,pair.after].some(run=>run&&ACTIVE.has(run.status))))return 'running';
  if(pairs.some(pair=>!pair.before||!pair.after))return 'pending';
  return pairs.every(pair=>pair.controls.status==='matched'&&pair.outcomeChange!=='inconclusive')?'completed':'inconclusive';
}

export function createChangeImpactService({root,store,getFix=async()=>null}={}){
  root=resolve(root);let mutation=Promise.resolve();
  const exclusive=fn=>{const task=mutation.catch(()=>{}).then(fn);mutation=task;return task;};
  const directory=id=>join(root,uuid(id,'change impact'));
  async function raw(id,projectId,version){
    store.requireProject(projectId);
    let files;try{files=(await readdir(directory(id))).filter(name=>/^\d+\.json$/.test(name));}catch(error){if(error instanceof WorkspaceError)throw error;fail('Change impact not found.',404,'NOT_FOUND');}
    const n=version??Math.max(...files.map(name=>Number(name.slice(0,-5))));
    if(!Number.isSafeInteger(n)||n<1)fail('Change impact not found.',404,'NOT_FOUND');
    let record;try{record=JSON.parse(await readFile(join(directory(id),`${n}.json`),'utf8'));}catch{fail('Change impact not found.',404,'NOT_FOUND');}
    if(record.id!==id||record.projectId!==projectId)fail('Change impact not found.',404,'NOT_FOUND');return record;
  }
  function project(value){const id=bounded(value,'App',160);store.requireProject(id);return id;}
  function build(value,projectId,label){
    if(!plain(value))fail(`Describe the ${label} build.`);rejectUnknown(value,['label','environmentId','environmentVersion','sourceHash']);
    if(!Number.isSafeInteger(value.environmentVersion)||value.environmentVersion<1)fail('Pin a positive environment version.');
    const environment=store.getEntity('environment',bounded(value.environmentId,'Environment ID',160),value.environmentVersion);
    if(!environment||environment.projectId!==projectId)fail('Choose an environment version from this app.',404,'NOT_FOUND');
    if(typeof value.sourceHash!=='string'||!HASH.test(value.sourceHash))fail('Pin a source fingerprint for each build.');
    return {label:bounded(value.label,`${label} label`,100),environmentId:value.environmentId,environmentVersion:value.environmentVersion,sourceHash:value.sourceHash};
  }
  function sourceRun(id,projectId,personaId,expected){
    if(!id)return null;const run=store.getRun(uuid(id,'journey'));
    if(!run||run.projectId!==projectId||run.personaId!==personaId)fail('Choose a journey for this app and persona.',404,'NOT_FOUND');
    const pinned=expectedForRun(expected,run);
    if(pinned&&(run.environmentId!==pinned.environmentId||run.environmentVersion!==pinned.environmentVersion))fail('The journey does not belong to the pinned environment version.',409,'RUN_BUILD_MISMATCH');
    const hash=changeImpactSourceHash(run);if(expected&&hash&&hash!==expected.sourceHash)fail('The journey source differs from the pinned build.',409,'RUN_BUILD_MISMATCH');
    return run;
  }
  function expectedForRun(build,run){
    if(!build||!run||run.environmentId===build.environmentId)return build;
    const target=store.getEntity('environment',build.environmentId,build.environmentVersion);
    const parent=target?.lifecycle==='temporary'?store.resolveConfiguredEnvironment?.(build.environmentId,build.environmentVersion):null;
    return parent&&run.executionInstance?.environmentId===parent.id?{...build,environmentId:parent.id,environmentVersion:parent.version}:build;
  }
  function presentBuild(build){
    const parent=store.resolveConfiguredEnvironment?.(build.environmentId,build.environmentVersion);
    if(!store.resolveConfiguredEnvironment)return build;
    return {...build,configuredEnvironment:parent?{id:parent.id,name:parent.name,version:parent.version,versionId:parent.versionId}:null,environmentKind:store.getEntity('environment',build.environmentId)?.lifecycle==='temporary'?'temporary':'configured'};
  }
  function personas(input,projectId,baseline,proposal,previous=[]){
    if(!Array.isArray(input)||!input.length||input.length>6)fail('Choose one to six personas.');
    const seen=new Set();
    const result=input.map(item=>{
      if(!plain(item))fail('Choose a persona.');rejectUnknown(item,['personaId','baselineRunId','proposalRunId']);
      const personaId=bounded(item.personaId,'Persona ID',160),entity=store.getEntity('persona',personaId);
      if(!entity||entity.projectId!==projectId)fail('Choose a persona in this app.',404,'NOT_FOUND');
      if(seen.has(personaId))fail('A persona appears more than once.');seen.add(personaId);
      const old=previous.find(row=>row.personaId===personaId),baselineRunId=optionalUuid(item.baselineRunId,'baseline journey'),proposalRunId=optionalUuid(item.proposalRunId,'proposal journey');
      if(old&&(old.baselineRunId&&old.baselineRunId!==baselineRunId||old.proposalRunId&&old.proposalRunId!==proposalRunId))fail('Recorded journey links are immutable. Create another review for a new run.',409,'IMMUTABLE_RUN_LINK');
      if(baselineRunId&&baselineRunId===proposalRunId)fail('Use independent journeys for baseline and proposal.');
      sourceRun(baselineRunId,projectId,personaId,baseline);sourceRun(proposalRunId,projectId,personaId,proposal);
      return {personaId,baselineRunId,proposalRunId};
    });
    if(previous.length&&(previous.length!==result.length||previous.some(row=>!seen.has(row.personaId))))fail('Keep the original persona set. Create another review for different coverage.',409,'IMMUTABLE_PERSONAS');
    return result;
  }
  async function fixLink(input,projectId){
    const fixId=optionalUuid(input.fixId,'fix'),roundId=optionalUuid(input.roundId,'fix round'),comparisonId=optionalUuid(input.comparisonId,'comparison');
    if(!fixId){if(roundId||comparisonId)fail('A repair round needs its fix.');return {fixId:null,roundId:null,comparisonId:null};}
    if(!roundId)fail('Pin the repair round.');
    let fix;try{fix=await getFix(fixId);}catch{fail('Fix not found.',404,'NOT_FOUND');}
    if(!fix||fix.projectId!==projectId)fail('Fix not found.',404,'NOT_FOUND');
    const round=fix.rounds?.find(row=>row.id===roundId);if(!round)fail('Fix round not found.',404,'NOT_FOUND');
    if(comparisonId&&![...(round.comparisons||[]),round.comparison].some(item=>item?.id===comparisonId))fail('Comparison does not belong to this repair round.',404,'NOT_FOUND');
    return {fixId,roundId,comparisonId};
  }
  async function write(record){
    const path=directory(record.id);await mkdir(path,{recursive:true,mode:0o700});
    const staged=join(path,`.staged-${randomUUID()}.json`);
    await writeFile(staged,JSON.stringify(record,null,2),{mode:0o600,flag:'wx'});
    // Publish a complete version atomically without ever replacing history.
    // Staged files remain retained; readers only inspect numbered versions.
    try{await link(staged,join(path,`${record.version}.json`));}catch(error){if(error.code==='EEXIST')fail('This review changed. Reload it before saving.',409,'VERSION_CONFLICT');throw error;}return record;
  }
  async function present(record){
    const scopedRun=id=>{const run=id?store.getRun(id):null;return run?.projectId===record.projectId?run:null;};
    const pairs=record.personas.map(item=>{const before=scopedRun(item.baselineRunId),after=scopedRun(item.proposalRunId);return deriveChangeImpactPair({...item,before,after,expected:{baseline:expectedForRun(record.baseline,before),proposal:expectedForRun(record.proposal,after)}});});
    let repair=null;
    if(record.fixId){
      let fix;try{fix=await getFix(record.fixId);}catch{}
      if(fix?.projectId===record.projectId){
        const round=fix.rounds?.find(row=>row.id===record.roundId),comparison=record.comparisonId?[...(round?.comparisons||[]),round?.comparison].find(item=>item?.id===record.comparisonId):round?.comparison;
        const repairPairs=record.personas.map(persona=>{
          const pair=(comparison?.pairs||[]).find(pair=>pair.personaId===persona.personaId)||{personaId:persona.personaId};
          const before=scopedRun(pair.beforeRunId)||pair.before,after=scopedRun(pair.afterRunId)||pair.after;
          const result=deriveChangeImpactPair({personaId:pair.personaId,personaName:pair.personaName,before:before?.projectId===record.projectId?before:null,after:after?.projectId===record.projectId?after:null,baselineRunId:pair.beforeRunId,proposalRunId:pair.afterRunId,expected:{baseline:{sourceHash:record.proposal.sourceHash}}});
          if(round?.integrityStatus==='invalidated'||round?.verification?.status==='invalidated'){result.controls={status:'mismatch',issues:[...result.controls.issues,'repair_candidate_invalidated']};result.outcomeChange='inconclusive';result.effortChange='unknown';result.metrics.actionDelta=null;}
          return result;
        });
        repair={fixId:fix.id,roundId:record.roundId,comparisonId:comparison?.id||record.comparisonId||null,status:repairPairs.length?reportStatus(repairPairs):'pending',fixStatus:fix.status,candidateHash:round?.candidateHash||null,approval:fix.approval||null,deliveryStatus:fix.deliveryStatus||'not_connected',pairs:repairPairs,provenance:'existing_fix_comparison'};
      }
    }
    const source=record.origin||origin();
    return {...record,origin:source,changeSummary:record.changeSummary??null,changes:record.changes||[],baseline:presentBuild(record.baseline),proposal:presentBuild(record.proposal),report:{status:reportStatus(pairs),pairs,summary:{personas:pairs.length,completedPairs:pairs.filter(pair=>pair.controls.status==='matched'&&pair.outcomeChange!=='inconclusive').length,inconclusivePairs:pairs.filter(pair=>pair.outcomeChange==='inconclusive').length,outcomeImprovements:pairs.filter(pair=>pair.outcomeChange==='improved').length,outcomeRegressions:pairs.filter(pair=>pair.outcomeChange==='regressed').length,fewerActionPairs:pairs.filter(pair=>pair.effortChange==='fewer_actions').length,moreActionPairs:pairs.filter(pair=>pair.effortChange==='more_actions').length},repair,limitations:[source.kind==='pull_request'?'Pull request metadata was supplied with this assessment; merge state does not establish deployment.':'Local proposed change; no external PR is connected or posted.','One independent synthetic journey per persona and variant; this does not establish human sentiment or causal improvement.','Source fingerprints identify recorded source files; deployment identity remains unverified unless separately established.','Fewer actions alone do not establish a better experience. Model wait time is not human hesitation.','Persona reactions are recorded simulation output, not measurements of real-user feelings.']}};
  }
  async function create(input){return exclusive(async()=>{
    rejectUnknown(input,['id','projectId','title','intent','origin','changeSummary','changes','baseline','proposal','personas','fixId','roundId','comparisonId']);
    const projectId=project(input.projectId),id=input.id?uuid(input.id,'change impact'):randomUUID();
    try{await raw(id,projectId);fail('A change impact with this ID already exists.',409,'ALREADY_EXISTS');}catch(error){if(error.code!=='NOT_FOUND')throw error;}
    const baseline=build(input.baseline,projectId,'baseline'),proposal=build(input.proposal,projectId,'proposal');
    if(baseline.sourceHash===proposal.sourceHash)fail('The baseline and proposal need distinct source identities.');
    const at=stamp(),source=origin(input.origin),record={id,projectId,title:bounded(input.title,'Title',180),intent:bounded(input.intent,'Change intent',3000),kind:source.kind==='pull_request'?'pull_request':'local_proposal',provider:source.provider||'not_connected',origin:source,changeSummary:changeSummary(input.changeSummary),changes:changeList(input.changes),version:1,createdAt:at,updatedAt:at,baseline,proposal,personas:personas(input.personas,projectId,baseline,proposal),...await fixLink(input,projectId)};
    await write(record);return present(record);
  });}
  async function update(id,input){return exclusive(async()=>{
    rejectUnknown(input,['projectId','expectedVersion','title','intent','origin','changeSummary','changes','personas','fixId','roundId','comparisonId']);
    const record=await raw(id,project(input.projectId));
    if(input.expectedVersion!==record.version)fail('This review changed. Reload it before saving.',409,'VERSION_CONFLICT');
    const next={...record,version:record.version+1,updatedAt:stamp()};
    if(input.title!==undefined)next.title=bounded(input.title,'Title',180);if(input.intent!==undefined)next.intent=bounded(input.intent,'Change intent',3000);
    if(input.origin!==undefined){next.origin=originUpdate(record.origin,input.origin);next.kind=next.origin.kind==='pull_request'?'pull_request':'local_proposal';next.provider=next.origin.provider||'not_connected';}
    if(input.changeSummary!==undefined)next.changeSummary=changeSummary(input.changeSummary);
    if(input.changes!==undefined)next.changes=changeList(input.changes);
    if(input.personas!==undefined)next.personas=personas(input.personas,record.projectId,record.baseline,record.proposal,record.personas);
    if(['fixId','roundId','comparisonId'].some(key=>Object.hasOwn(input,key)))Object.assign(next,await fixLink({...record,...input},record.projectId));
    await write(next);return present(next);
  });}
  async function get(id,projectId,version){return present(await raw(id,projectId,version));}
  async function list(projectId){project(projectId);let entries;try{entries=await readdir(root,{withFileTypes:true});}catch{return [];}
    const records=[];for(const entry of entries.filter(item=>item.isDirectory()&&UUID.test(item.name))){try{records.push(await get(entry.name,projectId));}catch(error){if(error.code!=='NOT_FOUND')throw error;}}
    return records.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  }
  return {create,update,get,list};
}
