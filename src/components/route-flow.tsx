"use client";

import { useId, useLayoutEffect, useRef, useState } from 'react';
import { PROVIDER_NAMES, type RehearsalFixture, type ProviderId, type RequestRecord, type RoutingConfig } from '@/lib/gateway';
import {
  observedRouteStages, previewRouteStages, replaceModelPreferenceOrder, ROUTE_STRATEGY_LABELS,
  type RouteMode, type RouteRow, type RouteSelection, type RouteStage, type RouteStatus,
} from '@/lib/route-viewmodel';
import { ProviderOrder } from './provider-order';
import './route-flow.css';

export type { RouteMode, RouteSelection } from '@/lib/route-viewmodel';
export type RouteProvider = { id: string; name: string; status: RouteStatus };
export type RouteGroup = { modelId: string; modelName: string; role: 'primary' | 'fallback'; providers: RouteProvider[] };
export type RouteFlowProps = {
  modelName: string;
  providers: RouteProvider[];
  groups?: RouteGroup[];
  phase: 'idle' | 'routing' | 'responding' | 'complete' | 'failed' | 'cancelled';
  compact?: boolean;
  onProviderSelect?: (id: string) => void;
  config?: RoutingConfig;
  record?: RequestRecord | null;
  shownAttempts?: number;
  activeAttemptIndex?: number | null;
  mode?: RouteMode;
  selection?: RouteSelection | null;
  onOrderChange?: (modelId: string, providers: ProviderId[]) => void;
  onSelectionChange?: (selection: RouteSelection) => void;
  conditions?: RehearsalFixture['providers'];
  conditionOverrides?: Partial<Record<ProviderId, boolean>>;
  onConditionChange?: (provider: ProviderId, available: boolean) => void;
  onModelSelect?: (modelId: string) => void;
};

const phaseStatus: Record<RouteFlowProps['phase'], string> = {
  idle: 'Ready to test', routing: 'Routing request', responding: 'Response started',
  complete: 'Request completed', failed: 'Request failed', cancelled: 'Observation stopped',
};
const modeLabels: Record<RouteMode, string> = { preview: 'Route policy', live: 'Request route', receipt: 'Observed route', replay: 'Replay route' };

function StatusMark({ status }: { status: RouteStatus }) {
  return <svg className={`rf-status-mark rf-status-mark--${status}`} viewBox="0 0 16 16" aria-hidden="true">
    {status === 'success' ? <path d="m4 8 2.5 2.5L12 5" /> : status === 'failed' ? <path d="m5 5 6 6m0-6-6 6" /> : status === 'excluded' ? <path d="M4 8h8" /> : status === 'active' ? <><circle cx="8" cy="8" r="5" /><circle className="rf-status-core" cx="8" cy="8" r="1.5" /></> : <circle cx="8" cy="8" r="3" />}
  </svg>;
}

function rowLabel(row: RouteRow, mode: RouteMode, phase: RouteFlowProps['phase']) {
  if (row.status === 'active') return 'Attempting';
  if (row.status === 'failed') return 'Failed before output';
  if (row.status === 'success') return phase === 'cancelled' || phase === 'responding' ? 'Response started' : 'Served response';
  if (row.status === 'excluded') return 'Excluded by restriction';
  return mode === 'preview' ? row.preferencePosition ? 'Preferred provider' : 'Eligible provider' : 'Not attempted';
}

function legacyStages(modelName: string, providers: RouteProvider[], groups?: RouteGroup[]): RouteStage[] {
  return (groups?.length ? groups : [{ modelId: 'requested', modelName, role: 'primary' as const, providers }]).map((group, index) => {
    const rows = group.providers.map(provider => ({ key: `${group.modelId}:${provider.id}`, modelId: group.modelId, provider: provider.id as ProviderId, name: provider.name, status: provider.status }));
    return { key: `${group.modelId}:${index}`, modelId: group.modelId, modelName: group.modelName, role: group.role, preferred: [], observed: rows.filter(row => row.status !== 'idle' && row.status !== 'excluded'), pool: rows.filter(row => row.status === 'idle'), excluded: rows.filter(row => row.status === 'excluded'), reached: rows.some(row => row.status !== 'idle' && row.status !== 'excluded') };
  });
}

