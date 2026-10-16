import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CONFIG, simulateRequest, type RoutingConfig } from './gateway';
import { observedRouteStages, previewRouteStages, replaceModelPreferenceOrder } from './route-viewmodel';

const config = (overrides: Partial<RoutingConfig> = {}): RoutingConfig => ({ ...structuredClone(DEFAULT_CONFIG), ...overrides });

test('automatic routing is an unordered eligible pool, even with a sorting strategy', () => {
  const stage = previewRouteStages(config({ order: [], sort: 'ttft' }))[0];
  assert.equal(stage.preferred.length, 0);
  assert.deepEqual(stage.pool.map(row => row.provider), ['anthropic', 'bedrock', 'vertex']);
  assert.ok(stage.pool.every(row => row.preferencePosition === undefined && row.attemptIndex === undefined));
});

test('preferences are numbered only when eligible; exclusions remain separate across all models', () => {
  const stages = previewRouteStages(config({ order: ['bedrock', 'anthropic'], only: ['anthropic'] }));
  assert.deepEqual(stages[0].preferred.map(row => [row.provider, row.preferencePosition]), [['anthropic', 1]]);
  assert.deepEqual(stages[0].excluded.map(row => row.provider), ['bedrock', 'vertex']);
  assert.equal(stages[1].preferred.length + stages[1].pool.length, 0);
  assert.deepEqual(stages[1].excluded.map(row => row.provider), ['openai', 'azure']);
});

test('live trace reveals only observed attempts, while future candidates stay unnumbered', () => {
  const record = simulateRequest(config(), 'model-fallback', 'Help');
  const stages = observedRouteStages(record, 1, 1);
  assert.deepEqual(stages[0].observed.map(row => [row.provider, row.status, row.attemptIndex]), [['anthropic', 'failed', 0], ['bedrock', 'active', 1]]);
  assert.equal(stages[0].observed[1].latencyMs, undefined);
  assert.deepEqual(stages[0].pool.map(row => row.provider), ['vertex']);
  assert.ok(stages[0].pool.every(row => row.attemptNumber === undefined));
  assert.equal(stages[1].reached, false);
  assert.equal(stages[1].observed.length, 0);
});

test('model fallback becomes reached only when a provider in that model was observed', () => {
  const record = simulateRequest(config(), 'model-fallback', 'Help');
  const before = observedRouteStages(record, 3);
  const after = observedRouteStages(record, 4, 3);
  assert.equal(before[1].reached, false);
  assert.equal(after[1].reached, true);
  assert.equal(after[1].observed[0].attemptIndex, 3);
  assert.equal(after[1].observed[0].status, 'active');
});

test('repeated providers remain separate model-qualified attempt identities', () => {
  const record = simulateRequest(config({ fallbacks: ['anthropic/claude-haiku-4.5'] }), 'healthy', 'Help');
  record.attempts = [
    { provider: 'anthropic', model: record.model, status: 'failed', latencyMs: 20, reason: 'First failed.' },
    { provider: 'anthropic', model: 'anthropic/claude-haiku-4.5', status: 'failed', latencyMs: 30, reason: 'Second failed.' },
    { provider: 'anthropic', model: record.model, status: 'success', latencyMs: 40, reason: 'Third served.' },
  ];
  const rows = observedRouteStages(record).flatMap(stage => stage.observed);
  assert.deepEqual(rows.map(row => row.attemptIndex), [0, 1, 2]);
  assert.equal(new Set(rows.map(row => row.key)).size, 3);
  assert.deepEqual(rows.map(row => row.reason), ['First failed.', 'Second failed.', 'Third served.']);
});

test('Gateway rejection does not present unused providers as failed attempts', () => {
  const record = simulateRequest(config(), 'invalid-key', 'Help');
  const stages = observedRouteStages(record);
  assert.equal(stages.flatMap(stage => stage.observed).length, 0);
  assert.ok(stages.flatMap(stage => stage.pool).every(row => row.status === 'idle'));
});

test('excluded providers never become numbered attempts or a reached fallback stage', () => {
  const record = simulateRequest(config({ only: ['anthropic'] }), 'model-fallback', 'Help');
  const stages = observedRouteStages(record);
  assert.ok(stages.flatMap(stage => stage.observed).every(row => row.status !== 'excluded'));
  assert.equal(stages[1].reached, false);
  assert.equal(stages[1].excluded.length, 2);
});

test('reordering one model preserves preferences for other models', () => {
  const routing = config({ order: ['anthropic', 'openai', 'bedrock', 'azure', 'vertex'] });
  assert.deepEqual(replaceModelPreferenceOrder(routing, routing.model, ['vertex', 'bedrock', 'anthropic']), ['vertex', 'openai', 'bedrock', 'azure', 'anthropic']);
  assert.deepEqual(replaceModelPreferenceOrder(routing, 'openai/gpt-5.4', ['azure', 'openai']), ['anthropic', 'azure', 'bedrock', 'openai', 'vertex']);
});

test('older receipts retain exclusion evidence without inventing attempts', () => {
  const record = simulateRequest(config({ only: ['anthropic'] }), 'model-fallback', 'Help');
  delete record.configSnapshot;
  const stages = observedRouteStages(record);
  assert.equal(stages.flatMap(stage => stage.excluded).length, 4);
  assert.equal(stages.flatMap(stage => stage.observed).length, 1);
  assert.ok(stages.flatMap(stage => stage.excluded).every(row => row.attemptIndex === undefined));
});

test('reordering eligible preferences preserves temporarily restricted preferences', () => {
  const routing = config({ order: ['anthropic', 'bedrock', 'vertex'], only: ['anthropic', 'vertex'] });
  assert.deepEqual(replaceModelPreferenceOrder(routing, routing.model, ['vertex', 'anthropic']), ['vertex', 'bedrock', 'anthropic']);
});

test('a primary excluded in full stays before the reached fallback model', () => {
  const record = simulateRequest(config({ only: ['azure'] }), 'healthy', 'Help');
  const stages = observedRouteStages(record);
  assert.deepEqual(stages.map(stage => stage.modelId), [DEFAULT_CONFIG.model, 'openai/gpt-5.4']);
  assert.equal(stages[0].observed.length, 0);
  assert.equal(stages[0].excluded.length, 3);
  assert.equal(stages[1].observed[0].provider, 'azure');
  assert.equal(stages[1].reached, true);
});
