'use client';

import { useId, useState, type CSSProperties } from 'react';
import { getModel, PROVIDER_NAMES, type RequestRecord } from '@/lib/gateway';
import { getObservedAttemptSpans, getReplayDuration, type ObservedAttemptSpan } from '@/lib/replay';
import './request-timeline.css';

export interface RequestTimelineProps {
  record: RequestRecord;
  /** Undefined shows the receipt end. An explicit position reveals observed evidence only. */
  positionMs?: number;
  selectedAttemptIndex?: number | null;
  onSelectAttempt?: (index: number) => void;
  /** Use one value for instruments that should share an elapsed-time scale. */
  maxTimeMs?: number;
  compact?: boolean;
  showOutcome?: boolean;
  presentation?: 'full' | 'instrument';
}

function timeLabel(value: number) {
  return value < 1000 ? `${Math.round(value)} ms` : `${Number((value / 1000).toFixed(2))} s`;
}
function axisLimit(value: number) {
  const base = 10 ** Math.floor(Math.log10(Math.max(1, value)));
  const ratio = value / base;
  return base * (ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10);
}
function modelLabel(model: string) { return getModel(model)?.name ?? model; }
function attemptOutcome(span: ObservedAttemptSpan) {
  return span.status === 'active' ? 'Attempting' : span.status === 'failed' ? 'Failed before output' : 'First output';
}

