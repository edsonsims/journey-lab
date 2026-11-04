import { randomUUID, createHash } from 'node:crypto';
import { stat, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createWorkspaceStore, DEFAULT_PROJECT, WorkspaceError } from './workspace-store.mjs';
import { DEVICE_PRESETS } from './device-profiles.mjs';
import { generateLibraryDraft, validateLibraryDraftInput, LIBRARY_DRAFT_MODEL } from './library-drafts.mjs';

const send=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));return true;};
const kinds={environments:'environment',charters:'charter',personas:'persona',devices:'device','network-profiles':'network-profile'};
async function body(req){let text='',size=0;for await(const chunk of req){size+=chunk.length;if(size>65536)throw new WorkspaceError('Request body exceeds 64 KB.',413);text+=chunk;}try{const value=text.trim()?JSON.parse(text):{};if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}catch{throw new WorkspaceError('Send a JSON object.');}}
async function pathStatus(path,directory=false){if(!path)return {status:'not_configured'};try{const s=await stat(path);return {status:(directory?s.isDirectory():s.isFile())?'available':'invalid'};}catch{return {status:'unavailable'};}}

export function createWorkspaceApi({root,runsDir,improvementsRoot,comparisonsDir,port=4319,launchRun,cancelRun,getActiveRun=()=>null,configured=()=>false,bootstrapExtras=async()=>({}),productDirectory,requestMeta}={}) {
  const store=createWorkspaceStore({root,runsDir,productDirectory:productDirectory||resolve(root||'.','../../little-steps')});
  const ready=store.importLegacyRuns();
  let launchLock=false;
  let draftBusy=false;
  function scopedInput(input,projectId) {
    if(input.projectId!==undefined&&(typeof input.projectId!=='string'||!input.projectId.trim()||input.projectId.length>160))throw new WorkspaceError('Select a valid app.',400,'INVALID_PROJECT');
    if(projectId&&input.projectId&&projectId!==input.projectId)throw new WorkspaceError('The record belongs to another app.',400,'PROJECT_MISMATCH');
    const scope=projectId||input.projectId;if(scope)store.requireProject(scope);
    return {...input,...(scope?{projectId:scope}:{})};
  }
  function scopedEntity(kind,id,projectId,version) {
    if(projectId)store.requireProject(projectId);
    const item=store.getEntity(kind,id,version);
    if(!item)throw new WorkspaceError('Record not found.',404,'NOT_FOUND');
    if(projectId&&item.projectId!==projectId)throw new WorkspaceError('The record belongs to another app.',400,'PROJECT_MISMATCH');
    return item;
  }
  function scopedMemory(id,projectId,version) {
    if(projectId)store.requireProject(projectId);
    const item=store.memory.get(id,version);if(!item)throw new WorkspaceError('Memory not found.',404,'NOT_FOUND');
    if(projectId&&item.projectId!==projectId)throw new WorkspaceError('Memory belongs to another app.',400,'PROJECT_MISMATCH');
    return item;
  }
  function scopedRun(id,projectId) {
    if(projectId)store.requireProject(projectId);
    const run=store.getRun(id);if(!run)throw new WorkspaceError('Journey not found.',404,'NOT_FOUND');
    if(projectId&&run.projectId!==projectId)throw new WorkspaceError('Journey belongs to another app.',400,'PROJECT_MISMATCH');
    return run;
  }
  function runMemory(run) {
    const publications=store.memory.publications({projectId:run.projectId,runId:run.id}).map(item=>{
      const entry=item.entryId?store.memory.get(item.entryId,item.entryVersion):null;
      return {...item,...(entry?{name:entry.name,subject:entry.subject,entry}:{})};
    });
    return {snapshot:run.memorySnapshot||null,accessLog:store.memory.accessLog(run.id),publications,publicationFailures:publications.filter(item=>item.status==='failed')};
  }
  function assertTargetPolicy(environment) {
    try {
      const hostOrigin=`http://127.0.0.1:${port}`;
      if(environment.allowedOrigins!==undefined&&!Array.isArray(environment.allowedOrigins))throw new WorkspaceError('Allowed origins must be an array of URLs.');
      const values=[environment.url,...(environment.allowedOrigins||[])];
      if(values.some(value=>new URL(value).origin===hostOrigin))throw new WorkspaceError('The Journey Lab control origin cannot be a test target. Use a separate product or isolated preview origin.',400,'CONTROL_ORIGIN_DENIED');
      if(environment.healthPath&&new URL(environment.healthPath,environment.url).origin===hostOrigin)throw new WorkspaceError('Health checks cannot target the Journey Lab control origin.',400,'CONTROL_ORIGIN_DENIED');
    }catch(error){if(error instanceof WorkspaceError)throw error;throw new WorkspaceError('Enter valid environment URLs.');}
  }
  async function legacyComparisons(projectId) {
    if(projectId!==DEFAULT_PROJECT||!comparisonsDir)return [];
    let dirs;try{dirs=await readdir(comparisonsDir,{withFileTypes:true});}catch{return [];}
    const rows=[];for(const dir of dirs.filter(d=>d.isDirectory()&&/^[0-9a-f-]{36}$/i.test(d.name))){try{rows.push(JSON.parse(await readFile(join(comparisonsDir,dir.name,'comparison.json'),'utf8')));}catch{}}
    return rows.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  async function bootstrap(projectId) {
    const importReport=await ready;const projects=store.listProjects();projectId ||= projects[0]?.id||DEFAULT_PROJECT;store.requireProject(projectId);
    const extras=await bootstrapExtras(projectId)||{};const journeys=store.listRunsPage({projectId});
    return {projects,projectId,environments:store.listEntities('environment',projectId,true),charters:store.listEntities('charter',projectId,true),personas:store.listEntities('persona',projectId,true),devices:store.listEntities('device',projectId,true),networkProfiles:store.listEntities('network-profile',projectId,true),devicePresets:DEVICE_PRESETS,memory:store.memory.list({projectId,includeArchived:true}),runs:journeys.runs,runsPage:journeys.page,findings:store.listFindings({projectId,includeSourceRun:true}),issues:store.listIssues(projectId),fixes:extras.fixes||[],comparisons:extras.comparisons||await legacyComparisons(projectId),health:{ok:true,modelConfigured:Boolean(configured()),activeRun:getActiveRun(),model:'muse-wonder-1.0',retention:'keep-all',imported:importReport.imported,importErrors:importReport.errors,...extras.health},...Object.fromEntries(Object.entries(extras).filter(([key])=>!['health','fixes','comparisons'].includes(key)))};
  }
  async function checkEnvironment(id) {
    const environment=store.getEntity('environment',id);if(!environment)throw new WorkspaceError('Environment not found.',404,'NOT_FOUND');
    assertTargetPolicy(environment);
    let target;try{target=new URL(environment.healthPath||environment.url,environment.url);}catch{throw new WorkspaceError('Invalid health-check path.');}
    if(!environment.allowedOrigins.includes(target.origin))throw new WorkspaceError('Health checks must stay within the configured allowed origins.');
    const started=Date.now();let reachability;
    try {const response=await fetch(target,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(5000),headers:{'user-agent':'JourneyLab/EnvironmentCheck'}});await response.body?.cancel();reachability={status:response.status>=200&&response.status<400?'reachable':'unreachable',httpStatus:response.status,durationMs:Date.now()-started,...(response.status>=300&&response.status<400?{note:'Redirect observed; destination has not been followed.'}:{})};}
    catch(error){reachability={status:'unreachable',durationMs:Date.now()-started,error:error.name==='TimeoutError'?'Connection timed out.':'Unable to connect.'};}
    const repository=await pathStatus(environment.repositoryPath,true),session=await pathStatus(environment.storageStatePath||environment.authStatePath);
    const checks={reachability,repository,session:environment.authStatePath||environment.storageStatePath?{...session,note:'Reference file checked; authenticated access has not been verified.'}:{status:'anonymous'},sourceIdentity:{status:'unverified',note:'A URL and repository path do not establish matching build identity.'},fixtures:{status:environment.isolation==='stateless-demo'?'stateless':'not_verified',note:environment.dataPolicy},preview:{status:environment.repositoryPath?'configuration_required':'not_configured'}};
    return store.recordEnvironmentCheck(id,{environmentVersion:environment.version,status:reachability.status==='reachable'?'reachable':'unreachable',checks});
  }
  async function handle(req,res,url) {
    if(!url.pathname.startsWith('/api/workspace'))return false;
    try {
      await ready;
      if(!['GET','HEAD'].includes(req.method)) {
        if(req.headers.origin&&req.headers.origin!==`http://127.0.0.1:${port}`)return send(res,403,{error:'This action must originate from Journey Lab.',code:'ORIGIN_DENIED'});
        if(req.method==='DELETE'&&!/^\/api\/workspace\/(devices|network-profiles)\//.test(url.pathname))return send(res,405,{error:'Records are retained. Use Archive to hide an item without deleting it.',code:'KEEP_ALL'});
      }
      const path=url.pathname.slice('/api/workspace'.length).replace(/\/$/,'')||'/';
      const segments=path.split('/').filter(Boolean).map(decodeURIComponent),[resource,id,action]=segments;
      const projectId=url.searchParams.get('projectId')||undefined;
      if(req.method==='GET'&&resource==='bootstrap')return send(res,200,await bootstrap(projectId));
      if(resource==='projects'){
        if(req.method==='GET'&&!id)return send(res,200,{projects:store.listProjects()});
        if(req.method==='POST'&&!id)return send(res,201,store.saveProject(await body(req)));
        if(req.method==='PATCH'&&id){store.requireProject(id);return send(res,200,store.saveProject({...await body(req),id}));}
      }
      if(resource==='memory') {
        if(req.method==='GET'&&!id)return send(res,200,{entries:store.memory.list({projectId,includeArchived:url.searchParams.get('archived')!=='false'})});
        if(req.method==='GET'&&id==='failures'){
          const runId=url.searchParams.get('runId')||undefined;if(runId)scopedRun(runId,projectId);
          return send(res,200,{failures:store.memory.publicationFailures({projectId,runId})});
        }
        if(req.method==='POST'&&id==='conflicts'&&segments[3]==='resolve')return send(res,200,store.memory.resolveConflict(action,scopedInput(await body(req),projectId)));
        if(req.method==='GET'&&id&&action==='versions'){scopedMemory(id,projectId);return send(res,200,{versions:store.memory.versions(id)});}
        if(req.method==='GET'&&id&&!action){const version=url.searchParams.has('version')?Number(url.searchParams.get('version')):undefined;if(version!==undefined&&(!Number.isSafeInteger(version)||version<1))throw new WorkspaceError('Select a valid memory version.',400,'INVALID_VERSION');return send(res,200,scopedMemory(id,projectId,version));}
        if(req.method==='POST'&&!id){const input=scopedInput(await body(req),projectId);if(!input.projectId)throw new WorkspaceError('Select an app for this memory.',400,'PROJECT_REQUIRED');return send(res,201,store.memory.create(input));}
        if(req.method==='PATCH'&&id&&!action){const input=scopedInput(await body(req),projectId);scopedMemory(id,input.projectId);return send(res,200,store.memory.update(id,input));}
        if(req.method==='POST'&&id&&['archive','verify','dispute','supersede','restore'].includes(action)){
          const input=scopedInput(await body(req),projectId);scopedMemory(id,input.projectId);
          if(action==='archive'){if(input.archived!==undefined&&typeof input.archived!=='boolean')throw new WorkspaceError('Archived must be true or false.',400,'INVALID_ARCHIVE_STATE');return send(res,200,store.memory.archive(id,input.archived!==false,{projectId:input.projectId,expectedVersion:input.expectedVersion}));}
          if(action==='restore')return send(res,200,store.memory.restore(id,{projectId:input.projectId,expectedVersion:input.expectedVersion,version:input.version}));
          return send(res,200,store.memory.update(id,{projectId:input.projectId,expectedVersion:input.expectedVersion,status:{verify:'verified',dispute:'disputed',supersede:'superseded'}[action],reviewReason:input.reviewReason,...(action==='supersede'?{supersededById:input.supersededById}:{})}));
        }
      }
      if(kinds[resource]) {
        const kind=kinds[resource];
        if(req.method==='POST'&&id==='draft'&&!action&&['persona','charter'].includes(kind)) {
          const input=scopedInput(await body(req),projectId);
          if(!input.projectId)throw new WorkspaceError('Select an app for this draft.',400,'PROJECT_REQUIRED');
          const context=validateLibraryDraftInput(kind,input);
          if(!configured())throw new WorkspaceError('Configure the Meta API key to draft with Muse Wonder.',503,'MODEL_API_KEY_MISSING');
          if(draftBusy)throw new WorkspaceError('A Library draft is already being prepared.',409,'DRAFT_BUSY');
          const draftId=randomUUID(),controller=new AbortController();
          const cancel=()=>{if(!res.writableEnded)controller.abort();};res.once('close',cancel);draftBusy=true;
          try {
            const result=await generateLibraryDraft({kind,...context,requestMeta,signal:controller.signal});
            store.audit('library-draft',draftId,{kind,projectId:input.projectId,status:'proposed',provenance:result.provenance});
            return send(res,200,result);
          } catch(error) {
            store.audit('library-draft',draftId,{kind,projectId:input.projectId,status:'failed',model:LIBRARY_DRAFT_MODEL,code:error instanceof WorkspaceError?error.code:'DRAFT_PROVIDER_FAILED',...(error instanceof WorkspaceError&&error.provenance?{provenance:error.provenance}:{}),...(error instanceof WorkspaceError&&error.diagnostics?{diagnostics:error.diagnostics}:{})});
            throw error;
          } finally {draftBusy=false;res.removeListener('close',cancel);}
        }
        if(req.method==='GET'&&resource==='devices'&&id==='presets')return send(res,200,{presets:DEVICE_PRESETS});
        if(req.method==='DELETE'&&id&&!action){const input=scopedInput(await body(req),projectId);scopedEntity(kind,id,input.projectId);return send(res,200,store.deleteEntity(kind,id,input));}
        if(req.method==='GET'&&!id)return send(res,200,{[resource]:store.listEntities(kind,projectId,url.searchParams.get('archived')==='true')});
        if(req.method==='GET'&&id&&action==='versions'){scopedEntity(kind,id,projectId);return send(res,200,{versions:store.versions(kind,id)});}
        if(req.method==='GET'&&id&&!action){const version=url.searchParams.has('version')?Number(url.searchParams.get('version')):undefined;if(version!==undefined&&(!Number.isSafeInteger(version)||version<1))throw new WorkspaceError('Select a valid version.',400,'INVALID_VERSION');return send(res,200,scopedEntity(kind,id,projectId,version));}
        if(req.method==='POST'&&!id){const input=scopedInput(await body(req),projectId);if(kind==='environment')assertTargetPolicy(input);return send(res,201,store.saveEntity(kind,input));}
        if(req.method==='PATCH'&&id&&!action){const input=scopedInput(await body(req),projectId),current=scopedEntity(kind,id,input.projectId);if(kind==='environment')assertTargetPolicy({...current,...input});return send(res,200,store.saveEntity(kind,{...input,mustExist:true},id));}
        if(req.method==='POST'&&id&&action==='archive'){const input=scopedInput(await body(req),projectId);if(input.archived!==undefined&&typeof input.archived!=='boolean')throw new WorkspaceError('Archived must be true or false.',400,'INVALID_ARCHIVE_STATE');return send(res,200,store.archiveEntity(kind,id,input.archived!==false,{projectId:input.projectId,expectedVersion:input.expectedVersion}));}
        if(req.method==='POST'&&id&&action==='duplicate'){const input=scopedInput(await body(req),projectId),existing=scopedEntity(kind,id,input.projectId);if(kind==='environment'){const previous=Number.isInteger(input.version)&&input.version>0?store.getEntity(kind,id,input.version):existing;if(previous)assertTargetPolicy(previous);}return send(res,201,store.duplicateEntity(kind,id,{name:input.name,version:input.version,projectId:input.projectId,expectedVersion:input.expectedVersion}));}
        if(req.method==='POST'&&id&&action==='restore'){const input=scopedInput(await body(req),projectId);scopedEntity(kind,id,input.projectId);if(kind==='environment'&&Number.isInteger(input.version)&&input.version>0){const previous=store.getEntity(kind,id,input.version);if(previous)assertTargetPolicy(previous);}return send(res,200,store.restoreEntity(kind,id,{version:input.version,projectId:input.projectId,expectedVersion:input.expectedVersion}));}
        if(req.method==='POST'&&id&&action==='check'&&kind==='environment'){scopedEntity(kind,id,projectId);return send(res,200,await checkEnvironment(id));}
      }
      if(resource==='runs') {
        if(req.method==='GET'&&id&&action==='memory')return send(res,200,runMemory(scopedRun(id,projectId)));
        if(req.method==='GET'&&!id)return send(res,200,store.listRunsPage({projectId,status:url.searchParams.get('status')||undefined,personaId:url.searchParams.get('personaId')||undefined,environmentId:url.searchParams.get('environmentId')||undefined,query:url.searchParams.get('q')||undefined,limit:Math.min(Number(url.searchParams.get('limit'))||100,1000),offset:Math.max(Number(url.searchParams.get('offset'))||0,0),cursor:url.searchParams.get('cursor')||undefined}));
        if(req.method==='GET'&&id)return send(res,200,scopedRun(id,projectId));
        if(req.method==='PATCH'&&id)return send(res,200,store.renameRun(id,(await body(req)).name));
        if(req.method==='POST'&&id&&action==='cancel'){
          const current=store.getRun(id);if(!current)throw new WorkspaceError('Run not found.',404,'NOT_FOUND');
          if(!['queued','running','finalizing','cancelling'].includes(current.status))return send(res,200,{id,status:current.status,cancelled:false,run:current});
          if(!cancelRun)throw new WorkspaceError('Cancellation is unavailable.',503,'UNAVAILABLE');
          const result=await cancelRun(id),latest=store.getRun(id);
          if(!result)return send(res,200,{id,status:latest.status,cancelled:false,run:latest});
          return send(res,result.status==='cancelling'?202:200,{id,status:result.status||latest.status,cancelled:result.status==='cancelled',run:latest});
        }
        if(req.method==='POST'&&id&&action==='retry') {
          if(!configured())throw new WorkspaceError('Configure the Meta API key to retry a real Run.',503,'MODEL_API_KEY_MISSING');if(!launchRun)throw new WorkspaceError('The run worker is unavailable.',503,'WORKER_UNAVAILABLE');
          const input=await body(req),key=req.headers['idempotency-key']||input.idempotencyKey,digest=createHash('sha256').update(`retry:${id}`).digest('hex');
          if(key!==undefined&&(typeof key!=='string'||!/^[a-zA-Z0-9._-]{1,120}$/.test(key)))throw new WorkspaceError('Invalid idempotency key.');
          if(key){const prior=store.getLaunchRequest(key);if(prior){if(prior.digest!==digest)throw new WorkspaceError('This launch key belongs to another request.',409,'IDEMPOTENCY_CONFLICT');if(prior.state!=='completed')throw new WorkspaceError('This retry is already being prepared or was interrupted. Its records are preserved.',409,'LAUNCH_PENDING');return send(res,200,{run:store.getRun(prior.runIds[0]),reused:true});}}
          if(launchLock)throw new WorkspaceError('A launch is already being prepared.',409,'LAUNCH_BUSY');launchLock=true;
          try{const run=store.buildRetry(id);assertTargetPolicy(run.environmentSnapshot);if(key)store.beginLaunchRequest(key,digest,[run.id],null);store.syncRun(run);try{const result=await launchRun(run);if(result?.id)store.syncRun({...run,...result});}catch(error){store.syncRun({...run,status:'failed',completedAt:new Date().toISOString(),error:String(error.message||'Unable to enqueue retry.').slice(0,500)});}if(key)store.finishLaunchRequest(key);return send(res,202,{run:store.getRun(run.id)});}finally{launchLock=false;}
        }
        if(req.method==='POST'&&!id) {
          if(!configured())throw new WorkspaceError('Configure the Meta API key to start a real run.',503,'MODEL_API_KEY_MISSING');
          if(!launchRun)throw new WorkspaceError('The run worker is unavailable.',503,'WORKER_UNAVAILABLE');
          const input=await body(req);const personaIds=input.personaIds||[input.personaId];
          if(!Array.isArray(personaIds)||!personaIds.length||personaIds.length>12||personaIds.some(x=>typeof x!=='string')||new Set(personaIds).size!==personaIds.length)throw new WorkspaceError('Select between one and twelve distinct personas.');
          for(const key of ['deviceId','networkProfileId'])if(input[key]!==undefined&&input[key]!==null&&typeof input[key]!=='string')throw new WorkspaceError('Choose valid device and network profile IDs.',400,'INVALID_REFERENCE');
          if(input.deviceSelections!==undefined&&(!input.deviceSelections||typeof input.deviceSelections!=='object'||Array.isArray(input.deviceSelections)||Object.entries(input.deviceSelections).some(([id,value])=>!personaIds.includes(id)||typeof value!=='string')))throw new WorkspaceError('Device selections must map selected personas to device IDs.');
          const idempotencyKey=req.headers['idempotency-key']||input.idempotencyKey;
          if(idempotencyKey!==undefined&&(typeof idempotencyKey!=='string'||!/^[a-zA-Z0-9._-]{1,120}$/.test(idempotencyKey)))throw new WorkspaceError('Invalid idempotency key.');
          const digest=createHash('sha256').update(JSON.stringify({projectId:input.projectId||DEFAULT_PROJECT,charterId:input.charterId,personaIds,environmentId:input.environmentId,name:input.name||null,deviceId:input.deviceId||null,networkProfileId:input.networkProfileId||null,deviceSelections:input.deviceSelections||null})).digest('hex');
          if(idempotencyKey){const previous=store.getLaunchRequest(idempotencyKey);if(previous){
            if(previous.digest!==digest)throw new WorkspaceError('This launch key was already used with another configuration.',409,'IDEMPOTENCY_CONFLICT');
            if(previous.state!=='completed')return send(res,409,{error:previous.state==='pending'?'This launch is being prepared.':'This launch was interrupted. Its records are preserved; start a new launch to retry.',code:previous.state==='pending'?'LAUNCH_PENDING':'LAUNCH_INTERRUPTED',runIds:previous.runIds});
            const previousRuns=previous.runIds.map(id=>store.getRun(id)).filter(Boolean),failed=previousRuns.filter(run=>run.status==='failed').length;
            return send(res,200,{runs:previousRuns,batchId:previous.batchId,reused:true,launchSummary:{accepted:previousRuns.length-failed,failed}});
          }}
          if(launchLock)throw new WorkspaceError('A launch is already being prepared.',409,'LAUNCH_BUSY');
          launchLock=true;try {
            const batchId=personaIds.length>1?randomUUID():null;
            const planned=personaIds.map(personaId=>store.buildRun({...input,personaId,batchId}));
            for(const run of planned)assertTargetPolicy(run.environmentSnapshot);
            if(idempotencyKey)store.beginLaunchRequest(idempotencyKey,digest,planned.map(run=>run.id),batchId);
            const launched=[];
            for(const run of planned){store.syncRun(run);try{const result=await launchRun(run);if(result?.id)store.syncRun({...run,...result});launched.push(store.getRun(run.id));}catch(error){store.syncRun({...run,status:'failed',completedAt:new Date().toISOString(),error:String(error.message||'Unable to enqueue run.').slice(0,500)});launched.push(store.getRun(run.id));}}
            const failed=launched.filter(run=>run.status==='failed').length;
            if(idempotencyKey)store.finishLaunchRequest(idempotencyKey);
            return send(res,202,{runs:launched,batchId,launchSummary:{accepted:launched.length-failed,failed}});
          }finally{launchLock=false;}
        }
      }
      if(resource==='findings') {
        if(req.method==='POST'&&id&&action==='hypotheses')return send(res,201,store.addBusinessHypothesis(id,scopedInput(await body(req),projectId)));
        if(req.method==='GET'&&!id)return send(res,200,{findings:store.listFindings({projectId,runId:url.searchParams.get('runId')||undefined,includeExcluded:url.searchParams.get('includeExcluded')!=='false',includeSourceRun:true})});
        if(req.method==='GET'&&id&&action==='revisions')return send(res,200,{revisions:store.findingRevisions(id)});
        if(req.method==='GET'&&id){const finding=store.getFinding(id);if(!finding)throw new WorkspaceError('Finding not found.',404,'NOT_FOUND');return send(res,200,{...finding,run:store.getRun(finding.runId)});}
        if(req.method==='PATCH'&&id)return send(res,200,store.updateFinding(id,await body(req)));
      }
      if(resource==='issues') {
        if(req.method==='GET'&&!id)return send(res,200,{issues:store.listIssues(projectId)});
        if(req.method==='GET'&&id){const issue=store.getIssue(id);if(!issue)throw new WorkspaceError('Issue not found.',404,'NOT_FOUND');return send(res,200,issue);}
        if(req.method==='POST'&&!id)return send(res,201,store.saveIssue(await body(req)));
        if(req.method==='POST'&&id&&action==='merge')return send(res,200,store.mergeIssues(id,(await body(req)).targetIssueId));
        if(req.method==='POST'&&id&&action==='split')return send(res,201,store.splitIssue(id,await body(req)));
        if(req.method==='PATCH'&&id){if(!store.getIssue(id))throw new WorkspaceError('Issue not found.',404,'NOT_FOUND');return send(res,200,store.saveIssue(await body(req),id));}
      }
      // Fix routes are handled by the isolated fix service before this handler.
      if(resource==='fixes')return false;
      return send(res,404,{error:'Workspace route not found.',code:'NOT_FOUND'});
    } catch(error) {return send(res,error.status||500,{error:error instanceof WorkspaceError?error.message:'Workspace request failed.',code:error.code||'WORKSPACE_ERROR'});}
  }
  return {handle,store,ready,bootstrap,checkEnvironment,syncRun:run=>store.syncRun(run),close:()=>store.close()};
}
