import {retainedFixture} from './retained-test-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createWorkspaceStore } from './workspace-store.mjs';

async function setup(t) {
  const root = await retainedFixture('journey-library-authoring-');
  const store = createWorkspaceStore({ root });
  t.after(async () => { store.close();  });
  return store;
}
const errorCode = code => error => error.code === code;
const rows = (store, kind, id) => store.db.prepare('SELECT * FROM entity_versions WHERE kind=? AND id=? ORDER BY version').all(kind, id);
const auditCount = store => store.db.prepare('SELECT COUNT(*) AS n FROM audit').get().n;
const launch = (store, overrides = {}) => store.buildRun({ charterId: 'first-value', personaId: 'mother', environmentId: 'little-steps-local', ...overrides });

test('persona authoring preserves structured context, aliases and bounded text with first-time defaults', async t => {
  const store = await setup(t);
  const input = {
    name: 'Purchase reviewer', role: 'business', description: 'A buyer with limited time.',
    context: 'Evaluating a classroom app for a small school.', mission: 'Decide if the app suits our classrooms.',
    decision: 'Recommend a trial only if preparation fits our schedule.', resources: 'A shared tablet; no printer.',
    skills: 'Can use a browser, not a developer.', initialKnowledge: 'Knows our classroom schedule.',
    constraints: 'Only ten minutes to prepare.', expectations: 'Try an activity before making a commitment.',
    priorities: 'Preparation time before price.', successCriteria: 'Prepare one usable activity.',
    stopCriteria: 'Stop if a physical resource is required.', viewport: { width: 900, height: 700 },
  };
  const first = store.saveEntity('persona', { ...input, expectedVersion: 0 });
  for (const [key, value] of Object.entries(input)) assert.deepEqual(first[key], value, key);
  assert.equal(first.knowledge, input.initialKnowledge);
  assert.equal(first.continuity, 'first-time');
  const second = store.saveEntity('persona', { knowledge: 'Explicit returning context.', continuity: 'returning', expectedVersion: 1 }, first.id);
  assert.equal(second.initialKnowledge, 'Explicit returning context.');
  assert.equal(second.knowledge, second.initialKnowledge);
  const cleared = store.saveEntity('persona', { initialKnowledge: '', resources: null, expectedVersion: 2 }, first.id);
  assert.equal(cleared.initialKnowledge, '');
  assert.equal(cleared.knowledge, '');
  assert.equal(cleared.resources, '');
  assert.equal(store.getEntity('persona', first.id, 1).initialKnowledge, input.initialKnowledge);
  const bounded = store.saveEntity('persona', { name: 'Bounded', resources: 'x'.repeat(9000) });
  assert.equal(bounded.resources.length, 6000);
});

test('charter authoring validates structured lists, project references and optional inherited policy', async t => {
  const store = await setup(t);
  const input = {
    name: 'First practical result', mission: 'Find a useful activity.', scope: 'Marketing through first use.',
    startingState: 'A fresh browser with the test account available.', goals: 'Complete one activity.',
    expectedBehaviorSources: 'The public product description and saved acceptance criteria.',
    successCriteria: 'See a usable activity.', stopCriteria: 'A supported obstacle.', allowedActions: 'Create test activities only.',
    screens: ['Home', 'Activity', 'Home'], flows: ['Browse → start'], personaIds: ['mother'],
    defaultEnvironmentId: 'little-steps-local', compatibleEnvironmentIds: ['little-steps-local'], memoryPolicy: 'explicit',
    maxSteps: 12, maxTokens: 90000, maxDurationMs: 180000, allowMutations: false, captureBodies: false,
  };
  const charter = store.saveEntity('charter', input);
  for (const [key, value] of Object.entries(input)) if (key !== 'screens') assert.deepEqual(charter[key], value, key);
  assert.deepEqual(charter.screens, ['Home', 'Activity']);
  const inherited = store.saveEntity('charter', { maxSteps: null, maxTokens: null, maxDurationMs: null, allowMutations: null, captureBodies: null }, charter.id);
  for (const key of ['maxSteps', 'maxTokens', 'maxDurationMs', 'allowMutations', 'captureBodies']) assert.equal(inherited[key], null);
  const other = store.saveProject({ name: 'Another product' });
  const foreignPersona = store.saveEntity('persona', { projectId: other.id, name: 'Elsewhere' });
  const foreignEnvironment = store.saveEntity('environment', { projectId: other.id, name: 'Elsewhere', url: 'https://other.test/' });
  for (const refs of [{ personaIds: [foreignPersona.id] }, { compatibleEnvironmentIds: [foreignEnvironment.id] }, { defaultEnvironmentId: foreignEnvironment.id }, { personaIds: ['missing'] }]) {
    assert.throws(() => store.saveEntity('charter', { name: 'Invalid refs', ...refs }), errorCode('INVALID_REFERENCE'));
  }
  const anotherEnvironment = store.saveEntity('environment', { name: 'Other local environment', url: 'http://localhost:4321/' });
  assert.throws(() => store.saveEntity('charter', { name: 'Excluded default', defaultEnvironmentId: anotherEnvironment.id, compatibleEnvironmentIds: ['little-steps-local'] }), errorCode('INVALID_REFERENCE'));
});

