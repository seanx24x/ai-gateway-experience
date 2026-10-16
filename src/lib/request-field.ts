import type { RequestRecord } from './gateway';

export const REQUEST_FIELD_LATENCY_HEIGHT = 0.76;
export const REQUEST_FIELD_BASELINE_Y = 0.92;
export type RequestFieldScale = 'time' | 'requests';
export interface RequestFieldPoint { record: RequestRecord; x: number; y: number; plottedTtft: boolean }
export interface RequestFieldGap { start: number; end: number; durationMs: number; x: number; width: number }
export interface RequestFieldProjection {
  points: RequestFieldPoint[];
  start: number | null;
  end: number | null;
  maxTtft: number;
  latencyTicks: number[];
  timeTicks: { timestamp: number; x: number; label: string; date: string }[];
  hours: { hour: number; count: number; label: string; date: string }[];
  completedCount: number;
  incompleteCount: number;
  largestGap: RequestFieldGap | null;
}

export const requestFieldDate = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);
const utcTimeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
export const requestFieldTime = (timestamp: number) => utcTimeFormatter.format(timestamp);
const shortTime = (timestamp: number) => requestFieldTime(timestamp).slice(0, 5);
const completed = (record: RequestRecord) => (record.status === 'success' || record.status === 'recovered') && Number.isFinite(record.ttftMs) && record.ttftMs > 0;
function ceiling(value: number) {
  if (value <= 0) return 100;
  const unit = 10 ** Math.floor(Math.log10(value));
  const ratio = value / unit;
  return unit * (ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10);
}

/** Time mode uses actual timestamps. Request mode uses explicit chronological order; neither invents samples. */
export function projectRequestField(records: readonly RequestRecord[], scale: RequestFieldScale = 'time'): RequestFieldProjection {
  const sorted = records.filter(record => Number.isFinite(record.timestamp) && Number.isFinite(new Date(record.timestamp).getTime())).slice().sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
  if (!sorted.length) return { points: [], start: null, end: null, maxTtft: 100, latencyTicks: [], timeTicks: [], hours: [], completedCount: 0, incompleteCount: 0, largestGap: null };
  let start = sorted[0].timestamp;
  let end = sorted.at(-1)!.timestamp;
  if (start === end) { start -= 30 * 60_000; end += 30 * 60_000; }
  const responses = sorted.filter(completed);
  const maxTtft = ceiling(Math.max(0, ...responses.map(record => record.ttftMs)));
  const points = sorted.map((record, index) => ({ record, x: scale === 'requests' ? sorted.length === 1 ? .5 : index / (sorted.length - 1) : (record.timestamp - start) / (end - start), y: completed(record) ? (1 - record.ttftMs / maxTtft) * REQUEST_FIELD_LATENCY_HEIGHT : REQUEST_FIELD_BASELINE_Y, plottedTtft: completed(record) }));
  let largestGap: RequestFieldGap | null = null;
  for (let index = 1; index < sorted.length; index++) {
    const gapStart = sorted[index - 1].timestamp;
    const gapEnd = sorted[index].timestamp;
    const durationMs = gapEnd - gapStart;
    const width = durationMs / (end - start);
    if (scale === 'time' && durationMs > 6 * 3_600_000 && width > .25 && (!largestGap || durationMs > largestGap.durationMs)) largestGap = { start: gapStart, end: gapEnd, durationMs, x: ((gapStart + gapEnd) / 2 - start) / (end - start), width };
  }
  const hourCounts = new Map<number, number>();
  for (const record of sorted) { const hour = Math.floor(record.timestamp / 3_600_000) * 3_600_000; hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1); }
  const hours = Array.from(hourCounts, ([hour, count]) => ({ hour, count, label: shortTime(hour), date: requestFieldDate(hour) })).slice(-8);
  return { points, start, end, maxTtft, latencyTicks: [maxTtft, maxTtft / 2, 0], timeTicks: scale === 'requests' ? (sorted.length === 1 ? [0] : [0, Math.floor((sorted.length - 1) / 2), sorted.length - 1].filter((value, index, all) => all.indexOf(value) === index)).map(index => ({ timestamp: sorted[index].timestamp, x: sorted.length === 1 ? .5 : index / (sorted.length - 1), label: index === 0 ? 'First' : index === sorted.length - 1 ? 'Latest' : `Request ${index + 1}`, date: requestFieldDate(sorted[index].timestamp) })) : [start, (start + end) / 2, end].map((timestamp, index) => ({ timestamp, x: index / 2, label: shortTime(timestamp), date: requestFieldDate(timestamp) })), hours, completedCount: responses.length, incompleteCount: sorted.length - responses.length, largestGap };
}

/** At most 200 local receipts. Pixel distance respects the plot's aspect ratio. */
export function nearestRequestPoint(points: readonly RequestFieldPoint[], x: number, y: number, width: number, height: number): RequestFieldPoint | null {
  let nearest: RequestFieldPoint | null = null;
  let distance = Infinity;
  for (const point of points) {
    const next = ((point.x - x) * width) ** 2 + ((point.y - y) * height) ** 2;
    if (next < distance) { nearest = point; distance = next; }
  }
  return nearest;
}
