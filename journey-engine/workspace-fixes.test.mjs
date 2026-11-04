import {retainedFixture} from './retained-test-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createWorkspaceFixes } from './workspace-fixes.mjs';
import { allowedSourceFile, buildFixContext, buildFixPrompt, configuredPreview, copySource, manifestHash, sourceManifest, staticPreview } from './workspace-fix-runtime.mjs';
import { personaMemoryForScreen } from './memory-runtime.mjs';
import { composePersonaContext } from './library-context.mjs';

async function fixture(options={}){
  const root=retainedFixture('journey-fix-test-'),source=join(root,'product'),runsDir=join(root,'runs');
  await mkdir(source);await writeFile(join(source,'index.html'),'<h1>Original activity</h1>');
  const runId=randomUUID(),findingId=`finding-${runId}-0`;await mkdir(join(runsDir,runId),{recursive:true});await writeFile(join(runsDir,runId,'screen-0.png'),'test fixture image bytes');
  const environment={id:'environment',repositoryPath:source,url:'http://127.0.0.1:4320/',isolation:'stateless-demo'};
  const run={id:runId,projectId:'project',environmentId:environment.id,environmentSnapshot:environment,charterSnapshot:{mission:'Start the activity'},personaId:'parent',persona:{id:'parent',name:'Parent',context:'No printer',mission:'Start an activity'},status:'finished',integrityStatus:'recorded',finding:{outcome:'obstacle_observed',observation:'Only print instructions visible',evidence_indices:[0]},events:[{type:'screenshot',index:0,screenshot:`/runs/${runId}/screen-0.png`}],finalMessage:'Observed an obstacle'};
  const finding={id:findingId,runId,projectId:'project',title:'Activity requires unavailable resources',observation:run.finding.observation};run.findings=[finding];const runs=new Map([[runId,run]]),prompts=[];
  const store={getFinding:id=>id===findingId?finding:null,getRun:id=>runs.get(id),getEntity:()=>environment,updateFinding:(_id,data)=>Object.assign(finding,data),listFindings:()=>[finding]};
  let generation=0;
  const generate=async({candidate,promptPath})=>{
    prompts.push(await readFile(promptPath,'utf8'));generation++;
    await writeFile(join(candidate,'index.html'),`<h1>Activity revision ${generation}</h1>`);
    const contract={title:'Start the activity on screen',criteria:[{id:'start',description:'A visible first step is available',source:'finding'}]};
    await writeFile(join(candidate,'FIX_PLAN.json'),JSON.stringify(contract));
    const candidateManifest=await sourceManifest(candidate);return {candidateManifest,candidateHash:manifestHash(candidateManifest),contract,changedFiles:['index.html'],summary:'Implemented a reviewable change.',diff:'fixture diff'};
  };
  const service=createWorkspaceFixes({root:join(root,'fixes'),store,runsDir,legacyImprovementsRoot:join(root,'legacy'),legacyComparisonsDir:join(root,'comparisons'),configured:()=>true,generate,preview:options.preview||(async()=>({url:'http://127.0.0.1:4500/',close:async()=>{}})),previewTtlMs:options.previewTtlMs,runVariant:async input=>{
    await options.onVariant?.(input);
    const result={...run,id:input.id,variant:input.variant,status:options.runStatus||'finished',finding:{outcome:input.variant==='after'?(options.afterOutcome||'goal_reached'):'obstacle_observed'},video:`/runs/${input.id}/original.webm`,replay:`/runs/${input.id}/condensed.webm`,events:[]};runs.set(result.id,result);return result;
  }});
  return {root,source,service,run,finding,prompts,runs,store,environment};
}

test('safe isolated source copy excludes credentials and rejects symbolic links',async()=>{
  const root=retainedFixture('journey-source-test-'),source=join(root,'source');await mkdir(source);await writeFile(join(source,'index.html'),'Product');await writeFile(join(source,'.env'),'do-not-copy');await mkdir(join(source,'node_modules'));await writeFile(join(source,'node_modules','index.js'),'dependency');
  const manifest=await copySource(source,join(root,'candidate'));
  assert.deepEqual(Object.keys(manifest),['index.html']);assert.equal(allowedSourceFile('nested/.env.local'),false);assert.equal(allowedSourceFile('../index.html'),false);
  await symlink(join(source,'index.html'),join(source,'linked.html'));await assert.rejects(()=>sourceManifest(source),/Symbolic links/);
});

test('fix generation derives its contract from the finding and automatically retests',async()=>{
  const f=await fixture(),original=await readFile(join(f.source,'index.html'),'utf8');
  const fix=await f.service.create({findingId:f.finding.id});await f.service.waitForIdle();const detail=await f.service.get(fix.id);
  assert.equal(detail.status,'awaiting_review');assert.equal(detail.rounds.length,1);assert.equal(detail.latestRound.comparison.status,'completed');assert.equal(detail.latestRound.verification.status,'not_configured');
  assert.equal(detail.latestRound.comparison.pairs[0].after.finding.outcome,'goal_reached');assert.match(f.prompts[0],/derive the smallest relevant improvement/);assert.match(f.prompts[0],/Only print instructions visible/);assert.doesNotMatch(f.prompts[0],/printTask|guest-start/);
  assert.equal(await readFile(join(f.source,'index.html'),'utf8'),original);
  assert.equal(detail.sourceRun,undefined);assert.equal(detail.latestRound.candidateDirectory,undefined);
  await f.service.close();
});

