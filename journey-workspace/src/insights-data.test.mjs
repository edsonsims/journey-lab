import test from 'node:test';
import assert from 'node:assert/strict';
import {insightMomentHref,insightFindingHref,insightFiltersFromSearch,insightSearch,coverageSummaryText,experienceSampleText,frictionLabel,observedInventoryDraft,sourceContextLabel} from './insights-data.ts';

test('page identity prefers a curated name or a recorded title over its route',async()=>{
 const {screenDisplayIdentity}=await import('./insights-data.ts');
 assert.deepEqual(screenDisplayIdentity({name:'Room selection',routePattern:'/rooms',pageTitle:'Gather — rooms',sourceRefs:[{screenUrl:'https://gather.test/rooms?token=secret'}]},'Gather'),{name:'Room selection',url:'https://gather.test/rooms',nameSource:'curated'});
 assert.deepEqual(screenDisplayIdentity({name:'/rooms',routePattern:'/rooms',sourceRefs:[{pageTitle:'Find your kind of room',screenUrl:'https://gather.test/rooms'}]}),{name:'Find your kind of room',url:'https://gather.test/rooms',nameSource:'recorded'});
});
test('legacy page identity gives URLs a secondary role without inventing captured titles',async()=>{
 const {screenDisplayIdentity}=await import('./insights-data.ts');
 assert.deepEqual(screenDisplayIdentity({name:'/',routePattern:'/',contexts:[{context:{url:'http://127.0.0.1:4390/'}}]},'Gather'),{name:'Gather',url:'http://127.0.0.1:4390/',nameSource:'route'});
 assert.deepEqual(screenDisplayIdentity({name:'/account-settings.html',routePattern:'/account-settings.html'}),{name:'Account Settings',url:'/account-settings.html',nameSource:'route'});
 assert.doesNotThrow(()=>screenDisplayIdentity({name:'/%XX',routePattern:'/%XX'}));
});
test('experience pills count reaction signals separately from affected journeys and behaviors',async()=>{
 const {experienceCountPills}=await import('./insights-data.ts');
 const screen={counts:{signals:9,negativeSignals:3,negativeRuns:1,eligibleRuns:4,positiveSignals:4,unknownValence:1,observed:{repeatedActions:2,backtracks:1,blockedGoalRuns:1}},evaluations:[{kind:'finding',id:'one'},{kind:'finding',id:'one'},{kind:'review',id:'two'}]};
 const before=structuredClone(screen),pills=experienceCountPills(screen),at=key=>pills.find(item=>item.key===key);
 assert.equal(at('negative').count,3);assert.equal(at('negative').description,'3 negative signals across 1 of 4 eligible journeys');assert.equal(at('positive').count,4);assert.equal(at('neutral').count,1);assert.equal(at('unrated').count,1);assert.equal(at('findings').count,1);assert.equal(at('blocked').description,'1 blocked journeys');assert.equal(at('repeated').count,2);assert.deepEqual(screen,before);
});
test('zero observations do not become positive findings and unrated signals stay explicit',async()=>{
 const {experienceCountPills}=await import('./insights-data.ts');
 assert.deepEqual(experienceCountPills({counts:{signals:0,negativeSignals:0,positiveSignals:0,observed:{}}}),[]);
 assert.deepEqual(experienceCountPills({counts:{signals:2,unknownValence:2}}).map(item=>[item.key,item.count]),[['unrated',2]]);
});

