import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=dirname(fileURLToPath(import.meta.url));
const files=['app.js','index.html','styles.css'];
const optionalAssets=['assets/atlas.webp','assets/willow.webp'];
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp'};
export async function gatherIdentity(directory,variant){
  const manifest={};
  for(const name of files)manifest[name]=createHash('sha256').update(await readFile(join(directory,name))).digest('hex');
  for(const name of optionalAssets){
    try{manifest[name]=createHash('sha256').update(await readFile(join(directory,name))).digest('hex');}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
  const sourceHash=createHash('sha256').update(JSON.stringify(Object.entries(manifest).sort(([a],[b])=>a.localeCompare(b)))).digest('hex');
  return {product:'Gather',variant,sourceHash,files:manifest,fixture:'12-person-projector-booking-v1',storage:'browser-session-only'};
}
export async function startGatherVariant({variant,port=0,directory=join(root,variant)}={}){
  if(!['base','proposal'].includes(variant))throw Error('Choose base or proposal.');
  const server=createServer(async(req,res)=>{
    try{
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
      const path=new URL(req.url,'http://localhost').pathname;
      if(path==='/__gather/build'){
        const identity=await gatherIdentity(directory,variant);
        res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
        return res.end(req.method==='HEAD'?'':JSON.stringify(identity));
      }
      const name=path==='/'?'index.html':path.slice(1);
      if(!files.includes(name)&&!optionalAssets.includes(name)){res.writeHead(404,{'content-type':'text/plain'});return res.end('Not found');}
      const body=await readFile(join(directory,name));
      res.writeHead(200,{'content-type':mime[name.slice(name.lastIndexOf('.'))],'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'"});
      res.end(req.method==='HEAD'?'':body);
    }catch(error){
      const missing=error.code==='ENOENT';
      res.writeHead(missing?404:500,{'content-type':'text/plain'});res.end(missing?'Not found':'Gather could not load this page.');
    }
  });
  await new Promise((done,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',done);});
  let closing;
  return {server,url:`http://127.0.0.1:${server.address().port}`,close:()=>closing||=(new Promise(done=>{server.close(done);server.closeAllConnections?.();}))};
}
export async function withGatherVariant(input,work){
  let instance;
  try{instance=await startGatherVariant(input);}
  catch(error){
    if(error.code!=='EADDRINUSE'||!input.port)throw error;
    const identity=await fetch(`http://127.0.0.1:${input.port}/__gather/build`,{signal:AbortSignal.timeout(1500)}).then(response=>response.json());
    const expected=await gatherIdentity(input.directory||join(root,input.variant),input.variant);
    if(identity.product!==expected.product||identity.variant!==expected.variant||identity.sourceHash!==expected.sourceHash)throw Error('The configured port belongs to a different build.');
  }
  try{return await work(instance?.url||`http://127.0.0.1:${input.port}`);}finally{await instance?.close();}
}
export async function startGather({basePort=4390,proposalPort=4391}={}){
  const base=await startGatherVariant({variant:'base',port:basePort});
  try{const proposal=await startGatherVariant({variant:'proposal',port:proposalPort});return {base,proposal,close:()=>Promise.all([base.close(),proposal.close()])};}
  catch(error){await base.close();throw error;}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const servers=await startGather({basePort:Number(process.env.GATHER_BASE_PORT||4390),proposalPort:Number(process.env.GATHER_PROPOSAL_PORT||4391)});
  console.log(JSON.stringify({base:servers.base.url,proposal:servers.proposal.url,storage:'browser-session-only'}));
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,async()=>{await servers.close();process.exit(0);});
}
