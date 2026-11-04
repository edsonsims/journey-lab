import test from 'node:test';
import assert from 'node:assert/strict';
import { editableRecord, authorPayload, fieldChanges, proposedChanges, runUses, runVersion, readLocalDraft, displayValue } from './library-authoring.ts';

test('charter text and scope arrays round trip without changing source records', () => {
  const charter = {
    name: 'First activity', description: 'From discovery to first value', mission: 'Start an activity',
    scope: 'Commercial site and app', startingState: 'Logged out', goals: 'Try a useful first step',
    screens: ['Home', '/activities/*'], flows: ['Discover', 'Begin'],
    personaIds: ['parent', 'teacher'], compatibleEnvironmentIds: ['staging', 'local'],
    defaultEnvironmentId: 'staging', memoryPolicy: 'explicit', scenarioId: 'web-app',
    allowedActions: 'Use fictional progress', expectedBehaviorSources: 'Visible product promises',
    successCriteria: 'Activity begins', stopCriteria: 'No suitable route',
  };
  const before = structuredClone(charter), form = editableRecord('charters', charter);
  assert.equal(form.screens, 'Home\n/activities/*');
  assert.equal(form.flows, 'Discover\nBegin');
  assert.notEqual(form.personaIds, charter.personaIds);
  const payload = authorPayload('charters', form);
  for (const [key, value] of Object.entries(charter)) assert.deepEqual(payload[key], value, key);
  const edited = authorPayload('charters', { ...form, screens: '  Home  \n\n /activities/* \n', flows: 'Discover\n\nBegin' });
  assert.deepEqual(edited.screens, ['Home', '/activities/*']);
  assert.deepEqual(edited.flows, ['Discover', 'Begin']);
  assert.deepEqual(charter, before);
});

test('nullable execution controls retain explicit zero and false instead of silently inheriting', () => {
  const form = editableRecord('charters', { maxSteps: 0, maxTokens: null, maxDurationMs: 90000, allowMutations: false, captureBodies: true });
  assert.equal(form.maxSteps, 0);
  assert.equal(form.maxTokens, '');
  assert.equal(form.allowMutations, 'false');
  const payload = authorPayload('charters', form);
  assert.equal(payload.maxSteps, 0); // Let validation reject zero; do not turn it into a larger inherited limit.
  assert.equal(payload.maxTokens, null);
  assert.equal(payload.maxDurationMs, 90000);
  assert.equal(payload.allowMutations, false);
  assert.equal(payload.captureBodies, true);
  const inherited = authorPayload('charters', { ...form, maxSteps: '', maxDurationMs: null, allowMutations: 'inherit', captureBodies: null });
  for (const key of ['maxSteps', 'maxTokens', 'maxDurationMs', 'allowMutations', 'captureBodies']) assert.equal(inherited[key], null, key);
  assert.equal(authorPayload('charters', { ...form, maxSteps: '12' }).maxSteps, 12);
});

test('initial knowledge falls back only for old records without a canonical field', () => {
  assert.equal(editableRecord('personas', { knowledge: 'Legacy declared context' }).initialKnowledge, 'Legacy declared context');
  assert.equal(editableRecord('personas', { knowledge: 'Old', initialKnowledge: 'New' }).initialKnowledge, 'New');
  assert.equal(editableRecord('personas', { knowledge: 'Do not revive', initialKnowledge: '' }).initialKnowledge, '');
  assert.equal(editableRecord('personas', { knowledge: 'Do not revive', initialKnowledge: null }).initialKnowledge, '');
  const source = { name: 'Parent', role: 'client', deviceIds: ['phone','tablet'], primaryDeviceId:'phone', networkProfileId:'slow', viewport: { width: 390, height: 844 }, continuity: 'returning' };
  const form = editableRecord('personas', source), payload = authorPayload('personas', form);
  assert.notEqual(form.deviceIds, source.deviceIds);
  assert.deepEqual(payload.deviceIds, ['phone','tablet']);
  assert.equal(payload.primaryDeviceId, 'phone');
  assert.equal(payload.networkProfileId, 'slow');
  assert.equal(Object.hasOwn(payload, 'viewport'), false);
  assert.equal(payload.continuity, 'returning');
  assert.equal(editableRecord('personas').continuity, 'first-time');
});