test('both video modes use the exact original source clock, including zero',()=>{
  for(const mode of ['original','condensed']){const href=insightMomentHref('project','unused'===mode?{}:{runId:'run',originalMs:0,replayMs:150},mode),url=new URL(href,'http://local');assert.equal(url.searchParams.get('at'),'0');assert.equal(url.searchParams.get('mode'),mode);assert.equal(url.searchParams.get('tab'),'journey');}
  assert.equal(insightMomentHref('project',{runId:'run',originalMs:2450,replayMs:150},'condensed').includes('at=2450'),true);
  for(const originalMs of [null,undefined,-1,NaN,'0'])assert.equal(insightMomentHref('project',{runId:'run',originalMs}),null);
});
test('recording and finding links escape identities and never include raw screen URLs',()=>{
  const moment={runId:'run/one',originalMs:10,screenUrl:'https://app.test/?secret=hidden',findingIds:['finding/one']};
  assert.match(insightMomentHref('project/one',moment),/project%2Fone\/runs\/run%2Fone/);assert.doesNotMatch(insightMomentHref('project/one',moment),/secret|hidden/);assert.equal(insightFindingHref('p',moment),'/projects/p/findings/finding%2Fone');assert.equal(insightFindingHref('p',{findingIds:[]}),null);
});
test('filters round trip while retaining report and inventory selection',()=>{
  const input='?inventoryVersion=2&report=r1&personaId=mother&device=mobile&includeInvalidated=true';const filters=insightFiltersFromSearch(input);assert.equal(filters.personaId,'mother');assert.equal(filters.includeInvalidated,true);
  const next=new URLSearchParams(insightSearch(input,{...filters,personaId:'teacher',device:'',includeInvalidated:false}));assert.equal(next.get('inventoryVersion'),'2');assert.equal(next.get('report'),'r1');assert.equal(next.get('personaId'),'teacher');assert.equal(next.has('device'),false);assert.equal(next.has('includeInvalidated'),false);
});
test('unknown coverage and missing ratings never appear as complete or zero-friction',()=>{
  assert.equal(coverageSummaryText({summary:{observedScreens:4,visited:4}}),'4 observed screens · inventory not defined');
  assert.equal(coverageSummaryText({denominator:{screens:22},summary:{visited:14}}),'14 of 22 known in-scope screens visited');
  assert.equal(frictionLabel(0),'0 · None');assert.equal(frictionLabel(null),'Not recorded');assert.equal(frictionLabel(4),'Not recorded');
  assert.equal(experienceSampleText({counts:{negativeRuns:3,eligibleRuns:8,ratedRuns:5}}),'Negative signals in 3 of 8 eligible journeys · 5 with recorded valence');
});
test('observed inventory preparation remains partial and does not fabricate unseen coverage',()=>{
  const result={screens:[{id:'home',name:'Home',routePattern:'/',states:{visited:true},environmentIds:['env']},{id:'checkout',name:'Checkout',routePattern:'/checkout',states:{visited:false}}],sourceRuns:[{id:'recorded-run'}]},before=structuredClone(result),draft=observedInventoryDraft(result);
  assert.equal(draft.completeness,'partial');assert.equal(draft.screens.length,1);assert.equal(draft.source.reference,'Recorded journeys: recorded-run');assert.deepEqual(draft.screens[0].criteria,[]);assert.deepEqual(result,before);
});
test('context labels expose persona, environment and rubric versions without a realism score',()=>{
  const label=sourceContextLabel({personaName:'Parent',personaVersion:2,device:'mobile',environmentId:'staging',environmentVersion:3,rubricVersion:'v1'});assert.match(label,/persona v2/);assert.match(label,/environment v3/);assert.match(label,/v1/);assert.doesNotMatch(label,/%|realism/);
});

test('state authoring binds the exact frame including time zero and makes a blank state explicitly unknown',async()=>{
 const {screenStatePayload}=await import('./insights-data.ts'),source={runId:'run',eventIndex:0,originalMs:0,sourceHash:'frame-identity',state:'empty'},before=structuredClone(source);
 assert.deepEqual(screenStatePayload('p',source,' filled ',' Visible activity. ',2),{projectId:'p',runId:'run',eventIndex:0,sourceHash:'frame-identity',state:'filled',reason:'Visible activity.',expectedVersion:2});assert.equal(screenStatePayload('p',source,'  ','Cannot identify the content.',2).state,null);assert.deepEqual(source,before);
 for(const [frame,state,reason,version] of [[{...source,sourceHash:null},'empty','Reason',0],[source,'empty','',0],[source,'x'.repeat(301),'Reason',0],[source,'empty','Reason',-1]])assert.throws(()=>screenStatePayload('p',frame,state,reason,version));
});
test('compact screen context labels distinguish same-path environments and keep full build identity in detail',async()=>{
 const {screenContextSubtitle}=await import('./insights-data.ts'),environments=[{id:'a',name:'Preview'},{id:'b',name:'Staging'}];
 const first=screenContextSubtitle({contexts:[{context:{environmentId:'a',environmentVersion:1,build:{id:'source:123456789abcdef'},device:'mobile'}}]},environments),second=screenContextSubtitle({contexts:[{context:{environmentId:'b',environmentVersion:2,build:{id:'source:abcdef123456789'},device:'mobile'}}]},environments);
 assert.equal(first.label,'Preview · build 12345678');assert.equal(second.label,'Staging · build abcdef12');assert.match(first.title,/source:123456789abcdef/);assert.match(second.title,/b, v2/);
 assert.equal(screenContextSubtitle({contexts:[{context:{environmentId:'a',build:{id:'unknown'}}},{context:{environmentId:'b',build:{id:'source:abc'}}}]},environments).label,'2 environments · 2 builds · 2 contexts');assert.deepEqual(screenContextSubtitle({}),{label:'',title:''});
});

