'use client';

import { useLayoutEffect, useRef } from 'react';
import type { RequestRecord } from '@/lib/gateway';
import './request-identity.css';

/** Only the anchor identifier crosses surfaces. Measurements never enter persisted state. */
export interface InspectionOrigin { requestId: string; surface: 'landing' | 'field'; anchorId: string }
export function RequestIdentity({ record, origin, anchorId }: { record: RequestRecord; origin?: InspectionOrigin | null; anchorId?: string }) {
  const marker = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const target = marker.current;
    if (!target || !origin || origin.requestId !== record.id || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const source = document.getElementById(origin.anchorId);
    if (!source) return;
    const from = source.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const visible = (rect: DOMRect) => rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight && rect.left >= 0 && rect.right <= window.innerWidth;
    // A receipt can replace its origin. Preserve the named identity without flying a marker across hidden content.
    const panel = target.closest('.request-detail-view')?.getBoundingClientRect();
    const covered = panel && from.right > panel.left && from.left < panel.right && from.bottom > panel.top && from.top < panel.bottom;
    if (!visible(from) || !visible(to) || covered || getComputedStyle(source).visibility === 'hidden') return;
    const traveler = document.createElement('span');
    traveler.setAttribute('aria-hidden', 'true');
    traveler.className = 'request-travel-marker';
    Object.assign(traveler.style, { left:`${from.x + from.width / 2 - 3}px`, top:`${from.y + from.height / 2 - 3}px`, background:getComputedStyle(target).backgroundColor });
    document.body.append(traveler);
    const animation = traveler.animate([{ transform:'translate(0, 0)', opacity:.7 }, { transform:`translate(${to.x + to.width / 2 - from.x - from.width / 2}px, ${to.y + to.height / 2 - from.y - from.height / 2}px)`, opacity:1 }], { duration:200, easing:'cubic-bezier(.2,.8,.2,1)' });
    const cancel = () => { animation.cancel(); traveler.remove(); };
    void animation.finished.then(() => traveler.remove(), () => traveler.remove());
    window.addEventListener('resize', cancel, {once:true});
    return () => { window.removeEventListener('resize', cancel); cancel(); };
  }, [origin, record.id]);
  return <span className="request-identity" data-request-identity={record.id}><span ref={marker} id={anchorId} className={`request-identity-marker request-identity-marker--${record.status}`} aria-hidden="true" /><code>{record.id}</code><span>r{record.revision}</span></span>;
}
