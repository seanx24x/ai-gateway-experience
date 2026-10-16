import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_CONFIG,
  DEMO_NOW,
  MODELS,
  cancelRequest,
  createRehearsalFixture,
  createSeedRequests,
  eligibleProviders,
  formatCost,
  getMetrics,
  inferenceCost,
  rehearseRequest,
  routingCode,
  scenarioConfig,
  simulateRequest,
  validateConfig,
  type RoutingConfig,
  type Scenario,
} from './gateway';
import { getReplayDuration, getReplayEvents, getReplayFrame } from './replay';

const config = (overrides: Partial<RoutingConfig> = {}): RoutingConfig => ({
  ...DEFAULT_CONFIG,
  order: [...DEFAULT_CONFIG.order],
  only: [],
  fallbacks: [...DEFAULT_CONFIG.fallbacks],
  tags: [...DEFAULT_CONFIG.tags],
  ...overrides,
});

test('ordering promotes preferences without restricting unlisted eligible providers', () => {
  assert.deepEqual(eligibleProviders(config({ order: ['bedrock'] })), ['bedrock', 'anthropic', 'vertex']);
  assert.deepEqual(eligibleProviders(config({ order: ['bedrock', 'anthropic'], only: ['anthropic', 'vertex'] })), ['anthropic', 'vertex']);
  assert.deepEqual(eligibleProviders(config({ order: [], sort: 'ttft' })), ['vertex', 'anthropic', 'bedrock']);
  assert.deepEqual(eligibleProviders(config({ order: ['anthropic'], sort: 'ttft' })), ['anthropic', 'vertex', 'bedrock']);
});

test('same-model provider recovery preserves the requested model', () => {
  const result = simulateRequest(config(), 'provider-failure', 'Help a support team', 'demo_recover');
  assert.equal(result.status, 'recovered');
  assert.equal(result.model, DEFAULT_CONFIG.model);
  assert.equal(result.servedModel, result.model);
  assert.equal(result.provider, 'bedrock');
  assert.deepEqual(result.attempts.map((attempt) => attempt.status), ['failed', 'success']);
  assert.equal(result.ttftMs, 18 + result.attempts.reduce((sum, attempt) => sum + attempt.latencyMs, 0));
});

test('model fallback waits for all primary providers and uses a provider that serves the backup', () => {
  const result = simulateRequest(config(), 'model-fallback', 'Help a support team', 'demo_model');
  assert.equal(result.status, 'recovered');
  assert.equal(result.servedModel, 'openai/gpt-5.4');
  assert.equal(result.provider, 'openai');
  assert.deepEqual(result.attempts.slice(0, 3).map((attempt) => attempt.status), ['failed', 'failed', 'failed']);
  assert.equal(result.attempts[3].model, 'openai/gpt-5.4');
});

test('provider restrictions apply to every model and cannot be bypassed by fallback', () => {
  const result = simulateRequest(config({ only: ['anthropic'] }), 'model-fallback', 'Help a support team');
  assert.equal(result.status, 'failed');
  assert.equal(result.provider, null);
  assert.equal(result.servedModel, '');
  assert.equal(result.outputTokens, 0);
  assert.equal(result.ttftMs, 0);
  assert.deepEqual(result.attempts.filter((attempt) => attempt.status !== 'excluded').map((attempt) => attempt.provider), ['anthropic']);
  assert.deepEqual(result.attempts.filter((attempt) => attempt.model === 'openai/gpt-5.4').map((attempt) => attempt.status), ['excluded', 'excluded']);
});

test('allowlist can permit a later model while excluding every primary provider', () => {
  const result = simulateRequest(config({ only: ['azure'] }), 'healthy', 'Hello');
  assert.equal(result.status, 'recovered');
  assert.equal(result.provider, 'azure');
  assert.equal(result.servedModel, 'openai/gpt-5.4');
  assert.equal(result.attempts.filter((attempt) => attempt.status === 'failed').length, 0);
});

