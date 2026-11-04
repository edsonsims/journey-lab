import test from 'node:test';
import assert from 'node:assert/strict';
import {fixLinkLabel,relatedFixesForRun} from './related-fixes.ts';

const pair=(before,after,outcome='goal_reached')=>({beforeRunId:before,afterRunId:after,after:{id:after,finding:{outcome}}});
const oldComparison={id:'old',status:'completed',pairs:[pair('old-before','old-after')]};
const comparison={id:'new',status:'completed',pairs:[pair('before','after')]};
const round={id:'round',verification:{status:'passed'},comparison,comparisons:[oldComparison,comparison]};
const fix={id:'fix',projectId:'app',title:'Keyboard confirmation',runId:'source',findingId:'finding',sourceRunIds:['source','supporting'],status:'awaiting_review',currentRoundId:'round',rounds:[round],latestRound:round};
const run=id=>({id,projectId:'app'});

test('one card relates source, supporting source and every retained before/after retest by explicit IDs',()=>{
 const original=structuredClone(fix);
 for(const [id,role] of [['source','Source journey'],['supporting','Source journey'],['before','Before fix'],['after','After fix'],['old-before','Before fix'],['old-after','After fix']]){
  const relations=relatedFixesForRun(run(id),[fix,fix]);
  assert.equal(relations.length,1);assert.deepEqual(relations[0].roles,[role]);
  assert.equal(relations[0].href,'/projects/app/fixes/fix');
  assert.equal(relations[0].status,'Fix ready for review');
 }
 assert.deepEqual(fix,original);
});
test('same persona, title, comparison label or foreign app never invents a relationship',()=>{
 assert.deepEqual(relatedFixesForRun({...run('unrelated'),personaId:'keyboard',comparisonId:'new',name:'Keyboard confirmation'},[fix]),[]);
 assert.deepEqual(relatedFixesForRun({...run('source'),projectId:'other'},[fix]),[]);
 assert.deepEqual(relatedFixesForRun({id:'source'},[fix]),[]);
 assert.deepEqual(relatedFixesForRun(run('source'),[]),[]);
});
test('findings can supply missing source relationships and distinguish source links from journey context',()=>{
 const migrated={...fix,runId:null,sourceRunIds:[]},finding={id:'finding',projectId:'app',runId:'source'};
 const [relation]=relatedFixesForRun(run('source'),[migrated],[finding]);
 assert.equal(fixLinkLabel(relation,finding),'Related fix');
 assert.equal(fixLinkLabel(relation,{sourceFindingId:'finding',claimStatus:'hypothesis'}),'Related fix');
 assert.equal(fixLinkLabel(relation,{id:'different-finding'}),'Journey’s fix');
 assert.equal(fixLinkLabel(relation,{markerKind:'experience',eventIndex:10}),'Journey’s fix');
 assert.deepEqual(relatedFixesForRun(run('source'),[migrated],[{...finding,projectId:'other'}]),[]);
 const linked={id:'linked-finding',fixId:'fix',runId:'linked-run',projectId:'app'};
 assert.equal(relatedFixesForRun(run('linked-run'),[migrated],[linked]).length,1);
});
test('all rounds remain related while the summary describes only the latest candidate',()=>{
 const latest={id:'next',verification:{status:'failed'},comparison:{status:'completed',pairs:[pair('b2','a2'),pair('b3','a3','obstacle_observed')]}};
 const revised={...fix,rounds:[round,latest],currentRoundId:'next',latestRound:latest};
 const [relation]=relatedFixesForRun(run('old-after'),[revised]);
 assert.match(relation.summary,/Latest candidate: Checks failed/);
 assert.match(relation.summary,/1\/2 AI Persona retests/);
 assert.equal(relation.status,'Fix ready for review');
 assert.equal(relatedFixesForRun(run('a2'),[revised])[0].roles[0],'After fix');
});
test('missing or incomplete retests never claim success, approval or delivery',()=>{
 const cases=[{status:'retesting',expected:'Fix in progress',comparison:{...comparison,status:'running_after'}},{status:'approved',expected:'Fix approved',comparison:undefined},{status:'failed',expected:'Fix needs attention',comparison:{...comparison,status:'completed',pairs:[]}}];
 for(const item of cases){
  const latest={id:'new-round',verification:{status:'not_configured'},comparison:item.comparison};
  const [relation]=relatedFixesForRun(run('source'),[{...fix,status:item.status,currentRoundId:latest.id,rounds:[latest],latestRound:latest}]);
  assert.equal(relation.status,item.expected);assert.doesNotMatch(relation.summary,/Goal reached|deployed|resolved|live/i);
 }
});
test('multiple fixes retain distinct destinations and legacy embedded pair IDs are supported',()=>{
 const other={...fix,id:'fix-2',rounds:[{id:'legacy',comparison:{pairs:[{before:{id:'legacy-before'},after:{id:'legacy-after'}}]}}],latestRound:null};
 assert.equal(relatedFixesForRun(run('source'),[fix,other]).length,2);
 assert.equal(relatedFixesForRun(run('legacy-after'),[other])[0].roles[0],'After fix');
});