test('save payloads allow authoring fields but exclude record identity, history, and executable configuration', () => {
  const form = {
    ...editableRecord('personas', { name: 'Parent', mission: 'Explore' }),
    id: 'other-persona', projectId: 'other-project', version: 99, versionId: 'other-version', archived: true,
    expectedVersion: 99, history: [{ name: 'Other' }], repositoryPath: '/unrelated', command: 'execute',
    allowMutations: true, captureBodies: true, model: 'other-model', personaSnapshot: { mission: 'Override' },
  };
  const payload = authorPayload('personas', form);
  assert.equal(payload.name, 'Parent');
  for (const key of ['id', 'projectId', 'version', 'versionId', 'archived', 'expectedVersion', 'history', 'repositoryPath', 'command', 'allowMutations', 'captureBodies', 'model', 'personaSnapshot']) assert.equal(Object.hasOwn(payload, key), false, key);
});

test('version comparison ignores metadata and reports only meaningful authored changes', () => {
  const before = { id: 'parent', name: 'Parent', mission: 'Start', knowledge: 'A first visit', version: 1, updatedAt: '2026-10-01', continuity: 'first-time', viewport: { width: 1280, height: 800 } };
  const equivalent = { ...before, version: 7, versionId: 'new-version', updatedAt: '2026-10-31', initialKnowledge: 'A first visit' };
  assert.deepEqual(fieldChanges('personas', before, equivalent), []);
  const changes = fieldChanges('personas', before, { ...equivalent, mission: 'Prepare a lesson', resources: 'Classroom printer', continuity: 'returning' });
  assert.deepEqual(changes.map(change => change.key).sort(), ['continuity', 'mission', 'resources']);
  assert.deepEqual(changes.find(change => change.key === 'mission'), { key: 'mission', label: 'Personal goal', before: 'Start', after: 'Prepare a lesson' });
  assert.equal(changes.find(change => change.key === 'continuity').label, 'Visit mode');
  assert.deepEqual(fieldChanges('charters', { screens: ['Home'], maxSteps: null }, { screens: 'Home', maxSteps: '' }), []);
});

test('model drafts cannot change permissions, identities, run controls, or relationships', () => {
  for (const kind of ['personas', 'charters']) {
    const form = editableRecord(kind, { name: 'Original', mission: 'Explore' });
    const changes = proposedChanges(kind, form, {
      mission: 'Find the first useful step', id: 'overwrite', projectId: 'another-project', version: 999,
      archived: true, expectedVersion: 999, defaultEnvironmentId: 'production', personaIds: ['admin'],
      compatibleEnvironmentIds: ['production'], allowMutations: true, captureBodies: true, maxSteps: 60,
      maxTokens: 2000000, maxDurationMs: 900000, memoryPolicy: 'explicit', continuity: 'returning',
      deviceIds:['unreviewed-device'],primaryDeviceId:'unreviewed-device',networkProfileId:'offline',viewport: { width: 2000, height: 2000 }, scenarioId: 'override', model: 'override', command: 'execute',
    });
    assert.deepEqual(changes.map(change => change.key), ['mission']);
    assert.equal(changes[0].after, 'Find the first useful step');
    assert.equal(form.mission, 'Explore');
  }
});

test('model proposals accept text and scope arrays, reject wrong shapes and unchanged suggestions', () => {
  const form = editableRecord('charters', { name: 'A brief', mission: 'Explore', screens: ['Home'], flows: ['Start'] });
  const before = structuredClone(form);
  const changes = proposedChanges('charters', form, { name: 'A brief', mission: ['Do not', 'coerce arrays'], scope: { hidden: 'object' }, screens: ['Home', 'Activity'], flows: 'Start\nFinish', goals: 42 });
  assert.deepEqual(changes.map(change => change.key).sort(), ['flows', 'screens']);
  assert.deepEqual(changes.find(change => change.key === 'screens').after, ['Home', 'Activity']);
  assert.deepEqual(changes.find(change => change.key === 'flows').after, ['Start', 'Finish']);
  assert.deepEqual(proposedChanges('charters', form, { screens: ['Home', 12], mission: null }), []);
  assert.deepEqual(form, before);
});