test('a hard restriction and simulated outage end in a truthful failure', () => {
  const result = simulateRequest(config({ only: ['bedrock'] }), 'restricted', 'Hello');
  assert.equal(result.status, 'failed');
  assert.equal(result.provider, null);
  assert.equal(result.attempts.filter((attempt) => attempt.status === 'failed').length, 1);
  assert.equal(result.attempts.some((attempt) => attempt.status === 'success'), false);
});

test('every generated attempt uses a provider from that model snapshot', () => {
  const scenarios: Scenario[] = ['healthy', 'provider-failure', 'model-fallback', 'restricted'];
  for (const model of MODELS) {
    for (const scenario of scenarios) {
      const result = simulateRequest(config({ model: model.id, fallbacks: MODELS.filter((item) => item.id !== model.id).map((item) => item.id) }), scenario, 'Hello');
      for (const attempt of result.attempts) {
        assert.ok(MODELS.find((item) => item.id === attempt.model)?.providers.includes(attempt.provider));
      }
      assert.equal(result.attempts.filter((attempt) => attempt.status === 'success').length, result.provider ? 1 : 0);
    }
  }
});

test('budget and rate-limit rejection have no successful inference or provider', () => {
  for (const scenario of ['budget', 'rate-limit'] as const) {
    const result = simulateRequest(config(), scenario, 'Hello');
    assert.equal(result.status, 'failed');
    assert.equal(result.provider, null);
    assert.equal(result.attempts.filter(attempt => attempt.status === 'success').length, 0);
    if (scenario === 'budget') assert.equal(result.attempts.length, 0);
    else {
      assert.equal(result.attempts.length, 5);
      assert.ok(result.attempts.every(attempt => attempt.status === 'failed' && attempt.reason.includes('429')));
    }
    assert.equal(result.cost, 0);
    assert.equal(result.outputTokens, 0);
    assert.equal(result.ttftMs, 0);
  }
});

test('access and setup failures stop before inference with actionable recovery', () => {
  const scenarios: Scenario[] = ['invalid-key', 'expired-oidc', 'model-unavailable'];
  for (const scenario of scenarios) {
    const route = config({ only: ['anthropic'] });
    const result = simulateRequest(route, scenario, 'Hello');
    assert.equal(result.status, 'failed');
    assert.equal(result.provider, null);
    assert.equal(result.servedModel, '');
    assert.deepEqual(result.attempts, []);
    assert.equal(result.cost, 0);
    assert.equal(result.inputTokens, 0);
    assert.equal(result.outputTokens, 0);
    assert.equal(result.ttftMs, 0);
    assert.equal(result.usageKnown, true);
    assert.deepEqual(result.configSnapshot, route);
    assert.deepEqual(result, simulateRequest(route, scenario, 'Hello'));
  }
  assert.match(simulateRequest(config(), 'invalid-key', 'Hello').response, /401.*precedence over OIDC/);
  assert.match(simulateRequest(config(), 'expired-oidc', 'Hello').response, /401.*12 hours.*vercel env pull/);
  assert.match(simulateRequest(config(), 'model-unavailable', 'Hello').response, /catalog availability and credit-tier eligibility/);
  assert.doesNotMatch(simulateRequest(config(), 'model-unavailable', 'Hello').response, /\b(?:400|401|403|404|402|429)\b/);
});

test('simulation is reproducible and does not mutate the supplied configuration', () => {
  const original = config();
  const snapshot = structuredClone(original);
  assert.deepEqual(simulateRequest(original, 'provider-failure', 'Hello'), simulateRequest(original, 'provider-failure', 'Hello'));
  assert.deepEqual(original, snapshot);
});

