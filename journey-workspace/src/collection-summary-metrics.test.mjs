import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionSummary,measuredTotal,elapsedLabel,fixRoundCount,fixOpenComments} from './collection-summary-metrics.ts';
const metric=(summary,key)=>[...summary.metrics,...summary.secondary].find(item=>item.key===key);

test('run summaries add recorded durations and tokens without turning unknown or invalid values into zero',()=>{
 const result=collectionSummary('runs',[
  {durationMs:61000,totalTokens:0,impactCounts:{high:2}},
  {startedAt:'2026-10-31T10:00:00Z',completedAt:'2026-10-31T10:02:00Z',usage:[{total_tokens:10},{total_tokens:20}],impactCounts:{}},
  {durationMs:-1,tokens:{total:NaN}},
  {startedAt:'invalid',completedAt:'invalid',usage:[{input_tokens:100}]},
 ]);
 assert.equal(metric(result,'time').value,'3m 1s');assert.equal(metric(result,'time').detail,'2/4 known');
 assert.equal(metric(result,'tokens').value,'30');assert.equal(metric(result,'tokens').detail,'2/4 known');
 assert.equal(metric(result,'findings').value,'2');assert.equal(metric(result,'findings').detail,'2/4 known');
 assert.equal(result.impactDetail,'Impact counts: 2/4 journeys known');
});

test('all-unknown totals show an em dash while an explicitly empty collection has zero',()=>{
 const unknown=collectionSummary('runs',[{}]);
 assert.equal(metric(unknown,'time').value,'—');assert.equal(metric(unknown,'tokens').value,'—');assert.equal(metric(unknown,'findings').value,'—');
 const empty=collectionSummary('runs',[]);assert.equal(metric(empty,'time').value,'0s');assert.equal(metric(empty,'tokens').value,'0');
 assert.deepEqual(measuredTotal([{n:0},{n:Infinity},{n:null}],r=>r.n),{value:0,known:1,total:3});
 assert.equal(elapsedLabel(3661000),'1h 1m');
});

test('visible run impact counts do not manufacture severity from mood or unknown impact keys',()=>{
 const result=collectionSummary('runs',[{impactCounts:{critical:1,high:2},valence:'positive'},{impactCounts:{unknown:4},valence:'very_negative'},{valence:'very_negative'}]);
 assert.deepEqual(result.impacts,[{impact:'critical',count:1},{impact:'high',count:2}]);
 assert.equal(metric(result,'findings').detail,'1/3 known');
});

test('findings summarize only supplied rows and count distinct linked runs separately from observations',()=>{
 const all=[{runId:'a',impact:'high',type:'broken'},{runId:'a',impact:'high',type:'experience',valence:'very_negative'},{runId:'b',impact:'low',type:'product'},{impact:null,triage:'dismissed'}];
 const result=collectionSummary('findings',all.filter(row=>row.impact==='high'));
 assert.equal(metric(result,'runs').value,'1');assert.equal(metric(result,'defects').value,'1');assert.equal(metric(result,'experience').value,'1');
 assert.deepEqual(result.impacts,[{impact:'high',count:2}]);
 const full=collectionSummary('findings',all);assert.equal(metric(full,'runs').detail,'1 unlinked');assert.equal(metric(full,'dismissed').value,'1');assert(full.impacts.some(item=>item.impact==='untriaged'&&item.count===1));
});

test('fix totals do not invent a first round or zero comments when those records are absent',()=>{
 const rows=[{status:'awaiting_review',roundCount:2,openComments:3},{status:'approved',rounds:[],comments:[]},{status:'failed'},{status:'retesting',rounds:[{id:'r'}],comments:[{resolved:false},{resolved:true}]}];
 const result=collectionSummary('fixes',rows);
 assert.equal(metric(result,'rounds').value,'3');assert.equal(metric(result,'rounds').detail,'3/4 known');
 assert.equal(metric(result,'comments').value,'4');assert.equal(metric(result,'comments').detail,'3/4 known');
 assert.equal(metric(result,'review').value,'1');assert.equal(metric(result,'active').value,'1');assert.equal(metric(result,'approved').value,'1');
 assert.equal(fixRoundCount({}),null);assert.equal(fixOpenComments({}),null);assert.equal(fixRoundCount({rounds:[]}),0);
});

