import test from 'node:test';
import assert from 'node:assert/strict';
import {IMPACT_EXAMPLES,getImpactExample} from './impact-examples.ts';
import {buildEmotionArc} from './emotion-arc.ts';
import {buildEmotionComparison,mapComparisonTime} from './emotion-comparison.ts';
import {buildImpactExperience} from './impact-experience.ts';
import {recordedCount} from './change-impact.ts';

const records=()=>IMPACT_EXAMPLES.map(example=>getImpactExample(example.id));
const runs=record=>record.report.pairs.flatMap(pair=>[pair.before,pair.after]);
function visit(value,fn){if(value&&typeof value==='object'){fn(value);for(const child of Object.values(value))visit(child,fn);}}

test('catalog supplies isolated four- and six-persona examples with distinct, contextual roles',()=>{
 assert.deepEqual(IMPACT_EXAMPLES.map(example=>example.personaCount),[4,6]);
 assert.equal(getImpactExample('not-an-example'),null);
 for(const item of IMPACT_EXAMPLES){
  const record=getImpactExample(item.id);
  assert.equal(record.report.pairs.length,item.personaCount);
  assert.equal(record.personas.length,item.personaCount);
  assert.equal(new Set(record.report.pairs.map(pair=>pair.personaId)).size,item.personaCount);
  assert.equal(new Set(record.report.pairs.map(pair=>pair.personaRole)).size,item.personaCount);
  for(const pair of record.report.pairs){
   assert.ok(pair.personaId.startsWith('example-'));
   assert.ok(pair.exampleObservation.length>30);assert.ok(pair.exampleReason.length>30);
   assert.equal(pair.before.personaSnapshot.memoryMode,'first_time');
   assert.ok(pair.before.personaSnapshot.context.length>40);
   assert.ok(pair.before.personaSnapshot.knowledge.length>0);
   assert.ok(pair.before.personaSnapshot.limitations.length>0);
   assert.equal(pair.before.personaId,pair.after.personaId);
   assert.equal(pair.before.personaSnapshot.goal,pair.after.personaSnapshot.goal);
  }
 }
});

test('examples carry no pull request, repository, recording, model usage, hashes or actual dates',()=>{
 for(const record of records()){
  assert.equal(record.isExample,true);assert.equal(record.provenance,'authored_ui_example');
  assert.equal(record.origin.kind,'local_change');assert.equal(record.origin.state,'proposed');
  assert.equal(record.origin.provenance,'authored_ui_example');
  for(const field of ['provider','repository','number','url','createdAt','mergedAt','baseRef','headRef','baseSha','headSha','mergeSha'])assert.equal(record.origin[field],null,field);
  assert.equal(record.fixId,null);assert.equal(record.report.repair,null);
  assert.doesNotMatch(JSON.stringify(record),/https?:\/\/|\.(?:webm|mp4|png|jpe?g)\b|\d{4}-\d{2}-\d{2}T/);
  visit(record,object=>{
   for(const field of ['sourceHash','video','replay','videoDurationMs','originalDurationMs','totalTokens','wallDurationMs','createdAt','updatedAt','startedAt','finishedAt']){
    if(field in object)assert.equal(object[field],null,`${field} must not claim an actual measurement`);
   }
   assert.equal(object.model,undefined);assert.equal(object.usage,undefined);
  });
  for(const run of runs(record)){
   assert.equal(run.isExample,true);assert.equal(run.provenance,'authored_ui_example');
   for(const event of run.events){
    assert.equal(event.isExample,true);assert.equal(event.provenance,'authored_ui_example');
    if(event.type==='screenshot'){
     assert.equal(event.captureKind,'authored_screen_state');
     for(const field of ['image','screenshot','path','file','filePath','imageUrl'])assert.equal(event[field],undefined);
     assert.ok(event.url.startsWith('/'),'Screen descriptors contain route context only.');
    }
   }
  }
 }
});