test('invalid schema fields and direct secret fields fail without appending versions', async t => {
  const store = await setup(t);
  const persona = store.getEntity('persona', 'mother'), charter = store.getEntity('charter', 'first-value');
  const invalidPersona = [{ decision: [] }, { initialKnowledge: {} }, { skills: 42 }, { description: {} }, { continuity: 'omniscient' }, { apiKey: 'synthetic-secret' }];
  for (const input of invalidPersona) assert.throws(() => store.saveEntity('persona', input, persona.id), errorCode('INVALID_REQUEST'));
  const invalidCharter = [{ screens: 'Home' }, { flows: [1] }, { memoryPolicy: 'automatic' }, { maxSteps: 61 }, { maxSteps: 1.5 }, { maxTokens: 999 }, { maxDurationMs: 29999 }, { captureBodies: 'true' }, { allowMutations: 1 }, { defaultEnvironmentId: false }];
  for (const input of invalidCharter) assert.throws(() => store.saveEntity('charter', input, charter.id), errorCode('INVALID_REQUEST'));
  assert.equal(store.versions('persona', persona.id).length, 1);
  assert.equal(store.versions('charter', charter.id).length, 1);
});

test('each save appends an immutable version and stale or cross-project writes cannot alter history', async t => {
  const store = await setup(t), first = store.getEntity('persona', 'mother');
  const originalRows = rows(store, 'persona', first.id);
  const second = store.saveEntity('persona', { expectedVersion: 1, mission: 'A revised mission.' }, first.id);
  const third = store.saveEntity('persona', { expectedVersion: 2, mission: second.mission }, first.id);
  assert.equal(third.version, 3);
  assert.deepEqual(rows(store, 'persona', first.id).slice(0, 1), originalRows);
  assert.equal(store.getEntity('persona', first.id, 1).versionCreatedAt, originalRows[0].created_at);
  assert.equal(store.getEntity('persona', first.id, 1).mission, first.mission);
  assert.notEqual(third.versionId, second.versionId);
  const count = auditCount(store);
  assert.throws(() => store.saveEntity('persona', { expectedVersion: 1, name: 'Stale' }, first.id), errorCode('VERSION_CONFLICT'));
  assert.throws(() => store.saveEntity('persona', { expectedVersion: '3', name: 'Invalid' }, first.id), errorCode('INVALID_VERSION'));
  assert.throws(() => store.saveEntity('persona', { projectId: 'foreign', name: 'Moved' }, first.id), errorCode('PROJECT_MISMATCH'));
  assert.equal(auditCount(store), count);
  assert.equal(store.versions('persona', first.id).length, 3);
});

