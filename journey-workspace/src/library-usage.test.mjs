import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLibraryUsage} from './library-usage.ts';
import {collectionFilters} from './collection-filters.ts';
import {buildTableFilterModel,UNKNOWN_FILTER_VALUE} from './table-filters.ts';

const metric=(usage,key)=>[...usage.summary.metrics,...usage.summary.secondary].find(item=>item.key===key);

test('usage findings and summary follow the visible journey scope, not all project findings',()=>{
 const runs=[{id:'visible',projectId:'project',status:'finished',outcome:'goal_reached',impactCounts:{critical:99}}];
 const usage=buildLibraryUsage(runs,{findings:[
  {id:'included',runId:'visible',projectId:'project',impact:'medium',triage:'unreviewed'},
  {id:'filtered-out',runId:'other',projectId:'project',impact:'critical'},
  {id:'wrong-project',runId:'visible',projectId:'another-project',impact:'critical'},
  {id:'unlinked',personaId:'visible',impact:'high'},
 ],fixes:[{id:'ours',runId:'visible',status:'awaiting_review'},{id:'theirs',runId:'other',status:'awaiting_review'}]});
 assert.deepEqual(usage.findings.map(row=>row.id),['included']);
 assert.deepEqual([...usage.byRun.keys()],['visible']);
 assert.equal(metric(usage,'findings').value,'1');
 assert.equal(metric(usage,'findingRuns').value,'1');
 assert.equal(metric(usage,'goals').value,'1');
 assert.equal(metric(usage,'review').value,'1');
 assert.deepEqual(usage.summary.impacts,[{impact:'medium',count:1}]);
});

test('finding IDs deduplicate without dropping distinct observations, and severity ties stay stable',()=>{
 const findings=[
  {id:'low',runId:'a',impact:'low'},
  {id:'high-one',runId:'a',impact:'high'},
  {id:'high-two',runId:'a',impact:'high'},
  {id:'low',runId:'a',impact:'low'},
  {runId:'a',impact:'informational',observation:'First unnamed observation'},
  {runId:'a',impact:'informational',observation:'Second unnamed observation'},
  {id:'unknown',runId:'a',impact:'not-a-severity'},
 ];
 const original=structuredClone(findings);
 const usage=buildLibraryUsage([{id:'a'},{id:'b'}],{findings});
 assert.equal(metric(usage,'findings').value,'6');
 assert.equal(metric(usage,'findingRuns').value,'1');
 assert.deepEqual(usage.byRun.get('a').map(row=>row.id||row.observation),['high-one','high-two','low','First unnamed observation','Second unnamed observation','unknown']);
 assert.deepEqual(usage.byRun.get('b'),[]);
 assert.deepEqual(findings,original);
 assert.deepEqual(usage.summary.impacts,[{impact:'high',count:2},{impact:'low',count:1},{impact:'informational',count:2},{impact:'untriaged',count:1}]);
});

test('problem totals respect triage and resolved issues while keeping every recorded finding visible',()=>{
 const usage=buildLibraryUsage([{id:'a',status:'finished',outcome:'goal_reached'}],{findings:[
  {id:'open',runId:'a',impact:'high',triage:'unreviewed'},
  {id:'dismissed',runId:'a',impact:'critical',triage:'dismissed'},
  {id:'duplicate',runId:'a',impact:'high',triage:'duplicate'},
  {id:'resolved',runId:'a',impact:'medium',triage:'resolved'},
  {id:'resolved-issue',runId:'a',impact:'high',issueId:'done'},
  {id:'information',runId:'a',impact:'informational',triage:'unreviewed'},
 ],issues:[{id:'done',status:'resolved'}],fixes:[]});
 assert.equal(usage.byRun.get('a').length,6);
 assert.equal(metric(usage,'findings').value,'6');
 assert.equal(metric(usage,'problems').value,'1');
 assert.equal(metric(usage,'priority').value,'1');
 assert.equal(metric(usage,'unreviewed').value,'2');
 assert.equal(metric(usage,'goals').value,'1');
 assert.equal(metric(usage,'problemRuns').value,'1');
});

