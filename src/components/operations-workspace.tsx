'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronRight, CircleHelp, CornerDownRight, KeyRound, Layers3, Plus, ReceiptText, ShieldCheck, X } from 'lucide-react';
import { MODELS, PROVIDER_NAMES, formatCost, getMetrics, type ProviderId, type RequestRecord, type RoutingConfig, type Scenario } from '@/lib/gateway';
import { visibleRequestIdentity } from '@/lib/request-guidance';
import { addWorkspaceConnection, addWorkspaceKey, defaultWorkspace, getIdentityUsage, removeWorkspaceBudget, saveWorkspaceSettings, setWorkspaceConnectionEnabled, setWorkspaceKeyStatus, upsertWorkspaceBudget, type WorkspaceBudget, type WorkspaceKey, type WorkspaceSettings, type WorkspaceState } from '@/lib/workspace';
import { RequestField } from './request-field';
import { CredentialScope, type CredentialScopeLane } from './credential-scope';
import { BudgetEditor, BudgetPath, KeyEditor } from './spending-flow';
import { JourneyNext } from './journey-next';
import { pageGuidance } from '@/lib/action-guidance';
import './operations-workspace.css';
import './spending-controls.css';
import './provider-billing.css';

export type OperationsView = 'dashboard' | 'budgets' | 'keys' | 'byok' | 'settings';
type WorkspaceDestination = 'dashboard' | 'connect' | 'monitor' | 'routes' | 'virtual-models' | 'models' | 'playground' | 'keys' | 'budgets' | 'byok' | 'settings';
export interface OperationsWorkspaceProps {
  view: OperationsView;
  requests: RequestRecord[];
  active: RoutingConfig;
  state: WorkspaceState;
  onChange: (next: WorkspaceState) => void;
  onNavigate: (view: WorkspaceDestination) => void;
  onInspect: (record: RequestRecord) => void;
  onFilterLogs: (q: string, identity?: 'oidc' | 'api-key') => void;
  onScenario: (scenario: Scenario) => void;
}

const SOURCES = {
  budgets: 'https://vercel.com/docs/ai-gateway/observability-and-spend/budgets',
  keys: 'https://vercel.com/docs/ai-gateway/authentication-and-byok/api-keys',
  oidc: 'https://vercel.com/docs/ai-gateway/authentication-and-byok/oidc',
  byok: 'https://vercel.com/docs/ai-gateway/authentication-and-byok/byok',
};
const modelName = (id: string) => MODELS.find(model => model.id === id)?.name ?? id;
const date = (timestamp: number) => new Date(timestamp).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
const time = (timestamp: number) => new Date(timestamp).toISOString().slice(11, 19);
const money = (amount: number) => amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const demoId = (kind: string) => `demo_${kind}_${crypto.randomUUID()}`;

function Documentation({ href, children = 'Documentation' }: { href: string; children?: ReactNode }) {
  return <a className="ops-doc-link" href={href} target="_blank" rel="noreferrer">{children}<ArrowUpRight size={13} /></a>;
}

function Qualification({ children, href }: { children: ReactNode; href?: string }) {
  return <div className="ops-qualification"><CircleHelp size={15} /><p>{children}</p>{href && <Documentation href={href} />}</div>;
}

function DemoStatus({ children, kind = 'neutral' }: { children: ReactNode; kind?: 'neutral' | 'positive' | 'warning' }) {
  return <span className={`ops-status ${kind}`}><i />{children}</span>;
}

function FormError({ message }: { message: string }) {
  return message ? <p className="ops-error" role="alert">{message}</p> : null;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    if (element && !element.open) {
      element.showModal();
      element.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    return () => {
      if (element?.open) element.close();
      if (previous?.isConnected && !previous.matches(':disabled')) previous.focus();
      else document.querySelector<HTMLElement>('.ops-workspace h1')?.focus();
    };
  }, []);
  return <dialog ref={dialog} className="ops-dialog" aria-labelledby="ops-dialog-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  }}><div className="ops-dialog-heading"><h2 id="ops-dialog-title">{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={18} /></button></div>{children}</dialog>;
}

function InlineReveal({ open, id, label, className, children }: { open: boolean; id: string; label: string; className: string; children: ReactNode }) {
  return <div className={`sc-reveal ${className}`} data-open={open} aria-hidden={!open} inert={!open}><div className="sc-reveal-clip"><section id={id} role="region" aria-label={label}>{children}</section></div></div>;
}

