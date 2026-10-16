import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CONFIG, cancelRequest, simulateRequest, type RequestRecord } from './gateway';
import { getAttemptSpans, getObservedAttemptSpans, getReplayDuration, getReplayEvents, getReplayFrame } from './replay';

const record = (overrides: Partial<RequestRecord> = {}): RequestRecord => ({
  ...simulateRequest(structuredClone(DEFAULT_CONFIG), 'healthy', 'Timing fixture'), ...overrides,
});

test('attempt spans preserve cumulative routing intervals and keep generation separate', () => {
  const request = record({
    status: 'recovered', provider: 'bedrock', ttftMs: 500, durationMs: 1500,
    attempts: [
      { provider: 'anthropic', model: DEFAULT_CONFIG.model, status: 'failed', latencyMs: 100, reason: 'First unavailable.' },
      { provider: 'bedrock', model: DEFAULT_CONFIG.model, status: 'success', latencyMs: 300, reason: 'Response started.' },
    ],
  });
  assert.deepEqual(getAttemptSpans(request), [{ index: 0, start: 100, end: 200 }, { index: 1, start: 200, end: 500 }]);
  assert.equal(getReplayDuration(request), 1500);
  assert.equal(getReplayEvents(request).find(event => event.kind === 'first-token')?.atMs, 500);
  assert.equal(getReplayFrame(request, 499).activeAttempt, 1);
  assert.equal(getReplayFrame(request, 500).phase, 'streaming');
});

test('progressive evidence clips active time and withholds future provider causes and outcomes', () => {
  const request = record({
    status: 'recovered', provider: 'bedrock', ttftMs: 500, durationMs: 1500,
    attempts: [
      { provider: 'anthropic', model: DEFAULT_CONFIG.model, status: 'failed', latencyMs: 100, reason: 'Private future cause.' },
      { provider: 'bedrock', model: DEFAULT_CONFIG.model, status: 'success', latencyMs: 300, reason: 'Future successful outcome.' },
    ],
  });
  assert.deepEqual(getObservedAttemptSpans(request, 99), []);
  const active = getObservedAttemptSpans(request, 150);
  assert.equal(active.length, 1);
  assert.equal(active[0].end, 150);
  assert.equal(active[0].status, 'active');
  assert.equal(active[0].completed, false);
  assert.equal('reason' in active[0], false);
  const boundary = getObservedAttemptSpans(request, 200);
  assert.equal(boundary[0].reason, 'Private future cause.');
  assert.equal(boundary[1].status, 'active');
  assert.equal(boundary[1].end, 200);
  assert.equal('reason' in boundary[1], false);
  assert.equal(getObservedAttemptSpans(request, 500)[1].reason, 'Future successful outcome.');
});

test('failed requests reconstruct the observed routing window without inventing output', () => {
  const request = record({ status: 'failed', provider: null, servedModel: '', ttftMs: 0, durationMs: 318, response: 'All failed.', attempts: [
    { provider: 'anthropic', model: DEFAULT_CONFIG.model, status: 'failed', latencyMs: 100, reason: 'Unavailable.' },
    { provider: 'bedrock', model: DEFAULT_CONFIG.model, status: 'failed', latencyMs: 200, reason: 'Rate limited.' },
  ] });
  assert.deepEqual(getAttemptSpans(request), [{ index: 0, start: 18, end: 118 }, { index: 1, start: 118, end: 318 }]);
  assert.equal(getReplayEvents(request).some(event => event.kind === 'first-token'), false);
});

test('restriction exclusions remain zero-duration metadata with original selection indexes', () => {
  const request = record({ ttftMs: 0, durationMs: 118, status: 'failed', provider: null, servedModel: '', response: 'Restricted route unavailable.', attempts: [
    { provider: 'bedrock', model: DEFAULT_CONFIG.model, status: 'excluded', latencyMs: 0, reason: 'Excluded by restriction.' },
    { provider: 'anthropic', model: DEFAULT_CONFIG.model, status: 'failed', latencyMs: 100, reason: 'Unavailable.' },
  ] });
  assert.deepEqual(getAttemptSpans(request), [{ index: 0, start: 18, end: 18 }, { index: 1, start: 18, end: 118 }]);
  assert.deepEqual(getObservedAttemptSpans(request, 17), []);
  assert.equal(getObservedAttemptSpans(request, 18)[0].status, 'excluded');
  assert.equal(getObservedAttemptSpans(request, 18)[1].index, 1);
  assert.equal(getReplayEvents(request).filter(event => event.kind === 'attempt-start').length, 1);
});

test('cancellation uses its recorded cutoff and never recovers an unrecorded attempt', () => {
  const source = simulateRequest(structuredClone(DEFAULT_CONFIG), 'provider-failure', 'Timing fixture');
  const beforeProvider = cancelRequest(source, 0, '', 150);
  assert.deepEqual(getAttemptSpans(beforeProvider), []);
  assert.deepEqual(getObservedAttemptSpans(beforeProvider), []);
  assert.equal(getReplayDuration(beforeProvider), 150);
  const partial = cancelRequest(source, 2, 'Partial output', source.ttftMs + 250);
  assert.equal(getAttemptSpans(partial).at(-1)?.end, partial.ttftMs);
  assert.equal(getReplayDuration(partial), source.ttftMs + 250);
  assert.equal(getReplayFrame(partial, getReplayDuration(partial)).output, 'Partial output');
  assert.equal(partial.usageKnown, false);
});

test('preflight failures and invalid positions do not expose any provider event', () => {
  const request = simulateRequest(structuredClone(DEFAULT_CONFIG), 'invalid-key', 'Timing fixture');
  assert.deepEqual(getAttemptSpans(request), []);
  assert.equal(getReplayDuration(request), 24);
  const success = record();
  for (const position of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) assert.deepEqual(getObservedAttemptSpans(success, position), []);
});
