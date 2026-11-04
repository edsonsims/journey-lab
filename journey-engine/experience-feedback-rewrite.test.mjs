import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {retainedDatabasePath} from './retained-test-fixtures.mjs';
import {WorkspaceError} from './workspace-store.mjs';
import {buildFeedbackBundles,parseFeedbackResponse,createFeedbackRewriteService,FEEDBACK_MODEL,FEEDBACK_PROMPT_VERSION} from './experience-feedback-rewrite.mjs';
import {createInsightsService} from './workspace-insights.mjs';

function recorded(id='r',overrides={}){return {id,projectId:'p',status:'finished',createdAt:'2026-11-01',integrityStatus:'recorded',personaId:'maya',personaSnapshot:{name:'Maya',goal:'Book a room for 12 people under $200',constraints:'Needs 12 seats and a projector.'},charterSnapshot:{mission:'Compare a room against the saved requirements.'},events:[
 {index:0,type:'screenshot',url:'https://product.test/rooms?token=private',screenshot:`/runs/${id}/0.png`,videoMs:100},
 {index:1,type:'action_rejected',action:{type:'click_control',label:'Nonexistent control'},message:'No matching visible control; no click was executed.'},
 {index:2,type:'screenshot',url:'https://product.test/rooms',screenshot:`/runs/${id}/2.png`,videoMs:200},
 {index:3,type:'action',action:{type:'click_control',label:'Book'},click:{target:{label:'Book',tag:'button'}}},
 {index:4,type:'screenshot',url:'https://product.test/confirmed',screenshot:`/runs/${id}/4.png`,videoMs:300},
 ],experience:[
 {eventIndex:0,actionEventIndex:1,observation:'The room has 12 seats and costs $150.',reaction:'It fits my 12 attendees and stays under my $200 budget.',valence:'positive'},
 {eventIndex:2,actionEventIndex:3,observation:'The rooms screen is unchanged.',reaction:'The label click did not work, so I will try Book.',valence:'negative'},
 {eventIndex:4,observation:'Reservation confirmed for 12 seats.',reaction:'The confirmation keeps my requirements visible.'},
 ],findings:[{id:`f-${id}`,title:'Booking confirmed with requirements intact',observation:'Confirmation retains 12 seats.',personaComment:'My room is booked.',eventIndex:0,evidence_indices:[0,4],impact:'info'}],...overrides};}
function rewritten(item){const source=item.sources.find(source=>source.sourceId==='moment.observation'||source.sourceId==='finding.observation');return {id:item.id,kind:'benefit',summary:'Visible seating and price let Maya check the room against her group size and budget.',why:source.text,citations:[{sourceId:source.sourceId,exactQuote:source.text}]};}
const response=items=>({id:'meta-feedback-test',status:'completed',usage:{input_tokens:100,output_tokens:80,total_tokens:180},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({feedback:items})}]}]});
function setup(t,options={}){const db=new DatabaseSync(retainedDatabasePath('experience-feedback-rewrite'));db.exec('CREATE TABLE runs(id TEXT PRIMARY KEY,project_id TEXT,created_at TEXT)');const runs=new Map(),calls=[];const store={db,requireProject:projectId=>{if(!['p','other'].includes(projectId))throw new WorkspaceError('Unknown project.',404);},getRun:id=>runs.has(id)?structuredClone(runs.get(id)):null};const put=run=>{runs.set(run.id,structuredClone(run));db.prepare('INSERT OR REPLACE INTO runs VALUES(?,?,?)').run(run.id,run.projectId,run.createdAt);};const requestMeta=async body=>{calls.push(body);const items=JSON.parse(body.input[0].content[0].text).items;return options.requestMeta?options.requestMeta(body,items,{runs,put}):response(items.map(rewritten));};const service=createFeedbackRewriteService({store,requestMeta,configured:options.configured||(()=>true)});t.after(()=>db.close());return {db,store,runs,put,service,calls};}

