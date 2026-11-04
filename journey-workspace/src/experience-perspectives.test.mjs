import test from 'node:test';
import assert from 'node:assert/strict';
import {groupExperiencePages} from './insights-data.ts';
import {buildExperienceCatalog,buildExperiencePerspectives,experienceRunSlice,experienceObservations,experienceFindingMoments} from './experience-perspectives.ts';

const run=(id,personaId='maya',environmentId='before',extras={})=>({id,runId:id,personaId,personaName:personaId==='maya'?'Maya · Coordinator':'Alex · Assistant',personaVersion:1,charterId:'book',charterVersion:1,environmentId,environmentVersion:1,device:'desktop',viewport:{width:1440,height:1000},build:{id:`source:${environmentId}`},model:'wonder',rubricVersion:'v1',status:'finished',createdAt:'2026-11-01T10:00:00Z',...extras});
function screen(run,signals=[{observation:'Review shows a total above the budget.',reaction:'I need another room.',valence:'negative'}],findings=[]){
 const context={...run,url:`https://${run.environmentId}.test/rooms`},moments=signals.map((signal,i)=>({id:`${run.id}:signal:${i}`,runId:run.id,eventIndex:i+1,signalIndex:i,originalMs:i*1000,context,screenUrl:context.url,screenshot:`/runs/${run.id}/screen-${i}.png`,video:`/runs/${run.id}/journey.webm`,...signal})),sources=moments.map(moment=>({...moment,signalIndex:null,sourceHash:`frame:${run.id}:${moment.eventIndex}`}));
 return {id:`screen:${run.id}`,name:'Rooms',routePattern:'/rooms',states:{visited:true,evaluated:true},moments,sourceRefs:sources,evaluations:findings.map((finding,i)=>({kind:'finding',id:`${run.id}:finding:${i}`,source:sources[0],...finding})),visits:[{id:`${run.id}:visit:0`,screenId:`screen:${run.id}`,context,signals:moments,screenshots:sources,actions:[]}]};
}
const pageFor=(screens)=>groupExperiencePages(screens,'Gather')[0];
const record=(pairs,repairPairs=[])=>({id:'impact',title:'Quick booking',createdAt:'2026-11-01T12:00:00Z',baseline:{label:'Current'},proposal:{label:'Proposed'},report:{pairs,repair:{pairs:repairPairs}}});
const pair=(before,after,status='matched')=>({personaId:before.personaId,beforeRunId:before.id,afterRunId:after.id,before,after,controls:{status,issues:status==='matched'?[]:['Different mission']}});

