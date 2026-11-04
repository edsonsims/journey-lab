import {WorkspaceError} from './workspace-store.mjs';
import {createCompetitorsService} from './workspace-competitors.mjs';

const send=(res,status,value)=>{if(res.destroyed||res.writableEnded)return true;res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));return true;};
async function readBody(req){let text='',size=0;for await(const chunk of req){size+=chunk.length;if(size>262144)throw new WorkspaceError('Competitor request exceeds 256 KB.',413,'BODY_TOO_LARGE');text+=chunk;}try{const value=text?JSON.parse(text):{};if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{throw new WorkspaceError('Send a JSON object.');}}

export function createWorkspaceCompetitorsApi({store,port=4319,...options}={}){
  const service=createCompetitorsService({store,...options});
  async function handle(req,res,url=new URL(req.url,`http://127.0.0.1:${port}`)){
    if(!/^\/api\/workspace\/competitors(?:\/|$)/.test(url.pathname))return false;
    try{
      if(!['GET','HEAD'].includes(req.method)&&req.headers.origin&&req.headers.origin!==`http://127.0.0.1:${port}`)return send(res,403,{error:'This action must originate from Journey Lab.',code:'ORIGIN_DENIED'});
      if(req.method==='DELETE')return send(res,405,{error:'Competitor profiles, sources, claims and research receipts are retained.',code:'KEEP_ALL'});
      let parts;try{parts=url.pathname.slice('/api/workspace/competitors'.length).split('/').filter(Boolean).map(decodeURIComponent);}catch{throw new WorkspaceError('Invalid route.',400,'INVALID_ROUTE');}
      const [resource,id,action]=parts;if(parts.length>3)return send(res,404,{error:'Competitor route not found.',code:'NOT_FOUND'});
      const input=['POST','PATCH'].includes(req.method)?await readBody(req):{},queryProject=url.searchParams.get('projectId');
      if(queryProject&&input.projectId&&queryProject!==input.projectId)throw new WorkspaceError('The request belongs to another app.',400,'PROJECT_MISMATCH');
      const projectId=queryProject||input.projectId;if(typeof projectId!=='string'||!projectId.trim())throw new WorkspaceError('Choose an app.',400,'PROJECT_REQUIRED');store.requireProject(projectId);
      const suppliedVersion=url.searchParams.get('version'),version=suppliedVersion===null?undefined:Number(suppliedVersion);if(version!==undefined&&(!Number.isSafeInteger(version)||version<1))throw new WorkspaceError('Choose a positive version number.');
      if(resource==='profiles'){
        if(req.method==='GET'&&!id)return send(res,200,{profiles:service.listProfiles(projectId,{includeArchived:url.searchParams.get('includeArchived')==='true'})});
        if(req.method==='POST'&&!id)return send(res,201,service.saveProfile({...input,projectId,id:undefined}));
        if(req.method==='GET'&&id&&!action)return send(res,200,service.getProfile(projectId,id,version));
        if(req.method==='PATCH'&&id&&!action)return send(res,200,service.saveProfile({...input,projectId},id));
        if(req.method==='POST'&&id&&action==='archive')return send(res,200,service.archiveProfile(projectId,id,input));
        if(req.method==='GET'&&id&&action==='versions')return send(res,200,{versions:service.profileVersions(projectId,id)});
        if(req.method==='GET'&&id&&action==='events')return send(res,200,{events:service.profileEvents(projectId,id)});
        if(req.method==='POST'&&id&&action==='research')return send(res,202,service.startResearch({...input,projectId,competitorId:id}));
      }
      if(resource==='claims'){
        if(req.method==='GET'&&!id)return send(res,200,{claims:service.listClaims(projectId,{competitorId:url.searchParams.get('competitorId')||undefined,subject:url.searchParams.get('subject')||undefined})});
        if(req.method==='POST'&&!id)return send(res,201,service.saveClaim({...input,projectId,id:undefined}));
        if(req.method==='GET'&&id&&!action)return send(res,200,service.getClaim(projectId,id,version));
        if(req.method==='PATCH'&&id&&!action)return send(res,200,service.saveClaim({...input,projectId},id));
        if(req.method==='GET'&&id&&action==='versions')return send(res,200,{versions:service.claimVersions(projectId,id)});
      }
      if(resource==='sources'){
        if(req.method==='GET'&&!id)return send(res,200,{sources:service.listSources(projectId)});
        if(req.method==='POST'&&id==='capture'&&!action){const controller=new AbortController(),abort=()=>{if(!res.writableEnded)controller.abort();};res.once('close',abort);try{return send(res,201,await service.captureSource({projectId,url:input.url,signal:controller.signal}));}finally{res.removeListener('close',abort);}}
        if(req.method==='POST'&&id==='run'&&!action)return send(res,201,service.attachRunSource({...input,projectId}));
        if(req.method==='GET'&&id&&!action)return send(res,200,service.getSource(projectId,id));
      }
      if(resource==='jobs'){
        if(req.method==='GET'&&!id)return send(res,200,{jobs:service.listJobs(projectId)});
        if(req.method==='GET'&&id&&!action)return send(res,200,service.getJob(projectId,id));
        if(req.method==='POST'&&id&&action==='cancel')return send(res,202,service.cancelResearch(projectId,id));
      }
      if(resource==='research'&&req.method==='POST'&&!id)return send(res,202,service.startResearch({...input,projectId}));
      if(resource==='compare'&&!id&&['GET','POST'].includes(req.method))return send(res,200,service.compareClaims({projectId,ownClaimId:input.ownClaimId||url.searchParams.get('ownClaimId'),competitorClaimId:input.competitorClaimId||url.searchParams.get('competitorClaimId')}));
      if(resource==='contradictions'&&req.method==='POST'&&!id)return send(res,201,service.linkContradiction({...input,projectId}));
      if(resource==='contradictions'&&req.method==='PATCH'&&id&&!action)return send(res,200,service.resolveContradiction(projectId,id,input));
      return send(res,404,{error:'Competitor route not found.',code:'NOT_FOUND'});
    }catch(error){return send(res,error instanceof WorkspaceError?error.status:500,{error:error instanceof WorkspaceError?error.message:'Competitor request failed.',code:error instanceof WorkspaceError?error.code:'COMPETITOR_ERROR'});}
  }
  return {service,handle,close:service.close};
}