test('moment bundles preserve original snapshots and exclude future actions, reactions and findings',()=>{
 const run=recorded(),original=structuredClone(run),bundles=buildFeedbackBundles(run),first=bundles[0];
 assert.equal(first.id,'feedback:["r","signal",0]');assert.equal(first.source.originalMs,100);assert.equal(first.source.screenUrl,'https://product.test/rooms');
 assert.equal(first.sources.some(source=>source.sourceId==='persona.goal'),true);
 assert.equal(first.sources.some(source=>source.sourceId.startsWith('action.')||source.sourceId.startsWith('finding.')||source.text.includes('Reservation confirmed')),false);
 assert.match(bundles[1].sources.find(source=>source.sourceId==='action.1.result').text,/Not executed/);
 assert.equal(bundles[1].sources.some(source=>source.sourceId==='action.3.result'),false);
 assert.equal(bundles.at(-1).sourceType,'finding');assert.equal(bundles.at(-1).id,'feedback:["r","finding","f-r"]');assert.deepEqual(run,original);
});
test('legacy action-bound moments use their preceding valid frame and orphan/foreign frames are excluded',()=>{
 const run=recorded();run.experience=[{actionEventIndex:3,reaction:'The price is above my budget.'},{eventIndex:99,reaction:'Unbound'},{eventIndex:5,reaction:'Foreign'}];run.events.push({index:5,type:'screenshot',url:'https://product.test/',screenshot:'/runs/other/image.png'});
 const bundles=buildFeedbackBundles(run).filter(item=>item.sourceType==='moment');assert.equal(bundles.length,1);assert.equal(bundles[0].eventIndex,2);
});
test('all terminal observations are eligible but live, invalidated and experimental sources are not',()=>{
 for(const status of ['finished','completed','blocked','incomplete','failed','cancelled'])assert.ok(buildFeedbackBundles(recorded('r',{status})).length,status);
 for(const status of ['queued','running','finalizing','cancelling','invalidated'])assert.equal(buildFeedbackBundles(recorded('r',{status})).length,0,status);
 for(const flag of ['experimental','experimentalStudyId','calibrationStudyId','calibrationTrialId','experimentalCandidateId'])assert.equal(buildFeedbackBundles(recorded('r',{[flag]:true})).length,0);
 assert.equal(buildFeedbackBundles(recorded('r',{integrityStatus:'invalidated'})).length,0);
});
test('response validation rejects cross-item quotes, duplicate IDs, missing current evidence and invented routine content',()=>{
 const bundles=buildFeedbackBundles(recorded()).slice(0,2),good=bundles.map(rewritten);
 assert.equal(parseFeedbackResponse(response(good),bundles).length,2);
 const cross=structuredClone(good);cross[0].citations[0].exactQuote=bundles[1].sources.find(source=>source.sourceId==='moment.observation').text;
 assert.throws(()=>parseFeedbackResponse(response(cross),bundles),error=>error.code==='FEEDBACK_INVALID_CITATION');
 assert.throws(()=>parseFeedbackResponse(response([good[0],good[0]]),bundles),error=>error.code==='FEEDBACK_INVALID_RESPONSE');
 const contextOnly=structuredClone(good);contextOnly[0].citations=[{sourceId:'persona.goal',exactQuote:'Book a room for 12 people under $200'}];
 assert.throws(()=>parseFeedbackResponse(response(contextOnly),bundles),error=>error.code==='FEEDBACK_INVALID_CITATION');
 const routine={id:good[0].id,kind:'routine',summary:'',why:'',citations:[]};assert.equal(parseFeedbackResponse(response([routine]),bundles.slice(0,1))[0].kind,'routine');
 assert.throws(()=>parseFeedbackResponse(response([{...routine,summary:'Looks great.'}]),bundles.slice(0,1)),error=>error.code==='FEEDBACK_INVALID_RESPONSE');
 assert.throws(()=>parseFeedbackResponse({...response(good),status:'incomplete'},bundles),error=>error.code==='FEEDBACK_INVALID_RESPONSE');
});
test('bounded batches persist derived versions and receipts while cache reuse makes no new Meta call',async t=>{
 const {service,put,runs,calls,db}=setup(t);put(recorded());const before=structuredClone(runs.get('r'));
 const first=await service.rewrite({projectId:'p',maxItems:2});assert.deepEqual([first.processed,first.cached,first.pending,first.total],[2,0,2,4]);
 const second=await service.rewrite({projectId:'p',maxItems:2});assert.deepEqual([second.processed,second.cached,second.pending],[2,2,0]);
 const third=await service.rewrite({projectId:'p',maxItems:12});assert.equal(third.processed,0);assert.equal(third.cached,4);assert.equal(calls.length,2);
 assert.equal(calls[0].model,FEEDBACK_MODEL);assert.equal(calls[0].store,false);assert.match(calls[0].instructions,/Driver rejection means no action executed/);
 assert.match(calls[0].instructions,/coordinate click with an unknown actual target does not prove/);assert.match(calls[0].instructions,/Keep target-ambiguous complaints routine unless independent recorded product evidence/);
 assert.deepEqual(calls[0].text.format.schema.properties.feedback.items.properties.id.enum,first.derivedFeedback.map(item=>item.id));assert.equal(calls[0].text.format.schema.properties.feedback.minItems,2);assert.equal(calls[0].text.format.schema.properties.feedback.maxItems,2);
 assert.equal(first.derivedFeedback[0].promptVersion,FEEDBACK_PROMPT_VERSION);assert.equal(first.derivedFeedback[0].provenance.requestId,'meta-feedback-test');assert.equal(first.receipt.usage.total_tokens,180);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM insight_feedback_versions').get().n,4);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM insight_feedback_batches').get().n,2);assert.deepEqual(runs.get('r'),before);
 await assert.rejects(service.rewrite({projectId:'p',maxItems:13}),error=>error.code==='FEEDBACK_BATCH_LIMIT');assert.equal(calls.length,2);
});
test('current hashes invalidate only dependent records and retain prior derived versions',async t=>{
 const {service,put,runs,db}=setup(t);put(recorded());await service.rewrite({projectId:'p'});const original=service.listCurrent({projectId:'p'});
 runs.get('r').personaSnapshot.goal='Book for 16 people under $250';assert.equal(service.listCurrent({projectId:'p'}).length,0);
 await service.rewrite({projectId:'p'});const current=service.listCurrent({projectId:'p'});assert.equal(current.length,4);assert.ok(current.every(item=>item.version===2));assert.notEqual(current[0].sourceHash,original[0].sourceHash);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM insight_feedback_versions').get().n,8);
 runs.get('r').integrityStatus='invalidated';assert.equal(service.listCurrent({projectId:'p'}).length,0);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM insight_feedback_versions').get().n,8);
});
test('editorial corrections append source-bound versions without replacing the generated feedback or citations',async t=>{
 const {service,put,db,runs,calls}=setup(t);put(recorded());await service.rewrite({projectId:'p'});
 const original=service.listCurrent({projectId:'p'})[0],stored=db.prepare('SELECT data FROM insight_feedback_versions WHERE anchor=?').get(original.id).data;
 const first=service.correct({projectId:'p',id:original.id,sourceHash:original.sourceHash,why:'The recorded room has 12 seats and costs $150.',reason:'Remove an unrelated generation artifact.'});
 assert.equal(first.why,'The recorded room has 12 seats and costs $150.');assert.equal(first.summary,original.summary);assert.deepEqual(first.citations,original.citations);assert.equal(first.provenance.editorial.version,1);assert.equal(calls.length,1);
 const second=service.correct({projectId:'p',id:original.id,sourceHash:original.sourceHash,summary:'Visible seating and price let Maya compare the room with her budget and group size.',why:first.why,reason:'Tighten the same evidence-grounded explanation.'});
 assert.equal(second.provenance.editorial.version,2);assert.equal(service.listCurrent({projectId:'p'})[0].summary,second.summary);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM insight_feedback_corrections').get().n,2);assert.equal(db.prepare('SELECT data FROM insight_feedback_versions WHERE anchor=?').get(original.id).data,stored);
 assert.throws(()=>service.correct({projectId:'other',id:original.id,sourceHash:original.sourceHash,why:first.why,reason:'Wrong project.'}),error=>error.code==='FEEDBACK_SOURCE_CHANGED');
 runs.get('r').experience[0].reaction='Updated source reaction.';assert.equal(service.listCurrent({projectId:'p'}).some(item=>item.id===original.id),false);
 assert.throws(()=>service.correct({projectId:'p',id:original.id,sourceHash:original.sourceHash,why:first.why,reason:'Stale source.'}),error=>error.code==='FEEDBACK_SOURCE_CHANGED');
 await service.rewrite({projectId:'p'});const fresh=service.listCurrent({projectId:'p'}).find(item=>item.id===original.id);assert.equal(fresh.provenance.editorial,undefined);assert.notEqual(fresh.sourceHash,original.sourceHash);
});
test('source changes during a model request reject the whole batch without rewriting recorded evidence',async t=>{
 const {service,put,db}=setup(t,{requestMeta:async(_body,items,{runs})=>{runs.get('r').experience[0].reaction='The stored reaction changed.';return response(items.map(rewritten));}});put(recorded());
 await assert.rejects(service.rewrite({projectId:'p'}),error=>error.code==='FEEDBACK_SOURCE_CHANGED');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM insight_feedback_versions').get().n,0);
 const batch=JSON.parse(db.prepare('SELECT data FROM insight_feedback_batches').get().data);assert.equal(batch.status,'failed');assert.equal(batch.receipt.requestId,'meta-feedback-test');
});
test('editorial routine classification hides unsupported takeaways without deleting the generation or source reaction',async t=>{
 const {service,put,runs,db,calls}=setup(t);put(recorded());await service.rewrite({projectId:'p'});
 const before=structuredClone(runs.get('r')),original=service.listCurrent({projectId:'p'})[1],generated=db.prepare('SELECT data FROM insight_feedback_versions WHERE anchor=?').get(original.id).data;
 const correction=service.correct({projectId:'p',id:original.id,sourceHash:original.sourceHash,kind:'routine',summary:'',why:'',reason:'The preceding action was rejected by the driver; it does not establish product friction.'});
 assert.equal(correction.kind,'routine');assert.equal(correction.summary,'');assert.equal(correction.why,'');assert.deepEqual(correction.citations,[]);assert.equal(correction.provenance.editorial.version,1);
 assert.equal(service.listCurrent({projectId:'p'}).find(item=>item.id===original.id).kind,'routine');assert.equal(db.prepare('SELECT data FROM insight_feedback_versions WHERE anchor=?').get(original.id).data,generated);assert.deepEqual(runs.get('r'),before);assert.equal(calls.length,1);
 assert.throws(()=>service.correct({projectId:'p',id:original.id,sourceHash:original.sourceHash,kind:'routine',summary:'Not empty',why:'',reason:'Invalid routine wording.'}),error=>error.code==='FEEDBACK_CORRECTION_INVALID');
 assert.throws(()=>service.correct({projectId:'p',id:original.id,sourceHash:original.sourceHash,kind:'made_up',summary:'',why:'',reason:'Invalid classification.'}),error=>error.code==='FEEDBACK_CORRECTION_INVALID');
 const restored=service.correct({projectId:'p',id:original.id,sourceHash:original.sourceHash,kind:original.kind,summary:original.summary,why:original.why,reason:'Fixture: exercise a sourced meaningful classification.'});assert.deepEqual(restored.citations,original.citations);assert.equal(restored.provenance.editorial.version,2);
});
test('requests are scoped to the project and serialized so concurrent callers reuse the cache',async t=>{
 const {service,put,calls}=setup(t);put(recorded());put(recorded('other',{projectId:'other'}));
 await assert.rejects(service.rewrite({projectId:'p',runId:'other'}),error=>error.code==='RUN_NOT_FOUND');assert.equal(calls.length,0);
 await Promise.all([service.rewrite({projectId:'p'}),service.rewrite({projectId:'p'})]);assert.equal(calls.length,1);assert.equal(service.listCurrent({projectId:'p',runIds:['other']}).length,0);
});
test('independent run rewrites share at most three slots while overlapping project work waits',async t=>{
 let running=0,maximum=0;const releases=[];
 const {service,put,calls}=setup(t,{requestMeta:async(_body,items)=>{running++;maximum=Math.max(maximum,running);await new Promise(resolve=>releases.push(resolve));running--;return response(items.map(rewritten));}});
 for(const id of ['a','b','c','d'])put(recorded(id));
 const jobs=['a','b','c','d'].map(runId=>service.rewrite({projectId:'p',runId}));
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,3);assert.equal(maximum,3);
 releases.splice(0).forEach(release=>release());await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,4);releases.splice(0).forEach(release=>release());await Promise.all(jobs);
 assert.equal(maximum,3);assert.equal(service.status({projectId:'p'}).pending,0);
 // New sources invalidate a run but a whole-project request may not duplicate
 // the scoped request currently processing that source.
 put(recorded('a',{personaSnapshot:{name:'Maya',goal:'Changed goal'}}));
 const scoped=service.rewrite({projectId:'p',runId:'a'}),wide=service.rewrite({projectId:'p'}),same=service.rewrite({projectId:'p',runId:'a'});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,5);releases.splice(0).forEach(release=>release());await Promise.all([scoped,wide,same]);assert.equal(calls.length,5);
});
test('routine classification remains cached and leaves the recorded persona reaction intact',async t=>{
 const {service,put,runs}=setup(t,{requestMeta:async(_body,items)=>response(items.map(item=>({id:item.id,kind:'routine',summary:'',why:'',citations:[]})))});put(recorded());const before=structuredClone(runs.get('r'));
 await service.rewrite({projectId:'p'});assert.ok(service.listCurrent({projectId:'p'}).every(item=>item.kind==='routine'));assert.equal(service.status({projectId:'p'}).pending,0);assert.deepEqual(runs.get('r'),before);
});
test('projection respects persona filters and frozen reports keep the derived versions they saved',async t=>{
 const {store,service,put}=setup(t);put(recorded());put(recorded('alex',{personaId:'alex'}));await service.rewrite({projectId:'p'});
 const insights=createInsightsService({store,feedback:service});const result=insights.experience({projectId:'p',filters:{personaId:'maya'}});assert.equal(result.derivedFeedback.length,4);assert.ok(result.derivedFeedback.every(item=>item.runId==='r'));
 const report=insights.saveReport({projectId:'p',kind:'experience',name:'Saved experience'});assert.equal(report.snapshot.derivedFeedback.length,8);
 put(recorded('r',{personaSnapshot:{name:'Maya',goal:'New goal'}}));await service.rewrite({projectId:'p'});assert.deepEqual(insights.getReport('p',report.id),report);
});
test('live projection exposes only actual scoped queued/active work and frozen reports never poll',async t=>{
 let release;const {store,service,put}=setup(t,{requestMeta:async(_body,items)=>{await new Promise(resolve=>{release=resolve;});return response(items.map(rewritten));}});put(recorded());put(recorded('alex',{personaId:'alex'}));
 const insights=createInsightsService({store,feedback:service});assert.equal(insights.experience({projectId:'p'}).feedbackProcessing,false);
 const job=service.scheduleRun('p','r');
 // Admission marks work before the async request starts, so a completion fetch
 // sees the processing flag even during the first microtask of scheduled work.
 assert.equal(service.processing({projectId:'p',runIds:['r']}),true);assert.equal(service.processing({projectId:'p',runIds:['alex']}),false);
 assert.equal(insights.experience({projectId:'p',filters:{personaId:'maya'}}).feedbackProcessing,true);assert.equal(insights.experience({projectId:'p',filters:{personaId:'alex'}}).feedbackProcessing,false);
 const report=insights.saveReport({projectId:'p',kind:'experience',name:'Snapshot during rewrite'});assert.equal(report.snapshot.feedbackProcessing,false);
 await new Promise(resolve=>setImmediate(resolve));release();await job;await new Promise(resolve=>setImmediate(resolve));
 assert.equal(insights.experience({projectId:'p'}).feedbackProcessing,false);assert.equal(service.status({projectId:'p'}).pending,4);assert.deepEqual(insights.getReport('p',report.id),report);
});
test('future run scheduling processes finite batches without touching the original run',async t=>{
 const {service,put,calls,runs}=setup(t);const run=recorded();run.findings=[];run.experience=Array.from({length:15},(_,index)=>({...run.experience[0],reaction:`I can compare the price for group ${index}.`}));put(run);const before=structuredClone(runs.get('r'));
 await service.scheduleRun('p','r');assert.equal(calls.length,3);assert.equal(service.status({projectId:'p'}).pending,0);assert.deepEqual(runs.get('r'),before);
});
test('automatic malformed replies get only one smaller retry and manual batches never retry',async t=>{
 let attempts=0;
 const {service,put,calls,db}=setup(t,{requestMeta:async(_body,items)=>++attempts===1?{...response([]),status:'incomplete'}:response(items.map(rewritten))});put(recorded());
 await service.scheduleRun('p','r');assert.deepEqual(calls.map(call=>JSON.parse(call.input[0].content[0].text).items.length),[4,3,1]);assert.equal(service.status({projectId:'p'}).pending,0);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM insight_feedback_batches').get().n,3);
 const alwaysBad=setup(t,{requestMeta:async()=>({...response([]),status:'incomplete'})});alwaysBad.put(recorded());
 await assert.rejects(alwaysBad.service.scheduleRun('p','r'),error=>error.code==='FEEDBACK_INVALID_RESPONSE');assert.equal(alwaysBad.calls.length,2);
 const manual=setup(t,{requestMeta:async()=>({...response([]),status:'incomplete'})});manual.put(recorded());await assert.rejects(manual.service.rewrite({projectId:'p'}),error=>error.code==='FEEDBACK_INVALID_RESPONSE');assert.equal(manual.calls.length,1);
});
test('provider errors are retained and never retried automatically; unavailable Meta cannot mutate sources',async t=>{
 const {service,put,calls,db}=setup(t,{requestMeta:async()=>{throw Error('provider failure');}});put(recorded());await assert.rejects(service.scheduleRun('p','r'),error=>error.code==='FEEDBACK_PROVIDER_ERROR');assert.equal(calls.length,1);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM insight_feedback_versions').get().n,0);assert.equal(JSON.parse(db.prepare('SELECT data FROM insight_feedback_batches').get().data).status,'failed');
 const disabled=setup(t,{configured:()=>false});disabled.put(recorded());await assert.rejects(disabled.service.rewrite({projectId:'p'}),error=>error.code==='META_UNAVAILABLE');assert.equal(disabled.calls.length,0);
});