test('issues count occurrences, not repeated sightings as distinct runs, and retain merged history separately',()=>{
 const result=collectionSummary('issues',[{status:'open',occurrences:3,seen:1,lastSeen:'2026-10-30T12:00:00Z'},{status:'resolved',findings:[{},{}],seen:1,lastSeen:'2026-10-31T12:00:00Z'},{status:'dismissed',mergedInto:'survivor',occurrences:0},{status:'investigating',seen:2}]);
 assert.equal(metric(result,'open').value,'2');assert.equal(metric(result,'resolved').value,'1');assert.equal(metric(result,'merged').value,'1');
 assert.equal(metric(result,'occurrences').value,'5');assert.equal(metric(result,'occurrences').detail,'3/4 known');
 assert.equal(metric(result,'lastSeen').value,'Oct 31');assert(!metric(result,'runs'));
});

test('environment reachability excludes stale, archived, unversioned and failed checks',()=>{
 const result=collectionSummary('environments',[
  {version:2,repositoryPath:'/source',lastCheck:{environmentVersion:2,status:'reachable',stale:false}},
  {version:3,lastCheck:{environmentVersion:2,status:'reachable'}},
  {version:2,lastCheck:{environmentVersion:2,status:'reachable',stale:true}},
  {version:2,archived:true,lastCheck:{environmentVersion:2,status:'reachable'}},
  {version:2,lastCheck:{environmentVersion:2,status:'unreachable'}},
  {version:2,lastCheck:{status:'reachable'}},
 ]);
 assert.equal(metric(result,'active').value,'5');assert.equal(metric(result,'reachable').value,'1');assert.equal(metric(result,'needsCheck').value,'3');assert.equal(metric(result,'unreachable').value,'1');assert.equal(metric(result,'archived').value,'1');
});

test('library summaries describe current visible configuration without treating version numbers as history counts',()=>{
 const result=collectionSummary('personas',[{version:8,continuity:'first-time'},{version:1,continuity:'returning',archived:true},{}]);
 assert.equal(metric(result,'revised').value,'1');assert.equal(metric(result,'firstVisit').value,'1');assert.equal(metric(result,'active').value,'2');assert.equal(metric(result,'archived').value,'1');
 const charter=collectionSummary('charters',[{mission:'A clear goal'},{mission:'  '}]);assert.equal(metric(charter,'mission').value,'1');
});

test('journey outcomes distinguish product blocks, failed executions, and unassessed journeys',()=>{
 const rows=[
  {id:'goal',status:'finished',outcome:'goal_reached'},
  {id:'product',status:'finished',outcome:'obstacle_observed'},
  {id:'runner',status:'blocked'},
  {id:'failed',status:'failed',outcome:'obstacle_observed'},
  {id:'pending',status:'running',outcome:'goal_reached'},
  {id:'unknown',status:'finished'},
  {id:'invalidated',status:'finished',integrityStatus:'invalidated',outcome:'goal_reached'},
 ];
 const result=collectionSummary('runs',rows,{findings:[],fixes:[]});
 assert.equal(metric(result,'goals').value,'1');assert.equal(metric(result,'goals').detail,'of 2 assessed');
 assert.equal(metric(result,'blocked').value,'1');assert.equal(metric(result,'problemRuns').value,'1');
 assert.equal(metric(result,'executionStops').value,'1');assert.equal(metric(result,'active').value,'1');assert.equal(metric(result,'unassessed').value,'3');
 assert.equal(result.metrics.length,4);assert(result.secondary.some(item=>item.key==='tokens'));
});

