import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CONFIG, cancelRequest, simulateRequest } from './gateway';
import { addWorkspaceConnection, addWorkspaceKey, budgetPeriodDescription, defaultWorkspace, getIdentityUsage, removeWorkspaceBudget, saveWorkspaceSettings, setWorkspaceConnectionEnabled, setWorkspaceKeyStatus, upsertWorkspaceBudget, validateWorkspaceState } from './workspace';

test('workspace defaults are independent and contain metadata without credentials', () => {
  const first = defaultWorkspace();
  const second = defaultWorkspace();
  first.keys[0].name = 'Changed';
  assert.equal(second.keys[0].name, 'Local development');
  assert.equal(validateWorkspaceState(second), true);
  assert.equal(second.connections.length, 0);
  assert.equal(validateWorkspaceState({ ...second, secret: 'unexpected-value' }), false);
  assert.equal(validateWorkspaceState({ ...second, keys: [{ ...second.keys[0], apiKey: 'unexpected-value' }] }), false);
});

test('metadata additions validate duplicate IDs and empty names without changing input state', () => {
  const state = defaultWorkspace();
  const next = addWorkspaceKey(state, { id: 'demo_key_ci', name: ' CI runner ', createdAt: 10, status: 'active', attribution: 'team' });
  assert.equal(next.keys.at(-1)?.name, 'CI runner');
  assert.equal(state.keys.length, 2);
  assert.throws(() => addWorkspaceKey(state, { ...state.keys[0] }));
  assert.throws(() => addWorkspaceKey(state, { ...state.keys[0], id: 'demo_key_blank', name: ' ' }));
});

test('budget edits preserve key metadata and reject orphaned or duplicate scopes', () => {
  const state = defaultWorkspace();
  const budget = { ...state.budgets[0], limitUsd: 40, period: 'weekly' as const };
  const next = upsertWorkspaceBudget(state, budget);
  assert.deepEqual(next.keys, state.keys);
  assert.equal(next.budgets.length, 1);
  assert.equal(next.budgets[0].limitUsd, 40);
  assert.equal(state.budgets[0].limitUsd, 25);
  assert.throws(() => upsertWorkspaceBudget(state, { ...budget, id: 'demo_budget_duplicate' }));
  assert.throws(() => upsertWorkspaceBudget(state, { ...budget, keyId: 'demo_key_missing' }));
  assert.throws(() => upsertWorkspaceBudget(state, { ...budget, limitUsd: 0.5 }));
  assert.deepEqual(removeWorkspaceBudget(next, budget.id).keys, state.keys);
});

test('demo revocation and restoration preserve budgets while remaining reversible metadata', () => {
  const state = defaultWorkspace();
  const revoked = setWorkspaceKeyStatus(state, 'demo_key_agent', 'revoked');
  assert.equal(revoked.keys[1].status, 'revoked');
  assert.equal(state.keys[1].status, 'active');
  assert.deepEqual(revoked.budgets, state.budgets);
  assert.equal(setWorkspaceKeyStatus(revoked, 'demo_key_agent', 'active').keys[1].status, 'active');
  assert.throws(() => setWorkspaceKeyStatus(state, 'demo_key_missing', 'revoked'));
});

test('BYOK metadata toggles do not contain credentials or change usage records', () => {
  const state = defaultWorkspace();
  const connected = addWorkspaceConnection(state, { id: 'demo_connection_anthropic', provider: 'anthropic', label: ' My account ', createdAt: 10, enabled: true });
  assert.equal(connected.connections[0].label, 'My account');
  assert.equal(setWorkspaceConnectionEnabled(connected, connected.connections[0].id, false).connections[0].enabled, false);
  assert.deepEqual(connected.budgets, state.budgets);
  assert.equal(state.connections.length, 0);
  assert.equal(validateWorkspaceState({ ...connected, connections: [{ ...connected.connections[0], token: 'unexpected-value' }] }), false);
});

test('identity totals reflect records and exclude unknown cancellation usage without mock key attribution', () => {
  const config = structuredClone(DEFAULT_CONFIG);
  const oidc = simulateRequest(config, 'healthy', 'Hello', 'demo_oidc');
  const key = { ...simulateRequest(config, 'healthy', 'Hello', 'demo_key_request'), auth: 'api-key' as const };
  const cancelled = { ...cancelRequest(key, 1, 'Partial', 500), id: 'demo_key_cancelled' };
  const usage = getIdentityUsage([oidc, key, cancelled], 'api-key');
  assert.equal(usage.count, 2);
  assert.equal(usage.spend, key.cost);
  assert.equal(usage.unknownUsage, 1);
  assert.deepEqual(usage.records.map(record => record.id), ['demo_key_request', 'demo_key_cancelled']);
  assert.equal('keyId' in usage, false);
});

test('settings edits preserve operations metadata and UTC period meaning', () => {
  const state = defaultWorkspace();
  const next = saveWorkspaceSettings(state, { name: ' New team ', activityDensity: 'compact', showWorkloadPreview: true });
  assert.equal(next.settings.name, 'New team');
  assert.equal(state.settings.name, 'Acme');
  assert.deepEqual(next.budgets, state.budgets);
  assert.match(budgetPeriodDescription('weekly'), /Monday.*UTC/);
  assert.equal(budgetPeriodDescription('none'), 'Cumulative limit; does not reset');
  assert.equal(validateWorkspaceState({ ...state, budgets: [{ ...state.budgets[0], period: 'yearly' }] }), false);
});
