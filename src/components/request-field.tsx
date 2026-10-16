'use client';

import { memo, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCost, PROVIDER_NAMES, type RequestRecord } from '@/lib/gateway';
import { nearestRequestPoint, projectRequestField, requestFieldDate, requestFieldTime, REQUEST_FIELD_BASELINE_Y, REQUEST_FIELD_LATENCY_HEIGHT, type RequestFieldPoint, type RequestFieldScale } from '@/lib/request-field';
import type { InspectionOrigin } from './request-identity';
import './request-field.css';

export interface RequestFieldProps {
  records: RequestRecord[];
  presentation?: 'full' | 'compact';
  initialScale?: RequestFieldScale;
  activityDensity?: 'comfortable' | 'compact';
  showWorkloadPreview?: boolean;
  selectedRequestId?: string | null;
  onSelectRequest: (record: RequestRecord, origin?: InspectionOrigin) => void;
  hourFilter?: number | null;
  onSelectHour?: (hour: number | null) => void;
}
const outcomes = { success: 'Success', recovered: 'Recovered', failed: 'Failed', cancelled: 'Cancelled' };
function cause(record: RequestRecord) {
  const failure = record.attempts.find(attempt => attempt.status === 'failed');
  if (record.status === 'cancelled') return `${record.ttftMs > 0 ? 'Cancelled after first output. Final usage was not received.' : 'Cancelled before first output. No completed response.'}${failure ? ` Earlier attempt: ${PROVIDER_NAMES[failure.provider]}: ${failure.reason}` : ''}`;
  if (failure) return `${PROVIDER_NAMES[failure.provider]}: ${failure.reason}`;
  const success = record.attempts.find(attempt => attempt.status === 'success');
  return success?.reason || record.response || 'No provider attempt was recorded.';
}

