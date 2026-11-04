import { access, lstat, open, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREVIEW_FILES = new Set(['index.html','signup.html','setup.html','activity.html','preview.html','styles.css','app.js']);
const MIME = {html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'application/javascript; charset=utf-8'};
export const PREVIEW_CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; form-action 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'";
const send = (res,status,obj) => {res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(obj));return true;};
async function regular(path){try{const s=await lstat(path);return s.isFile()&&!s.isSymbolicLink();}catch{return false;}}
async function safeJobDir(root,id){if(!UUID.test(id))return null;const d=join(root,id);try{const s=await lstat(d);return s.isDirectory()&&!s.isSymbolicLink()?d:null;}catch{return null;}}
async function safeVariant(dir,variant){try{const s=await lstat(join(dir,variant));return s.isDirectory()&&!s.isSymbolicLink();}catch{return false;}}
async function safeCandidate(dir){return safeVariant(dir,'candidate');}
async function bounded(path,limit=32000){if(!await regular(path))return null;const f=await open(path,'r');try{const buf=Buffer.alloc(limit+1);const {bytesRead}=await f.read(buf,0,buf.length,0);return {text:buf.subarray(0,Math.min(limit,bytesRead)).toString('utf8'),truncated:bytesRead>limit};}finally{await f.close();}}
function publicStatus(status,activeId){
  if(!status || !UUID.test(status.experimentId||''))return null;
  const inFlight=['running','verifying'].includes(status.status);
  const current = status.experimentId === activeId;
  return {id:status.experimentId,scenarioId:status.scenarioId||'signup-v1',sourceRunIds:Array.isArray(status.sourceRunIds)?status.sourceRunIds.filter(x=>UUID.test(x)):[],runId:UUID.test(status.sourceRunId||'')?status.sourceRunId:null,status:status.status==='awaiting_review'&&current?'verifying':inFlight&&!current?'interrupted':status.status,createdAt:status.createdAt||null,startedAt:status.startedAt||null,finishedAt:status.finishedAt||null,changedFiles:Array.isArray(status.changedFiles)?status.changedFiles.filter(x=>typeof x==='string' && x.length<200).slice(0,50):[],verification:status.verification && typeof status.verification==='object'?status.verification:null,limitations:'Uma persona sintética fundamenta a proposta. A verificação não comprova impacto em pessoas reais.'};
}
async function bodyJson(req){let data='',size=0;for await(const chunk of req){size+=chunk.length;if(size>4096)throw new Error('Corpo da requisição é grande demais.');data+=chunk;}let result;try{result=JSON.parse(data);}catch{throw new Error('JSON inválido.');}if(!result || typeof result!=='object' || Array.isArray(result) || Object.keys(result).some(k=>!['runId','supportRunIds'].includes(k)) || !UUID.test(result.runId||'') || (result.supportRunIds !== undefined && (!Array.isArray(result.supportRunIds) || result.supportRunIds.length > 3 || result.supportRunIds.some(id=>typeof id!=='string'||!UUID.test(id)))))throw new Error('Informe um runId e até três jornadas de apoio válidas.');return result;}
export function createImprovementsApi({root,prepare,execute,verify,configured=()=>Boolean(process.env.MODEL_API_KEY||process.env.META_API_KEY), cliPath,port=4319}){
  root=resolve(root);let active=null;
  const available=async()=>{try{await access(cliPath,constants.X_OK);return true;}catch{return false;}};
  const readStatus=async(id)=>{const dir=await safeJobDir(root,id);if(!dir||!await regular(join(dir,'status.json')))return null;try{return JSON.parse((await bounded(join(dir,'status.json'),1000000)).text);}catch{return null;}};
  const list=async()=>{let dirs;try{dirs=await readdir(root,{withFileTypes:true});}catch{return [];}const result=await Promise.all(dirs.filter(x=>x.isDirectory()&&UUID.test(x.name)).map(async x=>publicStatus(await readStatus(x.name),active)));return result.filter(Boolean).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,100);};
  async function handle(req,res,url){
    if(req.method==='GET' && url.pathname==='/api/improvements')return send(res,200,{improvements:await list(),activeImprovement:active&&active!=='preparing'?active:null,museAvailable:await available(),modelConfigured:configured()});
    if(req.method==='POST' && url.pathname==='/api/improvements'){
      if(active)return send(res,409,{error:'Já existe uma melhoria em processamento.'});
      let input;try{input=await bodyJson(req);}catch(e){return send(res,400,{error:e.message});}
      if(!configured())return send(res,503,{error:'A chave da Meta não está configurada.',code:'MODEL_API_KEY_MISSING'});
      if(!await available())return send(res,503,{error:'O Muse Code não está disponível no servidor.',code:'MUSE_NOT_AVAILABLE'});
      if(active)return send(res,409,{error:'Já existe uma melhoria em processamento.'});
      active='preparing';let experiment;
      try{experiment=await prepare(input.runId,{supportRunIds:input.supportRunIds||[]});}catch{active=null;return send(res,400,{error:'Não foi possível preparar essa jornada. Verifique se ela tem um relato e capturas reais.'});}
      const id=experiment.report.experimentId;if(!UUID.test(id||'')){active=null;return send(res,500,{error:'O identificador da melhoria é inválido.'});}
      active=id;
      void (async()=>{try{const result=await execute(experiment);if(result.status==='awaiting_review'){result.status='verifying';await verify(id);}}catch{}finally{active=null;}})();
      return send(res,202,{id,runId:input.runId,status:'running'});
    }
    const api=url.pathname.match(/^\/api\/improvements\/([0-9a-f-]+)$/i);
    if(req.method==='GET'&&api){const id=api[1];if(!UUID.test(id))return send(res,404,{error:'Melhoria não encontrada.'});const status=publicStatus(await readStatus(id),active);if(!status)return send(res,404,{error:'Melhoria não encontrada.'});const dir=await safeJobDir(root,id);const candidateSafe=await safeCandidate(dir);const summary=candidateSafe?await bounded(join(dir,'candidate','IMPROVEMENT.md'),16000):null;const diff=await bounded(join(dir,'changes.patch'),64000);const ready=status.status==='awaiting_review';return send(res,200,{...status,summary:summary?.text||null,summaryTruncated:summary?.truncated||false,diff:diff?.text||null,diffTruncated:diff?.truncated||false,previewUrl:ready?`http://localhost:${port}/improvements/${id}/candidate/`:null,diffUrl:diff?`/improvements/${id}/changes.patch`:null});}
    const file=url.pathname.match(/^\/improvements\/([0-9a-f-]+)\/((?:candidate|baseline)(?:\/[a-zA-Z0-9._-]*)?|changes\.patch|IMPROVEMENT\.md)$/i);
    if(req.method==='GET'&&file){const id=file[1];if(!UUID.test(id))return send(res,404,{error:'Melhoria não encontrada.'});const dir=await safeJobDir(root,id);if(!dir)return send(res,404,{error:'Melhoria não encontrada.'});const status=publicStatus(await readStatus(id),active);if(!status || status.status!=='awaiting_review')return send(res,409,{error:'A melhoria não está pronta para revisão.'});const part=file[2];
      if(part.startsWith('candidate') || part.startsWith('baseline')){
        const variant=part.startsWith('candidate')?'candidate':'baseline';
        if(!await safeVariant(dir,variant))return send(res,404,{error:'Prévia indisponível.'});
        const name=part.slice(variant.length).replace(/^\//,'')||'index.html';if(!PREVIEW_FILES.has(name))return send(res,404,{error:'Arquivo não encontrado.'});
        const target=join(dir,variant,name);if(!await regular(target))return send(res,404,{error:'Arquivo não encontrado.'});const txt=await bounded(target,2000000);if(!txt||txt.truncated)return send(res,413,{error:'Arquivo grande demais.'});
        const host=req.headers.host||'';if(host!==`localhost:${port}`){res.writeHead(302,{location:`http://localhost:${port}/improvements/${id}/${variant}/${name}`,'cache-control':'no-store'});return res.end();}
        res.writeHead(200,{'content-type':MIME[name.split('.').at(-1)]||'text/plain','content-security-policy':PREVIEW_CSP,'x-content-type-options':'nosniff','cache-control':'no-store','referrer-policy':'no-referrer'});return res.end(txt.text);
      }
      if(part==='IMPROVEMENT.md'&&!await safeCandidate(dir))return send(res,404,{error:'Arquivo não encontrado.'});const target=part==='changes.patch'?join(dir,'changes.patch'):join(dir,'candidate','IMPROVEMENT.md');const txt=await bounded(target,64000);if(!txt)return send(res,404,{error:'Arquivo não encontrado.'});res.writeHead(200,{'content-type':'text/plain; charset=utf-8','x-content-type-options':'nosniff','cache-control':'no-store'});return res.end(txt.text+(txt.truncated?'\n[Conteúdo truncado]':''));
    }
    return false;
  }
  return {handle};
}
