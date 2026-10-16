import test from 'node:test';
import assert from 'node:assert/strict';
import { getActionGuidance, pageGuidance, restoreJourneyOrigin, type GuidanceContext } from './action-guidance';
import { DEFAULT_CONFIG, simulateRequest } from './gateway';

const context: GuidanceContext = { view: 'overview', busy: false, result: null, inspectedId: null, dirty: false, pendingRevision: null, activeRevision: 1, tested: false };
test('guidance follows request evidence and inspection, not copied setup', () => {
  assert.equal(getActionGuidance(context)?.action, 'run');
  assert.equal(getActionGuidance({ ...context, view: 'connect' })?.action, 'run');
  const success = simulateRequest(DEFAULT_CONFIG, 'healthy', 'A support reply', 'success', 1);
  assert.equal(getActionGuidance({ ...context, result: success })?.action, 'recover');
  const recovered = simulateRequest(DEFAULT_CONFIG, 'provider-failure', 'A support reply', 'recovered', 1);
  assert.equal(getActionGuidance({ ...context, result: recovered })?.action, 'inspect');
  assert.equal(getActionGuidance({ ...context, result: recovered, inspectedId: recovered.id })?.action, 'adjust');
});
test('draft, tested, pending, active, and verified states remain distinct', () => {
  const routes = { ...context, view: 'routes' as const };
  assert.equal(getActionGuidance({ ...routes, dirty: true })?.action, 'test');
  assert.equal(getActionGuidance({ ...routes, dirty: true, tested: true })?.action, 'review');
  assert.equal(getActionGuidance({ ...routes, dirty: true, tested: true, pendingRevision: 2 })?.action, 'activate');
  assert.equal(getActionGuidance({ ...routes, activeRevision: 2 })?.action, 'verify');
  const result = simulateRequest({ ...DEFAULT_CONFIG, revision: 2 }, 'healthy', 'Verify', 'verify', 1);
  assert.equal(getActionGuidance({ ...routes, activeRevision: 2, result })?.action, 'inspect');
  assert.equal(getActionGuidance({ ...routes, busy: true }), null);
  assert.equal(getActionGuidance({ ...context, view: 'monitor', hasRecovered: false }), null);
});


test('draft readiness requires a current completed test and verification keeps failure explicit', () => {
  const routes = { ...context, view: 'routes' as const, dirty: true, tested: true };
  for (const testOutcome of ['failed', 'cancelled'] as const) assert.equal(getActionGuidance({ ...routes, testOutcome })?.action, 'edit-route');
  assert.equal(getActionGuidance({ ...routes, testOutcome: 'stale' })?.action, 'test');
  assert.equal(getActionGuidance({ ...routes, dirty: false, activeRevision: 2, testOutcome: 'stale' })?.action, 'verify');
  const result = simulateRequest({ ...DEFAULT_CONFIG, revision: 2 }, 'invalid-key', 'Verify', 'failed-verification', 1);
  const guidance = getActionGuidance({ ...context, view: 'routes', activeRevision: 2, result });
  assert.match(guidance!.title, /did not complete/);
  assert.equal(guidance?.target?.requestId, result.id);
});
test('monitor suggestions cannot escape the current visible scope', () => {
  const recovered = simulateRequest(DEFAULT_CONFIG, 'provider-failure', 'Reply', 'outside-scope', 1);
  const success = simulateRequest(DEFAULT_CONFIG, 'healthy', 'Reply', 'inside-scope', 1);
  assert.equal(pageGuidance('monitor', { result: recovered, visibleRequests: [success] }), null);
  assert.equal(pageGuidance('monitor', { visibleRequests: [] }), null);
  assert.equal(pageGuidance('monitor', { visibleRequests: [recovered] })?.target?.requestId, recovered.id);
});
test('discovery and operations continuations carry explicit destinations without claiming execution', () => {
  assert.equal(pageGuidance('models'), null);
  assert.deepEqual(pageGuidance('models', { selectedModel: DEFAULT_CONFIG.model })?.target, { view: 'playground', model: DEFAULT_CONFIG.model });
  assert.deepEqual(pageGuidance('virtual-models', { selectedAlias: 'support' })?.target, { view: 'routes', alias: 'support' });
  for (const [view, destination] of [['dashboard','monitor'],['leaderboards','models'],['keys','budgets'],['budgets','keys'],['byok','monitor']] as const) assert.equal(pageGuidance(view)?.target?.view, destination);
  assert.equal(pageGuidance('settings'), null);
  assert.equal(pageGuidance('settings', { saved: true })?.target?.view, 'dashboard');
  for (const [referenceTask, destination] of [['request','connect'],['authentication','connect'],['routing','routes'],['observability','monitor']] as const) assert.equal(pageGuidance('documentation', { referenceTask })?.target?.view, destination);
});
test('investigation origins retain exact local receipts and reject foreign or missing identities', () => {
  const record = simulateRequest(DEFAULT_CONFIG, 'healthy', 'Reply', 'origin', 1);
  const origin = { requestId: record.id, href: `/monitor?status=success&request=${record.id}`, view: 'monitor' };
  assert.deepEqual(restoreJourneyOrigin(origin, [record]), origin);
  for (const href of ['https://example.com', '//example.com', '/\\example.com', '/keys?request=origin', '/monitor?request=other']) assert.equal(restoreJourneyOrigin({ ...origin, href }, [record]), null);
  assert.equal(restoreJourneyOrigin(origin, []), null);
});