test('fix planning consumes frozen evaluator references without changing first-time explorer knowledge',async()=>{
  const variants=[],f=await fixture({onVariant:input=>variants.push(structuredClone(input))});
  f.run.target='http://127.0.0.1:4320/';f.run.events[0].url='http://127.0.0.1:4320/activity';f.finding.eventIndex=0;f.run.events.push({type:'screenshot',index:2,url:'http://127.0.0.1:4320/billing',screenshot:`/runs/${f.run.id}/later.png`});
  f.run.personaSnapshot={...f.run.persona,continuity:'first-time'};f.run.persona=structuredClone(f.run.personaSnapshot);f.run.charterSnapshot.memoryPolicy='relevant';
  const reference=(id,extra={})=>({id,version:2,versionId:`${id}-v2`,projectId:'project',audience:'evaluator',status:'published',kind:'expected_behavior',claimType:'approved_rule',polarity:'affirm',subject:id,value:'required',content:`${id}: preserve the sourced expected behavior.`,confidence:0.9,confidenceBasis:'An explicit sourced product rule.',sources:[{runId:f.run.id,eventIndex:0,screenshot:f.run.events[0].screenshot}],scope:{screenPatterns:['/activity'],flows:[]},applicability:{},...extra});
  const rule=reference('usable-start'),observed=reference('observed-label',{claimType:'observed'});
  f.run.memorySnapshot={id:'frozen-discovery',projectId:'project',buildResolved:true,roles:{persona:[],evaluator:[rule,observed,reference('unvisited',{scope:{screenPatterns:['/billing'],flows:[]}}),reference('disputed',{status:'disputed'}),reference('foreign',{projectId:'another-project'})],operational:[reference('never-execute-setup',{audience:'operational',content:'Never-execute setup command.'})]}};f.run.memorySnapshotId='frozen-discovery';
  const pinned=structuredClone(f.run.memorySnapshot);f.store.memory={list:()=>{throw Error('Fix planning must not retrieve current Library content');},resolveSnapshot:()=>{throw Error('Fix planning must not refresh source knowledge');}};
  assert.equal(personaMemoryForScreen(f.run,{accessForScreen:()=>{throw Error('First-time explorer must not retrieve any memory');}},f.run.events[0].url).text,'');
  assert.doesNotMatch(composePersonaContext(f.run.personaSnapshot),/usable-start|observed-label|Never-execute/);
  const created=await f.service.create({findingId:f.finding.id});
  f.run.memorySnapshot.roles.evaluator.push(reference('published-later'));rule.content='An edited current entry must not replace the discovery snapshot.';
  await f.service.waitForIdle();let detail=await f.service.get(created.id);const first=structuredClone(detail.latestRound);
  assert.equal(detail.status,'awaiting_review');assert.deepEqual(first.evaluatorMemory.entries.map(entry=>entry.id),['usable-start','observed-label']);assert.deepEqual(first.evaluatorMemory.entries.map(entry=>entry.claimType),['approved_rule','observed']);assert.equal(first.evaluatorMemory.entries[0].content,pinned.roles.evaluator[0].content);
  const promptContext=JSON.parse(f.prompts[0].split('Context and review records:\n')[1]);assert.deepEqual(promptContext.evaluatorMemory,first.evaluatorMemory);assert.match(f.prompts[0],/observed behavior is not automatically a requirement/);assert.match(f.prompts[0],/evaluator-memory entry\/version and source reference/);assert.doesNotMatch(f.prompts[0],/published-later|Never-execute setup command|edited current entry/);
  const log=detail.history.find(event=>event.type==='evaluator_memory_selected');assert.equal(log.snapshotId,'frozen-discovery');assert.deepEqual(log.entries,[{id:'usable-start',version:2,versionId:'usable-start-v2'},{id:'observed-label',version:2,versionId:'observed-label-v2'}]);
  assert.equal(variants.length,2);for(const variant of variants){assert.deepEqual(variant.sourceRun.memorySnapshot,pinned);assert.equal(variant.persona.continuity,'first-time');assert.doesNotMatch(JSON.stringify(variant.persona),/usable-start|observed-label/);}
  await f.service.revise(created.id,{message:'Keep the same sourced expectation.'});await f.service.waitForIdle();detail=await f.service.get(created.id);
  assert.deepEqual(detail.rounds[0].evaluatorMemory,first.evaluatorMemory);assert.deepEqual(detail.latestRound.evaluatorMemory.entries,first.evaluatorMemory.entries);assert.equal(detail.history.filter(event=>event.type==='evaluator_memory_selected').length,2);assert.doesNotMatch(f.prompts[1],/published-later|edited current entry/);
  assert.equal(variants.length,4);assert.ok(variants.every(variant=>JSON.stringify(variant.sourceRun.memorySnapshot)===JSON.stringify(pinned)));
  await f.service.close();
});