test('metrics reconcile across 48 requests and the six-request recovery spike', () => {
  const requests = createSeedRequests();
  const metrics = getMetrics(requests);
  assert.equal(requests.length, 48);
  assert.equal(new Set(requests.map((request) => request.id)).size, 48);
  assert.equal(new Set(requests.map((request) => Math.floor(request.timestamp / 3_600_000))).size, 8);
  assert.ok(requests.every((request) => request.timestamp <= DEMO_NOW));
  assert.equal(metrics.recovered, 6);
  assert.equal(metrics.successRate, 100);
  assert.equal(metrics.spend, requests.reduce((total, request) => total + request.cost, 0));
  assert.equal(metrics.avgTokens, requests.reduce((total, request) => total + request.inputTokens + request.outputTokens, 0) / 48);
  const recovery = requests.filter((request) => request.status === 'recovered');
  assert.ok(getMetrics(recovery).p75Ttft! > getMetrics(requests.filter((request) => request.status === 'success')).p75Ttft!);
});

test('percentile uses nearest rank and does not turn rejected requests into zero TTFT', () => {
  const requests = [100, 200, 300, 400].map((ttftMs, index) => ({ ...simulateRequest(config(), 'healthy', 'Hello', `sample_${index}`), ttftMs }));
  requests.push(simulateRequest(config(), 'budget', 'Hello'));
  const metrics = getMetrics(requests);
  assert.equal(metrics.p75Ttft, 300);
  assert.equal(metrics.successRate, 80);
  assert.equal(metrics.failed, 1);
  assert.deepEqual(getMetrics([]), { count: 0, spend: 0, successRate: null, p75Ttft: null, avgTokens: null, recovered: 0, successful: 0, failed: 0, cancelled: 0, unknownUsage: 0 });
});

test('inference price uses the served model rate and explicitly formats USD', () => {
  assert.equal(inferenceCost('anthropic/claude-sonnet-4.6', 1000, 1000), 0.018);
  assert.equal(inferenceCost('anthropic/claude-haiku-4.5', 1000, 1000), 0.006);
  assert.equal(formatCost(0.006), '$0.0060');
  const request = simulateRequest(config(), 'model-fallback', 'Hello');
  assert.equal(request.cost, inferenceCost(request.servedModel, request.inputTokens, request.outputTokens));
});

test('invalid configuration retains a validation explanation and never sends an attempt', () => {
  const invalid = config({ slug: 'Support Agent', model: 'unknown/model', fallbacks: ['unknown/model'], order: ['anthropic', 'anthropic'] });
  assert.ok(validateConfig(invalid).length >= 3);
  assert.equal(simulateRequest(invalid, 'healthy', 'Hello').attempts.length, 0);
  assert.equal(simulateRequest(config(), 'healthy', '   ').status, 'failed');
});