export const RequestField = memo(function RequestField({ records, selectedRequestId, onSelectRequest, hourFilter = null, onSelectHour, presentation = 'full', initialScale = 'time', activityDensity = 'comfortable', showWorkloadPreview = false }: RequestFieldProps) {
  const [scale, setScale] = useState<RequestFieldScale>(initialScale);
  const [highlight, setHighlight] = useState<RequestRecord['status'] | null>(null);
  const projection = useMemo(() => projectRequestField(records, scale), [records, scale]);
  const [cursor, setCursor] = useState<{ id: string | null; selection: string | null }>({ id: null, selection: selectedRequestId ?? null });
  const directory = useRef(new Map<string, HTMLButtonElement>());
  const id = useId();
  const points = projection.points;
  const gap = projection.largestGap;
  const counts = points.reduce((totals, point) => { totals[point.record.status]++; return totals; }, { success: 0, recovered: 0, failed: 0, cancelled: 0 });
  // A new external selection takes precedence, then local exploration is free to move.
  const externalSelection = selectedRequestId && cursor.selection !== selectedRequestId ? points.find(point => point.record.id === selectedRequestId) : null;
  const active = externalSelection ?? points.find(point => point.record.id === cursor.id) ?? points.find(point => point.record.id === selectedRequestId) ?? points.at(-1) ?? null;
  const activeIndex = active ? points.indexOf(active) : -1;
  const record = active?.record;
  const preview = (requestId: string) => setCursor(previous => previous.id === requestId && previous.selection === (selectedRequestId ?? null) ? previous : { id: requestId, selection: selectedRequestId ?? null });
  const select = (point: RequestFieldPoint) => { preview(point.record.id); onSelectRequest(point.record, { requestId:point.record.id, surface:'field', anchorId:`${id}-point-${point.record.id}` }); };
  function pointAt(event: MouseEvent<HTMLButtonElement> | PointerEvent<HTMLButtonElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return nearestRequestPoint(points, (event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height, bounds.width, bounds.height);
  }
  function navigate(event: KeyboardEvent<HTMLButtonElement>, from = activeIndex, focusDirectory = false) {
    const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? Math.min(points.length - 1, from + 1) : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? Math.max(0, from - 1) : event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : null;
    if (next === null || !points[next]) return;
    event.preventDefault();
    const nextId = points[next].record.id;
    preview(nextId);
    if (focusDirectory) requestAnimationFrame(() => directory.current.get(nextId)?.focus());
  }
  const range = points.length ? `${requestFieldDate(points[0].record.timestamp)}${requestFieldDate(points[0].record.timestamp) !== requestFieldDate(points.at(-1)!.record.timestamp) ? ` – ${requestFieldDate(points.at(-1)!.record.timestamp)}` : ''} · UTC` : 'UTC';

  return <section className={`request-field request-field--${presentation} request-field-density--${activityDensity}`} data-testid="request-field" data-activity-density={activityDensity} data-horizontal-scale={scale} data-highlight={highlight ?? 'all'} aria-labelledby={`${id}-title`}>
    <header className="rqf-heading"><div><h2 id={`${id}-title`}>Request activity</h2><p>Each dot is one request. Higher dots waited longer for first output.</p></div><span className="rqf-scope">{points.length} simulated requests<span>{range}</span></span></header>
    {!points.length ? <div className="rqf-empty"><strong>No recorded requests in this scope.</strong><p>Run a demo request to create a receipt, or choose another identity scope.</p></div> : <>
      <div className="rqf-chart-toolbar"><div className="rqf-current"><span className="rqf-metric-label">Selected first output</span>{active && <span className={`rqf-readout rqf-readout--${active.record.status}`} aria-hidden="true"><strong>{active.record.ttftMs > 0 ? `${active.record.ttftMs.toLocaleString('en-US')} ms` : outcomes[active.record.status]}</strong><span>{active.record.provider ? PROVIDER_NAMES[active.record.provider] : 'No served provider'}{active.record.status === 'cancelled' && active.record.ttftMs > 0 ? ' · stopped' : ''}</span></span>}</div><div className="rqf-scale" role="group" aria-label="Horizontal request scale"><button type="button" aria-pressed={scale === 'requests'} onClick={() => setScale('requests')}>By request</button><button type="button" aria-pressed={scale === 'time'} onClick={() => setScale('time')}>By time</button></div></div>
      <div className="rqf-chart"><div className="rqf-plane">
        {projection.latencyTicks.map(value => <div key={value} className="rqf-y-grid" style={{ top: `${(1 - value / projection.maxTtft) * REQUEST_FIELD_LATENCY_HEIGHT * 100}%` }} aria-hidden="true"><span>{value.toLocaleString('en-US')}</span><i /></div>)}
        <div className="rqf-baseline" style={{ top: `${REQUEST_FIELD_BASELINE_Y * 100}%` }} aria-hidden="true"><span>Not<br />completed</span></div>
        {projection.timeTicks.map((tick, index) => <div key={index} className={`rqf-time-tick rqf-time-tick--${index}`} style={{ left: `${tick.x * 100}%` }} aria-hidden="true"><i /><span>{tick.label}<small>{tick.date}</small></span></div>)}
        <button type="button" className="rqf-plot" data-testid="request-field-plot" aria-label={`Explore ${points.length} recorded requests. ${record ? `Current request ${record.id}.` : ''}`} aria-describedby={`${id}-navigation${gap ? ` ${id}-gap` : ''}`} onKeyDown={event => navigate(event)} onPointerMove={event => { if (event.pointerType === 'touch') return; const next = pointAt(event); if (next) preview(next.record.id); }} onClick={event => { event.currentTarget.focus(); const next = event.detail === 0 ? active : pointAt(event); if (next) select(next); }}>
          <span className="rqf-mark-field" aria-hidden="true">{points.map(point => <span key={point.record.id} id={`${id}-point-${point.record.id}`} data-point-request={point.record.id} className={`rqf-point rqf-point--${point.record.status}${active?.record.id === point.record.id ? ' is-active' : ''}${highlight && point.record.status !== highlight && active?.record.id !== point.record.id ? ' is-dimmed' : ''}`} style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} />)}{active && <><span className="rqf-position" style={{ left: `${active.x * 100}%` }} />{active.plottedTtft && <><span className="rqf-level" style={{ top: `${active.y * 100}%` }} /><span className="rqf-stem" style={{ left: `${active.x * 100}%`, top: `${active.y * 100}%`, height: `${(REQUEST_FIELD_LATENCY_HEIGHT - active.y) * 100}%` }} /></>}</>}</span>
        </button>
        {gap && <span className="rqf-gap" data-testid="request-field-gap" id={`${id}-gap`} role="note" aria-label={`No recorded requests between ${new Date(gap.start).toISOString()} and ${new Date(gap.end).toISOString()} in this identity scope.`} style={{ left: `${gap.x * 100}%`, width: `calc(${gap.width * 100}% - 16px)` }}>No recorded requests in this interval</span>}
      </div></div>
      <div className="rqf-chart-caption"><span>{scale === 'requests' ? 'Request order' : 'Recorded time · UTC'}</span><span>{scale === 'requests' ? 'Even spacing by request. Dates remain in each receipt.' : 'Spacing follows the recorded timestamps.'}</span></div>
      <div className="rqf-legend" role="group" aria-label="Highlight request outcomes">{(Object.entries(outcomes) as [RequestRecord['status'], string][]).map(([status, label]) => <button type="button" key={status} aria-label={`Highlight ${label} requests`} aria-pressed={highlight === status} disabled={counts[status] === 0} onClick={() => setHighlight(highlight === status ? null : status)}><i className={`rqf-symbol rqf-symbol--${status}`} /><span>{label}</span><strong>{counts[status]}</strong></button>)}<span className="rqf-incomplete-note" title="Failed and cancelled requests sit outside the latency scale.">Incomplete outcomes below axis</span></div>
      <p id={`${id}-navigation`} className="rqf-navigation-note">Move across the dots to explore. Arrow keys browse; Enter inspects.</p>
      {record && <div className="rqf-preview" data-testid="request-field-preview"><div className="rqf-preview-top"><span className={`rqf-outcome rqf-outcome--${record.status}`}>{outcomes[record.status]}</span><code>{record.id}</code><span className="rqf-preview-time">{requestFieldDate(record.timestamp)} · {requestFieldTime(record.timestamp)} UTC</span></div>{showWorkloadPreview && <p className="rqf-workload-preview">{record.prompt ?? 'Workload unavailable in this receipt.'}</p>}<dl><div><dt>Serving provider</dt><dd>{record.provider ? PROVIDER_NAMES[record.provider] : 'No served provider'}</dd></div><div><dt>{record.status === 'cancelled' && record.ttftMs > 0 ? 'Output before cancellation' : 'First output'}</dt><dd>{record.ttftMs > 0 ? `${record.ttftMs.toLocaleString('en-US')} ms` : 'No first output'}</dd></div><div><dt>{record.usageKnown === false ? 'Final cost' : 'Recorded cost'}</dt><dd>{record.usageKnown === false ? 'Not received' : formatCost(record.cost)}</dd></div></dl><div className="rqf-preview-bottom"><details className="rqf-cause"><summary>Recorded cause</summary><p>{cause(record)}</p></details><div className="rqf-preview-actions"><button type="button" className="rqf-step" aria-label="Previous recorded request" disabled={activeIndex <= 0} onClick={() => preview(points[activeIndex - 1].record.id)}><ChevronLeft size={16} /></button><span>{activeIndex + 1} / {points.length}</span><button type="button" className="rqf-step" aria-label="Next recorded request" disabled={activeIndex >= points.length - 1} onClick={() => preview(points[activeIndex + 1].record.id)}><ChevronRight size={16} /></button><button type="button" className="rqf-inspect" onClick={event => { event.currentTarget.focus(); select(active!); }}>Inspect request<ArrowRight size={14} /></button></div></div></div>}
      <details className="rqf-directory"><summary><ChevronRight size={14} aria-hidden="true" />Browse all {points.length} recorded requests</summary><ol aria-label="Requests in chronological order">{points.map((point, index) => <li key={point.record.id}><button type="button" ref={element => { if (element) directory.current.set(point.record.id, element); else directory.current.delete(point.record.id); }} tabIndex={point.record.id === active?.record.id ? 0 : -1} aria-label={`Inspect ${point.record.id}, ${requestFieldDate(point.record.timestamp)} ${requestFieldTime(point.record.timestamp)} UTC, ${outcomes[point.record.status]}, ${point.plottedTtft ? `${point.record.ttftMs} milliseconds to first output` : 'not a completed response'}`} onFocus={() => preview(point.record.id)} onKeyDown={event => navigate(event, index, true)} onClick={() => select(point)} className={point.record.id === active?.record.id ? 'is-active' : undefined}><span>{requestFieldTime(point.record.timestamp)}<small>{requestFieldDate(point.record.timestamp)}</small></span><code>{point.record.id}</code><span className={`rqf-outcome rqf-outcome--${point.record.status}`}>{outcomes[point.record.status]}</span><span>{point.plottedTtft ? `${point.record.ttftMs} ms` : '—'}</span></button></li>)}</ol></details>
      {onSelectHour && projection.hours.length > 0 && <details className="rqf-hours"><summary><ChevronRight size={14} aria-hidden="true" />Filter table by recorded hour{hourFilter !== null && <span> · {requestFieldDate(hourFilter)} {requestFieldTime(hourFilter).slice(0, 5)} UTC</span>}</summary><p>The latest eight hours containing requests. Selection filters the table; this field keeps the full identity scope.</p><div className="rqf-hour-chips">{projection.hours.map(hour => <button type="button" key={hour.hour} aria-pressed={hourFilter === hour.hour} aria-label={`Filter table to ${hour.date} ${hour.label} UTC, ${hour.count} requests`} onClick={() => onSelectHour(hourFilter === hour.hour ? null : hour.hour)}><span>{hour.label}<small>{hour.date}</small></span><span>{hour.count}</span></button>)}{hourFilter !== null && <button type="button" className="rqf-clear-hour" onClick={() => onSelectHour(null)}>Clear hour filter</button>}</div></details>}
    </>}
  </section>;
});