function ConnectionEditor({ saveError, onSave, onClose }: { saveError: string; onSave: (provider: ProviderId, label: string, enabled: boolean) => void; onClose: () => void }) {
  const [provider, setProvider] = useState<ProviderId>('anthropic');
  const [label, setLabel] = useState('');
  const [enabled, setEnabled] = useState(true);
  return <Modal title="Add demo provider connection" onClose={onClose}><form className="ops-form" onSubmit={event => { event.preventDefault(); if (label.trim()) onSave(provider, label.trim(), enabled); }}><p className="ops-form-intro">Explore a team-wide provider connection using metadata. A real connection requires provider credentials and validation in Vercel.</p><label><span className="field-label">Provider</span><select value={provider} onChange={event => setProvider(event.target.value as ProviderId)}>{Object.entries(PROVIDER_NAMES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label><span className="field-label">Connection label</span><input data-autofocus placeholder="e.g. Existing Anthropic agreement" maxLength={64} value={label} onChange={event => setLabel(event.target.value)} required /></label><label className="ops-checkbox"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /><span>Enable this demo connection</span></label><div className="ops-impact"><ShieldCheck size={17} /><p>This form accepts no secrets. Enabling metadata does not validate credentials, change recorded requests, or establish provider health.</p></div><Documentation href={SOURCES.byok}>Credential setup in Vercel</Documentation><FormError message={saveError} /><div className="ops-form-footer"><button className="button secondary" type="button" onClick={onClose}>Cancel</button><button className="button primary" type="submit" disabled={!label.trim()}>Add demo connection</button></div></form></Modal>;
}

export function OperationsWorkspace(props: OperationsWorkspaceProps) {
  const { view, requests, active, state, onChange, onNavigate, onInspect, onFilterLogs, onScenario } = props;
  const [coverageOpen, setCoverageOpen] = useState(false);
  const flowReturn = useRef<{ selector: string; scroll: number } | null>(null);
  const previousEditor = useRef<string | null>(null);
  const [detail, setDetail] = useState<'key' | 'budget' | null>(null);
  const [editor, setEditor] = useState<'key' | 'connection' | 'budget' | null>(null);
  const [editingBudget, setEditingBudget] = useState<WorkspaceBudget | null>(null);
  const [budgetKeyId, setBudgetKeyId] = useState<string | undefined>();
  const [review, setReview] = useState<{ kind: 'revoke' | 'remove-budget' | 'reset-settings'; id?: string } | null>(null);
  const [notice, setNotice] = useState('');
  const [operationError, setOperationError] = useState('');
  const [settingsDraft, setSettingsDraft] = useState<WorkspaceSettings>(() => ({ ...state.settings }));
  const [keyFilter, setKeyFilter] = useState<'all' | 'active' | 'revoked'>('all');
  const [search, setSearch] = useState('');
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [scopeLane, setScopeLane] = useState<'key' | 'oidc' | 'byok'>('key');
  const metrics = getMetrics(requests);
  const apiUsage = getIdentityUsage(requests, 'api-key');
  const oidcUsage = getIdentityUsage(requests, 'oidc');
  const orderedRequests = [...requests].sort((a, b) => b.timestamp - a.timestamp);
  const knownUsage = requests.filter(request => request.status !== 'cancelled' && request.usageKnown !== false);
  const settingsChanged = JSON.stringify(settingsDraft) !== JSON.stringify(state.settings);
  const continuation = !editor && !review && view !== 'byok' ? pageGuidance(view, { saved: !!notice && !settingsChanged, uncappedKeys: state.keys.filter(key => key.status === 'active' && !state.budgets.some(cap => cap.keyId === key.id && cap.enabled)).length }) : null;

  const { name: savedName, activityDensity: savedDensity, showWorkloadPreview: savedPreview } = state.settings;
  useEffect(() => { setSettingsDraft({ name: savedName, activityDensity: savedDensity, showWorkloadPreview: savedPreview }); }, [savedName, savedDensity, savedPreview]);
  useEffect(() => { flowReturn.current = null; setCoverageOpen(false); setDetail(null); setEditor(null); setReview(null); setNotice(''); setSearch(''); setOperationError(''); }, [view]);
  useEffect(() => { setOperationError(''); }, [editor, review]);

  useEffect(() => {
    if (previousEditor.current && !editor && flowReturn.current) {
      const target = flowReturn.current;
      const frame = requestAnimationFrame(() => {
        window.scrollTo({ top: target.scroll, behavior: 'instant' });
        const element = document.querySelector<HTMLElement>(target.selector) ?? document.querySelector<HTMLElement>('.ops-workspace h1');
        element?.focus({ preventScroll: true });
        const bounds = element?.getBoundingClientRect();
        if (bounds && (bounds.top < 0 || bounds.bottom > innerHeight)) element?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      });
      previousEditor.current = editor;
      return () => cancelAnimationFrame(frame);
    }
    previousEditor.current = editor;
  }, [editor]);

  function closeEditor() { setEditor(null); }
  function createKey() {
    flowReturn.current = { selector: '#sc-create-key', scroll: window.scrollY };
    setEditor('key');
  }

  function commit(update: () => WorkspaceState, message: string) {
    try {
      const next = update();
      onChange(next);
      setEditor(null); setReview(null); setNotice(message); setOperationError('');
      return true;
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : 'This demo change could not be saved. Review the metadata and try again.');
      return false;
    }
  }
  function editBudget(budget: WorkspaceBudget | null, keyId?: string) {
    const selector = view === 'keys' && keyId ? `#sc-key-trigger-${keyId}` : budget ? `#sc-budget-trigger-${budget.id}` : '#sc-create-budget';
    flowReturn.current = { selector, scroll: window.scrollY };
    setEditingBudget(budget); setBudgetKeyId(keyId); setEditor('budget');
  }
  function restoreKey(key: WorkspaceKey) {
    if (!commit(() => setWorkspaceKeyStatus(state, key.id, 'active'), 'Demo key metadata restored. Real revoked keys must be replaced.')) return;
    const filteredOut = keyFilter === 'revoked';
    if (filteredOut) setDetail(null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(filteredOut ? '.ops-key-filters select' : `#sc-key-trigger-${key.id}`)?.focus({ preventScroll: true }));
  }

  function budgetEditor() {
    return <BudgetEditor state={state} budget={editingBudget} initialKeyId={budgetKeyId} saveError={operationError} destination={view === 'keys' ? 'keys' : 'budgets'} entryScroll={flowReturn.current?.scroll ?? 0} onClose={closeEditor} onSave={budget => {
      if (commit(() => upsertWorkspaceBudget(state, budget), 'Demo budget saved. It changes metadata, with no real spending enforcement.')) {
        if (view === 'keys') { setSelectedKeyId(budget.keyId); setDetail('key'); }
        else { setSelectedBudgetId(budget.id); setDetail('budget'); }
        flowReturn.current = { selector: view === 'keys' ? `#sc-key-trigger-${budget.keyId}` : `#sc-budget-trigger-${budget.id}`, scroll: flowReturn.current?.scroll ?? window.scrollY };
      }
    }} />;
  }

  function heading(title: string, description: string, action?: ReactNode) {
    return <div className="page-heading ops-heading"><div><h1 tabIndex={-1}>{title}</h1><p>{description}</p></div>{action}</div>;
  }

  function dashboard() {
    return <>
      {heading('Overview', 'Recorded requests and outcomes.', <button className="button primary" onClick={() => onNavigate('playground')}>Run a request <ArrowRight size={15} /></button>)}
      <div className="ops-summary-strip" aria-label="Stored demo request metrics">
        <div><span>Requests</span><strong className="mono">{metrics.count.toLocaleString()}</strong><small>Stored demo receipts</small></div>
        <div><span>Successful responses</span><strong className="mono">{metrics.successRate === null ? '—' : `${Math.round(metrics.successRate)}%`}</strong><small>Includes recovered requests</small></div>
        <div><span>P75 first output</span><strong className="mono">{metrics.p75Ttft === null ? '—' : `${metrics.p75Ttft.toLocaleString()} ms`}</strong><small>Successful and recovered only</small></div>
        <div><span>Known inference cost</span><strong className="mono">{formatCost(metrics.spend)}</strong><small>{metrics.unknownUsage ? `${metrics.unknownUsage} with unknown final usage` : `${knownUsage.length} with known usage`}</small></div>
      </div>
      <RequestField records={requests} onSelectRequest={onInspect} presentation="compact" initialScale="requests" activityDensity={state.settings.activityDensity} showWorkloadPreview={state.settings.showWorkloadPreview} />
      {!requests.length && <div className="ops-first-request"><p>Make your first request to see its route, response, and receipt together.</p><button className="button secondary" onClick={() => onNavigate('playground')}>Run a demo request <ArrowRight size={15} /></button></div>}
      <div className="ops-route-context"><Layers3 size={16} /><span>Active route</span><button className="ops-route-link" onClick={() => onNavigate('virtual-models')}><code>vmc/{active.slug}</code><span>r{active.revision}</span><ArrowUpRight size={15} /></button></div>
    </>;
  }

  function budgets() {
    const availableKey = state.keys.some(key => key.status === 'active' && !state.budgets.some(budget => budget.keyId === key.id));
    const lane: CredentialScopeLane = scopeLane === 'key' ? 'member' : scopeLane;
    const enabledCount = state.budgets.filter(item => item.enabled && state.keys.some(key => key.id === item.keyId && key.status === 'active')).length;
    const uncappedCount = state.keys.filter(item => item.status === 'active' && !state.budgets.some(cap => cap.keyId === item.id && cap.enabled)).length;
    return <>
      {heading('Budgets', 'Set a boundary for each Gateway API key.', !editor && <button id="sc-create-budget" className="button primary" onClick={() => editBudget(null)} disabled={!availableKey}>Create budget <Plus size={15} /></button>)}
      {editor === 'budget' ? budgetEditor() : <>
        <div className="sc-summary" aria-label="Configured budget summary"><span><strong>{enabledCount}</strong> enabled {enabledCount === 1 ? 'cap' : 'caps'}</span><span><strong>{uncappedCount}</strong> active {uncappedCount === 1 ? 'key' : 'keys'} without an enabled cap</span><button id="sc-coverage-trigger" className="text-button" aria-expanded={coverageOpen} aria-controls="sc-coverage" onClick={() => setCoverageOpen(!coverageOpen)}>How coverage works<CircleHelp size={14} /></button></div>
        <InlineReveal open={coverageOpen} id="sc-coverage" label="Gateway budget coverage" className="sc-coverage">
          <div className="sc-coverage-heading"><h2>Follow the credential, find the boundary.</h2><div className="ops-scope-selector" aria-label="Inspect documented budget scope">{([{ id: 'key', label: 'API key' }, { id: 'oidc', label: 'OIDC' }, { id: 'byok', label: 'BYOK' }] as const).map(option => <button key={option.id} aria-pressed={scopeLane === option.id} onClick={() => setScopeLane(option.id)}>{option.label}</button>)}</div></div>
          <CredentialScope lane={lane} />
          <div className="sc-coverage-footer">{scopeLane === 'oidc' ? <button className="text-button" onClick={() => onFilterLogs('', 'oidc')}>View {oidcUsage.count} OIDC receipts <ArrowRight size={14} /></button> : scopeLane === 'byok' ? <button className="text-button" onClick={() => onNavigate('byok')}>Provider connections <ArrowRight size={14} /></button> : <span>Member attribution shown. Team-attributed keys skip the user budget.</span>}<Documentation href={SOURCES.budgets}>Budget reference</Documentation></div>
        </InlineReveal>
        <div className="ops-instrument sc-inventory">
          <section className="ops-ledger" aria-labelledby="ops-budget-ledger-title">
            <div className="ops-section-heading"><h2 id="ops-budget-ledger-title">API-key caps</h2><span className="demo-label">Demo metadata</span></div>
            {state.budgets.length ? <div className="ops-budget-list">{state.budgets.map(budget => {
              const key = state.keys.find(item => item.id === budget.keyId)!;
              const expanded = detail === 'budget' && selectedBudgetId === budget.id;
              return <article className={`ops-budget-row ${expanded ? 'is-selected' : ''}`} key={budget.id}>
                <button id={`sc-budget-trigger-${budget.id}`} className="sc-row-toggle sc-budget-toggle" aria-label={`Inspect budget for ${key.name}`} aria-expanded={expanded} aria-controls={`sc-budget-${budget.id}`} onClick={() => { setSelectedBudgetId(budget.id); setDetail(expanded ? null : 'budget'); }}>
                  <span className="sc-row-identity"><span className="ops-ledger-icon"><Layers3 size={18} /></span><span><strong>{key.name}</strong><small>{key.attribution === 'member' ? 'Member attribution' : 'Team attribution'}</small></span></span>
                  <span className="sc-reset"><CalendarDays size={16} aria-hidden="true" /><span>{budget.period === 'none' ? 'No reset' : `${budget.period[0].toUpperCase() + budget.period.slice(1)}`}<small>{budget.period === 'monthly' ? '1st · 00:00 UTC' : budget.period === 'weekly' ? 'Monday · 00:00 UTC' : budget.period === 'daily' ? '00:00 UTC' : 'Cumulative cap'}</small></span></span>
                  <span className="ops-budget-amount ops-selected-cap"><strong className="mono">{money(budget.limitUsd)}</strong><DemoStatus kind={key.status === 'revoked' ? 'warning' : 'neutral'}>{key.status === 'revoked' ? 'Key revoked in demo' : budget.enabled ? 'Enabled in demo' : 'Disabled in demo'}</DemoStatus></span><ChevronRight className="sc-row-chevron" size={16} />
                </button>
                <InlineReveal open={expanded} id={`sc-budget-${budget.id}`} label="Budget scope inspector" className="sc-row-detail">
                  <div className="sc-detail-grid"><div><p className="sc-detail-label">Applies to requests using this key</p><BudgetPath attribution={key.attribution} /><p className="sc-detail-note">Every applicable cap must allow the request.</p></div><div className="sc-detail-actions"><button className="button secondary" disabled={key.status === 'revoked'} onClick={() => editBudget(budget)}>Edit budget</button><button className="text-button ops-danger" onClick={() => setReview({ kind: 'remove-budget', id: budget.id })}>Remove</button></div></div>
                  <details className="sc-inline-help"><summary><ChevronRight size={14} />What happens at the limit?</summary><div><p>Gateway checks the cap before a request. A request that crosses it can finish; a later request is rejected with a 402 before a provider attempt.</p><button className="text-button" onClick={() => onScenario('budget')}>Rehearse a budget rejection <ArrowRight size={15} /></button></div></details>
                </InlineReveal>
              </article>;
            })}</div> : <div className="ops-empty"><span className="ops-empty-symbol"><Layers3 size={24} /></span><h3>No API-key caps yet.</h3><p>A cap belongs to one Gateway API key. Choose its amount and refresh period.</p><button className="button secondary" onClick={() => availableKey ? editBudget(null) : onNavigate('keys')}>{availableKey ? 'Create demo budget' : 'Create a demo key'}</button></div>}
            <p className="ops-ledger-footnote">Individual key spend is not recorded. These amounts are configured limits.</p>
            {!availableKey && <p className="ops-inline-guidance">Each active demo key has a cap, or no active key exists. <button className="text-button" onClick={() => onNavigate('keys')}>Manage keys <ArrowRight size={13} /></button></p>}
          </section>
        </div>
        <Qualification href={SOURCES.budgets}>Browser-local policy metadata; no real enforcement. Production checks happen before a request, so one that crosses a cap can finish.</Qualification>
      </>}
    </>;
  }

  function keys() {
    const visibleKeys = state.keys.filter(key => (keyFilter === 'all' || key.status === keyFilter) && `${key.name} ${key.id}`.toLowerCase().includes(search.toLowerCase()));
    return <>
      {heading('API keys', 'Manage how your applications connect to Gateway.', !editor && <button id="sc-create-key" className="button primary" onClick={createKey}>Create key <Plus size={15} /></button>)}
      {editor === 'budget' ? budgetEditor() : editor === 'key' ? <KeyEditor saveError={operationError} entryScroll={flowReturn.current?.scroll ?? 0} onClose={closeEditor} onSave={key => {
        if (commit(() => addWorkspaceKey(state, key), 'Demo key metadata created. No usable credential was generated.')) {
          setSearch(''); setKeyFilter('all'); setSelectedKeyId(key.id); setDetail('key');
          flowReturn.current = { selector: `#sc-key-trigger-${key.id}`, scroll: flowReturn.current?.scroll ?? window.scrollY };
        }
      }} /> : <>
        <div className="sc-summary" aria-label="Key inventory summary"><span><strong>{state.keys.filter(item => item.status === 'active').length}</strong> active</span><span><strong>{state.keys.filter(item => item.status === 'revoked').length}</strong> revoked</span><span><strong>{state.keys.filter(item => item.status === 'active' && state.budgets.some(cap => cap.keyId === item.id && cap.enabled)).length}</strong> with an enabled cap</span><details className="sc-oidc-tip"><summary>Deploying on Vercel?<ChevronRight size={14} /></summary><div><strong>Use your project identity.</strong><p>OIDC can authenticate your Vercel application without a manually managed key.</p><button className="text-button" onClick={() => onNavigate('connect')}>Review authentication setup<ArrowRight size={14} /></button></div></details></div>
        <div className="ops-instrument sc-inventory">
          <section className="ops-ledger" aria-labelledby="ops-key-ledger-title">
            <div className="ops-list-toolbar"><h2 id="ops-key-ledger-title">Gateway keys</h2><span className="demo-label">Metadata only</span></div>
            <div className="ops-key-filters"><label><span className="sr-only">Search demo keys</span><input placeholder="Search keys" value={search} onChange={event => { setSearch(event.target.value); setDetail(null); }} /></label><label><span className="sr-only">Demo key status</span><select value={keyFilter} onChange={event => { setKeyFilter(event.target.value as typeof keyFilter); setDetail(null); }}><option value="all">All statuses</option><option value="active">Active</option><option value="revoked">Revoked</option></select></label></div>
            <div className="sc-key-columns" aria-hidden="true"><span>Application</span><span>Spending cap / Status</span></div>
            <div className="ops-key-list">{visibleKeys.map(key => {
              const cap = state.budgets.find(value => value.keyId === key.id);
              const expanded = detail === 'key' && selectedKeyId === key.id;
              return <article className={`ops-key-row ${expanded ? 'is-selected' : ''}`} key={key.id}>
                <button id={`sc-key-trigger-${key.id}`} className="sc-row-toggle sc-key-toggle" aria-label={`Inspect key ${key.name}`} aria-expanded={expanded} aria-controls={`sc-key-${key.id}`} onClick={() => { setSelectedKeyId(key.id); setDetail(expanded ? null : 'key'); }}><span className="sc-row-identity"><span className="ops-ledger-icon"><KeyRound size={18} /></span><span><strong>{key.name}</strong><small>{key.attribution === 'member' ? 'Member attribution' : 'Team attribution'}</small></span></span><span className="ops-key-cap"><strong>{cap?.enabled ? `${money(cap.limitUsd)} / ${cap.period === 'none' ? 'cumulative' : cap.period}` : 'No enabled demo cap'}</strong><DemoStatus kind={key.status === 'active' ? 'neutral' : 'warning'}>{key.status === 'active' ? 'Active in demo' : 'Revoked in demo'}</DemoStatus></span><ChevronRight className="sc-row-chevron" size={16} /></button>
                <InlineReveal open={expanded} id={`sc-key-${key.id}`} label="API key inspector" className="sc-row-detail">
                  <div className="sc-key-detail"><dl className="sc-key-facts"><div><dt>Identifier</dt><dd><code>{key.id}</code></dd></div><div><dt>Created</dt><dd>{date(key.createdAt)}</dd></div></dl><div className="sc-detail-actions">{key.status === 'active' ? <><button className="button secondary" onClick={() => editBudget(cap ?? null, key.id)}>{cap ? 'Edit budget' : 'Add budget'}</button><button className="text-button ops-danger" onClick={() => setReview({ kind: 'revoke', id: key.id })}>Revoke</button></> : <button className="button secondary" onClick={() => restoreKey(key)}>Restore demo metadata</button>}</div></div>
                  <details className="sc-inline-help"><summary><ChevronRight size={14} />Budget coverage</summary><div><BudgetPath attribution={key.attribution} /><p>Every applicable cap must allow the request. Individual spend and last use are unavailable in these receipts.</p><Documentation href={SOURCES.keys}>Key reference</Documentation></div></details>
                </InlineReveal>
              </article>;
            })}</div>
            {!visibleKeys.length && <div className="ops-empty"><h3>{state.keys.length ? 'No matching keys.' : 'No demo keys yet.'}</h3><p>{state.keys.length ? 'Try another name or status.' : 'Name a key to explore attribution and cap coverage.'}</p>{state.keys.length ? <button className="button secondary" onClick={() => { setSearch(''); setKeyFilter('all'); setDetail(null); }}>Clear key filters</button> : <button className="button secondary" onClick={createKey}>Create demo metadata</button>}</div>}
            <div className="ops-lane-evidence"><span><strong>{apiUsage.count}</strong> API-key receipts <small>{formatCost(apiUsage.spend)} known cost across the lane</small></span><button className="text-button" onClick={() => onFilterLogs('', 'api-key')}>View requests <ArrowRight size={14} /></button></div>
          </section>
        </div>
        <Qualification href={SOURCES.keys}>Browser-local metadata. No usable key is created, displayed, or stored. Aggregate API-key traffic cannot be attributed to these rows.</Qualification>
      </>}
    </>;
  }

  function byok() {
    const connection = state.connections.find(item => item.id === selectedConnectionId) ?? state.connections[0];
    return <>
      {heading('Provider connections', 'Keep your provider relationship. Use one request path.', <button className="button primary" onClick={() => setEditor('connection')}>Add connection <Plus size={15} /></button>)}
      <div className="ops-instrument">
        <section className="ops-ledger" aria-labelledby="ops-connections-title">
          <div className="ops-section-heading"><h2 id="ops-connections-title">Team connections</h2><span className="demo-label">No secrets stored</span></div>
          {state.connections.length ? <div className="ops-connection-list">{state.connections.map(item => <article className={`ops-connection-row ${connection?.id === item.id ? 'is-selected' : ''}`} key={item.id}><button className="ops-ledger-select" aria-label={`Inspect connection ${item.label}`} aria-pressed={connection?.id === item.id} onClick={() => setSelectedConnectionId(item.id)}><span className="ops-provider-glyph" aria-hidden="true">{PROVIDER_NAMES[item.provider][0]}</span><span><strong>{PROVIDER_NAMES[item.provider]}</strong><small>{item.label}</small></span><ChevronRight size={16} /></button><DemoStatus>{item.enabled ? 'Enabled in demo' : 'Disabled in demo'}</DemoStatus><button className="ops-toggle" role="switch" aria-label={`${item.enabled ? 'Disable' : 'Enable'} ${item.label}`} aria-checked={item.enabled} onClick={() => commit(() => setWorkspaceConnectionEnabled(state, item.id, !item.enabled), `${item.label} ${item.enabled ? 'disabled' : 'enabled'} in demo metadata. Recorded requests are unchanged.`)}><span /></button></article>)}</div> : <div className="ops-empty ops-connection-empty"><span className="ops-connection-art" aria-hidden="true"><span><KeyRound size={22} /></span><i /><span><Layers3 size={22} /></span><i /><span><ShieldCheck size={22} /></span></span><h3>Your account. Your billing terms.</h3><p>Connect a provider once for use across projects. This demo explores the setup without entering credentials.</p><button className="button secondary" onClick={() => setEditor('connection')}>Add demo connection <Plus size={15} /></button></div>}
          <div className="ops-lane-evidence"><span>Team-wide metadata <small>Credentials are not validated in this concept</small></span><Documentation href={SOURCES.byok}>BYOK reference</Documentation></div>
        </section>
        <aside className="ops-context byok-billing" aria-label="Provider billing path">
          <div className="byok-billing-heading"><div><h2>How provider billing works</h2><p>{connection ? connection.label : 'A documented relationship'}</p></div><dl className="byok-validation"><dt>Validation</dt><dd>Not performed</dd></dl></div>
          <div className="byok-billing-body" data-scope-lane="byok" role="group" aria-label="Documented credential and budget relationship">
            <div className="byok-primary-path" aria-label="Gateway uses your credentials to authenticate to the provider; your provider account is billed">
              <div className="byok-path-step"><span className="byok-path-icon" aria-hidden="true"><KeyRound size={18} /></span><div><small>Credentials</small><strong>Your provider credentials</strong><p>Used by Gateway</p></div></div>
              <ArrowRight className="byok-path-arrow" size={16} aria-hidden="true" />
              <div className="byok-path-step"><span className="byok-path-icon" aria-hidden="true"><Layers3 size={18} /></span><div><small>Inference</small><strong>{connection ? PROVIDER_NAMES[connection.provider] : 'AI provider'}</strong><p>Authenticates with your account</p></div></div>
              <ArrowRight className="byok-path-arrow" size={16} aria-hidden="true" />
              <div className="byok-path-step byok-path-step--billing"><span className="byok-path-icon" aria-hidden="true"><ReceiptText size={18} /></span><div><small>Billed to</small><strong>Your provider account</strong><p>Provider-side billing and controls</p></div></div>
            </div>
            <div className="byok-fallback"><CornerDownRight size={16} aria-hidden="true" /><span>If own credentials fail</span><div><strong>System credential fallback</strong><p>Can use purchased Gateway credits.</p></div></div>
            <div className="byok-billing-foot"><p>Own-credential spend is outside Gateway budgets.</p><div className="byok-billing-links"><button className="text-button" onClick={() => { if (pageGuidance('byok')?.target?.view === 'monitor') onNavigate('monitor'); }}>Inspect request evidence <ArrowRight size={15} /></button><button className="text-button" onClick={() => onNavigate('budgets')}>Gateway budget coverage <ArrowRight size={15} /></button></div></div>
            <details className="byok-evidence"><summary><ChevronRight size={14} />{connection ? 'Connection details and request evidence' : 'Identify the serving credentials'}</summary><div>{connection && <dl><div><dt>Added</dt><dd>{date(connection.createdAt)}</dd></div><div><dt>Metadata</dt><dd>{connection.enabled ? 'Enabled in demo' : 'Disabled in demo'}</dd></div></dl>}<p>Inspect production <code>credentialType</code> to establish which path served a request. These demo receipts do not record it.</p></div></details>
          </div>
        </aside>
      </div>
      <Qualification>Enabling metadata does not validate credentials or change requests. These receipts have no credential type and cannot prove BYOK use or provider-side spend.</Qualification>
    </>;
  }

  function settings() {
    const preview = orderedRequests.slice(0, 2);
    return <>
      {heading('Workspace settings', 'Make the workspace easier to read.')}
      <form className="ops-settings-form" onSubmit={event => { event.preventDefault(); commit(() => saveWorkspaceSettings(state, settingsDraft), 'Workspace preferences saved in this browser.'); }}>
        <div className="ops-settings-layout"><div className="ops-settings-controls">
          <section className="ops-settings-section"><div><h2>Workspace identity</h2></div><label><span className="field-label">Workspace display name</span><input value={settingsDraft.name} maxLength={64} required onChange={event => setSettingsDraft(previous => ({ ...previous, name: event.target.value }))} /></label></section>
          <section className="ops-settings-section"><div><h2>Activity presentation</h2></div><div className="ops-setting-controls"><fieldset className="ops-density-control"><legend className="field-label">Row density</legend><div className="ops-density-options">{(['comfortable', 'compact'] as const).map(density => <label key={density} className="ops-density-option"><input type="radio" name="activity-density" value={density} checked={settingsDraft.activityDensity === density} onChange={() => setSettingsDraft(previous => ({ ...previous, activityDensity: density }))} /><span className={`ops-density-sample ops-density-sample--${density}`} aria-hidden="true"><i /><i /><i /></span><span>{density === 'comfortable' ? 'Comfortable' : 'Compact'}</span><Check size={14} aria-hidden="true" /></label>)}</div></fieldset><label className="ops-checkbox"><input type="checkbox" checked={settingsDraft.showWorkloadPreview} onChange={event => setSettingsDraft(previous => ({ ...previous, showWorkloadPreview: event.target.checked }))} /><span>Show workload preview in selected receipt</span></label></div></section>
        </div><aside className="ops-preference-preview" aria-label="Live workspace preference preview"><div className="ops-preview-header"><span className="ops-team-mark">{(settingsDraft.name.trim() || 'Workspace').slice(0, 1).toUpperCase()}</span><strong>{settingsDraft.name.trim() || 'Workspace'}</strong><span>Preview</span></div><div className="ops-preview-heading">Selected receipt on Overview</div><div className={`ops-activity-list ${settingsDraft.activityDensity}`}>{preview.length ? preview.map(record => <div className="ops-activity-row" key={record.id}><span className={`ops-outcome-dot ${record.status}`} /><span className="ops-activity-main"><strong>{modelName(record.servedModel || record.model)}</strong><span>{record.provider ? PROVIDER_NAMES[record.provider] : 'No served provider'} · {record.status}</span>{settingsDraft.showWorkloadPreview && <small>{record.prompt ?? 'Workload unavailable in this receipt'}</small>}</span><span className="ops-activity-meta"><code>{visibleRequestIdentity(record)}</code><span>{time(record.timestamp)} UTC</span></span></div>) : <div className="ops-preview-empty"><span className="ops-preview-line" /><span className="ops-preview-line" /><p>Request details appear after a demo run.</p></div>}</div><p className="ops-preview-note">Live preview · Save to apply to Overview</p></aside></div>
        {settingsChanged && <div className="ops-settings-save"><span>Unsaved preference changes</span><div><button className="button secondary" type="button" onClick={() => setSettingsDraft({ ...state.settings })}>Discard changes</button><button className="button primary" type="submit" disabled={!settingsDraft.name.trim()}>Save preferences</button></div></div>}
      </form>
      <details className="ops-documentation-detail ops-reset-disclosure"><summary><ChevronRight size={15} />Reset workspace preferences</summary><p>Restore the name and activity presentation. Requests, keys, budgets, connections, and route revisions stay intact.</p><button className="button secondary" onClick={() => setReview({ kind: 'reset-settings' })}>Review preference reset</button></details>
      <Qualification>Preferences persist in this browser. They do not rename a Vercel team or change execution, retention, provider privacy, or billing.</Qualification>
    </>;
  }

  return <div className="workspace-page ops-workspace" data-operations-view={view} onKeyDown={event => {
    if (event.key !== 'Escape' || review) return;
    if (editor === 'key' || editor === 'budget') { event.preventDefault(); closeEditor(); return; }
    const target = event.target as HTMLElement;
    if (coverageOpen && (target.closest('#sc-coverage') || target.id === 'sc-coverage-trigger')) {
      event.preventDefault(); setCoverageOpen(false); document.getElementById('sc-coverage-trigger')?.focus();
    } else if (detail) {
      event.preventDefault(); setDetail(null);
      const id = detail === 'key' ? `sc-key-trigger-${selectedKeyId}` : `sc-budget-trigger-${selectedBudgetId}`;
      document.getElementById(id)?.focus({ preventScroll: true });
    }
  }} onClickCapture={event => { const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (button && !button.disabled) button.focus({ preventScroll: true }); }}>{view === 'dashboard' ? dashboard() : view === 'budgets' ? budgets() : view === 'keys' ? keys() : view === 'byok' ? byok() : settings()}{!editor && !review && <FormError message={operationError} />}{continuation && <JourneyNext guidance={continuation} onAction={guidance => { const destination = guidance.target?.view; if (destination === 'monitor') onFilterLogs(''); else if (destination) onNavigate(destination as WorkspaceDestination); }} />} {notice && <div className="ops-notice" role="status"><Check size={16} /><p>{notice}</p><button className="icon-button" aria-label="Dismiss operations message" onClick={() => setNotice('')}><X size={15} /></button></div>}{editor === 'connection' && <ConnectionEditor saveError={operationError} onClose={() => setEditor(null)} onSave={(provider, label, enabled) => { const id = demoId('connection'); setSelectedConnectionId(id); commit(() => addWorkspaceConnection(state, { id, provider, label, enabled, createdAt: Date.now() }), 'Demo provider metadata added. No credential was entered or validated.'); }} />}{review && <Modal title={review.kind === 'revoke' ? 'Review demo key revocation' : review.kind === 'remove-budget' ? 'Remove this demo budget?' : 'Reset workspace preferences?'} onClose={() => setReview(null)}><div className="ops-form"><p className="ops-form-intro">{review.kind === 'revoke' ? 'In production, deleting a Gateway key immediately invalidates it and dependent applications must switch to a new credential. This action only marks the local metadata as revoked.' : review.kind === 'remove-budget' ? 'Removing a production cap can expose more spend; a scope default may still apply. Here, removal deletes only the saved demo budget metadata and keeps its key.' : 'Only the display name and activity preferences return to their defaults. Every operation record, request, and routing revision remains intact.'}</p>{review.kind === 'revoke' && <div className="ops-impact"><KeyRound size={17} /><p>You can restore this metadata for another rehearsal. A real revoked key cannot be restored; create a replacement in Vercel.</p></div>}<FormError message={operationError} /><div className="ops-form-footer"><button className="button secondary" onClick={() => setReview(null)}>Keep current settings</button><button className="button primary" onClick={() => {
    if (review.kind === 'revoke') commit(() => setWorkspaceKeyStatus(state, review.id!, 'revoked'), 'Demo key metadata revoked. Historical requests and budget metadata remain available.');
    else if (review.kind === 'remove-budget') commit(() => removeWorkspaceBudget(state, review.id!), 'Demo budget metadata removed. The key remains available.');
    else commit(() => saveWorkspaceSettings(state, defaultWorkspace().settings), 'Workspace preferences reset. Operations and request history are preserved.');
  }}>{review.kind === 'revoke' ? 'Revoke demo key' : review.kind === 'remove-budget' ? 'Remove demo budget' : 'Reset preferences'}</button></div></div></Modal>}</div>;
}