test('generated routing code has the same draft options without a fictional default sort', () => {
  const code = routingCode(config({ only: ['anthropic'], sort: 'ttft' }));
  assert.match(code, /"only": \[\s*"anthropic"\s*\]/);
  assert.match(code, /"models": \[\s*"openai\/gpt-5\.4"\s*\]/);
  assert.match(code, /"sort": "ttft"/);
  assert.doesNotMatch(routingCode(config()), /"sort": "default"/);
  assert.doesNotMatch(code, /vmc\//);
  assert.match(routingCode(config(), 'openai'), /https:\/\/ai-gateway\.vercel\.sh\/v1/);
});

test('restricted rehearsal temporarily allows only the first eligible primary provider', () => {
  const saved = config({ order: ['bedrock', 'anthropic'], only: ['anthropic', 'vertex'] });
  const snapshot = structuredClone(saved);
  assert.deepEqual(scenarioConfig(saved, 'restricted').only, ['anthropic']);
  const result = simulateRequest(saved, 'restricted', 'Hello');
  assert.deepEqual(result.configSnapshot?.only, ['anthropic']);
  assert.deepEqual(result.attempts.filter(attempt => attempt.status !== 'excluded').map(attempt => attempt.provider), ['anthropic']);
  assert.deepEqual(saved, snapshot);
});

test('request snapshots preserve exact model, order, tags, and revision independently', () => {
  const source = config({ model: MODELS[1].id, order: ['vertex', 'anthropic'], tags: ['feature:search'] });
  const result = simulateRequest(source, 'healthy', 'Hello');
  source.order.reverse();
  source.tags[0] = 'changed';
  assert.equal(result.configSnapshot?.model, MODELS[1].id);
  assert.deepEqual(result.configSnapshot?.order, ['vertex', 'anthropic']);
  assert.deepEqual(result.configSnapshot?.tags, ['feature:search']);
  for (const record of createSeedRequests()) {
    assert.equal(record.configSnapshot?.model, record.model);
    assert.equal(record.configSnapshot?.revision, record.revision);
    assert.equal(record.configSnapshot?.tags[0], record.tag);
  }
});

test('cancelled records retain only observed routing and unknown final usage', () => {
  const result = simulateRequest(config(), 'provider-failure', 'Hello');
  const beforeProvider = cancelRequest(result, 0, '');
  assert.equal(beforeProvider.provider, null);
  assert.equal(beforeProvider.servedModel, '');
  assert.equal(beforeProvider.attempts.length, 0);
  const afterFailure = cancelRequest(result, 1, '');
  assert.equal(afterFailure.provider, null);
  assert.equal(afterFailure.attempts.length, 1);
  const partial = cancelRequest(result, 2, 'A partial answer');
  assert.equal(partial.provider, 'bedrock');
  assert.equal(partial.response, 'A partial answer');
  assert.equal(partial.usageKnown, false);
  assert.equal(partial.durationMs, 0);
  assert.equal(result.status, 'recovered');
  const metrics = getMetrics([result, { ...partial, cost: 999 }]);
  assert.equal(metrics.spend, result.cost);
  assert.equal(metrics.successRate, 100);
  assert.equal(metrics.unknownUsage, 1);
  assert.equal(metrics.cancelled, 1);
  assert.equal(metrics.p75Ttft, result.ttftMs);
  assert.equal(getMetrics([partial]).successRate, null);
  assert.equal(getMetrics([{ ...result, usageKnown: false }]).avgTokens, null);
  assert.equal(getMetrics([{ ...result, usageKnown: false }]).spend, 0);
});

test('every receipt persists the exact workload without trimming or replacing whitespace', () => {
  const prompt = '  A support question\nwith two lines.  ';
  assert.equal(simulateRequest(config(), 'healthy', prompt).prompt, prompt);
  assert.equal(simulateRequest(config(), 'invalid-key', prompt).prompt, prompt);
  assert.ok(createSeedRequests().every((record) => record.prompt?.startsWith('Suggest a useful support response for demo customer ')));
});

test('reordering a fixed rehearsal does not move the provider failure to the new first position', () => {
  const fixture = createRehearsalFixture(null, 'Help a customer');
  const before = structuredClone(fixture);
  const baseline = rehearseRequest(config(), fixture, 'baseline', DEMO_NOW);
  const draft = rehearseRequest(config({ order: ['bedrock', 'anthropic', 'vertex'], revision: 2 }), fixture, 'draft', DEMO_NOW + 1);
  assert.equal(fixture.providers.anthropic.available, false);
  assert.equal(fixture.providers.bedrock.available, true);
  assert.deepEqual(baseline.attempts.map((attempt) => [attempt.provider, attempt.status]), [['anthropic', 'failed'], ['bedrock', 'success']]);
  assert.deepEqual(draft.attempts.map((attempt) => [attempt.provider, attempt.status]), [['bedrock', 'success']]);
  assert.equal(baseline.attempts[1].latencyMs, draft.attempts[0].latencyMs);
  assert.equal(baseline.ttftMs - draft.ttftMs, fixture.providers.anthropic.latencyMs);
  assert.equal(baseline.fixtureId, draft.fixtureId);
  assert.equal(baseline.prompt, draft.prompt);
  assert.equal(baseline.response, draft.response);
  assert.equal(baseline.inputTokens, draft.inputTokens);
  assert.equal(baseline.outputTokens, draft.outputTokens);
  assert.deepEqual(fixture, before);
  assert.equal(baseline.revision, 1);
  assert.equal(draft.revision, 2);
});

test('source rehearsal preserves prompt, identity, known workload and provider-specific observed timing', () => {
  const source = simulateRequest(config(), 'provider-failure', '  Exact source prompt\n', 'source');
  source.auth = 'api-key';
  const fixture = createRehearsalFixture(source, 'Ignored replacement prompt');
  const baseline = rehearseRequest(source.configSnapshot!, fixture, 'again', DEMO_NOW);
  const another = rehearseRequest(source.configSnapshot!, fixture, 'different-id', DEMO_NOW + 60);
  assert.equal(fixture.prompt, source.prompt);
  assert.equal(fixture.auth, 'api-key');
  assert.equal(fixture.providers.anthropic.available, false);
  assert.equal(fixture.providers.anthropic.latencyMs, source.attempts[0].latencyMs);
  assert.equal(fixture.providers.bedrock.latencyMs, source.attempts[1].latencyMs);
  assert.equal(baseline.ttftMs, source.ttftMs);
  assert.equal(baseline.durationMs, source.durationMs);
  assert.equal(baseline.cost, source.cost);
  assert.equal(baseline.sourceId, source.id);
  assert.equal(baseline.fixtureId, fixture.id);
  assert.equal(baseline.auth, 'api-key');
  assert.deepEqual(baseline.attempts, another.attempts);
  assert.equal(baseline.durationMs, another.durationMs);
});

test('fixed conditions preserve fallback exclusions and allow only actually eligible providers', () => {
  const source = simulateRequest(config(), 'model-fallback', 'Help a customer', 'all-primary-failed');
  const fixture = createRehearsalFixture(source, 'Hello');
  const restricted = rehearseRequest(config({ only: ['anthropic'] }), fixture, 'restricted', DEMO_NOW);
  assert.equal(restricted.status, 'failed');
  assert.equal(restricted.outputTokens, 0);
  assert.equal(restricted.provider, null);
  assert.deepEqual(restricted.attempts.filter((attempt) => attempt.status !== 'excluded').map((attempt) => attempt.provider), ['anthropic']);
  const permitted = rehearseRequest(config({ only: ['anthropic', 'azure'], order: ['azure', 'anthropic'] }), fixture, 'permitted', DEMO_NOW);
  assert.equal(permitted.provider, 'azure');
  assert.equal(permitted.servedModel, MODELS[2].id);
  assert.equal(permitted.status, 'recovered');
  for (const attempt of permitted.attempts) {
    assert.ok(MODELS.find((model) => model.id === attempt.model)?.providers.includes(attempt.provider));
  }
  assert.equal(permitted.cost, inferenceCost(permitted.servedModel, fixture.inputTokens, fixture.outputTokens));
});

test('rehearsal validation keeps the recorded options and never sends invalid requests', () => {
  const fixture = createRehearsalFixture(null, 'Hello');
  const invalid = config({ model: 'unknown' });
  const result = rehearseRequest(invalid, fixture, 'invalid', DEMO_NOW);
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.attempts, []);
  assert.deepEqual(result.configSnapshot, invalid);
  assert.equal(result.fixtureId, fixture.id);
  assert.equal(rehearseRequest(config(), createRehearsalFixture(null, '  '), 'empty', DEMO_NOW).attempts.length, 0);
});

