'use client';

import { useRef, useState } from 'react';
import { useArtifactMotion } from './journey-next';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { MODELS, PROVIDER_NAMES, formatCost, type RehearsalFixture, type RequestRecord } from '@/lib/gateway';
import { getReplayDuration, getReplayEvents } from '@/lib/replay';
import { RequestTimeline } from './request-timeline';
import { RecordedInterval } from './recorded-interval';
import { RequestIdentity } from './request-identity';
import { JourneyNote } from './journey-note';
import { routeDifferences } from '@/lib/route-difference';
import './rehearsal-comparison.css';

function hasFirstOutput(record: RequestRecord) {
  return getReplayEvents(record).some(event => event.kind === 'first-token');
}

function ComparisonInstrument({ title, policy, record, maxTimeMs, onInspect }: {
  title: 'Baseline' | 'Draft';
  policy: string;
  record: RequestRecord;
  maxTimeMs: number;
  onInspect: (record: RequestRecord) => void;
}) {
  const [selectedAttempt, setSelectedAttempt] = useState<number | null>(null);
  const attempt = selectedAttempt === null ? null : record.attempts[selectedAttempt];
  const statusLabel = { success: 'Success', recovered: 'Recovered', failed: 'Failed', cancelled: 'Stopped' }[record.status];
  const modelLabel = MODELS.find(model => model.id === record.servedModel)?.name ?? 'No served model';
  const firstOutput = hasFirstOutput(record);

  return <article className={`comparison-record oc-record ${record.status}`} aria-label={`${title} request instrument`}>
    <div className="oc-record-heading">
      <div><h3>{title}</h3><p className="comparison-policy-label">{policy}</p></div>
      <span className={`status-badge ${record.status}`}><i aria-hidden="true" />{statusLabel}</span>
    </div>
    <div className="oc-instrument">
      <RequestTimeline record={record} maxTimeMs={maxTimeMs} selectedAttemptIndex={selectedAttempt} onSelectAttempt={setSelectedAttempt} compact showOutcome={false} />
    </div>
    {attempt && selectedAttempt !== null && <div className="oc-attempt-evidence" aria-live="polite" aria-atomic="true">
        <div className="oc-attempt-heading"><strong>{PROVIDER_NAMES[attempt.provider]}</strong><span className="mono">{attempt.status === 'excluded' ? 'Not sent' : `Attempt ${record.attempts.slice(0, selectedAttempt + 1).filter(item => item.status !== 'excluded').length}`} · {attempt.latencyMs} ms</span></div>
        <p>{attempt.reason}</p>
    </div>}
    <div className="oc-record-footer">
      <div className="comparison-values"><div><span>First token</span><strong className="mono">{firstOutput ? `${record.ttftMs} ms` : '—'}</strong></div><div><span>Inference cost</span><strong className="mono">{record.usageKnown === false || record.status === 'cancelled' ? 'Unknown' : formatCost(record.cost)}</strong></div></div>
      <p className="comparison-model">{modelLabel}{record.provider && ` via ${PROVIDER_NAMES[record.provider]}`}</p>
      <details className="oc-record-receipt"><summary>Receipt <ChevronDown size={12} aria-hidden="true" /></summary><code className="comparison-id">{record.id}</code></details>
      <button className="text-button" onClick={() => onInspect(record)}>Inspect {title.toLowerCase()} request <ArrowRight size={14} aria-hidden="true" /></button>
    </div>
  </article>;
}

