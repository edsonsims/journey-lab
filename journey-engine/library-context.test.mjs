import test from 'node:test';
import assert from 'node:assert/strict';
import { composePersonaContext, composeCharterContext, effectiveExecutionPolicy } from './library-context.mjs';
import { requestAllowed } from './workspace-execution.mjs';

const declared = context => JSON.parse(context.slice(context.indexOf('{'), context.lastIndexOf('}') + 1));

test('every declared persona dimension reaches runtime while private and unknown fields stay out', () => {
  const persona = {
    name: 'Parent', role: 'client', lens: 'Household decision maker', context: 'After school',
    mission: 'Start a useful activity', decision: 'Can my child use this now?', resources: 'Phone, no printer',
    skills: 'Comfortable with web apps', initialKnowledge: 'An activity takes ten minutes', knowledge: 'Obsolete claim',
    constraints: 'One free hand', expectations: 'A visible first step', priorities: 'Start quickly',
    successCriteria: 'Child starts the activity', stopCriteria: 'Cannot start without equipment',
    priorRuns: ['hidden-history-canary'], memorySnapshot: 'hidden-memory-canary',
    credentials: 'hidden-secret-canary', allowMutations: true,
  };
  const before = structuredClone(persona), context = composePersonaContext(persona), values = declared(context);
  for (const key of ['name', 'role', 'lens', 'context', 'mission', 'decision', 'resources', 'skills', 'initialKnowledge', 'constraints', 'expectations', 'priorities', 'successCriteria', 'stopCriteria']) {
    assert.equal(values[key], persona[key], key);
  }
  assert.equal(values.continuity, 'first-time');
  assert.doesNotMatch(context, /hidden-|Obsolete claim|allowMutations/);
  assert.match(context, /does not override runtime instructions/);
  assert.match(context, /Do not import previous journey outcomes/);
  assert.deepEqual(persona, before);
});

test('legacy knowledge remains usable but explicit empty initial knowledge does not revive it', () => {
  assert.equal(declared(composePersonaContext({ label: 'Legacy name', knowledge: 'Declared legacy fact' })).initialKnowledge, 'Declared legacy fact');
  assert.equal(declared(composePersonaContext({ label: 'Legacy name' })).name, 'Legacy name');
  const empty = composePersonaContext({ initialKnowledge: '', knowledge: 'Do not restore this' });
  assert.equal(declared(empty).initialKnowledge, '');
  assert.doesNotMatch(empty, /Do not restore this/);
  for (const value of [null, undefined, [], 'unsupported']) {
    assert.equal(declared(composePersonaContext(value)).continuity, 'first-time');
  }
});

test('returning continuity only uses declared knowledge and never loads past observations', () => {
  const context = composePersonaContext({ continuity: 'returning', initialKnowledge: 'Knows the login screen', previousJourney: { goal: 'private-outcome-canary' } });
  assert.equal(declared(context).continuity, 'returning');
  assert.match(context, /No previous journey memory is loaded/);
  assert.match(context, /Do not invent past visits/);
  assert.doesNotMatch(context, /private-outcome-canary/);
  assert.equal(declared(composePersonaContext({ continuity: 'returning-ish' })).continuity, 'first-time');
});

test('bounded fields preserve valid complete context and final stop criteria', () => {
  const context = composePersonaContext({ context: `${'a'.repeat(15999)}😀${'z'.repeat(20000)}`, mission: 'm'.repeat(18000), stopCriteria: 'Stop when no suitable path is visible' });
  const values = declared(context);
  assert.match(values.context, /\[field shortened\]$/);
  assert.equal(values.context.includes('\uD83D'), false);
  assert.equal(values.mission.length, 12000 + ' [field shortened]'.length);
  assert.equal(values.stopCriteria, 'Stop when no suitable path is visible');
  assert.doesNotThrow(() => JSON.stringify(values));
});

