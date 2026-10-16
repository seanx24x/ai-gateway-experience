import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeedRequests, DEFAULT_CONFIG } from './gateway';
import { restoreReviewerReceipts, isStoredRoute } from './reviewer-session';
test('malformed reviewer receipts cannot discard valid evidence or crash restore', () => {
  const source = createSeedRequests();
  assert.deepEqual(restoreReviewerReceipts([null, {}, ...source]), source);
  assert.deepEqual(restoreReviewerReceipts('invalid'), []);
  const corrupt = structuredClone(source[0]); corrupt.attempts = [null as never];
  assert.deepEqual(restoreReviewerReceipts([corrupt, source[1]]), [source[1]]);
  assert.equal(source.length, 48);
});
test('corrupt route metadata can reset independently of valid reviewer receipts', () => {
  assert.equal(isStoredRoute(DEFAULT_CONFIG), true);
  for (const value of [null, {}, { ...DEFAULT_CONFIG, order:null }]) assert.equal(isStoredRoute(value), false);
});

test('invalid optional entries do not displace intact receipts at the storage cap', () => {
  const reference = createSeedRequests()[0];
  const valid = Array.from({length:200}, (_, index) => ({...reference,id:`retained_${index}`}));
  assert.deepEqual(restoreReviewerReceipts([null, {}, ...valid]), valid);
});
