import test from 'node:test';
import assert from 'node:assert/strict';
import {buildExperienceFeedback} from './experience-feedback.ts';

const run=(id='r',extra={})=>({id,runId:id,personaId:'maya',personaName:'Maya',personaVersion:1,environmentId:'preview',environmentVersion:1,createdAt:'2026-11-01T12:00:00Z',build:{id:'build-a'},...extra});
function screen(r,signals=[],findings=[],extra={}){
 const context={...r,url:'https://preview.test/'},moments=signals.map((signal,index)=>({id:`${r.id}:signal:${index}`,runId:r.id,signalIndex:index,eventIndex:index*2+3,originalMs:index*1000,context,screenUrl:context.url,screenshot:`/runs/${r.id}/${index}.png`,video:`/runs/${r.id}/journey.webm`,track:'experience',valence:'neutral',observation:'Recorded observation.',reaction:'Recorded reaction.',...signal}));
 const sourceRefs=moments.map(moment=>({runId:r.id,eventIndex:moment.eventIndex,originalMs:moment.originalMs,screenshot:moment.screenshot,screenUrl:moment.screenUrl,video:moment.video}));
 return {id:`screen:${r.id}`,name:'Gather',routePattern:'/',url:context.url,moments,sourceRefs,evaluations:findings.map((finding,index)=>({kind:'finding',id:`${r.id}:finding:${index}`,source:sourceRefs[0],...finding})),visits:[{id:`visit:${r.id}`,context,signals:moments,screenshots:sourceRefs}],...extra};
}
const build=(screens,extra={})=>buildExperienceFeedback({screens,projectId:'gather',projectName:'Gather',...extra});
const derived=(runId,index,extra={})=>({id:`feedback:${JSON.stringify([runId,'signal',index])}`,runId,kind:'benefit',summary:'Visible all-in pricing let Maya verify the room was within her $250 limit before choosing.',why:'The room list and recorded reaction both identify the $245 total.',citations:[{sourceId:'moment.reaction',exactQuote:'Willow is within my $250 limit.'}],sourceHash:'sha256-current-source',model:'Muse Wonder',promptVersion:'experience-feedback-v1',...extra});

test('derived headlines enrich all scoped moments without changing source records, valence, media, or journey links',()=>{
 const r=run(),s=screen(r,[{reaction:'Willow is within my $250 limit.',valence:'positive'},{reaction:'The field is focused.',valence:'neutral'}]),original=structuredClone(s);
 const first=derived('r',0),second=derived('r',1,{kind:'uncertainty',summary:'The total excluded equipment, leaving Maya unable to verify her budget.',why:'The recorded price did not say whether the projector was included.'});
 const result=build([s],{sourceRuns:[r],derivedFeedback:[first,second]});
 assert.equal(result.feedback.length,2);assert.equal(result.takeaways.length,2);assert.equal(result.takeaways[0].title,first.summary);assert.equal(result.takeaways[1].title,second.summary);assert.equal(result.takeaways[1].valence,'neutral');assert.equal(result.takeaways[1].tone,'neutral');assert.equal(result.takeaways[1].moment,s.moments[1]);assert.equal(result.takeaways[1].originalMs,1000);assert.equal(result.takeaways[0].reaction,'Willow is within my $250 limit.');assert.deepEqual(s,original);
});

test('derived routine records disappear from the feed while raw moments and their deep-link identities remain',()=>{
 const r=run(),s=screen(r,[{reaction:'Everything matches what I need.',valence:'positive'}]),record=derived('r',0,{kind:'routine',summary:'',why:'',citations:[]});
 const result=build([s],{sourceRuns:[r],derivedFeedback:[record]});
 assert.equal(result.takeaways.length,0);assert.equal(result.feedback.length,1);assert.equal(result.feedback[0].id,record.id);assert.equal(result.feedback[0].moment,s.moments[0]);assert.equal(result.pages[0].moments.length,1);
});