test('oversized reports and evaluator memory cannot truncate exact review requests, annotations or source frames',()=>{
  const message='Please keep the keyboard path and make the no-printer choice visible. Exact request ends here.',body='Pinned feedback: preserve the visible label “Start on screen”. Keep this exact note.';
  const persona={id:'parent',name:'Parent',continuity:'first-time',mission:'Start one activity',resources:'No printer',constraints:'Ten minutes',context:'background '.repeat(8000)};
  const frames=[{artifactUrl:'/runs/source/frame.png',eventIndex:4,file:'source-frame.png',observation:'observed context '.repeat(5000)},{artifactUrl:'/runs/source/original.webm',originalMs:12560,x:.25,y:.8,commentId:'review-1',file:'annotation-frame.png'}];
  const entries=Array.from({length:12},(_,index)=>({id:`rule-${index}`,version:3,versionId:`rule-${index}-v3`,claimType:'approved_rule',content:'optional evaluator detail '.repeat(500),confidence:.9,confidenceBasis:'Cited rule',sources:[{runId:'source',eventIndex:4}]}));
  const input={finding:{id:'finding',title:'Activity unavailable',observation:'Only print instructions are visible.',expected:'The approved no-printer goal must remain achievable.',expectationSource:'Saved charter v2'},run:{id:'source',personaSnapshot:persona,finding:{outcome:'obstacle_observed'},finalMessage:'legacy source report '.repeat(20000)},charter:{mission:'Start an activity',successCriteria:'A visible first on-screen step.',expectedBehaviorSources:'Saved charter v2'},feedback:{message,comments:[{id:'review-1',body,artifactUrl:frames[1].artifactUrl,originalMs:12560,x:.25,y:.8}]},evidence:frames,evaluatorMemory:{snapshotId:'frozen',sourceRunId:'source',audience:'evaluator',entries,screens:[],limitations:[]}};
  const before=structuredClone(input),prompt=buildFixPrompt({...input,revision:true}),serialized=prompt.split('Context and review records:\n')[1].trim(),context=JSON.parse(serialized);
  assert.ok(serialized.length<=48000);assert.equal(context.feedback.message,message);assert.equal(context.feedback.comments[0].body,body);assert.equal(context.feedback.comments[0].originalMs,12560);assert.equal(context.feedback.comments[0].x,.25);assert.equal(context.feedback.comments[0].y,.8);
  assert.deepEqual(context.evidence.map(({observation,...frame})=>frame),frames.map(({observation,...frame})=>frame));assert.equal(context.finding.expected,input.finding.expected);assert.equal(context.finding.expectationSource,input.finding.expectationSource);assert.equal(context.charter.successCriteria,input.charter.successCriteria);
  assert.ok(context.omissions.some(item=>item.path==='observedReport'));assert.ok(context.omissions.some(item=>item.path.startsWith('evaluatorMemory.entries.')));assert.ok(context.omissions.some(item=>item.path==='persona.context'));assert.deepEqual(input,before);
  assert.doesNotMatch(composePersonaContext(persona),/rule-\d|Pinned feedback/);
  assert.throws(()=>buildFixContext({...input,feedback:{message:'cannot omit this '.repeat(10000),comments:[]}}),error=>error.code==='FIX_CONTEXT_TOO_LARGE');
});

test('approval is exact-round/hash bound and never creates or claims a PR',async()=>{
  const f=await fixture(),created=await f.service.create({findingId:f.finding.id});await f.service.waitForIdle();let fix=await f.service.get(created.id),round=fix.latestRound;
  await assert.rejects(()=>f.service.approve(fix.id,{roundId:round.id,candidateHash:'stale'}),/exact candidate hash/);
  fix=await f.service.approve(fix.id,{roundId:round.id,candidateHash:round.candidateHash});assert.equal(fix.status,'approved');assert.equal(fix.deliveryStatus,'approved_connection_required');assert.equal(fix.prUrl,undefined);
  const candidate=join(f.root,'fixes',fix.id,'rounds',round.id,'candidate');await writeFile(join(candidate,'index.html'),'Modified after approval');
  await assert.rejects(()=>f.service.approve(fix.id,{roundId:round.id,candidateHash:round.candidateHash}),/changed after its recorded checks/);await f.service.close();
});

test('revision receives immutable screenshot feedback and preserves prior approval and comments',async()=>{
  const f=await fixture(),created=await f.service.create({findingId:f.finding.id});await f.service.waitForIdle();let fix=await f.service.get(created.id),first=fix.latestRound;
  await f.service.approve(fix.id,{roundId:first.id,candidateHash:first.candidateHash});
  const comment=await f.service.addComment(fix.id,{roundId:first.id,body:'Make this button easier to find.',artifactUrl:f.run.events[0].screenshot,x:.4,y:.7});
  await f.service.addComment(fix.id,{roundId:first.id,parentId:comment.id,body:'Keep the printable route too.'});
  await f.service.revise(fix.id,{commentIds:[comment.id]});await f.service.waitForIdle();fix=await f.service.get(fix.id);
  assert.equal(fix.rounds.length,2);assert.equal(fix.rounds[0].candidateHash,first.candidateHash);assert.equal(fix.rounds[0].approval.candidateHash,first.candidateHash);assert.equal(fix.approval,null);
  assert.equal(fix.comments[0].roundId,first.id);assert.equal(fix.latestRound.feedbackSnapshot.comments[0].body,comment.body);assert.match(f.prompts[1],/Make this button easier to find/);assert.match(f.prompts[1],/"x": 0.4/);assert.equal(fix.comments[0].includedInRounds[0],fix.currentRoundId);
  await assert.rejects(()=>f.service.approve(fix.id,{roundId:first.id,candidateHash:first.candidateHash}),/current round/);await f.service.close();
});

