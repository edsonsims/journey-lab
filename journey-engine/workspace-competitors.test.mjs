import {retainedDatabasePath} from './retained-test-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {WorkspaceError} from './workspace-store.mjs';
import {createCompetitorsService,fetchPublicSource,extractPublicText,isPublicAddress,publicSourceUrl} from './workspace-competitors.mjs';

const publicDns=async()=>[{address:'8.8.8.8',family:4}],content='Activities run on screen. No printer is required for this activity.';
const page=async()=>({status:200,headers:{'content-type':'text/html; charset=utf-8'},body:Buffer.from(`<html><script>ignore controls</script><h1>Product</h1><p>${content}</p></html>`)});
function answer(request,override={}){const input=JSON.parse(request.input[0].content[0].text),claim={topic:'Activity format',text:'The vendor says an activity can run on screen.',kind:'vendor_assertion',confidence:.8,confidenceBasis:'Explicit statement in the supplied vendor source.',sources:[{sourceId:input.sources[0].sourceId,excerpt:content}],...override};return {id:'meta-fixture-response',status:'completed',usage:{input_tokens:20,output_tokens:30,total_tokens:50},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({claims:[claim]})}]}]};}
function setup(t,options={}){const db=new DatabaseSync(retainedDatabasePath('workspace-competitors')),calls=[];const store={db,requireProject:id=>{if(!['p','other'].includes(id))throw new WorkspaceError('Project not found.',404);},getRun:()=>null};const service=createCompetitorsService({store,resolveHost:publicDns,transport:page,requestMeta:async request=>{calls.push(request);return answer(request);},...options});t.after(async()=>{service.close();await service.waitForIdle();db.close();});const profile=service.saveProfile({projectId:'p',name:'Supplied competitor',productUrl:'https://vendor.example/',sourceUrls:['https://vendor.example/docs'],context:{product:'Competitor app',tier:'standard',region:'Canada',version:'2026'}});return {service,store,profile,calls};}

