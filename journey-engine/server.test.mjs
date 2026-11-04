import {retainedFixture} from './retained-test-fixtures.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const portProbe = http.createServer();
await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve));
const port = portProbe.address().port;
await new Promise(resolve => portProbe.close(resolve));
const scratch = retainedFixture('journey-engine-test-');
const env = { ...process.env, JOURNEY_PORT: String(port), JOURNEY_RUNS_DIR: scratch };
delete env.MODEL_API_KEY;
const child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('.', import.meta.url), env, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('server startup timeout')), 10000);
  child.stdout.once('data', () => { clearTimeout(timer); resolve(); });
  child.once('exit', code => { clearTimeout(timer); reject(new Error(`server exited ${code}`)); });
});
after(async () => { child.kill(); });
const origin = `http://127.0.0.1:${port}`;

test('health reports missing credential without exposing a secret', async () => {
  const response = await fetch(`${origin}/api/health`);
  const result = await response.json();
  assert.equal(result.modelConfigured, false);
  assert.equal(result.target, 'http://127.0.0.1:4320/');
  assert.equal(result.model, 'muse-wonder-1.0');
  assert.equal(typeof result.targetAvailable, 'boolean');
  assert.equal(result.storage.retention,'keep-all');assert.ok(['ready','low','unknown'].includes(result.storage.status));
});
test('specialized Insights, Competitors and Calibration APIs are mounted before the workspace router',async()=>{
  for(const route of ['insights/coverage','competitors/profiles','calibration/overview']){
    const response=await fetch(`${origin}/api/workspace/${route}?projectId=little-steps`);assert.equal(response.status,200,route);const result=await response.json();assert.equal(result.code,undefined);
  }
  const response=await fetch(`${origin}/api/workspace/runs?projectId=little-steps&limit=2`);const result=await response.json();assert.equal(result.page.limit,2);assert.equal(typeof result.page.total,'number');
});
test('a run without the Meta key is rejected; no synthetic success is created', async () => {
  const response = await fetch(`${origin}/api/runs`, { method: 'POST' });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'MODEL_API_KEY_MISSING');
});
test('persona catalog provides both bounded device profiles without provider access',async()=>{
  const response=await fetch(`${origin}/api/personas`);assert.equal(response.status,200);
  const result=await response.json();assert.equal(result.scenarioId,'print-context-v1');
  assert.deepEqual(result.personas.map(p=>[p.id,p.viewport]),[['teacher',{width:1280,height:800}],['mother',{width:390,height:844}]]);
});
test('cross-origin pages cannot start local paid runs', async () => {
  const response = await fetch(`${origin}/api/runs`, { method: 'POST', headers: { Origin: 'https://example.com' } });
  assert.equal(response.status, 403);
});
test('history exposes saved evidence and labels a run interrupted by a restart', async () => {
  const id = '12345678-1234-1234-1234-123456789abc';
  await mkdir(join(scratch, id));
  await writeFile(join(scratch, id, 'run.json'), JSON.stringify({ id, status: 'running', createdAt: '2026-10-26T00:00:00.000Z', events: [{ type: 'screenshot', screenshot: `/runs/${id}/screen.png` }] }));
  const history = await (await fetch(`${origin}/api/runs`)).json();
  assert.equal(history.runs.find(run => run.id === id)?.status, 'interrupted');
  assert.equal(history.runs.find(run => run.id === id)?.eventCount, 1);
  const saved = await (await fetch(`${origin}/api/runs/${id}`)).json();
  assert.equal(saved.status, 'interrupted');
  assert.equal(saved.events[0].screenshot, `/runs/${id}/screen.png`);
});
test('preview host cannot read application APIs', async () => {
  const status = await new Promise((resolve, reject) => { const req = http.get({hostname:'127.0.0.1',port,path:'/api/health',headers:{Host:`localhost:${port}`}}, res => {res.resume();resolve(res.statusCode);});req.on('error',reject); });
  assert.equal(status, 403);
});
test('video seeks support byte ranges and reject invalid ranges', async () => {
  const id='44444444-4444-4444-8444-444444444444';await mkdir(join(scratch,id));await writeFile(join(scratch,id,'journey.webm'),'0123456789');
  let r=await fetch(`${origin}/runs/${id}/journey.webm`,{headers:{range:'bytes=2-5'}});assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),'bytes 2-5/10');assert.equal(await r.text(),'2345');
  r=await fetch(`${origin}/runs/${id}/journey.webm`,{headers:{range:'bytes=99-100'}});assert.equal(r.status,416);assert.equal(r.headers.get('content-range'),'bytes */10');
});
test('comparison creation requires Meta configuration and rejects cross-origin posts',async()=>{
  let r=await fetch(`${origin}/api/comparisons`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({improvementId:'83cb71bf-0ea3-4ec6-96ab-8e5332a24d47'})});assert.equal(r.status,503);
  r=await fetch(`${origin}/api/comparisons`,{method:'POST',headers:{origin:'https://example.com','content-type':'application/json'},body:'{}'});assert.equal(r.status,403);
});