test('retained stage selectors use exact paired runs even when personas have different environment IDs',()=>{
 const b=run('base'),p=run('proposed','maya','proposal'),fresh=run('fresh','maya','before-maya'),fixed=run('fixed','maya','after-maya'),afresh=run('afresh','alex','before-alex'),afixed=run('afixed','alex','after-alex');
 const all=[b,p,fresh,fixed,afresh,afixed],page=pageFor(all.map(r=>screen(r))),catalog=buildExperienceCatalog(page,all,[],[record([pair(b,p)],[pair(fresh,fixed),pair(afresh,afixed)])]);
 assert.equal(catalog.variants.length,4);assert.equal(catalog.defaultBeforeId,'impact:impact:repair:before');assert.equal(catalog.defaultAfterId,'impact:impact:repair:after');
 assert.deepEqual(new Set(catalog.variants.find(v=>v.id===catalog.defaultAfterId).runIds),new Set(['fixed','afixed']));
 const result=buildExperiencePerspectives(page,catalog);assert.equal(result.length,2);assert.deepEqual(result.map(row=>row.comparison.status),['matched','matched']);assert.equal(result.find(row=>row.id==='maya').before.runId,'fresh');
});
test('catalogs never introduce an impact run outside the current page source scope',()=>{
 const before=run('before'),after=run('after','maya','after'),page=pageFor([screen(before)]),catalog=buildExperienceCatalog(page,[before],[],[record([pair(before,after)])]);
 assert.deepEqual(catalog.runs.map(run=>run.id),['before']);assert.equal(catalog.variants.length,1);assert.equal(catalog.variants[0].runIds.includes('after'),false);
 const result=buildExperiencePerspectives(page,catalog,{beforeId:'impact:impact:proposal:before',afterId:'impact:impact:proposal:after'});assert.equal(result[0].after,null);assert.equal(result[0].comparison.status,'missing');
});
test('one persona row retains separate versions and missions instead of averaging their signals',()=>{
 const before=run('b'),after=run('a','maya','after',{personaVersion:2,charterVersion:2}),page=pageFor([screen(before),screen(after,[{observation:'Confirmation appears.',reaction:'Done.',valence:'positive'}])]);
 const catalog=buildExperienceCatalog(page,[before,after]),result=buildExperiencePerspectives(page,catalog,{beforeId:catalog.variants[0].id,afterId:catalog.variants[1].id});
 assert.equal(result.length,1);assert.deepEqual(result[0].personaVersions,['1','2']);assert.equal(result[0].before.counts.negativeSignals,1);assert.equal(result[0].after.counts.negativeSignals,0);assert.equal(result[0].comparison.status,'unpaired');assert.match(result[0].comparison.issues.join(' '),/Persona version differs.*Mission version differs/);
});
test('repeated journeys require visible run selection and explicit picks preserve their own reactions',()=>{
 const first=run('first'),second=run('second','maya','before',{createdAt:'2026-11-01T11:00:00Z'}),page=pageFor([screen(first,[{observation:'First visit.',reaction:'First reaction.',valence:'neutral'}]),screen(second,[{observation:'Second visit.',reaction:'Second reaction.',valence:'positive'}])]);
 const catalog=buildExperienceCatalog(page,[first,second]),defaultRows=buildExperiencePerspectives(page,catalog),chosen=buildExperiencePerspectives(page,catalog,{beforeRuns:{maya:'first'}});
 assert.equal(defaultRows.length,1);assert.equal(defaultRows[0].before.journeys.length,2);assert.equal(defaultRows[0].before.selectionRequired,true);assert.equal(defaultRows[0].before.selectionExplicit,false);assert.equal(defaultRows[0].before.runId,'second');assert.equal(defaultRows[0].before.moments.length,1);
 assert.equal(chosen[0].before.runId,'first');assert.equal(chosen[0].before.selectionExplicit,true);assert.equal(chosen[0].before.moments[0].reaction,'First reaction.');
});
test('unknown persona identities stay separate even when their names match',()=>{
 const a=run('a','unknown'),b=run('b','unknown'),page=pageFor([screen(a),screen(b)]),catalog=buildExperienceCatalog(page,[a,b]);
 assert.equal(buildExperiencePerspectives(page,catalog).length,2);
});
test('clear observation summaries prefer sourced problems over a successful goal without inventing a failure',()=>{
 const r=run('r','maya','before',{outcome:'goal_reached',personaSnapshot:{mission:'Stay under $250.'}}),page=pageFor([screen(r,undefined,[{title:'Reservation saved',impact:'informational'},{title:'Changing rooms cleared the meeting name',impact:'low'},{title:'Full price appeared late',impact:'medium'}])]),slice=experienceRunSlice(page,r.id,r);
 assert.equal(slice.outcomeLabel,'Goal reached');assert.equal(slice.tone,'negative');assert.equal(slice.headline,'Full price appeared late');assert.equal(slice.mission,'Stay under $250.');assert.deepEqual(slice.observations.map(o=>o.title),['Full price appeared late','Changing rooms cleared the meeting name']);assert.equal(slice.observations[0].source.originalMs,0);
});
test('duplicated findings and repeated identical observations do not become multiple claimed problems',()=>{
 const moment={id:'a',runId:'r',eventIndex:1,originalMs:0,observation:'The input is empty.',reaction:'I must enter it again.',valence:'negative'};
 assert.equal(experienceObservations({moments:[moment,{...moment,id:'b'}]}).length,1);
 assert.equal(experienceObservations({moments:[moment],evaluations:[{kind:'finding',id:'f1',title:'Lost input',impact:'low',source:moment},{kind:'finding',id:'f2',title:'Lost input',impact:'low',source:moment}]}).length,1);
});
test('unpaired journeys never inherit a matched status from different runs or reversed sides',()=>{
 const before=run('before'),after=run('after','maya','after'),page=pageFor([screen(before),screen(after)]),catalog=buildExperienceCatalog(page,[before,after],[],[record([pair(before,after)])]);
 const reversed=buildExperiencePerspectives(page,catalog,{beforeId:catalog.defaultAfterId,afterId:catalog.defaultBeforeId})[0];assert.equal(reversed.comparison.status,'unpaired');assert.equal(reversed.comparison.label,'Unpaired journeys');
});
test('unknown controls and retained mismatch remain explicit',()=>{
 const before=run('before'),after=run('after','maya','after'),page=pageFor([screen(before),screen(after)]),catalog=buildExperienceCatalog(page,[before,after],[],[record([pair(before,after,'mismatch')])]);
 const result=buildExperiencePerspectives(page,catalog)[0];assert.equal(result.comparison.status,'mismatch');assert.deepEqual(result.comparison.issues,['Different mission']);
});
test('empty scope is empty, and absent valence or outcome never becomes a success',()=>{
 assert.deepEqual(buildExperienceCatalog({},[]).variants,[]);assert.deepEqual(buildExperiencePerspectives({},buildExperienceCatalog({},[])),[]);
 const r=run('r'),page=pageFor([screen(r,[{observation:'A form is visible.',reaction:'',valence:null}])]),slice=experienceRunSlice(page,'r',r);assert.equal(slice.outcomeLabel,'Outcome not recorded');assert.equal(slice.tone,'neutral');assert.equal(slice.counts.unknownValence,1);
});
test('grouping and selection preserve all source records, exact timestamps, screenshots and video identities',()=>{
 const before=run('before'),after=run('after','maya','after'),screens=[screen(before),screen(after)],page=pageFor(screens),impact=record([pair(before,after)]),original=structuredClone({screens,page,impact});
 const catalog=buildExperienceCatalog(page,[before,after],[],[impact]),result=buildExperiencePerspectives(page,catalog),moment=result[0].before.moments[0];assert.equal(moment.originalMs,0);assert.equal(moment.screenshot,'/runs/before/screen-0.png');assert.equal(moment.video,'/runs/before/journey.webm');assert.deepEqual({screens,page,impact},original);
});

