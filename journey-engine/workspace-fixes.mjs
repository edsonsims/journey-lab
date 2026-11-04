import { access, copyFile, lstat, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFixPrompt, buildFixContext, selectFixEvaluatorMemory, configuredCheck, configuredPreview, copySource, executeMuse, manifestHash, processEnvironment, runProcess, sourceManifest } from './workspace-fix-runtime.mjs';
import { sourceFingerprint } from './workspace-execution.mjs';
import { effectiveExecutionPolicy } from './library-context.mjs';
import { createJourneyAlignmentStore } from './journey-alignment-store.mjs';
import { copyBrowserConfiguration, networkConditionsMatch } from './browser-device.mjs';

const HERE=dirname(fileURLToPath(import.meta.url));
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUSY=new Set(['queued','preparing','running','verifying','retesting']);
const now=()=>new Date().toISOString();
const clone=x=>structuredClone(x);
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));return true;};
async function readJson(path){return JSON.parse(await readFile(path,'utf8'));}
async function body(req){let text='',n=0;for await(const part of req){n+=part.length;if(n>32000)throw fail('Request is too large.',413);text+=part;}try{const x=JSON.parse(text||'{}');if(!x||typeof x!=='object'||Array.isArray(x))throw Error();return x;}catch{throw fail('A JSON object is required.');}}
const trimmed=(x,n=8000)=>typeof x==='string'?x.trim().slice(0,n):'';
const sameBuild=(a,b)=>{
  if(a.productFingerprint&&b.productFingerprint&&Object.keys(a.productFingerprint).length&&Object.keys(b.productFingerprint).length)return JSON.stringify(Object.entries(a.productFingerprint).sort())===JSON.stringify(Object.entries(b.productFingerprint).sort());
  return Boolean(a.buildId&&a.buildId===b.buildId);
};
function presentFix(fix,port,previews){
  const result=clone(fix);
  delete result.sourceRun;delete result.sourceFinding;delete result.environment;delete result.charter;delete result.legacySource;delete result.retestSources;
  result.rounds=result.rounds.map(r=>{
    const x={...r};delete x.directory;delete x.baselineDirectory;delete x.candidateDirectory;delete x.candidateManifest;delete x.baselineManifest;
    const before=previews.get(`${r.id}:before`),after=previews.get(`${r.id}:after`);
    const live=p=>p&&(!p.isAvailable||p.isAvailable());
    // Preview URLs are runtime presentation state, never historical media identity.
    x.baselineUrl=live(before)?before.url:null;x.candidateUrl=live(after)?after.url:null;
    if(r.legacy&&r.status==='awaiting_review'&&r.integrityStatus!=='invalidated'&&r.verification?.status!=='invalidated'){
      x.baselineUrl||=`http://localhost:${port}/improvements/${fix.id}/baseline/`;
      x.candidateUrl||=`http://localhost:${port}/improvements/${fix.id}/candidate/`;
    }
    x.previewStatus=x.baselineUrl&&x.candidateUrl?'available':'not_running';
    x.previewUnavailable=x.previewStatus!=='available';
    x.previewStartUrl=`/api/workspace/fixes/${fix.id}/preview`;
    x.previewStopUrl=x.previewStartUrl;x.previewCanStop=Boolean(live(before)||live(after));
    x.previewMessage=x.previewUnavailable?'Preview is not running. Start it to reopen the recorded source version.':null;
    return x;
  });
  result.latestRound=result.rounds.find(r=>r.id===result.currentRoundId)||result.rounds.at(-1);
  result.openComments=result.comments.filter(x=>!x.resolved).length;
  result.roundCount=result.rounds.length;
  return result;
}