test('derived text cannot leak into another journey or add a row outside the selected source scope',()=>{
 const a=run('a'),b=run('b'),result=build([screen(a,[{reaction:'The total is within my budget.'}]),screen(b,[{reaction:'The total is within my budget.'}])],{sourceRuns:[a,b],derivedFeedback:[derived('a',0),derived('outside',0),derived('b',0,{runId:'a',summary:'Wrong journey'})]});
 assert.equal(result.feedback.length,2);assert.equal(result.takeaways.length,2);assert.equal(result.takeaways.find(row=>row.runId==='a').title,derived('a',0).summary);assert.equal(result.takeaways.find(row=>row.runId==='b').title,'The total is within my budget.');
});

test('all signals are retained without top-three or repeated-text truncation, with original sources untouched',()=>{
 const r=run(),s=screen(r,Array.from({length:8},(_,index)=>({observation:'The same screen remains visible.',reaction:`Reaction ${index}`}))),original=structuredClone(s);
 const result=build([s],{sourceRuns:[r]});
 assert.equal(result.feedback.length,8);assert.equal(result.feedback[7].reaction,'Reaction 7');assert.equal(result.pages.length,1);
 assert.equal(result.feedback[5].moment,s.moments[5]);assert.equal(result.feedback[5].journeySide.moments.length,8);assert.deepEqual(s,original);
});

test('all findings attach once to their exact cited moment, including multiple findings and informational findings',()=>{
 const findings=[{id:'price',title:'Late total',impact:'medium',type:'product',evidence_indices:[3,5]},{id:'input',title:'Lost input',impact:'low',type:'experience',evidence_indices:[5]},{id:'clear',title:'Clear room list',impact:'informational',type:'business',evidence_indices:[3]}],r=run('r',{findings}),s=screen(r,[{eventIndex:3,valence:'positive',observation:'Landing shows two available rooms.'},{eventIndex:5,valence:'negative',observation:'Review shows additional fees.'}],findings.map(({evidence_indices,...f})=>f));
 const {feedback,pages}=build([s],{sourceRuns:[r]});
 assert.equal(feedback.length,2);const review=feedback.find(row=>row.moment.eventIndex===5),landing=feedback.find(row=>row.moment.eventIndex===3);
 assert.deepEqual(review.findings.map(f=>f.id),['price','input']);assert.deepEqual(landing.findings.map(f=>f.id),['clear']);
 assert.deepEqual(review.types,['experience','product']);assert.equal(review.impact,'medium');assert.equal(review.observation,'Review shows additional fees.');
 assert.equal(pages.flatMap(page=>page.evaluations).length,3);assert.equal(review.findings[0].source.eventIndex,3);assert.equal(review.state.source.eventIndex,5);
});

test('informational findings retain the cited moment observation while the highest-impact problem title takes priority',()=>{
 const informational={id:'verified',title:'Verified reservation matches all requirements',impact:'informational',type:'product',evidence_indices:[3,5]},low={id:'minor',title:'Minor friction',impact:'low',type:'experience',evidence_indices:[3]},high={id:'blocker',title:'Budget total is hidden',impact:'high',type:'product',evidence_indices:[3]},r=run('r',{findings:[informational,low,high]}),signals=[{eventIndex:3,valence:'positive',observation:'Landing shows two available rooms.'},{eventIndex:5,valence:'positive',observation:'Confirmation screen shows the reservation.'}];
 const informationalOnly=build([screen(r,signals,[informational])],{sourceRuns:[r]}).feedback[0];
 assert.equal(informationalOnly.title,'Landing shows two available rooms.');assert.equal(informationalOnly.findings[0].title,'Verified reservation matches all requirements');
 const mixed=build([screen(r,signals,[informational,low,high])],{sourceRuns:[r]}).feedback[0];
 assert.equal(mixed.title,'Budget total is hidden');assert.equal(mixed.observation,'Landing shows two available rooms.');assert.equal(mixed.findings.length,3);
});

