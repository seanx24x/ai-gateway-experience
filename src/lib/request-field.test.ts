import assert from 'node:assert/strict';
import test from 'node:test';
import { cancelRequest, DEFAULT_CONFIG, simulateRequest, type RequestRecord } from './gateway';
import { nearestRequestPoint, projectRequestField, requestFieldDate, requestFieldTime, REQUEST_FIELD_BASELINE_Y, REQUEST_FIELD_LATENCY_HEIGHT, type RequestFieldPoint } from './request-field';

const start = Date.UTC(2026, 9, 4, 18);
const receipt = (id: string, timestamp = start, overrides: Partial<RequestRecord> = {}): RequestRecord => ({
  ...simulateRequest(DEFAULT_CONFIG, 'healthy', 'A support question', id, timestamp), ...overrides,
});

test('empty scope remains empty and a single receipt is centered in an explicit time window', () => {
  const empty = projectRequestField([]);
  assert.deepEqual(empty.points, []);
  assert.deepEqual(empty.timeTicks, []);
  assert.deepEqual(empty.hours, []);
  assert.equal(empty.start, null);
  assert.equal(empty.end, null);
  assert.equal(empty.largestGap, null);
  const record = receipt('one');
  const result = projectRequestField([record]);
  assert.equal(result.points.length, 1);
  assert.equal(result.points[0].record, record);
  assert.equal(result.points[0].x, .5);
  assert.equal(result.start, start - 30 * 60_000);
  assert.equal(result.end, start + 30 * 60_000);
  assert.ok(result.points[0].y >= 0 && result.points[0].y <= REQUEST_FIELD_LATENCY_HEIGHT);
  assert.equal(result.hours[0].count, 1);
  assert.equal(result.largestGap, null);
});

test('chronological positions reflect unequal real intervals and preserve source receipts', () => {
  const records = [receipt('last', start + 10_000), receipt('first', start), receipt('near-first', start + 1_000)];
  const snapshot = structuredClone(records);
  const result = projectRequestField(records);
  assert.deepEqual(result.points.map(point => point.record.id), ['first', 'near-first', 'last']);
  assert.deepEqual(result.points.map(point => point.x), [0, .1, 1]);
  assert.equal(result.points[1].record, records[2]);
  assert.deepEqual(records, snapshot);
  assert.equal(result.timeTicks[1].timestamp, start + 5_000);
});

test('request-order scale separates clustered receipts without changing chronology, latency or source identity', () => {
  const records = [receipt('latest', start + 26 * 3_600_000, { status: 'failed', ttftMs: 0 }), receipt('first', start), receipt('near-first', start + 1000), receipt('seed-end', start + 2 * 3_600_000)];
  const snapshot = structuredClone(records);
  const time = projectRequestField(records, 'time');
  const ordered = projectRequestField(records, 'requests');
  assert.deepEqual(ordered.points.map(point => point.record.id), time.points.map(point => point.record.id));
  assert.deepEqual(ordered.points.map(point => point.x), [0, 1 / 3, 2 / 3, 1]);
  assert.deepEqual(ordered.points.map(point => [point.y, point.plottedTtft]), time.points.map(point => [point.y, point.plottedTtft]));
  assert.equal(ordered.points[2].record, records[3]);
  assert.equal(ordered.completedCount, 3);
  assert.equal(ordered.incompleteCount, 1);
  assert.equal(ordered.largestGap, null);
  assert.ok(time.largestGap);
  assert.equal(projectRequestField([records[0]], 'requests').points[0].x, .5);
  assert.deepEqual(records, snapshot);
});

test('recovery retains total recorded TTFT while failed and cancelled requests use a separate baseline', () => {
  const healthy = receipt('success', start, { ttftMs: 410 });
  const recovered = simulateRequest(DEFAULT_CONFIG, 'provider-failure', 'A support question', 'recovery', start + 1000);
  const failed = simulateRequest(DEFAULT_CONFIG, 'invalid-key', 'A support question', 'auth', start + 2000);
  const cancelled = cancelRequest(recovered, recovered.attempts.length, 'Partial response', recovered.ttftMs + 300);
  cancelled.id = 'cancelled';
  cancelled.timestamp = start + 3000;
  assert.ok(cancelled.ttftMs > 0);
  const result = projectRequestField([healthy, recovered, failed, cancelled]);
  assert.equal(result.completedCount, 2);
  assert.equal(result.incompleteCount, 2);
  assert.equal(result.points[1].plottedTtft, true);
  assert.equal(result.points[1].y, (1 - recovered.ttftMs / result.maxTtft) * REQUEST_FIELD_LATENCY_HEIGHT);
  assert.deepEqual(result.points.slice(2).map(point => [point.plottedTtft, point.y]), [[false, REQUEST_FIELD_BASELINE_Y], [false, REQUEST_FIELD_BASELINE_Y]]);
  assert.equal(result.points[3].record.ttftMs, recovered.ttftMs);
  assert.equal(result.points[3].record.usageKnown, false);
});

