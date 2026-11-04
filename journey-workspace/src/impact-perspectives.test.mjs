import test from 'node:test';
import assert from 'node:assert/strict';
import {buildImpactPerspective,buildImpactPerspectives,filterImpactPerspectives,impactPerspectiveSummary,impactPerspectiveTakeaway} from './impact-perspectives.ts';
import {getImpactExample} from './impact-examples.ts';
import {exampleMoments} from './impact-example-experience.ts';

const run=(experience=[])=>({status:'finished',experience});
const pair=(id,extra={})=>({personaId:id,personaName:id,before:run(),after:run(),controls:{status:'matched'},outcomeChange:'unchanged',effortChange:'same',metrics:{before:{outcome:'goal_reached',interactionActions:4},after:{outcome:'goal_reached',interactionActions:4}},...extra});

test('regressions and observed friction precede gains without treating fewer actions as improvement',()=>{
 const items=buildImpactPerspectives([
  pair('faster',{effortChange:'fewer_actions'}),pair('improved',{outcomeChange:'improved'}),
  pair('pending',{after:null}),pair('friction',{before:run([{valence:'positive'}]),after:run([{valence:'negative'}])}),
  pair('regressed',{outcomeChange:'regressed',effortChange:'fewer_actions'}),
 ]);
 assert.deepEqual(items.map(item=>item.id),['regressed','friction','pending','improved','faster']);
 assert.equal(items.find(item=>item.id==='faster').goalImproved,false);
 assert.deepEqual(impactPerspectiveSummary(items),{total:5,attention:2,improved:1,betterExperience:0,incomplete:1});
});

test('unknown counts stay unknown while untimed recorded negative reactions still count',()=>{
 const missing=buildImpactPerspective(pair('missing',{before:null,after:run([{valence:'unrecognized'}])}));
 assert.equal(missing.beforeActions,null);assert.equal(missing.beforeReactions.negative,null);assert.equal(missing.afterReactions.negative,null);
 const observed=buildImpactPerspective(pair('recorded',{before:run([{valence:'positive'},{valence:'neutral'}]),after:run([{valence:'negative'},{valence:'very_negative'},{valence:'unrecognized'}])}));
 assert.equal(observed.beforeReactions.negative,0);assert.equal(observed.afterReactions.negative,2);assert.equal(observed.afterReactions.unrated,1);
 assert.equal(observed.needsAttention,true);
});

test('incomplete or incomparable runs cannot count as goal gains or regressions',()=>{
 for(const extra of [{after:{status:'failed'}},{after:{status:'running'}},{controls:{status:'mismatch'}},{controls:{status:'pending'}}]){
  const item=buildImpactPerspective(pair('unverified',{outcomeChange:'improved',...extra}));
  assert.equal(item.incomplete,true);assert.equal(item.goalImproved,false);assert.equal(item.needsAttention,false);
 }
});

test('filters combine role and name search with explicit goal changes, keeping unknowns in All and Incomplete',()=>{
 const items=buildImpactPerspectives([
  pair('maya',{personaName:'Maya Chen',personaRole:'Event coordinator',outcomeChange:'regressed'}),
  pair('alex',{personaName:'Alex Jones',personaRole:'Casual attendee',outcomeChange:'improved'}),
  pair('sam',{effortChange:'fewer_actions'}),pair('jo',{after:null}),
 ]);
 assert.deepEqual(filterImpactPerspectives(items,'maya coordinator','attention').map(item=>item.id),['maya']);
 assert.deepEqual(filterImpactPerspectives(items,'','improved').map(item=>item.id),['alex']);
 assert.deepEqual(filterImpactPerspectives(items,'','unchanged').map(item=>item.id),['sam']);
 assert.deepEqual(filterImpactPerspectives(items,'','incomplete').map(item=>item.id),['jo']);
 assert.equal(filterImpactPerspectives(items,'unknown persona').length,0);
 assert.equal(filterImpactPerspectives(items).length,4);
});

