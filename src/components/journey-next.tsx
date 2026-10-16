'use client';

import { useLayoutEffect, useRef, type RefObject, type ReactNode } from 'react';
import { ArrowRight, Check, X } from 'lucide-react';
import type { ActionGuidance, JourneyOrigin } from '@/lib/action-guidance';
import './journey-next.css';

/** Animate only a changed, existing artifact. Recorded positions are never interpolated. */
export function useArtifactMotion(ref: RefObject<HTMLElement | null>, identity: string) {
  const previous = useRef(identity);
  useLayoutEffect(() => {
    const changed = previous.current !== identity;
    previous.current = identity;
    const element = ref.current;
    if (!changed || !element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animation = element.animate([{ opacity: .65, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 200, easing: 'cubic-bezier(.2,0,0,1)' });
    return () => animation.cancel();
  }, [identity, ref]);
}

export function JourneyNext({ guidance, onAction, onDismiss, children, primary = false }: {
  guidance: ActionGuidance | null;
  onAction: (guidance: ActionGuidance) => void;
  onDismiss?: () => void;
  children?: ReactNode;
  primary?: boolean;
}) {
  const surface = useRef<HTMLElement>(null);
  useArtifactMotion(surface, guidance?.key ?? 'none');
  if (!guidance) return null;
  return <section ref={surface} className="journey-next" aria-label="Continue your work" data-journey-action={guidance.action}>
    <div className="journey-next-copy"><h2>{guidance.title}</h2><p>{guidance.description}</p>{children}</div>
    <button type="button" className={`button ${primary ? 'primary' : 'secondary'}`} onClick={() => onAction(guidance)}>{guidance.label}<ArrowRight size={15} aria-hidden="true" /></button>
    {onDismiss && <button type="button" className="icon-button journey-next-dismiss" aria-label="Dismiss guidance" onClick={onDismiss}><X size={15} /></button>}
  </section>;
}

export function JourneyReturn({ origin, reason, description, onReturn }: { origin: JourneyOrigin; reason?: string; description?: string; onReturn: () => void }) {
  return <nav className="journey-return" aria-label="Investigation context"><span className="journey-return-dot" aria-hidden="true" /><span>Investigating <code>{origin.requestId}</code>{reason && <strong className="journey-return-reason">{reason}</strong>}{description && <details className="journey-return-explanation"><summary>Why this step?</summary><p>{description}</p></details>}</span><button type="button" className="text-button" onClick={onReturn}>Back to request<ArrowRight size={14} aria-hidden="true" /></button></nav>;
}

export function PreparedVerification({ agent, model, children }: { agent: boolean; model: string; children?: ReactNode }) {
  return <section className="prepared-verification" aria-label="Verify in your own environment">
    <div className="prepared-verification-heading"><Check size={16} aria-hidden="true" /><h3>Prepared. Ready to verify in your {agent ? 'agent' : 'app'}.</h3></div>
    <p>{agent ? 'Review the CLI preview, apply the setup in your terminal, then send a request from the coding agent.' : 'Review the changes in your editor, authenticate on your server, then send your first request.'}</p>
    <ol><li><strong>Run in your environment</strong><span>{agent ? 'A coding-agent request uses the configured Gateway connection.' : <>The server sends <code>{model}</code> through Gateway.</>}</span></li><li><strong>Inspect the real request</strong><span>Check its status, serving provider and usage in Vercel’s request logs.</span></li></ol>
    <a className="text-button" href="https://vercel.com/docs/ai-gateway/observability-and-spend" target="_blank" rel="noreferrer">Open verification reference<ArrowRight size={14} aria-hidden="true" /></a>
    {children}<small>Editor handoff, copy and download do not verify a connection.</small>
  </section>;
}