test('latency scale encloses measured outliers and ignores incomplete or invalid timings', () => {
  const result = projectRequestField([
    receipt('normal', start, { ttftMs: 410 }),
    receipt('outlier', start + 1000, { ttftMs: 7400 }),
    receipt('failure', start + 2000, { status: 'failed', ttftMs: 90_000 }),
    receipt('invalid', start + 3000, { ttftMs: NaN }),
  ]);
  assert.equal(result.maxTtft, 10_000);
  assert.deepEqual(result.latencyTicks, [10_000, 5000, 0]);
  assert.equal(result.points[1].y, .26 * REQUEST_FIELD_LATENCY_HEIGHT);
  assert.equal(result.completedCount, 2);
  assert.equal(result.points[3].y, REQUEST_FIELD_BASELINE_Y);
});

test('hour filters use the latest eight active UTC hours, including actual dates and counts', () => {
  const first = Date.UTC(2026, 9, 4, 21);
  const records = Array.from({ length: 10 }, (_, index) => receipt(`hour-${index}`, first + index * 3_600_000 + 2000));
  records.push(receipt('same-hour', first + 9 * 3_600_000 + 45 * 60_000));
  const result = projectRequestField(records.reverse());
  assert.equal(result.hours.length, 8);
  assert.equal(result.hours[0].hour, first + 2 * 3_600_000);
  assert.equal(result.hours[0].label, '23:00');
  assert.equal(result.hours[0].date, '2026-10-04');
  assert.equal(result.hours[1].label, '00:00');
  assert.equal(result.hours[1].date, '2026-10-05');
  assert.equal(result.hours.at(-1)?.count, 2);
  assert.equal(requestFieldDate(first), '2026-10-04');
  assert.equal(requestFieldTime(first), '21:00:00');
});

test('invalid timestamps cannot create phantom plot samples', () => {
  const result = projectRequestField([receipt('valid'), receipt('infinite', Infinity), receipt('invalid', NaN), receipt('date-overflow', 9e15)]);
  assert.equal(result.points.length, 1);
  assert.equal(result.points[0].record.id, 'valid');
});

test('the largest substantial recorded time gap retains exact boundaries and source positions', () => {
  const records = [receipt('recent', start + 25 * 3_600_000), receipt('seed-end', start + 2 * 3_600_000), receipt('seed-start', start), receipt('recent-end', start + 26 * 3_600_000)];
  const snapshot = structuredClone(records);
  const result = projectRequestField(records);
  assert.deepEqual(result.largestGap, { start: start + 2 * 3_600_000, end: start + 25 * 3_600_000, durationMs: 23 * 3_600_000, x: 13.5 / 26, width: 23 / 26 });
  assert.deepEqual(result.points.map(point => point.x), [0, 2 / 26, 25 / 26, 1]);
  assert.deepEqual(records, snapshot);
  assert.equal(result.points[1].record, records[1]);
});

test('time-gap annotation requires more than six hours and more than a quarter of the recorded range', () => {
  const exactSixHours = projectRequestField([receipt('first'), receipt('last', start + 6 * 3_600_000)]);
  assert.equal(exactSixHours.largestGap, null);
  const equalQuarters = projectRequestField(Array.from({ length: 5 }, (_, index) => receipt(`quarter-${index}`, start + index * 7 * 3_600_000)));
  assert.equal(equalQuarters.largestGap, null);
  const multipleGaps = projectRequestField([receipt('first'), receipt('second', start + 7 * 3_600_000), receipt('third', start + 16 * 3_600_000), receipt('last', start + 17 * 3_600_000)]);
  assert.equal(multipleGaps.largestGap?.start, start + 7 * 3_600_000);
  assert.equal(multipleGaps.largestGap?.end, start + 16 * 3_600_000);
});

test('nearest request follows pixel distance in the actual plot aspect ratio and has stable ties', () => {
  const points: RequestFieldPoint[] = [
    { record: receipt('horizontal'), x: .3, y: .5, plottedTtft: true },
    { record: receipt('vertical'), x: .5, y: .25, plottedTtft: true },
  ];
  assert.equal(nearestRequestPoint(points, .5, .5, 1000, 100)?.record.id, 'vertical');
  assert.equal(nearestRequestPoint(points, .5, .5, 100, 1000)?.record.id, 'horizontal');
  const tied = [{ ...points[0], x: .25, y: .5 }, { ...points[1], x: .75, y: .5 }];
  assert.equal(nearestRequestPoint(tied, .5, .5, 100, 100)?.record.id, 'horizontal');
  assert.equal(nearestRequestPoint([], .5, .5, 100, 100), null);
});
