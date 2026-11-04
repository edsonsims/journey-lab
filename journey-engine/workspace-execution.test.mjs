import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RunQueue,runQueued,requestAllowed,redactJson,redactText,safeUrl} from './workspace-execution.mjs';
import {parseJourneyFinish,parseExperienceNote} from './browser-tools.mjs';
test('environment policies bound origins and mutations without broadening comparison paths',()=>{
  const run={projectId:'p',target:'http://127.0.0.1:4320/',environmentSnapshot:{allowedOrigins:['https://api.example.test'],allowMutations:false}};
  assert(requestAllowed(run,'https://api.example.test/a','GET'));assert(!requestAllowed(run,'https://other.example.test/a'));assert(!requestAllowed(run,'https://api.example.test/a','POST'));
  assert(!requestAllowed(run,'file:///etc/passwd'));assert(!requestAllowed(run,'https://user:secret@api.example.test/a'));
  assert(!requestAllowed({target:'http://localhost:4319/improvements/a/candidate/',comparisonId:'c'},'http://localhost:4319/api/health'));
});
test('network capture strips URL values and structured secrets before persistence',()=>{
  assert(!safeUrl('https://u:pass@example.test/a?token=canary#secret').includes('canary'));
  const text=JSON.stringify(redactJson({password:'canary',nested:{email:'someone@example.test',ok:'Bearer abc123',message:'key-canary'}},['key-canary']));
  assert(!text.includes('canary'));assert(!text.includes('abc123'));assert(!text.includes('someone'));
  assert(!redactText('token=privateValue').includes('privateValue'));
});
test('queued runs execute once serially and cancelled pending runs never launch',async()=>{
  const visited=[],saved=[];let release;
  const gate=new Promise(resolve=>release=resolve);
  const q=new RunQueue({save:async r=>saved.push([r.id,r.status]),execute:async r=>{visited.push(r.id);if(r.id==='one')await gate;r.status='finished';}});
  const a=await q.enqueue({id:'one'}),b=await q.enqueue({id:'two'}),c=await q.enqueue({id:'three'});
  await q.cancel('two');release();await Promise.all([a.completion,b.completion,c.completion]);
  assert.deepEqual(visited,['one','three']);assert(saved.some(([id,s])=>id==='two'&&s==='cancelled'));
});
test('multiple findings require real screenshot references and keep simulated signal metadata',()=>{
  const item={title:'A blocked next step',type:'product',impact:'high',observation:'A requirement is visible.',expected:'A path fitting the available resources.',expectedSource:'Inferred persona expectation',personaComment:'I cannot do this now.',interpretation:'This path may block this context.',uncertainty:'Other users may have different resources.',evidence_indices:[3]};
  const args={outcome:'obstacle_observed',observation:'Observed.',interpretation:'May block.',uncertainty:'Limited.',evidence_indices:[3],findings:[item]};
  const call={type:'function_call',name:'finish_journey',arguments:JSON.stringify(args)};
  const events=[{type:'screenshot',index:3,screenshot:'/runs/a/s.png'}];
  assert.equal(parseJourneyFinish(call,events).findings[0].evidence[0].index,3);
  args.findings[0].evidence_indices=[99];assert.throws(()=>parseJourneyFinish({...call,arguments:JSON.stringify(args)},events));
  const note=parseExperienceNote({arguments:JSON.stringify({persona_note:'That makes sense.',valence:'positive',friction:0,track:'experience'})});
  assert.equal(note.valence,'positive');assert.equal(note.friction,0);
});

test('legacy comparison and workspace jobs share one worker and propagate cancellation',async()=>{
  const visited=[];let release;
  const gate=new Promise(resolve=>release=resolve);
  const q=new RunQueue({save:async()=>{},execute:async(run,signal)=>{
    visited.push(run.id);
    if(run.id==='workspace')await gate;
    else if(run.id==='active-comparison')await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));
    run.status=signal.aborted?'cancelled':'finished';
  }});
  const first=runQueued(q,{id:'workspace'});
  const pendingController=new AbortController();
  const pending=runQueued(q,{id:'pending-comparison'},pendingController.signal);
  pendingController.abort();
  assert.equal((await pending).status,'cancelled');
  const activeController=new AbortController();
  const active=runQueued(q,{id:'active-comparison'},activeController.signal);
  release();await first;
  activeController.abort();assert.equal((await active).status,'cancelled');
  assert.deepEqual(visited,['workspace','active-comparison']);
});

test('shutdown cancels pending captures and waits for active evidence finalization',async()=>{
  let finished=false;const visited=[],saved=[];
  const queue=new RunQueue({save:async run=>saved.push([run.id,run.status]),execute:async(run,signal)=>{
    visited.push(run.id);await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));
    await new Promise(resolve=>setTimeout(resolve,10));run.status='cancelled';finished=true;
  }});
  const one=await queue.enqueue({id:'one'}),two=await queue.enqueue({id:'two'});
  await queue.close();assert.equal(finished,true);assert.deepEqual(visited,['one']);assert.equal((await two.completion).status,'cancelled');await one.completion;
  assert.ok(saved.some(([id,status])=>id==='two'&&status==='cancelled'));await assert.rejects(queue.enqueue({id:'three'}),/stopping/);
});
test('concurrent admission cannot bypass the queue limit while persistence is pending',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve);
  const queue=new RunQueue({maxQueued:1,save:async()=>gate,execute:async run=>{run.status='finished';}});
  const first=queue.enqueue({id:'one'});await assert.rejects(queue.enqueue({id:'two'}),/full/);release();await (await first).completion;await queue.close();
});