test('a finding with no eligible cited moment stays standalone with retrospective comment and exact media',()=>{
 const r=run('r',{findings:[{id:'late',runId:'r',evidence_indices:[11],personaComment:'Retrospectively, this was confusing.',observation:'The full amount appeared late.'}]}),source={runId:'r',eventIndex:11,originalMs:22597,screenshot:'/runs/r/11.png',video:'/runs/r/journey.webm'},s=screen(r,[{eventIndex:3,valence:'negative'}],[{id:'late',title:'Late price',impact:'medium',type:'product',source}]);
 const result=build([s],{sourceRuns:[r]}),finding=result.feedback.find(row=>row.kind==='finding');
 assert.equal(result.feedback.length,2);assert.equal(finding.moment,null);assert.equal(finding.source,source);assert.equal(finding.originalMs,22597);assert.equal(finding.reaction,'Retrospectively, this was confusing.');assert.equal(finding.valence,null);assert.equal(finding.tone,'unrated');assert.equal(finding.state.kind,'unknown');
});

test('Gather states become distinct pages on the same route and preserve exact per-page moments',()=>{
 const r=run(),s=screen(r,[{observation:'Landing shows two available rooms with 12 seats.'},{observation:'Meeting name field is focused and still shows the placeholder.'},{observation:'Review shows a $280 total.'},{observation:'Confirmation screen shows the reservation.'},{observation:'A button is visible.'}]);
 const {feedback,pages}=build([s],{sourceRuns:[r]});
 assert.deepEqual(new Set(pages.map(page=>page.name)),new Set(['Room selection','Room details','Review booking','Confirmation','Gather']));
 assert.equal(new Set(pages.map(page=>page.parentPageId)).size,1);assert.equal(new Set(feedback.map(row=>row.pageId)).size,5);
 for(const page of pages){assert.equal(page.moments.length,1);assert.equal(page.sourcePage.moments.length,5);assert.equal(page.feedbackIds.length,1);assert.equal(feedback.find(row=>row.pageId===page.id).moment,page.moments[0]);}
});

test('generic recorded states stay distinct while unclassified feedback keeps its route name',()=>{
 const r=run(),s=screen(r,[{state:'Payment review'},{state:'Receipt'},{observation:'Review shows a total.'}],[],{name:'Checkout',routePattern:'/checkout'});
 const {pages}=build([s],{projectId:'shop',projectName:'Shop',sourceRuns:[r]});
 assert.deepEqual(new Set(pages.map(page=>page.name)),new Set(['Payment review','Receipt','Checkout']));assert.equal(pages.find(page=>page.name==='Checkout').state.kind,'unknown');
});

test('personas, environments and repeated journeys remain distinct even when feedback text matches',()=>{
 const a=run('a'),b=run('b',{personaId:'alex',personaName:'Alex',environmentId:'production'}),c=run('c',{environmentId:'repaired'}),result=build([screen(a,[{}]),screen(b,[{}]),screen(c,[{}])],{sourceRuns:[a,b,c],environments:[{id:'production',name:'Production'},{id:'preview',name:'Preview'},{id:'repaired',name:'Repaired'}]});
 assert.equal(result.feedback.length,3);assert.deepEqual(new Set(result.feedback.map(row=>row.personaName)),new Set(['Maya','Alex']));assert.deepEqual(new Set(result.feedback.map(row=>row.environmentName)),new Set(['Preview','Production','Repaired']));
 assert.equal(result.pages[0].runIds.length,3);assert.equal(result.pages[0].personaIds.length,2);
});

test('duplicate source screens collapse only the same exact signal identity, not another reaction with equal text',()=>{
 const r=run(),s=screen(r,[{},{}]),duplicate={...s,id:'duplicate-screen',moments:[...s.moments],visits:[]};
 const result=build([s,duplicate],{sourceRuns:[r]});assert.equal(result.feedback.length,2);assert.equal(result.feedback[0].observation,result.feedback[1].observation);assert.notEqual(result.feedback[0].id,result.feedback[1].id);
});

