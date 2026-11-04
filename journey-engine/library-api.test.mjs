import {retainedFixture} from './retained-test-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdir} from 'node:fs/promises';
import { join } from 'node:path';
import { createWorkspaceApi } from './workspace-api.mjs';

const draftResponse = () => ({ id: 'resp_fixture', status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ name: 'The remote parent', mission: 'Find a practical activity', context: 'No printer' }) }] }], usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 } });
async function setup(t, options = {}) {
  const root = await retainedFixture('journey-library-api-'), runsDir = join(root, 'runs'); await mkdir(runsDir);
  let api; const launched = [], calls = [];
  const server = http.createServer(async (req, res) => { if (!await api.handle(req, res, new URL(req.url, 'http://127.0.0.1'))) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port, origin = `http://127.0.0.1:${port}`;
  api = createWorkspaceApi({ root: join(root, 'state'), runsDir, port, configured: () => true, launchRun: async run => { launched.push(run); return run; }, requestMeta: async (body, signal) => { calls.push(body); return draftResponse(); }, ...options });
  await api.ready;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); api.close();  });
  const request = async (path, { method = 'GET', data, requestOrigin = origin } = {}) => { const res = await fetch(`${origin}/api/workspace${path}`, { method, headers: { 'content-type': 'application/json', origin: requestOrigin }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) }); return { status: res.status, data: await res.json() }; };
  return { api, request, launched, calls };
}

test('Meta drafts return proposals with provenance, audit the request, and never save or launch', async t => {
  const { api, request, launched, calls } = await setup(t);
  const versions = api.store.db.prepare('SELECT COUNT(*) AS count FROM entity_versions').get().count;
  const result = await request('/personas/draft', { method: 'POST', data: { projectId: 'little-steps', brief: 'Unique private draft brief', base: { context: 'Phone only', password: 'fake-password', defaultEnvironmentId: 'hidden' } } });
  assert.equal(result.status, 200); assert.equal(result.data.draft.name, 'The remote parent'); assert.equal(result.data.provenance.model, 'muse-wonder-1.0');
  assert.equal(api.store.db.prepare('SELECT COUNT(*) AS count FROM entity_versions').get().count, versions);
  assert.equal(launched.length, 0); assert.equal(calls.length, 1); assert.equal(api.store.listRuns().length, 0);
  const audits = api.store.db.prepare("SELECT * FROM audit WHERE kind='library-draft'").all(); assert.equal(audits.length, 1);
  const audit = JSON.parse(audits[0].data); assert.equal(audit.status, 'proposed'); assert.equal(audit.projectId, 'little-steps'); assert.equal(audit.provenance.requestId, 'resp_fixture');
  assert.doesNotMatch(JSON.stringify(audits), /Unique private draft brief|fake-password|Phone only/);
  assert.doesNotMatch(JSON.stringify(calls), /fake-password|hidden/);
  const saved = await request('/personas', { method: 'POST', data: { projectId: 'little-steps', ...result.data.draft, expectedVersion: 0 } });
  assert.equal(saved.status, 201); assert.equal(saved.data.version, 1); assert.equal(saved.data.continuity, 'first-time');
});

test('draft input, configuration and foreign-origin guards prevent provider calls', async t => {
  let calls = 0; const { request } = await setup(t, { configured: () => false, requestMeta: async () => { calls++; return draftResponse(); } });
  assert.equal((await request('/charters/draft', { method: 'POST', data: { projectId: 'little-steps', brief: 'Draft a charter' } })).data.code, 'MODEL_API_KEY_MISSING');
  assert.equal((await request('/personas/draft', { method: 'POST', data: { brief: 'Draft' } })).data.code, 'PROJECT_REQUIRED');
  assert.equal((await request('/personas/draft', { method: 'POST', data: { projectId: 'little-steps', brief: 'x'.repeat(6001) } })).data.code, 'INVALID_DRAFT_BRIEF');
  const large = await request('/personas/draft', { method: 'POST', data: { projectId: 'little-steps', brief: 'x'.repeat(70000) } }); assert.equal(large.status, 413);
  const foreign = await request('/personas/draft', { method: 'POST', requestOrigin: 'https://untrusted.test', data: { projectId: 'little-steps', brief: 'Draft' } }); assert.equal(foreign.status, 403);
  assert.equal(calls, 0);
});

test('draft failure responses and audit contain safe codes, never provider debug text', async t => {
  const { api, request } = await setup(t, { requestMeta: async () => { throw Error('Provider debug: Bearer fake-secret'); } });
  const result = await request('/personas/draft', { method: 'POST', data: { projectId: 'little-steps', brief: 'Prepare a persona' } });
  assert.equal(result.status, 502); assert.equal(result.data.code, 'DRAFT_PROVIDER_FAILED'); assert.doesNotMatch(JSON.stringify(result), /fake-secret/);
  const audits = api.store.db.prepare("SELECT data FROM audit WHERE kind='library-draft'").all(); assert.doesNotMatch(JSON.stringify(audits), /fake-secret/); assert.equal(JSON.parse(audits[0].data).status, 'failed');
});

test('an unusable model proposal retains its provider usage receipt without saving draft content', async t => {
  const { api, request } = await setup(t, { requestMeta: async () => ({ ...draftResponse(), status: 'incomplete' }) });
  const result = await request('/personas/draft', { method: 'POST', data: { projectId: 'little-steps', brief: 'Prepare a persona' } });
  assert.equal(result.status, 502); assert.equal(result.data.code, 'DRAFT_INVALID_RESPONSE');
  const audit = JSON.parse(api.store.db.prepare("SELECT data FROM audit WHERE kind='library-draft'").get().data);
  assert.equal(audit.status, 'failed'); assert.equal(audit.provenance.requestId, 'resp_fixture'); assert.equal(audit.provenance.usage.total_tokens, 30);
  assert.deepEqual(audit.diagnostics, { reason: 'response_status', status: 'incomplete' }); assert.equal(result.data.diagnostics, undefined);
  assert.doesNotMatch(JSON.stringify(audit), /The remote parent|No printer/);
});

