import test from 'node:test';
import assert from 'node:assert/strict';
import {experienceSummary,coverageSummary,changeImpactSummary,impactStageSummary} from './insight-summary-metrics.ts';

const values=summary=>Object.fromEntries([...summary.metrics,...summary.secondary].map(item=>[item.key,item.value]));
test('Experience summarizes the recorded takeaways independently of emotional annotations',()=>{
 const rows=[{takeaway:{kind:'friction'},valence:'positive',personaId:'alex',pageId:'booking',runId:'r1'},{takeaway:{kind:'unmet_need'},valence:'neutral',personaId:'alex',pageId:'booking',runId:'r1'},{takeaway:{kind:'benefit'},valence:'negative',personaId:'maya',pageId:'review',runId:'r2'},{takeaway:{kind:'uncertainty'},personaId:null,pageId:'review',runId:'r2'}];
 assert.deepEqual(values(experienceSummary(rows)),{friction:'2',benefits:'1',questions:'1',affected:'1',personas:'2',journeys:'2',pages:'2'});
 assert.equal(values(experienceSummary(rows,true)).affected,'1');
 assert.equal(values(experienceSummary(rows.slice(2))).friction,'0');
 assert.equal(rows[0].valence,'positive');
});

test('Coverage does not mistake observed screens for the product inventory',()=>{
 const rows=[{inInventory:false,states:{visited:true,evaluated:true,verified:false},counts:{runIds:['r1']}},{inInventory:false,states:{visited:true,evaluated:false,verified:false},counts:{runIds:['r1','r2']}}];
 assert.deepEqual(values(coverageSummary(rows,null)),{visited:'2',evaluated:'1',verified:'0',unexplored:'—',journeys:'2',unmapped:'2',inventory:'Not defined'});
});

test('Coverage uses only visible known screens and preserves missing state',()=>{
 const rows=[{inInventory:true,states:{visited:true,verified:true},counts:{runIds:['r1']}},{inInventory:true,states:{visited:false}},{inInventory:true},{inInventory:false,states:{visited:false}}];
 const summary=coverageSummary(rows,{screens:12,completeness:'partial'});
 assert.equal(values(summary).unexplored,'1');
 assert.equal(values(summary).inventory,'3 known screens in view');
 assert.equal(summary.metrics.find(metric=>metric.key==='unexplored').detail,'1 state unknown');
 assert.equal(values(coverageSummary(rows.slice(0,1),{screens:12,completeness:'partial'})).inventory,'1 known screens in view');
});

const pair=(personaId,extra={})=>({personaId,controls:{status:'matched'},before:{status:'finished',video:'/runs/before/journey.webm'},after:{status:'finished',video:'/runs/after/journey.webm'},outcomeChange:'unchanged',...extra});
test('Change impact only counts comparable outcomes; missing comparisons stay pending',()=>{
 const record={personas:[{personaId:'alex'},{personaId:'maya'},{personaId:'missing'}],report:{pairs:[pair('alex',{outcomeChange:'regressed'}),pair('maya',{outcomeChange:'improved',controls:{status:'mismatch'}})],repair:{pairs:[pair('alex'),pair('maya')]}}};
 const result=values(changeImpactSummary([record]));
 assert.equal(result.regressions,'1');assert.equal(result.improvements,'0');assert.equal(result.pending,'2');assert.equal(result['repair-retests'],'0');
 assert.equal(values(changeImpactSummary([])).regressions,'0');
});
test('Recorded repair retests do not become outcome improvements or approvals',()=>{
 const record={personas:[{personaId:'alex'}],report:{pairs:[pair('alex',{effortChange:'more_actions'})],repair:{pairs:[pair('alex',{outcomeChange:'regressed'})]}}};
 const result=values(changeImpactSummary([record]));
 assert.equal(result['repair-retests'],'1');assert.equal(result.improvements,'0');assert.equal(result['more-actions'],'1');
 assert.deepEqual(values(impactStageSummary(record.report.repair.pairs)),{regressions:'1',improvements:'0','more-actions':'0',pending:'0','fewer-actions':'0',comparable:'1'});
});