test('authored examples surface their mechanism without claiming recorded observations',()=>{
 for(const marker of [{isExample:true},{provenance:'authored_ui_example'}]){
  const example=buildImpactPerspective(pair('maya',{...marker,exampleObservation:'Guest checkout removes the group invoice.',exampleReason:'Maya needs one invoice for the team.',effortChange:'fewer_actions'}));
  assert.equal(example.observation,'Guest checkout removes the group invoice.');
  assert.equal(example.observationDetail,'Maya needs one invoice for the team.');
  assert.equal(filterImpactPerspectives([example],'invoice team').length,1);
  const fallback=buildImpactPerspective(pair('alex',{...marker,effortChange:'fewer_actions'}));
  assert.equal(fallback.observation,'Fewer actions in this example');
  const pending=buildImpactPerspective(pair('pending',{...marker,after:null}));
  assert.equal(pending.afterOutcome,'Not provided');assert.equal(pending.afterActions,null);assert.equal(pending.afterReactions.negative,null);
 }
 const real=buildImpactPerspective(pair('real',{exampleObservation:'Untrusted example field',effortChange:'fewer_actions'}));
 assert.equal(real.observation,'Fewer actions recorded');
});

test('twelve personas preserve all rows and stable attention ordering across combined filters',()=>{
 const examples=Array.from({length:12},(_,index)=>pair(`person-${index}`,{
  personaName:`Person ${index}`,personaRole:index%2?'Coordinator':'Attendee',
  ...([{outcomeChange:'improved'},{outcomeChange:'regressed'},{after:null},{effortChange:'fewer_actions'}][index%4]),
 }));
 const items=buildImpactPerspectives(examples);
 assert.deepEqual(items.map(item=>item.id),['person-1','person-5','person-9','person-2','person-6','person-10','person-0','person-4','person-8','person-3','person-7','person-11']);
 assert.equal(new Set(items.map(item=>item.id)).size,12);
 assert.deepEqual(impactPerspectiveSummary(items),{total:12,attention:3,improved:3,betterExperience:0,incomplete:3});
 assert.equal(filterImpactPerspectives(items,'coordinator','attention').length,3);
 assert.equal(filterImpactPerspectives(items,'attendee','attention').length,0);
 assert.equal(filterImpactPerspectives(items,'attendee','incomplete').length,3);
 assert.equal(filterImpactPerspectives(items,'','unchanged').length,3);
 assert.equal(filterImpactPerspectives(items,'','improved').length,3);
 assert.equal(filterImpactPerspectives(items).length,12);
});

test('authored overview and detailed arcs count the same explicit moment matches',()=>{
 for(const id of ['example-relay-import','example-handoff-links']){
  for(const examplePair of getImpactExample(id).report.pairs){
   const item=buildImpactPerspective(examplePair);
   if(item.incomplete){assert.equal(item.emotion.compared,0);assert.equal(item.betterExperience,false);continue;}
   const deltas=exampleMoments(examplePair).filter(moment=>moment.before?.value!=null&&moment.after?.value!=null).map(moment=>moment.after.value-moment.before.value);
   assert.equal(item.emotion.compared,deltas.length);
   assert.equal(item.emotion.higher,deltas.filter(delta=>delta>0).length);
   assert.equal(item.emotion.lower,deltas.filter(delta=>delta<0).length);
   assert.equal(item.emotion.same,deltas.filter(delta=>delta===0).length);
  }
 }
});

test('Nia has a green experience benefit with the same goal, while Chen remains incomplete',()=>{
 const items=buildImpactPerspectives(getImpactExample('example-relay-import').report.pairs);
 const nia=items.find(item=>item.name==='Nia');
 assert.equal(nia.noGoalChange,true);assert.equal(nia.betterExperience,true);assert.equal(nia.goalImproved,false);
 assert.equal(nia.needsAttention,false);assert.equal(nia.tone,'positive');
 assert.deepEqual(filterImpactPerspectives(items,'','experience').map(item=>item.name),['Nia']);
 const chen=buildImpactPerspectives(getImpactExample('example-handoff-links').report.pairs).find(item=>item.name==='Chen');
 assert.equal(chen.incomplete,true);assert.equal(chen.emotion.direction,'unavailable');assert.equal(chen.emotion.compared,0);assert.equal(chen.betterExperience,false);
 assert.equal(items.some(item=>item.needsAttention&&item.betterExperience),false);
});