test('multi-event finding links to the cited negative review instead of the positive first evidence frame',()=>{
 const r=run('r','maya','before',{findings:[{id:'price',runId:'r',title:'Original model title',evidence_indices:[3,5,11],evidence:[{index:3},{index:5},{index:11}],observation:'Review adds equipment and service fees.',personaComment:'This is over my budget.'}]}),page=pageFor([screen(r,[
  {eventIndex:3,originalMs:7047,valence:'positive',observation:'Headline rate is $220.'},
  {eventIndex:5,originalMs:11019,valence:'positive',observation:'Projector is included in the booking.'},
  {eventIndex:11,originalMs:22597,valence:'negative',observation:'Review total is $280.'},
  {eventIndex:19,originalMs:39902,valence:'very_negative',observation:'An unrelated input is empty.'}
 ],[{id:'price',title:'Reviewed price finding',impact:'medium'}])]);
 const original=structuredClone({page,r}),slice=experienceRunSlice(page,'r',r),observation=slice.observations[0];
 assert.equal(observation.title,'Reviewed price finding');assert.equal(observation.moment.eventIndex,11);assert.equal(observation.moment.originalMs,22597);
 assert.equal(observation.source.eventIndex,3);assert.equal(observation.details,'Review adds equipment and service fees.');
 assert.deepEqual(slice.evaluations[0].evidence_indices,[3,5,11]);assert.equal(slice.evaluations[0].personaComment,'This is over my budget.');
 assert.deepEqual({page,r},original);
});

test('finding evidence excludes uncited reactions and other runs, including a stronger negative',()=>{
 const finding={kind:'finding',id:'input',impact:'low',title:'Lost input',runId:'r',source:{runId:'r',eventIndex:9},evidence_indices:[9,13,17,21]};
 const moments=[
  {id:'entered',runId:'r',eventIndex:9,originalMs:17996,valence:'positive'},
  {id:'lost',runId:'r',eventIndex:17,originalMs:35481,valence:'negative'},
  {id:'uncited',runId:'r',eventIndex:19,originalMs:39902,valence:'very_negative'},
  {id:'other',runId:'other',eventIndex:17,originalMs:50,valence:'very_negative'}
 ];
 assert.deepEqual(experienceFindingMoments(finding,moments).map(moment=>moment.id),['entered','lost']);
 assert.equal(experienceObservations({moments,evaluations:[finding]})[0].moment.id,'lost');
 assert.equal(experienceObservations({moments:moments.filter(moment=>moment.id==='entered'),evaluations:[finding]})[0].moment.id,'entered');
 assert.equal(experienceObservations({moments:moments.filter(moment=>['uncited','other'].includes(moment.id)),evaluations:[finding]})[0].moment,null);
});

