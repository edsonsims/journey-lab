import {retainedFixture} from './retained-test-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createJourneyAlignmentStore } from './journey-alignment-store.mjs';
import { createWorkspaceFixes } from './workspace-fixes.mjs';

const decision=(before=0,after=0,extra={})=>({beforeId:`emotion-${before}`,afterId:`emotion-${after}`,status:'accepted',source:'suggested',...extra});
async function fixture(t){
  const root=retainedFixture('journey-alignment-');
  const makeRun=after=>({id:randomUUID(),status:'finished',video:'/runs/fixture/original.webm',replayMetadata:{originalDuration:3},
    experience:[{videoMs:0},{videoMs:after?1200:1000},{eventIndex:2},{observation:'Untimed note'},{videoMs:4000},{videoMs:after?1200:1000}],
    events:[{index:2,videoMs:after?2400:2000}]});
  const makePair=()=>{const before=makeRun(false),after=makeRun(true);return {beforeRunId:before.id,afterRunId:after.id,before,after};};
  const pairs=[makePair(),makePair()],round={id:randomUUID(),comparison:{id:randomUUID(),status:'completed',pairs}};
  round.comparisons=[round.comparison];
  const historical={id:randomUUID(),comparisons:[{id:randomUUID(),pairs:[makePair()]}]};
  const fix={id:randomUUID(),status:'awaiting_review',approval:null,currentRoundId:round.id,rounds:[historical,round],comments:[],history:[]};
  const getFix=async id=>{if(id!==fix.id)throw Object.assign(new Error('Fix not found.'),{status:404});return fix;};
  const store=createJourneyAlignmentStore({root,getFix}),pair=pairs[0];
  const scope={roundId:round.id,beforeRunId:pair.beforeRunId,afterRunId:pair.afterRunId};
  const directory=join(root,fix.id,'alignments',scope.roundId,`${scope.beforeRunId}--${scope.afterRunId}`);
  return {root,store,fix,getFix,scope,directory,pair,pairs,historical};
}
const status=expected=>error=>error.status===expected;

test('reviews start empty, persist separately, and retain every revision across restarts',async t=>{
  const f=await fixture(t),fixSnapshot=JSON.stringify(f.fix);
  assert.deepEqual(await f.store.get(f.fix.id,f.scope),{scope:{fixId:f.fix.id,...f.scope},revision:0,decisions:[],updatedAt:null,historyCount:0});
  const first=await f.store.put(f.fix.id,{...f.scope,baseRevision:0,decisions:[decision(),decision(2,2)]});
  assert.equal(first.revision,1);assert.equal(first.historyCount,1);assert.ok(first.updatedAt);
  const original=await readFile(join(f.directory,'1.json'),'utf8');
  const second=await f.store.put(f.fix.id,{...f.scope,baseRevision:1,decisions:[]});
  assert.equal(second.revision,2);assert.equal(second.historyCount,2);
  const restarted=createJourneyAlignmentStore({root:f.root,getFix:f.getFix});
  assert.deepEqual(await restarted.get(f.fix.id,f.scope),second);
  assert.equal(await readFile(join(f.directory,'1.json'),'utf8'),original);
  assert.equal(JSON.stringify(f.fix),fixSnapshot);
});

test('rejected suggestions coexist with a manually accepted different target',async t=>{
  const f=await fixture(t),decisions=[decision(1,1,{status:'rejected'}),decision(1,2,{source:'manual',note:'Same navigation action.'})];
  const saved=await f.store.put(f.fix.id,{...f.scope,baseRevision:0,decisions});
  assert.deepEqual(saved.decisions,decisions);
  // Untimed observed notes may be rejected, but cannot become playback anchors.
  await f.store.put(f.fix.id,{...f.scope,baseRevision:1,decisions:[decision(3,3,{status:'rejected'})]});
});

test('review scope cannot cross personas, rounds, or fixes; historical comparisons remain reviewable',async t=>{
  const f=await fixture(t);
  await f.store.put(f.fix.id,{...f.scope,baseRevision:0,decisions:[decision()]});
  const other=f.pairs[1],otherScope={...f.scope,beforeRunId:other.beforeRunId,afterRunId:other.afterRunId};
  assert.equal((await f.store.get(f.fix.id,otherScope)).revision,0);
  await assert.rejects(()=>f.store.get(f.fix.id,{...f.scope,afterRunId:other.afterRunId}),status(404));
  await assert.rejects(()=>f.store.get(f.fix.id,{...f.scope,roundId:f.historical.id}),status(404));
  await assert.rejects(()=>f.store.get(randomUUID(),f.scope),status(404));
  await assert.rejects(()=>f.store.get(f.fix.id,{...f.scope,roundId:'../../outside'}),status(400));
  const historicalPair=f.historical.comparisons[0].pairs[0];
  const historicalScope={roundId:f.historical.id,beforeRunId:historicalPair.beforeRunId,afterRunId:historicalPair.afterRunId};
  const saved=await f.store.put(f.fix.id,{...historicalScope,baseRevision:0,decisions:[decision()]});
  assert.equal(saved.revision,1);assert.equal(f.fix.currentRoundId,f.scope.roundId);assert.equal(f.fix.approval,null);
});