test('only scoped source findings are enriched; external impact runs and unrecorded findings never appear',()=>{
 const r=run('r'),external=run('external'),full={...r,findings:[{id:'price',evidence_indices:[5],personaComment:'Recorded comment'},{id:'not-in-source',title:'Not in snapshot',evidence_indices:[3]}]},s=screen(r,[{eventIndex:3,valence:'positive'},{eventIndex:5,valence:'negative'}],[{id:'price',title:'Price',impact:'medium'}]),impact={id:'impact',report:{pairs:[{beforeRunId:'r',afterRunId:'external',before:full,after:external}]}};
 const live=build([s],{sourceRuns:[r],impacts:[impact]}),frozen=build([s],{sourceRuns:[r],impacts:[]});
 assert.deepEqual(new Set(live.feedback.map(row=>row.runId)),new Set(['r']));assert.equal(live.feedback.flatMap(row=>row.findings).length,1);
 assert.equal(live.feedback.find(row=>row.findings.length).moment.eventIndex,5);assert.equal(frozen.feedback.find(row=>row.findings.length).moment.eventIndex,3);
});

test('standalone evaluation-only runs and findings without titles are preserved without synthesizing reactions',()=>{
 const r=run(),source={runId:'r',eventIndex:7,originalMs:4000,screenshot:'/7.png'},s=screen(r,[],[{id:'f',type:'defect',impact:'high',source}],{visits:[],sourceRefs:[]});
 const {feedback,pages}=build([s],{sourceRuns:[r]});assert.equal(feedback.length,1);assert.equal(feedback[0].kind,'finding');assert.equal(feedback[0].title,'Untitled finding');assert.deepEqual(feedback[0].types,['broken']);assert.equal(feedback[0].reaction,'');assert.equal(feedback[0].personaId,'maya');assert.equal(pages[0].moments.length,0);
});

test('page and feedback IDs remain stable across source ordering and survive URL encoding',()=>{
 const a=run('a'),b=run('b'),sa=screen(a,[{state:'Review / confirm?'}]),sb=screen(b,[{state:'Review / confirm?'}]);
 const one=build([sa,sb],{sourceRuns:[a,b]}),two=build([sb,sa],{sourceRuns:[b,a]});
 assert.deepEqual(one.pages.map(page=>page.id),two.pages.map(page=>page.id));assert.deepEqual(one.feedback.map(row=>row.id),two.feedback.map(row=>row.id));assert.equal(decodeURIComponent(encodeURIComponent(one.pages[0].id)),one.pages[0].id);
});

test('display URLs omit credentials and query parameters while exact source URLs remain untouched',()=>{
 const r=run(),raw='https://reviewer:private-password@preview.test/checkout?session=private-token#review',source={runId:'r',eventIndex:11,originalMs:4000,screenUrl:raw},s=screen(r,[{screenUrl:raw}],[{id:'unlinked',title:'Review finding',source}],{url:raw,routePattern:'/checkout'}),original=structuredClone(s);
 const result=build([s],{sourceRuns:[r]});
 for(const row of result.feedback)assert.equal(row.pageUrl,'https://preview.test/checkout#review');
 for(const page of result.pages)assert.equal(page.pageUrl,'https://preview.test/checkout#review');
 assert.equal(result.feedback.find(row=>row.kind==='moment').moment.screenUrl,raw);assert.equal(result.feedback.find(row=>row.kind==='finding').source.screenUrl,raw);assert.deepEqual(s,original);
});

