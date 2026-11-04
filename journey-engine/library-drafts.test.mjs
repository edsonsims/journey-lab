import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLibraryDraft, validateLibraryDraftInput } from './library-drafts.mjs';
import { WorkspaceError } from './workspace-store.mjs';

const proposal = { name: 'The curious parent', mission: 'Find a short activity', resources: 'A phone, no printer', initialKnowledge: 'No previous visits' };
const response = (draft = proposal) => ({ id: 'resp_mock-1', status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(draft) }] }], usage: { input_tokens: 20, output_tokens: 30, total_tokens: 50, private: 'do not publish' } });

test('drafting uses one bounded Meta request, declared context only, and sanitized provenance', async () => {
  let received;
  const result = await generateLibraryDraft({ kind: 'persona', brief: 'Explore activities without a printer', base: { context: 'Only a phone', environmentId: 'private-env', password: 'not-a-real-secret', executionPolicy: { maxSteps: 60 } }, requestMeta: async (body, signal) => { received = body; assert.ok(signal instanceof AbortSignal); return response(); } });
  assert.deepEqual(result.draft, proposal);
  assert.equal(received.model, 'muse-wonder-1.0'); assert.equal(received.store, false); assert.equal(received.max_output_tokens, 4096);
  assert.equal(received.text.format.type, 'json_schema'); assert.equal(received.text.format.strict, true);
  assert.equal(received.text.format.schema.additionalProperties, false);
  assert.deepEqual(received.text.format.schema.required, Object.keys(received.text.format.schema.properties));
  assert.equal(received.text.format.schema.properties.resources.type, 'string');
  assert.match(received.text.format.schema.properties.resources.description, /concrete values/);
  assert.match(received.text.format.schema.properties.skills.description, /Empty string when skills are unknown/);
  assert.equal(received.text.format.schema.properties.allowMutations, undefined);
  assert.equal(received.tools, undefined); assert.equal(received.previous_response_id, undefined);
  assert.deepEqual(JSON.parse(received.input[0].content[0].text).base, { context: 'Only a phone' });
  assert.doesNotMatch(JSON.stringify(received), /private-env|not-a-real-secret/);
  assert.deepEqual(result.provenance.usage, { input_tokens: 20, output_tokens: 30, total_tokens: 50 });
  assert.equal(result.provenance.requestId, 'resp_mock-1'); assert.equal(result.provenance.provider, 'Meta'); assert.ok(Date.parse(result.provenance.createdAt));
  assert.match(received.instructions, /Do not invent research/);
});

test('charter drafts keep semantic lists and source uncertainty, without granting environment policy', async () => {
  const draft = { name: 'First value', mission: 'Find one usable activity', screens: ['Home', 'Activities', 'Home'], flows: ['Start activity'], expectedBehaviorSources: 'Unknown; verify the visible promise.' };
  const result = await generateLibraryDraft({ kind: 'charter', brief: 'Draft a discovery mission', requestMeta: async () => response(draft) });
  assert.deepEqual(result.draft.screens, ['Home', 'Activities']); assert.equal(result.draft.expectedBehaviorSources, draft.expectedBehaviorSources);
  for (const field of ['projectId', 'personaIds', 'defaultEnvironmentId', 'allowMutations', 'captureBodies', 'memoryPolicy', 'maxSteps', 'continuity', 'credentials']) {
    await assert.rejects(generateLibraryDraft({ kind: 'charter', brief: 'Draft', requestMeta: async () => response({ ...draft, [field]: true }) }), error => error.code === 'DRAFT_INVALID_RESPONSE');
  }
});

test('briefs and draft context are validated before calling Meta', async () => {
  let calls = 0; const requestMeta = async () => { calls++; return response(); };
  for (const brief of ['', ' ', null, 'x'.repeat(6001)]) await assert.rejects(generateLibraryDraft({ kind: 'persona', brief, requestMeta }), error => error.code === 'INVALID_DRAFT_BRIEF');
  await assert.rejects(generateLibraryDraft({ kind: 'persona', brief: 'Draft', base: { skills: ['wrong type'] }, requestMeta }));
  await assert.rejects(generateLibraryDraft({ kind: 'charter', brief: 'Draft', base: { screens: ['x'.repeat(501)] }, requestMeta }));
  assert.throws(() => validateLibraryDraftInput('environment', { brief: 'Draft' }), /personas and missions/);
  assert.equal(calls, 0);
});