test('annotation provenance rejects unrelated artifacts and condensed-clock URLs',async()=>{
  const f=await fixture(),created=await f.service.create({findingId:f.finding.id});await f.service.waitForIdle();const fix=await f.service.get(created.id),round=fix.latestRound;
  await assert.rejects(()=>f.service.addComment(fix.id,{roundId:round.id,body:'Here',artifactUrl:`/runs/${randomUUID()}/screen.png`,x:.1,y:.2}),/another fix or round/);
  await assert.rejects(()=>f.service.addComment(fix.id,{roundId:round.id,body:'Here',artifactUrl:round.comparison.pairs[0].after.replay,originalMs:200}),/original recording/);
  const comment=await f.service.addComment(fix.id,{roundId:round.id,body:'This moment',artifactUrl:round.comparison.pairs[0].after.video,originalMs:200});assert.equal(comment.originalMs,200);await f.service.close();
});

test('an unsuccessful retest cannot be approved',async()=>{
  const f=await fixture({afterOutcome:'obstacle_observed'}),created=await f.service.create({findingId:f.finding.id});await f.service.waitForIdle();const fix=await f.service.get(created.id),r=fix.latestRound;
  await assert.rejects(()=>f.service.approve(fix.id,{roundId:r.id,candidateHash:r.candidateHash}),/did not reach its goal/);await f.service.close();
});

test('retest caps narrow both variants and personas without rewriting pinned configuration',async()=>{
  const variants=[],f=await fixture({onVariant:input=>variants.push(structuredClone(input))});
  Object.assign(f.environment,{maxSteps:24,maxTokens:600000,maxDurationMs:600000});f.run.executionPolicy=null;f.run.charterSnapshot.personaIds=['parent','teacher'];
  const teacher={id:'teacher',projectId:'project',version:1,name:'Teacher',context:'Classroom supplies',mission:'Prepare an activity'};
  f.store.getEntity=kind=>kind==='persona'?teacher:f.environment;
  const original=structuredClone(f.run),created=await f.service.create({findingId:f.finding.id});await f.service.waitForIdle();assert.equal(variants.length,4);assert.ok(variants.every(value=>value.executionPolicy===undefined));
  const before=(await f.service.get(created.id)).latestRound.comparison.id;
  for(const limits of [{maxSteps:25},{maxTokens:600001},{maxDurationMs:600001},{maxSteps:0},{maxSteps:1.5},{allowMutations:true}])await assert.rejects(f.service.requestRetest(created.id,{limits}));
  assert.equal((await f.service.get(created.id)).latestRound.comparison.id,before);
  const limits={maxSteps:12,maxTokens:150000,maxDurationMs:300000};await f.service.requestRetest(created.id,{limits});await f.service.waitForIdle();
  const after=await f.service.get(created.id);assert.notEqual(after.latestRound.comparison.id,before);assert.deepEqual(after.latestRound.comparison.controlOverrides.limits,limits);assert.ok(after.latestRound.comparison.limitations.length);
  assert.equal(variants.length,8);for(const input of variants.slice(4)){for(const [key,value]of Object.entries(limits))assert.equal(input.executionPolicy[key],value);assert.equal(input.sourceRun.executionPolicy,null);assert.deepEqual(input.sourceRun.environmentSnapshot,original.environmentSnapshot);assert.deepEqual(input.charter,original.charterSnapshot);}
  for(const key of ['persona','charterSnapshot','environmentSnapshot','executionPolicy'])assert.deepEqual(f.run[key],original[key]);await f.service.close();
});