/** Policy is editable; request evidence follows the exact recorded attempt order. */
export function RouteFlow({
  modelName, providers, groups, phase, compact = false, onProviderSelect, config, record,
  shownAttempts, activeAttemptIndex = null, mode: selectedMode, selection, onOrderChange,
  onSelectionChange, onModelSelect, conditions, conditionOverrides, onConditionChange,
}: RouteFlowProps) {
  const id = useId();
  const [localSelection, setLocalSelection] = useState<RouteSelection | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const scene = useRef<HTMLDivElement>(null);
  const stops = useRef(new Map<string, HTMLSpanElement>());
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
  const mode = selectedMode ?? (phase === 'idle' ? 'preview' : phase === 'routing' || phase === 'responding' ? 'live' : 'receipt');
  const stages = mode === 'preview' && config ? previewRouteStages(config)
    : record && mode !== 'preview' ? observedRouteStages(record, shownAttempts, activeAttemptIndex)
      : legacyStages(modelName, providers, groups);
  const selected = selection === undefined ? localSelection : selection;
  const editable = mode === 'preview' && Boolean(config && onOrderChange);
  const canInspect = Boolean(onSelectionChange || onProviderSelect);
  const noProviderAttempt = record && mode !== 'preview' && phase === 'failed' && !record.attempts.some(attempt => attempt.status !== 'excluded');
  const observedRows = stages.flatMap(stage => stage.observed);
  const successfulCompletion = phase === 'complete' && (record ? record.status === 'success' || record.status === 'recovered' : observedRows.some(row => row.status === 'success'));
  const cursorKey = observedRows.find(row => row.status === 'active')?.key
    ?? (phase === 'responding' || successfulCompletion ? observedRows.findLast(row => row.status === 'success')?.key : undefined);
  const visibleStages = mode === 'preview' ? stages : stages.filter(stage => stage.reached || stage.observed.length > 0
    || (stage.role === 'primary' && !stage.pool.length && stage.excluded.length > 0));
  const unattemptedStages = mode === 'preview' ? [] : stages.filter(stage => stage.pool.length > 0 || !visibleStages.includes(stage));
  const unattemptedCount = unattemptedStages.reduce((count, stage) => count + stage.pool.length, 0);
  const unreachedCount = unattemptedStages.filter(stage => !stage.reached).length;

  useLayoutEffect(() => {
    const container = scene.current;
    if (!container || !cursorKey) { setCursorPosition(null); return; }
    function measure() {
      const target = stops.current.get(cursorKey!);
      if (!target || !container) return;
      const origin = container.getBoundingClientRect();
      const bounds = target.getBoundingClientRect();
      setCursorPosition({ x: bounds.left - origin.left + bounds.width / 2 - 13, y: bounds.top - origin.top + bounds.height / 2 - 13 });
    }
    measure();
    const observer = new ResizeObserver(measure); observer.observe(container);
    return () => observer.disconnect();
  }, [cursorKey]);

  function select(row: RouteRow) {
    const next = { modelId: row.modelId, providerId: row.provider, ...(row.attemptIndex !== undefined ? { attemptIndex: row.attemptIndex } : {}) };
    setLocalSelection(next); onSelectionChange?.(next); onProviderSelect?.(row.provider);
  }
  function isSelected(row: RouteRow) {
    return selected?.modelId === row.modelId && selected?.providerId === row.provider && selected?.attemptIndex === row.attemptIndex;
  }
  function changeOrder(stage: RouteStage, next: ProviderId[]) {
    if (!config || !onOrderChange) return;
    onOrderChange(stage.modelId, replaceModelPreferenceOrder(config, stage.modelId, next));
  }
  function addPreference(stage: RouteStage, row: RouteRow) {
    changeOrder(stage, [...stage.preferred.map(item => item.provider), row.provider]);
    setAnnouncement(`${row.name} added as a preference for ${stage.modelName}.`);
  }
  function providerContent(row: RouteRow) {
    return <><span className="rf-provider-name">{row.name}</span><span className="rf-provider-evidence">{row.latencyMs !== undefined && row.latencyMs > 0 ? <><span className="rf-timing">{row.latencyMs.toLocaleString('en-US')} ms</span><span className="rf-evidence-separator" aria-hidden="true">·</span></> : null}{rowLabel(row, mode, phase)}</span></>;
  }
  function providerBody(row: RouteRow, preferred = false) {
    const content = providerContent(row);
    return canInspect ? <button type="button" className={`rf-provider-button${preferred ? ' rf-provider-button--preference' : ''}${isSelected(row) ? ' rf-provider-button--selected' : ''}`} aria-pressed={isSelected(row)} aria-label={`Inspect ${row.name} for ${stages.find(stage => stage.modelId === row.modelId)?.modelName ?? row.modelId}${row.attemptIndex !== undefined ? `, attempt ${row.attemptNumber}` : ''}, ${rowLabel(row, mode, phase).toLowerCase()}`} onClick={() => select(row)}>{content}</button>
      : <div className={`rf-provider-button rf-provider-button--static${preferred ? ' rf-provider-button--preference' : ''}`}>{content}</div>;
  }
  function conditionControl(row: RouteRow) {
    if (mode !== 'preview' || !conditions || row.status === 'excluded') return null;
    const available = conditions[row.provider].available;
    return <button type="button" className={`rf-condition${available ? '' : ' rf-condition--outage'}`} disabled={!onConditionChange}
      aria-label={`${available ? 'Simulate outage for' : 'Restore'} ${row.name}`} aria-pressed={!available}
      title={`${conditionOverrides?.[row.provider] === undefined ? 'Inherited' : 'Edited'} simulation condition. Applies to this provider across all models.`}
      onClick={() => { onConditionChange?.(row.provider, !available); setAnnouncement(`${row.name} ${available ? 'unavailable' : 'available'} in this simulation. Test draft to see the outcome.`); }}>
      <svg viewBox="0 0 16 16" aria-hidden="true">{available ? <path d="m9 2-5 7h4l-1 5 5-8H8Z" /> : <path d="M4 8h8" />}</svg><span>{available ? 'Simulate outage' : 'Restore provider'}</span>
    </button>;
  }
  function renderRows(stage: RouteStage, rows: RouteRow[], pool = false) {
    return <ol className={`rf-provider-list${pool ? ' rf-provider-list--pool' : ''}`} aria-label={pool ? `${stage.modelName} eligible provider pool` : `${stage.modelName} observed attempts`}>{rows.map(row => <li key={row.key} className={`rf-provider rf-provider--${row.status}${isSelected(row) ? ' rf-provider--selected' : ''}`} data-attempt-index={row.attemptIndex}>
      <span ref={node => { if (node) stops.current.set(row.key, node); else stops.current.delete(row.key); }} className="rf-stop" aria-hidden="true">{row.attemptNumber !== undefined ? <span className="rf-attempt-number">{row.attemptNumber}</span> : <StatusMark status={row.status} />}</span>
      {providerBody(row)}
      {conditionControl(row)}
      {row.attemptIndex !== undefined && <StatusMark status={row.status} />}
      {editable && pool && <button type="button" className="rf-add-preference" aria-label={`Prefer ${row.name} for ${stage.modelName}`} title={`Add ${row.name} to preferences`} onClick={() => addPreference(stage, row)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 5v10M5 10h10" /></svg></button>}
    </li>)}</ol>;
  }
  function renderExclusions(stage: RouteStage) {
    return stage.excluded.length > 0 && <details className="rf-exclusions"><summary>{stage.excluded.length} {stage.excluded.length === 1 ? 'provider' : 'providers'} excluded by restriction<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg></summary><ul>{stage.excluded.map(row => <li key={row.key}><StatusMark status="excluded" /><span>{row.name}</span>{row.reason && <span className="rf-exclusion-reason">{row.reason}</span>}</li>)}</ul></details>;
  }
  function renderStage(stage: RouteStage, unused = false) {
    return <section key={stage.key} data-model-role={stage.role} className={`rf-model-group${stage.reached ? ' rf-model-group--reached' : ''}${unused ? ' rf-model-group--unused' : ''}`} aria-label={unused ? `${stage.modelName} candidates not attempted` : `${stage.role === 'primary' ? 'Primary' : 'Fallback'} model ${stage.modelName}`}>
      {!unused && stage.role === 'fallback' && <div className={`rf-fallback-bridge${stage.reached ? ' rf-fallback-bridge--reached' : ''}`}><span className="rf-bridge-mark" aria-hidden="true" /><span>{stage.reached ? 'Continued with another model' : 'If earlier providers fail before output'}</span></div>}
      <div className="rf-group-heading"><span className="rf-model-role">{stage.role === 'primary' ? 'Primary model' : 'Fallback model'}{unused && !stage.reached ? ' · not reached' : ''}</span>{onModelSelect ? <button className="rf-model-button" type="button" onClick={() => onModelSelect(stage.modelId)}><strong className="rf-model-name">{stage.modelName}</strong><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4" /></svg></button> : <strong className="rf-model-name">{stage.modelName}</strong>}</div>
      {!unused && stage.observed.length > 0 && renderRows(stage, stage.observed)}
      {mode === 'preview' && stage.preferred.length > 0 && <div className="rf-preferences"><ProviderOrder providers={stage.preferred.map(row => row.provider)} disabled={!editable} instruction={editable ? 'Drag to change provider preference.' : 'Explicit preferences, in order.'} onChange={next => changeOrder(stage, next)} renderProvider={provider => { const row = stage.preferred.find(row => row.provider === provider)!; return <div className="rf-editable-provider" data-condition={conditions?.[provider].available === false ? 'unavailable' : 'available'}>{providerBody(row, true)}{conditionControl(row)}</div>; }} /></div>}
      {(mode === 'preview' || unused) && stage.pool.length > 0 && <div className="rf-pool">{mode === 'preview' && <div className="rf-pool-heading"><span>{ROUTE_STRATEGY_LABELS[config?.sort ?? 'default']}</span><span className="rf-pool-caption">{stage.preferred.length ? 'Remaining eligible providers' : 'Eligible provider pool'}</span></div>}{renderRows(stage, stage.pool, true)}</div>}
      {!stage.observed.length && !stage.preferred.length && !stage.pool.length && <p className="rf-empty" role={mode === 'preview' ? 'status' : undefined}>No eligible provider for this model.</p>}
      {(mode === 'preview' || !unused || !visibleStages.includes(stage)) && renderExclusions(stage)}
    </section>;
  }

  return <figure className={`rf-root${compact ? ' rf-root--compact' : ''}`} aria-labelledby={`${id}-caption`} data-route-mode={mode}>
    <figcaption className="rf-header" id={`${id}-caption`}><span className="rf-eyebrow">{modeLabels[mode]}</span>{(mode === 'preview' || phase === 'routing' || phase === 'responding') && <span className={`rf-phase rf-phase--${phase}`}><span className="rf-phase-dot" />{phaseStatus[phase]}</span>}</figcaption>
    <div ref={scene} className={`rf-scene rf-scene--${phase}`}>
      {cursorPosition && <span className={`rf-position-marker${phase === 'responding' || successfulCompletion ? ' rf-position-marker--serving' : ''}${successfulCompletion ? ' rf-position-marker--settled' : ''}`} aria-hidden="true" style={{ transform: `translate(${cursorPosition.x}px, ${cursorPosition.y}px)` }} />}
      <div className={`rf-origin${noProviderAttempt ? ' rf-origin--rejected' : ''}`}>
        <span className="rf-app-label"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 5-5 5 5 5m6-10 5 5-5 5" /></svg>Your app</span>
        <span className="rf-origin-connection" aria-hidden="true" />
        <span className="rf-gateway-label"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2 15 14H1Z" /></svg>AI Gateway{noProviderAttempt && <StatusMark status="failed" />}</span>
      </div>
      {noProviderAttempt && <p className="rf-gateway-rejection">{record.attempts.length ? 'No eligible provider. Review the restrictions.' : 'Stopped at Gateway. No provider was attempted.'}</p>}
      <div className="rf-chain">{visibleStages.map(stage => renderStage(stage))}</div>
      {mode !== 'preview' && (phase === 'complete' || phase === 'failed' || phase === 'cancelled') && <div className={`rf-request-terminal rf-request-terminal--${phase}`}><span className="rf-terminal-mark" aria-hidden="true"><StatusMark status={phase === 'complete' ? 'success' : phase === 'failed' ? 'failed' : 'idle'} /></span><span>{phaseStatus[phase]}</span>{phase === 'cancelled' && <span className="rf-terminal-note">Final usage unknown</span>}</div>}
      {unattemptedStages.length > 0 && <details className="rf-unattempted"><summary><span>Not attempted</span><span className="rf-unattempted-count">{unattemptedCount > 0 && `${unattemptedCount} eligible ${unattemptedCount === 1 ? 'provider' : 'providers'}`}{unattemptedCount > 0 && unreachedCount > 0 ? ' · ' : ''}{unreachedCount > 0 && `${unreachedCount} ${unreachedCount === 1 ? 'model' : 'models'} not reached`}</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg></summary><p className="rf-unattempted-note">{record?.configSnapshot ? 'Eligibility from the recorded route policy.' : 'Available model and provider context for this request.'}</p><div>{unattemptedStages.map(stage => renderStage(stage, true))}</div></details>}
    </div>
    {mode === 'preview' && editable && <details className="rf-route-help rf-footer"><summary>How provider preferences work</summary><p>Preferences set priority. Unlisted providers remain eligible unless a restriction excludes them. Gateway chooses from the automatic pool after explicit preferences.</p></details>}
    {mode !== 'preview' && canInspect && <div className="rf-footer">Select an attempt to inspect its evidence.</div>}
    <span className="rf-sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
  </figure>;
}
