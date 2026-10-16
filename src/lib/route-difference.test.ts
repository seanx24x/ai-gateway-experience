import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from './gateway';
import { routeDifferences } from './route-difference';

test('comparison explains changes from snapshots without rewriting either policy', () => {
  const original = structuredClone(DEFAULT_CONFIG);
  const draft = {...structuredClone(original),order:['bedrock','anthropic','vertex'] as typeof original.order};
  const before = JSON.stringify([original,draft]);
  assert.deepEqual(routeDifferences(original,draft), [{label:'Provider preference',original:'Anthropic → Amazon Bedrock → Google Vertex AI',draft:'Amazon Bedrock → Anthropic → Google Vertex AI'}]);
  assert.equal(JSON.stringify([original,draft]),before);
  assert.deepEqual(routeDifferences(original,original),[]);
  assert.deepEqual(routeDifferences(undefined,draft),[]);
});