test('only one draft is generated at a time and the lock is released after completion', async t => {
  let release, started; const waiting = new Promise(resolve => { release = resolve; }); const entered = new Promise(resolve => { started = resolve; });
  const { request } = await setup(t, { requestMeta: async () => { started(); await waiting; return draftResponse(); } });
  const first = request('/personas/draft', { method: 'POST', data: { projectId: 'little-steps', brief: 'First' } }); await entered;
  const second = await request('/charters/draft', { method: 'POST', data: { projectId: 'little-steps', brief: 'Second' } }); assert.equal(second.status, 409); assert.equal(second.data.code, 'DRAFT_BUSY');
  release(); assert.equal((await first).status, 200);
  assert.equal((await request('/personas/draft', { method: 'POST', data: { projectId: 'little-steps', brief: 'Next' } })).status, 200);
});

test('Library lifecycle endpoints create immutable versions, honor stale writes, and retain archived history', async t => {
  const { api, request } = await setup(t);
  const original = api.store.getEntity('persona', 'mother');
  const saved = await request('/personas/mother', { method: 'PATCH', data: { projectId: 'little-steps', expectedVersion: 1, context: 'Updated context' } }); assert.equal(saved.status, 200); assert.equal(saved.data.version, 2); assert.ok(saved.data.versionCreatedAt);
  const stale = await request('/personas/mother', { method: 'PATCH', data: { expectedVersion: 1, context: 'Stale overwrite' } }); assert.equal(stale.status, 409); assert.equal(stale.data.code, 'VERSION_CONFLICT');
  const copy = await request('/personas/mother/duplicate', { method: 'POST', data: { projectId: 'little-steps', expectedVersion: 2, version: 1, name: 'Version one copy', context: 'Do not override the source', id: 'not-the-id' } });
  assert.equal(copy.status, 201); assert.equal(copy.data.version, 1); assert.notEqual(copy.data.id, 'mother'); assert.notEqual(copy.data.id, 'not-the-id'); assert.equal(copy.data.context, original.context);
  const restored = await request('/personas/mother/restore', { method: 'POST', data: { projectId: 'little-steps', expectedVersion: 2, version: 1 } }); assert.equal(restored.status, 200); assert.equal(restored.data.version, 3); assert.equal(restored.data.context, original.context);
  assert.equal((await request('/personas/mother/restore', { method: 'POST', data: { expectedVersion: 3, version: 999 } })).data.code, 'VERSION_NOT_FOUND');
  assert.equal((await request('/personas/mother/duplicate', { method: 'POST', data: { expectedVersion: 3, version: 999 } })).data.code, 'VERSION_NOT_FOUND');
  assert.equal((await request('/environments/little-steps-local/duplicate', { method: 'POST', data: { version: {} } })).data.code, 'INVALID_VERSION');
  assert.equal((await request('/environments/little-steps-local/restore', { method: 'POST', data: { version: {} } })).data.code, 'INVALID_VERSION');
  const archive = await request('/personas/mother/archive', { method: 'POST', data: { projectId: 'little-steps', expectedVersion: 3, archived: true } }); assert.equal(archive.status, 200); assert.equal(archive.data.archived, true);
  assert.equal((await request('/personas/mother/archive', { method: 'POST', data: { archived: 'false' } })).data.code, 'INVALID_ARCHIVE_STATE');
  const list = await request('/personas?projectId=little-steps'); assert.ok(!list.data.personas.some(item => item.id === 'mother'));
  const bootstrap = await request('/bootstrap?projectId=little-steps'); assert.equal(bootstrap.data.personas.find(item => item.id === 'mother').archived, true);
  const versions = await request('/personas/mother/versions?projectId=little-steps'); assert.deepEqual(versions.data.versions.map(item => item.version), [3, 2, 1]); assert.equal(versions.data.versions[1].context, 'Updated context');
  assert.equal((await request('/personas/mother', { method: 'DELETE' })).status, 405);
});

test('project scoping applies consistently to history, read and lifecycle endpoints', async t => {
  const { api, request } = await setup(t); const other = api.store.saveProject({ name: 'Other project' });
  for (const suffix of ['', '/versions', '?version=1']) {
    const path = `/personas/mother${suffix}${suffix.includes('?') ? '&' : '?'}projectId=${other.id}`;
    assert.equal((await request(path)).data.code, 'PROJECT_MISMATCH');
  }
  for (const [path, method, data] of [['/personas/mother', 'PATCH', { context: 'Cross-project edit' }], ['/personas/mother/archive', 'POST', {}], ['/personas/mother/restore', 'POST', { version: 1 }], ['/personas/mother/duplicate', 'POST', {}]]) {
    const result = await request(`${path}?projectId=${other.id}`, { method, data }); assert.equal(result.data.code, 'PROJECT_MISMATCH');
  }
  assert.equal((await request(`/charters/draft?projectId=${other.id}`, { method: 'POST', data: { projectId: 'little-steps', brief: 'Draft' } })).data.code, 'PROJECT_MISMATCH');
  assert.equal((await request('/personas/mother', { method: 'PATCH', data: { projectId: {}, context: 'Bad scope' } })).data.code, 'INVALID_PROJECT');
  assert.equal((await request('/personas/mother?version=nope')).data.code, 'INVALID_VERSION');
  assert.equal(api.store.getEntity('persona', 'mother').version, 1);
});