export function createWorkspaceFixes({root,store,getRun,runVariant,port=4319,configured=()=>Boolean(process.env.MODEL_API_KEY||process.env.META_API_KEY),cliPath=resolve(HERE,'../.tools/bin/muse'),runsDir=resolve(HERE,'runs'),legacyImprovementsRoot=resolve(HERE,'../improvement/workspaces'),legacyComparisonsDir=resolve(HERE,'comparisons'),generate=executeMuse,preview=configuredPreview,previewTtlMs=15*60*1000}={}){
  root=resolve(root||join(HERE,'workspace-data','fixes'));runsDir=resolve(runsDir);
  const cache=new Map(),previews=new Map(),previewTimers=new Map(),active=new Set(),writes=new Map(),mutations=new Map();let ready=null,queue=Promise.resolve();
  const publicFix=fix=>presentFix(fix,port,previews);
  getRun ||= id=>store.getRun(id);
  const save=async fix=>{fix.updatedAt=now();const text=JSON.stringify(fix,null,2);cache.set(fix.id,fix);const write=(writes.get(fix.id)||Promise.resolve()).catch(()=>{}).then(async()=>{await mkdir(join(root,fix.id),{recursive:true,mode:0o700});const tmp=join(root,fix.id,`fix-${randomUUID()}.tmp`);await writeFile(tmp,text,{mode:0o600});await rename(tmp,join(root,fix.id,'fix.json'));});writes.set(fix.id,write);await write;};
  const mutate=(key,fn)=>{const task=(mutations.get(key)||Promise.resolve()).catch(()=>{}).then(fn);mutations.set(key,task);return task.finally(()=>{if(mutations.get(key)===task)mutations.delete(key);});};
  const history=(fix,type,data={})=>fix.history.push({id:randomUUID(),at:now(),type,...data});
  const current=fix=>fix.rounds.find(x=>x.id===fix.currentRoundId);
  const normalizedComparison=async c=>({id:c.id,status:c.status,createdAt:c.createdAt,completedAt:c.completedAt,alignment:'independent recordings; select equivalent moments explicitly',pairs:await Promise.all((c.pairs||[{personaId:null,baselineRunId:c.baselineRunId,candidateRunId:c.candidateRunId}]).map(async p=>({personaId:p.personaId,personaName:p.persona?.name||p.persona?.label||p.personaId,beforeRunId:p.baselineRunId,afterRunId:p.candidateRunId,before:await getRun(p.baselineRunId),after:await getRun(p.candidateRunId)})))});

  async function initialize(){
    await mkdir(root,{recursive:true,mode:0o700});
    for(const entry of await readdir(root,{withFileTypes:true})){
      if(!entry.isDirectory()||!UUID.test(entry.name))continue;
      try{const fix=await readJson(join(root,entry.name,'fix.json'));if(fix.id!==entry.name)continue;
        // Older rounds stored only the last 16 KB of the patch; the full patch is kept beside the round.
        for(const r of fix.rounds||[])if(r?.directory&&typeof r.diff==='string'){const full=await readFile(join(r.directory,'changes.patch'),'utf8').catch(()=>null);if(full&&full.length>r.diff.length)r.diff=full.slice(0,1_000_000);}
        if(BUSY.has(fix.status)){fix.status='interrupted';const r=current(fix);if(r&&BUSY.has(r.status))r.status='interrupted';if(r?.comparison?.status==='running')r.comparison.status='interrupted';for(const c of r?.comparisons||[])if(c.status==='running')c.status='interrupted';fix.error='The service stopped before this work finished. Its files and evidence are preserved.';history(fix,'interrupted');await save(fix);}else cache.set(fix.id,fix);
      }catch{}
    }
    let legacy=[];try{legacy=await readdir(legacyImprovementsRoot,{withFileTypes:true});}catch{}
    let comparisonFiles=[];try{comparisonFiles=await readdir(legacyComparisonsDir,{withFileTypes:true});}catch{}
    const comparisons=[];for(const d of comparisonFiles){if(d.isDirectory()&&UUID.test(d.name))try{comparisons.push(await readJson(join(legacyComparisonsDir,d.name,'comparison.json')));}catch{}}
    for(const d of legacy){
      if(!d.isDirectory()||!UUID.test(d.name)||cache.has(d.name))continue;
      try{
        const base=join(legacyImprovementsRoot,d.name),status=await readJson(join(base,'status.json'));if(status.experimentId!==d.name)continue;
        const run=await getRun(status.sourceRunId);if(!run)continue;
        const finding=run.findings?.[0]||(await store?.listFindings?.({runId:run.id}))?.[0];
        const candidate=join(base,'candidate'),baseline=join(base,'baseline');
        const manifest=await sourceManifest(candidate),baselineManifest=await sourceManifest(baseline);
        const matching=comparisons.filter(c=>c.improvementId===d.name).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0];
        const comparison=matching?await normalizedComparison(matching):null;
        const recorded=status.verification?.candidateFingerprint||matching?.candidateFingerprint;
        const intact=recorded&&Object.entries(recorded).every(([name,sha])=>manifest[name]===sha);
        const verification=clone(status.verification||{status:'not_configured',checks:[]});
        if(recorded&&!intact)verification.status='invalidated';
        const round={id:randomUUID(),number:1,status:status.status==='awaiting_review'?'awaiting_review':BUSY.has(status.status)?'interrupted':status.status||'failed',createdAt:status.createdAt||now(),finishedAt:status.finishedAt||null,directory:base,baselineDirectory:baseline,candidateDirectory:candidate,candidateHash:manifestHash(manifest),candidateManifest:manifest,baselineManifest,summary:(await readFile(join(candidate,'IMPROVEMENT.md'),'utf8').catch(()=>'' )).slice(0,32000),diff:(await readFile(join(base,'changes.patch'),'utf8').catch(()=>'' )).slice(0,64000),changedFiles:status.changedFiles||[],verification,comparison,comparisons:comparison?[comparison]:[],legacy:true,model:'muse-spark-1.3',candidateUrl:`http://localhost:${port}/improvements/${d.name}/candidate/`,baselineUrl:`http://localhost:${port}/improvements/${d.name}/baseline/`};
        const fix={id:d.name,projectId:run.projectId||'little-steps',title:round.summary.match(/^#\s+(.+)$/m)?.[1]||'LittleSteps improvement',findingId:finding?.id||`finding-${run.id}-0`,runId:run.id,sourceRunIds:status.sourceRunIds||[run.id],status:round.status,createdAt:status.createdAt||now(),updatedAt:status.finishedAt||status.createdAt||now(),currentRoundId:round.id,rounds:[round],comments:[],history:[{id:randomUUID(),at:now(),type:'legacy_import',sourceId:d.name}],deliveryStatus:'not_connected',approval:null,sourceRun:run,sourceFinding:finding||{observation:run.finding?.observation,interpretation:run.finding?.interpretation},environment:run.environmentSnapshot||{},charter:run.charterSnapshot||{},legacySource:base};
        await save(fix);
        try{await store?.updateFinding?.(fix.findingId,{fixId:fix.id,reason:'Linked preserved legacy candidate.'});}catch{}
      }catch{}
    }
  }
  const ensure=()=>ready||=(initialize());
  async function load(id){await ensure();const fix=cache.get(id);if(!fix)throw fail('Fix not found.',404);return fix;}
  const alignmentReviews=createJourneyAlignmentStore({root,getFix:load,getRun});
  const assertIdle=fix=>{if(active.has(fix.id)||BUSY.has(fix.status))throw fail('This fix is already being worked on.',409);};
  async function assertCanGenerate(){if(!configured())throw fail('Configure the Meta key before generating a fix.',503);if(generate===executeMuse)try{await access(cliPath,constants.X_OK);}catch{throw fail('Muse Code is not available on this machine.',503);}}
  async function environmentFor(run){if(run.environmentSnapshot?.repositoryPath)return clone(run.environmentSnapshot);let env=run.environmentSnapshot||{};if(run.environmentId)env=await store?.getEntity?.('environment',run.environmentId,run.environmentVersion)||env;return clone(env);}
  async function sourceFor(fix){
    let path=fix.environment.repositoryPath||fix.sourceRun.productDirectory;
    if(!path&&fix.sourceRun.scenarioId&&new URL(fix.sourceRun.target||'http://invalid').hostname==='127.0.0.1'&&new URL(fix.sourceRun.target).port==='4320')path=resolve(HERE,'../little-steps');
    if(!path)throw fail('Connect the environment to its local source directory before generating a fix.',409);
    const stat=await lstat(path).catch(()=>null);if(!stat?.isDirectory()||stat.isSymbolicLink())throw fail('The environment source directory is unavailable.',409);return resolve(path);
  }
  async function assertHash(round){const actual=manifestHash(await sourceManifest(round.candidateDirectory));if(actual!==round.candidateHash)throw fail('The candidate changed after its recorded checks. Create and retest a new round before approval.',409);return actual;}
  async function evidenceBundle(fix,round,comments=[]){
    const evidence=[],paths=[];await mkdir(join(round.directory,'evidence'),{recursive:true,mode:0o700});
    const refs=(fix.sourceRun.events||[]).filter(e=>e.type==='screenshot'&&e.screenshot).filter((e,i,a)=>i===0||i===a.length-1||fix.sourceRun.finding?.evidence_indices?.includes(e.index)).slice(0,4).map(e=>({artifactUrl:e.screenshot,eventIndex:e.index,observation:e.label}));
    for(const c of comments)if(c.artifactUrl)refs.push({artifactUrl:c.artifactUrl,originalMs:c.originalMs,x:c.x,y:c.y,commentId:c.id});
    for(const ref of refs.slice(0,8)){
      const m=ref.artifactUrl.match(/^\/runs\/([0-9a-f-]{36})\/([\w.-]+\.(png|webm|mp4))$/i);if(!m)continue;
      const source=join(runsDir,m[1],m[2]),stat=await lstat(source).catch(()=>null);if(!stat?.isFile()||stat.isSymbolicLink())continue;
      const name=`${evidence.length}-${m[1]}-${m[2].replace(/\.(webm|mp4)$/i,'.png')}`,path=join(round.directory,'evidence',name);
      if(m[3].toLowerCase()==='png')await copyFile(source,path);
      else{
        if(!Number.isFinite(ref.originalMs))continue;
        const result=await runProcess('ffmpeg',['-hide_banner','-loglevel','error','-ss',String(ref.originalMs/1000),'-i',source,'-frames:v','1',path],{env:processEnvironment(),timeoutMs:20000});
        if(result.code!==0)continue;
      }
      paths.push(path);evidence.push({...ref,file:name});
    }
    return {evidence,paths};
  }
  const beginJob=(fix,work)=>{
    active.add(fix.id);
    queue=queue.catch(()=>{}).then(async()=>{try{await work();}catch(error){fix.status='failed';fix.error=String(error.message||error).slice(0,1000);const r=current(fix);if(r&&BUSY.has(r.status)){r.status='failed';r.error=fix.error;r.finishedAt=now();}history(fix,'work_failed',{error:fix.error});await save(fix);}finally{active.delete(fix.id);}});
  };
  async function makePreview(dir,key,environment,logPath){
    const previous=previews.get(key);if(previous&&(!previous.isAvailable||previous.isAvailable()))return previous;
    if(previous){await previous.close();previews.delete(key);}
    const result=await preview(dir,environment,logPath);previews.set(key,result);return result;
  }
  async function closeRoundPreviews(roundId){
    clearTimeout(previewTimers.get(roundId));previewTimers.delete(roundId);
    const instances=['before','after'].map(side=>{const key=`${roundId}:${side}`;return {key,instance:previews.get(key)};}).filter(item=>item.instance);
    const closed=await Promise.allSettled(instances.map(({instance})=>instance.close()));
    closed.forEach((result,index)=>{const {key,instance}=instances[index];if(result.status==='fulfilled'&&previews.get(key)===instance)previews.delete(key);});
    const errors=closed.filter(result=>result.status==='rejected').map(result=>result.reason);
    if(errors.length)throw new AggregateError(errors,'A temporary preview could not be stopped.');
  }
  function expirePreview(fixId,roundId){
    clearTimeout(previewTimers.get(roundId));
    const timer=setTimeout(()=>{void mutate(`fix:${fixId}`,()=>closeRoundPreviews(roundId)).catch(()=>{});},Math.max(1,previewTtlMs));
    timer.unref?.();previewTimers.set(roundId,timer);
  }
  async function startPreviewInternal(id,input={}){
    const fix=await load(id);assertIdle(fix);const round=fix.rounds.find(r=>r.id===(input.roundId||fix.currentRoundId));
    if(!round)throw fail('Choose an existing fix round.');
    try{
      await assertHash(round);
      if(!round.baselineManifest||manifestHash(await sourceManifest(round.baselineDirectory))!==manifestHash(round.baselineManifest))throw fail('The baseline changed after its recorded snapshot. Preview cannot claim to show the tested source.',409);
      await makePreview(round.baselineDirectory,`${round.id}:before`,fix.environment,join(round.directory,'baseline-preview.log'));
      await makePreview(round.candidateDirectory,`${round.id}:after`,fix.environment,join(round.directory,'candidate-preview.log'));
      // A configured startup command may write files; do not claim the original hash if it changed source.
      await assertHash(round);
      if(manifestHash(await sourceManifest(round.baselineDirectory))!==manifestHash(round.baselineManifest))throw fail('Preview startup changed the baseline source. A fresh verification is required.',409);
      history(fix,'preview_started',{roundId:round.id});await save(fix);expirePreview(fix.id,round.id);return publicFix(fix);
    }catch(error){await closeRoundPreviews(round.id);throw error;}
  }
  async function retestSources(fix){
    const sources=clone(fix.retestSources||[]);for(const id of fix.sourceRunIds){const run=await getRun(id);if(run&&!sources.some(item=>(item.personaId||item.persona?.id)===(run.personaId||run.persona?.id)))sources.push(clone(run));}
    if(!sources.length)sources.push(clone(fix.sourceRun));return sources;
  }
  function retestLimits(input,sources){
    if(input===undefined)return null;
    if(!input||typeof input!=='object'||Array.isArray(input)||!Object.keys(input).length||Object.keys(input).some(key=>!['maxSteps','maxTokens','maxDurationMs'].includes(key)))throw fail('Retest limits must contain only action, token and time caps.');
    for(const [key,value]of Object.entries(input)){
      if(!Number.isSafeInteger(value)||value<1)throw fail('Retest caps must be positive integers.');
      if(sources.some(source=>value>effectiveExecutionPolicy(source)[key]))throw fail(`The retest ${key} cannot exceed any pinned persona’s execution cap.`,409);
    }
    return clone(input);
  }
  async function retest(fix,round,limits=null){
    await closeRoundPreviews(round.id);
    await assertHash(round);
    if(typeof runVariant!=='function')throw fail('The browser retest worker is not connected.',503);
    const environmentUsesServer=Boolean(fix.environment.startCommand?.trim());
    if(environmentUsesServer&&fix.environment.allowMutations&&!['stateless-demo','isolated-per-run','isolated-test-data'].includes(fix.environment.isolation))throw fail('Configure isolated server-side test data before comparing a mutating app. Separate browsers alone do not isolate its records.',409);
    let comparison;
    try{
      const before=await makePreview(round.baselineDirectory,`${round.id}:before`,fix.environment,join(round.directory,'baseline-preview.log')),after=await makePreview(round.candidateDirectory,`${round.id}:after`,fix.environment,join(round.directory,'candidate-preview.log'));
      round.baselineUrl=before.url;round.candidateUrl=after.url;
      comparison={id:randomUUID(),status:'running',createdAt:now(),pairs:[],alignment:'independent recordings; milestone alignment requires observed matching events',...(limits?{controlOverrides:{limits:clone(limits),appliesTo:'both variants and every selected persona'},limitations:['Reviewer requested stricter action, token or time caps. Original Library snapshots are unchanged; outcomes apply to these bounded sessions.']}: {})};
      round.comparisons||=[];round.comparisons.push(comparison);round.comparison=comparison;round.status='retesting';fix.status='retesting';await save(fix);
      const sourceRuns=await retestSources(fix);
      for(const original of sourceRuns){
        const persona=original.personaSnapshot||original.persona;if(!persona)throw Error('The source Run has no pinned persona.');
        const pair={personaId:original.personaId||persona.id,personaName:original.personaName||persona.name||persona.label||persona.id,beforeRunId:randomUUID(),afterRunId:randomUUID(),before:null,after:null};comparison.pairs.push(pair);await save(fix);
        const externalOrigins=environmentUsesServer?(fix.environment.allowedOrigins||[]).filter(x=>{try{return new URL(x).origin!==new URL(fix.environment.url).origin;}catch{return false;}}):[];
        const environment={...fix.environment,...(!environmentUsesServer?{authStatePath:'',storageStatePath:''}:{}),allowedOrigins:[new URL(before.url).origin,...externalOrigins],dataPolicy:environmentUsesServer?fix.environment.dataPolicy:'isolated static preview; fresh browser session'};
        const control=limits?{executionPolicy:{...effectiveExecutionPolicy(original),...limits}}:{};
        pair.before=await runVariant({id:pair.beforeRunId,projectId:fix.projectId,sourceRun:original,persona,environment:{...environment,url:before.url},charter:original.charterSnapshot||fix.charter,target:before.url,allowedOrigins:[new URL(before.url).origin,...externalOrigins],productDirectory:round.baselineDirectory,variant:'before',comparisonId:comparison.id,...control});await save(fix);
        await assertHash(round);
        pair.after=await runVariant({id:pair.afterRunId,projectId:fix.projectId,sourceRun:original,persona,environment:{...environment,url:after.url,allowedOrigins:[new URL(after.url).origin,...externalOrigins]},charter:original.charterSnapshot||fix.charter,target:after.url,allowedOrigins:[new URL(after.url).origin,...externalOrigins],productDirectory:round.candidateDirectory,variant:'after',comparisonId:comparison.id,...control});await save(fix);
        await assertHash(round);
      }
      comparison.completedAt=now();
      for(const pair of comparison.pairs)pair.browserConditions={status:networkConditionsMatch(pair.before,pair.after)?'matched':'mismatch'};
      comparison.status=comparison.pairs.every(p=>['finished','completed'].includes(p.before?.status)&&['finished','completed'].includes(p.after?.status)&&p.browserConditions.status==='matched')?'completed':'inconclusive';
      const outcomes=comparison.pairs.map(p=>({personaId:p.personaId,before:p.before?.finding?.outcome||p.before?.outcome,after:p.after?.finding?.outcome||p.after?.outcome}));
      round.verification={...round.verification,retest:{status:comparison.status,at:now(),outcomes,limitations:'Observed synthetic outcomes for these independent sessions, not real-user impact.'}};
      round.status='awaiting_review';round.finishedAt=now();fix.status='awaiting_review';history(fix,'retested',{roundId:round.id,comparisonId:comparison.id});await save(fix);
    }catch(error){
      if(comparison){comparison.status='failed';comparison.completedAt=now();}
      throw error;
    }finally{await closeRoundPreviews(round.id);}
  }
  async function requestRetest(id,input={}){
    return mutate(`fix:${id}`,async()=>{
      const fix=await load(id);assertIdle(fix);if(input.projectId&&input.projectId!==fix.projectId)throw fail('The fix belongs to another app.');
      if(!configured())throw fail('Configure the Meta key before retesting.',503);
      const limits=retestLimits(input.limits,await retestSources(fix)),round=current(fix);await assertHash(round);
      fix.status='queued';round.status='queued';fix.approval=null;fix.deliveryStatus='not_connected';history(fix,'retest_requested',{roundId:round.id,limits});await save(fix);beginJob(fix,()=>retest(fix,round,limits));return publicFix(fix);
    });
  }
  async function generateRound(fix,round,previous,comments){
    fix.status='preparing';round.status='preparing';await save(fix);
    const baselineSource=previous?previous.baselineDirectory:await sourceFor(fix),candidateSource=previous?previous.candidateDirectory:baselineSource;
    if(previous)await assertHash(previous);
    if(!previous&&fix.sourceRun.productFingerprint){
      const actual=fix.sourceRun.sourceIdentity?.status==='source_recorded'?await sourceFingerprint(baselineSource):await sourceManifest(baselineSource),recorded=fix.sourceRun.productFingerprint;
      const matches=fix.sourceRun.sourceIdentity?.status==='source_recorded'?JSON.stringify(Object.entries(recorded).sort())===JSON.stringify(Object.entries(actual||{}).sort()):Object.entries(recorded).every(([name,value])=>actual[name]===value);
      if(!matches)throw fail('The connected source changed after this finding. Run the current version before generating a fix.',409);
      round.sourceMatch='recorded-source-matched';
    }else round.sourceMatch=previous?.sourceMatch||'unverified';
    round.baselineManifest=await copySource(baselineSource,round.baselineDirectory);await copySource(candidateSource,round.candidateDirectory);
    const {evidence,paths}=await evidenceBundle(fix,round,comments);
    round.feedbackSnapshot={message:round.requestMessage||'',comments:clone(comments),capturedAt:now()};
    const supporting=(fix.retestSources||[]).filter(x=>x.personaId!==fix.sourceRun.personaId).map(x=>({persona:x.persona,browserConfiguration:copyBrowserConfiguration(x),recordedFinding:x.finding||null,sourceRunId:x.id||null,contextSource:x.supportProfileOnly?'pinned mission persona; no previous observation':'matching recorded Run'}));
    const selectedEvaluatorMemory=selectFixEvaluatorMemory({finding:fix.sourceFinding,run:fix.sourceRun});
    const promptContext=buildFixContext({finding:fix.sourceFinding,run:fix.sourceRun,charter:fix.charter,feedback:round.feedbackSnapshot,evidence,supporting,evaluatorMemory:selectedEvaluatorMemory});
    round.evaluatorMemory=promptContext.evaluatorMemory;
    round.contextBudget={maxCharacters:48000,characters:JSON.stringify(promptContext,null,2).length,omissions:clone(promptContext.omissions)};
    history(fix,'evaluator_memory_selected',{roundId:round.id,snapshotId:round.evaluatorMemory?.snapshotId||selectedEvaluatorMemory.snapshotId,sourceRunId:fix.sourceRun.id,entries:(round.evaluatorMemory?.entries||[]).map(({id,version,versionId})=>({id,version,versionId})),screenEventIndices:(round.evaluatorMemory?.screens||[]).map(screen=>screen.eventIndex),omissions:clone(promptContext.omissions)});
    let prompt=buildFixPrompt({revision:Boolean(previous),context:promptContext});
    if(round.designProposal){const proposal=round.designProposal;const target=join(round.directory,'design-proposal.png');await copyFile(join(dirname(root),'media-assist',proposal.id+'.png'),target);paths.push(target);prompt+='\nSelected design concept (not observed behavior or test evidence): '+JSON.stringify({id:proposal.id,source:proposal.source,request:proposal.prompt})+'\nThe final attached image is the requested visual proposal. Treat any generated prices, labels or business facts as unverified; preserve source business rules and use verified values from the code or mission. Implement its relevant changes while preserving the acceptance contract; do not claim the concept has been tested.';}
    const promptPath=join(round.directory,'prompt.txt');await writeFile(promptPath,prompt,{mode:0o600});
    round.status='running';fix.status='running';round.startedAt=now();await save(fix);
    Object.assign(round,await generate({candidate:round.candidateDirectory,baseline:round.baselineDirectory,promptPath,evidencePaths:paths,cliPath,roundDir:round.directory}));
    if(round.contract?.title)fix.title=trimmed(round.contract.title,200);
    round.status='verifying';fix.status='verifying';await save(fix);
    const baselineBuild=await configuredCheck(fix.environment.buildCommand,round.baselineDirectory,round.directory,'baseline-build');
    const build=await configuredCheck(fix.environment.buildCommand,round.candidateDirectory,round.directory,'build');
    const check=await configuredCheck(fix.environment.testCommand,round.candidateDirectory,round.directory,'test');
    round.baselineManifest=await sourceManifest(round.baselineDirectory);
    round.candidateManifest=await sourceManifest(round.candidateDirectory);round.candidateHash=manifestHash(round.candidateManifest);
    round.verification={status:[baselineBuild.status,build.status,check.status].includes('failed')?'failed':check.status==='passed'?'passed':'not_configured',baselineBuild,build,checks:check.checks||[],message:check.message,at:now()};await save(fix);
    if(round.verification.status==='failed'){round.status='awaiting_review';fix.status='awaiting_review';history(fix,'verification_failed',{roundId:round.id});await save(fix);return;}
    await retest(fix,round);
  }
  function newRound(fix,message=''){
    const id=randomUUID(),directory=join(root,fix.id,'rounds',id);
    return {id,number:fix.rounds.length+1,status:'queued',createdAt:now(),directory,baselineDirectory:join(directory,'baseline'),candidateDirectory:join(directory,'candidate'),candidateHash:null,changedFiles:[],summary:null,diff:null,verification:{status:'pending',checks:[]},comparisons:[],requestMessage:message};
  }
  async function createInternal(input){
    await ensure();await assertCanGenerate();
    const finding=await store.getFinding(input.findingId);if(!finding)throw fail('Finding not found.',404);
    const run=await getRun(finding.runId);if(!run)throw fail('The source Run is unavailable.',404);
    if(run.integrityStatus==='invalidated'||!['finished','completed'].includes(run.status))throw fail('Use a completed Run with intact recorded evidence.',409);
    if(input.projectId&&input.projectId!==run.projectId)throw fail('Finding belongs to another app.',403);
    const existing=[...cache.values()].find(x=>x.findingId===finding.id&&!['failed','interrupted'].includes(x.status));if(existing)return publicFix(existing);
    const environment=await environmentFor(run),charter=run.charterSnapshot||{};
    const fix={id:randomUUID(),projectId:run.projectId||'little-steps',title:trimmed(finding.title||'Improve this experience',200),findingId:finding.id,runId:run.id,sourceRunIds:[run.id],status:'queued',createdAt:now(),updatedAt:now(),rounds:[],comments:[],history:[],deliveryStatus:'not_connected',approval:null,sourceRun:clone(run),sourceFinding:clone(finding),environment,charter};
    await sourceFor(fix);
    const runEnvironment=record=>store?.resolveConfiguredEnvironment?.(record.environmentId,record.environmentVersion)||{id:record.environmentId,version:record.environmentVersion};
    const configuredEnvironment=runEnvironment(run);
    const compatible=support=>support?.projectId===fix.projectId&&runEnvironment(support).id===configuredEnvironment.id&&runEnvironment(support).version===configuredEnvironment.version&&['finished','completed'].includes(support.status)&&support.integrityStatus!=='invalidated'&&sameBuild(support,run);
    const required=[...new Set([run.personaId,...(charter.requiredPersonaIds||[])])];
    const selected=[...new Set([...required,...(charter.personaIds||[])])];
    const explicit=input.supportRunIds;
    if(explicit!==undefined&&(!Array.isArray(explicit)||explicit.some(x=>typeof x!=='string')||explicit.length>5))throw fail('Supply up to five supporting Run IDs.');
    if(explicit){for(const id of explicit){const support=await getRun(id);if(compatible(support))fix.sourceRunIds.push(id);else throw fail('A supporting Run must have the same app, environment version and recorded product build.');}}
    else{
      const candidates=await store?.listRuns?.({projectId:fix.projectId,environmentId:run.environmentId,limit:500})||[];
      const seen=new Set([run.personaId]);
      for(const summary of candidates){if(seen.has(summary.personaId)||selected.length>1&&!selected.includes(summary.personaId))continue;const support=await getRun(summary.id);if(compatible(support)){fix.sourceRunIds.push(support.id);seen.add(support.personaId);}if(seen.size>=6)break;}
    }
    fix.retestSources=[];for(const id of [...new Set(fix.sourceRunIds)])fix.retestSources.push(clone(await getRun(id)));
    for(const personaId of selected){
      if(fix.retestSources.some(x=>x.personaId===personaId))continue;
      const persona=await store?.getEntity?.('persona',personaId);
      if(!persona||persona.archived||persona.projectId!==fix.projectId){
        if(required.includes(personaId))throw fail('A required mission persona is unavailable. Restore it or run an updated mission before fixing.',409);
        continue;
      }
      // A supporting profile has its own permitted knowledge. Pin it once while
      // creating the fix; before and after must not re-resolve after publication.
      const memoryEnvironment=run.environmentSnapshot||environment;
      const memorySnapshot=store.memory&&memoryEnvironment.projectId===fix.projectId&&charter.projectId===fix.projectId
        ?store.memory.resolveSnapshot({projectId:fix.projectId,environment:memoryEnvironment,persona,charter,buildId:store.memory.buildIdentity(run)})
        :null;
      fix.retestSources.push({...clone(run),id:null,personaId,personaName:persona.name||persona.label,personaVersion:persona.version,personaVersionId:persona.versionId,persona:clone(persona),personaSnapshot:clone(persona),...(store.resolveBrowserConfiguration?store.resolveBrowserConfiguration(persona):{viewport:clone(persona.viewport||run.viewport)}),memorySnapshotId:memorySnapshot?.id||null,memorySnapshot,memoryReferenceUrl:run.memoryReferenceUrl||run.target,memoryLearnings:undefined,memoryPublicationSummary:undefined,finding:null,findings:[],events:[],finalMessage:null,supportProfileOnly:true});
    }
    fix.retestPlan=fix.retestSources.map(x=>({personaId:x.personaId,personaName:x.personaName||x.persona?.name||x.persona?.label,sourceRunId:x.id||null,profileVersion:x.personaVersion||null,reason:x.supportProfileOnly?(required.includes(x.personaId)?'required by saved mission':'suggested by saved mission'):'recorded compatible baseline'}));
    fix.sourceRunIds=[...new Set(fix.sourceRunIds)];const round=newRound(fix);fix.rounds.push(round);fix.currentRoundId=round.id;history(fix,'created',{findingId:finding.id});await save(fix);
    try{await store.updateFinding(finding.id,{fixId:fix.id,reason:'Requested an isolated improvement.'});}catch{}
    beginJob(fix,()=>generateRound(fix,round,null,[]));return publicFix(fix);
  }
  async function addCommentInternal(id,input){
    const fix=await load(id),round=fix.rounds.find(x=>x.id===input.roundId);if(!round)throw fail('Choose an existing fix round.');
    const content=trimmed(input.body);if(!content)throw fail('Write a comment first.');
    const artifactUrl=trimmed(input.artifactUrl||input.artifactId,500);
    if(artifactUrl){
      const m=artifactUrl.match(/^\/runs\/([0-9a-f-]{36})\/([\w.-]+\.(?:png|webm|mp4))$/i);if(!m)throw fail('Select a recorded screenshot or video from this fix.');
      const allowed=new Set([...fix.sourceRunIds,...(round.comparisons||[]).flatMap(c=>c.pairs.flatMap(p=>[p.beforeRunId,p.afterRunId]))]);if(!allowed.has(m[1]))throw fail('That artifact belongs to another fix or round.');
      const r=await getRun(m[1]);const urls=new Set([r?.video,r?.replay,...(r?.events||[]).map(e=>e.screenshot)].filter(Boolean));if(!urls.has(artifactUrl))throw fail('The artifact is not recorded in its Run.');
      if(artifactUrl===r?.replay&&r?.replay!==r?.video)throw fail('Anchor video comments to the original recording; convert condensed time before submitting.');
    }
    const originalMs=input.originalMs==null?null:Number(input.originalMs);if(originalMs!==null&&(!Number.isFinite(originalMs)||originalMs<0||originalMs>86_400_000))throw fail('Video time is invalid.');
    let x=null,y=null;if(input.x!=null||input.y!=null){x=Number(input.x);y=Number(input.y);if(!artifactUrl||!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1)throw fail('Screenshot pins use coordinates between zero and one.');}
    if(input.parentId&&!fix.comments.some(c=>c.id===input.parentId&&c.roundId===round.id))throw fail('Reply to a thread in the same round.');
    const comment={id:randomUUID(),roundId:round.id,body:content,artifactUrl:artifactUrl||null,originalMs,x,y,parentId:input.parentId||null,resolved:false,author:'You',createdAt:now(),includedInRounds:[]};fix.comments.push(comment);history(fix,'commented',{commentId:comment.id,roundId:round.id});await save(fix);return comment;
  }
  async function reviseInternal(id,input){
    const fix=await load(id);assertIdle(fix);await assertCanGenerate();const previous=current(fix);if(!previous.candidateHash)throw fail('This round has no candidate to revise.',409);await assertHash(previous);
    const ids=input.commentIds;if(ids!==undefined&&(!Array.isArray(ids)||ids.some(x=>typeof x!=='string')))throw fail('Comment IDs must be an array.');
    const comments=fix.comments.filter(x=>ids?ids.includes(x.id):!x.resolved&&x.roundId===previous.id);if(ids&&comments.length!==new Set(ids).size)throw fail('One or more comments do not belong to this fix.');
    const message=trimmed(input.message);if(!comments.length&&!message)throw fail('Add a comment or describe the change.');
    let designProposal=null;
    if(input.designProposalId){if(typeof input.designProposalId!=='string'||! /^[a-f0-9-]{36}$/.test(input.designProposalId))throw fail('Invalid design proposal.');try{designProposal=JSON.parse(await readFile(join(dirname(root),'media-assist',input.designProposalId+'.json'),'utf8'));}catch{throw fail('Design proposal unavailable.');}const allowedRuns=new Set([fix.sourceRun.id,...(fix.sourceRunIds||[]),...(previous.comparison?.pairs||[]).flatMap(p=>[p.before?.id,p.after?.id])]);if(designProposal.projectId!==fix.projectId||designProposal.status!=='concept'||!allowedRuns.has(designProposal.source?.runId))throw fail('Design proposal does not belong to this fix context.');}
    const round=newRound(fix,message);if(designProposal)round.designProposal=designProposal;fix.rounds.push(round);fix.currentRoundId=round.id;fix.status='queued';fix.approval=null;fix.deliveryStatus='not_connected';fix.error=null;
    for(const comment of comments)comment.includedInRounds.push(round.id);history(fix,'changes_requested',{roundId:round.id,previousRoundId:previous.id,commentIds:comments.map(x=>x.id)});await save(fix);beginJob(fix,()=>generateRound(fix,round,previous,comments));return publicFix(fix);
  }
  async function approveInternal(id,input){
    const fix=await load(id);assertIdle(fix);const round=current(fix);
    if(input.roundId!==round.id||input.candidateHash!==round.candidateHash)throw fail('Approval must name the current round and exact candidate hash.',409);
    try{await assertHash(round);}catch(error){round.integrityStatus='invalidated';fix.approval=null;fix.deliveryStatus='not_connected';fix.status='invalidated';history(fix,'candidate_integrity_failed',{roundId:round.id,candidateHash:round.candidateHash});await save(fix);throw error;}
    if(['failed','invalidated'].includes(round.verification?.status)||round.comparison?.status!=='completed')throw fail('Complete a valid retest before approving this candidate.',409);
    const pairs=round.comparison.pairs||[];if(!pairs.length||pairs.some(p=>(p.after?.finding?.outcome||p.after?.outcome)!=='goal_reached'))throw fail('A required persona did not reach its goal in the candidate. Review the outcome or request changes.',409);
    fix.approval={roundId:round.id,candidateHash:round.candidateHash,at:now(),author:'You'};round.approval=clone(fix.approval);fix.status='approved';fix.deliveryStatus='approved_connection_required';history(fix,'approved',fix.approval);await save(fix);return publicFix(fix);
  }
  const create=input=>mutate(`finding:${input.findingId}`,()=>createInternal(input));
  const addComment=(id,input)=>mutate(`fix:${id}`,()=>addCommentInternal(id,input));
  const revise=(id,input)=>mutate(`fix:${id}`,()=>reviseInternal(id,input));
  const approve=(id,input)=>mutate(`fix:${id}`,()=>approveInternal(id,input));
  const startPreview=(id,input)=>mutate(`fix:${id}`,()=>startPreviewInternal(id,input));
  const stopPreview=(id,input={})=>mutate(`fix:${id}`,async()=>{const fix=await load(id);assertIdle(fix);const round=fix.rounds.find(r=>r.id===(input.roundId||fix.currentRoundId));if(!round)throw fail('Choose an existing fix round.');await closeRoundPreviews(round.id);return publicFix(fix);});
  async function handle(req,res,url){
    if(!url.pathname.startsWith('/api/workspace/fixes')&&!url.pathname.startsWith('/api/workspace/comments/'))return false;
    try{
      await ensure();
      if(url.pathname==='/api/workspace/fixes'){
        if(req.method==='GET')return json(res,200,{fixes:await list(url.searchParams.get('projectId'))});
        if(req.method==='POST')return json(res,202,await create(await body(req)));
      }
      const match=url.pathname.match(/^\/api\/workspace\/fixes\/([0-9a-f-]{36})(?:\/(comments|request-changes|retest|approve|preview|alignment))?$/i);
      if(match){const [,id,action]=match;
        if(req.method==='GET'&&!action)return json(res,200,publicFix(await load(id)));
        if(req.method==='GET'&&action==='alignment')return json(res,200,await alignmentReviews.get(id,Object.fromEntries(url.searchParams)));
        if(req.method==='PUT'&&action==='alignment')return json(res,200,await alignmentReviews.put(id,await body(req)));
        if(req.method==='POST'&&action==='comments')return json(res,201,await addComment(id,await body(req)));
        if(req.method==='POST'&&action==='request-changes')return json(res,202,await revise(id,await body(req)));
        if(req.method==='POST'&&action==='approve')return json(res,200,await approve(id,await body(req)));
        if(req.method==='POST'&&action==='preview')return json(res,200,await startPreview(id,await body(req)));
        if(req.method==='DELETE'&&action==='preview')return json(res,200,await stopPreview(id,await body(req)));
        if(req.method==='POST'&&action==='retest')return json(res,202,await requestRetest(id,await body(req)));
      }
      const cm=url.pathname.match(/^\/api\/workspace\/comments\/([0-9a-f-]{36})$/i);
      if(cm&&req.method==='PATCH'){const input=await body(req);if(typeof input.resolved!=='boolean')throw fail('Set resolved to true or false.');for(const fix of cache.values()){const comment=fix.comments.find(x=>x.id===cm[1]);if(comment){await mutate(`fix:${fix.id}`,async()=>{comment.resolved=input.resolved;comment.updatedAt=now();history(fix,'comment_status',{commentId:comment.id,resolved:comment.resolved});await save(fix);});return json(res,200,comment);}}throw fail('Comment not found.',404);}
      return json(res,404,{error:'Fix route not found.'});
    }catch(error){return json(res,error.status||500,{error:String(error.message||error)});}
  }
  async function list(projectId){await ensure();return [...cache.values()].filter(f=>!projectId||f.projectId===projectId).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).map(publicFix);}
  return {handle,list,get:async id=>publicFix(await load(id)),create,addComment,revise,approve,startPreview,stopPreview,requestRetest,waitForIdle:()=>queue,initialize:ensure,close:async()=>{await queue;for(const timer of previewTimers.values())clearTimeout(timer);previewTimers.clear();await Promise.allSettled([...previews.values()].map(p=>p.close()));previews.clear();}};
}
