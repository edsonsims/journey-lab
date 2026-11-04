import test from 'node:test';
import assert from 'node:assert/strict';
import {buildJourneySteps,buildJourneyMatches,applyJourneyReview} from './journey-matching.ts';

const click=(label,path='/activity',tag='button')=>({path,action:{type:'click_control',label},click:{target:{label,tag}}});
const scroll=(pixels=600,path='/activity')=>({path,action:{type:'scroll',scroll_y:pixels,scroll_x:0}});
function run(id,actions=[],origin='https://product.test'){
  const events=[{index:0,type:'screenshot',url:origin+'/',videoMs:0}],experience=[{eventIndex:0,actionEventIndex:1,videoMs:200,valence:'neutral'}];
  for(const [i,item] of actions.entries()){
    const actionIndex=i*2+1,shotIndex=actionIndex+1,url=origin+(item.path||'/activity');
    events.push({...item,index:actionIndex,type:item.type||'action',url,videoMs:(i+1)*1000});
    events.push({index:shotIndex,type:'screenshot',url,videoMs:(i+1)*1000+100});
    experience.push({eventIndex:shotIndex,actionEventIndex:shotIndex+1,videoMs:(i+1)*1000+200,valence:i%2?'positive':'negative'});
  }
  return {id,events,experience,originalDurationMs:(actions.length+2)*1000};
}
const ids=result=>result.matches.map(match=>[match.beforeId,match.afterId,match.confidence]);
const accept=(beforeId,afterId=beforeId,source='suggested')=>({beforeId,afterId,status:'accepted',source});

test('steps describe the completed incoming action, not the next action planned by the persona',()=>{
  const data=run('before',[click('Create','/setup'),click('Submit')]);
  data.experience[0].reaction='I will press Create';data.experience[1].reaction='I will press Submit';
  const steps=buildJourneySteps(data);
  assert.equal(steps[0].action.kind,'landing');assert.equal(steps[0].actionEventIndex,null);
  assert.equal(steps[1].title,'Clicked “Create”');assert.equal(steps[1].actionEventIndex,1);assert.equal(steps[1].eventIndex,2);
  assert.equal(steps[2].title,'Clicked “Submit”');assert.equal(steps[1].ms,1200);
  assert.deepEqual(steps.map(step=>step.id),['emotion-0','emotion-1','emotion-2']);
  assert.equal(steps[1].runId,'before');assert.equal(steps[1].fromScreen,'/');assert.equal(steps[1].screen,'/setup');
});

test('different checkout origins, wait lengths and synthetic feelings do not alter action matches',()=>{
  const before=run('before',[click('Create','/setup'),click('Go')]),after=run('after',[click('Create','/setup'),click('Go')],'http://localhost:54321');
  const expected=ids(buildJourneyMatches(before,after));
  after.experience.forEach((note,i)=>Object.assign(note,{videoMs:(i+1)*17000,valence:'very_negative',reaction:'Completely different',observation:'Different',friction:'critical',confidence:0}));
  assert.deepEqual(ids(buildJourneyMatches(before,after)),expected);
  assert.equal(expected.length,3);assert.ok(expected.every(match=>match[2]==='high'));
});

test('actual accessible targets, not requested names or coordinates, establish a click match',()=>{
  const before=run('before',[click('Create')]),after=run('after',[click('Create')]);
  after.events[1].action.label='A totally different model guess';
  assert.equal(buildJourneyMatches(before,after).matches.length,2);
  after.events[1].click.target.tag='div';
  assert.equal(buildJourneyMatches(before,after).matches.length,1);
  delete after.events[1].click;after.events[1].action={type:'click',x:20,y:30};
  assert.equal(buildJourneyMatches(before,after).matches.length,1);
});

test('select field and selected value must both match',()=>{
  const select=(field,value)=>({path:'/setup',action:{type:'select_option',label:value},accessibility:{selectorLabel:field,optionLabel:value}});
  const before=run('before',[select('Age','6–8 years')]);
  assert.equal(buildJourneyMatches(before,run('after',[select('Age','6–8 years')])).matches.length,2);
  assert.equal(buildJourneyMatches(before,run('after',[select('Age','3–5 years')])).matches.length,1);
  assert.equal(buildJourneyMatches(before,run('after',[select('Grade','6–8 years')])).matches.length,1);
  const privateSelect=run('private',[select('SSN','123-45-6789')]);
  const privateStep=buildJourneySteps(privateSelect)[1];
  assert.equal(privateStep.action.value,null);assert.equal(privateStep.action.signature,null);assert.ok(!privateStep.title.includes('123-45-6789'));
});