test('replay uses cumulative routing time with first output and progressive recorded text', () => {
  const record = simulateRequest(config(), 'provider-failure', 'Hello', 'timeline');
  const before = structuredClone(record);
  const events = getReplayEvents(record);
  const failureEnd = 18 + record.attempts[0].latencyMs;
  assert.deepEqual(events.filter((event) => event.kind === 'attempt-start').map((event) => event.atMs), [18, failureEnd]);
  assert.deepEqual(events.filter((event) => event.kind === 'attempt-end').map((event) => event.atMs), [failureEnd, record.ttftMs]);
  assert.equal(events.find((event) => event.kind === 'first-token')?.atMs, record.ttftMs);
  assert.equal(getReplayFrame(record, 0).phase, 'idle');
  assert.equal(getReplayFrame(record, 18).activeAttempt, 0);
  assert.equal(getReplayFrame(record, failureEnd - 1).attemptCount, 0);
  assert.deepEqual(getReplayFrame(record, failureEnd), { attemptCount: 1, output: '', phase: 'routing', activeAttempt: 1 });
  const firstOutput = getReplayFrame(record, record.ttftMs);
  assert.equal(firstOutput.attemptCount, 2);
  assert.equal(firstOutput.phase, 'streaming');
  assert.equal(firstOutput.output, Array.from(record.response)[0]);
  const midway = getReplayFrame(record, (record.ttftMs + record.durationMs) / 2);
  assert.ok(midway.output.length > firstOutput.output.length && midway.output.length < record.response.length);
  assert.ok(record.response.startsWith(midway.output));
  assert.equal(getReplayDuration(record), record.durationMs);
  assert.deepEqual(getReplayFrame(record, record.durationMs), { attemptCount: 2, output: record.response, phase: 'complete', activeAttempt: null });
  assert.equal(new Set(events.map((event) => event.id)).size, events.length);
  assert.ok(events.every((event, index) => !index || event.atMs >= events[index - 1].atMs));
  assert.deepEqual(record, before);
});

