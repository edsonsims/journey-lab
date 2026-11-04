import { createWorkspaceCalibration } from './workspace-calibration.mjs';
import { DEFAULT_PROJECT, WorkspaceError } from './workspace-store.mjs';

const send=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));return true;};
async function body(req){let value='',bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>2_000_000)throw new WorkspaceError('Calibration imports must fit within 2 MB.',413,'IMPORT_TOO_LARGE');value+=chunk;}try{const parsed=JSON.parse(value||'{}');if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();return parsed;}catch{throw new WorkspaceError('Send a JSON object.');}}
const datasetSummary=value=>{if(!value)return null;const {events,...metadata}=value;return metadata;};
const runSummary=run=>({id:run.id,name:run.name,status:run.status,personaId:run.personaId,environmentId:run.environmentId,environmentVersion:run.environmentVersion,createdAt:run.createdAt,completedAt:run.completedAt,tokens:run.tokens||null});
export function presentCalibrationStudy(study){if(!study)return null;return {...study,datasetSnapshot:datasetSummary(study.datasetSnapshot),baselineRuns:study.baselineRuns.map(runSummary),candidates:study.candidates.map(candidate=>({...candidate,developmentRuns:candidate.developmentRuns.map(runSummary),validationRuns:candidate.validationRuns.map(runSummary)}))};}

export function createWorkspaceCalibrationApi({port=4319,service,...options}={}){
 service ||=createWorkspaceCalibration(options);
 const scope=(value,projectId)=>{if(projectId&&value.projectId&&projectId!==value.projectId)throw new WorkspaceError('Calibration belongs to another app.',400,'PROJECT_MISMATCH');return {...value,projectId:projectId||value.projectId||DEFAULT_PROJECT};};
 const scoped=(value,projectId)=>{if(!value)throw new WorkspaceError('Calibration record not found.',404,'NOT_FOUND');if(projectId&&value.projectId!==projectId)throw new WorkspaceError('Calibration belongs to another app.',400,'PROJECT_MISMATCH');return value;};
 async function handle(req,res,url){const prefix='/api/workspace/calibration';if(url.pathname!==prefix&&!url.pathname.startsWith(`${prefix}/`))return false;
  try{
   if(!['GET','HEAD'].includes(req.method)&&req.headers.origin&&req.headers.origin!==`http://127.0.0.1:${port}`)return send(res,403,{error:'This action must originate from Journey Lab.',code:'ORIGIN_DENIED'});
   if(req.method==='DELETE')return send(res,405,{error:'Calibration datasets, studies and observations are retained.',code:'KEEP_ALL'});
   const [resource,id,action]=url.pathname.slice(prefix.length).split('/').filter(Boolean).map(decodeURIComponent),projectId=url.searchParams.get('projectId')||undefined;
   if((!resource||resource==='overview')&&req.method==='GET'){const selected=projectId||DEFAULT_PROJECT;return send(res,200,{datasets:service.listDatasets(selected).map(datasetSummary),mappings:service.listMappings(selected),studies:service.listStudies(selected).map(presentCalibrationStudy),activeStudyIds:service.active(),limitations:['Local import; no analytics provider is connected.','Behavior comparisons cannot establish human feelings or business uplift.']});}
   if(resource==='baselines'&&req.method==='GET')return send(res,200,{baselines:service.baselines(projectId||DEFAULT_PROJECT),limit:200});
   if(['datasets','mappings'].includes(resource)){
    const kind=resource==='datasets'?'dataset':'mapping',get=kind==='dataset'?service.getDataset:service.getMapping,save=kind==='dataset'?service.saveDataset:service.saveMapping,list=kind==='dataset'?service.listDatasets:service.listMappings;
    if(req.method==='GET'&&!id)return send(res,200,{[resource]:list(projectId||DEFAULT_PROJECT).map(item=>kind==='dataset'?datasetSummary(item):item)});
    if(req.method==='GET'&&id&&action==='versions'){scoped(get(id),projectId);return send(res,200,{versions:service.versions(kind,id).map(item=>kind==='dataset'?datasetSummary(item):item)});}
    if(req.method==='GET'&&id){const version=url.searchParams.has('version')?Number(url.searchParams.get('version')):undefined;if(version!==undefined&&(!Number.isInteger(version)||version<1))throw new WorkspaceError('Choose a positive version.',400,'INVALID_VERSION');return send(res,200,scoped(get(id,version),projectId));}
    if(req.method==='POST'&&!id)return send(res,201,save(scope(await body(req),projectId)));
    if(req.method==='PATCH'&&id){const input=scope(await body(req),projectId);scoped(get(id),input.projectId);return send(res,200,save(input,id));}
   }
   if(resource==='studies'){
    if(req.method==='GET'&&!id)return send(res,200,{studies:service.listStudies(projectId||DEFAULT_PROJECT).map(presentCalibrationStudy)});
    if(req.method==='POST'&&!id)return send(res,201,presentCalibrationStudy(service.createStudy(scope(await body(req),projectId))));
    if(id){const study=scoped(service.getStudy(id),projectId);
     if(req.method==='GET'&&action==='versions')return send(res,200,{versions:service.studyVersions(id).map(presentCalibrationStudy)});
     if(req.method==='GET'&&!action)return send(res,200,presentCalibrationStudy(study));
     if(req.method==='POST'&&['compare','start','cancel','reconcile','approve'].includes(action)){const input=scope(await body(req),projectId||study.projectId);scoped(study,input.projectId);const result=await service[action](id,input);return send(res,action==='start'?202:200,action==='compare'?{...result,study:presentCalibrationStudy(result.study)}:presentCalibrationStudy(result));}
    }
   }
   return send(res,404,{error:'Calibration route not found.',code:'NOT_FOUND'});
  }catch(error){return send(res,error.status||500,{error:error instanceof WorkspaceError?error.message:'Calibration request failed.',code:error.code||'CALIBRATION_ERROR'});}
 }
 return {handle,service,close:()=>service.close()};
}
