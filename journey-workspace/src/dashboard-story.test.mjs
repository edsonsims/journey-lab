import test from 'node:test';
import assert from 'node:assert/strict';
import {GATHER_DEMO_IMPACT_ID,gatherDashboardStory,isRecordedGatherStage} from './dashboard-story.ts';

const ids=['gather-assistant','gather-coordinator'];
const run=(personaId,id)=>({id,projectId:'gather',personaId,status:'finished',integrityStatus:'verified',video:`/runs/${id}/journey.webm`,personaSnapshot:{id:personaId,projectId:'gather',name:personaId==='gather-assistant'?'Alex · Executive assistant':'Maya · Office coordinator',mission:'Book a suitable room within the approved budget.',context:'Planning between other tasks.',expectations:'A clear total.',constraints:'Stay within the approved allowance.'}});
const pair=(personaId,beforeActions,afterActions)=>({personaId,beforeRunId:`${personaId}-before`,afterRunId:`${personaId}-after`,before:run(personaId,`${personaId}-before`),after:run(personaId,`${personaId}-after`),controls:{status:'matched',issues:[]},metrics:{before:{status:'finished',outcome:'goal_reached',interactionActions:beforeActions},after:{status:'finished',outcome:'goal_reached',interactionActions:afterActions}},outcomeChange:'unchanged',effortChange:afterActions>beforeActions?'more_actions':'fewer_actions'});
const record=()=>({id:GATHER_DEMO_IMPACT_ID,projectId:'gather',fixId:'recorded-fix',roundId:'recorded-round',personas:ids.map(personaId=>({personaId})),report:{status:'completed',pairs:[pair(ids[0],8,6),pair(ids[1],7,12)],repair:{status:'completed',pairs:[pair(ids[0],6,5),pair(ids[1],12,6)]}}});

test('the curated Gather story uses its exact record and recorded persona snapshots',()=>{
 const story=gatherDashboardStory(record());
 assert.deepEqual(story.personas.map(p=>[p.id,p.proposal.before,p.proposal.after,p.repair.before,p.repair.after]),[[ids[0],8,6,6,5],[ids[1],7,12,12,6]]);
 assert.equal(story.personas[0].name,'Alex · Executive assistant');
 assert.equal(story.personas[1].mission,'Book a suitable room within the approved budget.');
 assert.equal(story.personas[0].context,'Planning between other tasks.');
 assert.equal(story.personas[0].expectations,'A clear total.');
 assert.equal(story.personas[0].constraints,'Stay within the approved allowance.');
 assert.equal(story.personas[0].proposal.state.key,'fewer_actions');
 assert.equal(story.personas[0].proposal.state.tone,'neutral');
 assert.equal(story.repairComplete,true);
 assert.equal(story.fixId,'recorded-fix');assert.equal(story.roundId,'recorded-round');
 assert.equal(gatherDashboardStory(null),null);
 assert.equal(gatherDashboardStory({...record(),projectId:'another-project'}),null);
 assert.equal(gatherDashboardStory({...record(),id:'newer-unrelated-record'}),null);
});

test('stale successful outcomes and action counts cannot certify an incomplete run',()=>{
 for(const status of ['queued','running','finalizing','incomplete','failed','cancelled']){
  const value=record(),p=value.report.repair.pairs[0];p.after.status=status;p.outcomeChange='improved';
  const story=gatherDashboardStory(value),stage=story.personas[0].repair;
  assert.equal(stage.before,null,status);assert.equal(stage.after,null,status);
  assert.notEqual(stage.state.key,'improved',status);assert.equal(story.repairComplete,false,status);
 }
 const value=record();value.report.pairs[0].metrics.after.status='incomplete';
 assert.equal(gatherDashboardStory(value).personas[0].proposal.after,null);
});

test('invalidated, experimental and authored example evidence is suppressed even with stale matched controls',()=>{
 for(const changes of [{integrityStatus:'invalidated'},{verification:{status:'invalidated'}},{invalidated:true},{invalidatedAt:'2026-11-02'},{experimental:true},{experimentalStudyId:'study'},{calibrationTrialId:'trial'},{isExample:true},{provenance:'authored_ui_example'}]){
  const value=record();Object.assign(value.report.repair.pairs[1].after,changes);
  const story=gatherDashboardStory(value);
  assert.equal(story.personas[1].repair.after,null,JSON.stringify(changes));
  assert.equal(story.personas[1].repair.state.key,'inconclusive');assert.equal(story.repairComplete,false);
 }
 const value=record();value.report.repair.verification={status:'invalidated'};
 assert.equal(gatherDashboardStory(value).personas[0].repair.after,null);
});

