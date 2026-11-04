import test from 'node:test';
import assert from 'node:assert/strict';
import {impactPairState,impactStagePairs,impactSummary,impactOutcome,recordedCount,preferredImpactPair,repairRecordingsComplete,completedRecordingPairs} from './change-impact.ts';
const pair=(extra={})=>({before:{id:'a',status:'finished'},after:{id:'b',status:'finished'},controls:{status:'matched'},outcomeChange:'unchanged',effortChange:'same',...extra});

test('a faster journey cannot mask a goal regression or incompatible controls',()=>{
 assert.equal(impactPairState(pair({outcomeChange:'regressed',effortChange:'fewer_actions'})).key,'regressed');
 assert.equal(impactPairState(pair({outcomeChange:'improved',controls:{status:'mismatch'}})).key,'inconclusive');
 assert.equal(impactPairState(pair({outcomeChange:'improved',after:{status:'running'}})).key,'pending');
});
test('fewer actions remain an effort observation, not an overall improvement claim',()=>{
 const state=impactPairState(pair({effortChange:'fewer_actions'}));
 assert.equal(state.label,'Fewer actions');assert.equal(state.tone,'neutral');
 const summary=impactSummary([pair({effortChange:'fewer_actions'}),pair({outcomeChange:'regressed'}),pair({outcomeChange:'inconclusive'})]);
 assert.deepEqual(summary,{personas:3,regressions:1,improvements:0,moreActions:0,fewerActions:1,inconclusive:1,pending:0});
 const failedFaster=impactSummary([pair({outcomeChange:'regressed',effortChange:'fewer_actions'})]);
 assert.equal(failedFaster.regressions,1);assert.equal(failedFaster.fewerActions,1);
});
test('repair playback never falls back to the discovery pair when no retest exists',()=>{
 const record={report:{pairs:[pair()],repair:{pairs:[]}}};
 assert.equal(impactStagePairs(record,'proposal').length,1);assert.equal(impactStagePairs(record,'repair').length,0);
});
test('initial review highlights a failed goal before a quicker successful path',()=>{
 const quicker=pair({personaId:'fast',effortChange:'fewer_actions'}),regressed=pair({personaId:'blocked',outcomeChange:'regressed'});
 assert.equal(preferredImpactPair([quicker,regressed]).personaId,'blocked');
 assert.equal(preferredImpactPair([]),undefined);
});
test('unknown metrics and incomplete model reports cannot appear as zero or success',()=>{
 assert.equal(recordedCount(null),null);assert.equal(recordedCount(undefined),null);assert.equal(recordedCount(-1),null);assert.equal(recordedCount(0),0);
 assert.equal(impactOutcome(pair({after:{status:'incomplete'},metrics:{after:{outcome:'goal_reached'}}}),'after'),'Incomplete');
 assert.equal(impactOutcome(pair({metrics:{after:{}}}),'after'),'Not evaluated');
 assert.equal(impactOutcome(pair({metrics:{after:{outcome:'goal_reached'}}}),'after'),'Goal reached');
});
test('placeholder pairs and active recordings cannot claim completed retest media',()=>{
 const complete={personaId:'one',before:{status:'finished',video:'/runs/a/journey.webm'},after:{status:'finished',video:'/runs/b/journey.webm'}};
 const record={personas:[{personaId:'one'},{personaId:'two'}],report:{repair:{pairs:[complete,{personaId:'two',before:null,after:null}]}}};
 assert.equal(repairRecordingsComplete(record),false);assert.equal(completedRecordingPairs(record.report.repair.pairs).length,1);
 record.report.repair.pairs[1]={...complete,personaId:'two',after:{status:'running',video:'/runs/c/journey.webm'}};
 assert.equal(repairRecordingsComplete(record),false);
 record.report.repair.pairs[1]={...complete,personaId:'two',after:{status:'finished',video:null}};
 assert.equal(repairRecordingsComplete(record),false);
 record.report.repair.pairs[1]={...complete,personaId:'two'};assert.equal(repairRecordingsComplete(record),true);
 assert.equal(repairRecordingsComplete({personas:[],report:{repair:{pairs:[]}}}),false);
});
