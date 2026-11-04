import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRunAttention,runMatchesAttention,sortRunsByAttention} from './run-attention.ts';

test('blocked journeys require a recorded obstacle, not runner failure or a negative reaction',()=>{
 const runs=[
  {id:'observed',status:'finished',outcome:'obstacle_observed'},
  {id:'legacy',status:'finished',finding:{outcome:'blocked'}},
  {id:'restriction',status:'blocked',error:'Control is not accessible'},
  {id:'failed',status:'failed',valence:'very_negative'},
  {id:'success',status:'finished',outcome:'goal_reached',finding:{outcome:'blocked'}},
 ];
 const result=buildRunAttention({runs});
 assert.deepEqual(result.blockedRuns.map(run=>run.id),['observed','legacy']);
 assert.deepEqual(result.counts,{blocked:2,critical:0,review:0,runs:2});
 assert.equal(result.byRun.get('restriction').rank,3);
});

test('effective critical findings exclude dismissed, duplicate and explicitly resolved issues',()=>{
 const findings=[
  {id:'active',runId:'a',impact:'critical',triage:'accepted'},
  {id:'dismissed',runId:'a',impact:'critical',triage:'dismissed'},
  {id:'duplicate',runId:'a',impact:'critical',triage:'duplicate'},
  {id:'resolved',runId:'a',impact:'critical',issueId:'closed'},
  {id:'missing-issue',runId:'a',impact:'critical',issueId:'missing'},
  {id:'reopened',runId:'a',impact:'critical',issueId:'reopened'},
  {id:'merged',runId:'a',impact:'critical',issueId:'merged'},
  {id:'overridden',runId:'a',impact:'low',suggestedImpact:'critical'},
  {id:'reaction',runId:'a',impact:'medium',valence:'very_negative'},
 ];
 const result=buildRunAttention({runs:[{id:'a'}],findings,issues:[
  {id:'closed',status:'resolved'},
  {id:'reopened',status:'reopened'},
  {id:'merged',status:'resolved',mergedInto:'reopened'},
 ]});
 assert.deepEqual(result.byRun.get('a').criticalFindingIds,['active','missing-issue','reopened','merged']);
 assert.equal(result.counts.critical,4);
});

test('only awaiting_review fixes count and explicit source links own their review action',()=>{
 const runs=['primary','support','finding-source','additional-finding-source','candidate','unrelated'].map(id=>({id}));
 const result=buildRunAttention({runs,findings:[{id:'source',runId:'finding-source'},{id:'additional-source',runId:'additional-finding-source'},{id:'support-source',runId:'support'}],fixes:[
  {id:'review',status:'awaiting_review',runId:'primary',sourceRunIds:['primary','support','support'],findingId:'source',findingIds:['source','additional-source','additional-source','support-source','missing-source',null],rounds:[{comparisons:[{pairs:[{afterRunId:'candidate'}]}]}]},
  {id:'prepared',status:'prepared',runId:'unrelated'},
  {id:'approved',status:'approved',runId:'unrelated'},
  {id:'retesting',status:'retesting',runId:'unrelated'},
  {id:'failed',status:'failed',runId:'unrelated'},
 ]});
 assert.equal(result.counts.review,1);assert.equal(result.counts.runs,4);
 for(const id of ['primary','support','finding-source','additional-finding-source'])assert.deepEqual(result.byRun.get(id).reviewFixIds,['review']);
 assert.deepEqual(result.byRun.get('candidate').reviewFixIds,[]);
 assert.equal(result.byRun.get('unrelated').rank,3);
});

test('successful candidate retests and approved fixes do not silently resolve a critical source finding',()=>{
 const result=buildRunAttention({
  runs:[{id:'before',outcome:'obstacle_observed'},{id:'after',outcome:'goal_reached'}],
  findings:[{id:'f',runId:'before',impact:'critical',fixId:'fixed'}],
  fixes:[{id:'fixed',runId:'before',findingId:'f',status:'approved',verification:{passed:true}}],
 });
 assert.equal(result.counts.critical,1);assert.equal(result.counts.blocked,1);
 assert.equal(result.counts.review,0);assert.equal(result.byRun.get('before').rank,0);
});

test('counts deduplicate records by ID and do not multiply fixes across source runs',()=>{
 const result=buildRunAttention({
  runs:[{id:'a',outcome:'blocked'},{id:'a',outcome:'blocked'},{id:'b'}],
  findings:[{id:'f',runId:'a',impact:'critical'},{id:'f',runId:'a',impact:'critical'}],
  fixes:[{id:'fix',status:'awaiting_review',sourceRunIds:['a','b']},{id:'fix',status:'awaiting_review',sourceRunIds:['a','b']}],
 });
 assert.deepEqual(result.counts,{blocked:1,critical:1,review:1,runs:2});
 assert.deepEqual(result.byRun.get('a').reviewFixIds,['fix']);
 assert.deepEqual(result.byRun.get('a').criticalFindingIds,['f']);
});

test('attention sorting puts critical, review and blocked first while preserving chronology within ties',()=>{
 const runs=[{id:'newest'},{id:'blocked-a',outcome:'blocked'},{id:'review'},{id:'critical-a'},{id:'critical-b'},{id:'blocked-b',outcome:'obstacle_observed'},{id:'oldest'}];
 const result=buildRunAttention({runs,findings:[{id:'fa',runId:'critical-a',impact:'critical'},{id:'fb',runId:'critical-b',impact:'critical'}],fixes:[{id:'fix',status:'awaiting_review',runId:'review'}]});
 const original=runs.slice(),sorted=sortRunsByAttention(runs,result);
 assert.deepEqual(sorted.map(run=>run.id),['critical-a','critical-b','review','blocked-a','blocked-b','newest','oldest']);
 assert.deepEqual(runs,original);assert.notEqual(sorted,runs);
 const filtered=[runs[4],runs[3]];
 assert.deepEqual(sortRunsByAttention(filtered,result),filtered);
});

test('category filters include overlapping attention reasons and all keeps unrecognized runs',()=>{
 const result=buildRunAttention({runs:[{id:'all-three',outcome:'blocked'},{id:'quiet'}],findings:[{id:'f',runId:'all-three',impact:'critical'}],fixes:[{id:'fix',status:'awaiting_review',runId:'all-three'}]});
 for(const category of ['all','attention','critical','review','blocked'])assert.equal(runMatchesAttention('all-three',category,result),true);
 for(const category of ['attention','critical','review','blocked'])assert.equal(runMatchesAttention('quiet',category,result),false);
 assert.equal(runMatchesAttention('absent','all',result),true);
 assert.equal(runMatchesAttention('absent','attention',result),false);
});

test('missing collections and unlinked records remain honest without manufacturing run associations',()=>{
 assert.deepEqual(buildRunAttention().counts,{blocked:0,critical:0,review:0,runs:0});
 const result=buildRunAttention({runs:[{id:'known'},{}],findings:[{id:'orphan',runId:'missing',impact:'critical'},{}],fixes:[{id:'unlinked',status:'awaiting_review'},{}]});
 assert.deepEqual(result.counts,{blocked:0,critical:1,review:1,runs:0});
 assert.deepEqual([...result.byRun.keys()],['known']);
 assert.equal(result.byRun.get('known').rank,3);
});