test('cross-route findings attach to the cited problem on its actual page without crossing journey or source scope',()=>{
 const r=run('r',{findings:[{id:'price',runId:'r',evidence_indices:[3,11]}]}),first=screen(r,[{eventIndex:3,signalIndex:0,valence:'positive',screenUrl:'https://preview.test/rooms'}],[{id:'price',title:'Full price appeared late',impact:'medium',type:'product'}],{id:'rooms',name:'Rooms',routePattern:'/rooms',visits:[]}),review=screen(r,[{id:'review-signal',eventIndex:11,signalIndex:1,originalMs:22597,valence:'negative',screenUrl:'https://preview.test/review',screenshot:'/runs/r/review.png'}],[],{id:'review',name:'Review',routePattern:'/review',visits:[]}),other=screen(run('other'),[{eventIndex:11,signalIndex:1,valence:'very_negative'}],[],{id:'other-review',name:'Review',routePattern:'/review',visits:[]}),original=structuredClone({r,first,review,other});
 for(const screens of [[first,review,other],[review,other,first]]){
  const result=build(screens,{projectId:'generic',sourceRuns:[r,run('other')]}),linked=result.feedback.find(row=>row.findings.some(f=>f.id==='price'));
  assert.equal(result.feedback.flatMap(row=>row.findings).length,1);assert.equal(linked.pageName,'Review');assert.equal(linked.pageUrl,'https://preview.test/review');assert.equal(linked.runId,'r');assert.equal(linked.originalMs,22597);assert.equal(linked.moment.screenshot,'/runs/r/review.png');
  assert.equal(linked.findings[0].source.eventIndex,3);assert.deepEqual(linked.journeySide.moments,[review.moments[0]]);
  const page=result.pages.find(page=>page.id===linked.pageId);assert.equal(page.evaluations[0].id,'price');assert.equal(page.sourcePage.evaluations.length,0);assert.equal(page.comparisonPage.evaluations.length,1);assert.equal(page.comparisonPage.evaluations[0].id,'price');assert.deepEqual(page.comparisonPage.evaluations[0].evidence_indices,[3,11]);assert.equal(page.comparisonPage.evaluations[0].source.eventIndex,3);assert.deepEqual(page.comparisonPage.moments,page.sourcePage.moments);
 }
 const narrower=build([first,other],{projectId:'generic',sourceRuns:[r,run('other')]}),scoped=narrower.feedback.find(row=>row.findings.length);
 assert.equal(scoped.pageName,'Rooms');assert.equal(scoped.runId,'r');assert.equal(scoped.moment.eventIndex,3);assert.deepEqual({r,first,review,other},original);
});

test('meaningful feed retains exact journey and environment while routine narration remains in details',()=>{
 const r=run('r',{name:'Book a room within budget'}),s=screen(r,[
  {eventIndex:3,valence:'positive',reaction:"I'll type the meeting name.",feedback:{kind:'routine',summary:'',why:''}},
  {eventIndex:5,valence:'negative',reaction:'My meeting name was erased, so I have to enter it again.',feedback:{kind:'friction',summary:'Changing rooms erased the meeting name.',why:'Maya had to enter her meeting details again.'}}
 ]),original=structuredClone({r,s});
 const result=build([s],{sourceRuns:[r],environments:[{id:'preview',name:'Staging'}]});
 assert.equal(result.feedback.length,2);assert.equal(result.takeaways.length,1);
 const item=result.takeaways[0];assert.equal(item.title,'Changing rooms erased the meeting name.');assert.equal(item.why,'Maya had to enter her meeting details again.');assert.equal(item.journeyName,'Book a room within budget');assert.equal(item.environmentName,'Staging');assert.equal(item.runId,'r');assert.equal(item.originalMs,1000);
 assert.equal(item.moment,s.moments[1]);assert.equal(item.journeySide.moments.length,2);assert.equal(item.journeySide.moments[0].reaction,"I'll type the meeting name.");assert.deepEqual({r,s},original);
});

test('a narrative-only page retains its journey context without creating experience feedback',()=>{
 const r=run(),s=screen(r,[{reaction:"I'll click Continue.",feedback:{kind:'routine',summary:'',why:''}}]);
 const result=build([s],{sourceRuns:[r]});assert.equal(result.feedback.length,1);assert.equal(result.takeaways.length,0);assert.equal(result.pages.length,1);assert.equal(result.pages[0].runIds[0],'r');assert.equal(result.feedback[0].journeyName,null);
});
