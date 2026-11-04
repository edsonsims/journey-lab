import test from 'node:test';
import assert from 'node:assert/strict';
import {librarySummary} from './library-summary-metrics.ts';

const value=(summary,key)=>[...summary.metrics,...summary.secondary].find(item=>item.key===key);

test('memory distinguishes review, conflicts, sourced entries and returning-persona knowledge',()=>{
 const summary=librarySummary('memory',[
  {status:'published',audience:'persona',confidence:.6,sources:[{runId:'r1'}],conflicts:[{status:'unresolved'}]},
  {status:'verified',audience:'evaluator',confidence:.9,sources:[{runId:'r2'},{runId:'r2'}],freshness:{status:'stale'}},
  {status:'disputed',audience:'operational',confidence:null,sources:[]},
 ]);
 assert.equal(value(summary,'review').value,'2');
 assert.equal(value(summary,'sourced').value,'2');
 assert.equal(value(summary,'conflicts').value,'1');
 assert.equal(value(summary,'stale').value,'1');
 assert.equal(value(summary,'returning').value,'1');
 assert.equal(value(summary,'low-confidence').value,'1');
 assert.equal(value(summary,'low-confidence').detail,'2/3 recorded');
 assert.match(value(summary,'returning').title,/First-time personas receive none/);
});

test('profile summaries join claims only to the filtered competitor IDs',()=>{
 const summary=librarySummary('competitor-profiles',[{id:'a',sourceUrls:[]}],{claims:[
  {subject:'competitor',competitorId:'a',reviewState:'verified'},
  {subject:'competitor',competitorId:'b',reviewState:'unreviewed',freshness:{status:'stale'}},
  {subject:'own',competitorId:'a',reviewState:'disputed'},
 ]});
 assert.equal(value(summary,'claims').value,'1');
 assert.equal(value(summary,'review').value,'0');
 assert.equal(value(summary,'stale').value,'0');
 assert.equal(value(summary,'researched').value,'1');
});

test('claims count affected claims once even when evidence or contradictions repeat',()=>{
 const summary=librarySummary('competitor-claims',[
  {reviewState:'disputed',confidence:.5,contradictions:[{status:'unresolved'},{status:'unresolved'}],sources:[{sourceId:'s'},{sourceId:'s'}]},
  {reviewState:'verified',confidence:.9,sources:[]},
 ]);
 assert.equal(value(summary,'review').value,'1');
 assert.equal(value(summary,'contradictions').value,'1');
 assert.equal(value(summary,'sourced').value,'1');
 assert.equal(value(summary,'citations').value,'2');
});

test('source summaries count unique supported claims, not matching citations',()=>{
 const summary=librarySummary('competitor-sources',[{id:'s1'},{id:'s2'},{id:'s3'}],{claims:[{sources:[{sourceId:'s1'},{sourceId:'s2'}]},{sources:[{sourceId:'unseen'}]}]});
 assert.equal(value(summary,'used').value,'2');
 assert.equal(value(summary,'unused').value,'1');
 assert.equal(value(summary,'claims').value,'1');
});

test('research usage stays unknown and reports partial measurements accurately',()=>{
 const unknown=librarySummary('competitor-jobs',[{status:'failed'}]);
 assert.equal(value(unknown,'tokens').value,'—');
 assert.equal(value(unknown,'claims').value,'—');
 const partial=librarySummary('competitor-jobs',[{receipt:{usage:{total_tokens:0}},claimIds:[],sourceIds:[]},{}]);
 assert.equal(value(partial,'tokens').value,'0');
 assert.equal(value(partial,'tokens').detail,'1/2 recorded');
 assert.equal(value(partial,'claims').value,'0');
});

test('calibration uses only the latest actual comparison per study and preserves unmeasured studies',()=>{
 const summary=librarySummary('calibration-studies',[
  {status:'awaiting_review',comparisons:[{createdAt:'2026-10-01',metrics:[{status:'disagreement'}]},{createdAt:'2026-10-03',metrics:[{status:'agreement'}]}]},
  {status:'completed',adoption:{id:'a'},baselineComparison:{development:{createdAt:'2026-10-02',metrics:[{status:'disagreement'}]}}},
  {status:'draft',comparisons:[{createdAt:'2099-01-01',note:'Not a comparison'}]},
 ]);
 assert.equal(value(summary,'review').value,'1');
 assert.equal(value(summary,'adopted').value,'1');
 assert.equal(value(summary,'disagreement').value,'1');
 assert.equal(value(summary,'disagreement').detail,'2/3 compared');
 assert.equal(value(librarySummary('calibration-studies',[{status:'draft'}]),'disagreement').value,'—');
});

test('dataset measurements distinguish fixtures and unknown data; joins are scoped',()=>{
 const summary=librarySummary('calibration-datasets',[{id:'a',source:{kind:'real_import'},sessionCount:0,eventCount:0},{id:'b',source:{kind:'fixture'}}],{studies:[{datasetSnapshot:{id:'a'}},{datasetSnapshot:{id:'outside'}}]});
 assert.equal(value(summary,'sessions').value,'0');
 assert.equal(value(summary,'sessions').detail,'1/2 recorded');
 assert.equal(value(summary,'studies').value,'1');
 assert.equal(value(summary,'real').value,'1');
 assert.equal(value(summary,'fixtures').value,'1');
});

test('a synthetic object without a signal does not count as a mapped behavior',()=>{
 const summary=librarySummary('calibration-mappings',[{id:'a',metrics:[{realEvent:'started',synthetic:{type:'screen',value:'/start'}},{realEvent:'done',synthetic:{}},{synthetic:{type:'screen',value:'/done'}}]}],{studies:[{mappingSnapshot:{id:'a'}}]});
 assert.equal(value(summary,'mapped').value,'1');
 assert.equal(value(summary,'incomplete').value,'2');
 assert.equal(value(summary,'studies').value,'1');
 assert.equal(value(librarySummary('calibration-mappings',[{id:'unknown'}]),'mapped').value,'—');
});

test('comparison summaries never turn insufficient or unmapped evidence into agreement',()=>{
 const summary=librarySummary('calibration-comparison',[{status:'agreement'},{status:'disagreement'},{status:'insufficient_data'},{status:'unmapped'},{status:'stale'}],{referenceSessions:12,syntheticSessions:2});
 assert.equal(value(summary,'agreement').value,'1');
 assert.equal(value(summary,'disagreement').value,'1');
 assert.equal(value(summary,'unresolved').value,'3');
 assert.equal(value(summary,'reference').value,'12');
});

test('every library summary keeps at most four primary metrics',()=>{
 for(const kind of ['memory','competitor-profiles','competitor-claims','competitor-sources','competitor-jobs','calibration-studies','calibration-datasets','calibration-mappings','calibration-comparison']){
  const summary=librarySummary(kind,[]);
  assert.ok(summary.metrics.length<=4,kind);
  assert.ok(summary.metrics.length>=3,kind);
 }
});
