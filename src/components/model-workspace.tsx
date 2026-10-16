'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, Check, ChevronDown, Copy, Plus, Search, X, Code2, Terminal, Braces, KeyRound, Route, Activity } from 'lucide-react';
import { CATALOG_DATE, CATALOG_SOURCES, MODELS as CATALOG_MODELS, PROVIDER_NAMES, type ProviderId, type RoutingConfig } from '@/lib/gateway';
import { JourneyNext } from './journey-next';
import { pageGuidance } from '@/lib/action-guidance';
import './model-workspace.css';
import { isVirtualModelAlias } from '@/lib/virtual-models';
import type { Integration } from '@/lib/setup';
import { landingCode } from './landing-integration';

export interface ModelWorkspaceProps {
  view: 'models' | 'virtual-models' | 'leaderboards' | 'documentation';
  models: RoutingConfig[];
  selectedModel: string;
  onContextChange?: () => void;
  onSelectModel: (id: string, destination: 'connect' | 'playground' | 'routes', client?: Integration) => void;
  onOpenVirtualModel: (config: RoutingConfig) => void;
  onCreateVirtualModel: (name: string, model: string) => string | null;
  onUseVirtualModel: (config: RoutingConfig, destination: 'connect' | 'playground') => void;
  onNavigate: (view: 'connect' | 'playground' | 'routes' | 'monitor' | 'models' | 'virtual-models') => void;
}

