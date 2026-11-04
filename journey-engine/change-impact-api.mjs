import {WorkspaceError} from './workspace-store.mjs';
import {createChangeImpactService} from './change-impact.mjs';

const send=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));return true;};
async function body(req){let text='',size=0;for await(const chunk of req){size+=chunk.length;if(size>32768)throw new WorkspaceError('Change impact request exceeds 32 KB.',413,'BODY_TOO_LARGE');text+=chunk;}try{const value=text?JSON.parse(text):{};if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{throw new WorkspaceError('Send a JSON object.');}}
export function createChangeImpactApi({root,store,getFix,port=4319}={}){
  const service=createChangeImpactService({root,store,getFix});
  async function handle(req,res,url=new URL(req.url,`http://127.0.0.1:${port}`)){
    if(!/^\/api\/workspace\/change-impacts(?:\/|$)/.test(url.pathname))return false;
    try{
      if(!['GET','HEAD'].includes(req.method)&&req.headers.origin&&req.headers.origin!==`http://127.0.0.1:${port}`)return send(res,403,{error:'This action must originate from Journey Lab.',code:'ORIGIN_DENIED'});
      if(req.method==='DELETE')return send(res,405,{error:'Change reviews and their versions are retained.',code:'KEEP_ALL'});
      const input=['POST','PATCH'].includes(req.method)?await body(req):{},queryProject=url.searchParams.get('projectId');
      if(queryProject&&input.projectId&&queryProject!==input.projectId)throw new WorkspaceError('The request belongs to another app.',400,'PROJECT_MISMATCH');
      const projectId=queryProject||input.projectId;if(typeof projectId!=='string'||!projectId.trim())throw new WorkspaceError('Choose an app.',400,'PROJECT_REQUIRED');store.requireProject(projectId);
      const parts=url.pathname.slice('/api/workspace/change-impacts'.length).split('/').filter(Boolean).map(decodeURIComponent);
      if(req.method==='GET'&&!parts.length)return send(res,200,{changeImpacts:await service.list(projectId)});
      if(req.method==='POST'&&!parts.length)return send(res,201,await service.create({...input,projectId}));
      if(parts.length===1&&req.method==='GET'){const version=url.searchParams.has('version')?Number(url.searchParams.get('version')):undefined;if(version!==undefined&&(!Number.isSafeInteger(version)||version<1))throw new WorkspaceError('Choose a positive version.',400,'INVALID_VERSION');return send(res,200,await service.get(parts[0],projectId,version));}
      if(parts.length===1&&req.method==='PATCH')return send(res,200,await service.update(parts[0],{...input,projectId}));
      return send(res,404,{error:'Change impact route not found.',code:'NOT_FOUND'});
    }catch(error){return send(res,error instanceof WorkspaceError?error.status:500,{error:error instanceof WorkspaceError?error.message:'Change impact request failed.',code:error instanceof WorkspaceError?error.code:'CHANGE_IMPACT_ERROR'});}
  }
  return {service,handle};
}
