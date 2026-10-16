import test from 'node:test';
import assert from 'node:assert/strict';
import { createRehearsalFixture, DEFAULT_CONFIG, rehearseRequest, routingCode } from './gateway';
import { withRehearsalConditions, restoreRehearsalContext } from './rehearsal-conditions';
import { restoreVirtualModelSessions } from './virtual-models';
import { workingComparisonSignature } from './working-connection';

test('multiple outages stay provider keyed, pure and deterministic through reorder', () => {
  const base = createRehearsalFixture(null, 'Support this customer');
  const fixture = withRehearsalConditions(base, { anthropic: false, bedrock: false });
  const other = withRehearsalConditions(base, { bedrock: false, anthropic: false });
  assert.deepEqual(fixture, other);
  assert.equal(base.providers.bedrock.available, true);
  const config = { ...structuredClone(DEFAULT_CONFIG), order: ['bedrock','anthropic','vertex'] as typeof DEFAULT_CONFIG.order };
  const result = rehearseRequest(config, fixture, 'test', 1);
  assert.equal(result.attempts.find(a => a.provider === 'bedrock')?.status, 'failed');
  assert.equal(result.attempts.find(a => a.provider === 'anthropic')?.status, 'failed');
  assert.equal(result.fixtureId, fixture.id);
  assert.equal(routingCode(config).includes('conditions'), false);
});
test('condition edits invalidate a comparison and reset restores the original fixture', () => {
  const base = createRehearsalFixture(null, 'same workload');
  const changed = withRehearsalConditions(base, { anthropic: true });
  assert.notEqual(workingComparisonSignature(DEFAULT_CONFIG, changed, null, DEFAULT_CONFIG), workingComparisonSignature(DEFAULT_CONFIG, base, null, DEFAULT_CONFIG));
  assert.deepEqual(withRehearsalConditions(base, {}), base);
  assert.equal(changed.prompt, base.prompt);
  assert.equal(changed.response, base.response);
});
test('legacy sessions survive and malformed rehearsal context resets independently', () => {
  const legacy = { draft: structuredClone(DEFAULT_CONFIG), pending: null, sourceId: null };
  assert.deepEqual(restoreVirtualModelSessions({ [DEFAULT_CONFIG.slug]: legacy })[DEFAULT_CONFIG.slug], legacy);
  assert.deepEqual(restoreVirtualModelSessions({ [DEFAULT_CONFIG.slug]: { ...legacy, rehearsal: { base: 'invalid' } } })[DEFAULT_CONFIG.slug], legacy);
  const rehearsal = { base: createRehearsalFixture(null, 'hello'), overrides: { bedrock: false } };
  assert.deepEqual(restoreVirtualModelSessions({ [DEFAULT_CONFIG.slug]: { ...legacy, rehearsal } })[DEFAULT_CONFIG.slug].rehearsal, rehearsal);
  assert.equal(restoreRehearsalContext({ ...rehearsal, overrides: { unknown: true } }), null);
  const corrupt = structuredClone(rehearsal); corrupt.base.providers.bedrock.latencyMs = Infinity;
  assert.equal(restoreRehearsalContext(corrupt), null);
});

test('all primary outages trigger model fallback; a restriction remains an exclusion', () => {
  const base = createRehearsalFixture(null, 'Keep the request going');
  const fixture = withRehearsalConditions(base, { anthropic:false, bedrock:false, vertex:false });
  const recovered = rehearseRequest(DEFAULT_CONFIG, fixture, 'fallback', 1);
  assert.equal(recovered.status, 'recovered');
  assert.notEqual(recovered.servedModel, DEFAULT_CONFIG.model);
  const restricted = rehearseRequest({ ...DEFAULT_CONFIG, only:['anthropic'] }, fixture, 'restricted', 2);
  assert.equal(restricted.status, 'failed');
  assert.equal(restricted.attempts.filter(attempt => attempt.status === 'failed').length, 1);
  assert.ok(restricted.attempts.some(attempt => attempt.status === 'excluded'));
  const unavailable = withRehearsalConditions(base, { anthropic:false, bedrock:false, vertex:false, openai:false, azure:false });
  assert.equal(rehearseRequest(DEFAULT_CONFIG, unavailable, 'all-failed', 3).status, 'failed');
});