test('successful journeys can contain problems; related findings and fixes respect visible rows',()=>{
 const rows=[{id:'visible',status:'finished',outcome:'goal_reached'}];
 const findings=[
  {id:'medium',runId:'visible',impact:'medium',triage:'unreviewed'},
  {id:'low',runId:'visible',impact:'low',triage:'accepted'},
  {id:'duplicate',runId:'visible',impact:'critical',triage:'duplicate'},
  {id:'dismissed',runId:'visible',impact:'high',triage:'dismissed'},
  {id:'closed',runId:'visible',impact:'critical',issueId:'resolved'},
  {id:'info',runId:'visible',impact:'informational'},
  {id:'hidden',runId:'other',impact:'critical'},
 ];
 const fixes=[{id:'linked',status:'awaiting_review',findingId:'medium',sourceRunIds:['visible','other']},{id:'linked',status:'awaiting_review',runId:'visible'},{id:'hidden',status:'awaiting_review',runId:'other'},{id:'done',status:'approved',runId:'visible'}];
 const result=collectionSummary('runs',rows,{findings,fixes,issues:[{id:'resolved',status:'resolved'}]});
 assert.equal(metric(result,'goals').value,'1');assert.equal(metric(result,'blocked').value,'0');
 assert.equal(metric(result,'problemRuns').value,'1');assert.equal(metric(result,'problemRuns').detail,'2 problem findings');
 assert.equal(metric(result,'review').value,'1');assert(!metric(result,'priority'));
 const noContext=collectionSummary('runs',rows);assert.equal(metric(noContext,'problemRuns').value,'—');assert.equal(metric(noContext,'review').value,'—');
});

test('finding priorities expose medium and low problems without turning informational notes into defects',()=>{
 const rows=Array.from({length:14},(_,i)=>({id:String(i),runId:String(i%7),impact:i<9?'informational':i<12?'medium':'low',type:'experience',triage:'unreviewed'}));
 const result=collectionSummary('findings',rows);
 assert.equal(metric(result,'problems').value,'5');assert.equal(metric(result,'priority').value,'0');assert.equal(metric(result,'unreviewed').value,'14');assert.equal(metric(result,'runs').value,'7');
 assert.deepEqual(result.metrics.map(item=>item.key),['problems','priority','unreviewed','runs']);
 assert(!metric(result,'defects'));
});

test('issue journeys are a union of exact finding links, with missing links explicit',()=>{
 const issues=[{id:'i1',status:'reopened',findingIds:['a','b']},{id:'i2',status:'open',findings:[{runId:'same'}]},{id:'i3',status:'open',findingIds:['missing']}];
 const context={findings:[{id:'a',runId:'same'},{id:'b',runId:'second'},{id:'outside',runId:'hidden'}]};
 const result=collectionSummary('issues',issues,context);
 assert.equal(metric(result,'affectedRuns').value,'2');assert.equal(metric(result,'affectedRuns').detail,'2/3 issues linked');
 assert.equal(metric(result,'open').value,'3');assert.equal(metric(result,'reopened').value,'1');
 const unknown=collectionSummary('issues',[{seen:20}]);assert.equal(metric(unknown,'affectedRuns').value,'—');
});

test('library usage matches the current version instead of any historical journey',()=>{
 const rows=[{id:'current',version:2,versionId:'v2',mission:'Goal',continuity:'first-time'},{id:'old',version:3,versionId:'v3',mission:'Goal'},{id:'unversioned',version:1,mission:'Goal'},{id:'archived',version:1,archived:true}];
 const context={runs:[{id:'a',personaId:'current',personaVersionId:'v2'},{id:'b',personaId:'old',personaVersionId:'v1',personaVersion:3},{id:'c',personaId:'unversioned'},{id:'d',personaId:'archived',personaVersion:1},{id:'e',personaId:'hidden',personaVersion:1}]};
 const result=collectionSummary('personas',rows,context);
 assert.equal(metric(result,'used').value,'1');assert.equal(metric(result,'unused').value,'2');assert.equal(metric(result,'linkedRuns').value,'4');
 assert.equal(metric(result,'missingMission').value,'0');
 assert.equal(metric(collectionSummary('personas',rows),'used').value,'—');
 assert.equal(metric(collectionSummary('personas',[]),'used').value,'0');
 const charters=collectionSummary('charters',[{id:'charter',version:2,mission:'Goal',defaultEnvironmentId:'test'}],{runs:[{id:'run',charterId:'charter',charterVersion:2}]});
 assert.equal(metric(charters,'used').value,'1');assert.equal(metric(charters,'noTarget').value,'0');
});