test('run usage resolves stable IDs across saved snapshots and legacy embedded records', () => {
  for (const run of [{ personaId: 'parent' }, { persona: { id: 'parent' } }, { personaSnapshot: { id: 'parent' } }]) {
    assert.equal(runUses(run, 'personas', 'parent'), true);
    assert.equal(runUses(run, 'personas', 'teacher'), false);
  }
  for (const run of [{ charterId: 'first-activity' }, { charterSnapshot: { id: 'first-activity' } }]) {
    assert.equal(runUses(run, 'charters', 'first-activity'), true);
    assert.equal(runUses(run, 'charters', 'other-charter'), false);
  }
  assert.equal(runUses({ personaId: 'same-id' }, 'charters', 'same-id'), false);
});

test('version mapping prefers exact snapshots and supports legacy top-level pinned versions', () => {
  assert.equal(runVersion({ personaSnapshot: { version: 4 }, persona: { version: 3 }, personaVersion: 2 }, 'personas'), 4);
  assert.equal(runVersion({ persona: { version: 3 }, personaVersion: 2 }, 'personas'), 2);
  assert.equal(runVersion({ personaVersion: 2 }, 'personas'), 2);
  assert.equal(runVersion({ charterSnapshot: { version: 6 }, charterVersion: 5 }, 'charters'), 6);
  assert.equal(runVersion({ charterVersion: 5 }, 'charters'), 5);
  assert.equal(runVersion({}, 'personas'), undefined);
  assert.equal(runVersion({}, 'charters'), undefined);
});

test('local drafts restore normalized editable data and retain their original conflict base', () => {
  const saved = { baseVersion: 3, savedAt: '2026-10-31T12:00:00Z', form: { name: 'Draft name', mission: 'Draft goal', id: 'ignore-id' }, baseForm: { name: 'Saved name', mission: 'Original goal' } };
  const requests = [], storage = { getItem: key => { requests.push(key); return JSON.stringify(saved); } };
  const draft = readLocalDraft(storage, 'project:persona:parent', 'personas');
  assert.deepEqual(requests, ['project:persona:parent']);
  assert.equal(draft.baseVersion, 3);
  assert.equal(draft.form.name, 'Draft name');
  assert.equal(draft.baseForm.name, 'Saved name');
  assert.equal(Object.hasOwn(draft.form, 'id'), false);
  assert.equal(draft.form.continuity, 'first-time');
  assert.deepEqual(draft.form.deviceIds, []);
  assert.equal(draft.form.primaryDeviceId, '');
  assert.equal(saved.form.continuity, undefined);
  const newDraft = readLocalDraft({ getItem: () => JSON.stringify({ ...saved, baseVersion: 0 }) }, 'new', 'personas');
  assert.equal(newDraft.baseVersion, 0);
});

test('corrupt, inaccessible, and malformed local drafts never become editable records', () => {
  for (const value of [null, 'not-json', 'null', '[]', '{}']) assert.equal(readLocalDraft({ getItem: () => value }, 'draft', 'personas'), null);
  assert.equal(readLocalDraft({ getItem: () => { throw Error('Storage unavailable'); } }, 'draft', 'personas'), null);
  const valid = { baseVersion: 1, form: { name: 'Draft' }, baseForm: { name: 'Saved' } };
  for (const override of [{ baseVersion: -1 }, { baseVersion: 1.5 }, { baseVersion: '1' }, { form: null }, { form: [] }, { form: 'bad' }, { baseForm: [] }, { baseForm: 'bad' }]) {
    assert.equal(readLocalDraft({ getItem: () => JSON.stringify({ ...valid, ...override }) }, 'draft', 'personas'), null, JSON.stringify(override));
  }
});

test('comparison display keeps explicit false and zero legible', () => {
  assert.equal(displayValue(false), 'false');
  assert.equal(displayValue(0), '0');
  assert.equal(displayValue(null), 'Not set');
  assert.equal(displayValue([]), 'Not set');
  assert.equal(displayValue(['Home', 'Activity']), 'Home\nActivity');
});
