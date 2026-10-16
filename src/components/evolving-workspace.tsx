'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, ChevronDown, History, X } from 'lucide-react';
import type { RequestRecord } from '@/lib/gateway';
import { useArtifactMotion } from './journey-next';
import { RequestIdentity } from './request-identity';
import './evolving-workspace.css';

export type WorkspaceStage = 'try' | 'shape' | 'connect' | 'observe';

export interface EvolvingWorkspaceProps {
  stage: WorkspaceStage;
  onStageChange: (stage: WorkspaceStage) => void;
  title: string;
  modelLabel: string;
  alias?: string;
  status: string;
  busy: boolean;
  primaryAction: ReactNode;
  request: ReactNode;
  route: ReactNode;
  routeToolbar?: ReactNode;
  observatory?: ReactNode;
  inspector?: ReactNode;
  comparison?: ReactNode;
  showComparison?: boolean;
  connect: ReactNode;
  observe: ReactNode;
  source?: RequestRecord | null;
  onInspectSource?: () => void;
  onResetSource?: () => void;
  guidance?: ReactNode;
  requestCount: number;
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Slots stay mounted; a single route element changes its position in the same grid. */
export function EvolvingWorkspace({
  stage, onStageChange, title, modelLabel, alias, status, busy, primaryAction,
  request, route, routeToolbar, observatory, inspector, comparison, showComparison = false, connect, observe,
  source, onInspectSource, onResetSource, guidance, requestCount,
}: EvolvingWorkspaceProps) {
  const id = useId();
  const routeWrapper = useRef<HTMLDivElement>(null);
  const sourceChip = useRef<HTMLDetailsElement>(null);
  useArtifactMotion(sourceChip, `${stage}:${showComparison}:${source?.id ?? "none"}`);
  const focusedElement = useRef<HTMLElement | null>(null);
  const sourceDetails = useRef<HTMLDetailsElement>(null);
  const inspectorContent = useRef<HTMLDivElement>(null);
  const inspectorToggle = useRef<HTMLButtonElement>(null);
  const inspectorOpener = useRef<HTMLElement | null>(null);
  const revealInspector = useRef(false);
  const previousStage = useRef(stage);
  const [inspectorExpanded, setInspectorExpanded] = useState(false);
  const workingStage = stage === 'try' || stage === 'shape';
  const routeVisible = (stage === 'try' && !observatory) || (stage === 'shape' && !showComparison);
  const comparisonVisible = stage === 'shape' && showComparison;
  const inspectorVisible = workingStage && Boolean(inspector) && !(stage === 'try' && Boolean(observatory)) && !comparisonVisible;

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      const details = sourceDetails.current;
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) details.open = false;
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  useEffect(() => { if (sourceDetails.current) sourceDetails.current.open = false; }, [stage, source?.id]);

  useEffect(() => {
    // Context belongs to this working surface. Leaving it never reopens a stale
    // selection when the user returns from a comparison or another workspace.
    if (!inspectorVisible) setInspectorExpanded(false);
  }, [inspectorVisible]);
  useEffect(() => { setInspectorExpanded(false); }, [stage, source?.id]);

  useLayoutEffect(() => {
    if (!revealInspector.current || !inspectorExpanded || !inspectorVisible) return;
    revealInspector.current = false;
    const content = inspectorContent.current;
    if (!content) return;
    content.focus({ preventScroll: true });
    content.scrollIntoView({ block: 'start', behavior: window.matchMedia(REDUCED_MOTION_QUERY).matches ? 'instant' : 'smooth' });
  });

  function closeInspector() {
    revealInspector.current = false;
    setInspectorExpanded(false);
    const opener = inspectorOpener.current;
    if (opener?.isConnected && !opener.closest('[hidden]')) opener.focus();
    else if (inspectorToggle.current && inspectorVisible) inspectorToggle.current.focus();
    else document.querySelector<HTMLElement>('#main h1')?.focus();
  }

  useLayoutEffect(() => {
    const previousFocus = focusedElement.current;
    const currentFocus = document.activeElement;
    if (previousStage.current !== stage && previousFocus?.closest('[hidden]')
      && (currentFocus === previousFocus || currentFocus === document.body)) {
      document.querySelector<HTMLElement>('#main h1')?.focus();
    }
    previousStage.current = stage;
  }, [stage]);