test('missing, pending or mismatched controls cannot expose comparative counts',()=>{
 for(const controls of [undefined,{status:'pending'},{status:'mismatch'},{status:'unknown'}]){
  const value=record();value.report.pairs[0].controls=controls;value.report.pairs[0].outcomeChange='improved';
  const stage=gatherDashboardStory(value).personas[0].proposal;
  assert.equal(stage.before,null);assert.equal(stage.after,null);assert.notEqual(stage.state.key,'improved');
 }
});

test('missing and duplicate persona pairs never fall back to a different journey',()=>{
 const value=record();value.report.repair.pairs=[];
 const missing=gatherDashboardStory(value);
 assert.equal(missing.personas[0].repair.before,null);assert.equal(missing.personas[0].repair.pair,null);assert.equal(missing.repairComplete,false);
 value.report.pairs.push(pair(ids[0],10,1));
 assert.equal(gatherDashboardStory(value).personas[0].proposal.before,null);
 assert.equal(gatherDashboardStory(value).personas[0].proposal.state.key,'inconclusive');
});

test('wrong project, persona or run linkage is rejected and unrelated snapshot names are not used',()=>{
 for(const change of [{projectId:'another-project'},{personaId:ids[1]},{id:'different-run'},{personaSnapshot:{id:ids[1],name:'Wrong person',mission:'Wrong mission'}}]){
  const value=record();Object.assign(value.report.pairs[0].before,change);
  const stage=gatherDashboardStory(value).personas[0].proposal;
  assert.equal(stage.before,null);assert.equal(stage.after,null);
 }
 const value=record();value.report.pairs[0].personaName='Unverified pair label';
 for(const p of [value.report.pairs[0],value.report.repair.pairs[0]])for(const side of ['before','after'])p[side].personaSnapshot={id:'unrelated',name:'Wrong person',context:'Wrong context',expectations:'Wrong expectation',constraints:'Wrong constraint'};
 assert.equal(gatherDashboardStory(value).personas[0].name,ids[0]);
 assert.equal(gatherDashboardStory(value).personas[0].context,'');
 assert.equal(gatherDashboardStory(value).personas[0].expectations,'');
 assert.equal(gatherDashboardStory(value).personas[0].constraints,'');
});

test('unknown counts stay unknown and complete repair requires valid recordings for every expected persona',()=>{
 for(const count of [undefined,null,-1,Infinity,NaN,'6']){
  const value=record();value.report.repair.pairs[1].metrics.after.interactionActions=count;
  const story=gatherDashboardStory(value);assert.equal(story.personas[1].repair.after,null);assert.equal(story.repairComplete,false);
 }
 const value=record();value.report.repair.pairs[1].metrics.after.interactionActions=0;
 assert.equal(gatherDashboardStory(value).personas[1].repair.after,0);
 value.report.repair.pairs[1].after.video='https://example.com/untrusted.webm';
 assert.equal(gatherDashboardStory(value).repairComplete,false);
});

const recordedMaya=()=>{
 const value=record(),p=value.report.repair.pairs[1];
 p.beforeRunId=p.before.id='ea312038-a7e1-4169-a661-32ffb884503b';
 p.afterRunId=p.after.id='de304bc2-6ccd-422a-a5d3-2a4cdacb1e0d';
 return value;
};
test('editorial frames and success claims require the original eligible demo journeys',()=>{
 const value=recordedMaya();
 assert.equal(isRecordedGatherStage(gatherDashboardStory(value).personas[1],'repair'),true);
 for(const change of [{status:'incomplete'},{integrityStatus:'invalidated'},{experimental:true},{video:'https://example.com/recording.webm'},{video:null}]){
  const next=recordedMaya();Object.assign(next.report.repair.pairs[1].after,change);
  assert.equal(isRecordedGatherStage(gatherDashboardStory(next).personas[1],'repair'),false,JSON.stringify(change));
 }
});
test('a completed rerun or changed outcome cannot inherit the historical Gather narrative',()=>{
 const rerun=recordedMaya();
 rerun.report.repair.pairs[1].after.id=rerun.report.repair.pairs[1].afterRunId='a-new-valid-run';
 assert.equal(gatherDashboardStory(rerun).repairComplete,true);
 assert.equal(isRecordedGatherStage(gatherDashboardStory(rerun).personas[1],'repair'),false);
 for(const side of ['before','after']){
  const value=recordedMaya();value.report.repair.pairs[1].metrics[side].outcome='obstacle_observed';
  assert.equal(isRecordedGatherStage(gatherDashboardStory(value).personas[1],'repair'),false);
 }
 assert.equal(isRecordedGatherStage(undefined,'repair'),false);
});