test('saved charter personas are pinned and retested even without a prior supporting Run',async()=>{
  const variants=[],f=await fixture({onVariant:input=>variants.push(input)});f.run.charterSnapshot.personaIds=['parent','teacher'];
  f.run.executionPolicy={maxSteps:12,maxTokens:100000,maxDurationMs:300000,allowMutations:false,captureBodies:false};
  const teacher={id:'teacher',projectId:'project',version:3,versionId:'teacher-v3',name:'Teacher',context:'Has classroom supplies',mission:'Prepare a lesson',initialKnowledge:'Has used classroom activities',continuity:'first-time'};
  f.store.getEntity=kind=>kind==='persona'?teacher:f.environment;
  const created=await f.service.create({findingId:f.finding.id});await f.service.waitForIdle();const fix=await f.service.get(created.id);
  assert.deepEqual(fix.latestRound.comparison.pairs.map(x=>x.personaId),['parent','teacher']);assert.equal(fix.retestPlan[1].profileVersion,3);assert.match(f.prompts[0],/Has classroom supplies/);assert.match(f.prompts[0],/no previous observation/);
  assert.equal(fix.retestPlan[1].reason,'suggested by saved mission');
  const teacherVariants=variants.filter(input=>input.persona.id==='teacher');assert.equal(teacherVariants.length,2);
  for(const input of teacherVariants){
    assert.deepEqual(input.persona,teacher);assert.deepEqual(input.sourceRun.personaSnapshot,teacher);assert.deepEqual(input.sourceRun.persona,teacher);
    assert.equal(input.sourceRun.personaVersionId,'teacher-v3');assert.deepEqual(input.sourceRun.executionPolicy,f.run.executionPolicy);
    assert.equal(input.charter.mission,'Start the activity');assert.equal(input.persona.mission,'Prepare a lesson');
  }
  assert.equal(teacher.mission,'Prepare a lesson');assert.equal(f.run.personaSnapshot,undefined);await f.service.close();
});

test('fix pairs retain their pinned knowledge and supporting personas never inherit the source persona memory',async()=>{
  let currentKnowledge='Before fix creation',resolved=0;
  const variants=[],f=await fixture({onVariant:input=>{variants.push(structuredClone(input));currentKnowledge='Published during the baseline retest';}});
  f.environment.projectId='project';f.environment.version=1;
  Object.assign(f.run.charterSnapshot,{projectId:'project',personaIds:['parent','teacher'],memoryPolicy:'relevant'});
  f.run.memorySnapshot={id:'parent-snapshot',projectId:'project',buildResolved:true,roles:{persona:[{id:'parent-only'}],operational:[],evaluator:[]}};f.run.memorySnapshotId='parent-snapshot';
  const teacher={id:'teacher',projectId:'project',version:3,name:'Teacher',continuity:'returning',mission:'Prepare a lesson'};
  f.store.getEntity=kind=>kind==='persona'?teacher:f.environment;
  f.store.memory={buildIdentity:()=> 'source:baseline',resolveSnapshot:({persona,buildId})=>{resolved++;return {id:`${persona.id}-snapshot`,projectId:'project',buildResolved:true,environment:{buildId},roles:{persona:[{id:'teacher-only',content:currentKnowledge}],operational:[],evaluator:[]}};}};
  await f.service.create({findingId:f.finding.id});await f.service.waitForIdle();
  assert.equal(resolved,1);assert.equal(variants.length,4);
  const parent=variants.filter(input=>input.persona.id==='parent'),teachers=variants.filter(input=>input.persona.id==='teacher');
  assert.deepEqual(parent.map(input=>input.sourceRun.memorySnapshotId),['parent-snapshot','parent-snapshot']);
  assert.deepEqual(teachers.map(input=>input.sourceRun.memorySnapshotId),['teacher-snapshot','teacher-snapshot']);
  assert.deepEqual(teachers[0].sourceRun.memorySnapshot,teachers[1].sourceRun.memorySnapshot);assert.equal(teachers[1].sourceRun.memorySnapshot.roles.persona[0].content,'Before fix creation');
  assert.ok(!JSON.stringify(teachers).includes('parent-only'));await f.service.close();
});

test('unavailable suggested personas do not block fixes from a pinned charter',async()=>{
  const f=await fixture();f.run.charterSnapshot.personaIds=['parent','archived','missing','foreign'];
  f.store.getEntity=(kind,id)=>kind!=='persona'?f.environment:id==='missing'?null:{id,projectId:id==='foreign'?'another-project':'project',archived:id==='archived',name:id,mission:'Not eligible for a new supporting profile'};
  const originalCharter=structuredClone(f.run.charterSnapshot),created=await f.service.create({findingId:f.finding.id});await f.service.waitForIdle();
  const fix=await f.service.get(created.id);
  assert.equal(fix.status,'awaiting_review');
  assert.deepEqual(fix.latestRound.comparison.pairs.map(x=>x.personaId),['parent']);
  assert.deepEqual(fix.retestPlan.map(x=>x.personaId),['parent']);
  assert.deepEqual(f.run.charterSnapshot,originalCharter);await f.service.close();
});

test('explicitly required personas still block when unavailable and coexist with suggestions',async()=>{
  const f=await fixture();f.run.charterSnapshot.requiredPersonaIds=['reviewer'];f.run.charterSnapshot.personaIds=['teacher'];
  const teacher={id:'teacher',projectId:'project',version:1,name:'Teacher',mission:'Prepare a lesson'};
  let reviewer;
  f.store.getEntity=(kind,id)=>kind!=='persona'?f.environment:id==='teacher'?teacher:reviewer;
  for(const unavailable of [null,{id:'reviewer',projectId:'project',archived:true},{id:'reviewer',projectId:'another-project'}]){
    reviewer=unavailable;
    await assert.rejects(()=>f.service.create({findingId:f.finding.id}),error=>error.status===409&&/required mission persona is unavailable/.test(error.message));
  }
  assert.equal(f.prompts.length,0);
  reviewer={id:'reviewer',projectId:'project',version:2,name:'Reviewer',mission:'Assess the activity'};
  const created=await f.service.create({findingId:f.finding.id});await f.service.waitForIdle();const fix=await f.service.get(created.id);
  assert.deepEqual(fix.latestRound.comparison.pairs.map(x=>x.personaId),['parent','reviewer','teacher']);
  assert.equal(fix.retestPlan.find(x=>x.personaId==='reviewer').reason,'required by saved mission');
  assert.equal(fix.retestPlan.find(x=>x.personaId==='teacher').reason,'suggested by saved mission');await f.service.close();
});