test('excluded providers have no active attempt and failed response appears only at terminal', () => {
  const record = simulateRequest(config({ only: ['anthropic'] }), 'model-fallback', 'Hello');
  const events = getReplayEvents(record);
  assert.equal(events.filter((event) => event.kind === 'attempt-start').length, 1);
  assert.equal(events.filter((event) => event.kind === 'first-token' || event.kind === 'output').length, 0);
  assert.equal(getReplayFrame(record, 18).activeAttempt, 2);
  assert.equal(getReplayFrame(record, record.durationMs - 1).output, '');
  assert.equal(getReplayFrame(record, record.durationMs).phase, 'failed');
  assert.equal(getReplayFrame(record, record.durationMs).output, record.response);
  const preflight = simulateRequest(config(), 'invalid-key', 'Hello');
  assert.equal(getReplayDuration(preflight), 24);
  assert.equal(getReplayFrame(preflight, 23).output, '');
  assert.equal(getReplayFrame(preflight, 24).output, preflight.response);
  assert.equal(getReplayFrame(preflight, 24).attemptCount, 0);
});

test('cancel replay ends at observed cutoff with only recorded attempts, partial output and unknown usage', () => {
  const record = simulateRequest(config(), 'provider-failure', 'A unicode poem 🌱', 'cancel-timeline');
  const failedOnly = cancelRequest(record, 1, '', 1500);
  assert.equal(getReplayDuration(failedOnly), 1500);
  assert.equal(getReplayEvents(failedOnly).filter((event) => event.kind === 'attempt-start').length, 1);
  assert.equal(getReplayFrame(failedOnly, 1499).phase, 'routing');
  assert.equal(getReplayFrame(failedOnly, 1500).phase, 'complete');
  assert.equal(getReplayFrame(failedOnly, 1500).attemptCount, 1);
  const elapsed = record.ttftMs + 200;
  const partial = cancelRequest(record, 2, 'One request 🌱', elapsed);
  assert.equal(getReplayDuration(partial), elapsed);
  assert.equal(getReplayFrame(partial, partial.ttftMs).phase, 'streaming');
  assert.equal(getReplayFrame(partial, elapsed).output, 'One request 🌱');
  assert.equal(getReplayFrame(partial, elapsed).phase, 'complete');
  assert.ok(getReplayEvents(partial).every((event) => event.atMs <= elapsed));
  assert.equal(partial.status, 'cancelled');
  assert.equal(partial.durationMs, 0);
  assert.equal(partial.usageKnown, false);
  assert.equal(partial.inputTokens, 0);
  assert.equal(partial.outputTokens, 0);
  assert.equal(getMetrics([partial]).spend, 0);
});
