import {retainedDatabasePath} from './retained-test-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {WorkspaceError} from './workspace-store.mjs';
import {createWorkspaceCompetitorsApi} from './workspace-competitors-api.mjs';

const excerpt='The activity supports an on-screen mode.';
async function setup(t,options={}){
  const db=new DatabaseSync(retainedDatabasePath('workspace-competitors-api')),store={db,requireProject:id=>{if(!['p','other'].includes(id))throw new WorkspaceError('Unknown project.',404);},getRun:()=>null};
  let api;const server=http.createServer(async(req,res)=>{if(!await api.handle(req,res,new URL(req.url,'http://127.0.0.1'))){res.writeHead(404);res.end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port,origin=`http://127.0.0.1:${port}`;
  api=createWorkspaceCompetitorsApi({store,port,configured:()=>true,resolveHost:async()=>[{address:'8.8.8.8',family:4}],transport:async()=>({status:200,headers:{'content-type':'text/plain'},body:Buffer.from(excerpt)}),requestMeta:async request=>{const input=JSON.parse(request.input[0].content[0].text);return {status:'completed',output_text:JSON.stringify({claims:[{topic:'Activity format',text:'The vendor says activities run on screen.',kind:'vendor_assertion',confidence:.8,confidenceBasis:'Exact vendor wording.',sources:[{sourceId:input.sources[0].sourceId,excerpt}]}]})};},...options});
  t.after(async()=>{api.close();await api.service.waitForIdle();await new Promise(resolve=>server.close(resolve));db.close();});
  const request=async(path,{method='GET',body,requestOrigin=origin}={})=>{const response=await fetch(`${origin}/api/workspace/competitors${path}`,{method,headers:{origin:requestOrigin,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json()};};
  const profile={projectId:'p',name:'Team supplied product',productUrl:'https://vendor.example/',sourceUrls:['https://vendor.example/docs'],context:{tier:'standard',region:'Canada',version:'2026'}};return {api,store,request,profile};
}

test('profile HTTP lifecycle preserves version and archive audit history',async t=>{
  const {request,profile}=await setup(t);const created=await request('/profiles',{method:'POST',body:profile});assert.equal(created.status,201);const id=created.body.id;
  assert.equal((await request(`/profiles/${id}`,{method:'PATCH',body:{projectId:'p',name:'Edited name',expectedVersion:1}})).body.version,2);
  assert.equal((await request(`/profiles/${id}?projectId=p&version=1`)).body.name,profile.name);
  assert.equal((await request(`/profiles/${id}/versions?projectId=p`)).body.versions.length,2);
  assert.equal((await request(`/profiles/${id}/archive`,{method:'POST',body:{projectId:'p',expectedVersion:2}})).body.archived,true);
  assert.equal((await request('/profiles?projectId=p')).body.profiles.length,0);
  assert.equal((await request('/profiles?projectId=p&includeArchived=true')).body.profiles.length,1);
  assert.deepEqual((await request(`/profiles/${id}/events?projectId=p`)).body.events.map(event=>event.kind),['created','edited','archived']);
  assert.equal((await request(`/profiles/${id}?projectId=other`)).status,404);
  assert.equal((await request(`/profiles/${id}?projectId=p&version=zero`)).status,400);
});
test('project, origin, bounded request and keep-all guards apply before writes or fetches',async t=>{
  const {request,profile,store}=await setup(t);
  assert.equal((await request('/profiles')).body.code,'PROJECT_REQUIRED');
  assert.equal((await request('/profiles',{method:'POST',body:profile,requestOrigin:'https://foreign.example'})).body.code,'ORIGIN_DENIED');
  assert.equal((await request('/profiles?projectId=other',{method:'POST',body:profile})).body.code,'PROJECT_MISMATCH');
  assert.equal((await request('/profiles?projectId=p',{method:'DELETE'})).body.code,'KEEP_ALL');
  assert.equal((await request('/profiles',{method:'POST',body:[]})).status,400);
  assert.equal((await request('/profiles',{method:'POST',body:{...profile,description:'x'.repeat(262145)}})).status,413);
  assert.equal((await request('/sources/capture',{method:'POST',body:{projectId:'p',url:'http://127.0.0.1/'}})).status,400);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM competitor_profiles').get().n,0);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM competitor_sources').get().n,0);
});
test('research HTTP job uses supplied profile and retains sources, claims and receipt',async t=>{
  const {request,profile,api}=await setup(t),created=await request('/profiles',{method:'POST',body:profile});
  const started=await request(`/profiles/${created.body.id}/research`,{method:'POST',body:{projectId:'p',expectedVersion:1}});assert.equal(started.status,202);await api.service.waitForIdle();
  const job=(await request(`/jobs/${started.body.id}?projectId=p`)).body;assert.equal(job.status,'completed');assert.equal(job.receipt.provider,'Meta');assert.equal(job.limits.maxModelRequests,1);
  const claim=(await request(`/claims/${job.claimIds[0]}?projectId=p`)).body;assert.equal(claim.reviewState,'unreviewed');assert.equal(claim.sources[0].excerpt,excerpt);
  assert.equal((await request(`/sources/${job.sourceIds[0]}?projectId=p`)).body.text,excerpt);
  assert.equal((await request('/sources?projectId=p')).body.sources.length,1);assert.equal((await request('/jobs?projectId=p')).body.jobs.length,1);
  assert.equal((await request(`/jobs/${job.id}?projectId=other`)).status,404);
  assert.equal((await request(`/profiles/${created.body.id}/research`,{method:'POST',body:{projectId:'p',expectedVersion:0}})).body.code,'VERSION_CONFLICT');
});
test('manual sourced claims, review revisions, contradictions and comparison are scope checked',async t=>{
  const {request,profile}=await setup(t),created=(await request('/profiles',{method:'POST',body:profile})).body;
  const source=(await request('/sources/capture',{method:'POST',body:{projectId:'p',url:'https://vendor.example/docs'}})).body;
  const base={projectId:'p',topic:'Activity format',text:'An on-screen path is documented.',kind:'vendor_assertion',confidence:.8,confidenceBasis:'Direct quote.',sources:[{sourceId:source.id,excerpt}],context:profile.context,reviewState:'verified',reviewReason:'Reviewed the exact document excerpt.'};
  const own=(await request('/claims',{method:'POST',body:{...base,subject:'own'}})).body,competitor=(await request('/claims',{method:'POST',body:{...base,subject:'competitor',competitorId:created.id}})).body;
  assert.equal((await request(`/compare?projectId=p&ownClaimId=${own.id}&competitorClaimId=${competitor.id}`)).body.state,'comparable');
  const reviewed=await request(`/claims/${competitor.id}`,{method:'PATCH',body:{projectId:'p',reviewState:'disputed',reviewReason:'The document contradicts another statement.',expectedVersion:1}});assert.equal(reviewed.body.version,2);
  assert.equal((await request(`/claims/${competitor.id}/versions?projectId=p`)).body.versions.length,2);
  const comparison=await request('/compare',{method:'POST',body:{projectId:'p',ownClaimId:own.id,competitorClaimId:competitor.id}});assert.equal(comparison.body.state,'unknown');assert.match(comparison.body.reasons.join(' '),/disputed/);
  const contradiction=await request('/contradictions',{method:'POST',body:{projectId:'p',claimIds:[own.id,competitor.id],reason:'Different outcome stated.'}});assert.equal(contradiction.status,201);
  assert.equal((await request(`/contradictions/${contradiction.body.id}`,{method:'PATCH',body:{projectId:'p',status:'resolved',reason:'Different versions explain the difference.'}})).body.history.length,1);
  assert.equal((await request('/claims',{method:'POST',body:{...base,subject:'own',projectId:'other'}})).status,404);
});
test('unconfigured research is rejected without starting a retained job',async t=>{
  const {request,profile}=await setup(t,{configured:()=>false}),created=(await request('/profiles',{method:'POST',body:profile})).body;
  assert.equal((await request(`/profiles/${created.id}/research`,{method:'POST',body:{projectId:'p'}})).body.code,'META_UNAVAILABLE');assert.equal((await request('/jobs?projectId=p')).body.jobs.length,0);
});