test('supporting Runs from another source build are rejected',async()=>{
  const f=await fixture();f.run.productFingerprint=await sourceManifest(f.source);
  const other={...f.run,id:randomUUID(),personaId:'teacher',productFingerprint:{'index.html':'different-build'}};f.runs.set(other.id,other);
  await assert.rejects(()=>f.service.create({findingId:f.finding.id,supportRunIds:[other.id]}),/same app, environment version and recorded product build/);await f.service.close();
});
test('supporting preview runs use the same configured environment version and exact source build',async()=>{
 const f=await fixture();f.run.productFingerprint=await sourceManifest(f.source);f.run.environmentVersion=1;
 const other={...f.run,id:randomUUID(),personaId:'teacher',persona:{id:'teacher',name:'Teacher'},environmentId:'temporary-before',environmentVersion:4};f.runs.set(other.id,other);
 f.store.resolveConfiguredEnvironment=(id,version)=>id==='temporary-before'?{id:f.environment.id,version:1}:id===f.environment.id?{id,version}:null;
 const created=await f.service.create({findingId:f.finding.id,supportRunIds:[other.id]});await f.service.waitForIdle();const fix=await f.service.get(created.id);
 assert.deepEqual(fix.sourceRunIds,[f.run.id,other.id]);assert.equal(fix.latestRound.comparison.pairs.length,2);assert.equal(f.runs.get(other.id).environmentId,'temporary-before');await f.service.close();
});

test('changing connected source after discovery stops generation before a model call',async()=>{
  const f=await fixture();f.run.productFingerprint=await sourceManifest(f.source);await writeFile(join(f.source,'index.html'),'Changed product');
  const created=await f.service.create({findingId:f.finding.id});await f.service.waitForIdle();const fix=await f.service.get(created.id);
  assert.equal(fix.status,'failed');assert.match(fix.error,/source changed after this finding/);assert.equal(f.prompts.length,0);await f.service.close();
});

test('concurrent duplicate fix requests create one candidate job',async()=>{
  const f=await fixture();
  const [a,b]=await Promise.all([f.service.create({findingId:f.finding.id}),f.service.create({findingId:f.finding.id})]);
  await f.service.waitForIdle();assert.equal(a.id,b.id);assert.equal(f.prompts.length,1);assert.equal((await f.service.list('project')).length,1);await f.service.close();
});

test('restart hides ephemeral URLs; reads do not launch commands and explicit preview validates hashes',async()=>{
  const f=await fixture(),created=await f.service.create({findingId:f.finding.id});await f.service.waitForIdle();
  const previous=await f.service.get(created.id),path=join(f.root,'fixes',created.id,'fix.json');await f.service.close();
  const saved=await readFile(path,'utf8');let starts=0;
  const restarted=createWorkspaceFixes({root:join(f.root,'fixes'),store:f.store,legacyImprovementsRoot:join(f.root,'legacy'),legacyComparisonsDir:join(f.root,'comparisons'),preview:async()=>{starts++;return {url:`http://127.0.0.1:${4600+starts}/`,close:async()=>{}};}});
  let detail=await restarted.get(created.id);await restarted.list('project');
  assert.equal(starts,0);assert.equal(detail.latestRound.candidateUrl,null);assert.equal(detail.latestRound.baselineUrl,null);assert.equal(detail.latestRound.previewStatus,'not_running');assert.equal(await readFile(path,'utf8'),saved);
  detail=await restarted.startPreview(created.id,{roundId:detail.currentRoundId});
  assert.equal(starts,2);assert.equal(detail.latestRound.previewStatus,'available');assert.match(detail.latestRound.candidateUrl,/4602/);assert.equal(detail.latestRound.finishedAt,previous.latestRound.finishedAt);assert.equal(detail.latestRound.comparison.pairs[0].after.video,previous.latestRound.comparison.pairs[0].after.video);
  await writeFile(join(f.root,'fixes',created.id,'rounds',detail.currentRoundId,'baseline','index.html'),'Changed baseline');
  await assert.rejects(()=>restarted.startPreview(created.id,{roundId:detail.currentRoundId}),/baseline changed/);assert.equal(starts,2);await restarted.close();
});