test('duplicate and restore use selected historical content, with project and stale guards', async t => {
  const store = await setup(t), first = store.getEntity('persona', 'mother');
  store.saveEntity('persona', { mission: 'Changed mission', expectedVersion: 1 }, first.id);
  const preserved = rows(store, 'persona', first.id);
  store.archiveEntity('persona', first.id, true, { expectedVersion: 2 });
  const copy = store.duplicateEntity('persona', first.id, { version: 1, expectedVersion: 2, name: 'A fresh parent' });
  assert.notEqual(copy.id, first.id);
  assert.equal(copy.version, 1);
  assert.equal(copy.projectId, first.projectId);
  assert.equal(copy.archived, false);
  assert.equal(copy.mission, first.mission);
  const restored = store.restoreEntity('persona', first.id, { version: 1, expectedVersion: 2 });
  assert.equal(restored.version, 3);
  assert.equal(restored.mission, first.mission);
  assert.equal(restored.archived, true);
  assert.deepEqual(rows(store, 'persona', first.id).slice(0, 2), preserved);
  for (const method of ['duplicateEntity', 'restoreEntity']) {
    assert.throws(() => store[method]('persona', first.id, { version: 1, expectedVersion: 2 }), errorCode('VERSION_CONFLICT'));
    assert.throws(() => store[method]('persona', first.id, { version: 999, expectedVersion: 3 }), errorCode('VERSION_NOT_FOUND'));
    assert.throws(() => store[method]('persona', first.id, { version: 1, projectId: 'foreign' }), errorCode('PROJECT_MISMATCH'));
  }
  assert.throws(() => store.restoreEntity('persona', first.id), errorCode('INVALID_VERSION'));
  assert.throws(() => store.archiveEntity('persona', first.id, false, { expectedVersion: 2 }), errorCode('VERSION_CONFLICT'));
  assert.throws(() => store.archiveEntity('persona', first.id, false, { projectId: 'foreign' }), errorCode('PROJECT_MISMATCH'));
  assert.equal(store.getEntity('persona', first.id).archived, true);
  assert.equal(store.versions('persona', first.id).length, 3);
  assert.ok(store.listEntities('persona', first.projectId, true).some(persona => persona.id === first.id));
  assert.ok(!store.listEntities('persona', first.projectId).some(persona => persona.id === first.id));
});

test('lifecycle versions and their provenance audit commit or roll back together', async t => {
  const store = await setup(t), id = 'mother';
  const original = rows(store, 'persona', id), initialEntities = store.listEntities('persona', 'little-steps', true).length, count = auditCount(store);
  store.db.exec("CREATE TRIGGER fail_library_audit BEFORE INSERT ON audit WHEN NEW.kind IN ('duplicate','restore-version','archive') BEGIN SELECT RAISE(ABORT,'injected audit failure'); END;");
  assert.throws(() => store.duplicateEntity('persona', id), /injected audit failure/);
  assert.throws(() => store.restoreEntity('persona', id, { version: 1, expectedVersion: 1 }), /injected audit failure/);
  assert.throws(() => store.archiveEntity('persona', id), /injected audit failure/);
  assert.deepEqual(rows(store, 'persona', id), original);
  assert.equal(store.listEntities('persona', 'little-steps', true).length, initialEntities);
  assert.equal(auditCount(store), count);
  assert.equal(store.getEntity('persona', id).archived, false);
});

