import test from 'node:test';
import assert from 'node:assert/strict';
import {journeyMomentKey,journeyMomentTime,resolveJourneyMoment,setJourneyMoment} from './journey-moment.ts';
import {insightMomentHref} from './insights-data.ts';

const run={id:'run',experience:[
 {eventIndex:3,videoMs:0,reaction:'The options are clear.',observation:'Two rooms are visible.',valence:'positive'},
 {eventIndex:7,actionEventIndex:8,videoMs:22597,reaction:'The total exceeds my budget.',observation:'The review shows $280.',valence:'negative'},
 {eventIndex:9,videoMs:22597,reaction:'I will check another room.',observation:'The back button remains available.',valence:'neutral'}
],events:[{index:3,type:'screenshot',videoMs:0},{index:11,type:'action',videoMs:30000,label:'Return to rooms',action:{description:'Clicked the room list link.'}}]};
const params=query=>new URLSearchParams(query);

test('experience deep links retain exact signal identity when reactions share a timestamp',()=>{
 const href=insightMomentHref('project',{runId:'run',signalIndex:1,eventIndex:7,originalMs:22597});
 const query=new URL(href,'http://local').searchParams,selected=resolveJourneyMoment(run,query);
 assert.equal(query.get('signal'),'1');assert.equal(query.get('event'),'7');
 assert.equal(selected.emotionId,'emotion-1');assert.equal(selected.reaction,run.experience[1].reaction);assert.equal(selected.originalMs,22597);
 assert.equal(resolveJourneyMoment(run,params('at=22597&event=9')).emotionId,'emotion-2');
});

test('legacy at-only links select a unique exact reaction including time zero',()=>{
 const selected=resolveJourneyMoment(run,params('at=0'));
 assert.equal(selected.emotionId,'emotion-0');assert.equal(selected.originalMs,0);assert.equal(selected.reaction,run.experience[0].reaction);
 assert.equal(resolveJourneyMoment(run,params('at=22597')),null,'a timestamp collision needs source identity');
 assert.equal(resolveJourneyMoment(run,params('at=22598')),null,'nearby signals are not evidence for the requested time');
});

test('a standalone finding can select an exact browser event without inventing a persona reaction',()=>{
 const selected=resolveJourneyMoment(run,params('at=30000&event=11'));
 assert.equal(selected.eventIndex,11);assert.equal(selected.title,'Return to rooms');assert.equal(selected.observation,'Clicked the room list link.');
 assert.equal(selected.originalMs,30000);assert.equal(selected.reaction,undefined);assert.equal(selected.emotionId,undefined);
});

test('invalid and stale source identities never fall back to another moment',()=>{
 for(const query of ['at=22597&signal=10','at=22597&signal=1&event=9','at=30000&signal=1','at=30000&event=7','at=0&signal=-1','at=0&event=1.5','at=0&signal=','at=0&event=bad']){
  assert.equal(resolveJourneyMoment(run,params(query)),null,query);
 }
 for(const query of ['', 'at=', 'at=-1', 'at=NaN', 'at=Infinity']){
  assert.equal(journeyMomentTime(params(query)),null);assert.equal(resolveJourneyMoment(run,params(query)),null);
 }
});

test('subsequent clicks replace or clear old signal and event keys while preserving the view',()=>{
 const query=params('tab=journey&mode=original&at=22597&signal=1&event=7');
 const before=journeyMomentKey('run',query);
 setJourneyMoment(query,{emotionId:'emotion-2',eventIndex:9},22597);
 assert.equal(query.get('signal'),'2');assert.equal(query.get('event'),'9');assert.notEqual(journeyMomentKey('run',query),before);
 assert.equal(resolveJourneyMoment(run,query).emotionId,'emotion-2');
 setJourneyMoment(query,{index:11},30000);
 assert.equal(query.has('signal'),false);assert.equal(query.get('event'),'11');
 setJourneyMoment(query,{},31000.25);
 assert.equal(query.has('signal'),false);assert.equal(query.has('event'),false);assert.equal(query.get('at'),'31000.25');
 assert.equal(query.get('tab'),'journey');assert.equal(query.get('mode'),'original');
});

test('explicit recorded signal indices and event-derived times preserve their source identity',()=>{
 const source={experience:[{signalIndex:4,eventIndex:12,reaction:'Recorded reaction.',valence:'neutral'}],events:[{index:12,videoMs:1200}]};
 const selected=resolveJourneyMoment(source,params('at=1200&signal=4&event=12'));
 assert.equal(selected.signalIndex,4);assert.equal(selected.emotionId,'emotion-0');assert.equal(selected.originalMs,1200);
 const query=params('');setJourneyMoment(query,selected,1200);assert.equal(query.get('signal'),'4');
});

test('finding links retain the finding text even when a persona signal shares its event and time',()=>{
 const finding={id:'budget-finding',eventIndex:7,originalMs:22597,title:'Price appears late',personaComment:'I could not compare the full prices.',markerKind:'finding'};
 const source={...run,findings:[finding]},query=params('mode=original&at=0&signal=0&event=3');
 setJourneyMoment(query,{...finding,signalIndex:1},22597);
 assert.equal(query.get('finding'),finding.id);assert.equal(query.has('signal'),false);
 const selected=resolveJourneyMoment(source,query);
 assert.equal(selected.id,finding.id);assert.equal(selected.markerKind,'finding');
 assert.equal(selected.personaComment,finding.personaComment);assert.equal(selected.reaction,undefined);
 const findingKey=journeyMomentKey('run',query);
 setJourneyMoment(query,{emotionId:'emotion-1',eventIndex:7},22597);
 assert.equal(query.has('finding'),false);assert.notEqual(journeyMomentKey('run',query),findingKey);
 assert.equal(resolveJourneyMoment(source,query).emotionId,'emotion-1');
});

test('stale finding links do not silently become an unrelated reaction or event',()=>{
 const source={...run,findings:[{id:'price',eventIndex:7,originalMs:22597,title:'Price appears late'}]};
 for(const query of ['at=22597&event=7&finding=missing','at=0&finding=price','at=22597&event=9&finding=price','at=22597&signal=1&finding=price']){
  assert.equal(resolveJourneyMoment(source,params(query)),null,query);
 }
});