const comparisonFixture=({id='screen',runId='run',origin='https://preview.test',route='/rooms',personaId='maya',environmentId='preview',personaVersion=1,environmentVersion=1,build='one',state=null,valence='negative',originalMs=0}={})=>{
 const context={runId,personaId,personaName:personaId,personaVersion,environmentId,environmentVersion,build:{id:build},device:'desktop',viewport:{width:1440,height:900},state,rubricVersion:'v1',url:`${origin}${route}`};
 const source={runId,eventIndex:0,originalMs,video:`/runs/${runId}/journey.webm`,screenUrl:context.url};
 const moment={id:`${runId}:signal:0`,kind:'experience',...source,signalIndex:0,context,valence,aiFriction:valence==='negative'?2:0,reaction:`${personaId}'s recorded reaction`,findingIds:[`finding-${runId}`]};
 const evaluation={id:`finding-${runId}`,kind:'finding',source,expected:'Visible outcome',expectationSource:'Charter'};
 const visit={id:`${runId}:visit:0`,screenId:id,context,signals:[moment],screenshots:[source],actions:[],findings:[evaluation]};
 return {id,name:route,routePattern:route,states:{visited:true,evaluated:true},contexts:[{context}],visits:[visit],moments:[moment],sourceRefs:[source],evaluations:[evaluation]};
};
test('same route across deployment origins folds into one page with exact contextual evidence',async()=>{
 const {groupExperiencePages}=await import('./insights-data.ts');
 const screens=[comparisonFixture(),comparisonFixture({id:'after',runId:'after',origin:'https://candidate.test',environmentId:'candidate',valence:'positive',originalMs:2134})],before=structuredClone(screens);
 const [page]=groupExperiencePages(screens,'Gather');assert.equal(groupExperiencePages(screens).length,1);assert.equal(page.name,'Rooms');assert.equal(page.routePattern,'/rooms');assert.deepEqual(page.urls,['https://preview.test/rooms','https://candidate.test/rooms']);assert.equal(page.contexts.length,2);assert.equal(page.counts.eligibleRuns,2);assert.equal(page.counts.negativeSignals,1);assert.equal(page.counts.positiveSignals,1);
 const after=page.contexts.find(row=>row.context.environmentId==='candidate');assert.equal(after.moments[0].reaction,"maya's recorded reaction");assert.equal(after.moments[0].originalMs,2134);assert.equal(after.moments[0].video,'/runs/after/journey.webm');assert.match(insightMomentHref('gather',after.moments[0]),/at=2134/);assert.deepEqual(screens,before);
});
test('same labels never merge distinct paths or distinct recorded hash routes',async()=>{
 const {groupExperiencePages,experiencePageKey}=await import('./insights-data.ts');
 const screens=[{...comparisonFixture({id:'one',route:'/rooms'}),name:'Gather'},{...comparisonFixture({id:'two',route:'/booking'}),name:'Gather'},{...comparisonFixture({id:'three',route:'/#/rooms'}),name:'Gather'},{...comparisonFixture({id:'four',route:'/#/booking'}),name:'Gather'}];
 assert.equal(groupExperiencePages(screens).length,4);assert.notEqual(experiencePageKey(screens[2]),experiencePageKey(screens[3]));assert.equal(groupExperiencePages([{id:'unknown-a',name:'Same'},{id:'unknown-b',name:'Same'}]).length,2);assert.equal(groupExperiencePages([{name:'Same'},{name:'Same'}]).length,2);
});
test('duplicate source membership does not inflate signal finding journey or visit totals',async()=>{
 const {groupExperiencePages}=await import('./insights-data.ts');const source=comparisonFixture(),duplicate={...structuredClone(source),id:'second-definition'};
 const [page]=groupExperiencePages([source,duplicate,source]);assert.equal(page.counts.signals,1);assert.equal(page.counts.eligibleRuns,1);assert.equal(page.counts.exposures,1);assert.equal(page.counts.screenshots,1);assert.equal(page.evaluations.length,1);assert.equal(page.contexts.length,1);assert.equal(page.contexts[0].counts.signals,1);
});
test('different persona environment build state and device versions stay separate comparison rows',async()=>{
 const {groupExperiencePages}=await import('./insights-data.ts');
 const screens=[comparisonFixture({runId:'one'}),comparisonFixture({runId:'two',personaVersion:2}),comparisonFixture({runId:'three',environmentVersion:2}),comparisonFixture({runId:'four',build:'two'}),comparisonFixture({runId:'five',state:'empty'}),comparisonFixture({runId:'six',personaId:'alex'})];
 const mobile=comparisonFixture({runId:'seven'});mobile.visits[0].context.device='mobile';mobile.visits[0].context.viewport={width:390,height:844};screens.push(mobile);
 const [page]=groupExperiencePages(screens);assert.equal(page.contexts.length,7);assert.equal(new Set(page.contexts.map(row=>row.id)).size,7);assert.equal(page.counts.eligibleRuns,7);
});
test('same context combines journeys without treating two signals as two affected people',async()=>{
 const {groupExperiencePages}=await import('./insights-data.ts');const first=comparisonFixture({runId:'one'}),second=comparisonFixture({runId:'two'});
 first.moments.push({...first.moments[0],id:'one:signal:1',signalIndex:1,originalMs:500});first.visits[0].signals=first.moments;
 const [page]=groupExperiencePages([first,second]);assert.equal(page.contexts.length,1);assert.equal(page.contexts[0].counts.eligibleRuns,2);assert.equal(page.contexts[0].counts.negativeRuns,2);assert.equal(page.contexts[0].counts.negativeSignals,3);assert.deepEqual(page.counts.runIds,['one','two']);
});
test('empty inventory and source-less moments retain explicit unknowns without inventing time or positivity',async()=>{
 const {groupExperiencePages}=await import('./insights-data.ts');
 const [empty]=groupExperiencePages([{id:'inventory',name:'Room selection',routePattern:'/rooms',inInventory:true,states:{visited:false},moments:[],visits:[]}]);assert.equal(empty.counts.eligibleRuns,0);assert.equal(empty.counts.signals,0);assert.equal(empty.contexts.length,0);assert.equal(empty.status,'not_explored');
 const partial={id:'legacy',routePattern:'/rooms',moments:[{id:'legacy:signal:0',runId:'legacy',valence:null,originalMs:null,context:{personaId:'maya'}}]};const [page]=groupExperiencePages([partial]);assert.equal(page.counts.signals,1);assert.equal(page.counts.unknownValence,1);assert.equal(page.counts.exposures,0);assert.equal(insightMomentHref('p',page.moments[0]),null);assert.equal(page.contexts[0].counts.unknownValence,1);
});
test('known time zero is retained, low moments sort by severity and each link opens its own journey',async()=>{
 const {groupExperiencePages}=await import('./insights-data.ts');const a=comparisonFixture({runId:'a',originalMs:0}),b=comparisonFixture({runId:'b',originalMs:1750,valence:'very_negative'});const [page]=groupExperiencePages([a,b]);
 assert.equal(page.lowMoments[0].runId,'b');assert.equal(page.lowMoments[1].originalMs,0);assert.match(insightMomentHref('p',page.lowMoments[0]),/runs\/b\?tab=journey&at=1750/);assert.match(insightMomentHref('p',page.lowMoments[1]),/runs\/a\?tab=journey&at=0/);
});
test('route grouping strips query strings and credentials from displayed URLs without changing source records',async()=>{
 const {groupExperiencePages}=await import('./insights-data.ts');const item=comparisonFixture({origin:'https://user:password@preview.test',route:'/rooms/?token=secret'}),before=structuredClone(item);const [page]=groupExperiencePages([item]);assert.equal(page.routePattern,'/rooms');assert.doesNotMatch(page.urls.join(' '),/password|token|secret/);assert.deepEqual(item,before);
});
test('unknown provenance remains run-specific and different missions are not silently pooled',async()=>{
 const {groupExperiencePages}=await import('./insights-data.ts');
 for(const field of ['personaId','environmentId','build']){
  const first=comparisonFixture({runId:'one'}),second=comparisonFixture({runId:'two'});
  for(const screen of [first,second])screen.visits[0].context[field]=field==='build'?{id:'unknown'}:'unknown';
  assert.equal(groupExperiencePages([first,second])[0].contexts.length,2,field);
 }
 const first=comparisonFixture({runId:'one'}),second=comparisonFixture({runId:'two'});
 first.visits[0].context.charterId='buy';second.visits[0].context.charterId='evaluate';
 assert.equal(groupExperiencePages([first,second])[0].contexts.length,2);
});
test('retained moments without visits attribute only their exact frames and findings',async()=>{
 const {groupExperiencePages}=await import('./insights-data.ts');const screen=comparisonFixture();screen.visits=[];screen.evaluations.push({id:'other',kind:'finding',source:{runId:'different',eventIndex:0}});
 const [page]=groupExperiencePages([screen]),context=page.contexts[0];assert.deepEqual(context.urls,['https://preview.test/rooms']);assert.equal(context.sourceRefs.length,1);assert.deepEqual(context.evaluations.map(item=>item.id),['finding-run']);assert.equal(context.counts.exposures,0);assert.deepEqual(context.screenIds,['screen']);
});
