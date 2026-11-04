import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { LEGACY_SCENARIO, PRINT_SCENARIO, listPersonas } from './personas.mjs';
import { productFingerprint as fingerprint, sameProductFingerprint as same } from './product-integrity.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUNNING=['queued','running_before','running_after','cancelling'];
const LIMITS='Duas execuções sintéticas independentes por persona; não medem sentimentos reais, conversão ou impacto em pessoas. Resultados e capturas exigem revisão humana.';
const json=(res,code,obj)=>{res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(obj));return true;};
async function body(req){let s='',size=0;for await(const b of req){size+=b.length;if(size>4096)throw Error('Corpo grande demais.');s+=b;}let x;try{x=JSON.parse(s);}catch{throw Error('JSON inválido.');}if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).length!==1||!UUID.test(x.improvementId||''))throw Error('Informe somente um improvementId válido.');return x;}
async function dir(path){try{const s=await lstat(path);return s.isDirectory()&&!s.isSymbolicLink();}catch{return false;}}
async function file(path){try{const s=await lstat(path);return s.isFile()&&!s.isSymbolicLink()&&s.size<=2_000_000;}catch{return false;}}
class VersionChanged extends Error {}
function metric(run){return {outcome:run?.finding?.outcome||null,actionCount:Array.isArray(run?.events)?run.events.filter(e=>e.type==='action').length:0,status:run?.status||null};}
export function createComparisonsApi({root,improvementsRoot,port,configured,runVariant,getRun,isBusy}){
  root=resolve(root);improvementsRoot=resolve(improvementsRoot);let active=null, activeJob=null, controller=null, pendingSave=Promise.resolve();
  const save=x=>{const serialized=JSON.stringify(x,null,2),id=x.id;pendingSave=pendingSave.catch(()=>{}).then(async()=>{await mkdir(join(root,id),{recursive:true,mode:0o700});const path=join(root,id,'comparison.json');await writeFile(path+'.next',serialized,{mode:0o600});await rename(path+'.next',path);});return pendingSave;};
  const load=async id=>{if(!UUID.test(id)||!await dir(join(root,id))||!await file(join(root,id,'comparison.json')))return null;try{const x=JSON.parse(await readFile(join(root,id,'comparison.json'),'utf8'));return x.id===id?x:null;}catch{return null;}};
  const storedPairs=x=>x.pairs || [{personaId:'mother',persona:listPersonas(LEGACY_SCENARIO)[0],baselineRunId:x.baselineRunId,candidateRunId:x.candidateRunId,comparison:x.comparison||null}];
  const view=async x=>{
    const interrupted=x.id!==active&&RUNNING.includes(x.status);
    const pairs=await Promise.all(storedPairs(x).map(async pair=>({...pair,before:await getRun(pair.baselineRunId),after:await getRun(pair.candidateRunId)})));
    const primary=(RUNNING.includes(x.status)?pairs.find(p=>p.personaId===x.currentPersonaId):null)||pairs[0];
    return {id:x.id,improvementId:x.improvementId,scenarioId:x.scenarioId||LEGACY_SCENARIO,status:interrupted?'interrupted':x.status,createdAt:x.createdAt,completedAt:x.completedAt,currentPersonaId:x.currentPersonaId||primary?.personaId,pairs,baselineRunId:primary?.baselineRunId,candidateRunId:primary?.candidateRunId,before:primary?.before||null,after:primary?.after||null,comparison:x.comparison||null,error:interrupted?'O serviço foi reiniciado antes de a comparação terminar.':x.error||null};
  };
  async function checkVersions(x,base,candidate){
    if(!same(x.baselineFingerprint,await fingerprint(base))||!same(x.candidateFingerprint,await fingerprint(candidate)))throw new VersionChanged('Uma cópia mudou durante a comparação.');
  }
  async function execute(x,base,candidate,signal){try{
    for(const pair of x.pairs){
      signal.throwIfAborted();x.currentPersonaId=pair.personaId;x.status='running_before';await save(x);
      await checkVersions(x,base,candidate);
      const shared={comparisonId:x.id,scenarioId:x.scenarioId,persona:pair.persona,signal};
      const before=await runVariant({...shared,id:pair.baselineRunId,variant:'baseline',productDirectory:base,target:`http://localhost:${port}/improvements/${x.improvementId}/baseline/`});
      signal.throwIfAborted();await checkVersions(x,base,candidate);
      if(!before?.video||before.status!=='finished'||!before.finding||before.integrityStatus==='invalidated')throw Error('A jornada original não foi concluída com vídeo e relato.');
      x.status='running_after';await save(x);
      const after=await runVariant({...shared,id:pair.candidateRunId,variant:'candidate',productDirectory:candidate,target:`http://localhost:${port}/improvements/${x.improvementId}/candidate/`});
      signal.throwIfAborted();await checkVersions(x,base,candidate);
      if(!after?.video||after.status!=='finished'||!after.finding||after.integrityStatus==='invalidated')throw Error('A jornada candidata não foi concluída com vídeo e relato.');
      pair.comparison={before:metric(before),after:metric(after),limitations:LIMITS};await save(x);
    }
    x.comparison={...x.pairs[0].comparison,personas:x.pairs.map(p=>({personaId:p.personaId,...p.comparison})),limitations:LIMITS};
    x.status='completed';x.completedAt=new Date().toISOString();await save(x);
  }catch(error){
    x.status=signal.aborted?'cancelled':error instanceof VersionChanged?'invalidated':'failed';
    if(error instanceof VersionChanged){x.comparison=null;for(const pair of x.pairs)pair.comparison=null;}
    x.error=signal.aborted?'Comparação cancelada; os registros e vídeos disponíveis foram preservados.':error instanceof VersionChanged?'Uma cópia mudou durante a comparação; o resultado foi invalidado.':'A comparação não pôde ser concluída. Revise as jornadas e os vídeos disponíveis.';x.completedAt=new Date().toISOString();await save(x).catch(()=>{});
  }finally{active=null;activeJob=null;controller=null;}}
  async function handle(req,res,url){
    if(req.method==='GET'&&url.pathname==='/api/comparisons'){
      let ds=[];try{ds=await readdir(root,{withFileTypes:true});}catch{}
      const xs=(await Promise.all(ds.filter(d=>d.isDirectory()&&UUID.test(d.name)).map(d=>load(d.name)))).filter(Boolean).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,100);
      return json(res,200,{comparisons:xs.map(x=>({id:x.id,improvementId:x.improvementId,scenarioId:x.scenarioId||LEGACY_SCENARIO,personaIds:storedPairs(x).map(p=>p.personaId),currentPersonaId:x.currentPersonaId,status:x.id!==active&&RUNNING.includes(x.status)?'interrupted':x.status,createdAt:x.createdAt,baselineRunId:x.baselineRunId,candidateRunId:x.candidateRunId}))});
    }
    if(req.method==='POST'&&url.pathname==='/api/comparisons'){
      if(active||isBusy())return json(res,409,{error:'Já existe uma jornada ou comparação em execução.'});let input;try{input=await body(req);}catch(e){return json(res,400,{error:e.message});}
      if(!configured())return json(res,503,{error:'A chave da Meta não está configurada.',code:'MODEL_API_KEY_MISSING'});
      if(active||isBusy())return json(res,409,{error:'Já existe uma jornada ou comparação em execução.'});active='preparing';
      try{
        const job=join(improvementsRoot,input.improvementId);if(!await dir(job)||!await file(join(job,'status.json')))throw Error('Melhoria não encontrada.');
        const status=JSON.parse(await readFile(join(job,'status.json'),'utf8'));if(status.experimentId!==input.improvementId||status.status!=='awaiting_review'||status.verification?.status!=='passed')throw Error('A melhoria precisa estar pronta e ter passado nas verificações.');
        const scenarioId=status.scenarioId||LEGACY_SCENARIO;
        const personas=listPersonas(scenarioId);
        const base=join(job,'baseline'),candidate=join(job,'candidate');const baselineFingerprint=await fingerprint(base),candidateFingerprint=await fingerprint(candidate);
        if(scenarioId===PRINT_SCENARIO&&(!status.productFingerprint||!same(status.productFingerprint,baselineFingerprint)))throw Error('A referência não corresponde ao produto observado na descoberta.');
        if(scenarioId===PRINT_SCENARIO&&(!status.verification.candidateFingerprint||!same(status.verification.candidateFingerprint,candidateFingerprint)))throw Error('A candidata mudou desde a verificação. Verifique essa versão antes de comparar.');
        const pairs=personas.map(persona=>({personaId:persona.id,persona,baselineRunId:randomUUID(),candidateRunId:randomUUID(),comparison:null}));
        const x={id:randomUUID(),improvementId:input.improvementId,scenarioId,status:'queued',createdAt:new Date().toISOString(),currentPersonaId:pairs[0].personaId,pairs,baselineRunId:pairs[0].baselineRunId,candidateRunId:pairs[0].candidateRunId,baselineFingerprint,candidateFingerprint,comparison:null};
        await save(x);active=x.id;activeJob=x;controller=new AbortController();void execute(x,base,candidate,controller.signal);return json(res,202,{id:x.id,improvementId:x.improvementId,scenarioId,status:'queued'});
      }catch(e){active=null;return json(res,400,{error:String(e.message||'Melhoria indisponível.').slice(0,200)});}
    }
    const cancel=url.pathname.match(/^\/api\/comparisons\/([0-9a-f-]+)\/cancel$/i);
    if(req.method==='POST'&&cancel){const id=cancel[1];if(!UUID.test(id))return json(res,404,{error:'Comparação não encontrada.'});if(active!==id||!activeJob||!controller)return json(res,409,{error:'Essa comparação não está em execução.'});activeJob.status='cancelling';controller.abort();await save(activeJob);return json(res,202,{id,status:activeJob?.status||'cancelled'});}
    const m=url.pathname.match(/^\/api\/comparisons\/([0-9a-f-]+)$/i);if(req.method==='GET'&&m){const x=await load(m[1]);return x?json(res,200,await view(x)):json(res,404,{error:'Comparação não encontrada.'});}
    return false;
  }
  return {handle,active:()=>active};
}