const DOCS = 'https://vercel.com/docs/ai-gateway';
const SNAPSHOT_LABEL = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${CATALOG_DATE}T12:00:00Z`));
const formatNumber = new Intl.NumberFormat('en-US');
const formatRate = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2, minimumFractionDigits: 0 });
const formatEstimate = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 6, minimumFractionDigits: 4 });
const SDK_GUIDES = [
  {
    id: 'ai-sdk', label: 'AI SDK', title: 'One model string. A familiar request.',
    description: 'For a TypeScript app, pass a creator/model string to AI SDK generation functions. Gateway is the default provider; your request can stay the same as you change models.',
    endpoint: 'Default provider in AI SDK', request: 'generateText({ model, prompt })',
    href: `${DOCS}/sdks-and-apis/ai-sdk`,
  },
  {
    id: 'openai', label: 'OpenAI SDK', title: 'Keep your client. Change the endpoint.',
    description: 'Use the OpenAI-compatible Chat Completions API with a Gateway base URL and Gateway credentials. Pick a supported model using its full creator/model identifier.',
    endpoint: 'https://ai-gateway.vercel.sh/v1', request: 'client.chat.completions.create({ model, messages })',
    href: `${DOCS}/sdks-and-apis/openai-chat-completions`,
  },
  {
    id: 'anthropic', label: 'Anthropic SDK', title: 'Use the Messages API through Gateway.',
    description: 'Point an Anthropic client at Gateway and authenticate with Gateway credentials. The Messages API compatibility path supports streaming and model selection through the same endpoint.',
    endpoint: 'https://ai-gateway.vercel.sh', request: 'client.messages.create({ model, messages, max_tokens })',
    href: `${DOCS}/sdks-and-apis/anthropic-messages-api`,
  },
] as const;

const LEADERBOARD_VIEWS = [
  { id: 'models', title: 'Models', description: 'Token volume, requests, and spend by model.' },
  { id: 'labs', title: 'Labs', description: 'Gateway usage by the creators of the models.' },
  { id: 'apps', title: 'Apps', description: 'Attributed usage from opted-in applications.' },
  { id: 'providers', title: 'Providers', description: 'Serving-provider usage by tokens or spend.' },
] as const;

const REFERENCE_TASKS = [
  { id: 'request', label: 'Make a first request', icon: Terminal },
  { id: 'authentication', label: 'Authenticate your app', icon: KeyRound },
  { id: 'routing', label: 'Shape a route', icon: Route },
  { id: 'observability', label: 'Inspect a request', icon: Activity },
] as const;

function SourceLink({ href, children, className = '' }: { href: string; children: ReactNode; className?: string }) {
  return <a className={`mw-source-link ${className}`} href={href} target="_blank" rel="noreferrer">{children}<ArrowUpRight size={14} aria-hidden="true" /><span className="mw-sr-only"> (opens in a new tab)</span></a>;
}

function modelName(id: string) { return CATALOG_MODELS.find(model => model.id === id)?.name ?? id; }
function modelSource(id: string) {
  const index = CATALOG_MODELS.findIndex(model => model.id === id);
  return CATALOG_SOURCES[index] ?? 'https://vercel.com/ai-gateway/models';
}

function ServerCode({ code, label = 'request.ts' }: { code: string; label?: string }) {
  const [copyResult, setCopyResult] = useState<{ code: string; status: 'copied' | 'unavailable' } | null>(null);
  const copyState = copyResult?.code === code ? copyResult.status : 'idle';
  async function copy() {
    try { await navigator.clipboard.writeText(code); setCopyResult({ code, status: 'copied' }); }
    catch { setCopyResult({ code, status: 'unavailable' }); }
  }
  return <div className="mw-server-code">
    <div className="mw-code-toolbar"><span><Code2 size={15} aria-hidden="true" />{label}</span><button type="button" className="mw-code-copy" aria-label="Copy server-side example" onClick={() => void copy()}>{copyState === 'copied' ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}<span>{copyState === 'copied' ? 'Copied' : 'Copy'}</span></button></div>
    <pre className="mw-code-preview" tabIndex={0} aria-label="Server-side code example"><code>{code.split('\n').map((line, index) => <span className="mw-code-line" key={index}>{line.split(/('[^']*')/g).map((part, partIndex) => <span className={part.startsWith("'") ? 'mw-code-string' : undefined} key={partIndex}>{part}</span>)}{'\n'}</span>)}</code></pre>
    {copyState !== 'idle' && <p className="mw-code-feedback" role="status">{copyState === 'copied' ? 'Server-side example copied.' : 'Clipboard access is unavailable. Select and copy the code above.'}</p>}
  </div>;
}

function ModelConnection({ id, providers }: { id: string; providers: readonly ProviderId[] }) {
  return <div className="mw-model-connection" aria-label={`Your app connects through Gateway to ${modelName(id)}; candidate serving providers are ${providers.map(provider => PROVIDER_NAMES[provider]).join(', ')}`}>
    <div className="mw-connection-origin"><Terminal size={18} aria-hidden="true" /><span>Your app</span><span className="mw-connection-rule" aria-hidden="true" /><span className="mw-gateway-node"><Route size={17} aria-hidden="true" />Gateway</span></div>
    <div className="mw-connection-model"><span className="mw-node-label">Model</span><strong>{modelName(id)}</strong><code>{id}</code></div>
    <div className="mw-connection-providers"><span className="mw-node-label">Candidate serving providers</span><ul>{providers.map(provider => <li key={provider}><span aria-hidden="true" />{PROVIDER_NAMES[provider]}</li>)}</ul></div>
    <span className="mw-preview-caption">Availability depends on provider eligibility.</span>
  </div>;
}

export function ModelWorkspace({ view, models, selectedModel, onSelectModel, onOpenVirtualModel, onCreateVirtualModel, onUseVirtualModel, onNavigate, onContextChange }: ModelWorkspaceProps) {
  const instanceId = useId();
  const [query, setQuery] = useState('');
  const [creator, setCreator] = useState('all');
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [virtualQuery, setVirtualQuery] = useState('');
  const [expandedVirtualModel, setExpandedVirtualModel] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newSlug, setNewSlug] = useState('');
  const [newModel, setNewModel] = useState(CATALOG_MODELS[0].id);
  const [createError, setCreateError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [inputTokens, setInputTokens] = useState(2000);
  const [outputTokens, setOutputTokens] = useState(500);
  const [sdk, setSdk] = useState(0);
  const [modelPreview, setModelPreview] = useState<'request' | 'code'>('request');
  const [virtualPreview, setVirtualPreview] = useState<'route' | 'code'>('route');
  const [leaderboardTab, setLeaderboardTab] = useState<'official' | 'estimate'>('official');
  const [referenceTask, setReferenceTask] = useState<(typeof REFERENCE_TASKS)[number]['id']>('request');
  const referenceContinuation = pageGuidance('documentation', { referenceTask, selectedModel });
  const slugInput = useRef<HTMLInputElement>(null);
  const createTrigger = useRef<HTMLButtonElement | null>(null);
  const sdkTabs = useRef<(HTMLButtonElement | null)[]>([]);
  const boardTabs = useRef<(HTMLButtonElement | null)[]>([]);
  const previewTabs = useRef<(HTMLButtonElement | null)[]>([]);
  const virtualTabs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    function readDetail() {
      const query = new URLSearchParams(window.location.search);
      const id = query.get('model'); const alias = query.get('alias');
      if (view === 'models') setExpandedModel(CATALOG_MODELS.some(model => model.id === id) ? id : null);
      if (view === 'virtual-models') setExpandedVirtualModel(isVirtualModelAlias(`vmc/${alias}`) ? alias : null);
    }
    readDetail(); window.addEventListener('popstate', readDetail);
    return () => window.removeEventListener('popstate', readDetail);
  }, [view]);

  function selectDetail(kind: 'model' | 'alias', value: string | null) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(kind, value); else url.searchParams.delete(kind);
    window.history.pushState({}, '', url.pathname + url.search);
    onContextChange?.();
    if (kind === 'model') setExpandedModel(value); else setExpandedVirtualModel(value);
  }

  useEffect(() => { if (creating) slugInput.current?.focus(); }, [creating]);
  useEffect(() => { setCreating(false); setCreateError(null); setCopyError(null); }, [view]);

  function startCreate(trigger: HTMLButtonElement, id = selectedModel) {
    createTrigger.current = trigger;
    setNewSlug(''); setNewModel(CATALOG_MODELS.some(model => model.id === id) ? id : CATALOG_MODELS[0].id);
    setCreateError(null); setNotice(''); setCreating(true);
  }

  function cancelCreate() {
    setCreating(false); setCreateError(null);
    requestAnimationFrame(() => createTrigger.current?.focus());
  }

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const slug = newSlug.trim();
    const error = onCreateVirtualModel(slug, newModel);
    if (error) { setCreateError(error); slugInput.current?.focus(); return; }
    setCreating(false); setCreateError(null); setVirtualQuery(''); setExpandedVirtualModel(slug);
    if (view === 'virtual-models') selectDetail('alias', slug);
    setNotice(`vmc/${slug} created in this demo. Your model identifier stays the same when you edit its route.`);
    if (view !== 'virtual-models') onNavigate('virtual-models');
  }

  async function copyIdentifier(slug: string) {
    setCopyError(null); setCopiedSlug(null);
    try { await navigator.clipboard.writeText(`vmc/${slug}`); setCopiedSlug(slug); }
    catch { setCopyError(slug); }
  }

  function onSdkKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number | undefined;
    if (event.key === 'ArrowRight') next = (index + 1) % SDK_GUIDES.length;
    if (event.key === 'ArrowLeft') next = (index + SDK_GUIDES.length - 1) % SDK_GUIDES.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = SDK_GUIDES.length - 1;
    if (next !== undefined) { event.preventDefault(); setSdk(next); sdkTabs.current[next]?.focus(); }
  }

  const normalizedQuery = query.trim().toLowerCase();
  const visibleModels = CATALOG_MODELS.filter(model => (creator === 'all' || model.creator === creator) && `${model.name} ${model.id} ${model.creator} ${model.description}`.toLowerCase().includes(normalizedQuery));
  const normalizedVirtualQuery = virtualQuery.trim().toLowerCase();
  const visibleVirtualModels = models.filter(config => `${config.slug} vmc/${config.slug} ${config.model} ${modelName(config.model)} ${config.tags.join(' ')}`.toLowerCase().includes(normalizedVirtualQuery));
  const estimates = CATALOG_MODELS.map(model => ({ model, input: inputTokens * model.inputPrice / 1_000_000, output: outputTokens * model.outputPrice / 1_000_000 }));
  const largestEstimate = Math.max(...estimates.map(estimate => estimate.input + estimate.output), 0);
  const guide = SDK_GUIDES[sdk];
  const selectedClient: Integration = guide.id === 'ai-sdk' ? 'sdk' : guide.id;

  function onPairTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number, onChange: (index: number) => void, refs: (HTMLButtonElement | null)[]) {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
    onChange(next); refs[next]?.focus();
  }

  const createForm = creating && (view === 'models' || view === 'virtual-models') && <section className="mw-create-plane" aria-labelledby={`${instanceId}-create-title`}>
    <div className="mw-plane-heading"><div><span className="mw-kicker">A stable name for your application</span><h2 id={`${instanceId}-create-title`}>Create a Virtual Model</h2></div><button type="button" className="mw-icon-button" aria-label="Cancel creating Virtual Model" onClick={cancelCreate}><X size={18} aria-hidden="true" /></button></div>
    <form onSubmit={submitCreate} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); cancelCreate(); } }}>
      <div className="mw-create-fields">
        <div><label htmlFor={`${instanceId}-slug`}>Slug</label><div className="mw-prefix-field"><span aria-hidden="true">vmc/</span><input ref={slugInput} id={`${instanceId}-slug`} aria-describedby={`${instanceId}-slug-help${createError ? ` ${instanceId}-create-error` : ''}`} aria-invalid={!!createError} value={newSlug} onChange={event => { setNewSlug(event.target.value); setCreateError(null); }} placeholder="my-support-agent" maxLength={64} autoComplete="off" spellCheck={false} required /></div><p className="mw-field-help" id={`${instanceId}-slug-help`}>Lowercase letters, numbers, and hyphens. The slug cannot be changed after creation.</p></div>
        <div><label htmlFor={`${instanceId}-new-model`}>Underlying model</label><select id={`${instanceId}-new-model`} value={newModel} onChange={event => setNewModel(event.target.value)}>{CATALOG_MODELS.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}</select><p className="mw-field-help">Change the model and routing later, without changing the alias.</p></div>
      </div>
      {createError && <p className="mw-error" id={`${instanceId}-create-error`} role="alert">{createError}</p>}
      <div className="mw-create-footer"><p>Saved in this browser’s demo. A real alias must be created in your Vercel team.</p><div className="mw-actions"><button className="mw-button mw-secondary" type="button" onClick={cancelCreate}>Cancel</button><button className="mw-button mw-primary" type="submit">Create Virtual Model<ArrowRight size={16} aria-hidden="true" /></button></div></div>
    </form>
  </section>;

  if (view === 'models') return <div className="workspace-page model-workspace mw-models">
    <header className="mw-heading"><div><h1 tabIndex={-1}>Models</h1><p>Find the right model for your next request.</p></div><SourceLink href="https://vercel.com/ai-gateway/models">Full Vercel catalog</SourceLink></header>
    {createForm}
    <section className="mw-model-list" aria-label="Curated model catalog">
      <div className="mw-list-toolbar"><label className="mw-search"><Search size={16} aria-hidden="true" /><input aria-label="Search models" type="search" placeholder="Search models" value={query} onChange={event => setQuery(event.target.value)} /></label><div className="mw-filter"><label htmlFor={`${instanceId}-creator`}>Creator</label><select id={`${instanceId}-creator`} value={creator} onChange={event => setCreator(event.target.value)}><option value="all">All creators</option><option value="Anthropic">Anthropic</option><option value="OpenAI">OpenAI</option></select></div></div>
      <div className="mw-list-caption"><span role="status">{visibleModels.length} of {CATALOG_MODELS.length} text models</span><span>Snapshot · {SNAPSHOT_LABEL}</span></div>
      <div className="mw-catalog-columns" aria-hidden="true"><span>Model</span><span>Input / Output per 1M</span><span>Context</span><span /></div>
      <ul className="mw-flat-list">
        {visibleModels.map(model => {
          const expanded = expandedModel === model.id;
          const detailId = `${instanceId}-${model.id.replaceAll('/', '-')}-detail`;
          return <li key={model.id} className={expanded ? 'mw-expanded' : ''}>
            <button type="button" className="mw-model-row" aria-label={`${model.name} details`} aria-expanded={expanded} aria-controls={detailId} onClick={() => selectDetail('model', expanded ? null : model.id)}>
              <span className="mw-model-identity"><span className="mw-model-mark" aria-hidden="true">{model.creator === 'Anthropic' ? 'A' : <Braces size={22} />}</span><span><span className="mw-model-title">{model.name}{selectedModel === model.id && <span className="mw-selected-label">Selected</span>}</span><span className="mw-model-description">{model.description}</span></span></span>
              <span className="mw-price-cell"><span className="mw-cell-label">Input / Output per 1M</span><span>{formatRate.format(model.inputPrice)} <span className="mw-rate-divider">/</span> {formatRate.format(model.outputPrice)}</span></span><span className="mw-context-cell"><span className="mw-cell-label">Context</span><span>{model.context}</span></span><ChevronDown className="mw-row-chevron" size={17} aria-hidden="true" />
            </button>
            {expanded && <section className="mw-model-detail" id={detailId} aria-label={`${model.name} information`}>
              <div className="mw-model-instrument">
                <div className="mw-request-preview"><div className="mw-preview-tabs" role="tablist" aria-label={`${model.name} preview`}>{(['request', 'code'] as const).map((tab, index) => <button key={tab} ref={element => { previewTabs.current[index] = element; }} id={`${detailId}-${tab}-tab`} role="tab" type="button" aria-selected={modelPreview === tab} aria-controls={`${detailId}-preview`} tabIndex={modelPreview === tab ? 0 : -1} onClick={() => setModelPreview(tab)} onKeyDown={event => onPairTabKeyDown(event, index, next => setModelPreview(next === 0 ? 'request' : 'code'), previewTabs.current)}>{tab === 'request' ? <Terminal size={14} aria-hidden="true" /> : <Code2 size={14} aria-hidden="true" />}{tab === 'request' ? 'Request' : 'Code'}</button>)}</div>
                  <div className="mw-preview-body" role="tabpanel" id={`${detailId}-preview`} aria-labelledby={`${detailId}-${modelPreview}-tab`} tabIndex={0}>{modelPreview === 'request' ? <><span className="mw-node-label">Example prompt</span><p className="mw-example-prompt">What should we build next?</p><div className="mw-request-model"><span className="mw-node-label">Selected model</span><code>{model.id}</code></div></> : <><ServerCode code={landingCode(model.id, 'sdk')} /><span className="mw-preview-caption mw-code-caption">Server-side AI SDK example. Gateway credentials are required in your app.</span></>}</div>
                </div>
                <aside className="mw-provider-rail" aria-label={`${model.name} connection`}><ModelConnection id={model.id} providers={model.providers} /><details className="mw-disclosure"><summary>Models, providers, and availability</summary><p>The model generates the answer; a provider serves it. Candidates are an unordered pool, not a live health signal. Use the official catalog for current availability.</p><SourceLink href={modelSource(model.id)}>Model details</SourceLink></details></aside>
              </div>
              <JourneyNext primary guidance={{ ...pageGuidance('models', { selectedModel: model.id })!, label: 'Try model' }} onAction={guidance => onSelectModel(guidance.target!.model!, 'playground')} /><div className="mw-detail-actions"><button className="mw-button mw-secondary" type="button" onClick={() => onSelectModel(model.id, 'connect')}>Connect this model</button><details className="mw-model-more"><summary>More actions<ChevronDown size={14} aria-hidden="true" /></summary><div><button className="mw-text-button" type="button" onClick={() => onSelectModel(model.id, 'routes')}>Configure routing<ArrowRight size={14} aria-hidden="true" /></button><button className="mw-text-button" type="button" onClick={event => startCreate(event.currentTarget, model.id)}>Create Virtual Model<Plus size={14} aria-hidden="true" /></button></div></details></div>
            </section>}
          </li>;
        })}
      </ul>
      {!visibleModels.length && <div className="mw-empty"><h2>No models match your search.</h2><p>Try a model name, creator, or a phrase such as “coding”.</p><button className="mw-button mw-secondary" type="button" onClick={() => { setQuery(''); setCreator('all'); }}>Clear filters</button></div>}
    </section>
    <footer className="mw-view-footer"><p>Curated demo snapshot. Base USD token rates exclude context tiers, caching, tools, and platform add-ons.</p><button className="mw-text-button" type="button" onClick={() => onNavigate('virtual-models')}>Explore Virtual Models<ArrowRight size={14} aria-hidden="true" /></button></footer>
  </div>;

  if (view === 'virtual-models') return <div className="workspace-page model-workspace mw-virtual-models">
    <header className="mw-heading"><div><h1 tabIndex={-1}>Virtual Models</h1><p>A stable name for a route you can keep improving.</p></div><button className="mw-button mw-primary" type="button" onClick={event => startCreate(event.currentTarget)}><Plus size={16} aria-hidden="true" />Create Virtual Model</button></header>
    {notice && <div className="mw-notice" role="status"><Check size={16} aria-hidden="true" /><span>{notice}</span><button className="mw-icon-button" type="button" aria-label="Dismiss creation confirmation" onClick={() => setNotice('')}><X size={15} aria-hidden="true" /></button></div>}
    {createForm}
    <section className="mw-virtual-list" aria-label="Saved demo Virtual Models">
      <div className="mw-list-toolbar"><label className="mw-search"><Search size={16} aria-hidden="true" /><input aria-label="Search Virtual Models" type="search" placeholder="Search names, models, or tags" value={virtualQuery} onChange={event => setVirtualQuery(event.target.value)} /></label><span className="mw-local-caption">Saved in this demo</span></div>
      <div className="mw-list-caption"><span role="status">{visibleVirtualModels.length} {visibleVirtualModels.length === 1 ? 'Virtual Model' : 'Virtual Models'}</span><SourceLink href={`${DOCS}/models-and-providers/virtual-models`}>Virtual Model documentation</SourceLink></div>
      <ul className="mw-flat-list">
        {visibleVirtualModels.map(config => {
          const expanded = expandedVirtualModel === config.slug;
          const detailId = `${instanceId}-${config.slug}-virtual-detail`;
          const available = CATALOG_MODELS.find(model => model.id === config.model)?.providers ?? [];
          const allowed = available.filter(provider => !config.only.length || config.only.includes(provider));
          const preferred = config.order.filter(provider => allowed.includes(provider));
          const automatic = allowed.filter(provider => !preferred.includes(provider));
          const excluded = available.filter(provider => !allowed.includes(provider));
          return <li key={config.slug} className={expanded ? 'mw-expanded' : ''}>
            <button type="button" className="mw-virtual-row" aria-label={`vmc/${config.slug} details`} aria-expanded={expanded} aria-controls={detailId} onClick={() => { selectDetail('alias', expanded ? null : config.slug); setCopyError(null); }}><span className="mw-virtual-identity"><code>vmc/{config.slug}</code><span>{modelName(config.model)}</span></span><span className="mw-virtual-summary"><span>Revision {config.revision}</span><span>{config.fallbacks.length} {config.fallbacks.length === 1 ? 'fallback' : 'fallbacks'}</span></span><ChevronDown className="mw-row-chevron" size={17} aria-hidden="true" /></button>
            {expanded && <section className="mw-virtual-detail" id={detailId} aria-label={`vmc/${config.slug} configuration`}>
              <div className="mw-preview-tabs" role="tablist" aria-label={`vmc/${config.slug} preview`}>{(['route', 'code'] as const).map((tab, index) => <button key={tab} ref={element => { virtualTabs.current[index] = element; }} id={`${detailId}-${tab}-tab`} type="button" role="tab" aria-selected={virtualPreview === tab} aria-controls={`${detailId}-preview`} tabIndex={virtualPreview === tab ? 0 : -1} onClick={() => setVirtualPreview(tab)} onKeyDown={event => onPairTabKeyDown(event, index, next => setVirtualPreview(next === 0 ? 'route' : 'code'), virtualTabs.current)}>{tab === 'route' ? <Route size={14} aria-hidden="true" /> : <Code2 size={14} aria-hidden="true" />}{tab === 'route' ? 'Route' : 'Code'}</button>)}</div>
              <div className="mw-virtual-preview" role="tabpanel" id={`${detailId}-preview`} aria-labelledby={`${detailId}-${virtualPreview}-tab`} tabIndex={0}>{virtualPreview === 'route' ? <div className="mw-alias-route" aria-label={`Route configured for vmc/${config.slug}`}><div className="mw-alias-route-source"><span className="mw-node-label">Your application calls</span><code>vmc/{config.slug}</code><span className="mw-route-stem" aria-hidden="true" /></div><div className="mw-alias-route-model"><span className="mw-node-label">Primary model</span><strong>{modelName(config.model)}</strong>{preferred.length > 0 && <div className="mw-route-provider-pool" aria-label="Explicit provider preferences">{preferred.map((provider, index) => <span key={provider}><small>{index + 1}</small>{PROVIDER_NAMES[provider]}</span>)}</div>}{automatic.length > 0 && <><span className="mw-node-label mw-pool-label">Automatic provider pool</span><div className="mw-route-provider-pool" aria-label="Automatic provider pool">{automatic.map(provider => <span key={provider}><i aria-hidden="true" />{PROVIDER_NAMES[provider]}</span>)}</div></>}{!allowed.length && <p className="mw-error">No eligible provider for this model.</p>}{excluded.length > 0 && <p className="mw-preview-caption">Excluded: {excluded.map(provider => PROVIDER_NAMES[provider]).join(', ')}</p>}<span className="mw-preview-caption">{preferred.length ? 'Preferences are tried before the automatic pool.' : 'Automatic routing does not imply a fixed attempt order.'}</span></div>{config.fallbacks.length > 0 && <div className="mw-alias-route-fallback"><span className="mw-node-label">After eligible providers fail before output</span>{config.fallbacks.map(id => <strong key={id}>{modelName(id)}</strong>)}</div>}</div> : <div className="mw-alias-code"><div><span className="mw-node-label">Your application keeps calling</span><code>vmc/{config.slug}</code><p>Change the route behind this name without changing your application’s model identifier.</p><span className="mw-preview-caption">This alias is saved in the demo. Create it in your Vercel team to use it in an app.</span></div><ServerCode code={landingCode(`vmc/${config.slug}`, 'sdk')} /></div>}</div>
              <details className="mw-disclosure mw-route-settings"><summary>Settings and alias behavior</summary><dl className="mw-config-lines"><div><dt>Underlying model identifier</dt><dd><code>{config.model}</code></dd></div><div><dt>Provider restriction</dt><dd>{config.only.length ? config.only.map(provider => PROVIDER_NAMES[provider]).join(', ') : 'All eligible providers'}</dd></div><div><dt>Routing strategy</dt><dd>{({ default: 'Gateway default', cost: 'Lowest cost', ttft: 'Lowest time to first token', tps: 'Highest token throughput' } as const)[config.sort]}</dd></div><div><dt>Tags</dt><dd>{config.tags.length ? config.tags.join(', ') : 'No alias tags configured'}</dd></div></dl><p>In Vercel, configured alias settings override matching request options. Unset options can come from the request. Alias tags replace request tags.</p></details>
              <JourneyNext primary guidance={pageGuidance('virtual-models', { selectedAlias: config.slug })} onAction={() => onOpenVirtualModel(config)} /><div className="mw-detail-actions"><button className="mw-button mw-secondary" type="button" onClick={() => onUseVirtualModel(config, 'playground')}>Try in Playground</button><button className="mw-text-button" type="button" onClick={() => onUseVirtualModel(config, 'connect')}>Use in Connect<ArrowRight size={14} aria-hidden="true" /></button><button className="mw-text-button" type="button" onClick={() => void copyIdentifier(config.slug)}>{copiedSlug === config.slug ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{copiedSlug === config.slug ? 'Identifier copied' : 'Copy identifier'}</button></div>
              {copiedSlug === config.slug && <p className="mw-copy-status" role="status">Copied vmc/{config.slug}.</p>}
              {copyError === config.slug && <p className="mw-error" role="alert">Clipboard access is unavailable. Select and copy the identifier: <code>vmc/{config.slug}</code></p>}
            </section>}
          </li>;
        })}
      </ul>
      {!visibleVirtualModels.length && <div className="mw-empty"><span className="mw-empty-symbol" aria-hidden="true">vmc/</span><h2>{models.length ? 'No Virtual Models match your search.' : 'Give your first model a stable name.'}</h2><p>{models.length ? 'Search an alias, model, or request tag.' : 'Start with a model, then shape its provider preferences and fallback behavior.'}</p>{models.length ? <button className="mw-button mw-secondary" type="button" onClick={() => setVirtualQuery('')}>Clear search</button> : <button className="mw-button mw-primary" type="button" onClick={event => startCreate(event.currentTarget)}>Create Virtual Model<Plus size={16} aria-hidden="true" /></button>}</div>}
    </section>
    <footer className="mw-view-footer"><p>These aliases and revisions are browser demo state. Creating or activating one here does not create or update a Virtual Model on Vercel.</p><button className="mw-text-button" type="button" onClick={() => onNavigate('models')}>Choose an underlying model<ArrowRight size={14} aria-hidden="true" /></button></footer>
  </div>;

  if (view === 'leaderboards') return <div className="workspace-page model-workspace mw-leaderboards">
    <header className="mw-heading"><div><h1 tabIndex={-1}>Leaderboards</h1><p>Explore Gateway usage. Estimate your own workload.</p></div><SourceLink href={`${DOCS}/leaderboards`}>How the data works</SourceLink></header>
    <div className="mw-page-tabs" role="tablist" aria-label="Leaderboard views">{([{ id: 'official', label: 'Official discovery' }, { id: 'estimate', label: 'Request cost estimator' }] as const).map((tab, index) => <button key={tab.id} ref={element => { boardTabs.current[index] = element; }} type="button" role="tab" id={`${instanceId}-board-${tab.id}`} aria-selected={leaderboardTab === tab.id} aria-controls={`${instanceId}-board-panel`} tabIndex={leaderboardTab === tab.id ? 0 : -1} onClick={() => setLeaderboardTab(tab.id)} onKeyDown={event => onPairTabKeyDown(event, index, next => setLeaderboardTab(next === 0 ? 'official' : 'estimate'), boardTabs.current)}>{tab.label}</button>)}</div>
    <div id={`${instanceId}-board-panel`} role="tabpanel" aria-labelledby={`${instanceId}-board-${leaderboardTab}`} tabIndex={0}>
    {leaderboardTab === 'official' ? <><section className="mw-board-introduction" aria-labelledby={`${instanceId}-boards-title`}><div><h2 id={`${instanceId}-boards-title`}>What’s being used?</h2><p>Explore Vercel’s published Gateway usage. Usage is a signal of adoption, not an answer-quality benchmark.</p></div><span className="mw-local-caption">Open official views on Vercel</span></section>
    <div className="mw-official-boards">{LEADERBOARD_VIEWS.map((board, index) => <a key={board.id} href={`https://vercel.com/ai-gateway/leaderboards/${board.id}`} target="_blank" rel="noreferrer"><span className={`mw-board-symbol mw-board-symbol-${index}`} aria-hidden="true">{[<Braces size={24} key="model" />, <Code2 size={24} key="lab" />, <Terminal size={24} key="app" />, <Route size={24} key="provider" />][index]}</span><span><strong>{board.title}</strong><span>{board.description}</span></span><ArrowUpRight size={18} aria-hidden="true" /><span className="mw-sr-only"> Opens in a new tab.</span></a>)}</div><p className="mw-estimator-footnote">The concept does not fetch or recreate live rankings. Official leaderboards describe anonymized Gateway usage and their published attribution rules.</p></> : <section className="mw-estimator" aria-labelledby={`${instanceId}-estimate-title`}>
      <header className="mw-section-heading"><div><h2 id={`${instanceId}-estimate-title`}>What would one request cost?</h2><p>Change the token counts. Compare base charges.</p></div><span className="mw-estimate-label">Snapshot · {SNAPSHOT_LABEL}</span></header>
      <div className="mw-estimator-layout"><div className="mw-token-inputs"><div className="mw-token-composition"><span className="mw-node-label">One request</span><strong>{formatNumber.format(inputTokens + outputTokens)}<span>tokens</span></strong><div className="mw-token-composition-track" aria-hidden="true"><span className="mw-input-cost" style={{ width: inputTokens + outputTokens ? `${inputTokens / (inputTokens + outputTokens) * 100}%` : '0%' }} /><span className="mw-output-cost" style={{ width: inputTokens + outputTokens ? `${outputTokens / (inputTokens + outputTokens) * 100}%` : '0%' }} /></div><div className="mw-cost-legend"><span><i className="mw-input-cost" aria-hidden="true" />Input</span><span><i className="mw-output-cost" aria-hidden="true" />Output</span></div></div><div className="mw-token-field"><label htmlFor={`${instanceId}-input-tokens`}>Input tokens<output htmlFor={`${instanceId}-input-tokens`}>{formatNumber.format(inputTokens)}</output></label><input id={`${instanceId}-input-tokens`} type="range" min={0} max={32000} step={250} value={inputTokens} aria-valuetext={`${formatNumber.format(inputTokens)} input tokens per request`} onChange={event => setInputTokens(Number(event.target.value))} /><div className="mw-range-scale" aria-hidden="true"><span>0</span><span>32,000</span></div><p>The prompt and context you send.</p></div><div className="mw-token-field"><label htmlFor={`${instanceId}-output-tokens`}>Output tokens<output htmlFor={`${instanceId}-output-tokens`}>{formatNumber.format(outputTokens)}</output></label><input id={`${instanceId}-output-tokens`} type="range" min={0} max={8000} step={50} value={outputTokens} aria-valuetext={`${formatNumber.format(outputTokens)} output tokens per request`} onChange={event => setOutputTokens(Number(event.target.value))} /><div className="mw-range-scale" aria-hidden="true"><span>0</span><span>8,000</span></div><p>The response the model generates.</p></div><details className="mw-disclosure mw-estimate-formula"><summary>How this is calculated</summary><p><code>input × rate + output × rate</code><br />Each rate is priced per one million tokens.</p></details></div>
      <div className="mw-estimate-results" aria-label="Estimated cost by model">{estimates.map(({ model, input, output }) => <div className="mw-estimate-row" key={model.id}><div className="mw-estimate-topline"><span><strong>{model.name}</strong><span>Base cost per request</span></span><output aria-label={`${model.name} estimated request cost`}>{formatEstimate.format(input + output)}</output></div><div className="mw-cost-track" aria-hidden="true"><span className="mw-input-cost" style={{ width: largestEstimate ? `${input / largestEstimate * 100}%` : '0%' }} /><span className="mw-output-cost" style={{ width: largestEstimate ? `${output / largestEstimate * 100}%` : '0%' }} /></div><div className="mw-estimate-bottomline"><span>{formatRate.format((input + output) * 1000)} / 1,000 identical requests</span><button className="mw-text-button" type="button" onClick={() => onSelectModel(model.id, 'playground')}>Try model<ArrowRight size={14} aria-hidden="true" /><span className="mw-sr-only">: {model.name}</span></button></div></div>)}<div className="mw-cost-legend"><span><i className="mw-input-cost" aria-hidden="true" />Input</span><span><i className="mw-output-cost" aria-hidden="true" />Output</span></div></div></div>
      <details className="mw-disclosure mw-estimator-footnote"><summary>Rates and estimate scope</summary><dl className="mw-estimate-rates">{CATALOG_MODELS.map(model => <div key={model.id}><dt>{model.name}</dt><dd>{formatRate.format(model.inputPrice)} input / {formatRate.format(model.outputPrice)} output per 1M tokens</dd></div>)}</dl><p>Calculated locally from the {SNAPSHOT_LABEL} catalog snapshot. No API request is made. Context tiers, caching, tools, and platform charges are excluded; these estimates say nothing about answer quality or latency.</p></details>
    </section>}
    </div>
    <JourneyNext guidance={pageGuidance('leaderboards')} onAction={() => onNavigate('models')} />
  </div>;

  return <div className="workspace-page model-workspace mw-documentation">
    <header className="mw-heading"><div><h1 tabIndex={-1}>Documentation</h1><p>Choose what you want to do next.</p></div><SourceLink href={DOCS}>Full documentation</SourceLink></header>
    <div className="mw-reference-workspace"><nav className="mw-task-list" aria-label="Documentation tasks">{REFERENCE_TASKS.map(task => { const Icon = task.icon; return <button key={task.id} type="button" aria-pressed={referenceTask === task.id} aria-controls={`${instanceId}-reference-panel`} onClick={() => setReferenceTask(task.id)}><Icon size={17} aria-hidden="true" /><span>{task.label}</span><ArrowRight size={14} aria-hidden="true" /></button>; })}</nav>
      <section className="mw-reference-panel" id={`${instanceId}-reference-panel`} aria-labelledby={`${instanceId}-reference-heading`}>
        {referenceTask === 'request' ? <><div className="mw-section-heading"><div><h2 id={`${instanceId}-reference-heading`}>Keep the client you know.</h2><p>Choose your interface, then carry it into Connect.</p></div></div><div className="mw-sdk-tabs" role="tablist" aria-label="SDK integration guide">{SDK_GUIDES.map((item, index) => <button key={item.id} ref={element => { sdkTabs.current[index] = element; }} id={`${instanceId}-sdk-${item.id}`} type="button" role="tab" aria-selected={sdk === index} aria-controls={`${instanceId}-sdk-panel`} tabIndex={sdk === index ? 0 : -1} onClick={() => setSdk(index)} onKeyDown={event => onSdkKeyDown(event, index)}>{item.label}</button>)}</div><div className="mw-sdk-panel" role="tabpanel" tabIndex={0} id={`${instanceId}-sdk-panel`} aria-labelledby={`${instanceId}-sdk-${guide.id}`}><div className="mw-reference-code-heading"><span><Terminal size={15} aria-hidden="true" />Server-side app<ArrowRight size={14} aria-hidden="true" />Gateway</span><code>{modelName(selectedModel)}</code></div><ServerCode code={landingCode(selectedModel, selectedClient)} /><p className="mw-preview-caption">Authenticate on your server with Gateway credentials. Keep keys out of browser code.</p><details className="mw-disclosure"><summary>How {guide.label} connects</summary><p>{guide.description}</p><dl className="mw-config-lines"><div><dt>Endpoint</dt><dd><code>{guide.endpoint}</code></dd></div><div><dt>Request shape</dt><dd><code>{guide.request}</code></dd></div></dl></details></div><div className="mw-detail-actions"><button className="mw-button mw-primary" type="button" onClick={() => { if (referenceContinuation?.target?.view === 'connect') onSelectModel(selectedModel, 'connect', selectedClient); }}>Prepare a first request<ArrowRight size={16} aria-hidden="true" /></button><SourceLink href={guide.href}>Read integration guide</SourceLink></div></> : referenceTask === 'authentication' ? <><div className="mw-section-heading"><div><h2 id={`${instanceId}-reference-heading`}>Two different credentials.</h2><p>Your app authenticates to Gateway. Gateway connects to a serving provider.</p></div></div><div className="mw-reference-diagram" aria-label="Your app uses Gateway credentials; a serving provider uses managed or BYOK credentials"><div><Terminal size={22} aria-hidden="true" /><strong>Your app</strong><span>Server-side</span></div><div className="mw-reference-bridge"><span>Gateway key or Vercel OIDC</span><ArrowRight size={22} aria-hidden="true" /></div><div><Route size={22} aria-hidden="true" /><strong>Gateway</strong><span>Routing and visibility</span></div><div className="mw-reference-bridge"><span>Managed or BYOK credentials</span><ArrowRight size={22} aria-hidden="true" /></div><div><Braces size={22} aria-hidden="true" /><strong>Provider</strong><span>Serves the model</span></div></div><p className="mw-reference-explanation">Choose the authentication method for your environment in Connect. Bringing your own provider key is a separate choice.</p><div className="mw-detail-actions"><button className="mw-button mw-primary" type="button" onClick={() => { if (referenceContinuation?.target?.view === 'connect') onSelectModel(selectedModel, 'connect', selectedClient); }}>Choose app authentication<ArrowRight size={16} aria-hidden="true" /></button><SourceLink href={`${DOCS}/authentication-and-byok`}>Authentication and BYOK</SourceLink></div></> : referenceTask === 'routing' ? <><div className="mw-section-heading"><div><h2 id={`${instanceId}-reference-heading`}>Make the route explicit.</h2><p>Preferences, restrictions, and fallbacks answer different questions.</p></div></div><div className="mw-reference-choices"><div><span className="mw-node-label">Prefer</span><strong>Who should try first?</strong><code>order: ['anthropic', 'bedrock']</code></div><div><span className="mw-node-label">Restrict</span><strong>Who is allowed?</strong><code>only: ['anthropic', 'bedrock']</code></div><div><span className="mw-node-label">Recover</span><strong>Which model comes next?</strong><code>models: ['openai/gpt-5.4']</code></div></div><p className="mw-reference-explanation">A preference does not exclude other providers. Model fallback can recover after eligible providers fail before output begins.</p><div className="mw-detail-actions"><button className="mw-button mw-primary" type="button" onClick={() => { if (referenceContinuation?.target?.view === 'routes') onSelectModel(selectedModel, 'routes'); }}>Shape this route<ArrowRight size={16} aria-hidden="true" /></button><button className="mw-text-button" type="button" onClick={() => onNavigate('virtual-models')}>Virtual Models<ArrowRight size={14} aria-hidden="true" /></button><SourceLink href={`${DOCS}/models-and-providers/provider-filtering-and-ordering`}>Routing reference</SourceLink></div></> : <><div className="mw-section-heading"><div><h2 id={`${instanceId}-reference-heading`}>Follow the evidence.</h2><p>Inspect the request that produced the signal.</p></div></div><div className="mw-evidence-path" aria-label="Inspect outcome, provider attempts, then usage"><div><Activity size={22} aria-hidden="true" /><strong>Outcome</strong><span>What happened?</span></div><ArrowRight size={20} aria-hidden="true" /><div><Route size={22} aria-hidden="true" /><strong>Attempts</strong><span>Which provider, and why?</span></div><ArrowRight size={20} aria-hidden="true" /><div><Braces size={22} aria-hidden="true" /><strong>Usage</strong><span>What is known?</span></div></div><p className="mw-reference-explanation">The demo preserves the request’s configuration, recorded attempts, and timing. Cancellation keeps unknown usage explicit.</p><div className="mw-detail-actions"><button className="mw-button mw-primary" type="button" onClick={() => { if (referenceContinuation?.target?.view === 'monitor') onNavigate('monitor'); }}>Open demo logs<ArrowRight size={16} aria-hidden="true" /></button><SourceLink href={`${DOCS}/observability-and-spend/observability`}>Observability guide</SourceLink></div></>}
      </section>
    </div>
    <footer className="mw-view-footer"><p>Code is a server-side example. Requests and configuration changes in this concept are simulated.</p><button className="mw-text-button" type="button" onClick={() => onNavigate('playground')}>Try the Playground<ArrowRight size={14} aria-hidden="true" /></button></footer>
  </div>;
}
