import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const HERE=dirname(fileURLToPath(import.meta.url));
const startedLine=/^Journey Lab: http:\/\/127\.0\.0\.1:\d+\s*$/m;

// Node alone consumes the mounted environment. This parent never reads the FIFO,
// copies a secret to a file, prints child stderr, or attempts to unlock 1Password.
export async function runSecureLauncher({signal,spawnChild=spawn,env=process.env,cwd=HERE,node=process.execPath,startupTimeoutMs=10000,shutdownGraceMs=15000,log=console.log,onReady=()=>{},command}={}){
  const port=Number.isInteger(Number(env.JOURNEY_PORT))&&Number(env.JOURNEY_PORT)>0?Number(env.JOURNEY_PORT):4319;
  async function attempt(mode){
    const childEnv={...env};if(mode==='review'){delete childEnv.MODEL_API_KEY;delete childEnv.META_API_KEY;childEnv.JOURNEY_REVIEW_MODE='1';}
    const args=command(mode);
    // The default is selected below, so tests can run harmless simulated children.
    let child;try{child=spawnChild(node,args,{cwd,env:childEnv,stdio:['ignore','pipe','pipe']});}catch{return {started:false,reason:'spawn_failed'};}
    let resolveExit,resolveReady,settled=false,output='';
    const exit=new Promise(resolve=>resolveExit=resolve),ready=new Promise(resolve=>resolveReady=resolve);
    const finish=value=>{if(!settled){settled=true;resolveExit(value);}};
    child.once('error',()=>finish({code:1,reason:'spawn_failed'}));child.once('exit',(code,exitSignal)=>finish({code:code??(exitSignal?1:0),signal:exitSignal}));
    child.stderr?.resume();
    child.stdout?.on('data',chunk=>{output=(output+chunk.toString()).slice(-4096);if(startedLine.test(output))resolveReady({ready:true});});
    let abortListener,timeout;
    const aborted=new Promise(resolve=>{abortListener=()=>resolve({aborted:true});signal?.addEventListener('abort',abortListener,{once:true});if(signal?.aborted)abortListener();});
    async function terminate(){
      if(settled)return exit;
      const waitForExit=async milliseconds=>{let timer;try{return await Promise.race([exit,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),milliseconds);})]);}finally{clearTimeout(timer);}};
      child.kill('SIGTERM');
      const first=await waitForExit(shutdownGraceMs);
      if(first)return first;
      child.kill('SIGKILL');
      const stopped=await waitForExit(1000);
      if(!stopped)throw new Error('The previous launcher process could not be stopped. Review mode was not started.');
      return stopped;
    }
    try{
      const initial=await Promise.race([ready,exit.then(value=>({exit:value})),aborted,new Promise(resolve=>{timeout=setTimeout(()=>resolve({timeout:true}),startupTimeoutMs);})]);
      clearTimeout(timeout);
      if(!initial.ready){await terminate();return {started:false,reason:initial.aborted?'cancelled':initial.timeout?'startup_timeout':'startup_failed'};}
      if(signal?.aborted){await terminate();return {started:false,reason:'cancelled'};}
      log(`Journey Lab: http://127.0.0.1:${port}`);
      log(mode==='secure'?'Secure startup completed. Meta availability is shown in the app.':'Review mode: Meta is unavailable. Existing journeys and recordings are available.');
      onReady({mode,pid:child.pid});
      const outcome=await Promise.race([exit,aborted]);
      if(outcome.aborted){await terminate();return {started:true,mode,code:0,stopped:true};}
      return {started:true,mode,code:outcome.code};
    }finally{clearTimeout(timeout);signal?.removeEventListener('abort',abortListener);}
  }
  // Keep the actual secure command in one place and never use shell expansion.
  const defaultCommand=mode=>mode==='secure'?['--env-file=.env','server.mjs']:['server.mjs'];
  command ||=defaultCommand;
  if(signal?.aborted)return {mode:null,code:0,stopped:true};
  const secure=await attempt('secure');
  if(secure.started)return secure;
  if(signal?.aborted||secure.reason==='cancelled')return {mode:null,code:0,stopped:true};
  log('Secure startup is unavailable. Opening review mode; no key was read or saved by the launcher.');
  log('To reconnect Meta: unlock 1Password, stop this app, then run npm run start:secure.');
  const review=await attempt('review');
  if(!review.started){if(signal?.aborted)return {mode:null,code:0,stopped:true};log('Review mode could not start. Check whether another Journey Lab instance already uses this port.');return {mode:'review',code:1,reason:review.reason};}
  return review;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const controller=new AbortController();process.once('SIGINT',()=>controller.abort());process.once('SIGTERM',()=>controller.abort());
  const requested=Number(process.env.JOURNEY_START_TIMEOUT_MS),startupTimeoutMs=Number.isInteger(requested)&&requested>=100&&requested<=60000?requested:10000;
  try{const result=await runSecureLauncher({signal:controller.signal,startupTimeoutMs});process.exitCode=result.code;}
  catch{console.error('Journey Lab startup could not finish safely. Check the existing process before retrying.');process.exitCode=1;}
}
