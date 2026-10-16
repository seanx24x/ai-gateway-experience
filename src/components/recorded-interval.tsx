'use client';
import { useState } from 'react';
import { PROVIDER_NAMES, type RequestRecord } from '@/lib/gateway';
import { getObservedAttemptSpans, getReplayDuration } from '@/lib/replay';
import './recorded-interval.css';

/** Receipt intervals on a caller-owned scale. No inferred token timestamps. */
export function RecordedInterval({ record, maxTimeMs }: { record: RequestRecord; maxTimeMs: number }) {
  const [selection, setSelection] = useState<number | null>(null);
  const spans = getObservedAttemptSpans(record);
  const sent = spans.filter(span => span.status !== 'excluded');
  const selected = sent.find(span => span.index === selection);
  const percent = (value: number) => `${Math.min(100, Math.max(0, value / Math.max(1, maxTimeMs) * 100))}%`;
  return <div className="recorded-interval" data-request-id={record.id} data-axis-ms={maxTimeMs}>
    <div className="ri-axis" aria-hidden="true"><span>Elapsed</span><div><span>0</span><span>{Math.round(maxTimeMs / 2).toLocaleString()} ms</span><span>{Math.round(maxTimeMs).toLocaleString()} ms</span></div></div>
    <ol aria-label="Recorded intervals">{sent.map((span, index) => <li key={span.index}><button className={`ri-row ri-row--${span.status}`} aria-pressed={selection === span.index} onClick={() => setSelection(span.index)} aria-label={`Inspect ${PROVIDER_NAMES[span.provider]} interval, ${span.start} to ${span.end} milliseconds, ${span.status}`}><span className="ri-label"><span className="ri-number">{index + 1}</span>{PROVIDER_NAMES[span.provider]}</span><span className="ri-track" aria-hidden="true"><i style={{ left:percent(span.start), width:percent(span.end - span.start) }} /></span><span className="ri-duration">{Math.round(span.end - span.start)} ms<span>{span.status === 'failed' ? 'Failed' : 'First output'}</span></span></button></li>)}</ol>
    {record.ttftMs > 0 && record.response && record.status !== 'failed' && <div className="ri-row ri-generation"><span className="ri-label">↳ Output</span><span className="ri-track" aria-hidden="true"><i style={{ left:percent(record.ttftMs), width:percent(getReplayDuration(record) - record.ttftMs) }} /></span><span className="ri-duration">{Math.round(getReplayDuration(record) - record.ttftMs)} ms<span>{record.status === 'cancelled' ? 'Observed' : 'Generation'}</span></span></div>}
    {!sent.length && <p className="ri-no-attempts">No provider attempt recorded. {record.response}</p>}
    {selected && <div className="ri-evidence" role="status"><strong>{PROVIDER_NAMES[selected.provider]} · {selected.start}–{selected.end} ms</strong><p>{selected.reason}</p></div>}
    {spans.some(span => span.status === 'excluded') && <p className="ri-excluded">Excluded, not attempted: {spans.filter(span => span.status === 'excluded').map(span => PROVIDER_NAMES[span.provider]).join(', ')}.</p>}
  </div>;
}
