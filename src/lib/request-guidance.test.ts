import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CONFIG, cancelRequest, simulateRequest } from './gateway';
import { formatRequestHour, getRequestGuidance, requestRole, visibleRequestIdentity } from './request-guidance';

const request = (scenario: Parameters<typeof simulateRequest>[1]) => simulateRequest(structuredClone(DEFAULT_CONFIG), scenario, 'Explain routing.');

test('authentication guidance distinguishes local expired OIDC from an invalid explicit key', () => {
  const expired = getRequestGuidance(request('expired-oidc'));
  assert.equal(expired.kind, 'authentication');
  assert.equal(expired.actionLabel, 'Review OIDC setup');
  assert.match(expired.description, /vercel env pull/);
  const key = getRequestGuidance(request('invalid-key'));
  assert.equal(key.kind, 'authentication');
  assert.equal(key.actionLabel, 'Review API key setup');
  assert.match(key.description, /takes precedence over OIDC/);
});

test('reason evidence classifies a 401 without assuming every failure with OIDC auth is an expired token', () => {
  const receipt = { ...request('budget'), scenario: 'healthy' as const, response: '401 · Explicit API key was rejected.', auth: 'oidc' as const };
  assert.equal(getRequestGuidance(receipt).actionLabel, 'Review API key setup');
  assert.equal(getRequestGuidance({ ...receipt, response: '401 · The local OIDC token expired.' }).actionLabel, 'Review OIDC setup');
});

test('budget failure has budget guidance rather than a provider adjustment', () => {
  const guidance = getRequestGuidance(request('budget'));
  assert.equal(guidance.kind, 'budget');
  assert.notEqual(guidance.actionLabel, 'Test an adjustment');
  assert.match(guidance.description, /before a provider attempt/);
  assert.match(getRequestGuidance({ ...request('budget'), auth: 'oidc' }).description, /team and project budgets/);
  const keyGuidance = getRequestGuidance({ ...request('budget'), auth: 'api-key' });
  assert.match(keyGuidance.description, /API key, and any attributed team member budgets/);
  assert.match(keyGuidance.description, /does not count toward a project budget/);
});

test('unavailable model, unknown model ID, and fully excluded providers preserve distinct evidence', () => {
  assert.match(getRequestGuidance(request('model-unavailable')).title, /availability for your team/);
  const missing = simulateRequest({ ...structuredClone(DEFAULT_CONFIG), model: 'missing/model' }, 'healthy', 'Hello');
  assert.equal(getRequestGuidance(missing).kind, 'eligibility');
  assert.equal(getRequestGuidance(missing).title, 'Choose an available model.');
  const excluded = simulateRequest({ ...structuredClone(DEFAULT_CONFIG), only: ['openai'], fallbacks: [] }, 'healthy', 'Hello');
  assert.equal(excluded.attempts.every(attempt => attempt.status === 'excluded'), true);
  const guidance = getRequestGuidance(excluded);
  assert.equal(guidance.kind, 'eligibility');
  assert.match(guidance.description, /no request was sent/);
});

test('rate limit guidance retains retry semantics without inventing Retry-After metadata', () => {
  const guidance = getRequestGuidance(request('rate-limit'));
  assert.equal(guidance.kind, 'rate-limit');
  assert.match(guidance.description, /exponential backoff/);
  assert.match(guidance.description, /does not record a Retry-After value/);
});

test('real attempts within a restricted set remain routing failures, while recovery carries observed delay', () => {
  const restricted = getRequestGuidance(request('restricted'));
  assert.equal(restricted.kind, 'routing');
  assert.match(restricted.description, /allowlist across fallback models/);
  const recovered = getRequestGuidance(request('provider-failure'));
  assert.equal(recovered.kind, 'routing');
  assert.match(recovered.description, /1,280 ms/);
  assert.equal(recovered.actionLabel, 'Test an adjustment');
});

test('success and cancellation do not imply that every receipt needs a policy edit', () => {
  const success = request('healthy');
  assert.equal(getRequestGuidance(success).kind, 'inspect');
  assert.notEqual(getRequestGuidance(success).actionLabel, 'Test an adjustment');
  const cancelled = cancelRequest(request('provider-failure'), 1, 'Partial output', 1000);
  const guidance = getRequestGuidance(cancelled);
  assert.equal(guidance.kind, 'inspect');
  assert.match(guidance.description, /Final provider usage is unknown/);
});

test('comparison identities retain distinct roles when their timestamp suffix is shared', () => {
  const baseline = 'demo_baseline_mgx2dehu_2';
  const draft = 'demo_draft_mgx2dehu_2';
  assert.equal(requestRole(baseline), 'Baseline');
  assert.equal(requestRole({ id: draft }), 'Draft');
  assert.notEqual(visibleRequestIdentity(baseline), visibleRequestIdentity(draft));
  assert.match(visibleRequestIdentity(baseline), /^baseline_/);
  assert.match(visibleRequestIdentity(draft), /^draft_/);
  assert.equal(visibleRequestIdentity('demo_seed_036'), 'seed_036');
  assert.equal(requestRole('demo_seed_036'), 'Request');
});

test('hour labels include recorded UTC dates only when chart buckets cross days', () => {
  const dayOne = Date.UTC(2026, 9, 4, 15);
  const dayTwo = Date.UTC(2026, 9, 5, 15);
  assert.equal(formatRequestHour(dayOne, [dayOne, dayOne + 3_600_000]), '15:00');
  assert.equal(formatRequestHour(dayOne, [dayOne, dayTwo]), '2026-10-04 · 15:00');
  assert.equal(formatRequestHour(dayTwo, [dayOne, dayTwo]), '2026-10-05 · 15:00');
});