test('fewer actions alone never count as a better experience',()=>{
 const faster=buildImpactPerspective(pair('faster',{effortChange:'fewer_actions'}));
 assert.equal(faster.betterExperience,false);assert.equal(faster.tone,'neutral');
 assert.deepEqual(filterImpactPerspectives([faster],'','experience'),[]);
});


test('takeaways explain source count deltas while keeping goal outcomes explicit',()=>{
 const maya=buildImpactPerspective(pair('maya',{
  before:run([{valence:'positive'}]),after:run([{valence:'negative'},{valence:'very_negative'}]),
  metrics:{before:{outcome:'goal_reached',interactionActions:7},after:{outcome:'goal_reached',interactionActions:12}},
 }));
 assert.deepEqual(impactPerspectiveTakeaway(maya),{
  goal:'Goal reached in both',changes:['5 more actions','2 more negative reactions'],
  text:'Goal reached in both · 5 more actions · 2 more negative reactions',
 });
 const regressed=buildImpactPerspective(pair('regressed',{
  outcomeChange:'regressed',effortChange:'fewer_actions',
  before:run([{valence:'negative'}]),after:run([{valence:'positive'}]),
  metrics:{before:{outcome:'goal_reached',interactionActions:4},after:{outcome:'obstacle_observed',interactionActions:3}},
 }));
 assert.equal(impactPerspectiveTakeaway(regressed).text,'Goal reached → Obstacle observed · 1 fewer action · 1 fewer negative reaction');
 assert.equal(regressed.betterExperience,false);
 assert.equal(filterImpactPerspectives([maya],'5 more actions').length,1);
});

test('takeaways never turn missing data or invalid comparisons into a success claim',()=>{
 for(const extra of [{after:null},{after:{status:'running'}},{controls:{status:'mismatch'}},{controls:{status:'pending'}}]){
  const item=buildImpactPerspective(pair('incomplete',extra));
  assert.deepEqual(impactPerspectiveTakeaway(item),{goal:item.stateLabel,changes:[],text:item.stateLabel});
 }
 const unknown=buildImpactPerspective(pair('unknown',{
  metrics:{before:{interactionActions:null},after:{interactionActions:undefined}},
  before:run([{valence:'unknown'}]),after:run([{valence:'unknown'}]),
 }));
 assert.deepEqual(impactPerspectiveTakeaway(unknown),{goal:'Goal outcome not established',changes:[],text:'Goal outcome not established'});
 const blocked=buildImpactPerspective(pair('blocked',{
  metrics:{before:{outcome:'obstacle_observed'},after:{outcome:'obstacle_observed'}},
 }));
 assert.equal(impactPerspectiveTakeaway(blocked).goal,'Obstacle observed in both');
});

test('takeaways describe counts rather than claiming a rate or averaged emotional improvement',()=>{
 const uneven=buildImpactPerspective(pair('uneven',{
  before:run([{valence:'negative'}]),
  after:run([{valence:'negative'},{valence:'positive'},{valence:'positive'},{valence:'unrecognized'}]),
  metrics:{before:{outcome:'goal_reached',interactionActions:4},after:{outcome:'goal_reached',interactionActions:4}},
 }));
 assert.equal(impactPerspectiveTakeaway(uneven).text,'Goal reached in both · Same action count · Same negative reaction count');
 assert.equal(uneven.beforeReactions.rated,1);
 assert.equal(uneven.afterReactions.rated,3);
 assert.equal(uneven.afterReactions.unrated,1);
 assert.equal(uneven.betterExperience,false);
});