test('legacy presentation uses the current port without rewriting saved history',async()=>{
  const f=await fixture(),created=await f.service.create({findingId:f.finding.id});await f.service.waitForIdle();await f.service.close();
  const path=join(f.root,'fixes',created.id,'fix.json'),record=JSON.parse(await readFile(path,'utf8'));
  record.rounds[0].legacy=true;record.rounds[0].candidateUrl=`http://localhost:4331/improvements/${created.id}/candidate/`;record.rounds[0].baselineUrl=`http://localhost:4331/improvements/${created.id}/baseline/`;await writeFile(path,JSON.stringify(record));
  const saved=await readFile(path,'utf8');let starts=0;
  const restarted=createWorkspaceFixes({root:join(f.root,'fixes'),store:f.store,port:4319,legacyImprovementsRoot:join(f.root,'legacy'),legacyComparisonsDir:join(f.root,'comparisons'),preview:async()=>{starts++;throw Error('Must not launch on read');}});
  const detail=await restarted.get(created.id);
  assert.equal(detail.latestRound.candidateUrl,`http://localhost:4319/improvements/${created.id}/candidate/`);assert.equal(detail.latestRound.baselineUrl,`http://localhost:4319/improvements/${created.id}/baseline/`);assert.equal(starts,0);assert.equal(detail.updatedAt,record.updatedAt);assert.equal(detail.latestRound.finishedAt,record.rounds[0].finishedAt);assert.equal(await readFile(path,'utf8'),saved);await restarted.close();
});

test('explicit preview refuses a modified candidate before starting a runtime',async()=>{
  const f=await fixture(),created=await f.service.create({findingId:f.finding.id});await f.service.waitForIdle();const detail=await f.service.get(created.id);await f.service.close();
  await writeFile(join(f.root,'fixes',created.id,'rounds',detail.currentRoundId,'candidate','index.html'),'Changed candidate');let starts=0;
  const restarted=createWorkspaceFixes({root:join(f.root,'fixes'),store:f.store,legacyImprovementsRoot:join(f.root,'legacy'),legacyComparisonsDir:join(f.root,'comparisons'),preview:async()=>{starts++;throw Error('Must not launch modified source');}});
  await assert.rejects(()=>restarted.startPreview(created.id,{roundId:detail.currentRoundId}),/candidate changed/);assert.equal(starts,0);await restarted.close();
});

test('generic static preview runs its exact inline source scripts without allowing arbitrary inline scripts',async()=>{
  const root=retainedFixture('journey-inline-preview-');
  await writeFile(join(root,'index.html'),'<html><body><input id="task"><button id="save" disabled>Save</button><script>document.querySelector("#task").addEventListener("input",()=>document.querySelector("#save").disabled=false);</script></body></html>');
  const server=await staticPreview(root);let browser;
  try{
    browser=await chromium.launch({headless:true,channel:process.env.JOURNEY_BROWSER_CHANNEL||'chrome'});const page=await browser.newPage();await page.goto(server.url);await page.locator('#task').fill('Trip kit');assert.equal(await page.locator('#save').isEnabled(),true);
    await page.evaluate(()=>{const script=document.createElement('script');script.textContent='window.unlistedScriptRan = true';document.body.append(script);});assert.equal(await page.evaluate(()=>window.unlistedScriptRan),undefined);
    assert.equal(await page.evaluate(()=>fetch('https://example.test/not-allowed').then(()=>false).catch(()=>true)),true);
  }finally{await browser?.close();await server.close();}
});

function trackedPreviews({failAt}={}){
  const instances=[];let attempts=0;
  return {instances,preview:async()=>{
    attempts++;if(attempts===failAt)throw Error('Fixture startup failed');
    const instance={url:`http://127.0.0.1:${4800+attempts}/`,closed:false,closeCount:0,isAvailable(){return !this.closed;},async close(){this.closed=true;this.closeCount++;}};
    instances.push(instance);return instance;
  }};
}

test('automatic fix retests tear down both runtimes while retaining sources and recordings',async()=>{
  const tracked=trackedPreviews(),f=await fixture(tracked),created=await f.service.create({findingId:f.finding.id});await f.service.waitForIdle();
  let fix=await f.service.get(created.id);
  assert.equal(fix.status,'awaiting_review');assert.equal(tracked.instances.length,2);assert.ok(tracked.instances.every(instance=>instance.closed&&instance.closeCount===1));
  assert.equal(fix.latestRound.previewStatus,'not_running');assert.equal(fix.latestRound.previewCanStop,false);
  const firstPair=structuredClone(fix.latestRound.comparison.pairs[0]);assert.ok(firstPair.after.video);
  assert.match(await readFile(join(f.root,'fixes',created.id,'rounds',fix.currentRoundId,'candidate','index.html'),'utf8'),/revision 1/);
  await f.service.requestRetest(created.id);await f.service.waitForIdle();fix=await f.service.get(created.id);
  assert.equal(tracked.instances.length,4);assert.ok(tracked.instances.every(instance=>instance.closed&&instance.closeCount===1));
  assert.deepEqual(fix.latestRound.comparisons[0].pairs[0],firstPair);assert.equal(fix.latestRound.comparisons.length,2);
  await f.service.close();assert.ok(tracked.instances.every(instance=>instance.closeCount===1));
});

