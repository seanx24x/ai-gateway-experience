'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type MouseEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ArrowRight, ArrowUpRight, ArrowUp, ArrowDown, Check, ChevronDown, ChevronRight, Code2, Copy, ExternalLink, Layers, Moon, Sun, Play, RotateCcw, Search, ShieldCheck, SlidersHorizontal, Square, Terminal, X, Zap, Download, Info, AlertCircle, Activity, Network, Braces } from 'lucide-react';
import { restoreReviewerReceipts, isStoredRoute } from '@/lib/reviewer-session';
import { ReviewEntry, ReviewerHeader, ReviewerMission, ReviewerReflection } from './reviewer-experience';
import { REVIEW_CHAPTERS, initialReviewerProgress, restoreReviewerProgress, reviewerChapter, reviewerHref, recordReviewerEvent, type ReviewerChapterId, type ReviewerProgress, type ReviewerEvent } from '@/lib/reviewer';
import { withRehearsalConditions, restoreRehearsalContext, type RehearsalContext } from '@/lib/rehearsal-conditions';
import { RouteFlow, type RouteSelection } from './route-flow';
import { DesignNotes } from './design-notes';
import { RequestReplay } from './request-replay';
import { RequestTimeline } from './request-timeline';
import { RequestField } from './request-field';
import { RehearsalComparison } from './rehearsal-comparison';
import { DiscoveryDemo } from './discovery-demo';
import { RequestIdentity, type InspectionOrigin } from './request-identity';
import { RequestDetailView } from './request-detail-view';
import { JourneyNote } from './journey-note';
import { JourneyNext, JourneyReturn } from './journey-next';
import { LandingClientTabs, landingCode } from './landing-integration';
import './landing-page.css';
import './visual-workspaces.css';
import { SetupExperience, type SetupPrimaryAction } from './setup-experience';
import { EvolvingWorkspace, type WorkspaceStage } from './evolving-workspace';
import { captureWorkingSource, workingComparisonSignature } from '@/lib/working-connection';
import { WorkspaceNavigation } from './workspace-navigation';
import { OperationsWorkspace } from './operations-workspace';
import { ModelWorkspace } from './model-workspace';
import { defaultWorkspace, validateWorkspaceState, type WorkspaceState } from '@/lib/workspace';
import { concreteModelConfig, createVirtualModel, isVirtualModelAlias, restoreVirtualModels, restoreVirtualModelSessions, type VirtualModelSession } from '@/lib/virtual-models';
import { DISCOVERY_PROMPT, DISCOVERY_RESPONSE, withPreparedResponse } from '@/lib/discovery';
import { getRequestGuidance, visibleRequestIdentity, formatRequestHour } from '@/lib/request-guidance';
import { getReplayDuration, getReplayFrame, getReplayEvents } from '@/lib/replay';
import { getActionGuidance, restoreJourneyOrigin, type GuidanceAction, type ActionGuidance, type JourneyOrigin } from '@/lib/action-guidance';
import { MODELS, PROVIDER_NAMES, DEFAULT_CONFIG, createRehearsalFixture, rehearseRequest, simulateRequest, createSeedRequests, getMetrics, formatCost, routingCode, validateConfig, cancelRequest, eligibleProviders, type RoutingConfig, type RequestRecord, type Scenario, type ProviderId, type RehearsalFixture } from '@/lib/gateway';
import { type Integration, type AuthMode, type SetupIntent, type SetupEnvironment } from '@/lib/setup';

export type View = 'overview' | 'dashboard' | 'connect' | 'playground' | 'routes' | 'monitor' | 'budgets' | 'keys' | 'byok' | 'virtual-models' | 'settings' | 'models' | 'leaderboards' | 'documentation';
type Phase = 'idle' | 'routing' | 'streaming' | 'complete' | 'failed';
const VIEW_NAMES: Record<View, string> = { overview: 'AI Gateway', dashboard: 'Overview', connect: 'Quick Start', playground: 'Playground', routes: 'Virtual Model routing', monitor: 'Logs', budgets: 'Budgets & Spend', keys: 'API Keys', byok: 'Bring Your Own Key', 'virtual-models': 'Virtual Models', settings: 'Settings', models: 'Models', leaderboards: 'Leaderboards', documentation: 'Documentation' };
const SCENARIOS: { id: Scenario; name: string; description: string }[] = [
  { id: 'healthy', name: 'Successful request', description: 'The preferred provider responds.' },
  { id: 'provider-failure', name: 'Provider recovery', description: 'The first eligible provider fails before output.' },
  { id: 'model-fallback', name: 'Model fallback', description: 'All eligible providers for the primary model fail.' },
  { id: 'restricted', name: 'Restricted route', description: 'Only the first preferred provider is allowed, and it fails.' },
  { id: 'budget', name: 'Budget exceeded', description: 'A soft cap stops this new request with a 402.' },
  { id: 'rate-limit', name: 'Upstream rate limit', description: 'Providers return a rate limit before output.' },
  { id: 'invalid-key', name: 'Invalid Gateway key', description: 'An explicit key overrides OIDC, even when the key is invalid.' },
  { id: 'expired-oidc', name: 'Expired local OIDC', description: 'The local token needs to be refreshed after 12 hours.' },
  { id: 'model-unavailable', name: 'Model unavailable', description: 'The requested model is not available to this team.' },
];
const PROMPT = DISCOVERY_PROMPT;
const STORAGE_KEY = 'sean-gateway-demo-v2';
const REVIEW_STORAGE_KEY = 'sean-gateway-review-v1';
const REVIEW_FLOW_KEY = 'gateway-review-sentence-flow-v1';
const pathFor = (view: View) => view === 'overview' ? '/' : `/${view}`;
const modelName = (id: string) => MODELS.find(model => model.id === id)?.name ?? id;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const knownModelName = (record: RequestRecord) => modelName(record.servedModel || record.model);
const withModel = (config: RoutingConfig, model: string): RoutingConfig => ({ ...config, model, fallbacks: config.fallbacks.filter(id => id !== model) });
const configSignature = (config: RoutingConfig) => JSON.stringify({ ...config, revision: 0 });
const sameConfig = (a: RoutingConfig, b: RoutingConfig) => configSignature(a) === configSignature(b);
const displayTime = (timestamp: number) => new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(timestamp);

function Logo({ small = false }: { small?: boolean }) {
  return <span className={`brand-mark ${small ? 'small' : ''}`} aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 23 22H1Z" fill="currentColor" /></svg></span>;
}

function CopyButton({ text, label = 'Copy', className = '' }: { text: string; label?: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timeout.current) clearTimeout(timeout.current); }, []);
  async function copy() {
    if (timeout.current) clearTimeout(timeout.current);
    try { await navigator.clipboard.writeText(text); setState('copied'); }
    catch { setState('failed'); }
    timeout.current = setTimeout(() => setState('idle'), 2400);
  }
  return <button className={`copy-button ${className}`} onClick={copy} aria-label={state === 'copied' ? `${label}: copied` : state === 'failed' ? `${label}: manual copy required` : label} title={state === 'failed' ? 'Select the code and copy it manually.' : label}>
    {state === 'copied' ? <Check size={14} /> : <Copy size={14} />}<span role="status">{state === 'copied' ? 'Copied' : state === 'failed' ? 'Select to copy' : label}</span>
  </button>;
}

function CodeBlock({ code, label = 'TypeScript', changed = false, compareWith }: { code: string; label?: string; changed?: boolean; compareWith?: string }) {
  const previousLines = compareWith?.split('\n');
  return <div className={`code-block ${changed ? 'code-changed' : ''}`}><div className="code-heading"><span><Code2 size={14} />{label}</span><CopyButton text={code} /></div><pre tabIndex={0}><code>{code.split('\n').map((line, i) => <span className={`code-line${previousLines !== undefined && line !== previousLines[i] ? ' is-modified' : ''}`} data-code-change={previousLines !== undefined && line !== previousLines[i] || undefined} key={`${i}-${line}`}><span className="line-number" aria-hidden="true">{i + 1}</span><span>{line}</span></span>)}</code></pre></div>;
}

function ModelSelect({ value, onChange, label = 'Model', exclude = [] }: { value: string; onChange: (value: string) => void; label?: string; exclude?: string[] }) {
  return <label className="model-select"><span className="field-label">{label}</span><span className="select-wrap"><select value={value} onChange={event => onChange(event.target.value)}>{MODELS.map(model => <option key={model.id} value={model.id} disabled={exclude.includes(model.id)}>{model.name}</option>)}</select><ChevronDown size={14} /></span></label>;
}

function StatusBadge({ status }: { status: RequestRecord['status'] }) {
  const text = { success: 'Success', recovered: 'Recovered', failed: 'Failed', cancelled: 'Cancelled' }[status];
  return <span className={`status-badge ${status}`}><i />{text}</span>;
}

function Overlay({ children, title, onClose }: { children: ReactNode; title: string; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    function visible(element: HTMLElement) {
      if (element.matches(':disabled') || element.closest('[hidden]') || !element.getClientRects().length || getComputedStyle(element).visibility === 'hidden') return false;
      for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
        if (ancestor instanceof HTMLDetailsElement && !ancestor.open && !ancestor.querySelector(':scope > summary')?.contains(element)) return false;
      }
      return true;
    }
    const focusable = () => Array.from(panel.current?.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, summary, [tabindex="0"]') ?? []).filter(visible);
    focusable()[0]?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key === 'Tab') {
        const items = focusable(); const first = items[0]; const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    document.addEventListener('keydown', onKey); const oldOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = oldOverflow; if (previous?.isConnected) previous.focus(); else document.querySelector<HTMLElement>('#main h1')?.focus(); };
  }, []);
  return <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div ref={panel} className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="overlay-heading"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={18} /></button></div>{children}</div></div>;
}