/** Provider routing and output generation share the same receipt-derived elapsed axis. */
export function RequestTimeline({ record, positionMs, selectedAttemptIndex, onSelectAttempt, maxTimeMs, compact = false, showOutcome = true, presentation = 'full' }: RequestTimelineProps) {
  const id = useId();
  const [localSelection, setLocalSelection] = useState<{ recordId: string; index: number } | null>(null);
  const duration = getReplayDuration(record);
  const position = positionMs === undefined ? duration : Math.min(duration, Number.isFinite(positionMs) ? Math.max(0, positionMs) : 0);
  const atEnd = position >= duration;
  const spans = getObservedAttemptSpans(record, positionMs);
  const sent = spans.filter(span => span.status !== 'excluded');
  const exclusions = spans.filter(span => span.status === 'excluded');
  const selectedIndex = selectedAttemptIndex !== undefined ? selectedAttemptIndex : localSelection?.recordId === record.id ? localSelection.index : null;
  const selected = sent.find(span => span.index === selectedIndex);
  const sharedLimit = maxTimeMs !== undefined && Number.isFinite(maxTimeMs) ? Math.max(0, maxTimeMs) : 0;
  // Live observation starts with a one-second viewing window. It never uses the
  // simulator's future duration to reveal a total before that total is observed.
  const scale = sharedLimit > 0 ? sharedLimit : axisLimit(Math.max(positionMs === undefined ? duration : Math.max(1000, position), 1));
  const percent = (value: number) => Math.max(0, Math.min(100, value / scale * 100));
  const intervalStyle = (start: number, end: number): CSSProperties => ({ left: `${percent(start)}%`, width: `${Math.max(0, percent(end) - percent(start))}%` });
  const outputObserved = record.status !== 'failed' && record.ttftMs > 0 && record.response.length > 0 && position >= record.ttftMs;
  const outcome = record.status === 'cancelled' ? 'Observation stopped' : record.status === 'failed' ? 'Request stopped' : 'Response complete';
  const finalUnit = record.status === 'cancelled' ? 'observed cutoff' : 'total';
  const failedAttempts = sent.filter(span => span.status === 'failed');
  const terminalAttemptIndex = atEnd && record.status === 'failed' ? sent.at(-1)?.index : undefined;
  const hasRecoverableFailure = failedAttempts.some(span => span.index !== terminalAttemptIndex);

  function selectAttempt(index: number) {
    setLocalSelection({ recordId: record.id, index });
    onSelectAttempt?.(index);
  }
  function track(start: number, end: number, active: boolean, tone: 'provider' | 'generation' | 'failed' | 'terminal' = 'provider') {
    return <span className="rt-track" aria-hidden="true"><span className={`rt-bar rt-bar--${tone}${active ? ' rt-bar--active' : ''}${start === end ? ' rt-bar--instant' : ''}`} style={intervalStyle(start, end)} /><span className="rt-cursor" style={{ left: `${percent(position)}%` }} /></span>;
  }

  return <figure className={`rt-root${compact ? ' rt-root--compact' : ''}${presentation === 'instrument' ? ' rt-root--instrument' : ''}`} aria-labelledby={`${id}-caption`} data-request-id={record.id} data-position-ms={position} data-axis-ms={scale} data-outcome={atEnd ? record.status : 'in-progress'}>
    <figcaption className="rt-header" id={`${id}-caption`}><span className="rt-title">Request timing</span><span className="rt-current">{timeLabel(position)} {atEnd ? finalUnit : 'elapsed'}</span></figcaption>
    <div className="rt-legend" role="group" aria-label="Timing colors"><span><i className="rt-legend-mark rt-legend-mark--provider" aria-hidden="true" />Provider attempt</span><span><i className="rt-legend-mark rt-legend-mark--generation" aria-hidden="true" />Output generation</span>{hasRecoverableFailure && <span><i className="rt-legend-mark rt-legend-mark--failed" aria-hidden="true" />Attempt failed</span>}{terminalAttemptIndex !== undefined && <span><i className="rt-legend-mark rt-legend-mark--terminal" aria-hidden="true" />Request failed</span>}</div>
    <div className="rt-axis" aria-hidden="true"><span className="rt-axis-label">Elapsed time</span><span className="rt-axis-track">{[0, .5, 1].map(fraction => <span key={fraction} className={`rt-tick${fraction === 0 ? ' rt-tick--first' : fraction === 1 ? ' rt-tick--last' : ''}`} style={{ left: `${fraction * 100}%` }}>{timeLabel(scale * fraction)}</span>)}</span><span /></div>
    <ol className="rt-attempts" aria-label="Observed provider attempts">{sent.map((span, number) => <li key={`${record.id}:${span.index}`}><button className={`rt-attempt rt-attempt--${span.status}${span.status === 'failed' && span.index === terminalAttemptIndex ? ' rt-attempt--terminal' : ''}`} type="button" data-attempt-index={span.index} aria-pressed={selectedIndex === span.index} aria-label={`Inspect attempt ${number + 1}: ${PROVIDER_NAMES[span.provider]}, ${modelLabel(span.model)}. ${attemptOutcome(span)}. ${timeLabel(span.start)} to ${timeLabel(span.end)} ${span.completed ? 'elapsed' : 'observed so far'}.`} onClick={() => selectAttempt(span.index)}>
      <span className="rt-label"><span className="rt-attempt-number" aria-hidden="true">{String(number + 1).padStart(2, '0')}</span><span className="rt-label-copy"><strong>{PROVIDER_NAMES[span.provider]}</strong>{(presentation === 'full' || number === 0 || span.model !== sent[number - 1].model) && <span>{modelLabel(span.model)}</span>}</span></span>
      {track(span.start, span.end, !span.completed, span.status === 'failed' ? span.index === terminalAttemptIndex ? 'terminal' : 'failed' : 'provider')}
      <span className="rt-value"><span className="rt-attempt-duration">{timeLabel(span.end - span.start)}{!span.completed ? ' so far' : ''}</span><span className="rt-attempt-outcome">{attemptOutcome(span)}</span></span>
    </button></li>)}</ol>
    {!sent.length && <div className="rt-empty"><strong>No provider attempt {atEnd ? 'recorded' : 'observed yet'}</strong><p>{atEnd && record.status === 'failed' ? record.response || 'The request stopped before a provider attempt was recorded.' : atEnd && record.status === 'cancelled' ? 'Observation stopped before a provider attempt was recorded.' : 'Waiting for a provider attempt to be observed.'}</p></div>}
    {outputObserved && <div className="rt-output" role="group" aria-label={`Output generation observed from ${timeLabel(record.ttftMs)} to ${timeLabel(position)} elapsed${atEnd && record.status === 'cancelled' ? '; final generation duration is unknown' : ''}.`}><span className="rt-label"><span className="rt-output-symbol" aria-hidden="true">↳</span><span className="rt-label-copy"><strong>{atEnd && record.status === 'cancelled' ? 'Partial output' : 'Output generation'}</strong><span>First output at {timeLabel(record.ttftMs)}</span></span></span>{track(record.ttftMs, position, !atEnd, 'generation')}<span className="rt-value"><span>{timeLabel(position - record.ttftMs)}</span><span>{atEnd && record.status !== 'cancelled' ? 'Recorded interval' : 'Observed interval'}</span></span></div>}
    {exclusions.length > 0 && <details className="rt-exclusions"><summary>{exclusions.length} {exclusions.length === 1 ? 'provider' : 'providers'} excluded by restriction<span aria-hidden="true">⌄</span></summary><ul>{exclusions.map(span => <li key={span.index}><div><strong>{PROVIDER_NAMES[span.provider]}</strong><span>{modelLabel(span.model)}</span></div><p className="rt-exclusion-reason">{span.reason || 'Excluded by the recorded restriction.'}</p></li>)}</ul></details>}
    {selected && <section className={`rt-selection rt-selection--${selected.status}`} aria-label="Selected attempt evidence"><div className="rt-selection-heading"><strong>{PROVIDER_NAMES[selected.provider]}</strong><span>{timeLabel(selected.start)}–{timeLabel(selected.end)} elapsed</span></div><p className="rt-attempt-reason">{selected.completed ? selected.reason || attemptOutcome(selected) : 'The attempt is still being observed. Its outcome is not yet available.'}</p></section>}
    {showOutcome && atEnd && <div className={`rt-outcome rt-outcome--${record.status}`}><span>{outcome}</span><span>{record.status === 'cancelled' ? 'Final provider usage is unknown.' : `${timeLabel(duration)} total elapsed time`}</span></div>}
    <details className="rt-qualification"><summary>Recorded demo timing</summary><p>Receipt-derived intervals. Individual output-token timestamps are unavailable.</p></details>
  </figure>;
}