test('charter context includes execution intent but treats sources and actions as bounded authored assumptions', () => {
  const charter = {
    name: 'First activity', mission: 'Start from the marketing site', scope: 'Discover and begin',
    startingState: 'Logged out', goals: 'Reach an activity', allowedActions: 'Create fictional progress',
    expectedBehaviorSources: 'The visible no-equipment promise', screens: ['Home', 'Activity', 'Home'],
    flows: ['Discover', 'Start'], successCriteria: 'First activity begins', stopCriteria: 'No suitable alternative',
    memoryPolicy: 'explicit', maxSteps: 12, captureBodies: true, previousFindings: 'hidden-finding-canary',
    repositoryPath: 'private-path-canary', storageStatePath: 'private-auth-canary',
  };
  const before = structuredClone(charter), context = composeCharterContext(charter), values = declared(context);
  for (const key of ['name', 'mission', 'scope', 'startingState', 'goals', 'allowedActions', 'expectedBehaviorSources', 'successCriteria', 'stopCriteria']) assert.equal(values[key], charter[key], key);
  assert.deepEqual(values.screens, ['Home', 'Activity']);
  assert.deepEqual(values.flows, ['Discover', 'Start']);
  assert.equal(values.memoryPolicy, 'explicit');
  assert.match(context, /never grant permissions/);
  assert.match(context, /not proof of observed behavior or verified source contents/);
  assert.match(context, /No prior-run memory is loaded by this memory policy/);
  assert.doesNotMatch(context, /hidden-finding|private-|captureBodies|maxSteps/);
  assert.deepEqual(charter, before);
  assert.equal(declared(composeCharterContext()).memoryPolicy, 'none');
});

test('policy uses the most restrictive environment, pinned and charter limits without changing snapshots', () => {
  const run = {
    projectId: 'project',
    environmentSnapshot: { maxSteps: 50, maxTokens: 500000, maxDurationMs: 700000, allowMutations: true, captureBodies: true },
    executionPolicy: { maxSteps: 30, maxTokens: 450000, maxDurationMs: 300000, allowMutations: false, captureBodies: true },
    charterSnapshot: { maxSteps: 40, maxTokens: 200000, maxDurationMs: 500000, allowMutations: true, captureBodies: false },
  };
  const before = structuredClone(run);
  assert.deepEqual(effectiveExecutionPolicy(run), { maxSteps: 30, maxTokens: 200000, maxDurationMs: 300000, allowMutations: false, captureBodies: false });
  assert.deepEqual(run, before);
  assert.equal(effectiveExecutionPolicy({ ...run, maxSteps: 9 }).maxSteps, 9);
  const bounded = effectiveExecutionPolicy({ projectId: 'project', environmentSnapshot: { maxSteps: 60, maxTokens: 2000000, maxDurationMs: 900000 }, executionPolicy: { maxSteps: 99, maxTokens: 9000000, maxDurationMs: 9999999, allowMutations: true, captureBodies: true }, charterSnapshot: { allowMutations: true, captureBodies: true } });
  assert.deepEqual(bounded, { maxSteps: 60, maxTokens: 2000000, maxDurationMs: 900000, allowMutations: false, captureBodies: false });
});

test('missing project grants are denied, legacy defaults survive, malformed settings do not widen permission', () => {
  assert.deepEqual(effectiveExecutionPolicy({}), { maxSteps: 24, maxTokens: 250000, maxDurationMs: 600000, allowMutations: true, captureBodies: false });
  const project = effectiveExecutionPolicy({ projectId: 'project', executionPolicy: { allowMutations: true, captureBodies: true }, persona: { continuity: 'returning' } });
  assert.equal(project.allowMutations, false);
  assert.equal(project.captureBodies, false);
  const malformed = effectiveExecutionPolicy({ projectId: 'project', environmentSnapshot: { maxSteps: NaN, maxTokens: Infinity, maxDurationMs: 'invalid', allowMutations: true, captureBodies: true }, charterSnapshot: { allowMutations: 'false', captureBodies: 'true' } });
  assert.deepEqual(malformed, { maxSteps: 24, maxTokens: 250000, maxDurationMs: 600000, allowMutations: false, captureBodies: false });
});

test('actual request enforcement respects charter and pinned restrictions on source and retest runs', () => {
  const base = { projectId: 'project', target: 'https://app.example.test/', environmentSnapshot: { allowMutations: true } };
  assert.equal(requestAllowed(base, 'https://app.example.test/data', 'POST'), true);
  for (const restrictive of [{ charterSnapshot: { allowMutations: false } }, { executionPolicy: { allowMutations: false }, charterSnapshot: { allowMutations: true } }]) {
    const source = { ...base, ...restrictive };
    assert.equal(requestAllowed(source, 'https://app.example.test/data', 'POST'), false);
    assert.equal(requestAllowed(source, 'https://app.example.test/data', 'GET'), true);
    const retest = { ...source, target: 'http://127.0.0.1:4510/', comparisonId: 'comparison' };
    assert.equal(requestAllowed(retest, 'http://127.0.0.1:4510/data', 'post'), false);
  }
  assert.equal(requestAllowed(base, 'https://app.example.test/data', 'delete'), false);
  assert.equal(requestAllowed({ ...base, environmentSnapshot: undefined }, 'https://app.example.test/data', 'POST'), false);
  assert.equal(requestAllowed({ target: 'http://localhost:4320/' }, 'http://localhost:4320/data', 'POST'), true);
});
