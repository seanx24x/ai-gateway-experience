'use client';

import { Activity, BookOpen, Boxes, ChevronDown, CircleDollarSign, Gauge, KeyRound, List, Network, Settings, Terminal, Trophy, Waypoints, Wrench } from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import type { View } from './gateway-app';
import './workspace-navigation.css';

const items = [
  { view: 'dashboard', label: 'Overview', icon: Network },
  { view: 'connect', label: 'Connect', icon: Wrench },
  { view: 'routes', label: 'Routing', icon: Network },
  { view: 'monitor', label: 'Logs', icon: List },
  { view: 'budgets', label: 'Budgets & Spend', icon: CircleDollarSign },
  { view: 'keys', label: 'API Keys', icon: KeyRound },
  { view: 'byok', label: 'Bring Your Own Key', icon: Waypoints },
  { view: 'virtual-models', label: 'Virtual Models', icon: Boxes },
  { view: 'settings', label: 'Settings', icon: Settings },
  { view: 'models', label: 'Models', icon: Gauge },
  { view: 'leaderboards', label: 'Leaderboards', icon: Trophy },
  { view: 'documentation', label: 'Documentation', icon: BookOpen },
  { view: 'playground', label: 'Playground', icon: Terminal },
] as const;

export function WorkspaceNavigation({ view, onNavigate, compact = false }: { view: View; onNavigate: (view: View, event: MouseEvent<HTMLAnchorElement>) => void; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const current = items.find(item => item.view === view);
  return <aside className={`gateway-sidebar${compact ? ' gateway-sidebar--compact' : ''}`} aria-label="Gateway workspace navigation" onKeyDown={event => { if (event.key === 'Escape' && expanded) { event.preventDefault(); setExpanded(false); event.currentTarget.querySelector<HTMLButtonElement>('.gateway-mobile-nav')?.focus(); } }}>
    <div className="gateway-sidebar-heading"><Activity size={19} aria-hidden="true" /><strong>AI Gateway</strong></div>
    <button className="gateway-mobile-nav" type="button" aria-label="Choose Gateway section" aria-expanded={expanded} aria-controls="gateway-workspace-links" onClick={() => setExpanded(!expanded)}>{compact && <><span className="gateway-section-label">AI Gateway</span><span className="gateway-section-divider" aria-hidden="true">/</span></>}<span>{view === 'routes' ? 'Routing' : current?.label ?? 'AI Gateway'}</span><ChevronDown size={16} aria-hidden="true" /></button>
    <nav id="gateway-workspace-links" aria-label="Workspace" className={expanded ? 'is-expanded' : ''}>
      {items.map(({ view: target, label, icon: Icon }) => {
        const selected = target === view;
        return <a key={target} href={`/${target}`} aria-current={selected ? 'page' : undefined} className={selected ? 'active' : ''} onClick={event => { onNavigate(target, event); if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) setExpanded(false); }}><Icon size={17} aria-hidden="true" /><span>{label}</span></a>;
      })}
    </nav>
    <div className="gateway-sidebar-foot"><span className="live-dot" aria-hidden="true" /><span>Interactive demo<br /><small>Requests and settings are simulated.</small></span></div>
  </aside>;
}