test('failed second startup closes the first automatic preview',async()=>{
  const tracked=trackedPreviews({failAt:2}),f=await fixture(tracked),created=await f.service.create({findingId:f.finding.id});await f.service.waitForIdle();
  const fix=await f.service.get(created.id);assert.equal(fix.status,'failed');assert.match(fix.error,/startup failed/);assert.equal(tracked.instances.length,1);assert.equal(tracked.instances[0].closed,true);assert.equal(fix.latestRound.previewStatus,'not_running');await f.service.close();
});

test('failed navigation and cancelled results still stop every temporary preview',async()=>{
  for(const cancelled of [false,true]){
    const tracked=trackedPreviews(),f=await fixture({...tracked,runStatus:cancelled?'cancelled':undefined,onVariant:input=>{if(!cancelled&&input.variant==='after')throw Error('Fixture navigation failed');}});
    const created=await f.service.create({findingId:f.finding.id});await f.service.waitForIdle();const fix=await f.service.get(created.id);
    assert.equal(fix.latestRound.comparison.status,cancelled?'inconclusive':'failed');assert.ok(tracked.instances.every(instance=>instance.closed));assert.equal(fix.latestRound.previewStatus,'not_running');
    assert.ok(fix.latestRound.comparison.pairs[0].before.video);await f.service.close();
  }
});

test('explicit preview can be stopped and expires without changing recorded comparisons',async()=>{
  const tracked=trackedPreviews(),f=await fixture({...tracked,previewTtlMs:30}),created=await f.service.create({findingId:f.finding.id});await f.service.waitForIdle();
  const recorded=(await f.service.get(created.id)).latestRound.comparison;
  let fix=await f.service.startPreview(created.id);assert.equal(fix.latestRound.previewCanStop,true);assert.equal(fix.latestRound.previewStatus,'available');
  fix=await f.service.stopPreview(created.id,{roundId:fix.currentRoundId});assert.equal(fix.latestRound.previewStatus,'not_running');assert.ok(tracked.instances.every(instance=>instance.closed));
  await f.service.startPreview(created.id);
  for(let i=0;i<100&&tracked.instances.some(instance=>!instance.closed);i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.ok(tracked.instances.every(instance=>instance.closed));fix=await f.service.get(created.id);assert.equal(fix.latestRound.previewStatus,'not_running');assert.deepEqual(fix.latestRound.comparison,recorded);await f.service.close();
});

test('explicit preview partial startup failure releases the successful runtime',async()=>{
  const tracked=trackedPreviews({failAt:4}),f=await fixture(tracked),created=await f.service.create({findingId:f.finding.id});await f.service.waitForIdle();
  await assert.rejects(()=>f.service.startPreview(created.id),/startup failed/);assert.ok(tracked.instances.every(instance=>instance.closed));assert.equal((await f.service.get(created.id)).latestRound.previewStatus,'not_running');await f.service.close();
});

test('configured preview teardown waits for the process group and escalates if it ignores termination',async()=>{
  const root=retainedFixture('journey-preview-shutdown-');
  await writeFile(join(root,'preview.mjs'),"import {createServer} from 'node:http'; import {writeFileSync} from 'node:fs'; process.on('SIGTERM',()=>{}); writeFileSync('preview.pid',String(process.pid)); createServer((req,res)=>res.end('ready')).listen(Number(process.env.PORT),'127.0.0.1');");
  const preview=await configuredPreview(root,{startCommand:'node preview.mjs'},join(root,'preview.log'));
  const pid=Number(await readFile(join(root,'preview.pid'),'utf8'));
  try{assert.equal((await fetch(preview.url)).status,200);await preview.close();await preview.close();assert.equal(preview.isAvailable(),false);await assert.rejects(()=>fetch(preview.url));assert.throws(()=>process.kill(pid,0),error=>error.code==='ESRCH');}
  finally{await preview.close();}
});

test('selected visual proposals retain provenance and reach the isolated revision prompt',async()=>{
 const f=await fixture();try{const fix=await f.service.create({findingId:f.finding.id});await f.service.waitForIdle();const proposalId=randomUUID(),dir=join(f.root,'media-assist');await mkdir(dir,{recursive:true});await writeFile(join(dir,proposalId+'.json'),JSON.stringify({id:proposalId,projectId:'project',status:'concept',prompt:'Make the start choice visible',source:{runId:f.run.id,eventIndex:0}}));await writeFile(join(dir,proposalId+'.png'),'fixture design bytes');await f.service.revise(fix.id,{message:'Implement the selected concept',designProposalId:proposalId});await f.service.waitForIdle();const updated=await f.service.get(fix.id);assert.equal(updated.status,'awaiting_review');assert.match(f.prompts[1],/Selected design concept \(not observed behavior or test evidence\)/);assert.match(f.prompts[1],new RegExp(proposalId));await assert.rejects(()=>f.service.revise(fix.id,{message:'bad path',designProposalId:'../outside'}),/Invalid design proposal/);const foreign=randomUUID();await writeFile(join(dir,foreign+'.json'),JSON.stringify({id:foreign,projectId:'another',status:'concept',source:{runId:f.run.id}}));await assert.rejects(()=>f.service.revise(fix.id,{message:'foreign',designProposalId:foreign}),/does not belong/);}finally{await f.service.close();}
});