  return <div className="ew-workspace" data-testid="evolving-workspace" data-stage={stage}
    data-workspace-stage={stage} data-comparison={comparisonVisible}
    data-inspector={Boolean(inspector)} data-inspector-expanded={inspectorExpanded} data-observatory={Boolean(observatory)} aria-label={`${title} workspace`}
    onFocusCapture={event => { if (event.target instanceof HTMLElement) focusedElement.current = event.target; }}>
    <header className="ew-identity">
      <div className="ew-identity-content">
        <h1 tabIndex={-1}>{title}</h1>
        <div className="ew-identity-meta">
          {alias && <code className="ew-alias">{alias}</code>}
          <span className="ew-connection-status" role="status">{status}</span>
        </div>
      </div>
      <div className="ew-primary-action">{primaryAction}</div>
    </header>

    <div className="ew-navigation" hidden={!['shape', 'connect'].includes(stage) || !source}>
    {source ? <section className="ew-source-shelf" data-testid="working-source" aria-label="Captured source request">
      <History size={14} className="ew-source-symbol" aria-hidden="true" />
      <span className="ew-source-label">Based on</span>
      <details className="ew-source-details" ref={node => { sourceDetails.current = node; sourceChip.current = node; }} onKeyDown={event => {
        if (event.key === 'Escape' && event.currentTarget.open) {
          event.preventDefault(); event.currentTarget.open = false;
          event.currentTarget.querySelector('summary')?.focus();
        }
      }}>
        <summary className="ew-source-identity"><RequestIdentity record={source} /><ChevronDown size={12} aria-hidden="true" /></summary>
        <div className="ew-source-workload"><strong>Captured workload</strong><p>{source.prompt ?? 'Workload unavailable in this receipt.'}</p></div>
      </details>
      <div className="ew-source-actions">
        {onInspectSource ? <button type="button" className="ew-source-button" disabled={busy} onClick={onInspectSource}>Inspect source<ArrowUpRight size={12} aria-hidden="true" /></button> : null}
        {onResetSource ? <button type="button" className="ew-source-clear" disabled={busy} onClick={onResetSource} aria-label="Clear comparison source"><X size={14} aria-hidden="true" /></button> : null}
      </div>
    </section> : null}
    </div>

    <div className="ew-canvas">
      <div className="ew-route-toolbar" hidden={stage !== 'shape'}>{routeToolbar}</div>
      <section className="ew-request-slot ew-slot" id={`${id}-try`} hidden={stage !== 'try'} aria-label="Try the workload">{request}</section>
      <section className="ew-observatory-slot ew-slot" hidden={stage !== 'try' || !observatory} aria-label="Request observatory">{observatory}</section>
      <div className="ew-route-slot ew-slot" ref={routeWrapper} id={`${id}-shape`} hidden={!routeVisible} aria-label="Shared route instrument" onClickCapture={event => {
        const target = event.target as HTMLElement;
        const trigger = target.closest<HTMLButtonElement>('.rf-provider-button, .rf-model-button');
        if (trigger) {
          inspectorOpener.current = trigger;
          revealInspector.current = true;
          setInspectorExpanded(true);
        }
      }}>{route}</div>
      <section className="ew-inspector-slot ew-slot" hidden={!inspectorVisible} aria-label="Route context" onKeyDown={event => {
        if (event.key === 'Escape' && !event.defaultPrevented && inspectorExpanded) {
          event.preventDefault(); event.stopPropagation(); closeInspector();
        }
      }}>
        <div className="ew-inspector-disclosure" data-open={inspectorExpanded}>
          <div className="ew-inspector-header">
            <button type="button" ref={inspectorToggle} className="ew-inspector-toggle" aria-expanded={inspectorExpanded} aria-controls={`${id}-settings`} onClick={event => {
              if (inspectorExpanded) closeInspector();
              else { inspectorOpener.current = event.currentTarget; setInspectorExpanded(true); }
            }}><span>Route settings</span><ChevronDown size={16} aria-hidden="true" /></button>
            {inspectorExpanded && <button type="button" className="text-button ew-context-close" aria-label="Close route settings" onClick={closeInspector}>Done<X size={14} aria-hidden="true" /></button>}
          </div>
          <div className="ew-inspector-content" id={`${id}-settings`} role="region" aria-label="Route settings" ref={inspectorContent} tabIndex={-1} hidden={!inspectorExpanded}>{inspector}</div>
        </div>
      </section>
      <section className="ew-comparison-slot ew-slot" id={`${id}-comparison`} hidden={!comparisonVisible} aria-label="Same workload comparison">{comparison}</section>
      <section className="ew-connect-slot ew-slot" id={`${id}-connect`} hidden={stage !== 'connect'} aria-label="Connect your application">{connect}</section>
      <section className="ew-observe-slot ew-slot" id={`${id}-observe`} hidden={stage !== 'observe'} aria-label="Observe local requests">{observe}</section>
    </div>

    <div className="ew-guidance-slot" aria-label="Suggested next action">{guidance}</div>
  </div>;
}
