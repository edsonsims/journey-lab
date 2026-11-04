import test from 'node:test';
import assert from 'node:assert/strict';
import {experienceScreenState,experienceStateGroups} from './experience-screen-states.ts';

const moment=observation=>({runId:'source-run',eventIndex:3,signalIndex:0,originalMs:0,observation,reaction:'I want to confirm a booking.'});

test('explicit state preserves source identity, zero time, and takes precedence over an inferred screen',()=>{
 const item={...moment('Review page shows the itemized total.'),source:{state:'Room details'}},before=structuredClone(item);
 const state=experienceScreenState('gather',item);
 assert.equal(state.id,'gather-room-details');assert.equal(state.kind,'recorded');assert.equal(state.basis,'Recorded screen state (source.state).');
 assert.deepEqual(state.source,{runId:'source-run',eventIndex:3,signalIndex:0,originalMs:0});assert.deepEqual(item,before);
});
test('generic projects retain arbitrary recorded states without Gather interpretation',()=>{
 assert.equal(experienceScreenState('other',{...moment('Review page shows a total.'),context:{state:'Empty basket'}}).label,'Empty basket');
 assert.equal(experienceScreenState('other',moment('Confirmation page shows the booking.')).kind,'unknown');
 assert.equal(experienceScreenState('other',{...moment(''),state:'Review'}).id,'recorded:Review');
});
test('Gather distinguishes visible selection, requirements, details, review, confirmation, and reservations',()=>{
 const cases=[
  ['Landing page shows rooms with 12 seats available tomorrow.','gather-room-selection'],
  ['Landing page shows tomorrow with a projector required. Cedar is $200/hour with 12 seats; Oak has 8 seats.','gather-room-selection'],
  ['Room list confirms 12 people with projector required.','gather-room-selection'],
  ['After scrolling, the same two rooms remain visible with the footer below them; no additional rooms were revealed.','gather-room-selection'],
  ['Form shows Tomorrow, 12 people, and We need a projector checked.','gather-meeting-plans'],
  ['Details page for Cedar shows an empty Meeting name field.','gather-room-details'],
  ['Meeting details page for Cedar shows an empty Meeting name field.','gather-room-details'],
  ['Your meeting step for Cedar shows a Meeting name input.','gather-room-details'],
  ['Cedar meeting name field is focused and empty.','gather-room-details'],
  ['Meeting name now reads Strategy meeting; the total is unchanged.','gather-room-details'],
  ['Cedar form again shows Strategy meeting entered, with Review booking available.','gather-room-details'],
  ['Review page shows an itemized total and Confirm reservation.','gather-review-booking'],
  ['Cedar review shows a meeting for twelve people.','gather-review-booking'],
  ["Confirmation page says You've got a room.",'gather-confirmation'],
  ['My reservations page shows one confirmed meeting.','gather-reservations'],
 ];
 for(const [observation,id] of cases){const result=experienceScreenState('gather',moment(observation));assert.equal(result.id,id,observation);assert.equal(result.kind,'inferred');assert.equal(result.observation,observation);assert.match(result.basis,/recorded observation/);}
});
test('destination buttons do not change current screen classification',()=>{
 for(const observation of [
  'Meeting name field shows Strategy meeting; Review booking button is visible.',
  'Details page shows a Meeting name input and Review booking button.',
 ])assert.equal(experienceScreenState('gather',moment(observation)).id,'gather-room-details');
 assert.equal(experienceScreenState('gather',moment('Review shows a total, with Confirm reservation available.')).id,'gather-review-booking');
 assert.equal(experienceScreenState('gather',moment('A My reservations link is visible in the navigation.')).id,'unknown');
});
test('goals reactions future actions and absent screens do not establish visible state',()=>{
 const observations=[
  '', 'I will open the review page next.', 'No confirmation page is visible.',
  'Review page will show a total.', 'The expected review page is not visible.',
  'Previous review shows a different total.', 'Earlier confirmation shows an old booking.',
  'The room list is not visible.', 'A Review booking button is visible.',
  'I expected confirmation but got an error.', 'Landing page shows a maintenance notice.',
 ];
 for(const observation of observations){const result=experienceScreenState('gather',{...moment(observation),reaction:'Confirmation page shows a booking.',goal:'Review booking',pageTitle:'Confirmation'});assert.equal(result.kind,'unknown',observation);}
});
test('ambiguous observations and conflicting heading metadata stay unknown',()=>{
 const first=experienceScreenState('gather',moment('Room list shows two rooms. Review page shows a total.'));
 assert.equal(first.id,'unknown');assert.match(first.basis,/multiple screen states/);
 assert.equal(experienceScreenState('gather',{...moment('Review page shows a total.'),screenHeading:"You've got a room"}).kind,'unknown');
 assert.equal(experienceScreenState('gather',{...moment(''),pageHeading:'My reservations.'}).id,'gather-reservations');
});
test('unclassified moments do not inherit a previous state or fabricated timestamp',()=>{
 const moments=[moment('Room list shows two rooms.'),{runId:'other-run',observation:'Nothing recognisable is visible.'}],before=structuredClone(moments);
 const groups=experienceStateGroups('gather',moments);
 assert.deepEqual(groups.map(group=>group.id),['gather-room-selection','unknown']);assert.equal(groups[1].moments[0],moments[1]);assert.equal(experienceScreenState('gather',moments[1]).source.originalMs,null);assert.deepEqual(moments,before);
});
test('groups preserve source moments while exposing recorded and inferred provenance counts',()=>{
 const a={...moment('Review shows an itemized total.'),state:'Review booking'},b={...moment('Review page shows the same total.'),signalIndex:1,originalMs:2500},c=moment('Details page shows a meeting name field.');
 const groups=experienceStateGroups('gather',[a,b,c]);
 assert.equal(groups.length,2);assert.deepEqual(groups[0].moments,[a,b]);assert.equal(groups[0].recordedCount,1);assert.equal(groups[0].inferredCount,1);assert.equal(groups[1].label,'Room details');
});