test('malformed, refused, incomplete and tool-bearing output cannot become a draft', async () => {
  const invalid = [null, { ...response(), error: {} }, { ...response(), status: 'incomplete' }, { ...response(), status: 'failed' }, { ...response(), output: [{ type: 'function_call', arguments: '{}' }] }, { ...response(), output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }] }, response({ name: 'Missing mission' }), response([]), response({ ...proposal, resources: 'x'.repeat(6001) })];
  for (const data of invalid) await assert.rejects(generateLibraryDraft({ kind: 'persona', brief: 'Draft', requestMeta: async () => data }), error => error.code === 'DRAFT_INVALID_RESPONSE');
  for (const text of ['{"name":"broken"', `${JSON.stringify(proposal)} trailing text`, '[]', '```json\n{}\n```']) {
    await assert.rejects(generateLibraryDraft({ kind: 'persona', brief: 'Draft', requestMeta: async () => ({ output_text: text }) }), error => error.code === 'DRAFT_INVALID_RESPONSE');
  }
  assert.deepEqual((await generateLibraryDraft({ kind: 'persona', brief: 'Draft', requestMeta: async () => ({ output_text: `\`\`\`json\n${JSON.stringify(proposal)}\n\`\`\`` }) })).draft, proposal);
});

test('provider failures and invalid receipts never echo raw provider content', async () => {
  await assert.rejects(generateLibraryDraft({ kind: 'persona', brief: 'Draft', requestMeta: async () => { throw Error('Bearer not-a-real-secret provider debug'); } }), error => error.code === 'DRAFT_PROVIDER_FAILED' && !error.message.includes('secret'));
  await assert.rejects(generateLibraryDraft({ kind: 'persona', brief: 'Draft', requestMeta: async () => { throw new WorkspaceError('Provider debug contains a secret', 403, 'PROVIDER_INTERNAL'); } }), error => error.code === 'DRAFT_PROVIDER_FAILED' && !error.message.includes('secret'));
  const result = await generateLibraryDraft({ kind: 'persona', brief: 'Draft', requestMeta: async () => ({ ...response(), id: 'Bearer sensitive content', usage: { input_tokens: -1, output_tokens: 'secret' } }) });
  assert.equal(result.provenance.requestId, null); assert.equal(result.provenance.usage, null);
});

test('draft timeout is bounded even when a callback ignores cancellation', async () => {
  let providerSignal;
  await assert.rejects(generateLibraryDraft({ kind: 'persona', brief: 'Draft', timeoutMs: 10, requestMeta: (_, signal) => { providerSignal = signal; return new Promise(() => {}); } }), error => error.code === 'DRAFT_TIMEOUT' && error.status === 504);
  assert.equal(providerSignal.aborted, true);
});

test('invalid output records only safe diagnostic categories and known field names', async () => {
  await assert.rejects(generateLibraryDraft({ kind: 'persona', brief: 'Draft', requestMeta: async () => ({ ...response(), status: 'incomplete' }) }), error => error.diagnostics.reason === 'response_status' && error.diagnostics.status === 'incomplete');
  await assert.rejects(generateLibraryDraft({ kind: 'persona', brief: 'Draft', requestMeta: async () => response({ ...proposal, constraints: ['bad value'] }) }), error => error.diagnostics.reason === 'invalid_string' && error.diagnostics.field === 'constraints' && !JSON.stringify(error.diagnostics).includes('bad value'));
  await assert.rejects(generateLibraryDraft({ kind: 'persona', brief: 'Draft', requestMeta: async () => response({ ...proposal, privateData: 'secret-like content' }) }), error => error.diagnostics.reason === 'unknown_field' && !JSON.stringify(error.diagnostics).includes('privateData'));
});

test('a valid saved charter can supply its full screen and flow scope while generated lists stay bounded', async () => {
  const screens = Array.from({ length: 60 }, (_, i) => `Screen ${i + 1}`), flows = Array.from({ length: 40 }, (_, i) => `Flow ${i + 1}`);
  assert.deepEqual(validateLibraryDraftInput('charter', { brief: 'Refine this charter', base: { screens, flows } }).base, { screens, flows });
  await assert.rejects(generateLibraryDraft({ kind: 'charter', brief: 'Draft', requestMeta: async () => response({ name: 'Charter', mission: 'Explore', screens }) }), error => error.diagnostics.reason === 'invalid_list');
});

test('schema-valid repeated placeholder output is rejected without rewriting the proposed content', async () => {
  const degraded = { ...proposal, constraints: 'Turn-60', expectations: 'Turn-60', initialKnowledge: 'Turn-60', priorities: 'Turn-60', skills: 'Turn-60', stopCriteria: 'Turn-60' };
  await assert.rejects(generateLibraryDraft({ kind: 'persona', brief: 'Draft', requestMeta: async () => response(degraded) }), error => error.diagnostics.reason === 'repeated_placeholder_content' && error.provenance.usage.total_tokens === 50);
  const unknowns = { ...proposal, constraints: 'Unknown', expectations: 'Unknown', priorities: 'Unknown', skills: 'Unknown' };
  assert.deepEqual((await generateLibraryDraft({ kind: 'persona', brief: 'Draft', requestMeta: async () => response(unknowns) })).draft, unknowns);
});
