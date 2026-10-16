import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CONFIG, rehearseRequest, simulateRequest, type RoutingConfig } from './gateway';
import { captureWorkingSource, workingComparisonSignature } from './working-connection';

const config = (): RoutingConfig => structuredClone(DEFAULT_CONFIG);
const source = () => simulateRequest(config(), 'provider-failure', '  A captured support workload.\n', 'source_request', 1000);

test('captured evidence stays detached and immutable while the prompt retains exact whitespace', () => {
  const original = source();
  const captured = captureWorkingSource(original, 'Fallback workload', config());
  original.prompt = 'Edited later';
  original.attempts[0].reason = 'Edited later';
  original.configSnapshot!.order.reverse();

  assert.equal(captured.prompt, '  A captured support workload.\n');
  assert.equal(captured.promptOrigin, 'captured');
  assert.equal(captured.configOrigin, 'captured');
  assert.equal(captured.fixture.prompt, captured.prompt);
  assert.deepEqual(captured.config.order, DEFAULT_CONFIG.order);
  assert.equal(captured.record.prompt, captured.prompt);
  assert.notEqual(captured.record.attempts[0].reason, original.attempts[0].reason);
  assert.ok(Object.isFrozen(captured.record.attempts[0]));
  assert.ok(Object.isFrozen(captured.config.order));
  assert.ok(Object.isFrozen(captured.fixture.providers.anthropic));
  assert.throws(() => captured.config.order.push('azure'), TypeError);
});

test('legacy fallback context is explicit and does not rewrite the historical receipt', () => {
  const legacy = source();
  delete legacy.prompt;
  delete legacy.configSnapshot;
  const fallback = config();
  const captured = captureWorkingSource(legacy, '  Supplied local workload  ', fallback);
  fallback.order.reverse();

  assert.equal(captured.promptOrigin, 'fallback');
  assert.equal(captured.configOrigin, 'fallback');
  assert.equal(captured.prompt, '  Supplied local workload  ');
  assert.equal(captured.fixture.prompt, captured.prompt);
  assert.equal(captured.record.prompt, undefined);
  assert.equal(captured.record.configSnapshot, undefined);
  assert.deepEqual(captured.config.order, DEFAULT_CONFIG.order);
});

test('a comparison keeps the recorded failure on its provider when the draft is reordered', () => {
  const captured = captureWorkingSource(source(), 'Fallback workload', config());
  const draft = config();
  draft.order = ['bedrock', 'anthropic', 'vertex'];
  const before = rehearseRequest(captured.config, captured.fixture, 'baseline_request', 2000);
  const after = rehearseRequest(draft, captured.fixture, 'draft_request', 2001);

  assert.equal(before.status, 'recovered');
  assert.equal(before.attempts[0].provider, 'anthropic');
  assert.equal(before.attempts[0].status, 'failed');
  assert.equal(after.status, 'success');
  assert.deepEqual(after.attempts.map(attempt => attempt.provider), ['bedrock']);
  assert.notEqual(before.id, after.id);
  assert.equal(before.prompt, after.prompt);
  assert.equal(before.fixtureId, after.fixtureId);
  assert.equal(before.sourceId, captured.record.id);
  assert.equal(after.sourceId, captured.record.id);
  assert.deepEqual(captured.config.order, DEFAULT_CONFIG.order);
});

test('the tested signature invalidates changed source, exact input, identity, and provider conditions', () => {
  const captured = captureWorkingSource(source(), 'Fallback workload', config());
  const draft = config();
  const signature = workingComparisonSignature(draft, captured.fixture, captured.record, captured.config);
  const changedSource = { ...captured.record, id: 'another_source' };
  assert.notEqual(signature, workingComparisonSignature(draft, captured.fixture, changedSource, captured.config));
  assert.notEqual(signature, workingComparisonSignature(draft, { ...captured.fixture, prompt: captured.prompt.trim() }, captured.record, captured.config));
  assert.notEqual(signature, workingComparisonSignature(draft, { ...captured.fixture, auth: 'api-key' }, captured.record, captured.config));
  const changedFixture = structuredClone(captured.fixture);
  changedFixture.providers.anthropic.available = true;
  assert.notEqual(signature, workingComparisonSignature(draft, changedFixture, captured.record, captured.config));
  changedFixture.providers.anthropic.available = false;
  changedFixture.providers.bedrock.latencyMs += 1;
  assert.notEqual(signature, workingComparisonSignature(draft, changedFixture, captured.record, captured.config));
});

test('signature tracks baseline and draft options, remains stable after save, and ignores property insertion order', () => {
  const captured = captureWorkingSource(source(), 'Fallback workload', config());
  const draft = config();
  const signature = workingComparisonSignature(draft, captured.fixture, captured.record, captured.config);
  assert.equal(signature, workingComparisonSignature({ ...draft, revision: 2 }, captured.fixture, captured.record, { ...captured.config, revision: 2 }));
  const reorderedObject = Object.fromEntries(Object.entries(draft).reverse()) as unknown as RoutingConfig;
  assert.equal(signature, workingComparisonSignature(reorderedObject, captured.fixture, captured.record, captured.config));
  assert.notEqual(signature, workingComparisonSignature({ ...draft, order: ['bedrock', 'anthropic', 'vertex'] }, captured.fixture, captured.record, captured.config));
  assert.notEqual(signature, workingComparisonSignature(draft, captured.fixture, captured.record, { ...captured.config, only: ['bedrock'] }));
});
