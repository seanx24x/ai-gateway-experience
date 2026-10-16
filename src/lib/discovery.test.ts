import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CONFIG, inferenceCost, simulateRequest } from './gateway';
import { DISCOVERY_PROMPT, DISCOVERY_RESPONSE, withPreparedResponse } from './discovery';
import { getReplayDuration, getReplayFrame } from './replay';

test('the prepared reply stays consistent in replay, usage, cost and source receipt', () => {
  const source = simulateRequest(DEFAULT_CONFIG, 'model-fallback', DISCOVERY_PROMPT, 'demo_discovery_fallback');
  const original = structuredClone(source);
  const record = withPreparedResponse(source, DISCOVERY_RESPONSE);
  assert.equal(record.response, DISCOVERY_RESPONSE);
  assert.equal(record.prompt, DISCOVERY_PROMPT);
  assert.equal(record.servedModel, 'openai/gpt-5.4');
  assert.equal(record.outputTokens, Math.ceil(DISCOVERY_RESPONSE.length / 4));
  assert.equal(record.cost, inferenceCost(record.servedModel, record.inputTokens, record.outputTokens));
  assert.equal(record.ttftMs, source.ttftMs);
  assert.deepEqual(record.attempts, source.attempts);
  assert.equal(getReplayFrame(record, getReplayDuration(record)).output, DISCOVERY_RESPONSE);
  assert.deepEqual(source, original);
});

test('prepared copy never replaces a failed request explanation', () => {
  const failure = simulateRequest(DEFAULT_CONFIG, 'budget', DISCOVERY_PROMPT, 'demo_discovery_budget');
  assert.equal(withPreparedResponse(failure, DISCOVERY_RESPONSE), failure);
  assert.match(failure.response, /402/);
  assert.equal(failure.outputTokens, 0);
});
