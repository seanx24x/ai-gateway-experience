import assert from 'node:assert/strict';
import test from 'node:test';
import {
  initialReviewerProgress, recordReviewerEvent, restoreReviewerProgress,
  REVIEW_CHAPTERS, reviewerChapter, reviewerHref, type ReviewerEvent,
} from './reviewer';

test('the chapter map covers every product destination and the existing model detail URL', () => {
  assert.deepEqual(REVIEW_CHAPTERS.map(chapter => chapter.id), ['understand', 'trust', 'control', 'adopt', 'operate']);
  assert.deepEqual([...new Set(REVIEW_CHAPTERS.flatMap(chapter => chapter.destinations.map(destination => destination.view)))].sort(),
    ['overview', 'dashboard', 'connect', 'playground', 'routes', 'monitor', 'models', 'virtual-models', 'leaderboards', 'documentation', 'budgets', 'keys', 'byok', 'settings'].sort());
  assert.match(REVIEW_CHAPTERS[0].destinations.find(destination => destination.label === 'Model detail')!.href!, /^\/models\?model=/);
  assert.equal(reviewerChapter('control')?.route, '/routes');
  assert.equal(reviewerChapter('toString'), null);
  assert.equal(reviewerChapter(undefined), null);
});

test('navigation and skipped chapters never imply a demonstrated interaction', () => {
  const original = initialReviewerProgress();
  const visited = recordReviewerEvent(original, { type: 'visited', chapter: 'control' });
  const skipped = recordReviewerEvent(visited, { type: 'skipped', chapter: 'control' });
  const destination = recordReviewerEvent(skipped, { type: 'destination', view: 'routes' });
  assert.equal(destination.chapter, 'control');
  assert.deepEqual(destination.visited, ['control']);
  assert.deepEqual(destination.skipped, ['control']);
  assert.deepEqual(destination.demonstrated, []);
  assert.deepEqual(destination.destinations, ['routes']);
  assert.equal(destination.finished, false);
  assert.deepEqual(original, initialReviewerProgress());
});

test('demonstration is idempotent, clears an earlier skip and does not advance the chapter', () => {
  const initial = recordReviewerEvent(initialReviewerProgress(), { type: 'skipped', chapter: 'trust' });
  const once = recordReviewerEvent(initial, { type: 'demonstrated', chapter: 'trust' });
  const twice = recordReviewerEvent(once, { type: 'demonstrated', chapter: 'trust' });
  assert.equal(twice.chapter, 'understand');
  assert.deepEqual(twice.visited, ['trust']);
  assert.deepEqual(twice.demonstrated, ['trust']);
  assert.deepEqual(twice.skipped, []);
  assert.deepEqual(once, twice);
  assert.deepEqual(recordReviewerEvent(twice, { type: 'skipped', chapter: 'trust' }).skipped, []);
});

test('finishing preserves honest progress rather than completing unvisited chapters', () => {
  const result = recordReviewerEvent(initialReviewerProgress(), { type: 'finished' });
  assert.equal(result.finished, true);
  assert.deepEqual(result.visited, []);
  assert.deepEqual(result.demonstrated, []);
  assert.deepEqual(result.skipped, []);
});

test('reviewer links retain filters, model context, request identity and hash without duplicate review parameters', () => {
  const link = reviewerHref('/models?model=anthropic%2Fclaude-sonnet-4.6&request=demo_1&review=trust#pricing', 'understand');
  const url = new URL(link, 'https://example.test');
  assert.equal(url.pathname, '/models');
  assert.equal(url.searchParams.get('model'), 'anthropic/claude-sonnet-4.6');
  assert.equal(url.searchParams.get('request'), 'demo_1');
  assert.deepEqual(url.searchParams.getAll('review'), ['understand']);
  assert.equal(url.hash, '#pricing');
  assert.equal(reviewerHref('/', 'trust'), '/?review=trust');
});

test('reviewer links and events cannot create external navigation or unknown progress', () => {
  for (const path of ['https://example.com', '//example.com', '/\\example.com', 'javascript:alert(1)']) {
    assert.equal(reviewerHref(path, 'trust'), '/review');
  }
  assert.deepEqual(recordReviewerEvent(initialReviewerProgress(), { type: 'destination', view: 'external' }).destinations, []);
  assert.deepEqual(recordReviewerEvent(initialReviewerProgress(), { type: 'visited', chapter: 'unknown' } as unknown as ReviewerEvent), initialReviewerProgress());
});

test('progress restoration rejects invalid roots and independently sanitizes damaged optional fields', () => {
  for (const value of [null, undefined, [], 'control', {}, { chapter: 'unknown' }]) assert.equal(restoreReviewerProgress(value), null);
  const restored = restoreReviewerProgress({
    chapter: 'adopt', visited: ['understand', 'understand', 'unknown'], demonstrated: ['control', 'control'],
    skipped: ['trust', 'control', null], destinations: ['routes', 'routes', 'external', 1], finished: 'true',
    productState: { active: 'not copied' },
  });
  assert.deepEqual(restored, {
    chapter: 'adopt', visited: ['understand', 'control', 'trust'], demonstrated: ['control'],
    skipped: ['trust'], destinations: ['routes'], finished: false,
  });
  assert.deepEqual(restoreReviewerProgress({ chapter: 'trust', visited: {}, demonstrated: 'all', skipped: null, destinations: {} }),
    { chapter: 'trust', visited: [], demonstrated: [], skipped: [], destinations: [], finished: false });
});

test('a persisted reviewer session round-trips independently and a new session resets only reviewer progress', () => {
  const events: ReviewerEvent[] = [
    { type: 'visited', chapter: 'understand' }, { type: 'demonstrated', chapter: 'understand' },
    { type: 'visited', chapter: 'trust' }, { type: 'destination', view: 'playground' },
  ];
  const saved = events.reduce(recordReviewerEvent, initialReviewerProgress());
  assert.deepEqual(restoreReviewerProgress(JSON.parse(JSON.stringify(saved))), saved);
  const fresh = initialReviewerProgress();
  fresh.visited.push('operate');
  assert.deepEqual(initialReviewerProgress().visited, []);
  assert.deepEqual(saved.demonstrated, ['understand']);
});