export default function GatewayApp({ initialView, reviewerEntry = false }: { initialView: View; reviewerEntry?: boolean }) {
  const [reviewMode, setReviewMode] = useState(reviewerEntry);
  const [reviewPage, setReviewPage] = useState(reviewerEntry);
  const [reviewProgress, setReviewProgress] = useState<ReviewerProgress>(initialReviewerProgress);
  const reviewChapterRef = useRef<ReviewerChapterId>('understand'); reviewChapterRef.current = reviewProgress.chapter;
  const [reviewThinking, setReviewThinking] = useState(false);
  const [reviewPreparedChapter, setReviewPreparedChapter] = useState<ReviewerChapterId | null>(null);
  const [reviewResumePath, setReviewResumePath] = useState('/?review=understand');
  const [reviewLocationVersion, setReviewLocationVersion] = useState(0);
  const onReviewerLocationChange = useCallback(() => setReviewLocationVersion(previous => previous + 1), []);
  const [reviewExit, setReviewExit] = useState<string | null>(null);
  const markReviewer = useCallback((event: ReviewerEvent) => setReviewProgress(previous => recordReviewerEvent(previous, event)), []);
  const reviewUrl = (path: string) => reviewMode ? reviewerHref(path, reviewChapterRef.current) : path;

  const [tour, setTour] = useState(false);
  const [view, setView] = useState<View>(initialView);
  const viewRef = useRef(view); viewRef.current = view;
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [active, setActive] = useState<RoutingConfig>(() => clone(DEFAULT_CONFIG));
  const [draft, setDraft] = useState<RoutingConfig>(() => clone(DEFAULT_CONFIG));
  const [revisions, setRevisions] = useState<RoutingConfig[]>(() => [clone(DEFAULT_CONFIG)]);
  const [pending, setPending] = useState<RoutingConfig | null>(null);
  const [requests, setRequests] = useState<RequestRecord[]>(createSeedRequests);
  const [loaded, setLoaded] = useState(false);
  const [integration, setIntegration] = useState<Integration>('sdk');
  const [auth, setAuth] = useState<AuthMode>('oidc');
  const [setupIntent, setSetupIntent] = useState<SetupIntent>('new');
  const [setupEnvironment, setSetupEnvironment] = useState<SetupEnvironment>('local');
  const [setupFlowVersion, setSetupFlowVersion] = useState(0);
  const [setupPrimary, setSetupPrimary] = useState<SetupPrimaryAction | null>(null);
  const publishSetupPrimary = useCallback((action: SetupPrimaryAction | null) => setSetupPrimary(action), []);
  const [handoffConfig, setHandoffConfig] = useState<RoutingConfig | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceState>(defaultWorkspace);
  const [virtualModels, setVirtualModels] = useState<RoutingConfig[]>(() => [clone(DEFAULT_CONFIG)]);
  const [routeSessions, setRouteSessions] = useState<Record<string, VirtualModelSession>>({});
  const routeSessionsRef = useRef(routeSessions); routeSessionsRef.current = routeSessions;
  const [editingVirtualModelSlug, setEditingVirtualModelSlug] = useState<string | null>(null);
  const [handoffAlias, setHandoffAlias] = useState<string | null>(null);
  const [playgroundAlias, setPlaygroundAlias] = useState<string | null>(null);
  const [playgroundConfig, setPlaygroundConfig] = useState<RoutingConfig | null>(null);
  const createdAlias = useRef<string | null>(null);
  const virtualModelsRef = useRef(virtualModels);
  virtualModelsRef.current = virtualModels;
  const [journeyOrigin, setJourneyOrigin] = useState<JourneyOrigin | null>(null);
  const [setupIssue, setSetupIssue] = useState<{ title: string; description: string } | null>(null);
  const [model, setModel] = useState(DEFAULT_CONFIG.model);
  const [prompt, setPrompt] = useState(PROMPT);
  const [scenario, setScenario] = useState<Scenario>('healthy');
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<RequestRecord | null>(null);
  const [shownAttempts, setShownAttempts] = useState(0);
  const [activeAttemptIndex, setActiveAttemptIndex] = useState<number | null>(null);
  const [output, setOutput] = useState('');
  const [promptError, setPromptError] = useState('');
  const [inspectionOrigin, setInspectionOrigin] = useState<InspectionOrigin | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<RequestRecord | null>(null);
  const selectedRequestRef = useRef(selectedRequest); selectedRequestRef.current = selectedRequest;
  const inspectionReturn = useRef<{ element: HTMLElement | null; scroll: number; view: View } | null>(null);
  const inspectionWasOpen = useRef(false);
  const [modal, setModal] = useState<'save' | 'budget' | 'reset' | 'models' | 'about' | null>(null);
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [authFilter, setAuthFilter] = useState('all');
  const [hourFilter, setHourFilter] = useState<number | null>(null);
  const [urlReady, setUrlReady] = useState(false);
  const [sortDescending, setSortDescending] = useState(true);
  const [testedDraft, setTestedDraft] = useState<string | null>(null);
  const [draftResult, setDraftResult] = useState<RequestRecord | null>(null);
  const [baselineResult, setBaselineResult] = useState<RequestRecord | null>(null);
  const [rehearsal, setRehearsal] = useState<RehearsalContext | null>(null);
  const [comparisonFixture, setComparisonFixture] = useState<RehearsalFixture | null>(null);
  const [sourceRequest, setSourceRequest] = useState<RequestRecord | null>(null);
  const [comparing, setComparing] = useState(false);
  const [replayAt, setReplayAt] = useState<number | null>(null);
  const elapsedRun = useRef(0);
  const [liveElapsed, setLiveElapsed] = useState(0);
  const [routeSelection, setRouteSelection] = useState<string | null>(null);
  const [selectedRouteStop, setSelectedRouteStop] = useState<RouteSelection | null>(null);
  const [inspectorModel, setInspectorModel] = useState<string | null>(null);
  const [routeSeekVersion, setRouteSeekVersion] = useState(0);
  const [routeTab, setRouteTab] = useState<'route' | 'code' | 'comparison'>('route');
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [dismissedGuidance, setDismissedGuidance] = useState<string[]>([]);
  const [requestPage, setRequestPage] = useState(0);
  const [drawerTab, setDrawerTab] = useState<'evidence' | 'usage' | 'configuration'>('evidence');
  const [logPresentation, setLogPresentation] = useState<'field' | 'table'>('field');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const working = useRef<RequestRecord | null>(null);
  const runId = useRef(0);
  const cancelRef = useRef<() => void>(() => {});
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onReviewerBrief = useCallback(() => {
    if (reviewMode && !reviewPage && !selectedRequest && view === 'connect' && reviewProgress.chapter === 'adopt') markReviewer({ type:'demonstrated', chapter:'adopt' });
  }, [reviewMode, reviewPage, selectedRequest, view, reviewProgress.chapter, markReviewer]);
  useEffect(() => {
    const url = new URL(window.location.href);
    const reviewing = reviewerEntry || url.pathname === '/review' || url.searchParams.has('review');
    setReviewMode(reviewing); setReviewPage(url.pathname === '/review');
    const requested = reviewerChapter(url.searchParams.get('review'));
    if (reviewing && requested) { reviewChapterRef.current = requested.id; setReviewProgress(previous => ({ ...previous, chapter:requested.id })); }
    try {
      const saved = JSON.parse(localStorage.getItem(reviewing ? REVIEW_STORAGE_KEY : STORAGE_KEY) ?? 'null');
      if (reviewing && saved && typeof saved === 'object') {
        saved.requests = restoreReviewerReceipts(saved.requests);
        saved.pending = isStoredRoute(saved.pending) ? saved.pending : null;
        saved.draft = isStoredRoute(saved.draft) ? saved.draft : saved.active;
        saved.revisions = Array.isArray(saved.revisions) ? saved.revisions.filter(isStoredRoute) : [saved.active];
      }
      if (reviewing) {
        const progress = restoreReviewerProgress(saved?.reviewer?.progress) ?? initialReviewerProgress();
        const chapter = reviewerChapter(url.searchParams.get('review'))?.id ?? progress.chapter;
        reviewChapterRef.current = chapter;
        setReviewProgress({ ...progress, chapter });
        setReviewPreparedChapter(reviewerChapter(saved?.reviewer?.preparedChapter)?.id ?? null);
        if (typeof saved?.reviewer?.resumePath === 'string') { const candidate = reviewerHref(saved.reviewer.resumePath, chapter); const path = new URL(candidate, window.location.origin).pathname; if (path === '/' || path.slice(1) in VIEW_NAMES) setReviewResumePath(candidate); }
      }
      if (saved && saved.version === 2 && Array.isArray(saved.requests) && saved.active && validateConfig(saved.active).length === 0) {
        setActive(saved.active); setPending(saved.pending ?? null); setDraft(saved.draft && validateConfig(saved.draft).length === 0 ? saved.draft : saved.pending ?? saved.active); setRevisions(saved.revisions ?? [saved.active]); setRequests(saved.requests); setSourceRequest(saved.sourceId ? saved.requests.find((record: RequestRecord) => record.id === saved.sourceId) ?? null : null); setModel(saved.ui?.model ?? saved.active.model);
        setVirtualModels(restoreVirtualModels(saved.virtualModels, saved.active));
        const restoredSessions = restoreVirtualModelSessions(saved.routeSessions);
        setRouteSessions(restoredSessions);
        setRehearsal(restoredSessions[saved.draft?.slug ?? saved.active.slug]?.rehearsal ?? null);
        if (reviewing && saved.reviewer) {
          const resumedResult = saved.requests.find((record: RequestRecord) => record.id === saved.reviewer.resultId);
          if (resumedResult) { setResult(resumedResult); setOutput(resumedResult.response); setShownAttempts(resumedResult.attempts.length); setPhase(resumedResult.status === 'failed' ? 'failed' : 'complete'); }
          const comparison = saved.reviewer.comparison;
          const validFixture = restoreRehearsalContext({ base: comparison?.fixture, overrides: {} })?.base;
          const before = saved.requests.find((record: RequestRecord) => record.id === comparison?.baselineId);
          const after = saved.requests.find((record: RequestRecord) => record.id === comparison?.draftId);
          if (before && after && validFixture && before.fixtureId === validFixture.id && after.fixtureId === validFixture.id) {
            setBaselineResult(before); setDraftResult(after); setComparisonFixture(validFixture);
            const source = saved.requests.find((record: RequestRecord) => record.id === saved.sourceId) ?? null;
            const config = saved.draft ?? saved.active;
            const signature = workingComparisonSignature(config, validFixture, source, source?.configSnapshot ?? saved.active);
            setTestedDraft(signature === comparison.testedDraft ? signature : null);
            if (saved.reviewer.routeTab === 'comparison') setRouteTab('comparison');
          }
        }
        if (validateWorkspaceState(saved.workspace)) setWorkspace(saved.workspace);
        setEditingVirtualModelSlug(typeof saved.ui?.editingVirtualModelSlug === 'string' ? saved.ui.editingVirtualModelSlug : null);
        setHandoffAlias(isVirtualModelAlias(saved.ui?.handoffAlias) ? saved.ui.handoffAlias : null);
        setPlaygroundAlias(isVirtualModelAlias(saved.ui?.playgroundAlias) ? saved.ui.playgroundAlias : null);
        if (saved.ui?.playgroundConfig && validateConfig(saved.ui.playgroundConfig).length === 0) setPlaygroundConfig(saved.ui.playgroundConfig);
        if (saved.ui) { setIntegration(saved.ui.integration ?? 'sdk'); setAuth(saved.ui.auth ?? 'oidc'); setSetupIntent(['new', 'existing', 'agent'].includes(saved.ui.setupIntent) ? saved.ui.setupIntent : saved.ui.integration === 'agent' ? 'agent' : 'new'); setSetupEnvironment(['vercel', 'local', 'elsewhere'].includes(saved.ui.setupEnvironment) ? saved.ui.setupEnvironment : saved.ui.auth === 'api-key' ? 'elsewhere' : 'local'); if (saved.ui.handoffConfig && validateConfig(saved.ui.handoffConfig).length === 0) setHandoffConfig(saved.ui.handoffConfig); if (typeof saved.ui.prompt === 'string') setPrompt(saved.ui.prompt); }
      }
      const savedTheme = localStorage.getItem('gateway-theme'); if (savedTheme === 'dark') setTheme('dark');
    } catch { /* A corrupt or unavailable store starts a fresh demonstration. */ }
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) { try { localStorage.setItem(reviewMode ? REVIEW_STORAGE_KEY : STORAGE_KEY, JSON.stringify({ reviewer: reviewMode ? { progress: reviewProgress, preparedChapter: reviewPreparedChapter, resumePath: reviewResumePath, resultId: result?.id ?? null, routeTab, comparison: baselineResult && draftResult && comparisonFixture ? { baselineId: baselineResult.id, draftId: draftResult.id, fixture: comparisonFixture, testedDraft } : null } : undefined, version: 2, active, pending, draft, revisions, requests, virtualModels, routeSessions, workspace, sourceId: sourceRequest?.id ?? null, ui: { model, integration, auth, prompt, setupIntent, setupEnvironment, handoffConfig, editingVirtualModelSlug, handoffAlias, playgroundAlias, playgroundConfig } })); } catch { /* The demo also works without storage. */ } } }, [loaded, reviewMode, reviewProgress, reviewPreparedChapter, reviewResumePath, result, routeTab, baselineResult, draftResult, comparisonFixture, testedDraft, active, pending, draft, revisions, requests, model, integration, auth, prompt, setupIntent, setupEnvironment, sourceRequest, handoffConfig, virtualModels, routeSessions, workspace, editingVirtualModelSlug, handoffAlias, playgroundAlias, playgroundConfig]);
  useEffect(() => {
    if (loaded && view === 'routes') setRouteSessions(previous => ({ ...previous, [draft.slug]: { draft: clone(draft), pending: pending ? clone(pending) : null, sourceId: sourceRequest?.id ?? null, ...(rehearsal ? { rehearsal } : {}) } }));
  }, [loaded, view, draft, pending, sourceRequest, rehearsal]);
  useEffect(() => { if (!loaded) return; document.documentElement.dataset.theme = theme; try { localStorage.setItem('gateway-theme', theme); } catch { /* Optional preference. */ } }, [theme, loaded]);
  useEffect(() => {
    if (!loaded) return;
    function readFilters() {
      if (window.location.pathname !== '/monitor') return;
      const params = new URLSearchParams(window.location.search);
      setFilter(params.get('q') ?? '');
      setStatusFilter(['success','recovered','failed','cancelled'].includes(params.get('status') ?? '') ? params.get('status')! : 'all');
      setAuthFilter(['oidc','api-key'].includes(params.get('identity') ?? '') ? params.get('identity')! : 'all');
      const hour = Number(params.get('hour')); setHourFilter(params.has('hour') && Number.isFinite(hour) && hour > 0 ? hour : null);
      setSortDescending(params.get('order') !== 'asc');
    }
    function readLocation() {
      if (working.current) cancelRef.current();
      const part = window.location.pathname.slice(1) as View;
      const params = new URLSearchParams(window.location.search);
      // Inspection is a nested view of the same workspace, not a reset of its
      // ephemeral comparison, chosen model or expanded configuration.
      const sameWorkspaceInspection = part === viewRef.current && Boolean(selectedRequestRef.current || params.has('request'));
      setReviewPage(window.location.pathname === '/review');
      const chapter = reviewerChapter(params.get('review'));
      if (chapter) { reviewChapterRef.current = chapter.id; markReviewer({ type:'visited', chapter:chapter.id }); setReviewThinking(false); }
      setView(part in VIEW_NAMES ? part : 'overview');
      if (!sameWorkspaceInspection) setRouteTab(params.get('tab') === 'code' ? 'code' : reviewMode && params.get('tab') === 'comparison' && baselineResult ? 'comparison' : 'route');
      setTour(params.get('tour') === '1'); readFilters();
      const config = virtualModelsRef.current.find(item => item.slug === params.get('vmc'));
      if (part === 'routes' && config && !sameWorkspaceInspection && (!reviewMode || config.slug !== editingVirtualModelSlug)) loadVirtualModel(config);
      setJourneyOrigin(restoreJourneyOrigin(window.history.state?.journeyOrigin, requests));
      const requestId = new URLSearchParams(window.location.search).get('request');
      setSelectedRequest(requestId ? requests.find(request => request.id === requestId) ?? null : null);
    }
    const requestId = new URLSearchParams(window.location.search).get('request');
    setJourneyOrigin(restoreJourneyOrigin(window.history.state?.journeyOrigin, requests));
    setTour(new URLSearchParams(window.location.search).get('tour') === '1'); if (!urlReady && !reviewMode) setRouteTab(new URLSearchParams(window.location.search).get('tab') === 'code' ? 'code' : 'route'); readFilters(); setUrlReady(true);
    if (requestId) { const found = requests.find(request => request.id === requestId); setSelectedRequest(found ?? null); if (!found) setNotice('That demo request is not stored in this browser. You can explore the sample history.'); }
    window.addEventListener('popstate', readLocation); return () => window.removeEventListener('popstate', readLocation);
  }, [requests, loaded]);
  useEffect(() => {
    if (!loaded) return;
    const config = virtualModelsRef.current.find(item => item.slug === new URLSearchParams(window.location.search).get('vmc'));
    if (window.location.pathname === '/routes' && config && editingVirtualModelSlug !== config.slug) loadVirtualModel(config);
  // Initial URL hydration only. Later location changes are handled by popstate.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);
  useEffect(() => {
    if (!urlReady || view !== 'monitor' || reviewMode && reviewPage) return;
    const params = new URLSearchParams(); if (reviewMode) params.set('review', reviewProgress.chapter); if (tour) params.set('tour', '1');
    if (filter) params.set('q', filter); if (statusFilter !== 'all') params.set('status', statusFilter);
    if (authFilter !== 'all') params.set('identity', authFilter); if (hourFilter !== null) params.set('hour', String(hourFilter));
    if (!sortDescending) params.set('order', 'asc'); if (selectedRequest) params.set('request', selectedRequest.id);
    window.history.replaceState(window.history.state, '', `/monitor${params.size ? '?' + params.toString() : ''}`);
  }, [view, filter, statusFilter, authFilter, hourFilter, sortDescending, selectedRequest, urlReady, tour, reviewMode, reviewPage, reviewProgress.chapter]);
  useEffect(() => {
    if (!urlReady || view === 'monitor' || reviewMode && reviewPage) return;
    const url = new URL(window.location.href); if (tour) url.searchParams.set('tour', '1'); else url.searchParams.delete('tour');
    window.history.replaceState(window.history.state, '', url.pathname + url.search);
  }, [tour, view, urlReady, reviewMode, reviewPage]);
  useEffect(() => {
    if (!urlReady || view !== 'routes' || reviewMode && reviewPage) return;
    const url = new URL(window.location.href); if (routeTab === 'code' || reviewMode && routeTab === 'comparison') url.searchParams.set('tab', routeTab); else url.searchParams.delete('tab');
    window.history.replaceState(window.history.state, '', url.pathname + url.search);
  }, [routeTab, view, urlReady, reviewMode, reviewPage]);
  useEffect(() => { document.title = reviewMode ? reviewPage ? 'Behind the design · AI Gateway · Sean Lynch' : `${reviewerChapter(reviewProgress.chapter)!.title} · Behind the design · AI Gateway` : `${VIEW_NAMES[view]} · AI Gateway`; }, [view, reviewMode, reviewPage, reviewProgress.chapter]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  useEffect(() => { setRequestPage(0); }, [filter, statusFilter, authFilter, hourFilter, sortDescending]);

  const busy = phase === 'routing' || phase === 'streaming';
  const dirty = !sameConfig(pending ?? active, draft);
  const errors = validateConfig(draft);
  const rehearsalBase = useMemo(() => rehearsal?.base ?? createRehearsalFixture(sourceRequest, prompt), [rehearsal, sourceRequest, prompt]);
  const effectiveFixture = useMemo(() => withRehearsalConditions(rehearsalBase, rehearsal?.overrides ?? {}), [rehearsalBase, rehearsal]);
  const draftTestCurrent = Boolean(comparisonFixture && testedDraft === workingComparisonSignature(draft, effectiveFixture, sourceRequest, sourceRequest?.configSnapshot ?? active));
  const effectiveAuth = integration === 'agent' ? 'api-key' : auth;
  const playgroundRoute = withModel(playgroundConfig ?? (playgroundAlias ? virtualModels.find(config => `vmc/${config.slug}` === playgroundAlias) : undefined) ?? active, model);

  useLayoutEffect(() => {
    if (selectedRequest) { inspectionWasOpen.current = true; return; }
    if (!inspectionWasOpen.current) return;
    inspectionWasOpen.current = false;
    const origin = inspectionReturn.current;
    if (origin?.view === view) {
      if (origin.element?.isConnected) origin.element.focus({ preventScroll: true });
      else document.querySelector<HTMLElement>('#main h1')?.focus({ preventScroll: true });
      window.scrollTo({ top: origin.scroll, behavior: 'instant' });
    } else {
      document.querySelector<HTMLElement>('#main h1')?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [selectedRequest, view]);

  function toast(message: string) { setNotice(message); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setNotice(''), 4400); }
  function clearRun() { timers.current.forEach(clearTimeout); timers.current = []; runId.current += 1; }
  function finishRecord(record: RequestRecord) { if (reviewMode && reviewChapterRef.current === 'understand' && view === 'overview' && record.status === 'success') markReviewer({ type:'demonstrated', chapter:'understand' }); setRequests(prev => [record, ...prev].slice(0, 200)); setResult(record); }
  function cancelRun() {
    clearRun();
    const record = working.current;
    if (record) {
      const observed = getReplayFrame(record, elapsedRun.current);
      const cancelled = cancelRequest(record, observed.attemptCount, observed.output, elapsedRun.current);
      setShownAttempts(observed.attemptCount); setActiveAttemptIndex(null); setOutput(observed.output);
      finishRecord(cancelled); setPhase('complete'); toast('Demo request cancelled. Partial output is preserved.');
    } else setPhase('idle');
    working.current = null;
  }
  cancelRef.current = cancelRun;
  function resetRunDisplay() { if (busy) cancelRun(); setPhase('idle'); setActiveAttemptIndex(null); setOutput(''); setResult(null); setShownAttempts(0); setRouteSelection(null); setSelectedRouteStop(null); setReplayAt(null); }
  function navigate(next: View, event?: MouseEvent<HTMLAnchorElement>) {
    if (event && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
    event?.preventDefault(); if (busy) cancelRun(); if (comparing) { clearRun(); setComparing(false); }
    setJourneyOrigin(null); inspectionReturn.current = null; setSelectedRequest(null); setModal(null); setView(next); setReviewPage(false); window.history.pushState({}, '', reviewUrl(`${pathFor(next)}${tour ? '?tour=1' : ''}`));
    if (selectedRequest || !['playground','routes','connect','monitor'].includes(view) || !['playground','routes','connect','monitor'].includes(next)) window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function openRequest(record: RequestRecord, origin?: InspectionOrigin) {
    if (!selectedRequest) inspectionReturn.current = { element: document.activeElement instanceof HTMLElement ? document.activeElement : null, scroll: window.scrollY, view };
    if (reviewMode && reviewChapterRef.current === 'trust' && record.status === 'recovered') markReviewer({ type:'demonstrated', chapter:'trust' });
    if (reviewMode && reviewChapterRef.current === 'operate' && (view === 'dashboard' || view === 'monitor')) markReviewer({ type:'demonstrated', chapter:'operate' });
    setInspectionOrigin(origin?.requestId === record.id ? origin : null);
    setSelectedRequest(record); setInspectedId(record.id); setDrawerTab('evidence');
    const url = new URL(window.location.href); url.searchParams.set('request', record.id);
    window.history.pushState({ ...window.history.state, gatewayRequest: true }, '', url.pathname + url.search);
  }
  function viewInMonitoring(record: RequestRecord) {
    setLogPresentation('table'); navigate('monitor');
    setFilter(record.id); setStatusFilter('all'); setAuthFilter('all'); setHourFilter(null); setInspectedId(record.id);
    window.history.replaceState({}, '', reviewUrl(`/monitor?${tour ? 'tour=1&' : ''}q=${encodeURIComponent(record.id)}`));
  }
  function closeRequest() {
    setInspectionOrigin(null);
    if (window.history.state?.gatewayRequest && inspectionReturn.current?.view === view) { window.history.back(); return; }
    setSelectedRequest(null);
    const url = new URL(window.location.href); url.searchParams.delete('request');
    window.history.replaceState({}, '', url.pathname + url.search);
  }
  function later(fn: () => void, delay: number, token: number) { timers.current.push(setTimeout(() => { if (runId.current === token) fn(); }, delay)); }
  function runRequest(config = playgroundRoute, fromDraft = false, scenarioOverride: Scenario = scenario, requestPrompt = prompt, preparedResponse?: string, requestAlias?: string) {
    if (!requestPrompt.trim()) { setPromptError('Add a prompt to run a request.'); return; }
    clearRun(); setPromptError(''); setOutput(''); setShownAttempts(0); setPhase('routing'); setActiveAttemptIndex(null); setRouteSelection(null); setSelectedRouteStop(null); setReplayAt(null); elapsedRun.current = 0; setLiveElapsed(0);
    const simulated = simulateRequest(config, scenarioOverride, requestPrompt, `demo_${Date.now().toString(36)}_${runId.current.toString(36)}`, Date.now());
    const response = preparedResponse ?? (requestPrompt === DISCOVERY_PROMPT ? DISCOVERY_RESPONSE : undefined);
    const record = response === undefined ? simulated : withPreparedResponse(simulated, response);
    record.auth = scenarioOverride === 'invalid-key' ? 'api-key' : scenarioOverride === 'expired-oidc' ? 'oidc' : view === 'connect' ? effectiveAuth : auth;
    if (requestAlias) record.virtualModel = requestAlias;
    else if (view === 'playground' && playgroundAlias && model === config.model && sameConfig(config, playgroundRoute)) record.virtualModel = playgroundAlias;
    working.current = record; setResult(record); const token = runId.current;
    const duration = getReplayDuration(record);
    const speed = Math.max(1, duration / 7000);
    const started = Date.now();
    function frame() {
      const elapsed = Math.min(duration, Math.max(elapsedRun.current, (Date.now() - started) * speed));
      elapsedRun.current = elapsed; setLiveElapsed(elapsed);
      const state = getReplayFrame(record, elapsed);
      setShownAttempts(state.attemptCount); setActiveAttemptIndex(state.activeAttempt); setOutput(state.output); setPhase(state.phase);
      if (elapsed >= duration) {
        working.current = null;
        if (fromDraft) { setDraftResult(record); setTestedDraft(configSignature(config)); }
        else finishRecord(record);
      } else later(frame, 40, token);
    }
    later(frame, Math.min(40, duration), token);
  }
  function compareRoutes() {
    if (errors.length || comparing) return;
    if (!(sourceRequest?.prompt ?? prompt).trim()) { setPromptError('Add a workload prompt before comparing routes.'); return; }
    setPromptError('');
    resetRunDisplay(); setComparing(true);
    const config = clone(draft);
    const baseline = clone(sourceRequest?.configSnapshot ?? active);
    const fixture = clone(effectiveFixture);
    const stamp = Date.now(); const suffix = (++runId.current).toString(36);
    const before = rehearseRequest(baseline, fixture, `demo_baseline_${stamp.toString(36)}_${suffix}`, stamp);
    const after = rehearseRequest(config, fixture, `demo_draft_${stamp.toString(36)}_${suffix}`, stamp + 1);
    later(() => {
      setComparisonFixture(fixture);
      setBaselineResult(before); setDraftResult(after); setTestedDraft(workingComparisonSignature(config, fixture, sourceRequest, baseline)); setComparing(false);
      setRouteTab('comparison');
      if (reviewMode && reviewChapterRef.current === 'control') markReviewer({ type:'demonstrated', chapter:'control' });
      setRequests(previous => [after, before, ...previous].slice(0, 200));
    }, 420, runId.current);
  }
  function changeProviderCondition(provider: ProviderId, available: boolean) {
    if (comparing) return;
    const overrides = { ...(rehearsal?.overrides ?? {}) };
    if (available === rehearsalBase.providers[provider].available) delete overrides[provider];
    else overrides[provider] = available;
    setRehearsal({ base: clone(rehearsalBase), overrides });
    setTestedDraft(null);
  }
  function restoreConditions() {
    if (comparing) return;
    setRehearsal({ base: clone(rehearsalBase), overrides: {} }); setTestedDraft(null);
  }
  function changeDraft(change: Partial<RoutingConfig>) { resetRunDisplay(); setDraft(previous => ({ ...previous, ...change })); setTestedDraft(null); if (routeTab === 'comparison') setRouteTab('route'); }
  function saveDraft() {
    if (errors.length) return;
    if (!draftTestCurrent || !draftResult || draftResult.status === 'failed' || draftResult.status === 'cancelled') { toast('Resolve the draft outcome and test it again before saving.'); return; }
    const saved = { ...clone(draft), revision: Math.max(0, ...revisions.filter(revision => revision.slug === draft.slug).map(revision => revision.revision)) + 1 };
    setRevisions(prev => [...prev, saved]); setPending(saved); setDraft(saved); setModal(null); toast(`Revision ${saved.revision} saved. Activate it when you are ready to test.`);
  }
  function activateDraft() { if (pending) { setPlaygroundConfig(null); setPlaygroundAlias(null); setActive(pending); setModel(pending.model); setVirtualModels(previous => [...previous.filter(config => config.slug !== pending.slug), clone(pending)]); setEditingVirtualModelSlug(pending.slug); setPending(null); toast('Demo activation complete. New requests use the saved revision.'); } }

  function loadVirtualModel(config: RoutingConfig) {
    const session = routeSessionsRef.current[config.slug];
    setRehearsal(session?.rehearsal ?? null);
    resetRunDisplay(); setActive(clone(config)); setPlaygroundConfig(null); setPlaygroundAlias(null); setDraft(clone(session?.draft ?? config)); setPending(session?.pending ? clone(session.pending) : null); setModel(config.model); setEditingVirtualModelSlug(config.slug);
    setRevisions(previous => previous.some(item => item.slug === config.slug && item.revision === config.revision) ? previous : [...previous, clone(config)]);
    setSourceRequest(session?.sourceId ? requests.find(record => record.id === session.sourceId) ?? null : null); setBaselineResult(null); setDraftResult(null); setComparisonFixture(null); setTestedDraft(null); setRouteTab('route');
  }
  function openVirtualModel(config: RoutingConfig) {
    loadVirtualModel(config); navigate('routes'); window.history.replaceState({}, '', reviewUrl(`/routes?vmc=${encodeURIComponent(config.slug)}${tour ? '&tour=1' : ''}`));
  }
  function addVirtualModel(slug: string, selectedModel: string): string | null {
    const created = createVirtualModel(slug, selectedModel, virtualModels);
    if (!created.config) return created.error;
    setVirtualModels(previous => [...previous, created.config!]); if (view === 'models') createdAlias.current = created.config.slug; toast(`vmc/${created.config.slug} created in this demo. Open it to shape and test its route.`); return null;
  }
  function useVirtualModel(config: RoutingConfig, destination: 'connect' | 'playground') {
    resetRunDisplay(); setPlaygroundConfig(null); setPlaygroundAlias(null); setModel(config.model);
    if (destination === 'connect') {
      setHandoffConfig(clone(config)); setHandoffAlias(`vmc/${config.slug}`); setSetupIssue(null);
      if (setupIntent === 'agent') { setSetupIntent('existing'); setIntegration('sdk'); }
    }
    else { setPlaygroundConfig(clone(config)); setPlaygroundAlias(`vmc/${config.slug}`); setScenario('healthy'); }
    navigate(destination);
  }
  function selectCatalogModel(id: string, destination: 'connect' | 'playground' | 'routes', client?: Integration) {
    resetRunDisplay(); setModel(id); setPlaygroundAlias(null); setPlaygroundConfig(null); setHandoffAlias(null);
    const config = concreteModelConfig(id, active);
    if (destination === 'connect') { setHandoffConfig(config); setSetupIssue(null); if (client) { setIntegration(client); if (setupIntent === 'agent') setSetupIntent('existing'); } }
    if (destination === 'routes') { setDraft(config); setPending(null); setEditingVirtualModelSlug(null); setSourceRequest(null); setRehearsal(null); setBaselineResult(null); setDraftResult(null); setTestedDraft(null); }
    navigate(destination);
  }
  function filterLogs(query: string, identity?: 'oidc' | 'api-key') {
    setLogPresentation('table'); navigate('monitor'); setFilter(query); setAuthFilter(identity ?? 'all'); setStatusFilter('all'); setHourFilter(null);
  }
  function resetDemo() { setJourneyOrigin(null); try { sessionStorage.removeItem(reviewMode ? REVIEW_FLOW_KEY : 'gateway-sentence-flow-v1'); } catch { /* Optional UI position. */ } setSetupFlowVersion(previous => previous + 1); clearRun(); working.current = null; setActive(clone(DEFAULT_CONFIG)); setDraft(clone(DEFAULT_CONFIG)); setRevisions([clone(DEFAULT_CONFIG)]); setPending(null); setRequests(createSeedRequests()); setResult(null); setOutput(''); setPhase('idle'); setShownAttempts(0); setScenario('healthy'); setModel(DEFAULT_CONFIG.model); setPrompt(PROMPT); setPromptError(''); setAuth('oidc'); setIntegration('sdk'); setSetupIntent('new'); setSetupEnvironment('local'); setSetupIssue(null); setHandoffConfig(null); setHandoffAlias(null); setPlaygroundAlias(null); setPlaygroundConfig(null); setEditingVirtualModelSlug(null); setVirtualModels([clone(DEFAULT_CONFIG)]); setRouteSessions({}); setWorkspace(defaultWorkspace()); setRouteSelection(null); setSortDescending(true); setSelectedRequest(null); setSourceRequest(null); setRehearsal(null); setBaselineResult(null); setComparisonFixture(null); setComparing(false); setReplayAt(null); setDraftResult(null); setTestedDraft(null); setFilter(''); setHourFilter(null); setAuthFilter('all'); setStatusFilter('all'); setModal(null); setInspectedId(null); setSelectedRouteStop(null); setRouteTab('route'); setRequestPage(0); setDismissedGuidance([]); window.history.replaceState({}, '', reviewUrl(`${pathFor(view)}${tour ? '?tour=1' : ''}`)); toast('Demo reset. The original sample requests are ready.'); }
  function testAdjustment(record: RequestRecord) {
    const config = record.configSnapshot;
    if (!config) { toast('This request has no recorded configuration snapshot.'); return; }
    const captured = captureWorkingSource(record, prompt, config);
    resetRunDisplay(); setPlaygroundConfig(null); setPlaygroundAlias(null); setDraft(clone(captured.config)); setEditingVirtualModelSlug(virtualModels.some(item => item.slug === config.slug) ? config.slug : null); setSourceRequest(captured.record); setRehearsal({ base: clone(captured.fixture), overrides: {} }); setPrompt(captured.prompt); setAuth(record.auth); setModel(config.model); setScenario('provider-failure');
    setBaselineResult(null); setDraftResult(null); setComparisonFixture(null); setTestedDraft(null);
    setRouteTab('route'); setSelectedRouteStop(null);
    navigate('routes');
  }


  const replayFrame = result && replayAt !== null ? getReplayFrame(result, replayAt) : null;
  const displayPhase = replayFrame?.phase ?? phase;
  const visibleAttempts = replayFrame?.attemptCount ?? shownAttempts;
  const displayOutput = replayFrame?.output ?? output;
  const showingEvidence = view !== 'routes' && phase !== 'idle';
  const flowConfig = view === 'routes' ? draft : showingEvidence && result?.configSnapshot ? result.configSnapshot : playgroundRoute;
  const flowGroups = [flowConfig.model, ...flowConfig.fallbacks].map((id, modelIndex) => {
    const available = MODELS.find(item => item.id === id)?.providers ?? [];
    const eligible = eligibleProviders(flowConfig, id);
    const providers = [...eligible, ...available.filter(provider => !eligible.includes(provider))].map(provider => {
      const finished = showingEvidence && displayPhase !== 'idle' ? result?.attempts.slice(0, visibleAttempts).filter(attempt => attempt.provider === provider && attempt.model === id).at(-1) : undefined;
      const nextIndex = replayFrame ? replayFrame.activeAttempt : activeAttemptIndex;
      const next = showingEvidence && displayPhase === 'routing' && nextIndex !== null ? result?.attempts[nextIndex] : undefined;
      const excluded = flowConfig.only.length > 0 && !flowConfig.only.includes(provider);
      return { id: provider, name: PROVIDER_NAMES[provider], status: excluded ? 'excluded' as const : next?.provider === provider && next.model === id ? 'active' as const : finished?.status ?? 'idle' as const };
    });
    return { modelId:id, modelName:modelName(id), role:modelIndex === 0 ? 'primary' as const : 'fallback' as const, providers };
  });
  const flowProviders = flowGroups[0]?.providers ?? [];
  const flowPhase = view === 'routes' ? 'idle' : displayPhase === 'complete' && result?.status === 'cancelled' ? 'cancelled' : displayPhase === 'streaming' ? 'responding' : displayPhase === 'routing' ? 'routing' : displayPhase === 'failed' ? 'failed' : displayPhase === 'complete' ? 'complete' : 'idle';

  function startTour() { setModal(null); setDismissedGuidance([]); setTour(true); navigate('overview'); window.history.replaceState({}, '', '/?tour=1'); }
  function endTour() { setTour(false); document.querySelector<HTMLElement>('#main h1')?.focus(); }
  function followAction(action: GuidanceAction, guidance?: ActionGuidance) {
    if (action === 'run') {
      if (view === 'overview') runDiscovery('healthy');
      else { navigate('playground'); setScenario('healthy'); runRequest(playgroundRoute, false, 'healthy', prompt.trim() ? prompt : PROMPT); }
    } else if (action === 'edit-route') { setRouteTab('route'); setSelectedRouteStop(null); document.querySelector<HTMLElement>('.ew-inspector-toggle')?.focus();
    } else if (action === 'navigate' && guidance?.target) {
      const target = guidance.target;
      if (target.alias) { const config = virtualModels.find(item => item.slug === target.alias); if (config) openVirtualModel(config); }
      else if (target.model && ['playground','connect','routes'].includes(target.view)) selectCatalogModel(target.model, target.view as 'playground' | 'connect' | 'routes');
      else navigate(target.view);
    } else if (action === 'recover') {
      if (view === 'overview') runDiscovery('provider-failure');
      else { document.querySelector<HTMLButtonElement>('.ew-composer-actions button')?.focus({ preventScroll: true }); selectScenario('provider-failure'); runRequest(playgroundRoute, false, 'provider-failure', prompt.trim() ? prompt : PROMPT); }
    } else if ((action === 'inspect' || action === 'diagnose') && result) openRequest(result);
    else if (action === 'adjust' && result) testAdjustment(result);
    else if (action === 'test') compareRoutes();
    else if (action === 'review') setModal('save');
    else if (action === 'activate') activateDraft();
    else if (action === 'verify') { navigate('playground'); setPlaygroundConfig(null); setPlaygroundAlias(editingVirtualModelSlug ? `vmc/${active.slug}` : null); setModel(active.model); setScenario('healthy'); runRequest(active, false, 'healthy', prompt.trim() ? prompt : PROMPT, undefined, editingVirtualModelSlug ? `vmc/${active.slug}` : undefined); }
    else if (action === 'monitor') {
      const recovered = filteredRequests.find(record => record.id === guidance?.target?.requestId) ?? filteredRequests.find(record => record.status === 'recovered');
      if (recovered) openRequest(recovered);
    }
  }
  function coreGuidance() {
    return getActionGuidance({ view, busy: busy || comparing, result, inspectedId, dirty, pendingRevision: pending?.revision ?? null, activeRevision: active.revision, tested: draftTestCurrent, testOutcome: draftResult ? draftTestCurrent ? draftResult.status : 'stale' : null, visibleRequests: view === 'monitor' ? filteredRequests : undefined });
  }
  function renderTour() {
    if (reviewMode || !['overview','monitor'].includes(view)) return null;
    const guidance = coreGuidance();
    if (!guidance || dismissedGuidance.includes(guidance.key) || view === 'overview' && !result && !tour) return null;
    return <aside className="context-guidance" aria-label="Contextual guidance"><div className="guidance-copy"><strong>{guidance.title}</strong><p>{guidance.description}</p></div><button className="text-button guidance-action" onClick={() => followAction(guidance.action, guidance)}>{guidance.label}<ArrowRight size={14} /></button><button className="icon-button guidance-dismiss" aria-label="Dismiss guidance" onClick={() => { setDismissedGuidance(previous => [...previous, guidance.key]); if (tour) endTour(); }}><X size={14} /></button></aside>;
  }

  function selectRouteStop(selection: RouteSelection) {
    setSelectedRouteStop(selection); setInspectorModel(null); setRouteSelection(selection.providerId);
    if (view !== 'routes' && !busy && result && selection.attemptIndex !== undefined) {
      const event = getReplayEvents(result).find(item => item.kind === 'attempt-end' && item.attemptIndex === selection.attemptIndex);
      if (event) { setReplayAt(event.atMs); setRouteSeekVersion(previous => previous + 1); }
    }
  }
  const instrumentMode = showingEvidence && result ? busy ? 'live' as const : replayAt !== null ? 'replay' as const : 'receipt' as const : 'preview' as const;
  const instrumentProps = { config: flowConfig, record: showingEvidence ? result : null, mode: instrumentMode, shownAttempts: visibleAttempts, activeAttemptIndex: replayFrame?.activeAttempt ?? activeAttemptIndex, selection: selectedRouteStop, onSelectionChange: selectRouteStop };

  function runDiscovery(nextScenario: Scenario = ['healthy', 'provider-failure', 'model-fallback'].includes(scenario) ? scenario : 'healthy') {
    setScenario(nextScenario); setPrompt(DISCOVERY_PROMPT);
    runRequest(withModel(active, model), false, nextScenario, DISCOVERY_PROMPT, DISCOVERY_RESPONSE);
  }
  function renderOverview() { return <>
    <div className="overview-opening"><section className="hero"><h1 tabIndex={-1}>One connection.<br />Many models.</h1><p className="gateway-definition">Connect your app to AI models through one API. Gateway handles routing, recovery, and visibility into every request.</p><div className="hero-actions"><a className="button primary" href="/connect" onClick={event => navigate('connect', event)}>Connect my app <ArrowRight size={16} /></a><a className="text-button" href="/models" onClick={event => navigate('models', event)}>Explore models <ArrowRight size={15} /></a></div></section>
    <div id="gateway-example" className="discovery-container"><DiscoveryDemo model={model} scenario={['healthy', 'provider-failure', 'model-fallback'].includes(scenario) ? scenario : 'healthy'} busy={busy} phase={displayPhase} output={displayOutput} record={result} onModelChange={value => { resetRunDisplay(); setPlaygroundConfig(null); setPlaygroundAlias(null); setModel(value); }} onScenarioChange={value => { resetRunDisplay(); setScenario(value); }} onRun={() => runDiscovery()} onCancel={cancelRun} onInspect={() => result && openRequest(result, { requestId: result.id, surface:'landing', anchorId:`landing-${result.id}` })} onExploreRoute={() => result ? testAdjustment(result) : navigate('routes')} onRehearse={runDiscovery}>
      {result && phase !== 'idle' ? <RequestTimeline record={result} positionMs={busy ? liveElapsed : replayAt ?? undefined} onSelectAttempt={index => { const attempt = result.attempts[index]; setSelectedRouteStop({ modelId:attempt.model, providerId:attempt.provider, attemptIndex:index }); }} selectedAttemptIndex={selectedRouteStop?.attemptIndex ?? null} compact /> : <RouteFlow modelName={modelName(model)} providers={flowProviders} groups={flowGroups} phase={flowPhase} {...instrumentProps} />}
      {routeSelection && <div className="route-note"><Info size={14} /><span>{PROVIDER_NAMES[routeSelection as ProviderId]} is a serving provider. Preference controls where Gateway tries first. A restriction controls which providers are eligible.</span><button aria-label="Dismiss provider explanation" className="icon-button" onClick={() => setRouteSelection(null)}><X size={14} /></button></div>}
      {result && !busy && phase !== 'idle' && <details className="ew-replay-disclosure"><summary>Replay recorded attempts</summary><RequestReplay record={result} position={replayAt} seekVersion={routeSeekVersion} showEvents={false} onSeek={setReplayAt} /></details>}
    </DiscoveryDemo></div></div>
    {reviewMode && !selectedRequest && reviewerReflection}
    {renderTour()}
    <section className="overview-details"><div><h2>Keep your client.<br />Open up your options.</h2><p>Use AI SDK or your existing OpenAI or Anthropic client. Change the model without rebuilding your integration.</p><a className="text-button" href="/connect" onClick={event => { if (!['sdk', 'openai', 'anthropic'].includes(integration)) setIntegration('sdk'); navigate('connect', event); }}>Prepare my integration <ArrowRight size={15} /></a><p className="landing-integration-note">Your selected model and client travel into setup.</p></div><div className="landing-integration"><LandingClientTabs value={integration} onChange={setIntegration} /><div id="landing-integration-preview" role="tabpanel" tabIndex={0} aria-labelledby={`landing-client-${['openai','anthropic'].includes(integration) ? integration : 'sdk'}`}><CodeBlock code={landingCode(model, integration)} label="Server-side example" /></div><p className="landing-integration-note">Authenticate on your server with Gateway credentials. Your app can run on Vercel or another platform.</p></div></section>

  </>; }

  function selectScenario(value: Scenario) { resetRunDisplay(); setScenario(value); if (value === 'invalid-key') setAuth('api-key'); if (value === 'expired-oidc') setAuth('oidc'); }

  const sampleHours = [...new Set(requests.map(request => Math.floor(request.timestamp / 3600000) * 3600000))].sort((a, b) => a - b).slice(-8);
  const buckets = sampleHours.map(start => { const records = requests.filter(request => request.timestamp >= start && request.timestamp < start + 3600000 && (authFilter === 'all' || request.auth === authFilter)); return { start, records, metrics: getMetrics(records) }; });
  const filteredRequests = requests.filter(request => (!filter || `${request.id} ${request.model} ${request.servedModel} ${request.provider} ${request.tag}`.toLowerCase().includes(filter.toLowerCase())) && (statusFilter === 'all' || request.status === statusFilter) && (authFilter === 'all' || request.auth === authFilter) && (hourFilter === null || request.timestamp >= hourFilter && request.timestamp < hourFilter + 3600000)).sort((a, b) => sortDescending ? b.timestamp - a.timestamp : a.timestamp - b.timestamp);
  const scopedRequests = useMemo(() => requests.filter(request => authFilter === 'all' || request.auth === authFilter), [requests, authFilter]);
  const filteredMetrics = getMetrics(scopedRequests);
  function exportRequests() {
    const values = [['Request ID', 'Timestamp UTC', 'Status', 'Requested model', 'Served model', 'Provider', 'Cost USD', 'TTFT ms', 'Authentication', 'Provenance'], ...filteredRequests.map(record => [record.id, new Date(record.timestamp).toISOString(), record.status, record.model, record.servedModel, record.provider ?? '', record.status === 'cancelled' ? 'unknown' : record.cost, record.ttftMs, record.auth, 'demo'])];
    const csv = values.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n'); const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'gateway-demo-requests.csv'; link.click(); URL.revokeObjectURL(url); toast('Exported all filtered demo requests.');
  }
  function renderMonitor(embedded = false) {
    const matchingMetrics = getMetrics(filteredRequests);
    return <div className="workspace-page monitor-page visual-monitor">{!embedded && <PageHeading title="Logs" description="Explore the requests behind every outcome." />}
      <div className="logs-instrument">
      <div className="logs-toolbar">
        <div className="workspace-tabs" role="tablist" aria-label="Log presentation">{(['field','table'] as const).map(mode => <button key={mode} id={`logs-tab-${mode}`} role="tab" aria-selected={logPresentation === mode} aria-controls={mode === 'field' ? 'logs-field' : 'request-list'} tabIndex={logPresentation === mode ? 0 : -1} onKeyDown={event => moveTabFocus(event, ['field','table'], logPresentation, setLogPresentation, 'logs-tab')} onClick={() => setLogPresentation(mode)}>{mode === 'field' ? 'Field' : 'Table'}</button>)}</div>
        <span className="logs-matching-count" role="status">{filteredRequests.length} matching requests</span>
        <details className="logs-scope"><summary>Simulated · UTC</summary><p>All views use the same search, identity, status and recorded-hour filters. Final usage can be unknown after cancellation.</p></details>
      </div>
      <div className="table-controls logs-filter-row">
        <label className="search-field"><Search size={15} /><input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Search request, model, provider, or tag" aria-label="Search requests" />{filter && <button className="icon-button" onClick={() => setFilter('')} aria-label="Clear search"><X size={13} /></button>}</label>
        <label className="logs-status"><span className="sr-only">Request status</span><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="success">Success</option><option value="recovered">Recovered</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option></select></label>
        <label className="logs-identity"><span className="sr-only">Authentication</span><select aria-label="Authentication" value={authFilter} onChange={event => setAuthFilter(event.target.value)}><option value="all">All identities</option><option value="oidc">Project OIDC</option><option value="api-key">API key</option></select></label>
        <label className="logs-hour"><span className="sr-only">Recorded hour</span><select aria-label="Recorded hour" value={hourFilter ?? 'all'} onChange={event => setHourFilter(event.target.value === 'all' ? null : Number(event.target.value))}><option value="all">All recorded hours</option>{buckets.map(bucket => <option key={bucket.start} value={bucket.start}>{formatRequestHour(bucket.start, sampleHours)} UTC</option>)}</select></label>
        <button className="filter-chip" aria-pressed={statusFilter === 'recovered'} onClick={() => setStatusFilter(statusFilter === 'recovered' ? 'all' : 'recovered')}><RotateCcw size={13} />Recovered</button>
        {hourFilter !== null && <button className="text-button logs-clear-hour" onClick={() => setHourFilter(null)}>Clear hour filter<X size={13} /></button>}
      </div>
      <div className="metric-grid"><Metric label="Requests" value={String(matchingMetrics.count)} detail="Matching filters" /><Metric label="Known inference cost" value={formatCost(matchingMetrics.spend)} detail={matchingMetrics.unknownUsage ? `${matchingMetrics.unknownUsage} unknown usage` : 'Recorded usage'} /><Metric label="Response success" value={matchingMetrics.successRate === null ? '—' : `${matchingMetrics.successRate.toFixed(1)}%`} detail="Includes recovery" /><Metric label="P75 first output" value={matchingMetrics.p75Ttft === null ? '—' : `${matchingMetrics.p75Ttft} ms`} detail="Successful responses" /></div>
      <div hidden={logPresentation !== 'field'} role="tabpanel" id="logs-field" aria-labelledby="logs-tab-field"><RequestField records={filteredRequests} presentation="compact" selectedRequestId={selectedRequest?.id} onSelectRequest={openRequest} /></div>
      <section id="request-list" className="request-table-section" hidden={logPresentation !== 'table'} role="tabpanel" aria-labelledby="logs-tab-table"><div className="section-heading"><h2>Requests <span className="count-badge">{filteredRequests.length}</span></h2><button className="text-button" onClick={exportRequests}><Download size={14} />Export CSV</button></div><div className="table-scroll"><table><thead><tr><th><button className="table-sort" onClick={() => setSortDescending(!sortDescending)}>Time (UTC){sortDescending ? <ArrowDown size={12} /> : <ArrowUp size={12} />}</button></th><th>Model / provider</th><th>Status</th><th><abbr title="Time to first token">TTFT</abbr></th><th>Cost</th><th>Request</th></tr></thead><tbody>{filteredRequests.slice(Math.min(requestPage, Math.max(0, Math.ceil(filteredRequests.length / 12) - 1)) * 12, (Math.min(requestPage, Math.max(0, Math.ceil(filteredRequests.length / 12) - 1)) + 1) * 12).map(record => <tr key={record.id} className={selectedRequest?.id === record.id ? 'request-row-selected' : ''}><td className="mono">{displayTime(record.timestamp)}<small>{new Date(record.timestamp).toISOString().slice(0, 10)}</small></td><td><button className="model-row-button" onClick={() => openRequest(record)} aria-label={`Inspect ${record.id}, ${knownModelName(record)}`}><strong>{knownModelName(record)}<ArrowUpRight size={10} /></strong><small>{record.provider ? PROVIDER_NAMES[record.provider] : 'No served provider'}</small></button></td><td><StatusBadge status={record.status} /></td><td className="mono">{record.status === 'failed' || record.status === 'cancelled' ? '—' : `${record.ttftMs} ms`}</td><td className="mono">{record.status === 'cancelled' ? 'Unknown' : formatCost(record.cost)}</td><td><button className="request-link mono" title={record.id} aria-label={`Inspect ${record.id}`} onClick={() => openRequest(record)}>{visibleRequestIdentity(record)}<ArrowUpRight size={12} /></button></td></tr>)}</tbody></table></div>{filteredRequests.length === 0 && <div className="table-empty"><Search size={22} /><h3>No matching requests</h3><p>Try a different search or clear the filters.</p><button className="button secondary" onClick={() => { setFilter(''); setStatusFilter('all'); setHourFilter(null); setAuthFilter('all'); }}>Clear filters</button></div>}<div className="request-pagination"><span>{filteredRequests.length ? `${Math.min(requestPage, Math.max(0, Math.ceil(filteredRequests.length / 12) - 1)) * 12 + 1}–${Math.min((Math.min(requestPage, Math.max(0, Math.ceil(filteredRequests.length / 12) - 1)) + 1) * 12, filteredRequests.length)} of ${filteredRequests.length} requests` : '0 requests'}</span><div><button className="button secondary" disabled={requestPage === 0} onClick={() => setRequestPage(previous => Math.max(0, previous - 1))}>Previous</button><button className="button secondary" disabled={(requestPage + 1) * 12 >= filteredRequests.length} onClick={() => setRequestPage(previous => previous + 1)}>Next</button></div></div></section>
      </div>
    </div>;
  }

  function requestDetour(record: RequestRecord, next: View) {
    const origin: JourneyOrigin = { requestId: record.id, href: window.location.pathname + window.location.search, view };
    navigate(next); setJourneyOrigin(origin);
    window.history.replaceState({ ...window.history.state, journeyOrigin: origin }, '', window.location.href);
  }
  function returnToInvestigation() {
    if (!journeyOrigin) return;
    const origin = restoreJourneyOrigin(journeyOrigin, requests);
    if (!origin) { setJourneyOrigin(null); toast('That request is no longer stored. Explore the current request history.'); return; }
    window.history.pushState({}, '', origin.href);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
  function followRequestGuidance(record: RequestRecord) {
    const guidance = getRequestGuidance(record);
    if (guidance.kind === 'authentication') {
      resetRunDisplay(); setAuth(record.auth); setSetupEnvironment(record.auth === 'oidc' ? 'local' : 'elsewhere');
      if (record.auth === 'oidc' && integration === 'agent') setIntegration('sdk');
      setSetupIntent(record.auth === 'oidc' ? 'existing' : integration === 'agent' ? 'agent' : 'existing'); setSetupIssue({ title: guidance.title, description: guidance.description }); requestDetour(record, 'connect');
    } else if (guidance.kind === 'budget') { requestDetour(record, 'budgets'); }
    else if (guidance.kind === 'eligibility' && record.scenario === 'model-unavailable') { resetRunDisplay(); setPlaygroundConfig(null); setPlaygroundAlias(null); setModel(record.model); setScenario('healthy'); navigate('playground'); setModal('models'); }
    else if (guidance.kind === 'routing' || guidance.kind === 'eligibility') testAdjustment(record);
    else {
      if (record.status === 'success') { setDrawerTab('usage'); return; }
      const selector = record.status === 'cancelled' ? '.drawer-response' : '.snapshot-details';
      const target = document.querySelector<HTMLElement>(`.request-detail-view ${selector}`);
      if (target) {
        if (target instanceof HTMLDetailsElement) target.open = true;
        const focusTarget = target instanceof HTMLDetailsElement ? target.querySelector<HTMLElement>('summary') : target;
        if (focusTarget) { focusTarget.tabIndex = -1; focusTarget.focus({ preventScroll: true }); }
        target.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      }
    }
  }
  function requestGuidance(record: RequestRecord) {
    const guidance = getRequestGuidance(record);
    return <div className={`drawer-action request-guidance guidance-${guidance.kind}`}><div><span className="field-label">Next action</span><h3>{guidance.title}</h3><p>{guidance.description}</p></div>{guidance.kind === 'rate-limit' ? <a className="button secondary" href="https://vercel.com/docs/ai-gateway/rate-limits" target="_blank" rel="noreferrer">{guidance.actionLabel}<ExternalLink size={14} /></a> : <button className="button primary" onClick={() => followRequestGuidance(record)}>{guidance.actionLabel}<ArrowRight size={15} /></button>}</div>;
  }

  function renderRequestDetails(record: RequestRecord) {
    const failed = record.attempts.find(attempt => attempt.status === 'failed');
    const headline = record.status === 'cancelled' ? 'Request cancelled.' : record.status === 'failed' ? 'Request stopped.' : record.status === 'recovered' ? record.model !== record.servedModel ? 'A fallback model answered.' : `Recovered via ${record.provider ? PROVIDER_NAMES[record.provider] : 'another provider'}.` : 'Response completed.';
    const failedAttempts = record.attempts.filter(attempt => attempt.status === 'failed');
    const serving = record.provider ? PROVIDER_NAMES[record.provider] : 'The provider';
    const recoveryCause = !failedAttempts.length ? 'The request recovered.' : failedAttempts.length === 1 ? `${PROVIDER_NAMES[failedAttempts[0].provider]} failed before output.` : `${failedAttempts.length} provider attempts failed before output.`;
    const reason = record.status === 'cancelled' ? 'Observation stopped. Final usage is unknown.' : record.status === 'recovered' ? `${recoveryCause} ${serving} served ${knownModelName(record)}.` : failed?.reason || (record.status === 'failed' ? record.response : `${serving} served ${knownModelName(record)}.`);
    return <div className="drawer-body visual-request-drawer">
      <div className="receipt-summary">
        <div className="receipt-summary-copy"><div className="receipt-topline"><StatusBadge status={record.status} /><span className="demo-label">Simulated receipt</span></div>
        <h1 tabIndex={-1} className="receipt-headline">{headline}</h1><p className="receipt-cause">{reason}</p>
        <RequestIdentity record={record} origin={inspectionOrigin} /></div>
        <div className="receipt-values"><div><span>{record.status === 'cancelled' && record.ttftMs > 0 ? 'Partial first output' : 'First output'}</span><strong>{record.ttftMs > 0 ? `${record.ttftMs} ms` : '—'}</strong></div><div><span>{record.status === 'cancelled' ? 'Observed' : 'Total'}</span><strong>{record.status === 'cancelled' ? getReplayDuration(record) : record.durationMs} ms</strong></div><div><span>Inference cost</span><strong>{record.status === 'cancelled' || record.usageKnown === false ? 'Unknown' : formatCost(record.cost)}</strong></div></div>
      </div>
      <div className="workspace-tabs drawer-tabs" role="tablist" aria-label="Request detail views">{(['evidence','usage','configuration'] as const).map(tab => <button key={tab} role="tab" tabIndex={drawerTab === tab ? 0 : -1} onKeyDown={event => moveTabFocus(event, ['evidence','usage','configuration'], drawerTab, setDrawerTab, 'drawer-tab')} id={`drawer-tab-${tab}`} aria-controls={`drawer-panel-${tab}`} aria-selected={drawerTab === tab} onClick={() => setDrawerTab(tab)}>{tab === 'evidence' ? 'Evidence' : tab === 'usage' ? 'Usage' : 'Configuration'}</button>)}</div>
      <div role="tabpanel" id={`drawer-panel-${drawerTab}`} aria-labelledby={`drawer-tab-${drawerTab}`} tabIndex={0}>
        {drawerTab === 'evidence' && <>
          <div className="drawer-trace"><RequestTimeline record={record} compact presentation="instrument" showOutcome={false} /></div>
          <details className="drawer-workload receipt-disclosure"><summary>Prompt</summary><p>{record.prompt ?? 'Prompt unavailable in this older demo record.'}</p></details>
          <details className="drawer-response receipt-disclosure"><summary>{record.status === 'failed' ? 'Failure explanation' : record.status === 'cancelled' ? 'Observed output' : 'Response'}</summary>{record.response && <CopyButton text={record.response} />}<p>{record.response || 'No output was generated.'}</p></details>
          <details className="receipt-disclosure"><summary>Request metadata</summary><div className="request-id"><code>{record.id}</code><CopyButton text={record.id} label="Copy ID" /></div><p>{new Date(record.timestamp).toLocaleString('en-US', { timeZone: 'UTC' })} UTC</p></details>
        </>}
        {drawerTab === 'usage' && <dl className="request-metadata">{record.virtualModel && <div><dt>Virtual Model</dt><dd>{record.virtualModel}</dd></div>}<div><dt>Requested model</dt><dd>{record.model}</dd></div><div><dt>Served model</dt><dd>{record.provider ? record.servedModel : '—'}</dd></div><div><dt>Identity</dt><dd>{record.auth === 'oidc' ? 'Project OIDC' : 'API key'}</dd></div><div><dt>Demo revision</dt><dd>r{record.revision}</dd></div><div><dt>Input / output tokens</dt><dd>{record.status === 'cancelled' || record.usageKnown === false ? 'Unknown after cancellation' : `${record.inputTokens} / ${record.outputTokens}`}</dd></div><div><dt>Inference cost</dt><dd>{record.status === 'cancelled' || record.usageKnown === false ? 'Unknown after cancellation' : formatCost(record.cost)}</dd></div><div><dt>First token / total</dt><dd>{record.status === 'failed' || record.status === 'cancelled' ? '—' : `${record.ttftMs} ms / ${record.durationMs} ms`}</dd></div><div><dt>Tag</dt><dd>{record.tag || '—'}</dd></div></dl>}
        {drawerTab === 'configuration' && <div className="snapshot-details">{record.configSnapshot ? <CodeBlock code={routingCode(record.configSnapshot)} label="Recorded demo snapshot" /> : <p className="subtle">Configuration unavailable for this record.</p>}</div>}
      </div>
      {record.status === 'recovered' && <JourneyNote topic="recovery" />}
      {requestGuidance(record)}
      {view !== 'monitor' && <button className="text-button drawer-monitor-link" onClick={() => viewInMonitoring(record)}>View this request in Monitoring <ArrowUpRight size={14} /></button>}
    </div>;
  }

  function changeWorkingStage(next: WorkspaceStage) {
    if (next === 'shape' && view !== 'routes') {
      if (result?.configSnapshot && !busy && result.id !== sourceRequest?.id) {
        const captured = captureWorkingSource(result, prompt, playgroundRoute);
        setSourceRequest(captured.record); setRehearsal({ base: clone(captured.fixture), overrides: {} }); setDraft(clone(captured.config)); setPrompt(captured.prompt);
        setTestedDraft(null); setBaselineResult(null); setDraftResult(null); setComparisonFixture(null);
        setRouteTab('route'); setSelectedRouteStop(null); setPending(null);
      } else if (!sourceRequest && !dirty) setDraft(clone(playgroundRoute));
    }
    if (next === 'connect') {
      setHandoffConfig(clone(view === 'routes' ? draft : handoffConfig ?? playgroundRoute));
      setModel(view === 'routes' ? draft.model : model); setSetupIssue(null);
      if (view === 'routes') setHandoffAlias(null);
    }
    if (next === 'try' && !result && sourceRequest) {
      setResult(sourceRequest); setOutput(sourceRequest.response); setShownAttempts(sourceRequest.attempts.length);
      setPhase(sourceRequest.status === 'failed' ? 'failed' : 'complete'); setReplayAt(null);
    }
    navigate(({ try:'playground', shape:'routes', connect:'connect', observe:'monitor' } as const)[next]);
  }

  function renderWorkingExperience() {
    const stage: WorkspaceStage = view === 'routes' ? 'shape' : view === 'connect' ? 'connect' : view === 'monitor' ? 'observe' : 'try';
    const completedRecord = result && !busy && phase !== 'idle' ? result : null;
    const source = sourceRequest ?? completedRecord;
    const selectedAttempt = result && selectedRouteStop?.attemptIndex !== undefined && selectedRouteStop.attemptIndex < visibleAttempts ? result.attempts[selectedRouteStop.attemptIndex] : null;
    const contextModel = stage === 'shape' ? draft.model : model;
    const workspaceTitle = stage === 'try' ? 'Playground' : stage === 'shape' ? 'Routing' : stage === 'observe' ? 'Logs' : setupIntent === 'agent' || integration === 'agent' ? 'Connect an agent' : 'Connect';
    const contextAlias = stage === 'shape' ? editingVirtualModelSlug ? `vmc/${editingVirtualModelSlug}` : undefined : stage === 'connect' ? handoffAlias ?? undefined : playgroundAlias ?? undefined;
    const selectedProvider = selectedRouteStop ? PROVIDER_NAMES[selectedRouteStop.providerId as ProviderId] : null;
    const guidance = coreGuidance();
    const verificationAction = !dirty && !pending && guidance && ['verify','inspect'].includes(guidance.action);
    const unsuccessfulTest = Boolean(draftResult && (!draftTestCurrent || draftResult.status === 'failed' || draftResult.status === 'cancelled'));
    const reviewReady = dirty && !comparing && !pending && routeTab === 'comparison' && draftTestCurrent && (draftResult?.status === 'success' || draftResult?.status === 'recovered');
    const primaryAction = stage === 'shape' ? <><button className={`button ${reviewReady || pending || verificationAction ? 'secondary' : 'primary'}`} disabled={busy || comparing || errors.length > 0} onClick={compareRoutes}><Play size={14} />{comparing ? 'Comparing…' : 'Test draft'}</button>{pending ? <button className="button primary" disabled={busy || comparing || Boolean(draftResult && !draftTestCurrent)} onClick={activateDraft}>Simulate activation<Check size={14} /></button> : dirty && <button className={`button ${reviewReady ? 'primary' : 'secondary'}`} disabled={comparing || errors.length > 0 || !draftTestCurrent || unsuccessfulTest} title={unsuccessfulTest ? 'Correct or retest the draft before review.' : undefined} onClick={() => setModal('save')}>Review changes</button>}{verificationAction && <button className="button primary" onClick={() => followAction(guidance.action, guidance)}>{guidance.label}<ArrowRight size={15} /></button>}</>
      : stage === 'connect' ? <button className="button primary" disabled={!setupPrimary || setupPrimary.disabled} onClick={() => setupPrimary?.run()}>{setupPrimary?.label ?? 'Continue'}{setupPrimary?.label.startsWith('Open in') ? <ArrowUpRight size={15} /> : <ArrowRight size={15} />}</button>
        : <button className="button primary" onClick={busy ? cancelRun : () => { if (stage === 'observe') navigate('playground'); runRequest(playgroundRoute, false, scenario, prompt, prompt === DISCOVERY_PROMPT ? DISCOVERY_RESPONSE : undefined); }}>{busy ? <Square size={14} /> : <Play size={14} />}{busy ? 'Stop request' : 'Run request'}</button>;

    const request = <>
      <section className="ew-request-editor" aria-label="Your workload">
        <div className="ew-surface-heading"><label className="field-label" htmlFor="workspace-prompt">Prompt</label><button className="text-button ew-model-picker" onClick={() => setModal('models')}>{modelName(model)}<ChevronDown size={14} /></button></div>
        <textarea id="workspace-prompt" aria-label="Your workload" value={prompt} onChange={event => { setPrompt(event.target.value); setRehearsal(previous => previous ? { base: createRehearsalFixture(null, event.target.value), overrides: previous.overrides } : null); setTestedDraft(null); }} disabled={busy} rows={4} placeholder="What should your app do?" />
        {promptError && <p role="alert" className="error-text">{promptError}</p>}
        <div className={`ew-composer-actions${completedRecord ? ' has-receipt' : ''}`}><span className="subtle">{auth === 'oidc' ? 'Project OIDC' : 'API key'}<kbd>⌘ ↵</kbd></span>{primaryAction}</div>
      </section>
      <section className="ew-response" aria-label="Response">
        <div className="ew-surface-heading"><h2>{completedRecord?.status === 'failed' ? 'Request outcome' : 'Response'}</h2><span className="ew-output-state" role="status">{busy ? displayPhase === 'routing' ? 'Routing' : 'Responding' : replayAt !== null ? 'Replay' : completedRecord ? completedRecord.status === 'cancelled' ? 'Cancelled' : 'Complete' : 'Ready'}</span></div>
        <div className={`ew-response-output${!displayOutput && !busy && !completedRecord ? ' is-empty' : ''}`} aria-live={busy ? 'off' : 'polite'}>{displayOutput || (phase === 'failed' ? result?.response : busy ? 'Waiting for first output…' : replayAt !== null ? 'Output has not started at this recorded position.' : <><span className="ew-output-mark" aria-hidden="true"><Braces size={28} /></span><p>Your response starts here.</p><span className="ew-output-line" /><span className="ew-output-line short" /></>)}</div>
        {completedRecord && <div className="ew-response-receipt" key={completedRecord.id} data-receipt={completedRecord.id}><div className="ew-receipt-context"><StatusBadge status={completedRecord.status} /><span>{completedRecord.provider ? PROVIDER_NAMES[completedRecord.provider] : 'No served provider'}</span><span className="ew-receipt-measure">{completedRecord.ttftMs > 0 ? `${completedRecord.ttftMs} ms` : '—'}<small>{completedRecord.status === 'cancelled' ? 'partial first output' : 'first output'}</small></span></div><button className="text-button" onClick={event => { event.currentTarget.focus(); openRequest(completedRecord); }}>Inspect request<ArrowUpRight size={14} /></button></div>}
      </section>
      <section className="ew-fixture" aria-label="Request conditions">
        {scenario !== 'healthy' && <span className="ew-condition-chip">{SCENARIOS.find(item => item.id === scenario)?.name}</span>}
        <details><summary>Request conditions<SlidersHorizontal size={14} /></summary><div className="ew-conditions-panel"><label className="ew-failure-toggle"><input type="checkbox" aria-label="Make preferred provider unavailable" checked={scenario === 'provider-failure'} disabled={busy} onChange={event => selectScenario(event.target.checked ? 'provider-failure' : 'healthy')} /><span>Make the preferred provider unavailable</span></label><label><span className="field-label">Simulate a scenario</span><select aria-label="Simulate a scenario" disabled={busy} value={scenario} onChange={event => selectScenario(event.target.value as Scenario)}>{SCENARIOS.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><p className="fine-print">{SCENARIOS.find(item => item.id === scenario)?.description}</p><label><span className="field-label">Identity</span><select aria-label="Identity" value={auth} onChange={event => { resetRunDisplay(); setAuth(event.target.value as AuthMode); }}><option value="oidc">Project OIDC</option><option value="api-key">API key</option></select></label></div></details>
      </section>
    </>;

    const observatory = <div className="ew-observatory" data-mode={instrumentMode}>
      <div className="ew-observatory-heading"><span className="ew-trace-label"><Activity size={16} />Request trace</span><div className="ew-trace-actions"><button className="text-button" disabled={busy} onClick={() => changeWorkingStage('connect')}>Connect app<ArrowUpRight size={14} /></button><button className="text-button" disabled={busy} onClick={() => changeWorkingStage('shape')}>Adjust this route<ArrowRight size={14} /></button></div></div>
      {result && phase !== 'idle' ? <><RequestTimeline record={result} presentation="instrument" showOutcome={false} positionMs={busy ? liveElapsed : replayAt ?? undefined} selectedAttemptIndex={selectedRouteStop?.attemptIndex ?? null} onSelectAttempt={index => { const attempt = result.attempts[index]; selectRouteStop({ modelId: attempt.model, providerId: attempt.provider, attemptIndex: index }); }} />{completedRecord && <details className="ew-replay-disclosure"><summary>Replay recorded attempts</summary><RequestReplay record={completedRecord} position={replayAt} seekVersion={routeSeekVersion} showEvents={false} onSeek={setReplayAt} /></details>}</> : <div className="ew-connection-preview" aria-label="Connection preview, no request sent"><span><Terminal size={20} /><strong>Your app</strong></span><i aria-hidden="true" /><span className="ew-gateway-node"><Network size={20} /><strong>AI Gateway</strong></span><i aria-hidden="true" /><span><Braces size={20} /><strong>{modelName(model)}</strong></span></div>}
      {completedRecord && <JourneyNext guidance={guidance ? { ...guidance, label: guidance.action === 'recover' ? 'Test recovery' : guidance.label } : null} primary onAction={next => followAction(next.action, next)} />}
    </div>;

    const routeToolbar = <>
      <div className="ew-route-actions" hidden={stage !== 'shape'}><div className="workspace-tabs" role="tablist" aria-label="Route views">{(['route','code','comparison'] as const).map(tab => <button key={tab} id={`working-route-tab-${tab}`} type="button" role="tab" tabIndex={routeTab === tab ? 0 : -1} onKeyDown={event => moveTabFocus(event, baselineResult ? ['route','code','comparison'] : ['route','code'], routeTab, setRouteTab, 'working-route-tab')} aria-selected={routeTab === tab} aria-controls={`working-route-panel-${tab}`} disabled={tab === 'comparison' && !baselineResult} onClick={() => setRouteTab(tab)}>{tab === 'route' ? 'Route' : tab === 'code' ? 'Code' : 'Comparison'}</button>)}</div>{stage === 'shape' && <span className="draft-label">{dirty ? 'Unsaved changes' : pending ? 'Saved revision' : 'Matches active route'}</span>}</div>
      {stage === 'shape' && <section className="rehearsal-conditions" aria-label="Pinned simulation conditions"><div><span className="rehearsal-kicker">Local simulation</span><strong>What should this route withstand?</strong><p>Set provider conditions below, then test both routes against the same workload.</p></div><div className="rehearsal-pins" aria-label="Pinned provider conditions">{(Object.keys(PROVIDER_NAMES) as ProviderId[]).filter(provider => !effectiveFixture.providers[provider].available || rehearsal?.overrides[provider] !== undefined).map(provider => <span className="rehearsal-pin" key={provider}><span aria-hidden="true" />{PROVIDER_NAMES[provider]}<small>{effectiveFixture.providers[provider].available ? 'Available' : 'Unavailable'} · {rehearsal?.overrides[provider] !== undefined ? 'Edited' : 'Inherited'}</small></span>)}{Object.values(effectiveFixture.providers).every(condition => condition.available) && <span className="rehearsal-all-available">All providers available in this simulation</span>}</div>{rehearsal && Object.keys(rehearsal.overrides).length > 0 && <button className="text-button" disabled={comparing} onClick={restoreConditions}>Restore {sourceRequest ? 'captured' : 'demo'} conditions<RotateCcw size={14} /></button>}</section>}
    </>;
    const route = <>
      {stage === 'shape' && guidance && (draftResult || pending) && <div className="ew-route-status" role="status"><strong>{guidance.title}</strong><span>{guidance.description}</span></div>}<div hidden={stage === 'shape' && routeTab !== 'route'} role="tabpanel" id="working-route-panel-route" aria-labelledby="working-route-tab-route"><RouteFlow modelName={modelName(flowConfig.model)} providers={flowProviders} groups={flowGroups} phase={stage === 'shape' ? 'idle' : flowPhase} {...instrumentProps} mode={stage === 'shape' ? 'preview' : instrumentMode} config={stage === 'shape' ? draft : flowConfig} record={stage === 'shape' ? null : showingEvidence ? result : null} conditions={stage === 'shape' ? effectiveFixture.providers : undefined} conditionOverrides={stage === 'shape' ? rehearsal?.overrides : undefined} onConditionChange={stage === 'shape' && !comparing ? changeProviderCondition : undefined} onOrderChange={stage === 'shape' ? (_, order) => changeDraft({ order }) : undefined} onModelSelect={id => { setSelectedRouteStop(null); setInspectorModel(id); }} /></div>
      <div hidden={stage !== 'shape' || routeTab !== 'code'} role="tabpanel" id="working-route-panel-code" aria-labelledby="working-route-tab-code"><CodeBlock code={routingCode(draft)} label="Your route · AI SDK" changed={dirty} compareWith={routingCode(sourceRequest?.configSnapshot ?? active)} /><p className="fine-print">Concrete model IDs. An alias must first be created in your Vercel team.</p></div>
      {stage === 'shape' && <div className="ew-route-bottom-actions">{dirty && <button className="text-button" disabled={comparing} onClick={() => { resetRunDisplay(); setDraft(clone(pending ?? active)); setTestedDraft(null); setRouteTab('route'); }}>Discard</button>}<button className="text-button" disabled={errors.length > 0} onClick={() => changeWorkingStage('connect')}>Use this route in your app<ArrowRight size={14} /></button></div>}
      {stage === 'try' && <button className="text-button ew-shape-route" disabled={busy} onClick={() => changeWorkingStage('shape')}>Shape this route<ArrowRight size={15} /></button>}
    </>;

    const inspector = stage === 'shape' ? <div className="ew-route-inspector inspector-body">
      <div className="ew-surface-heading"><h2>{selectedProvider ?? (inspectorModel ? modelName(inspectorModel) : 'Configuration')}</h2><span className={`revision-pill ${pending ? 'pending' : ''}`}>{pending ? `r${pending.revision} pending` : `r${active.revision} active`}</span></div>
      {pending && <section className="inspector-section activation-banner"><strong>Saved. Waiting to activate.</strong><p>Activation changes future demo requests. Existing receipts stay unchanged.</p></section>}
      {selectedProvider && <section className="inspector-section"><p>{modelName(selectedRouteStop!.modelId)} can be served by {selectedProvider}. Preference chooses where Gateway tries first.</p>{draft.order.includes(selectedRouteStop!.providerId as ProviderId) && <button className="text-button" onClick={() => changeDraft({ order: draft.order.filter(id => id !== selectedRouteStop!.providerId) })}>Return to automatic pool</button>}</section>}
      <details className="ew-policy-settings" open={!selectedProvider}><summary>Model and route settings</summary><section className="inspector-section"><ModelSelect value={draft.model} onChange={value => changeDraft({ model: value, fallbacks: draft.fallbacks.filter(id => id !== value), order: MODELS.find(item => item.id === value)?.providers ?? draft.order, only: [] })} label="Primary model" /><div className="section-heading"><span className="field-label">Provider preference</span><button className="text-button" onClick={() => changeDraft({ order: draft.order.length ? [] : [...(MODELS.find(item => item.id === draft.model)?.providers ?? [])] })}>{draft.order.length ? 'Use automatic order' : 'Prefer this order'}</button></div><details><summary>Automatic pool strategy</summary><p>Explicit preferences are tried before the automatic pool.</p><label><span className="field-label">Unlisted providers: optimize for</span><select value={draft.sort} onChange={event => changeDraft({ sort: event.target.value as RoutingConfig['sort'] })}><option value="default">Provider default</option><option value="cost">Lowest cost</option><option value="ttft">Time to first token</option><option value="tps">Tokens per second</option></select></label></details></section>
      <details className="inspector-section restriction-editor"><summary>Provider restrictions</summary><p>{draft.only.length ? 'Only selected providers are eligible across the model chain.' : 'All providers remain eligible. Select to create an allowlist.'}</p><div className="provider-chips">{[...new Set([draft.model, ...draft.fallbacks].flatMap(id => MODELS.find(item => item.id === id)?.providers ?? []))].map(id => <button key={id} aria-pressed={draft.only.includes(id)} className={draft.only.includes(id) ? 'selected' : ''} onClick={() => changeDraft({ only: draft.only.includes(id) ? draft.only.filter(item => item !== id) : [...draft.only, id] })}>{draft.only.includes(id) && <Check size={12} />}{PROVIDER_NAMES[id]}</button>)}</div><div className="eligibility-summary" aria-label="Model chain eligibility">{[draft.model, ...draft.fallbacks].map((id,index) => <div key={id} className={eligibleProviders(draft,id).length ? '' : 'has-no-route'}><span>{index === 0 ? 'Primary' : 'Fallback'} · {modelName(id)}</span><strong>{eligibleProviders(draft,id).length ? `${eligibleProviders(draft,id).length} eligible providers` : index === 0 ? 'The primary model has no allowed provider' : 'This fallback has no allowed provider'}</strong></div>)}</div></details>
      <details className="inspector-section fallback-editor"><summary>Model fallback</summary><label className="toggle-label"><input type="checkbox" checked={draft.fallbacks.length > 0} onChange={event => changeDraft({ fallbacks: event.target.checked ? [MODELS.find(item => item.id !== draft.model && item.creator === 'OpenAI')?.id ?? MODELS.find(item => item.id !== draft.model)!.id] : [] })} /><span>Enable fallback model</span></label><p>Try another model after eligible providers fail before output.</p>{draft.fallbacks.length > 0 && <ModelSelect value={draft.fallbacks[0]} onChange={value => changeDraft({ fallbacks: [value] })} label="Then try" exclude={[draft.model]} />}</details>
      <details className="inspector-section"><summary>Alias and request metadata</summary><label className="text-field"><span className="field-label">{editingVirtualModelSlug ? 'Stable alias' : 'Proposed alias'}</span><div className="prefix-input"><span>vmc/</span><input aria-label="Virtual Model slug" readOnly={!!editingVirtualModelSlug} value={draft.slug} onChange={event => changeDraft({ slug: event.target.value })} /></div></label><label className="text-field"><span className="field-label">Request tag</span><input value={draft.tags.join(', ')} onChange={event => changeDraft({ tags: event.target.value.split(',').map(tag => tag.trim()).filter(Boolean) })} /></label></details>
      <details className="inspector-section workload-context"><summary>Test workload</summary><p>{sourceRequest?.prompt !== undefined ? 'Captured input and provider conditions stay fixed.' : 'This rehearsal uses the workload below and your pinned provider conditions.'}</p><label><span className="field-label">Workload prompt</span><textarea value={sourceRequest?.prompt ?? prompt} readOnly={sourceRequest?.prompt !== undefined} rows={3} onChange={event => { setPrompt(event.target.value); setRehearsal(previous => previous ? { base: createRehearsalFixture(null, event.target.value), overrides: previous.overrides } : null); setTestedDraft(null); }} disabled={comparing} /></label>{promptError && <p className="error-text" role="alert">{promptError}</p>}</details>
      <details className="inspector-section"><summary>Demo revisions</summary><div className="revision-history">{revisions.filter(revision => revision.slug === draft.slug).slice().reverse().map(revision => <div key={`${revision.slug}-${revision.revision}`}><span className="mono">r{revision.revision}</span><span>{modelName(revision.model)}</span><span className="subtle">{revision.revision === active.revision ? 'Active' : revision.revision === pending?.revision ? 'Pending' : 'Previous'}</span>{revision.revision !== active.revision && revision.revision !== pending?.revision && <button className="text-button" onClick={() => { setDraft(clone(revision)); setTestedDraft(null); setRouteTab('route'); }}>Restore as draft</button>}</div>)}</div></details>
      {errors.length > 0 && <div className="error-box" role="alert">{errors.map(error => <p key={error}>{error}</p>)}</div>}</details>
    </div> : selectedRouteStop || inspectorModel ? <div className="ew-observed-inspector"><div className="ew-surface-heading"><h2>{selectedProvider ?? modelName(inspectorModel!)}</h2><button className="icon-button" aria-label="Close provider details" onClick={() => { setSelectedRouteStop(null); setInspectorModel(null); }}><X size={15} /></button></div><p>{selectedAttempt ? selectedAttempt.reason : selectedRouteStop?.attemptIndex !== undefined ? 'This attempt has not completed at the current timeline position.' : `${modelName(selectedRouteStop?.modelId ?? inspectorModel!)} is the model. The provider is the service that runs it.`}</p>{selectedAttempt && <dl><dt>Recorded time</dt><dd className="mono">{selectedAttempt.latencyMs} ms</dd><dt>Outcome</dt><dd>{selectedAttempt.status === 'excluded' ? 'Excluded; no request sent' : selectedAttempt.status === 'failed' ? 'Failed before output' : 'Response started'}</dd></dl>}</div> : undefined;

    const comparison = baselineResult && draftResult && comparisonFixture ? <div role="tabpanel" id="working-route-panel-comparison" aria-labelledby="working-route-tab-comparison"><RehearsalComparison key={`${baselineResult.id}:${draftResult.id}`} baseline={baselineResult} draft={draftResult} fixture={comparisonFixture} stale={!draftTestCurrent} activeRevision={active.revision} sourcePolicy={sourceRequest?.configSnapshot ? 'source' : 'active'} onInspect={openRequest} /><div className="ew-comparison-actions"><button className="text-button" disabled={unsuccessfulTest} title={unsuccessfulTest ? 'Correct or retest the draft before preparing an integration.' : undefined} onClick={() => changeWorkingStage('connect')}>Use this route in your app<ArrowRight size={14} /></button><button className="text-button" onClick={() => setRouteTab('route')}>Edit route<ArrowRight size={14} /></button></div></div> : null;
    const connect = loaded ? <>{setupIssue && !journeyOrigin && <aside className="setup-issue" role="status"><ShieldCheck size={18} /><div><strong>{setupIssue.title}</strong><p>{setupIssue.description}</p></div><button className="icon-button" aria-label="Dismiss setup guidance" onClick={() => setSetupIssue(null)}><X size={15} /></button></aside>}{handoffConfig && !sameConfig(handoffConfig, active) && <button className="text-button ew-active-route" onClick={() => { setHandoffConfig(null); setHandoffAlias(null); setModel(active.model); }}>Use active route instead</button>}<SetupExperience flowStorageKey={reviewMode ? REVIEW_FLOW_KEY : undefined} onBriefReview={onReviewerBrief} workload={sourceRequest?.prompt ?? prompt} embedded key={`${setupFlowVersion}:${reviewMode ? 'review' : 'product'}`} onPrimaryActionChange={publishSetupPrimary} virtualModel={handoffAlias ?? undefined} routingConfig={withModel(handoffConfig ?? active, model)} integration={integration} auth={auth} model={model} intent={setupIntent} environment={setupEnvironment} onIntegrationChange={setIntegration} onAuthChange={setAuth} onModelChange={value => { setPlaygroundConfig(null); setPlaygroundAlias(null); setModel(value); setHandoffAlias(null); }} onIntentChange={setSetupIntent} onEnvironmentChange={setSetupEnvironment} renderCode={(code, label) => <CodeBlock code={code} label={label} />} onDemo={() => { setPlaygroundConfig(withModel(handoffConfig ?? active, model)); setPlaygroundAlias(handoffAlias); navigate('playground'); setScenario('healthy'); runRequest(withModel(handoffConfig ?? active, model), false, 'healthy', prompt, prompt === DISCOVERY_PROMPT ? DISCOVERY_RESPONSE : undefined, handoffAlias ?? undefined); }} /></> : null;

    return <EvolvingWorkspace stage={stage} onStageChange={changeWorkingStage} title={workspaceTitle} modelLabel={contextModel} alias={contextAlias} status={busy ? displayPhase === 'routing' ? 'Routing request' : 'Response started' : pending ? `Revision ${pending.revision} awaiting activation` : stage === 'connect' ? handoffConfig && !sameConfig(handoffConfig, active) ? 'Prepared from your route draft' : 'Connection draft' : `Active demo route · r${active.revision}`} busy={busy || comparing} primaryAction={stage === 'try' ? null : primaryAction} request={request} route={route} routeToolbar={routeToolbar} observatory={observatory} inspector={inspector} comparison={comparison} showComparison={stage === 'shape' && routeTab === 'comparison'} connect={connect} observe={renderMonitor(true)} source={source} onInspectSource={() => source && openRequest(source)} onResetSource={sourceRequest ? () => { setSourceRequest(null); setRehearsal(null); setBaselineResult(null); setDraftResult(null); setComparisonFixture(null); setTestedDraft(null); setRouteTab('route'); } : undefined} guidance={stage === 'observe' ? renderTour() : null} requestCount={requests.length} />;
  }

  function navigateWorkspacePage(next: View, event: MouseEvent<HTMLAnchorElement>) {
    const stages: Partial<Record<View, WorkspaceStage>> = { playground: 'try', routes: 'shape', connect: 'connect', monitor: 'observe' };
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (stages[next] && stages[view]) { event.preventDefault(); changeWorkingStage(stages[next]!); }
    else navigate(next, event);
  }

  function renderWorkspace() {
    if (['connect','playground','routes','monitor'].includes(view)) return renderWorkingExperience();
    if (view === 'models' || view === 'virtual-models' || view === 'leaderboards' || view === 'documentation') return <ModelWorkspace onContextChange={reviewMode ? onReviewerLocationChange : undefined} view={view} models={virtualModels} selectedModel={model} onSelectModel={selectCatalogModel} onOpenVirtualModel={openVirtualModel} onCreateVirtualModel={addVirtualModel} onUseVirtualModel={useVirtualModel} onNavigate={next => { navigate(next); if (next === 'virtual-models' && createdAlias.current) window.history.replaceState({}, '', reviewUrl(`/virtual-models?alias=${encodeURIComponent(createdAlias.current)}${tour ? '&tour=1' : ''}`)); createdAlias.current = null; }} />;
    return <OperationsWorkspace view={view as 'dashboard' | 'budgets' | 'keys' | 'byok' | 'settings'} requests={requests} active={active} state={workspace} onChange={setWorkspace} onNavigate={navigate} onInspect={openRequest} onFilterLogs={filterLogs} onScenario={next => { resetRunDisplay(); selectScenario(next); navigate('playground'); }} />;
  }

  const investigationRecord = journeyOrigin ? requests.find(record => record.id === journeyOrigin.requestId) : null;
  const chapter = reviewerChapter(reviewProgress.chapter)!;
  const primaryChapterView = chapter.route === pathFor(view);
  const reviewCanPrepare = chapter.id === 'trust' ? !result : chapter.id === 'control' ? !sourceRequest : chapter.id === 'adopt' ? !handoffConfig && !sourceRequest : false;
  function prepareReviewerExample() {
    const example = requests.find(record => record.status === (chapter.id === 'trust' ? 'success' : 'recovered') && record.configSnapshot);
    if (!example) { toast('No prepared receipt is available. Run a request to create one.'); return; }
    setReviewPreparedChapter(chapter.id);
    if (chapter.id === 'control') testAdjustment(example);
    else if (chapter.id === 'trust') { setResult(example); setOutput(example.response); setPhase('complete'); setShownAttempts(example.attempts.length); setModel(example.model); setScenario('healthy'); }
    else { const config = clone(example.configSnapshot!); setHandoffConfig(config); setSourceRequest(clone(example)); setPrompt(example.prompt ?? DISCOVERY_PROMPT); setModel(config.model); }
  }
  function startReviewerChapter(id: ReviewerChapterId) {
    const next = reviewerChapter(id)!;
    reviewChapterRef.current = id;
    markReviewer({ type:'visited', chapter:id }); setReviewThinking(false); setReviewPage(false);
    if (id === 'control' && result?.status === 'recovered' && result.configSnapshot) testAdjustment(result);
    else if (id === 'adopt') { const config = sourceRequest || draftResult || dirty ? draft : handoffConfig ?? playgroundRoute; setHandoffConfig(clone(config)); setModel(config.model); setHandoffAlias(null); setSetupIssue(null); navigate('connect'); }
    else navigate((next.route.slice(1) || 'overview') as View);
    window.scrollTo({top:0,behavior:'instant'});
    requestAnimationFrame(() => document.querySelector<HTMLElement>('#main h1')?.focus({preventScroll:true}));
  }
  function reviewerMap() {
    if (busy) cancelRun(); if (comparing) { clearRun(); setComparing(false); }
    setReviewResumePath(reviewerHref(window.location.pathname + window.location.search, reviewProgress.chapter));
    setReviewPage(true); setSelectedRequest(null); window.history.pushState({}, '', '/review#chapters');
    requestAnimationFrame(() => { document.getElementById('chapters')?.scrollIntoView({block:'start'}); document.getElementById('rw-map-title')?.focus({preventScroll:true}); });
  }
  function resumeReviewer() {
    setReviewPage(false); window.history.pushState({}, '', reviewerHref(reviewResumePath, reviewProgress.chapter));
    window.dispatchEvent(new PopStateEvent('popstate')); window.scrollTo({top:0,behavior:'instant'});
  }
  function restartReviewer() { resetDemo(); setReviewProgress(initialReviewerProgress()); setReviewThinking(false); setReviewPreparedChapter(null); setReviewResumePath('/?review=understand'); setReviewPage(true); window.history.replaceState({}, '', '/review'); window.scrollTo({top:0,behavior:'instant'}); }
  function continueReviewer(skip = false) {
    if (skip) markReviewer({type:'skipped',chapter:chapter.id});
    const next = REVIEW_CHAPTERS[REVIEW_CHAPTERS.findIndex(item => item.id === chapter.id) + 1];
    if (next) startReviewerChapter(next.id);
    else { markReviewer({type:'finished'}); setReviewPage(true); setSelectedRequest(null); window.history.pushState({}, '', '/review'); window.scrollTo({top:0,behavior:'instant'}); }
  }
  function showReviewerThinking() { setReviewThinking(true); requestAnimationFrame(() => { const target=document.getElementById('reviewer-reflection'); target?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}); target?.focus({preventScroll:true}); }); }
  useEffect(() => {
    if (!loaded || !reviewMode || reviewPage) return;
    markReviewer({type:'visited',chapter:reviewProgress.chapter}); markReviewer({type:'destination',view});
    setReviewResumePath(reviewerHref(window.location.pathname+window.location.search,reviewProgress.chapter));
  }, [loaded, reviewMode, reviewPage, reviewProgress.chapter, view, reviewLocationVersion, selectedRequest, routeTab, filter, statusFilter, authFilter, hourFilter, markReviewer]);
  useEffect(() => { if (reviewExit) window.location.assign(reviewExit); }, [reviewExit]);
  function exitReviewer() {
    if (busy) cancelRun();
    let destination = pathFor(view);
    try {
      const origin = sessionStorage.getItem('gateway-review-exit-origin');
      if (origin) { const url = new URL(origin, window.location.origin); if (url.origin === window.location.origin && (url.pathname === '/' || url.pathname.slice(1) in VIEW_NAMES)) { url.searchParams.delete('review'); destination = url.pathname + url.search + url.hash; } }
    } catch { /* Exit remains available without storage. */ }
    setReviewExit(destination);
  }
  const reviewerReflection = reviewMode ? <ReviewerReflection chapter={chapter} demonstrated={reviewProgress.demonstrated.includes(chapter.id)} expanded={reviewThinking} onToggle={() => setReviewThinking(previous => !previous)} onContinue={() => continueReviewer()} onSkip={() => continueReviewer(true)} finished={reviewProgress.finished} /> : null;
  if (reviewMode && reviewPage) return <div className="app review-app" data-demo-ready={loaded} data-review-mode="true"><a className="skip-link" href="#main">Skip to content</a><main id="main"><ReviewEntry progress={reviewProgress} onStart={startReviewerChapter} onRestart={restartReviewer} onResume={resumeReviewer} onExit={exitReviewer} theme={theme} onThemeToggle={() => setTheme(theme==='light'?'dark':'light')} /></main></div>;

  return <div className={`app ${view === 'overview' ? 'public-app' : 'product-app'}`} data-demo-ready={loaded} data-review-mode={reviewMode} onClickCapture={event => {
    // Safari does not focus pointer-activated buttons. Capture a real opener
    // before a nested document hides its source, without scrolling that source.
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
    if (button && !button.disabled) button.focus({ preventScroll: true });
  }} onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && view === 'playground' && !modal && !selectedRequest) { event.preventDefault(); if (!busy) runRequest(playgroundRoute); } }}>
    <a href="#main" className="skip-link">Skip to content</a>{reviewMode ? <ReviewerHeader chapter={chapter} progress={reviewProgress} onMap={reviewerMap} onExit={exitReviewer} theme={theme} onThemeToggle={() => setTheme(theme === 'light' ? 'dark' : 'light')} onThinking={showReviewerThinking} /> : <header className="app-header"><a href="/" onClick={event => navigate('overview', event)} className="brand-link" aria-label="AI Gateway overview"><Logo /><span className="brand-slash">/</span>{view === 'overview' ? <strong>AI Gateway</strong> : <><span className="team-avatar">S</span><span className="team-name">{workspace.settings.name}</span></>}</a>{view === 'overview' ? <nav className="public-nav"><a href="/models" onClick={event => navigate('models', event)}>Models</a><a href="/leaderboards" onClick={event => navigate('leaderboards', event)}>Leaderboards</a><a href="/playground" onClick={event => navigate('playground', event)}>Playground</a><a href="https://vercel.com/docs/ai-gateway" target="_blank" rel="noreferrer">Documentation <ArrowUpRight size={12} /></a><a className="button primary small-button" href="/connect" onClick={event => navigate('connect', event)}>Get started</a></nav> : <div className="workspace-header-right"><span className="demo-label">Simulated workspace</span><button className="icon-button" aria-label="Reset demo" title="Reset demo" onClick={() => setModal('reset')}><RotateCcw size={15} /></button></div>}<button className="text-button concept-link" aria-label="About this independent concept" onClick={() => setModal('about')}>About</button><a className="text-button rw-entry-link" href="/review" onClick={() => { try { sessionStorage.setItem('gateway-review-exit-origin',window.location.pathname+window.location.search); } catch { /* Optional return context. */ } }}><span className="rw-entry-link-long">Explore the thinking</span><span className="rw-entry-link-short">Thinking</span></a><button className="icon-button theme-button" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}</button></header>}
    {reviewMode && <ReviewerMission chapter={chapter} supporting={!primaryChapterView} detail={loaded && view === 'models' && new URLSearchParams(window.location.search).has('model')} view={view} onReturn={() => startReviewerChapter(chapter.id)} onPrepare={prepareReviewerExample} canPrepare={reviewCanPrepare} prepared={reviewPreparedChapter === chapter.id} />}
    {view === 'overview' ? <main id="main"><div hidden={Boolean(selectedRequest)}>{renderOverview()}</div>{selectedRequest && <RequestDetailView requestId={selectedRequest.id} returnLabel="Home" onBack={closeRequest}>{renderRequestDetails(selectedRequest)}</RequestDetailView>}</main> : <div className="gateway-workspace-shell gateway-workspace-shell--continuous"><WorkspaceNavigation compact view={view} onNavigate={navigateWorkspacePage} /><main id="main"><div hidden={Boolean(selectedRequest)}>{journeyOrigin && <JourneyReturn origin={journeyOrigin} reason={investigationRecord ? getRequestGuidance(investigationRecord).title : undefined} description={investigationRecord ? getRequestGuidance(investigationRecord).description : undefined} onReturn={returnToInvestigation} />}{renderWorkspace()}</div>{selectedRequest && <RequestDetailView requestId={selectedRequest.id} returnLabel={view === 'dashboard' ? 'Overview' : view === 'monitor' ? 'Logs' : view === 'routes' ? 'Routing' : view === 'connect' ? 'Connect' : VIEW_NAMES[view]} onBack={closeRequest}>{renderRequestDetails(selectedRequest)}</RequestDetailView>}</main></div>}{reviewMode && (view !== 'overview' || selectedRequest) && reviewerReflection}<footer className="app-footer"><span><Logo small />An independent concept by Sean Lynch</span><span>Built around Vercel AI Gateway<span className="footer-dot">·</span><a href="https://vercel.com/ai-gateway" target="_blank" rel="noreferrer">Current product <ArrowUpRight size={11} /></a></span></footer>
    {notice && <div className="toast" role="status"><Check size={15} />{notice}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={13} /></button></div>}
    {modal === 'save' && <Overlay title="Review your route" onClose={() => setModal(null)}><div className="modal-body"><p>Save a new demo revision for <code>vmc/{draft.slug}</code>. It stays pending until you simulate activation.</p><div className="config-comparison"><div><span className="field-label">Active · r{active.revision}</span><strong>{modelName(active.model)}</strong><p>{active.order.map(id => PROVIDER_NAMES[id]).join(' → ')}</p><span>{active.only.length ? `Only: ${active.only.map(id => PROVIDER_NAMES[id]).join(', ')}` : 'All providers eligible'}</span></div><ArrowRight size={18} /><div><span className="field-label">New revision</span><strong>{modelName(draft.model)}</strong><p>{draft.order.map(id => PROVIDER_NAMES[id]).join(' → ')}</p><span>{draft.only.length ? `Only: ${draft.only.map(id => PROVIDER_NAMES[id]).join(', ')}` : 'All providers eligible'}</span></div></div><CodeBlock code={routingCode(draft)} label="New routing configuration" /><p className="scope-note"><Info size={14} /><span>{draftTestCurrent ? 'This draft was compared with its baseline under the same fixed provider conditions.' : 'This draft has not been tested since its last change.'}</span></p><div className="modal-actions"><button className="button secondary" onClick={() => setModal(null)}>Keep editing</button><button className="button primary" onClick={saveDraft}>Save demo revision <Check size={15} /></button></div></div></Overlay>}
    {modal === 'budget' && <Overlay title="Understand budget coverage" onClose={() => setModal(null)}><div className="modal-body"><p>Every applicable budget must pass. Gateway budgets are soft caps checked when a request starts; concurrent requests can overshoot a cap.</p><div className="coverage-list"><div><Check size={17} /><span><strong>Project OIDC traffic</strong><small>Counts against the team and project budgets.</small></span></div><div><Info size={17} /><span><strong>API-key traffic</strong><small>Counts against the team and key budgets, plus a member budget when attributed to that team member. Project budgets do not apply.</small></span></div><div><Info size={17} /><span><strong>Bring your own provider key</strong><small>Provider charges fall outside Gateway budget coverage.</small></span></div></div><p className="scope-note"><AlertCircle size={15} /><span>A failed BYOK request may fall back to a system key and use Gateway credits. Configure restrictions when required.</span></p><div className="budget-demo"><span className="field-label">Try it in the workspace</span><p>See a simulated 402 response and its request receipt.</p><button className="button primary" onClick={() => { setModal(null); navigate('playground'); setScenario('budget'); }}>Explore budget failure <ArrowRight size={14} /></button></div><a className="text-button" href="https://vercel.com/docs/ai-gateway/observability-and-spend/budgets" target="_blank" rel="noreferrer">Budget documentation <ExternalLink size={13} /></a></div></Overlay>}
    {modal === 'about' && <Overlay title="An experience by Sean Lynch" onClose={() => setModal(null)}><div className="modal-body concept-about"><span className="eyebrow">AI Gateway / Independent concept</span><h3>From your first request to<br />a system you understand.</h3><p>I explored how AI Gateway could carry one clear context through setup, experimentation, routing, and monitoring. The craft is in the connections between these capabilities.</p><div className="concept-moments"><div><span className="mono">01</span><span><strong>Make the first success inspectable.</strong><small>A response becomes a receipt with a model, provider, usage, and route.</small></span></div><div><span className="mono">02</span><span><strong>Make resilience visible.</strong><small>A deliberate failure reveals how provider and model fallbacks work.</small></span></div><div><span className="mono">03</span><span><strong>Make a signal actionable.</strong><small>A chart leads to its requests, an exact demo snapshot, and a testable adjustment.</small></span></div></div><details className="reviewer-notes"><summary>Design reasoning</summary><DesignNotes topic="recovery" context="Request observatory" /><DesignNotes topic="routing" /></details><p className="concept-provenance">Grounded in Vercel's public product and documentation, using Geist typography and interface conventions. Requests, responses, metrics, and configuration activation are simulated. The setup snippets follow documented server interfaces. This work has not been validated with user research or production traffic.</p><div className="modal-actions"><a className="text-button" href="https://vercel.com/docs/ai-gateway" target="_blank" rel="noreferrer">Product documentation <ExternalLink size={12} /></a><button className="button primary" onClick={startTour}>Explore the concept <ArrowRight size={14} /></button></div></div></Overlay>}
    {modal === 'models' && <Overlay title="Choose a model" onClose={() => setModal(null)}><div className="modal-body"><p>A curated snapshot for this demo. Prices are base input / output rates per one million tokens, before context tiers, caching, or add-on charges.</p><div className="model-catalog">{MODELS.map(item => <button key={item.id} className={item.id === model ? 'selected' : ''} onClick={() => { resetRunDisplay(); setModel(item.id); setPlaygroundAlias(null); setPlaygroundConfig(null); setModal(null); }}><div><span className="model-creator">{item.creator}</span><strong>{item.name}</strong><p>{item.description}</p></div><div><span className="mono">${item.inputPrice} / ${item.outputPrice}</span><small>{item.context} context</small>{item.id === model ? <Check size={17} /> : <ArrowRight size={17} />}</div></button>)}</div><div className="catalog-footer"><span>Snapshot · Oct 4, 2026</span><a className="text-button" href="https://vercel.com/ai-gateway/models" target="_blank" rel="noreferrer">Full model catalog <ExternalLink size={13} /></a></div></div></Overlay>}
    {modal === 'reset' && <Overlay title="Reset this demo?" onClose={() => setModal(null)}><div className="modal-body"><p>This removes your local demo requests and revisions, then restores the original sample dataset.</p><div className="modal-actions"><button className="button secondary" onClick={() => setModal(null)}>Keep exploring</button><button className="button primary" onClick={resetDemo}><RotateCcw size={14} />Reset demo</button></div></div></Overlay>}
  </div>;
}

function PageHeading({ title, description, right }: { title: string; description: string; right?: ReactNode }) { return <div className="page-heading"><div><h1 tabIndex={-1}>{title}</h1><p>{description}</p></div>{right && <div className="page-heading-right">{right}</div>}</div>; }
function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>; }


function moveTabFocus<T extends string>(event: ReactKeyboardEvent<HTMLButtonElement>, values: T[], value: T, onChange: (next: T) => void, prefix: string) {
  if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
  event.preventDefault();
  const index = values.indexOf(value);
  const next = event.key === 'Home' ? values[0] : event.key === 'End' ? values.at(-1)! : values[(index + (event.key === 'ArrowRight' ? 1 : -1) + values.length) % values.length];
  onChange(next); document.getElementById(`${prefix}-${next}`)?.focus();
}
