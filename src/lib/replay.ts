import { PROVIDER_NAMES, type RequestRecord } from './gateway';

export interface ReplayEvent {
  id: string;
  atMs: number;
  kind: 'request-start' | 'attempt-start' | 'attempt-end' | 'first-token' | 'output' | 'request-end';
  label: string;
  attemptIndex?: number;
  output?: string;
}

export interface ReplayFrame {
  /** Completed, observed entries, including zero-duration allowlist exclusions. */
  attemptCount: number;
  output: string;
  phase: 'idle' | 'routing' | 'streaming' | 'complete' | 'failed';
  activeAttempt: number | null;
}

export interface AttemptSpan { index: number; start: number; end: number }

/** Receipt-derived attempt intervals; a successful interval ends at first output. */
export function getAttemptSpans(record: RequestRecord): AttemptSpan[] {
  const latency = record.attempts.reduce((sum, attempt) => sum + Math.max(0, attempt.latencyMs), 0);
  // Successful attempt latency ends at first output, not generation completion.
  const measuredRouting = record.ttftMs > 0 ? record.ttftMs
    : record.status === 'cancelled' ? (record.attempts.length ? latency + 18 : 0)
      : record.durationMs;
  let cursor = Math.max(0, measuredRouting - latency);
  return record.attempts.map((attempt, index) => {
    const start = cursor;
    cursor += Math.max(0, attempt.latencyMs);
    return { index, start, end: cursor };
  });
}

/** A cancellation has an observed cutoff, not a known final generation time. */
export function getReplayDuration(record: RequestRecord): number {
  const spans = getAttemptSpans(record);
  const lastAttempt = spans.at(-1)?.end ?? 0;
  if (record.status === 'cancelled') {
    return Math.max(lastAttempt, record.ttftMs, record.observedDurationMs ?? 0);
  }
  return Math.max(record.durationMs, record.ttftMs, lastAttempt);
}

export interface ObservedAttemptSpan extends AttemptSpan {
  provider: RequestRecord['attempts'][number]['provider'];
  model: string;
  status: 'active' | RequestRecord['attempts'][number]['status'];
  completed: boolean;
  /** Available only after this attempt's outcome was observed. */
  reason?: string;
}

/** Active intervals stop at the observed cursor; future outcomes and causes stay absent. */
export function getObservedAttemptSpans(record: RequestRecord, positionMs?: number): ObservedAttemptSpan[] {
  const duration = getReplayDuration(record);
  const position = positionMs === undefined ? duration : Math.min(duration, Number.isFinite(positionMs) ? Math.max(0, positionMs) : 0);
  if (position === 0 && duration > 0) return [];
  return getAttemptSpans(record).filter(span => span.start <= position).map(span => {
    const attempt = record.attempts[span.index];
    const completed = span.end <= position;
    return {
      index: span.index, start: span.start, end: Math.min(span.end, position),
      provider: attempt.provider, model: attempt.model,
      status: completed ? attempt.status : 'active', completed,
      ...(completed ? { reason: attempt.reason } : {}),
    };
  });
}

/**
 * A local projection of the observed receipt. The output animation interpolates
 * recorded text; it is not a claim that historical token timestamps were logged.
 * Route delays and first-output time retain their recorded milliseconds.
 */
export function getReplayEvents(record: RequestRecord): ReplayEvent[] {
  const events: ReplayEvent[] = [];
  const push = (event: Omit<ReplayEvent, 'id'>) => {
    events.push({ id: `${record.id}:event:${events.length}`, ...event });
  };
  const end = getReplayDuration(record);
  push({ atMs: 0, kind: 'request-start', label: 'Request started' });
  for (const span of getAttemptSpans(record)) {
    const attempt = record.attempts[span.index];
    if (attempt.status !== 'excluded') {
      push({ atMs: span.start, kind: 'attempt-start', attemptIndex: span.index,
        label: `${PROVIDER_NAMES[attempt.provider]} attempt started` });
    }
    push({ atMs: span.end, kind: 'attempt-end', attemptIndex: span.index,
      label: `${PROVIDER_NAMES[attempt.provider]} ${attempt.status === 'excluded' ? 'excluded; no request sent'
        : attempt.status === 'failed' ? 'failed before output' : 'response started'}` });
  }
  const hasOutput = record.status !== 'failed' && record.ttftMs > 0 && !!record.response;
  if (hasOutput) {
    const characters = Array.from(record.response);
    const firstOutput = Math.min(record.ttftMs, end);
    push({ atMs: firstOutput, kind: 'first-token', label: 'First output', output: characters[0] });
    // Bounded event density preserves whitespace and Unicode, including partial
    // output after cancellation. No synthetic output token usage is calculated.
    const chunks = Math.min(80, Math.max(1, characters.length - 1));
    for (let chunk = 1; chunk <= chunks; chunk++) {
      const length = 1 + Math.ceil((characters.length - 1) * chunk / chunks);
      push({ atMs: firstOutput + (end - firstOutput) * chunk / chunks,
        kind: 'output', label: 'Recorded text revealed', output: characters.slice(0, length).join('') });
    }
  }
  push({ atMs: end, kind: 'request-end', label: record.status === 'cancelled'
    ? 'Stopped; final usage unknown' : record.status === 'failed' ? 'Request failed' : 'Response complete' });
  return events.sort((a, b) => a.atMs - b.atMs);
}

/** One timeline for live demo playback and receipt replay. */
export function getReplayFrame(record: RequestRecord, timeMs: number): ReplayFrame {
  const end = getReplayDuration(record);
  const time = Number.isFinite(timeMs) ? Math.max(0, timeMs) : 0;
  if (timeMs < 0 || (time === 0 && end > 0)) {
    return { attemptCount: 0, output: '', phase: 'idle', activeAttempt: null };
  }
  const spans = getAttemptSpans(record);
  const attemptCount = spans.filter((span) => span.end <= time).length;
  if (time >= end) {
    return { attemptCount, output: record.response,
      phase: record.status === 'failed' ? 'failed' : 'complete', activeAttempt: null };
  }
  const active = spans.find((span) => span.start <= time && time < span.end
    && record.attempts[span.index].status !== 'excluded');
  const output = getReplayEvents(record).filter((event) => event.output !== undefined && event.atMs <= time).at(-1)?.output ?? '';
  return { attemptCount, output, phase: record.ttftMs > 0 && time >= record.ttftMs ? 'streaming' : 'routing',
    activeAttempt: active?.index ?? null };
}
