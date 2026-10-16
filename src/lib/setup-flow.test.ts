import assert from 'node:assert/strict';
import test from 'node:test';
import { currentSetupFeedback, currentSetupStage, nextSetupStage, restoreSetupFlow, setupStages } from './setup-flow';

test('a new app recommends a client but leaves that decision editable', () => {
  assert.equal(nextSetupStage('new', 'intent'), 'environment');
  assert.ok(setupStages('new').includes('integration'));
  assert.equal(nextSetupStage('new', 'integration'), 'environment');
});

test('existing apps select their client while agents bypass application questions', () => {
  assert.equal(nextSetupStage('existing', 'intent'), 'integration');
  assert.deepEqual(setupStages('agent'), ['intent', 'editor', 'review']);
  assert.equal(nextSetupStage('agent', 'intent'), 'editor');
  assert.equal(nextSetupStage('agent', 'environment'), 'editor');
});

test('all branches reach review before a handoff and do not progress beyond it', () => {
  for (const intent of ['new', 'existing', 'agent'] as const) {
    assert.equal(nextSetupStage(intent, 'editor'), 'review');
    assert.equal(nextSetupStage(intent, 'review'), 'review');
  }
});

test('shared intent hydration cannot render app questions in an agent flow', () => {
  const restored = restoreSetupFlow({ stage: 'environment', editor: 'cursor' }, 'new');
  assert.equal(currentSetupStage('agent', restored.stage), 'editor');
  assert.equal(currentSetupStage('existing', restored.stage), 'environment');
  assert.equal(currentSetupStage('agent', 'review'), 'review');
});

test('restoring flow rejects invalid and incompatible stages without restoring context or credentials', () => {
  assert.deepEqual(restoreSetupFlow(null, 'new'), { stage: 'intent', editor: 'cursor' });
  assert.deepEqual(restoreSetupFlow({ stage: 'environment', editor: 'vscode', apiKey: 'discard' }, 'agent'), { stage: 'intent', editor: 'vscode' });
  assert.deepEqual(restoreSetupFlow({ stage: 'review', editor: 'vscode' }, 'existing'), { stage: 'review', editor: 'vscode' });
});

test('delayed handoff feedback cannot claim a newly selected context or edited brief', () => {
  const copied = { signature: 'draft-route', prompt: 'Review my route', value: 'copied' as const };
  assert.equal(currentSetupFeedback(copied, 'draft-route', 'Review my route'), 'copied');
  assert.equal(currentSetupFeedback(copied, 'active-route', 'Review my route'), null);
  assert.equal(currentSetupFeedback(copied, 'draft-route', 'Review a different route'), null);
  const download = { signature: 'client-a', value: 'ready' as const };
  assert.equal(currentSetupFeedback(download, 'client-b'), null);
  assert.equal(currentSetupFeedback(download, 'client-a'), 'ready');
});
