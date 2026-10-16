import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from './gateway';
import { createVirtualModel, isVirtualModelAlias, restoreVirtualModels } from './virtual-models';

test('aliases reject duplicate and invalid identities and start with automatic routing', () => {
  assert.match(createVirtualModel('support-agent', DEFAULT_CONFIG.model, [DEFAULT_CONFIG]).error!, /already exists/);
  assert.ok(createVirtualModel('Support Agent', DEFAULT_CONFIG.model, []).error);
  const made = createVirtualModel('new-workload', DEFAULT_CONFIG.model, []).config!;
  assert.deepEqual(made.order, []);
  assert.deepEqual(made.fallbacks, []);
  assert.equal(made.revision, 1);
});
test('restored collections preserve current activation and drop malformed configs', () => {
  const current = { ...DEFAULT_CONFIG, revision: 3 };
  const restored = restoreVirtualModels([{ ...DEFAULT_CONFIG, revision: 2 }, { bad: true }], current);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].revision, 3);
  restored[0].tags.push('test');
  assert.equal(current.tags.includes('test'), false);
});
test('only safe stable virtual model identifiers enter a handoff', () => {
  assert.equal(isVirtualModelAlias('vmc/support-agent'), true);
  assert.equal(isVirtualModelAlias('vmc/../../keys'), false);
  assert.equal(isVirtualModelAlias('anthropic/claude-sonnet-4.6'), false);
});