test('typed input matches only an identified safe field and the exact captured text',()=>{
  const input=(text,context={label:'Activity title',tag:'input',inputType:'text',visible:true,sensitive:false})=>({path:'/setup',action:{type:'type',text},inputContext:context});
  const before=run('before',[input('Moon walk')]);
  assert.equal(buildJourneyMatches(before,run('after',[input('Moon walk')])).matches.length,2);
  assert.equal(buildJourneyMatches(before,run('after',[input('moon walk')])).matches.length,1);
  assert.equal(buildJourneyMatches(before,run('after',[input('Moon walk ')] )).matches.length,1);
  assert.equal(buildJourneyMatches(before,run('after',[input('Moon walk',{})])).matches.length,1);
  for(const field of [{label:'Password',inputType:'text'},{label:'Name',inputType:'text',sensitive:true},{label:'Title',inputType:'text',visible:false}]){
    const a=run('a',[input('private-value',field)]),b=run('b',[input('private-value',field)]);
    assert.equal(buildJourneyMatches(a,b).matches.length,1);
    assert.equal(buildJourneySteps(a)[1].action.value,null);
    assert.equal(buildJourneySteps(a)[1].action.signature,null);
  }
  const hidden=run('a',[input('[REDACTED]')]);assert.equal(buildJourneyMatches(hidden,hidden).matches.length,1);
});

test('branch revisits do not crossmatch the first and second attempt',()=>{
  const before=run('before',[click('Create','/setup'),click('Find','/activity'),scroll(),click('Try again','/setup'),click('Find','/activity'),scroll()]);
  const after=run('after',[click('Create','/setup'),click('Find','/activity'),scroll(700),scroll(700),click('Water')]);
  const result=buildJourneyMatches(before,after);
  assert.deepEqual(ids(result),[['emotion-0','emotion-0','high'],['emotion-1','emotion-1','high'],['emotion-2','emotion-2','high'],['emotion-3','emotion-3','review']]);
  assert.ok(result.unmatchedBefore.some(step=>step.id==='emotion-5'));
  assert.ok(result.unmatchedAfter.some(step=>step.id==='emotion-4'));
});

test('scrolls remain review candidates even with identical pixel distances',()=>{
  const result=buildJourneyMatches(run('before',[click('Go'),scroll()]),run('after',[click('Go'),scroll()]));
  assert.equal(result.matches.at(-1).confidence,'review');
  const automatic=applyJourneyReview(result);assert.equal(automatic.activeMatches.length,2);assert.equal(automatic.unmatchedBefore.length,1);
  const reviewed=applyJourneyReview(result,[accept('emotion-2')]);
  assert.equal(reviewed.activeMatches.length,3);assert.equal(reviewed.activeMatches.at(-1).status,'accepted');
});

test('rejected actions and unknown preceding actions cannot masquerade as identical context',()=>{
  const unknown={path:'/activity',action:{type:'click',x:1,y:2}};
  const a=run('a',[unknown,click('Save')]),b=run('b',[{...unknown,action:{type:'click',x:70,y:80}},click('Save')]);
  const result=buildJourneyMatches(a,b);
  assert.equal(result.matches.at(-1).confidence,'review');assert.equal(result.matches.length,2);
  const rejected=run('r',[click('Save'),{...scroll(),type:'action_rejected'}]);
  assert.equal(buildJourneySteps(rejected).at(-1).action.kind,'rejected');
  assert.equal(buildJourneyMatches(rejected,rejected).matches.length,2);
});

test('unrecorded snapshots are preserved without manufacturing a match from comments or timestamps',()=>{
  const a=run('a'),b=run('b');
  a.experience.push({videoMs:1500,reaction:'Clicked save',valence:'positive'});b.experience.push({videoMs:1500,reaction:'Clicked save',valence:'positive'});
  const result=buildJourneyMatches(a,b);assert.equal(result.matches.length,1);assert.equal(result.unmatchedBefore[0].id,'emotion-1');
  assert.equal(result.unmatchedBefore[0].action.signature,null);assert.equal(result.unmatchedBefore[0].eventIndex,null);
  delete a.experience[0].eventIndex;
  assert.equal(buildJourneySteps(a)[0].action.kind,'unknown');
});