test('relative authored timelines render arcs without enabling playback or claiming recording duration',()=>{
 for(const record of records())for(const pair of record.report.pairs){
  for(const run of [pair.before,pair.after]){
   const arc=buildEmotionArc(run);
   assert.equal(arc.summary.timed,run.experience.length);
   assert.ok(arc.durationMs>0);
   let previous=-1;
   for(const entry of run.experience){
    assert.equal(entry.isExample,true);assert.equal(entry.clock,'relative_scenario_time');
    assert.equal(entry.scenarioMs,entry.originalMs);assert.ok(entry.originalMs>previous);previous=entry.originalMs;
    assert.equal(entry.videoMs,undefined);
   }
  }
  const comparison=buildEmotionComparison(pair.before,pair.after);
  assert.ok(comparison.domain.endMs>0);
  assert.equal(comparison.before.hasVideo,false);assert.equal(comparison.after.hasVideo,false);
  assert.equal(comparison.before.videoDurationMs,null);assert.equal(comparison.after.videoDurationMs,null);
  assert.equal(comparison.overlap,null);
  assert.deepEqual(mapComparisonTime(comparison,1000),{commonMs:1000,beforeMs:null,afterMs:null,beforeState:'unavailable',afterState:'unavailable'});
 }
});

test('semantic stage identifiers align the same action while preserving added or removed stages',()=>{
 for(const record of records())for(const pair of record.report.pairs){
  const before=new Map(pair.before.experience.map(entry=>[entry.exampleStepId,entry]));
  assert.equal(before.size,pair.before.experience.length);
  const after=new Map(pair.after.experience.map(entry=>[entry.exampleStepId,entry]));
  assert.equal(after.size,pair.after.experience.length);
  const shared=pair.after.experience.filter(entry=>before.has(entry.exampleStepId));
  assert.ok(shared.length>=2);
  for(const entry of shared)assert.equal(entry.exampleStepLabel,before.get(entry.exampleStepId).exampleStepLabel);
 }
 const nia=getImpactExample('example-relay-import').report.pairs[0];
 assert.ok(nia.before.experience.some(entry=>entry.exampleStepLabel==='Confirm mapping'));
 assert.equal(nia.after.experience.some(entry=>entry.exampleStepLabel==='Confirm mapping'),false);
});

test('the examples expose helpful, harmful, unchanged and unknown impacts without an aggregate winner',()=>{
 const relay=getImpactExample('example-relay-import').report.pairs;
 assert.deepEqual(relay.map(pair=>buildImpactExperience(pair).key),['helped','hurt','hurt','inconclusive']);
 const handoff=getImpactExample('example-handoff-links').report.pairs;
 assert.deepEqual(handoff.map(pair=>buildImpactExperience(pair).key),['helped','helped','hurt','hurt','unchanged','inconclusive']);
 const dev=handoff.find(pair=>pair.personaName==='Dev');
 assert.equal(dev.outcomeChange,'regressed');assert.equal(dev.effortChange,'fewer_actions');
 assert.equal(buildImpactExperience(dev).key,'hurt','Fewer actions cannot erase a failed privacy goal.');
 const priya=handoff.find(pair=>pair.personaName==='Priya');
 assert.equal(priya.outcomeChange,'unchanged');assert.equal(priya.effortChange,'more_actions');
 assert.equal(buildImpactExperience(priya).key,'hurt','Completing a goal does not erase friction.');
});

test('missing observations and counts stay unknown while genuine scenario zeroes stay zero',()=>{
 const relay=getImpactExample('example-relay-import').report.pairs;
 const nia=relay.find(pair=>pair.personaName==='Nia'),elias=relay.find(pair=>pair.personaName==='Elias');
 assert.equal(nia.after.experience.filter(entry=>['negative','very_negative'].includes(entry.valence)).length,0);
 assert.equal(recordedCount(nia.metrics.after.rejectedActions),0);
 assert.equal(elias.metrics.after.interactionActions,null);assert.equal(elias.metrics.actionDelta,null);
 assert.equal(recordedCount(elias.metrics.after.interactionActions),null);
 assert.equal(elias.effortChange,'unknown');assert.equal(elias.outcomeChange,'inconclusive');
 assert.equal(buildEmotionArc(elias.after).summary.unrated,1);
 assert.equal(buildImpactExperience(elias).emotion.direction,'unavailable');
 const mateo=getImpactExample('example-handoff-links').report.pairs.find(pair=>pair.personaName==='Mateo');
 assert.equal(mateo.metrics.actionDelta,0);assert.equal(mateo.effortChange,'same');
 assert.equal(buildImpactExperience(mateo).key,'unchanged');
});

test('loading or modifying an example never mutates the catalog or another load',()=>{
 const first=getImpactExample(IMPACT_EXAMPLES[0].id),original=structuredClone(first);
 first.title='Edited locally';first.report.pairs[0].after.experience[0].reaction='Edited reaction';
 first.personas.splice(0,1);
 assert.deepEqual(getImpactExample(IMPACT_EXAMPLES[0].id),original);
 assert.equal(IMPACT_EXAMPLES[0].personaCount,4);
});