test('unavailable findings stay unknown while an explicitly loaded empty list reports zero',()=>{
 const runs=[{id:'a',status:'finished',outcome:'goal_reached'}];
 for(const data of [{},{findings:null},{findings:{}}]){
  const usage=buildLibraryUsage(runs,data);
  assert.equal(usage.findingsAvailable,false);
  for(const key of ['findings','findingRuns','problems'])assert.equal(metric(usage,key).value,'—');
  assert.equal(metric(usage,'goals').value,'1');
  assert.deepEqual(usage.summary.impacts,[]);
  assert.match(usage.summary.impactDetail,/unavailable/);
 }
 const loaded=buildLibraryUsage(runs,{findings:[]});
 assert.equal(loaded.findingsAvailable,true);
 for(const key of ['findings','findingRuns','problems'])assert.equal(metric(loaded,key).value,'0');
 assert.equal(loaded.summary.impactDetail,undefined);
 const noJourneys=buildLibraryUsage([]);
 for(const key of ['findings','findingRuns','problems'])assert.equal(metric(noJourneys,key).value,'0');
});

test('goal summaries exclude unfinished, failed, and invalidated outcomes',()=>{
 const usage=buildLibraryUsage([
  {id:'finished',status:'finished',outcome:'goal_reached'},
  {id:'running',status:'running',outcome:'goal_reached'},
  {id:'failed',status:'failed',outcome:'goal_reached'},
  {id:'invalidated',status:'finished',integrityStatus:'invalidated',outcome:'goal_reached'},
 ],{findings:[]});
 assert.equal(metric(usage,'goals').value,'1');
 assert.equal(metric(usage,'active').value,'1');
 assert.equal(metric(usage,'executionStops').value,'1');
});

test('impact filters match all recorded findings, including a dismissed-only journey',()=>{
 const runs=[{id:'dismissed-only',impactCounts:{}},{id:'no-findings',impactCounts:{high:9}},{id:'unknown-impact',impactCounts:{}}];
 const data={findings:[
  {id:'dismissed',runId:'dismissed-only',impact:'high',triage:'dismissed'},
  {id:'unrecognized',runId:'unknown-impact',impact:'unknown'},
 ]};
 const usage=buildLibraryUsage(runs,data);
 const config=collectionFilters('runs',{...data,runs:usage.filterRows});
 const filtered=impact=>buildTableFilterModel({rows:usage.filterRows,...config,state:{query:'',selections:{impact:[impact]},sort:config.defaultSort}}).rows.map(run=>run.id);
 assert.deepEqual(filtered('high'),['dismissed-only']);
 assert.deepEqual(filtered('none'),['no-findings']);
 assert.deepEqual(filtered('untriaged'),['unknown-impact']);
 assert.deepEqual(usage.filterRows[0].impactCounts,{critical:0,high:1,medium:0,low:0,informational:0,untriaged:0});
 assert.notEqual(usage.filterRows[0],runs[0]);
 assert.deepEqual(runs[0].impactCounts,{});
 assert.equal(runs[1].impactCounts.high,9);
 assert.equal(metric(usage,'problems').value,'0');
});

test('unavailable finding details preserve existing run counts and unknown impact filters',()=>{
 const runs=[{id:'known',impactCounts:{high:2}},{id:'unknown'}];
 const usage=buildLibraryUsage(runs,{});
 assert.equal(usage.filterRows,runs);
 assert.equal(usage.filterRows[0],runs[0]);
 assert.deepEqual(usage.filterRows[0].impactCounts,{high:2});
 assert.equal(Object.hasOwn(usage.filterRows[1],'impactCounts'),false);
 const impact=collectionFilters('runs',{runs:usage.filterRows}).facets.find(facet=>facet.key==='impact');
 assert.deepEqual(impact.getValues(usage.filterRows[0]),['high']);
 assert.deepEqual(impact.getValues(usage.filterRows[1]),[UNKNOWN_FILTER_VALUE]);
});
