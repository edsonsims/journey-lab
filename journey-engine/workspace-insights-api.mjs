import {WorkspaceError} from './workspace-store.mjs';
import {createInsightsService} from './workspace-insights.mjs';
import {createFeedbackRewriteService} from './experience-feedback-rewrite.mjs';

const send=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));return true;};
async function readBody(req){let text='',size=0;for await(const chunk of req){size+=chunk.length;if(size>1048576)throw new WorkspaceError('Inventory request exceeds 1 MB.',413,'BODY_TOO_LARGE');text+=chunk;}try{const value=text?JSON.parse(text):{};if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{throw new WorkspaceError('Send a JSON object.');}}
export function createWorkspaceInsightsApi({store,port=4319,requestMeta,configured}={}){
  const feedback=createFeedbackRewriteService({store,requestMeta,configured});
  const service=createInsightsService({store,feedback});
  async function handle(req,res,url=new URL(req.url,`http://127.0.0.1:${port}`)){
    if(!/^\/api\/workspace\/insights(?:\/|$)/.test(url.pathname))return false;
    try{
      if(!['GET','HEAD'].includes(req.method)&&req.headers.origin&&req.headers.origin!==`http://127.0.0.1:${port}`)return send(res,403,{error:'This action must originate from Journey Lab.',code:'ORIGIN_DENIED'});
      if(req.method==='DELETE')return send(res,405,{error:'Inventory versions, reviews and reports are retained.',code:'KEEP_ALL'});
      const parts=url.pathname.slice('/api/workspace/insights'.length).split('/').filter(Boolean).map(decodeURIComponent),[resource,id,action]=parts;
      const input=['POST','PATCH'].includes(req.method)?await readBody(req):{},queryProject=url.searchParams.get('projectId');
      if(queryProject&&input.projectId&&queryProject!==input.projectId)throw new WorkspaceError('The request belongs to another app.',400,'PROJECT_MISMATCH');
      const projectId=queryProject||input.projectId;if(typeof projectId!=='string'||!projectId.trim())throw new WorkspaceError('Choose an app.',400,'PROJECT_REQUIRED');store.requireProject(projectId);
      const version=url.searchParams.get('inventoryVersion'),filters={};for(const key of ['buildId','personaId','environmentId','device','deviceId','networkProfileId','flowId','from','to'])if(url.searchParams.has(key))filters[key]=url.searchParams.get(key);filters.includeInvalidated=url.searchParams.get('includeInvalidated')==='true';filters.includeExperimental=url.searchParams.get('includeExperimental')==='true';
      const options={projectId,...(version!==null?{inventoryVersion:Number(version)}:{}),filters};
      if(req.method==='GET'&&resource==='inventory'&&!id)return send(res,200,{inventory:service.getInventory(projectId,options.inventoryVersion)});
      if(req.method==='GET'&&resource==='inventory'&&id==='versions')return send(res,200,{versions:service.listInventoryVersions(projectId)});
      if(req.method==='POST'&&resource==='inventory'&&!id)return send(res,201,service.saveInventory({...input,projectId}));
      if(req.method==='GET'&&['coverage','experience'].includes(resource)&&!id)return send(res,200,service[resource](options));
      if(req.method==='POST'&&resource==='feedback'&&id==='rewrite'&&!action)return send(res,200,await feedback.rewrite({projectId,runId:input.runId,maxItems:input.maxItems}));
      if(req.method==='POST'&&resource==='feedback'&&id==='corrections'&&!action)return send(res,201,feedback.correct({projectId,id:input.id,sourceHash:input.sourceHash,kind:input.kind,summary:input.summary,why:input.why,reason:input.reason}));
      if(req.method==='GET'&&resource==='feedback'&&id==='status'&&!action)return send(res,200,feedback.status({projectId,runId:url.searchParams.get('runId')||undefined}));
      if(req.method==='GET'&&resource==='screens'&&id&&!action)return send(res,200,service.screenDetail({...options,screenId:id}));
      if(req.method==='GET'&&resource==='screens'&&id&&action==='charter')return send(res,200,service.gapCharter({...options,screenId:id}));
      if(req.method==='GET'&&resource==='reviews'&&!id)return send(res,200,{reviews:service.listReviews(projectId,{runId:url.searchParams.get('runId')||undefined})});
      if(req.method==='POST'&&resource==='reviews'&&!id)return send(res,201,service.saveReview({...input,projectId}));
      if(req.method==='GET'&&resource==='screen-states'&&!id)return send(res,200,{assignments:service.listScreenStates(projectId,{runId:url.searchParams.get('runId')||undefined})});
      if(req.method==='POST'&&resource==='screen-states'&&!id)return send(res,201,service.saveScreenState({...input,projectId}));
      if(req.method==='GET'&&resource==='reports'&&!id)return send(res,200,{reports:service.listReports(projectId)});
      if(req.method==='GET'&&resource==='reports'&&id)return send(res,200,service.getReport(projectId,id));
      if(req.method==='POST'&&resource==='reports'&&!id)return send(res,201,service.saveReport({...input,projectId,filters:input.filters||filters}));
      return send(res,404,{error:'Insight route not found.',code:'NOT_FOUND'});
    }catch(error){return send(res,error instanceof WorkspaceError?error.status:500,{error:error instanceof WorkspaceError?error.message:'Insight request failed.',code:error instanceof WorkspaceError?error.code:'INSIGHT_ERROR'});}
  }
  return {service,feedback,handle};
}
