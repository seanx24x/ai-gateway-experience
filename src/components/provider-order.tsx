"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { PROVIDER_NAMES, type ProviderId } from "@/lib/gateway";
import "./provider-order.css";

export type ProviderOrderProps = {
  providers: ProviderId[];
  onChange: (providers: ProviderId[]) => void;
  disabled?: boolean;
  renderProvider?: (provider: ProviderId, index: number) => ReactNode;
  instruction?: string;
};
type Drag = { id: ProviderId; pointerId: number; startY: number; currentY: number; grabOffset: number; order: ProviderId[]; moved: boolean; capture: HTMLOListElement };
type Position = { left: number; top: number };

function movedOrder(order: ProviderId[], id: ProviderId, destination: number) {
  const next = order.filter(provider => provider !== id);
  next.splice(Math.max(0, Math.min(destination, order.length - 1)), 0, id);
  return next;
}

/** Pointer preview is local; dropping commits one complete preference change. */
export function ProviderOrder({ providers, onChange, disabled = false, renderProvider, instruction = "Drag to reorder, or use the arrow buttons." }: ProviderOrderProps) {
  const instructionId = useId();
  const list = useRef<HTMLOListElement>(null);
  const rows = useRef(new Map<ProviderId, HTMLLIElement>());
  const handles = useRef(new Map<ProviderId, HTMLButtonElement>());
  const positions = useRef(new Map<ProviderId, Position>());
  const animations = useRef<Animation[]>([]);
  const drag = useRef<Drag | null>(null);
  const pendingFocus = useRef<ProviderId | null>(null);
  const suppressClickUntil = useRef(0);
  const [preview, setPreview] = useState<ProviderId[] | null>(null);
  const [dragged, setDragged] = useState<ProviderId | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [feedback, setFeedback] = useState<{ provider: ProviderId; kind: 'moved' | 'cancelled' | 'unchanged' } | null>(null);
  const order = preview ?? providers;
  const orderKey = order.join("|");
  const feedbackPosition = feedback ? providers.indexOf(feedback.provider) : -1;
  const visibleFeedback = dragged ? `Moving ${PROVIDER_NAMES[dragged]} · preview position ${order.indexOf(dragged) + 1} of ${order.length}.`
    : feedback && feedbackPosition >= 0 ? `${feedback.kind === 'cancelled' ? 'Reorder cancelled. ' : ''}${PROVIDER_NAMES[feedback.provider]} ${feedback.kind === 'unchanged' ? 'remains' : 'is'} preference ${feedbackPosition + 1} of ${providers.length}.` : '';

  function capturePositions() {
    const origin = list.current?.getBoundingClientRect();
    if (!origin) return;
    for (const [id, node] of rows.current) { const bounds = node.getBoundingClientRect(); positions.current.set(id, { left: bounds.left - origin.left, top: bounds.top - origin.top }); }
  }

  useLayoutEffect(() => {
    animations.current.forEach(animation => animation.cancel()); animations.current = [];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const origin = list.current?.getBoundingClientRect();
    for (const [id, node] of rows.current) {
      if (id === dragged) continue;
      const target = node.getBoundingClientRect();
      const old = positions.current.get(id);
      if (old && origin && !reduced && typeof node.animate === 'function') {
        const x = old.left - (target.left - origin.left); const y = old.top - (target.top - origin.top);
        if (Math.abs(x) > .5 || Math.abs(y) > .5) animations.current.push(node.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: "translate(0, 0)" }], { duration: 300, easing: "cubic-bezier(.2,0,0,1)" }));
      }
    }
    if (drag.current && list.current) {
      const row = rows.current.get(drag.current.id);
      if (row) setDragOffset(drag.current.currentY - drag.current.grabOffset - (list.current.getBoundingClientRect().top + row.offsetTop));
    }
    if (pendingFocus.current) { handles.current.get(pendingFocus.current)?.focus({ preventScroll: true }); pendingFocus.current = null; }
    return () => { animations.current.forEach(animation => animation.cancel()); };
  }, [orderKey, dragged]);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const stopMovement = () => {
      if (!motion.matches) return;
      animations.current.forEach(animation => animation.cancel());
      animations.current = [];
      positions.current.clear();
    };
    motion.addEventListener('change', stopMovement);
    return () => motion.removeEventListener('change', stopMovement);
  }, []);

  useLayoutEffect(() => {
    if (disabled && drag.current) cancelDrag();
  }, [disabled]);

  function announce(id: ProviderId, next: ProviderId[]) { setFeedback({ provider: id, kind: 'moved' }); setAnnouncement(`${PROVIDER_NAMES[id]} moved to preference ${next.indexOf(id) + 1} of ${next.length}. ${next.map(provider => PROVIDER_NAMES[provider]).join(", ")}.`); }

  function move(id: ProviderId, destination: number) {
    if (disabled || destination < 0 || destination >= providers.length || destination === providers.indexOf(id)) return;
    capturePositions(); pendingFocus.current = id;
    const next = movedOrder(providers, id, destination); onChange(next); announce(id, next);
  }

  function beginDrag(event: PointerEvent<HTMLButtonElement>, id: ProviderId) {
    if (disabled || !event.isPrimary || event.button !== 0 || providers.length < 2) return;
    const node = rows.current.get(id); const capture = list.current; if (!node || !capture) return;
    event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
    capturePositions();
    const bounds = node.getBoundingClientRect();
    drag.current = { id, pointerId: event.pointerId, startY: event.clientY, currentY: event.clientY, grabOffset: event.clientY - bounds.top, order: [...providers], moved: false, capture };
    capture.setPointerCapture(event.pointerId); setPreview([...providers]); setDragged(id); setDragOffset(0);
    setAnnouncement(`Picked up ${PROVIDER_NAMES[id]}, position ${providers.indexOf(id) + 1} of ${providers.length}. Drag to reorder, or press Escape to cancel.`);
  }

  function updateDrag(event: PointerEvent<HTMLOListElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId || !list.current) return;
    event.preventDefault(); current.currentY = event.clientY; current.moved ||= Math.abs(event.clientY - current.startY) > 4;
    const row = rows.current.get(current.id); if (!row) return;
    const top = list.current.getBoundingClientRect().top;
    const center = current.currentY - current.grabOffset + row.offsetHeight / 2;
    let nearest = 0; let distance = Infinity;
    current.order.forEach((id, index) => {
      const item = rows.current.get(id); if (!item) return;
      const nextDistance = Math.abs(center - (top + item.offsetTop + item.offsetHeight / 2));
      if (nextDistance < distance) { nearest = index; distance = nextDistance; }
    });
    if (nearest !== current.order.indexOf(current.id)) { capturePositions(); current.order = movedOrder(current.order, current.id, nearest); setPreview([...current.order]); }
    setDragOffset(current.currentY - current.grabOffset - (top + row.offsetTop));
  }

  function finishDrag(event: PointerEvent<HTMLOListElement>) {
    const current = drag.current; if (!current || current.pointerId !== event.pointerId) return;
    capturePositions(); drag.current = null;
    if (current.capture.hasPointerCapture(current.pointerId)) current.capture.releasePointerCapture(current.pointerId);
    suppressClickUntil.current = current.moved ? Date.now() + 400 : 0;
    pendingFocus.current = current.id; setDragged(null); setDragOffset(0); setPreview(null);
    if (current.order.join("|") !== providers.join("|")) { onChange(current.order); announce(current.id, current.order); }
    else { setFeedback({ provider: current.id, kind: 'unchanged' }); setAnnouncement(`${PROVIDER_NAMES[current.id]} remains at preference ${providers.indexOf(current.id) + 1} of ${providers.length}.`); }
  }

  function cancelDrag() {
    const current = drag.current; if (!current) return;
    capturePositions(); drag.current = null;
    if (current.capture.hasPointerCapture(current.pointerId)) current.capture.releasePointerCapture(current.pointerId);
    pendingFocus.current = current.id; setDragged(null); setDragOffset(0); setPreview(null);
    setFeedback({ provider: current.id, kind: 'cancelled' });
    setAnnouncement(`Reorder cancelled. ${PROVIDER_NAMES[current.id]} remains at position ${providers.indexOf(current.id) + 1}.`);
  }

  return <div className={`po-root${dragged ? " po-root--dragging" : ""}`}>
    <ol ref={list} className="po-list" aria-label="Provider preference order" onPointerMove={updateDrag} onPointerUp={finishDrag} onPointerCancel={cancelDrag} onLostPointerCapture={() => { if (drag.current) cancelDrag(); }}>{order.map((id, index) => <li key={id} ref={node => { if (node) rows.current.set(id, node); else rows.current.delete(id); }} className={`po-row${dragged === id ? " po-row--dragged" : ""}`} style={dragged === id ? { transform: `translateY(${dragOffset}px)` } : undefined}>
      <button ref={node => { if (node) handles.current.set(id, node); else handles.current.delete(id); }} type="button" className="po-handle" aria-label={`Drag ${PROVIDER_NAMES[id]} to reorder`} aria-describedby={instructionId} disabled={disabled || providers.length < 2} onPointerDown={event => beginDrag(event, id)} onClick={event => { if (Date.now() < suppressClickUntil.current) { event.preventDefault(); event.stopPropagation(); } }} onKeyDown={event => {
        if (event.key === "Escape" && drag.current) { event.preventDefault(); cancelDrag(); return; }
        if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "Home" || event.key === "End") { event.preventDefault(); move(id, event.key === "Home" ? 0 : event.key === "End" ? providers.length - 1 : providers.indexOf(id) + (event.key === "ArrowUp" ? -1 : 1)); }
      }}><svg viewBox="0 0 16 20" aria-hidden="true"><circle cx="5" cy="5" r="1" /><circle cx="11" cy="5" r="1" /><circle cx="5" cy="10" r="1" /><circle cx="11" cy="10" r="1" /><circle cx="5" cy="15" r="1" /><circle cx="11" cy="15" r="1" /></svg></button>
      <span className="po-position" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>{renderProvider ? renderProvider(id, index) : <strong className="po-name">{PROVIDER_NAMES[id]}</strong>}
      <div className="po-arrows"><button type="button" className="po-arrow" disabled={disabled || index === 0} aria-label={`Move ${PROVIDER_NAMES[id]} earlier`} onClick={() => move(id, index - 1)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 15V5m-4 4 4-4 4 4" /></svg></button><button type="button" className="po-arrow" disabled={disabled || index === order.length - 1} aria-label={`Move ${PROVIDER_NAMES[id]} later`} onClick={() => move(id, index + 1)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 5v10m-4-4 4 4 4-4" /></svg></button></div>
    </li>)}</ol>
    <p className="po-instruction" id={instructionId}>{visibleFeedback && <span className="po-feedback">{visibleFeedback}</span>}<span>{instruction}</span></p>
    <span className="po-sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
  </div>;
}
