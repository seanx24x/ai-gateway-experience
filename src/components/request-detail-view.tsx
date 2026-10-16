'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import './request-detail-view.css';

/** The source workspace stays mounted behind this document, retaining its selection and scroll. */
export function RequestDetailView({ requestId, returnLabel, onBack, children }: {
  requestId: string;
  returnLabel: string;
  onBack: () => void;
  children: ReactNode;
}) {
  const back = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    back.current?.focus({ preventScroll: true });
  }, [requestId]);
  return <section className="request-detail-view" aria-label="Request details" onKeyDown={event => {
    if (event.key === 'Escape' && !document.querySelector('[aria-modal="true"], dialog[open]')) { event.preventDefault(); onBack(); }
  }}>
    <nav className="request-detail-navigation" aria-label="Request navigation">
      <button ref={back} className="text-button" onClick={onBack} aria-label={`Back to ${returnLabel}`}><ArrowLeft size={16} aria-hidden="true" />Back to {returnLabel}</button>
      <span>Request details</span>
    </nav>
    {children}
  </section>;
}
