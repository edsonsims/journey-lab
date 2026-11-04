import {retainedFixture} from './retained-test-fixtures.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createImprovementsApi } from './improvements-api.mjs';
const root=retainedFixture('journey-improvement-api-');
const id='11111111-1111-4111-8111-111111111111', runId='22222222-2222-4222-8222-222222222222';
let release; const wait=new Promise(r=>release=r);let calls=0,verifications=0,receivedSupport=[];
const dir=join(root,id);const port=4398;
const api=createImprovementsApi({root,port,cliPath:process.execPath,configured:()=>true,
 prepare:async(sourceRunId,options)=>{receivedSupport=options.supportRunIds;calls++;await mkdir(join(dir,'candidate'),{recursive:true});const report={experimentId:id,sourceRunId,status:'prepared',createdAt:new Date().toISOString()};await writeFile(join(dir,'status.json'),JSON.stringify(report));return {base:dir,report}},
 execute:async(exp)=>{await wait;exp.report.status='awaiting_review';exp.report.changedFiles=['index.html'];await writeFile(join(dir,'candidate','index.html'),'<html><p>Only fixture</p></html>');await writeFile(join(dir,'candidate','IMPROVEMENT.md'),'Fixture summary');await writeFile(join(dir,'changes.patch'),'+fixture');await writeFile(join(dir,'status.json'),JSON.stringify(exp.report));return exp.report},
 verify:async()=>{verifications++;return {status:'passed'}}
});
const server=http.createServer(async(req,res)=>{const u=new URL(req.url,'http://127.0.0.1');if(!(await api.handle(req,res,u))){res.writeHead(404);res.end()}});
await new Promise(r=>server.listen(port,'127.0.0.1',r));const base=`http://127.0.0.1:${port}`;
after(async()=>{await new Promise(r=>server.close(r));});
test('invalid inputs do not start any job',async()=>{const r=await fetch(`${base}/api/improvements`,{method:'POST',body:JSON.stringify({runId:'../../evil',binary:'hack'})});assert.equal(r.status,400);assert.equal(calls,0)});
test('supporting journey IDs are bounded and validated',async()=>{for(const supportRunIds of [['../../bad'],Array(4).fill(runId),'invalid']){const r=await fetch(`${base}/api/improvements`,{method:'POST',body:JSON.stringify({runId,supportRunIds})});assert.equal(r.status,400);}assert.equal(calls,0)});
test('bounded job starts once and verifies without leaking environment',async()=>{const r=await fetch(`${base}/api/improvements`,{method:'POST',body:JSON.stringify({runId,supportRunIds:['33333333-3333-4333-8333-333333333333']})});assert.equal(r.status,202);assert.deepEqual(receivedSupport,['33333333-3333-4333-8333-333333333333']);assert.equal((await r.json()).id,id);const dupe=await fetch(`${base}/api/improvements`,{method:'POST',body:JSON.stringify({runId})});assert.equal(dupe.status,409);release();for(let n=0;n<100&&!verifications;n++)await new Promise(r=>setTimeout(r,5));assert.equal(verifications,1);const obj=await (await fetch(`${base}/api/improvements/${id}`)).json();assert.equal(obj.status,'awaiting_review');assert.equal(obj.runId,runId);assert.equal(obj.diff,'+fixture');assert.equal(obj.summary,'Fixture summary');assert.match(obj.previewUrl,/^http:\/\/localhost:4398\//);assert.equal(obj.candidate,undefined);});
test('candidate redirects to distinct origin and is served with a restrictive CSP',async()=>{const redirected=await fetch(`${base}/improvements/${id}/candidate/`,{redirect:'manual'});assert.equal(redirected.status,302);assert.match(redirected.headers.get('location'),/^http:\/\/localhost:4398\//);const page=await fetch(`${base}/improvements/${id}/candidate/index.html`,{headers:{host:'localhost:4398'}});assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/connect-src 'none'/);assert.match(await page.text(),/Only fixture/);assert.equal((await fetch(`${base}/improvements/${id}/candidate/run.json`)).status,404)});
test('job summaries cannot read through a candidate symlink',async()=>{const id2='33333333-3333-4333-8333-333333333333';const path=join(root,id2);await mkdir(path);await symlink('/tmp',join(path,'candidate'));await writeFile(join(path,'status.json'),JSON.stringify({experimentId:id2,status:'awaiting_review'}));const r=await fetch(`${base}/improvements/${id2}/candidate/index.html`);assert.equal(r.status,404)});
test('baseline serves only known files using the isolated preview origin',async()=>{await mkdir(join(dir,'baseline'));await writeFile(join(dir,'baseline','index.html'),'Original fixture');const r=await fetch(`${base}/improvements/${id}/baseline/index.html`,{headers:{host:'localhost:4398'}});assert.equal(r.status,200);assert.equal(await r.text(),'Original fixture');assert.match(r.headers.get('content-security-policy'),/connect-src 'none'/);assert.equal((await fetch(`${base}/improvements/${id}/baseline/status.json`,{headers:{host:'localhost:4398'}})).status,404);});