test('recorded actions without persona notes interrupt automatic sequence matching',()=>{
  const a=run('a',[click('Monthly'),click('Continue')]),b=run('b',[click('Annual'),click('Continue')]);
  a.experience.splice(1,1);b.experience.splice(1,1);
  const result=buildJourneyMatches(a,b);
  assert.equal(result.matches.length,2);assert.equal(result.matches.at(-1).confidence,'review');
  assert.ok(!result.matches.at(-1).reasons.includes('Same preceding action sequence'));
  assert.equal(applyJourneyReview(result).activeMatches.length,1);
});

test('repeated labels follow monotonic source order rather than a tempting later match',()=>{
  const a=run('a',[click('Next'),click('Back'),click('Next')]),b=run('b',[click('Next'),click('Next')]);
  const result=buildJourneyMatches(a,b);
  const next=result.matches.filter(match=>result.beforeSteps.find(step=>step.id===match.beforeId).action.label==='Next');
  assert.deepEqual(next.map(match=>[match.beforeId,match.afterId,match.confidence]),[['emotion-1','emotion-1','high'],['emotion-3','emotion-2','review']]);
});

test('manual accepted pairs override conflicting automatic matches and rejected suggestions remain excluded',()=>{
  const a=run('a',[click('A'),click('B'),click('C')]),b=run('b',[click('A'),click('B'),click('C')]);
  const result=buildJourneyMatches(a,b);
  const reviewed=applyJourneyReview(result,[accept('emotion-1','emotion-2','manual'),{beforeId:'emotion-3',afterId:'emotion-3',status:'rejected',source:'suggested'}]);
  assert.deepEqual(reviewed.activeMatches.map(match=>[match.beforeId,match.afterId]),[['emotion-0','emotion-0'],['emotion-1','emotion-2']]);
  assert.equal(reviewed.conflicts.length,0);assert.equal(reviewed.matches.find(match=>match.beforeId==='emotion-3').status,'rejected');
  assert.equal(reviewed.matches.find(match=>match.beforeId==='emotion-2').status,'review');
});

test('review validates missing IDs, duplicates, crossing pairs and original media bounds',()=>{
  const a=run('a',[click('A'),click('B'),click('C')]),b=run('b',[click('A'),click('B'),click('C')]);
  let reviewed=applyJourneyReview(buildJourneyMatches(a,b),[accept('emotion-1','emotion-2','manual'),accept('emotion-2','emotion-1','manual'),accept('emotion-3','emotion-2','manual'),accept('missing','emotion-3','manual')]);
  assert.equal(reviewed.conflicts.length,3);
  reviewed=applyJourneyReview(buildJourneyMatches(a,b),[accept('emotion-1'),accept('emotion-1')]);assert.equal(reviewed.conflicts.length,1);
  a.originalDurationMs=1000;
  reviewed=applyJourneyReview(buildJourneyMatches(a,b),[accept('emotion-1')]);
  assert.equal(reviewed.conflicts.length,1);assert.equal(reviewed.activeMatches.length,1);
  assert.match(reviewed.conflicts[0].reason,/original recordings/);
  // Run wall-clock duration cannot reject a valid recording timestamp.
  delete a.originalDurationMs;a.durationMs=10;
  assert.equal(applyJourneyReview(buildJourneyMatches(a,b),[accept('emotion-1')]).conflicts.length,0);
});

test('same-time observations never create two playback anchors or erase the source points',()=>{
  const a=run('a',[click('A'),click('B')]),b=run('b',[click('A'),click('B')]);
  a.experience[2].videoMs=a.experience[1].videoMs;
  const result=buildJourneyMatches(a,b);assert.equal(result.matches.length,3);
  const reviewed=applyJourneyReview(result,[accept('emotion-1'),accept('emotion-2')]);
  assert.equal(reviewed.conflicts.length,1);assert.equal(reviewed.activeMatches.length,2);assert.equal(reviewed.unmatchedBefore.length,1);
});

test('query-dependent screens and repeated snapshots require review',()=>{
  const a=run('a',[click('Open','/item?id=1')]),b=run('b',[click('Open','/item?id=2')]);
  const result=buildJourneyMatches(a,b);assert.equal(result.matches.at(-1).confidence,'review');
  assert.equal(result.beforeSteps.at(-1).screen,'/item');assert.ok(!result.beforeSteps.at(-1).action.signature.includes('id=1'));
  a.experience.push({...a.experience.at(-1),videoMs:1600});b.experience.push({...b.experience.at(-1),videoMs:1600});
  assert.equal(buildJourneyMatches(a,b).matches.at(-1).confidence,'review');
});