test('screen subsets can retain a finding through any cited event and choose only evidence in that subset',()=>{
 const finding={kind:'finding',id:'price',impact:'medium',title:'Price disclosed late',source:{runId:'r',eventIndex:3},evidence_indices:[3,5,11]},review={id:'review',runId:'r',eventIndex:11,valence:'negative',originalMs:22597};
 assert.equal(experienceFindingMoments(finding,[review]).length,1);
 assert.equal(experienceObservations({moments:[review],evaluations:[finding]})[0].moment.id,'review');
 assert.equal(experienceFindingMoments(finding,[{...review,eventIndex:13}]).length,0);
 assert.equal(experienceFindingMoments({...finding,source:{runId:'other',eventIndex:3},runId:'r'},[review]).length,0);
});

test('informational findings keep their neutral primary anchor and fall back only to cited evidence within a screen subset',()=>{
 const moments=[{id:'start',runId:'r',eventIndex:3,valence:'neutral',originalMs:1000},{id:'review',runId:'r',eventIndex:11,valence:'positive',originalMs:2000},{id:'saved',runId:'r',eventIndex:15,valence:'very_positive',originalMs:3000},{id:'uncited',runId:'r',eventIndex:17,valence:'very_positive',originalMs:4000}],finding={kind:'finding',id:'verified',title:'All-in pricing is visible up front',impact:'informational',source:{runId:'r',eventIndex:3},evidence:[{index:3},{index:11},{index:15}]};
 assert.equal(experienceObservations({moments,evaluations:[finding]})[0].moment.id,'start');
 assert.equal(experienceObservations({moments:moments.slice(1),evaluations:[finding]})[0].moment.id,'review');
 assert.equal(experienceObservations({moments:moments.slice(3),evaluations:[finding]})[0].moment,null);
 assert.equal(experienceObservations({moments,evaluations:[{...finding,evidence:undefined}]})[0].moment.id,'start');
 assert.equal(experienceObservations({moments,evaluations:[{...finding,evidence:[{index:11,runId:'other'}]}]})[0].moment.id,'start');
});

test('provenance enrichment requires the exact finding identity from the exact selected run',()=>{
 const r=run('r','maya','before',{findings:[{id:'wrong-id',runId:'r',evidence_indices:[11]},{id:'price',runId:'other',evidence_indices:[11]}]}),page=pageFor([screen(r,[{eventIndex:3,valence:'positive'},{eventIndex:11,valence:'negative'}],[{id:'price',title:'Price changed',impact:'medium'}])]);
 const slice=experienceRunSlice(page,'r',r);assert.equal(slice.evaluations[0].evidence_indices,undefined);assert.equal(slice.observations[0].moment.eventIndex,3);
 const wrongRun=experienceRunSlice(page,'r',{id:'other',findings:[{id:'price',evidence_indices:[11]}]});assert.equal(wrongRun.evaluations[0].evidence_indices,undefined);
});

test('missing or invalid event provenance never matches an undefined event index',()=>{
 const finding={kind:'finding',id:'unlinked',title:'Unlinked finding',impact:'medium',source:{runId:'r'}},moments=[{id:'unlocated',runId:'r',valence:'negative'},{id:'located',runId:'r',eventIndex:11,valence:'negative'}];
 for(const evidence of [{},{evidence_indices:[undefined,null,'11',-1,1.5]},{evidence:[{index:undefined},{index:'11'}]}]){
  assert.deepEqual(experienceFindingMoments({...finding,...evidence},moments),[]);
  assert.equal(experienceObservations({moments,evaluations:[{...finding,...evidence}]})[0].moment,null);
 }
});
