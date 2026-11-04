import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEmotionArc} from './emotion-arc.ts';
import {resolveReviewMoment} from './review-moment.ts';

const run={experience:[
 {eventIndex:2,videoMs:1000,valence:'positive',reaction:'The room options are clear.',observation:'Two rooms are listed.'},
 {eventIndex:4,videoMs:2000,valence:'negative',reaction:'The total is over my budget.',observation:'The total is $280.'},
 {eventIndex:5,videoMs:2000,valence:'neutral',reaction:'I will check another room.',observation:'The room list is available.'}
]};
const arc=buildEmotionArc(run);
const finding={id:'price',markerKind:'finding',track:'business',title:'Price is revealed late',personaComment:'I only learned the full price at review.',observation:'The fee first appears at review.',interpretation:'Late pricing makes comparison harder.',originalMs:1500,impact:'medium'};

test('every track can show the selected finding instead of the nearby arc reaction',()=>{
 for(const track of ['broken','experience','product','business']){
  const detail=resolveReviewMoment(run,arc,{...finding,track},1000);
  assert.equal(detail.title,finding.title);
  assert.equal(detail.reaction,finding.personaComment);
  assert.equal(detail.ms,1500);
  assert.equal(detail.track.toLowerCase(),track);
  assert.equal(detail.pointId,null);
  assert.ok(detail.sections.some(section=>section.text===finding.observation));
  assert.ok(detail.sections.some(section=>section.text===finding.interpretation));
  assert.equal(detail.tone.key,'unrated','nearby emotion and finding impact must not supply a tone');
 }
});

test('a clicked reaction retains exact identity when another reaction shares its timestamp',()=>{
 const selected={...run.experience[1],markerKind:'experience',emotionId:'emotion-1',originalMs:2000};
 const detail=resolveReviewMoment(run,arc,selected,2000);
 assert.equal(detail.reaction,run.experience[1].reaction);
 assert.equal(detail.pointId,'emotion-1');
 assert.equal(detail.tone.key,'negative');
});

test('arc preview temporarily overrides a finding without replacing its selection',()=>{
 const before=structuredClone(finding),preview=resolveReviewMoment(run,arc,finding,1500,arc.points[1]);
 assert.equal(preview.reaction,run.experience[1].reaction);
 assert.equal(preview.pointId,'emotion-1');
 assert.equal(preview.entry.emotionId,'emotion-1','replaying the card must preserve the preview’s exact source identity');
 assert.equal(resolveReviewMoment(run,arc,finding,1500).title,finding.title);
 assert.deepEqual(finding,before);
});

test('clearing the selection resumes the current recorded reaction; time-only seeks do not create empty cards',()=>{
 assert.equal(resolveReviewMoment(run,arc,null,2000).reaction,run.experience[2].reaction);
 assert.equal(resolveReviewMoment(run,arc,{originalMs:2000},2000).reaction,run.experience[2].reaction);
});

test('findings without any arc or reaction retain their own evidence and remain unrated',()=>{
 const source={experience:[]},entry={markerKind:'finding',type:'defect',title:'Button fails',observation:'No request was sent.',interpretation:'The flow could not continue.',impact:'critical'};
 const detail=resolveReviewMoment(source,buildEmotionArc(source),entry,0);
 assert.equal(detail.title,'Button fails');assert.equal(detail.track,'Broken');
 assert.equal(detail.reaction,'');assert.equal(detail.tone.key,'unrated');assert.equal(detail.ms,null);
 assert.equal(detail.sections[0].text,'No request was sent.');
 assert.equal(resolveReviewMoment(source,buildEmotionArc(source),null,0),null);
});

test('only the finding’s exact evidence event can supply a linked persona reaction',()=>{
 const selected={markerKind:'finding',title:'Recorded finding',eventIndex:4,originalMs:1500};
 const detail=resolveReviewMoment(run,arc,selected,1000);
 assert.equal(detail.reaction,run.experience[1].reaction);
 assert.equal(detail.tone.key,'negative');
 assert.equal(resolveReviewMoment(run,arc,{...selected,eventIndex:99},1000).reaction,'');
});

test('the compact card does not repeat identical reaction, observation, or interpretation text',()=>{
 const same='The total is over my budget.';
 const detail=resolveReviewMoment(run,arc,{...finding,personaComment:same,observation:same,interpretation:same},1000);
 assert.equal(detail.reaction,same);
 assert.ok(detail.sections.every(section=>section.text!==same&&section.text!==finding.title));
});
