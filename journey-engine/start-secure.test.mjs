import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {runSecureLauncher} from './start-secure.mjs';

const ready="console.log('Journey Lab: http://127.0.0.1:4319');setInterval(()=>{},1000);";
test('secure launcher delegates the mount to Node and forwards orderly shutdown without printing stderr',async()=>{
  const calls=[],logs=[],controller=new AbortController();
  const result=await runSecureLauncher({signal:controller.signal,startupTimeoutMs:1500,shutdownGraceMs:100,log:value=>logs.push(value),spawnChild:(node,args,options)=>{calls.push({args,options});return spawn(node,['-e',"console.error('PRIVATE-STARTUP-CANARY');"+ready],options);},onReady:()=>controller.abort()});
  assert.deepEqual(calls[0].args,['--env-file=.env','server.mjs']);assert.equal(result.mode,'secure');assert.equal(result.stopped,true);assert.equal(calls.length,1);assert.ok(!logs.join(' ').includes('PRIVATE-STARTUP-CANARY'));
});
test('a blocked secure child is killed before review fallback and review strips provider credentials',async()=>{
  const logs=[],calls=[],controller=new AbortController();let priorExited=false;
  const result=await runSecureLauncher({signal:controller.signal,startupTimeoutMs:180,shutdownGraceMs:60,env:{...process.env,MODEL_API_KEY:'fixture-only-canary',META_API_KEY:'fixture-only-canary'},log:value=>logs.push(value),spawnChild:(node,args,options)=>{
    calls.push({args,options});if(calls.length===2)assert.equal(priorExited,true);
    const child=spawn(node,['-e',calls.length===1?"process.on('SIGTERM',()=>{});setInterval(()=>{},1000);":ready],options);if(calls.length===1)child.once('exit',()=>priorExited=true);return child;
  },onReady:({mode})=>{assert.equal(mode,'review');controller.abort();}});
  assert.equal(result.mode,'review');assert.equal(calls.length,2);assert.deepEqual(calls[1].args,['server.mjs']);assert.equal(calls[1].options.env.MODEL_API_KEY,undefined);assert.equal(calls[1].options.env.META_API_KEY,undefined);assert.equal(calls[1].options.env.JOURNEY_REVIEW_MODE,'1');assert.match(logs.join(' '),/Meta is unavailable/);assert.ok(!logs.join(' ').includes('fixture-only-canary'));
});
test('a stop during secure startup does not start review mode',async()=>{
  const controller=new AbortController();let calls=0;
  const work=runSecureLauncher({signal:controller.signal,startupTimeoutMs:1000,shutdownGraceMs:100,log:()=>{},spawnChild:(node,_args,options)=>{calls++;return spawn(node,['-e','setInterval(()=>{},1000);'],options);}});
  setTimeout(()=>controller.abort(),30);const result=await work;assert.equal(result.stopped,true);assert.equal(calls,1);
});
test('two startup failures stop without retry loops or raw error output',async()=>{
  let calls=0;const logs=[];
  const result=await runSecureLauncher({startupTimeoutMs:1000,shutdownGraceMs:100,log:value=>logs.push(value),spawnChild:(node,_args,options)=>{calls++;return spawn(node,['-e',"console.error('PRIVATE-ERROR-CANARY');process.exit(1);"],options);}});
  assert.equal(calls,2);assert.equal(result.code,1);assert.equal(result.mode,'review');assert.ok(!logs.join(' ').includes('PRIVATE-ERROR-CANARY'));
});