test('launch pins exact authoring versions and a narrowed execution policy without altering the environment', async t => {
  const store = await setup(t), environment = store.getEntity('environment', 'little-steps-local');
  const persona = store.saveEntity('persona', { decision: 'Need an activity now.', initialKnowledge: 'Only my declared knowledge.' }, 'mother');
  const charter = store.saveEntity('charter', { personaIds: ['teacher'], compatibleEnvironmentIds: [environment.id], maxSteps: 8, maxTokens: 5000, maxDurationMs: 45000, allowMutations: false, captureBodies: false }, 'first-value');
  const run = launch(store);
  assert.deepEqual(run.persona, persona);
  assert.deepEqual(run.personaSnapshot, persona);
  assert.deepEqual(run.charterSnapshot, charter);
  assert.deepEqual(run.environmentSnapshot, environment);
  assert.deepEqual(run.executionPolicy, { maxSteps: 8, maxTokens: 5000, maxDurationMs: 45000, allowMutations: false, captureBodies: false });
  assert.equal(run.maxSteps, 8);
  assert.equal(run.persona.mission, persona.mission);
  assert.ok(!run.persona.mission.includes(charter.mission));
  store.syncRun(run);
  store.saveEntity('persona', { initialKnowledge: 'Later learning' }, persona.id);
  store.saveEntity('charter', { mission: 'A later goal', maxSteps: 9 }, charter.id);
  store.restoreEntity('persona', persona.id, { version: 1, expectedVersion: 3 });
  const recorded = store.getRun(run.id);
  assert.deepEqual(recorded.personaSnapshot, persona);
  assert.deepEqual(recorded.charterSnapshot, charter);
  assert.deepEqual(recorded.executionPolicy, run.executionPolicy);
  store.syncRun({ ...run, status: 'failed', error: 'Transient test failure' });
  const retry = store.buildRetry(run.id);
  assert.deepEqual(retry.personaSnapshot, persona);
  assert.deepEqual(retry.executionPolicy, run.executionPolicy);
  assert.deepEqual(retry.charterSnapshot, charter);
  assert.deepEqual(retry.environmentSnapshot, environment);
});

test('launch rejects broadening environment limits and permissions or incompatible environments', async t => {
  const store = await setup(t);
  const environment = store.saveEntity('environment', { name: 'Restricted preview', url: 'https://preview.test/', maxSteps: 10, maxTokens: 6000, maxDurationMs: 60000, allowMutations: false, captureBodies: false });
  for (const narrowing of [{ maxSteps: 11 }, { maxTokens: 6001 }, { maxDurationMs: 60001 }, { allowMutations: true }, { captureBodies: true }]) {
    const charter = store.saveEntity('charter', { name: 'Bounded exploration', mission: 'Explore.', ...narrowing });
    assert.throws(() => launch(store, { charterId: charter.id, environmentId: environment.id }), errorCode('CHARTER_POLICY_EXCEEDS_ENVIRONMENT'));
  }
  const restricted = store.saveEntity('charter', { name: 'Only staging', mission: 'Explore.', compatibleEnvironmentIds: [environment.id] });
  assert.throws(() => launch(store, { charterId: restricted.id }), errorCode('CHARTER_INCOMPATIBLE_ENVIRONMENT'));
  const allowed = launch(store, { charterId: restricted.id, environmentId: environment.id });
  assert.deepEqual(allowed.executionPolicy, { maxSteps: 10, maxTokens: 6000, maxDurationMs: 60000, allowMutations: false, captureBodies: false });
});

test('archived references stay inspectable and restorable but unavailable selections cannot launch', async t => {
  const store = await setup(t);
  store.archiveEntity('environment', 'little-steps-local');
  store.archiveEntity('persona', 'mother');
  const charter = store.saveEntity('charter', { name: 'Preserved configuration', mission: 'Explore.', personaIds: ['mother'], defaultEnvironmentId: 'little-steps-local', compatibleEnvironmentIds: ['little-steps-local'] });
  store.saveEntity('charter', { mission: 'Temporary revision' }, charter.id);
  const restored = store.restoreEntity('charter', charter.id, { version: 1, expectedVersion: 2 });
  assert.deepEqual(restored.personaIds, ['mother']);
  assert.equal(restored.defaultEnvironmentId, 'little-steps-local');
  assert.throws(() => launch(store, { charterId: restored.id }), /Persona is unavailable/);
  store.archiveEntity('persona', 'mother', false);
  assert.throws(() => launch(store, { charterId: restored.id }), /Environment is unavailable/);
  store.archiveEntity('environment', 'little-steps-local', false);
  assert.equal(launch(store, { charterId: restored.id }).charterVersion, 3);
});