test('accepted pairs require real steps, usable media times, one-to-one matches, and forward order',async t=>{
  const f=await fixture(t),save=decisions=>f.store.put(f.fix.id,{...f.scope,baseRevision:0,decisions});
  for(const decisions of [
    [decision(90,0)], [decision(0,0,{beforeId:'emotion-00'})], [decision(3,3)], [decision(4,4)],
    [decision(),decision()], [decision(0,0),decision(0,1)], [decision(0,0),decision(1,0)],
    [decision(0,2),decision(1,1)], [decision(1,1),decision(5,5)],
    [decision(0,0,{status:'confirmed'})], [decision(0,0,{source:'ai'})], [decision(0,0,{note:'x'.repeat(1001)})],
  ])await assert.rejects(()=>save(decisions),status(400));
  assert.equal((await f.store.get(f.fix.id,f.scope)).revision,0);
  assert.equal((await save([decision(2,2),decision(0,0)])).revision,1,'Input order is irrelevant; recorded order is checked.');
});

test('timestamp lookup never borrows a sibling note or uses wall-clock duration as media time',async t=>{
  const f=await fixture(t);
  f.pair.before.experience[3]={eventIndex:7};
  f.pair.before.experience.push({eventIndex:7,videoMs:100});
  await assert.rejects(()=>f.store.put(f.fix.id,{...f.scope,baseRevision:0,decisions:[decision(3,0)]}),/recorded timestamps/);
  f.pair.before.experience[3]={originalMs:300,videoMs:400};
  f.pair.before.originalDurationMs=250;
  await assert.rejects(()=>f.store.put(f.fix.id,{...f.scope,baseRevision:0,decisions:[decision(3,0)]}),/outside its original recording/);
  delete f.pair.before.originalDurationMs;delete f.pair.before.replayMetadata;f.pair.before.durationMs=200;
  assert.equal((await f.store.put(f.fix.id,{...f.scope,baseRevision:0,decisions:[decision(3,0)]})).revision,1);
});

test('simultaneous writers cannot replace or lose a revision',async t=>{
  const f=await fixture(t),second=createJourneyAlignmentStore({root:f.root,getFix:f.getFix});
  const results=await Promise.allSettled([f.store,second].map((store,index)=>store.put(f.fix.id,{...f.scope,baseRevision:0,decisions:[decision(index,index)]})));
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(results.find(result=>result.status==='rejected').reason.status,409);
  assert.deepEqual(await readdir(f.directory),['1.json']);
  await assert.rejects(()=>f.store.put(f.fix.id,{...f.scope,baseRevision:0,decisions:[]}),status(409));
  assert.equal((await f.store.get(f.fix.id,f.scope)).historyCount,1);
});

async function request(service,method,path,data){
  const req=Readable.from(data===undefined?[]:[Buffer.from(typeof data==='string'?data:JSON.stringify(data))]);req.method=method;
  let statusCode,content;
  const res={writeHead(code){statusCode=code;},end(text){content=JSON.parse(text);}};
  assert.equal(await service.handle(req,res,new URL(path,'http://localhost')),true);
  return {status:statusCode,body:content};
}

test('fix HTTP routes validate requests and keep review writes outside candidate state',async t=>{
  const f=await fixture(t);
  await mkdir(join(f.root,f.fix.id),{recursive:true});
  const fixPath=join(f.root,f.fix.id,'fix.json'),original=JSON.stringify(f.fix);await writeFile(fixPath,original);
  const service=createWorkspaceFixes({root:f.root,store:{},legacyImprovementsRoot:join(f.root,'no-legacy'),legacyComparisonsDir:join(f.root,'no-comparisons')});
  t.after(()=>service.close());
  const path=`/api/workspace/fixes/${f.fix.id}/alignment`,query=new URLSearchParams(f.scope);
  const initial=await request(service,'GET',`${path}?${query}`);assert.equal(initial.status,200);assert.equal(initial.body.revision,0);
  const saved=await request(service,'PUT',path,{...f.scope,baseRevision:0,decisions:[decision()]});assert.equal(saved.status,200);assert.equal(saved.body.revision,1);
  assert.equal((await request(service,'PUT',path,{...f.scope,baseRevision:0,decisions:[]})).status,409);
  assert.equal((await request(service,'GET',path)).status,400);
  assert.equal((await request(service,'PUT',path,'{bad json')).status,400);
  assert.equal((await request(service,'PUT',path,{...f.scope,baseRevision:1,decisions:[],oversized:'x'.repeat(33000)})).status,413);
  assert.equal(await readFile(fixPath,'utf8'),original);
});
