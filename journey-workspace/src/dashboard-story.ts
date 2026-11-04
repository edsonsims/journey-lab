import {completedRecordingPairs,impactPairState,impactStagePairs,recordedCount,repairRecordingsComplete} from './change-impact.ts';
import type {ImpactStage} from './change-impact.ts';
import type {Row} from './lib.ts';

export const GATHER_DEMO_IMPACT_ID='3c976cd2-5a9a-4c58-aef7-a40e4948f5e3';
const personaIds=['gather-assistant','gather-coordinator'] as const;
const text=(value:unknown):string=>typeof value==='string'?value.trim():'';
const uncertain=():ReturnType<typeof impactPairState>=>({label:'Evidence unavailable',tone:'warning',key:'inconclusive'});
const invalidEvidence=(value:Row|null|undefined):boolean=>!!value&&(
 value.integrityStatus==='invalidated'||value.verification?.status==='invalidated'||
 value.invalidated===true||!!value.invalidatedAt||!!value.experimental||
 !!value.experimentalStudyId||!!value.calibrationTrialId||value.isExample===true||
 value.provenance==='authored_ui_example'
);

function stageEvidence(record:Row,stage:ImpactStage,personaId:string){
 const matches=impactStagePairs(record,stage).filter(pair=>pair.personaId===personaId);
 const pair:Row|null=matches.length===1?matches[0]:null;
 const initial=impactPairState(pair||{});
 const unavailable=(state=uncertain())=>({before:null,after:null,state,pair});
 if(matches.length>1)return unavailable();
 if(!pair)return unavailable(initial);
 const stageRecord=stage==='repair'?record.report?.repair:record.report;
 if([record,stageRecord,pair,pair.before,pair.after].some(invalidEvidence))return unavailable();
 if(pair.controls?.status!=='matched')return unavailable(initial.key==='pending'?initial:uncertain());
 if(!pair.before||!pair.after)return unavailable(initial);
 if([pair.before,pair.after].some(run=>run.status!=='finished')){
  return unavailable(initial.key==='pending'?initial:uncertain());
 }
 // Check source identity as well as the report's cached comparison state.
 for(const side of ['before','after'] as const){
  const run=pair[side],snapshot=run.personaSnapshot;
  if(run.projectId!=='gather'||run.personaId!==personaId||
    snapshot?.id&&snapshot.id!==personaId||snapshot?.projectId&&snapshot.projectId!=='gather'||
    pair[`${side}RunId`]&&pair[`${side}RunId`]!==run.id||
    pair.metrics?.[side]?.status!=='finished')return unavailable();
 }
 if(['pending','inconclusive'].includes(initial.key))return unavailable(initial);
 return {before:recordedCount(pair.metrics?.before?.interactionActions),after:recordedCount(pair.metrics?.after?.interactionActions),state:initial,pair};
}

export function gatherDashboardStory(record:Row|null|undefined){
 if(!record||record.id!==GATHER_DEMO_IMPACT_ID||record.projectId!=='gather')return null;
 const personas=personaIds.map(id=>{
  const proposal=stageEvidence(record,'proposal',id),repair=stageEvidence(record,'repair',id);
  const snapshots=[proposal.pair?.before,proposal.pair?.after,repair.pair?.before,repair.pair?.after]
   .filter(run=>run?.projectId==='gather'&&run.personaId===id)
   .map(run=>run?.personaSnapshot)
   .filter(snapshot=>snapshot?.id===id&&(!snapshot.projectId||snapshot.projectId==='gather'));
  return {id,name:text(snapshots.find(snapshot=>text(snapshot.name))?.name)||id,
   mission:text(snapshots.find(snapshot=>text(snapshot.mission))?.mission),
   context:text(snapshots.find(snapshot=>text(snapshot.context))?.context),
   expectations:text(snapshots.find(snapshot=>text(snapshot.expectations))?.expectations),
   constraints:text(snapshots.find(snapshot=>text(snapshot.constraints))?.constraints),proposal,repair};
 });
 return {personas,fixId:text(record.fixId)||null,roundId:text(record.roundId)||null,
  repairComplete:record.report?.repair?.status==='completed'&&
   personas.every(persona=>persona.repair.before!==null&&persona.repair.after!==null)&&repairRecordingsComplete(record)};
}

export type GatherDashboardStory=NonNullable<ReturnType<typeof gatherDashboardStory>>;

// Editorial descriptions and bundled frames belong to these exact demo sessions.
// A later comparison may be valid without supporting the same historical story.
const recordedDemoRuns={
 'gather-assistant':{
  proposal:['b696825c-47e9-4920-ae53-74b5f02263e7','be5e68ff-faae-495a-9269-8fb198b1a19d'],
  repair:['c1a7c062-1220-45a4-8e1d-713f2ba9bd07','e7b0aa37-20ec-4a84-b2cc-fa86fd20bd12']
 },
 'gather-coordinator':{
  proposal:['2b4b7bf4-a865-4431-8ffe-56ed252a6abe','49a51ebc-1ed6-4bfc-9fe2-e495e5786cfc'],
  repair:['ea312038-a7e1-4169-a661-32ffb884503b','de304bc2-6ccd-422a-a5d3-2a4cdacb1e0d']
 }
};
export function isRecordedGatherStage(persona:GatherDashboardStory['personas'][number]|undefined,stage:ImpactStage):boolean{
 if(!persona)return false;
 const evidence=persona[stage],expected=recordedDemoRuns[persona.id][stage];
 return evidence.before!==null&&evidence.after!==null&&completedRecordingPairs(evidence.pair?[evidence.pair]:[]).length===1&&
  evidence.pair?.before?.id===expected[0]&&evidence.pair?.after?.id===expected[1]&&
  evidence.pair?.metrics?.before?.outcome==='goal_reached'&&evidence.pair?.metrics?.after?.outcome==='goal_reached';
}