export function RehearsalComparison({ baseline, draft, fixture, stale, onInspect, activeRevision, sourcePolicy }: { baseline: RequestRecord; draft: RequestRecord; fixture: RehearsalFixture; stale: boolean; onInspect: (record: RequestRecord) => void; activeRevision?: number; sourcePolicy?: 'source' | 'active' }) {
  const [lens, setLens] = useState<'original' | 'draft'>('draft');
  const current = lens === 'draft' ? draft : baseline;
  const lensRef = useRef<HTMLDivElement>(null);
  useArtifactMotion(lensRef, current.id);
  const differences = routeDifferences(baseline.configSnapshot, draft.configSnapshot);
  const successfulFirstOutput = (record: RequestRecord) => (record.status === 'success' || record.status === 'recovered') && hasFirstOutput(record);
  const delta = successfulFirstOutput(baseline) && successfulFirstOutput(draft) ? baseline.ttftMs - draft.ttftMs : null;
  const baselineOrigin = sourcePolicy ?? (fixture.sourceId ? 'source' : 'active');
  const baselineLabel = `${baselineOrigin === 'source' ? 'Source policy' : 'Active policy'} · r${baseline.revision}`;
  const activeChanged = activeRevision !== undefined && activeRevision !== baseline.revision;
  const maxTimeMs = Math.max(getReplayDuration(baseline), getReplayDuration(draft));
  const heading = stale ? 'Your draft changed. Compare again.'
    : draft.status === 'failed' ? 'This draft could not serve the request.'
      : draft.status === 'cancelled' ? 'Observation stopped before completion.'
        : delta === 0 ? 'Same time to the first token.'
          : delta === null ? 'A route change, with its consequences.' : null;

  return <section className="rehearsal-comparison observatory-comparison" aria-label="Controlled route comparison" data-stale={stale}>
    <div className="comparison-heading">
      <div><span className="eyebrow">Same workload. Same provider conditions.</span><h2>{heading ?? <><span className="oc-delta mono">{Math.abs(delta!).toLocaleString()} <span>ms</span></span><span className="oc-delta-description"> {delta! > 0 ? 'less' : 'more'} before the first token.</span></>}</h2></div>
      <span className="demo-label">Simulated comparison</span>
    </div>

    {activeChanged && <p className="comparison-policy-context">The baseline retains {baselineOrigin === 'source' ? 'the source' : 'the compared active'} policy r{baseline.revision}. Your current active policy is r{activeRevision}.</p>}
    <div ref={lensRef} className="comparison-difference" aria-label="Route difference view">
      <div className="comparison-lens-controls" role="group" aria-label="Compare recorded route" onKeyDown={event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'ArrowLeft' || event.key === 'Home' ? 'original' : 'draft'; setLens(next); event.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next === 'draft' ? 1 : 0]?.focus(); }}><button aria-pressed={lens === 'original'} onClick={() => setLens('original')}>Original</button><button aria-pressed={lens === 'draft'} onClick={() => setLens('draft')}>Draft</button><span>{lens === 'draft' ? 'Tested draft' : baselineLabel}</span></div>
      <div className="comparison-change-list">{differences.length ? differences.map(change => <div key={change.label}><span>{change.label}</span><p><del>{change.original}</del><ArrowRight size={12} aria-label="changed to" /><strong>{change.draft}</strong></p></div>) : <p>{baseline.configSnapshot && draft.configSnapshot ? 'No routing policy change in these snapshots.' : 'A configuration snapshot is unavailable; policy differences cannot be established.'}</p>}</div>
      <RecordedInterval key={current.id} record={current} maxTimeMs={maxTimeMs} />
      <div className="comparison-lens-receipt"><RequestIdentity record={current} /><span>{current.status === 'cancelled' || current.usageKnown === false ? 'Final usage unknown' : `${formatCost(current.cost)} inference cost`}</span><button className="text-button" onClick={() => onInspect(current)}>Inspect {lens === 'draft' ? 'draft' : 'original'} receipt<ArrowRight size={14} /></button></div>
    </div>
    <p className="oc-timing-qualification">{stale ? 'These instruments retain the previous test. Compare again to measure the current draft.' : delta !== null ? 'The difference belongs to this fixed fixture. Answer quality and production performance need separate evaluation.' : 'Inspect the attempts and outcome under this fixed demo fixture.'}</p>
    <details className="comparison-full"><summary>Full comparison<ChevronDown size={14} aria-hidden="true" /></summary>
    <div className="comparison-grid">
      <ComparisonInstrument key={baseline.id} title="Baseline" policy={baselineLabel} record={baseline} maxTimeMs={maxTimeMs} onInspect={onInspect} />
      <ComparisonInstrument key={draft.id} title="Draft" policy={`Draft policy · based on r${draft.revision}`} record={draft} maxTimeMs={maxTimeMs} onInspect={onInspect} />
    </div>
    </details>
    <p className="oc-timing-qualification">Receipt-derived demo timing. Select an attempt to inspect its recorded reason. Individual output-token timestamps are unavailable.</p>
    <details className="fixture-details">
      <summary><span>Inspect the fixed provider conditions</span><ChevronDown size={14} aria-hidden="true" /></summary>
      <div className="comparison-fixture-meta"><span>{fixture.auth === 'oidc' ? 'Project OIDC' : 'API key'}</span><span>{fixture.inputTokens} input / {fixture.outputTokens} output fixture tokens</span><code>{fixture.id}</code></div>
      <div className="fixture-provider-list">{Object.entries(fixture.providers).map(([id, condition]) => <div key={id}><strong>{PROVIDER_NAMES[id as keyof typeof PROVIDER_NAMES]}</strong><span>{condition.available ? 'Available' : 'Unavailable'}</span><code>{condition.latencyMs} ms</code><small>{condition.reason}</small></div>)}</div>
      <p>Both requests use this fixture, the same prompt, identity, and token counts. Changing provider order does not move the injected failure to another provider. Failed attempts are modeled before output.</p>
    </details>
    <JourneyNote topic="comparison" />
  </section>;
}