test('public-source URL and address policy rejects local, private, reserved and credential targets',()=>{
  for(const url of ['http://localhost/','http://127.0.0.1/','http://2130706433/','http://0x7f000001/','http://[::1]/','http://[::ffff:127.0.0.1]/','http://192.168.1.2/','http://169.254.169.254/','https://u:p@example.com/','file:///tmp/a','https://example.com:8888/','https://example.com/?token=secret'])assert.throws(()=>publicSourceUrl(url),undefined,url);
  for(const ip of ['10.1.2.3','100.64.1.1','172.31.255.1','192.0.2.4','198.18.1.1','224.0.0.1','fc00::1','fe80::1','2001:0db8::1','2001:0000::1','2002:7f00:1::','3fff::1'])assert.equal(isPublicAddress(ip),false,ip);
  assert.equal(isPublicAddress('8.8.8.8'),true);assert.equal(isPublicAddress('2606:4700:4700::1111'),true);assert.equal(publicSourceUrl('https://example.com/docs#section'),'https://example.com/docs');
});
test('DNS answers are all checked and the validated address is pinned into the network transport',async()=>{
  let network=0;await assert.rejects(()=>fetchPublicSource('https://example.com/',{resolveHost:async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}],transport:async()=>{network++;return page();}}),error=>error.code==='SOURCE_ADDRESS_DENIED');assert.equal(network,0);
  const seen=[];await fetchPublicSource('https://example.com/',{resolveHost:publicDns,transport:async options=>{seen.push(options);return page();}});assert.equal(seen[0].address,'8.8.8.8');assert.equal(seen[0].family,4);assert.equal(seen[0].url,'https://example.com/');assert(seen[0].signal instanceof AbortSignal);
});
test('redirects revalidate every target and cannot pivot into private networks',async()=>{
  const visited=[];await assert.rejects(()=>fetchPublicSource('https://example.com/',{resolveHost:publicDns,transport:async({url})=>{visited.push(url);return {status:302,headers:{location:'http://127.0.0.1/private'},body:Buffer.alloc(0)};}}),error=>error.code==='SOURCE_ADDRESS_DENIED');assert.equal(visited.length,1);
  let count=0;await assert.rejects(()=>fetchPublicSource('https://example.com/',{resolveHost:publicDns,transport:async()=>{count++;return {status:302,headers:{location:'/again'},body:Buffer.alloc(0)};}}),error=>error.code==='SOURCE_REDIRECT_LIMIT');assert.equal(count,5);
});
test('source snapshots retain actual hashes/time and readable text without scripts',async()=>{
  const source=await fetchPublicSource('https://vendor.example/docs',{resolveHost:publicDns,transport:page});assert.equal(source.kind,'public_document');assert.equal(source.url,'https://vendor.example/docs');assert(Number.isFinite(Date.parse(source.retrievedAt)));assert.match(source.contentHash,/^[a-f0-9]{64}$/);assert.equal(source.textHash,createHash('sha256').update(source.text).digest('hex'));assert.doesNotMatch(source.text,/ignore controls|<script/);assert(source.text.includes(content));
  assert.equal(extractPublicText('<style>hidden</style><p>One &amp; two &#x1F600;</p>'),'One & two 😀');
});
test('byte/type limits and stalled DNS/transport are finite failures',async()=>{
  await assert.rejects(()=>fetchPublicSource('https://example.com/',{resolveHost:publicDns,transport:async()=>({status:200,headers:{'content-type':'application/json'},body:'{}'})}),error=>error.code==='SOURCE_CONTENT_TYPE');
  await assert.rejects(()=>fetchPublicSource('https://example.com/',{resolveHost:publicDns,maxBytes:4,transport:page}),error=>error.code==='SOURCE_TOO_LARGE');
  await assert.rejects(()=>fetchPublicSource('https://example.com/',{resolveHost:()=>new Promise(()=>{}),timeoutMs:10}),error=>error.code==='SOURCE_TIMEOUT');
  await assert.rejects(()=>fetchPublicSource('https://example.com/',{resolveHost:publicDns,transport:()=>new Promise(()=>{}),timeoutMs:10}),error=>error.code==='SOURCE_TIMEOUT');
});
test('supplied competitor profiles version and archive without deleting past data',t=>{
  const {service,profile}=setup(t);const next=service.saveProfile({...profile,name:'Revised supplied name',expectedVersion:1},profile.id);assert.equal(next.version,2);assert.equal(service.getProfile('p',profile.id,1).name,'Supplied competitor');assert.equal(service.profileVersions('p',profile.id).length,2);
  assert.throws(()=>service.saveProfile({...profile,expectedVersion:1},profile.id),error=>error.code==='VERSION_CONFLICT');service.archiveProfile('p',profile.id,{expectedVersion:2});assert.equal(service.listProfiles('p').length,0);assert.equal(service.listProfiles('p',{includeArchived:true}).length,1);assert.equal(service.getProfile('p',profile.id,1).archived,false);assert.deepEqual(service.profileEvents('p',profile.id).map(event=>event.kind),['created','edited','archived']);assert.throws(()=>service.getProfile('other',profile.id),error=>error.status===404);
});
test('bounded Meta research stores exact sourced claims as unreviewed proposals',async t=>{
  const {service,profile,calls}=setup(t),job=service.startResearch({projectId:'p',competitorId:profile.id});await service.waitForIdle();const result=service.getJob('p',job.id);assert.equal(result.status,'completed');assert.equal(result.sourceIds.length,1);assert.equal(result.claimIds.length,1);assert.equal(result.receipt.usage.total_tokens,50);assert.equal(calls.length,1);assert.equal(calls[0].model,'muse-wonder-1.0');assert.equal(calls[0].text.format.type,'json_schema');assert.equal(calls[0].max_output_tokens,4096);
  const claim=service.getClaim('p',result.claimIds[0]);assert.equal(claim.reviewState,'unreviewed');assert.equal(claim.kind,'vendor_assertion');assert.equal(claim.sources[0].excerpt,content);assert.equal(claim.sources[0].source.text.includes(content),true);assert.equal(claim.authoritative,false);assert.equal(claim.freshness.status,'current');assert.match(claim.freshness.basis,/not a guarantee/);
});
test('hallucinated source IDs, excerpts and observed capabilities reject the whole proposal batch',async t=>{
  for(const override of [{sources:[{sourceId:'invented',excerpt:content}]},{sources:'invalid'},{kind:'observed_behavior'},{id:'model-controlled-id'}]){
    const {service,profile}=setup(t,{requestMeta:async request=>answer(request,override)}),job=service.startResearch({projectId:'p',competitorId:profile.id});await service.waitForIdle();assert.equal(service.getJob('p',job.id).status,'failed');assert.equal(service.listClaims('p').length,0);assert.equal(service.listSources('p').length,1);
  }
  const {service,profile}=setup(t,{requestMeta:async request=>{const input=JSON.parse(request.input[0].content[0].text);return answer(request,{sources:[{sourceId:input.sources[0].sourceId,excerpt:'This quotation never appeared.'}]});}});const job=service.startResearch({projectId:'p',competitorId:profile.id});await service.waitForIdle();assert.equal(service.getJob('p',job.id).error.code,'CLAIM_EXCERPT_MISMATCH');assert.equal(service.getJob('p',job.id).receipt.requestId,'meta-fixture-response');assert.equal(service.listClaims('p').length,0);
});
test('refresh appends claim/source revisions after human review and preserves old accepted text',async t=>{
  const {service,profile}=setup(t);const first=service.startResearch({projectId:'p',competitorId:profile.id});await service.waitForIdle();const original=service.getClaim('p',service.getJob('p',first.id).claimIds[0]);const reviewed=service.saveClaim({...original,text:'Human-reviewed wording of the vendor assertion.',reviewState:'verified',reviewReason:'Checked the exact quoted source.',expectedVersion:1},original.id);assert.equal(reviewed.version,2);
  const second=service.startResearch({projectId:'p',competitorId:profile.id});await service.waitForIdle();const latest=service.getClaim('p',original.id);assert.equal(latest.version,3);assert.equal(latest.reviewState,'unreviewed');assert.equal(service.claimVersions('p',original.id).find(claim=>claim.version===2).text,'Human-reviewed wording of the vendor assertion.');assert.equal(service.listSources('p').length,2);assert.deepEqual(service.getJob('p',second.id).claimIds,[original.id]);
});
test('manual claims need real captured excerpts and direct observations need recorded artifacts',async t=>{
  const {service}=setup(t),source=await service.captureSource({projectId:'p',url:'https://our-product.example/docs'}),base={projectId:'p',subject:'own',topic:'Activity format',text:'Our product has an on-screen path.',kind:'vendor_assertion',context:{product:'Our app',tier:'standard',region:'Canada',version:'2026'},confidence:.7,confidenceBasis:'First-party documentation.',sources:[{sourceId:source.id,excerpt:content}]};
  const claim=service.saveClaim(base);assert.equal(claim.subject,'own');assert.throws(()=>service.saveClaim({...base,sources:[{sourceId:source.id,excerpt:'fabricated'}]}),error=>error.code==='CLAIM_EXCERPT_MISMATCH');assert.throws(()=>service.saveClaim({...base,kind:'observed_behavior'}),/recorded journey/);assert.throws(()=>service.saveClaim({...base,projectId:'other'}),error=>error.status===404);
});
test('contradictions remain inspectable and comparisons expose context mismatches or missing evidence',async t=>{
  const {service,profile}=setup(t),source=await service.captureSource({projectId:'p',url:'https://vendor.example/docs'}),base={projectId:'p',topic:'Activity format',text:'A source-supported claim.',kind:'vendor_assertion',context:{product:'Product',tier:'standard',region:'Canada',version:'2026'},confidence:.8,confidenceBasis:'Explicit supplied source.',sources:[{sourceId:source.id,excerpt:content}],reviewState:'verified',reviewReason:'Reviewed the retained source excerpt.'};
  const own=service.saveClaim({...base,subject:'own'}),competitor=service.saveClaim({...base,subject:'competitor',competitorId:profile.id}),different=service.saveClaim({...base,subject:'competitor',competitorId:profile.id,context:{...base.context,tier:'enterprise'}});
  assert.equal(service.compareClaims({projectId:'p',ownClaimId:own.id,competitorClaimId:competitor.id}).state,'comparable');assert.equal(service.compareClaims({projectId:'p',ownClaimId:own.id,competitorClaimId:different.id}).state,'partial');const missing=service.compareClaims({projectId:'p',competitorClaimId:competitor.id});assert.equal(missing.state,'unknown');assert.match(missing.reasons.join(' '),/not absence of a capability/);assert.equal(missing.conclusion,null);
  const link=service.linkContradiction({projectId:'p',claimIds:[competitor.id,different.id],reason:'These descriptions conflict for the same scenario.'});assert.equal(service.getClaim('p',competitor.id).authoritative,false);service.resolveContradiction('p',link.id,{status:'resolved',reason:'The claims describe different tiers.'});assert.equal(service.getClaim('p',competitor.id).contradictions[0].history.length,1);assert.equal(service.getClaim('p',competitor.id).authoritative,true);
});
test('research cannot discover extra competitors or visit URLs outside the supplied profile',t=>{
  const {service,profile,calls}=setup(t);assert.throws(()=>service.startResearch({projectId:'p',competitorId:profile.id,urls:['https://other.example/']}),/Add source URLs/);assert.throws(()=>service.startResearch({projectId:'p',competitorId:'made-up'}),/not found/);assert.throws(()=>service.startResearch({projectId:'p',competitorId:profile.id,urls:Array(6).fill(profile.productUrl)}),/one to five/);assert.equal(calls.length,0);
});
test('cancel and timeout retain captured sources, keep claims absent, and release the active job slot',async t=>{
  let entered;const started=new Promise(resolve=>entered=resolve);const {service,profile}=setup(t,{requestMeta:async()=>{entered();return new Promise(()=>{});}});const job=service.startResearch({projectId:'p',competitorId:profile.id});await started;assert.throws(()=>service.startResearch({projectId:'p',competitorId:profile.id}),error=>error.code==='RESEARCH_BUSY');service.cancelResearch('p',job.id);await service.waitForIdle();assert.equal(service.getJob('p',job.id).status,'cancelled');assert.equal(service.listSources('p').length,1);assert.equal(service.listClaims('p').length,0);
  const timed=setup(t,{jobTimeoutMs:10,requestMeta:()=>new Promise(()=>{})});const attempt=timed.service.startResearch({projectId:'p',competitorId:timed.profile.id});await timed.service.waitForIdle();assert.equal(timed.service.getJob('p',attempt.id).error.code,'RESEARCH_TIMEOUT');
});
test('restart marks persisted active research interrupted without launching work',t=>{
  const {service,store}=setup(t),record={id:'interrupted-job',projectId:'p',status:'researching',sourceIds:[],claimIds:[],createdAt:new Date().toISOString()};store.db.prepare('INSERT INTO competitor_jobs VALUES(?,?,?,?)').run(record.id,'p',JSON.stringify(record),record.createdAt);let called=false;const restored=createCompetitorsService({store,requestMeta:()=>{called=true;}});assert.equal(restored.getJob('p',record.id).status,'interrupted');assert.equal(called,false);assert.equal(service.getJob('p',record.id).error.code,'RESTART_INTERRUPTED');
});
test('matching contexts cannot hide different topics, stale sources or disputed claim reviews',async t=>{
  const {service,profile,store}=setup(t),source=await service.captureSource({projectId:'p',url:'https://vendor.example/docs'}),base={projectId:'p',topic:'Activity format',text:'A documented format.',kind:'vendor_assertion',confidence:.8,confidenceBasis:'Exact document text.',sources:[{sourceId:source.id,excerpt:content}],context:{tier:'standard',region:'Canada',version:'2026'},reviewState:'verified',reviewReason:'Reviewed the retained source.'};
  const own=service.saveClaim({...base,subject:'own'}),other=service.saveClaim({...base,subject:'competitor',competitorId:profile.id,topic:'Data export'});
  const mismatch=service.compareClaims({projectId:'p',ownClaimId:own.id,competitorClaimId:other.id});assert.equal(mismatch.state,'partial');assert(mismatch.differences.some(value=>value.field==='topic'));
  service.saveClaim({projectId:'p',topic:'Activity format'},other.id);const oldSource={...source,retrievedAt:'2020-01-01T00:00:00Z'};store.db.prepare('UPDATE competitor_sources SET data=? WHERE id=?').run(JSON.stringify(oldSource),source.id);
  const stale=service.compareClaims({projectId:'p',ownClaimId:own.id,competitorClaimId:other.id});assert.equal(stale.state,'partial');assert.match(stale.reasons.join(' '),/stale/);assert.equal(stale.evidenceQuality[0].confidence,.8);
  service.saveClaim({projectId:'p',reviewState:'rejected',reviewReason:'Source does not establish this interpretation.'},other.id);assert.equal(service.compareClaims({projectId:'p',ownClaimId:own.id,competitorClaimId:other.id}).state,'unknown');
});
test('a recording from our app cannot establish observed competitor capabilities',t=>{
  const {service,profile,store}=setup(t);store.getRun=()=>({id:'r',projectId:'p',events:[{index:0,type:'screenshot',screenshot:'/runs/r/frame.png',url:'https://our-product.example/',label:'An on-screen activity is visible.',videoMs:0}],experience:[]});
  const source=service.attachRunSource({projectId:'p',runId:'r',eventIndex:0});assert.equal(source.targetOrigin,'https://our-product.example');
  const base={projectId:'p',subject:'competitor',competitorId:profile.id,topic:'Activity format',text:'Observed on-screen activity.',kind:'observed_behavior',confidence:.8,confidenceBasis:'Recorded screenshot.',sources:[{sourceId:source.id,excerpt:source.text}]};
  assert.throws(()=>service.saveClaim(base),/competitor origin/);assert.equal(service.saveClaim({...base,subject:'own'}).kind,'observed_behavior');
});
