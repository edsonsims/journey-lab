import test from 'node:test';
import assert from 'node:assert/strict';
import {buildImpactExperience} from './impact-experience.ts';

function run(id,tones=['neutral','negative'],{offset=0,action='Review',scroll=false}={}){
 const events=[{index:0,type:'screenshot',url:'https://example.test/',videoMs:offset}];
 const experience=[{eventIndex:0,videoMs:offset,valence:tones[0],reaction:`${id} landing`}];
 for(let i=1;i<tones.length;i++){
  const index=i*2-1;
  events.push({index,type:'action',url:'https://example.test/review',action:scroll?{type:'scroll',scroll_y:600}:{type:'click_control',label:action},...(!scroll?{click:{target:{label:action,tag:'button'}}}:{})});
  events.push({index:index+1,type:'screenshot',url:'https://example.test/review',videoMs:i*1000+offset});
  experience.push({eventIndex:index+1,videoMs:i*1000+offset,valence:tones[i],reaction:`${id} comment ${i}`,observation:`${id} screen ${i}`});
 }
 return {id,status:'finished',events,experience,originalDurationMs:tones.length*1000+offset,video:`/runs/${id}/video.webm`};
}
const pair=(before,after,extra={})=>({before,after,controls:{status:'matched'},outcomeChange:'unchanged',...extra});

test('compares corresponding actions despite unequal clocks and returns their own quotes and timestamps',()=>{
 const before=run('before'),after=run('after',['neutral','positive'],{offset:9000});
 const input=pair(before,after),snapshot=structuredClone(input),result=buildImpactExperience(input);
 assert.equal(result.key,'helped');assert.equal(result.emotion.compared,2);assert.equal(result.emotion.higher,1);
 assert.equal(result.primary.beforeMs,1000);assert.equal(result.primary.afterMs,10000);
 assert.equal(result.primary.beforeQuote,'before comment 1');assert.equal(result.primary.afterQuote,'after comment 1');
 assert.equal(result.primary.title,'Clicked “Review”');assert.equal(result.primary.reviewed,false);
 assert.deepEqual(input,snapshot);assert.match(result.summary,/1 of 2 matched moments/);
});

test('unmatched actions do not enter a tone verdict and fewer actions alone never count as improvement',()=>{
 const before=run('before',['neutral','very_negative'],{action:'Cancel'}),after=run('after',['neutral','very_positive'],{action:'Save'});
 const result=buildImpactExperience(pair(before,after,{effortChange:'fewer_actions'}));
 assert.equal(result.key,'unchanged');assert.equal(result.emotion.compared,1);assert.equal(result.emotion.same,1);
 assert.equal(result.coverage.unmatchedBefore,1);assert.equal(result.coverage.unmatchedAfter,1);assert.equal(result.primary,null);
});

test('mixed moments preserve both largest directions and prefer the regression as the first highlight',()=>{
 const result=buildImpactExperience(pair(run('before',['neutral','negative','positive']),run('after',['neutral','positive','very_negative'])));
 assert.equal(result.key,'mixed');assert.equal(result.emotion.direction,'mixed');
 assert.equal(result.highlights.length,2);assert.equal(result.highlights[0].direction,'lower');assert.equal(result.highlights[1].direction,'higher');
 assert.match(result.summary,/1 matched moment more positive; 1 matched moment less positive/);
});

test('goal regression takes priority over a more positive recorded tone',()=>{
 const result=buildImpactExperience(pair(run('before'),run('after',['neutral','positive']),{outcomeChange:'regressed'}));
 assert.equal(result.key,'hurt');assert.equal(result.label,'Goal regressed');assert.equal(result.emotion.direction,'higher');
 assert.match(result.summary,/goal outcome regressed/);assert.match(result.summary,/more positive/);
});

test('goal improvement retains a negative emotional tradeoff instead of hiding it',()=>{
 const result=buildImpactExperience(pair(run('before',['neutral','positive']),run('after',['neutral','negative']),{outcomeChange:'improved'}));
 assert.equal(result.key,'mixed');assert.equal(result.label,'Goal improved · mixed experience');assert.equal(result.primary.direction,'lower');
});

test('uncertain scroll matches are excluded until accepted by the reviewer',()=>{
 const input=pair(run('before',['neutral','negative'],{scroll:true}),run('after',['neutral','positive'],{scroll:true}));
 const initial=buildImpactExperience(input);assert.equal(initial.key,'unchanged');assert.equal(initial.coverage.needsReview,1);
 const reviewed=buildImpactExperience(input,[{beforeId:'emotion-1',afterId:'emotion-1',status:'accepted',source:'suggested'}]);
 assert.equal(reviewed.key,'helped');assert.equal(reviewed.primary.reviewed,true);assert.equal(reviewed.emotion.compared,2);
});

test('missing ratings and out-of-bounds moments cannot create a comparison',()=>{
 const before=run('before',[null,'negative']),after=run('after',[null,'happy']);
 let result=buildImpactExperience(pair(before,after));assert.equal(result.key,'inconclusive');assert.equal(result.emotion.compared,0);
 after.experience[1].valence='positive';after.originalDurationMs=500;
 result=buildImpactExperience(pair(before,after));assert.equal(result.emotion.compared,0);assert.equal(result.primary,null);
});

test('mismatched controls, incomplete journeys and pending runs never expose an emotional verdict',()=>{
 const before=run('before'),after=run('after',['neutral','positive']);
 for(const input of [pair(before,after,{controls:{status:'mismatch'}}),pair(before,{...after,status:'failed'}),pair(before,after,{outcomeChange:'inconclusive'})]){
  const result=buildImpactExperience(input);assert.equal(result.key,'inconclusive');assert.equal(result.emotion.direction,'unavailable');assert.deepEqual(result.highlights,[]);
 }
 const pending=buildImpactExperience(pair(before,{...after,status:'running'}));assert.equal(pending.key,'pending');assert.equal(pending.primary,null);
});

test('rejected matches stay out of summaries without modifying source notes',()=>{
 const input=pair(run('before'),run('after',['neutral','positive']));
 const result=buildImpactExperience(input,[{beforeId:'emotion-1',afterId:'emotion-1',status:'rejected',source:'suggested'}]);
 assert.equal(result.key,'unchanged');assert.equal(result.coverage.unmatchedBefore,1);assert.equal(result.highlights.length,0);
 assert.equal(input.before.experience.length,2);assert.equal(input.after.experience.length,2);
});
