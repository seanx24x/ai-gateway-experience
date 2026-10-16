'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Asterisk, Check, ChevronDown, Code2, Copy, Download, ExternalLink, FileCode2, ShieldCheck, Terminal, X } from 'lucide-react';
import { MODELS, type RoutingConfig } from '@/lib/gateway';
import { authModeLabels, createSetupSteps, getEnvironmentAuth, integrationLabels, type AuthMode, type Integration, type SetupEnvironment, type SetupIntent } from '@/lib/setup';
import { currentSetupFeedback, currentSetupStage, nextSetupStage, restoreSetupFlow, setupStages, type SetupEditor, type SetupFeedback, type SetupStage } from '@/lib/setup-flow';
import { AGENT_PREVIEW_COMMAND, AGENT_SETUP_COMMAND, createEditorLinks, createGatewayServerCode, createHandoffPrompt, createITermLink, createStarterUrl, type HandoffContext } from '@/lib/handoff';
import { PreparedVerification, useArtifactMotion } from './journey-next';
import './setup-experience.css';

export interface SetupPrimaryAction {
  label: string;
  disabled?: boolean;
  run: () => void;
}

export interface SetupExperienceProps {
  integration: Integration;
  auth: AuthMode;
  model: string;
  intent: SetupIntent;
  environment: SetupEnvironment;
  routingConfig?: RoutingConfig;
  virtualModel?: string;
  workload?: string;
  onIntegrationChange: (integration: Integration) => void;
  onAuthChange: (auth: AuthMode) => void;
  onModelChange: (model: string) => void;
  onIntentChange: (intent: SetupIntent) => void;
  onEnvironmentChange: (environment: SetupEnvironment) => void;
  onDemo: () => void;
  renderCode: (code: string, label: string) => ReactNode;
  embedded?: boolean;
  flowStorageKey?: string;
  onBriefReview?: () => void;
  onPrimaryActionChange?: (action: SetupPrimaryAction | null) => void;
}

type Decision = Exclude<SetupStage, 'review'> | 'model' | 'auth';
type Preview = 'brief' | 'code' | 'starter';
const FLOW_STORAGE_KEY = 'gateway-sentence-flow-v1';
const INTENTS: { id: SetupIntent; phrase: string; label: string; description: string }[] = [
  { id: 'new', phrase: 'a new app', label: 'New app', description: 'A small app with a request form and a server connection.' },
  { id: 'existing', phrase: 'an existing app', label: 'Existing app', description: 'Keep your app. Adapt the connection it already uses.' },
  { id: 'agent', phrase: 'my coding agent', label: 'Coding agent', description: 'Connect your coding agent’s own requests through Gateway.' },
];
const ENVIRONMENTS: { id: SetupEnvironment; phrase: string; description: string }[] = [
  { id: 'local', phrase: 'on my machine', description: 'Link a Vercel project for local server identity.' },
  { id: 'vercel', phrase: 'on Vercel', description: 'Use your deployed project’s server identity.' },
  { id: 'elsewhere', phrase: 'on another server', description: 'Keep a Gateway API key in your server environment.' },
];
const CLIENTS = ['sdk', 'openai', 'anthropic'] as const;
const EDITOR_LABELS: Record<SetupEditor, string> = { cursor: 'Cursor', vscode: 'VS Code' };
const DECISION_TITLES: Record<Decision, string> = { intent: 'What are you connecting?', integration: 'Choose your client', environment: 'Where will you try your first request?', editor: 'Choose your editor', model: 'Choose your starting model', auth: 'Authenticate on your server' };

export function SetupExperience(props: SetupExperienceProps) {
  const { integration, auth, model, intent, environment, routingConfig, virtualModel, onIntegrationChange, onAuthChange, onModelChange, onIntentChange, onEnvironmentChange, onDemo, renderCode, embedded = false, onPrimaryActionChange, flowStorageKey = FLOW_STORAGE_KEY, onBriefReview } = props;
  const [stage, setStage] = useState<SetupStage>('intent');
  const [editor, setEditor] = useState<SetupEditor>('cursor');
  const [restored, setRestored] = useState(false);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [preview, setPreview] = useState<Preview>('brief');
  const [edited, setEdited] = useState<{ signature: string; text: string } | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<SetupFeedback<'copied' | 'failed'> | null>(null);
  const [handoffFeedback, setHandoffFeedback] = useState<SetupFeedback<SetupEditor> | null>(null);
  const [downloadFeedback, setDownloadFeedback] = useState<SetupFeedback<'preparing' | 'ready' | 'failed'> | null>(null);
  const artifactRef = useRef<HTMLElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const phraseRef = useRef<HTMLButtonElement>(null);
  const reviewRef = useRef<HTMLHeadingElement>(null);
  const decisionTrigger = useRef<HTMLButtonElement | null>(null);
  const primaryEditorLink = useRef<HTMLAnchorElement | null>(null);
  const primaryActionCallback = useRef(onPrimaryActionChange);
  const primaryActionRun = useRef<() => void>(() => {});
  const runPrimaryAction = useCallback(() => primaryActionRun.current(), []);
  primaryActionCallback.current = onPrimaryActionChange;
  const baseId = useId();
  const agent = intent === 'agent';
  const review = stage === 'review';
  const activeStage = currentSetupStage(intent, stage);
  const context: HandoffContext = { intent, environment, integration: agent ? 'agent' : integration === 'agent' ? 'sdk' : integration, auth: agent ? 'api-key' : auth, model, routingConfig, ...(!agent && virtualModel ? { virtualModel } : {}), ...(!agent && props.workload !== undefined ? { workload: props.workload } : {}) };
  const signature = JSON.stringify(context);
  const generatedPrompt = createHandoffPrompt(context);
  const prompt = edited?.signature === signature ? edited.text : generatedPrompt;
  const currentBrief = useRef({ signature, prompt });
  currentBrief.current = { signature, prompt };
  const copyState = currentSetupFeedback(copyFeedback, signature, prompt) ?? 'idle';
  const handoff = currentSetupFeedback(handoffFeedback, signature, prompt);
  const downloadState = currentSetupFeedback(downloadFeedback, signature) ?? 'idle';
  const links = createEditorLinks(prompt);
  const previewTabs: { id: Preview; label: string; prefix?: string }[] = [{ id: 'brief', label: 'Brief', prefix: 'Agent ' }, ...(!agent ? [{ id: 'code' as const, label: 'Code', prefix: 'Server ' }] : []), ...(intent === 'new' ? [{ id: 'starter' as const, label: 'Starter' }] : [])];
  const steps = createSetupSteps(context.integration, context.auth, context.virtualModel ?? model, { intent, environment });
  const selectedIntent = INTENTS.find(item => item.id === intent) ?? INTENTS[0];
  const selectedModel = MODELS.find(item => item.id === model);
  const modelLabel = context.virtualModel ?? selectedModel?.name ?? model;
  const selectedEnvironment = ENVIRONMENTS.find(item => item.id === environment) ?? ENVIRONMENTS[0];
  const terminal = agent ? `${AGENT_PREVIEW_COMMAND}\n\n# Review the preview, then run interactively:\n${AGENT_SETUP_COMMAND}` : steps.filter(step => step.language === 'bash' && !step.code.includes('node index.mts') && !step.code.includes('node --env-file')).map(step => `# ${step.title}\n${step.code}`).join('\n\n');
  const prefix = activeStage === 'intent' ? 'I’m connecting' : activeStage === 'integration' ? intent === 'new' ? 'I’ll build with' : 'My app already uses' : activeStage === 'environment' ? 'I’ll try my first request' : 'I’ll continue in';
  const phrase = activeStage === 'intent' ? selectedIntent.phrase : activeStage === 'integration' ? integrationLabels[context.integration] : activeStage === 'environment' ? selectedEnvironment.phrase : EDITOR_LABELS[editor];
  const environmentHelp = auth === 'api-key' ? 'Keep a Gateway API key in your private server environment.' : environment === 'elsewhere' ? 'Supply a valid Vercel token and a refresh process on this server.' : selectedEnvironment.description;
  const help = activeStage === 'intent' ? selectedIntent.description : activeStage === 'integration' ? intent === 'new' ? 'AI SDK is recommended. You can use another supported client.' : 'Choose the client making your app’s current AI requests.' : activeStage === 'environment' ? environmentHelp : 'Prepare an unsent task with your choices, ready to review.';
  const stages = setupStages(intent);
  const history = stages.slice(0, stages.indexOf(activeStage)).filter(item => item !== 'review' && (!review || item !== 'editor'));

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(flowStorageKey);
      // Validate the presentation schema, then derive the applicable stage from
      // current shared intent during render. Parent hydration cannot race this read.
      if (saved) { const flow = restoreSetupFlow(JSON.parse(saved), 'new'); setStage(flow.stage); setEditor(flow.editor); }
    } catch { /* Browsing without storage remains fully interactive. */ }
    setRestored(true);
  }, [flowStorageKey]);
  useEffect(() => {
    if (!restored) return;
    try { sessionStorage.setItem(flowStorageKey, JSON.stringify({ stage: activeStage, editor })); } catch { /* Optional presentation persistence. */ }
  }, [activeStage, editor, restored, flowStorageKey]);

  const onBriefReviewRef = useRef(onBriefReview); onBriefReviewRef.current = onBriefReview;
  useEffect(() => { if (restored && review) onBriefReviewRef.current?.(); }, [restored, review, onBriefReview]);

  function openDecision(next: Decision, trigger: HTMLButtonElement) {
    trigger.focus();
    setDecision(previous => previous === next ? null : next);
    decisionTrigger.current = trigger;
  }
  function closeDecision() { setDecision(null); requestAnimationFrame(() => decisionTrigger.current?.focus()); }
  function moveTo(next: SetupStage, open = false) {
    setStage(next); setDecision(open && next !== 'review' ? next : null); setPreview('brief');
    decisionTrigger.current = null;
    requestAnimationFrame(() => {
      if (next === 'review') reviewRef.current?.focus();
      else { decisionTrigger.current = phraseRef.current; phraseRef.current?.focus(); }
    });
  }
  function chooseIntent(next: SetupIntent) {
    onIntentChange(next);
    if (next === 'agent') onIntegrationChange('agent');
    else if (next === 'new' || integration === 'agent') onIntegrationChange('sdk');
    setPreview('brief'); closeDecision();
  }
  async function copyPrompt() {
    try { await navigator.clipboard.writeText(prompt); setCopyFeedback({ signature, prompt, value: 'copied' }); }
    catch {
      setCopyFeedback({ signature, prompt, value: 'failed' });
      if (currentBrief.current.signature !== signature || currentBrief.current.prompt !== prompt) return;
      setPreview('brief');
      requestAnimationFrame(() => {
        if (currentBrief.current.signature !== signature || currentBrief.current.prompt !== prompt) return;
        promptRef.current?.focus(); promptRef.current?.select();
      });
    }
  }
  async function downloadStarter() {
    setDownloadFeedback({ signature, value: 'preparing' });
    try {
      const response = await fetch(createStarterUrl(context));
      if (!response.ok) throw new Error('Starter unavailable');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `gateway-starter-${context.integration}.zip`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); setDownloadFeedback({ signature, value: 'ready' });
    } catch { setDownloadFeedback({ signature, value: 'failed' }); }
  }
  function decisionLabel(item: SetupStage) {
    return item === 'intent' ? 'Connecting' : item === 'integration' ? 'Client' : item === 'environment' ? 'First request' : 'Editor';
  }
  function historyLabel(item: SetupStage) {
    return item === 'intent' ? selectedIntent.phrase : item === 'integration' ? integrationLabels[context.integration] : item === 'environment' ? selectedEnvironment.phrase : EDITOR_LABELS[editor];
  }

  function choices(next: Decision) {
    const option = (id: string, label: string, selected: boolean, select: () => void, detail?: string) => {
      const detailId = `${baseId}-${next}-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}-description`;
      return <button type="button" className="se-option" key={id} aria-label={label} aria-describedby={detail ? detailId : undefined} aria-pressed={selected} onClick={select}><span>{label}{detail && <small id={detailId}>{detail}</small>}</span>{selected ? <Check size={18} aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}</button>;
    };
    return <section className={`se-decision${next === 'model' || next === 'auth' ? ' se-context-decision' : ''}`} id={`${baseId}-decision`} aria-label={DECISION_TITLES[next]}>
      {next === 'intent' && INTENTS.map(item => option(item.id, item.phrase, intent === item.id, () => chooseIntent(item.id), item.id === 'new' ? 'Start with a small Next.js app' : item.id === 'existing' ? 'Adapt your current server connection' : 'Configure your agent’s own requests'))}
      {next === 'integration' && CLIENTS.map(item => option(item, integrationLabels[item], integration === item, () => { onIntegrationChange(item); closeDecision(); }, item === 'sdk' && intent === 'new' ? 'Recommended for a new app' : undefined))}
      {next === 'environment' && ENVIRONMENTS.map(item => option(item.id, item.phrase, environment === item.id, () => { onEnvironmentChange(item.id); onAuthChange(getEnvironmentAuth(item.id)); closeDecision(); }))}
      {next === 'editor' && (['cursor', 'vscode'] as const).map(item => option(item, EDITOR_LABELS[item], editor === item, () => { setEditor(item); closeDecision(); }))}
      {next === 'model' && <>{MODELS.map(item => option(item.id, item.name, !context.virtualModel && model === item.id, () => { onModelChange(item.id); closeDecision(); }, item.description))}<p className="se-help">Curated demo selection. <a href="https://vercel.com/ai-gateway/models" target="_blank" rel="noreferrer">Check current availability<ExternalLink size={12} aria-hidden="true" /></a></p></>}
      {next === 'auth' && <>{(['oidc', 'api-key'] as const).map(item => option(item, authModeLabels[item], auth === item, () => { onAuthChange(item); closeDecision(); }))}<p className="se-help">{auth === 'api-key' ? 'A team-scoped Gateway key works wherever your server runs. Save it privately in the server environment.' : environment === 'vercel' ? 'Vercel supplies the current project identity to deployed server requests.' : environment === 'local' ? 'Link your Vercel project and pull a local token. Refresh local OIDC tokens after 12 hours.' : 'Another platform needs a valid Vercel token and a refresh process. An API key is recommended here.'}</p></>}
    </section>;
  }

  const primaryLabel = review ? `Open in ${EDITOR_LABELS[editor]}` : activeStage === 'editor' ? 'Review my connection' : 'Continue';
  const primaryDisabled = review && (!prompt.trim() || (editor === 'cursor' && !links.cursor));
  const publishesPrimaryAction = Boolean(onPrimaryActionChange);
  primaryActionRun.current = () => {
    if (primaryDisabled) return;
    if (review) primaryEditorLink.current?.click();
    else moveTo(nextSetupStage(intent, activeStage));
  };
  useEffect(() => {
    primaryActionCallback.current?.({ label: primaryLabel, disabled: primaryDisabled, run: runPrimaryAction });
  }, [primaryLabel, primaryDisabled, publishesPrimaryAction, runPrimaryAction]);
  useEffect(() => () => { primaryActionCallback.current?.(null); }, []);

  const endpoint = context.integration === 'openai' ? 'https://ai-gateway.vercel.sh/v1' : 'https://ai-gateway.vercel.sh';
  const requestModel = context.virtualModel ?? model;
  const authentication = context.auth === 'oidc' ? 'await getVercelOidcToken()' : 'process.env.AI_GATEWAY_API_KEY';
  const previewSignature = `${intent}-${context.integration}-${environment}-${context.auth}-${requestModel}`;
  const connectionPreview = context.integration === 'sdk'
    ? <>generateText({'{'}<br /><span className="se-code-removed">− model: providerModel,</span><br /><span className="se-code-added">+ model: {JSON.stringify(requestModel)},</span><br />{'  '}prompt,<br />{'}'})</>
    : <>new {context.integration === 'openai' ? 'OpenAI' : 'Anthropic'}({'{'}<br /><span className="se-code-added">{'  '}baseURL: {JSON.stringify(endpoint)},</span><br /><span className="se-code-added">{'  '}apiKey: {authentication},</span><br />{'}'})<br /><br />const model = {JSON.stringify(requestModel)};</>;
  const starterPreview = <pre className="se-connection-code se-live-code" aria-label="Selected server connection excerpt"><code>{context.integration === 'sdk' ? <>
    <span className="se-code-line">import {'{'} generateText {'}'} from 'ai';</span>
    <span className="se-code-line"> </span>
    <span className="se-code-line">const result = await generateText({'{'}</span>
    <span className="se-code-line se-code-selected">{'  '}model: {JSON.stringify(requestModel)},</span>
    <span className="se-code-line">{'  '}prompt,</span>
    <span className="se-code-line">{'  '}maxOutputTokens: 256,</span>
    <span className="se-code-line">{'}'});</span>
  </> : <>
    <span className="se-code-line">const client = new {context.integration === 'openai' ? 'OpenAI' : 'Anthropic'}({'{'}</span>
    <span className="se-code-line">{'  '}baseURL: {JSON.stringify(endpoint)},</span>
    <span className="se-code-line">{'  '}apiKey: credential,</span>
    <span className="se-code-line">{'}'});</span>
    <span className="se-code-line"> </span>
    <span className="se-code-line se-code-selected">const model = {JSON.stringify(requestModel)};</span>
  </>}</code></pre>;
  useArtifactMotion(artifactRef, `${activeStage}:${previewSignature}`);
  const previousChoices = history.length > 0 && <nav className="se-history" aria-label="Previous connection choices">{history.map(item => <button type="button" key={item} aria-label={`Edit ${item === 'integration' ? 'client' : item}: ${historyLabel(item)}`} onClick={() => moveTo(item, true)}><span>{decisionLabel(item)}</span><strong>{historyLabel(item)}</strong><ChevronDown size={12} aria-hidden="true" /></button>)}</nav>;
  const connectionSettings = <>
    <div className="se-context" aria-label="Connection settings"><div><button type="button" aria-label={`Model ${modelLabel}`} aria-expanded={decision === 'model'} aria-controls={`${baseId}-decision`} onClick={event => openDecision('model', event.currentTarget)}><span className="se-context-label">{agent ? 'Verify with' : virtualModel ? 'Virtual Model' : 'Model'}</span><span className="se-context-value">{modelLabel}</span><ChevronDown size={12} aria-hidden="true" /></button>{!agent && <button type="button" aria-label={`Auth ${authModeLabels[auth]}`} aria-expanded={decision === 'auth'} aria-controls={`${baseId}-decision`} onClick={event => openDecision('auth', event.currentTarget)}><span className="se-context-label">Auth</span><span className="se-context-value"><ShieldCheck size={13} aria-hidden="true" />{authModeLabels[auth]}</span><ChevronDown size={12} aria-hidden="true" /></button>}</div></div>
    {(decision === 'model' || decision === 'auth') && <div className="se-optional-settings"><div className="se-optional-heading"><h3>{DECISION_TITLES[decision]}</h3><button className="icon-button" type="button" aria-label="Close connection setting" onClick={closeDecision}><X size={16} aria-hidden="true" /></button></div>{choices(decision)}</div>}
  </>;
  const starterFiles = <div className="se-file-list"><span><FileCode2 size={16} aria-hidden="true" />app/page.tsx<small>Request interface</small></span><span><FileCode2 size={16} aria-hidden="true" />app/api/generate/route.ts<small>Server request</small></span><span><FileCode2 size={16} aria-hidden="true" />.env.example<small>Server credentials</small></span></div>;
  const editorLink = <a ref={primaryEditorLink} href={editor === 'cursor' ? links.cursor ?? undefined : links.vscode} target={editor === 'cursor' ? '_blank' : undefined} rel={editor === 'cursor' ? 'noreferrer' : undefined} className="button primary" hidden={publishesPrimaryAction} tabIndex={publishesPrimaryAction ? -1 : undefined} aria-hidden={publishesPrimaryAction || undefined} onClick={() => setHandoffFeedback({ signature, prompt, value: editor })}>Open in {EDITOR_LABELS[editor]}<ExternalLink size={14} aria-hidden="true" />{editor === 'cursor' && <span className="sr-only"> (opens in a new tab)</span>}</a>;

  return <div className={`setup-experience${embedded ? ' se-embedded' : ''}${review ? ' se-reviewing' : ''}`} data-setup-stage={activeStage} onKeyDown={event => { if (event.key === 'Escape' && decision) { event.preventDefault(); closeDecision(); } }}>
    {!review && previousChoices}

    {!review ? <div className="se-workspace">
      <section className="se-composer" aria-label="Connection flow">
        <h2 className="se-sentence"><span>{prefix}</span>{' '}<button type="button" ref={phraseRef} className="se-phrase" onClick={event => openDecision(activeStage as Decision, event.currentTarget)} aria-expanded={decision === activeStage} aria-controls={`${baseId}-decision`}><span>{phrase}</span><ChevronDown size={20} aria-hidden="true" /></button></h2>
        {decision === activeStage && choices(decision)}
        <p className="se-sentence-help">{help}</p>
        <div className="se-advance">{!publishesPrimaryAction && <button type="button" className="button primary" onClick={runPrimaryAction}>{primaryLabel}<ArrowRight size={16} aria-hidden="true" /></button>}<button type="button" className="se-subtle" onClick={() => moveTo('review')}>Skip to review<ArrowRight size={14} aria-hidden="true" /></button></div>
      </section>
      <aside ref={artifactRef} className="se-artifact" aria-label="Connection preview">
        <div className="se-artifact-heading"><span>{agent ? <Terminal size={16} aria-hidden="true" /> : <Code2 size={16} aria-hidden="true" />}{agent ? 'CLI preview' : intent === 'existing' ? 'Connection change' : 'Server connection'}</span><span>{agent ? 'Dry run' : integrationLabels[context.integration]}</span></div>
        <div className="se-connection-path" aria-label={`${agent ? 'Coding agent' : 'Your app'} connects through AI Gateway to ${modelLabel}`}><span><Code2 size={18} aria-hidden="true" /><span>{agent ? 'Agent' : 'Your app'}</span></span><i aria-hidden="true" /><span className="se-path-gateway"><span className="se-gateway-mark" aria-hidden="true">▲</span><span>Gateway</span></span><i aria-hidden="true" /><span><span className="se-model-mark" aria-hidden="true"><Asterisk size={20} strokeWidth={1.5} /></span><span>Model</span></span></div>
        <div className="se-artifact-content" key={previewSignature}>{agent ? <><pre className="se-connection-code">{AGENT_PREVIEW_COMMAND}</pre><p className="se-artifact-caption">Detect supported agents. Review proposed changes before setup.</p></> : intent === 'existing' ? <><pre className="se-connection-code se-preview-change" aria-label="Illustrative connection change">{connectionPreview}</pre><p className="se-artifact-caption">Your editor inspects the app before applying this connection.</p></> : <>{starterPreview}<details className="se-starter-files"><summary>Starter files<ChevronDown size={14} aria-hidden="true" /></summary>{starterFiles}</details></>}</div>
        {connectionSettings}
      </aside>
    </div> : <section className="se-review" aria-label="Review your connection">
      <div className="se-review-heading"><div><h2 ref={reviewRef} tabIndex={-1}>Your connection, prepared.</h2><p>{agent ? 'A CLI preview task, ready for your editor.' : 'One task with your client, model, and server setup.'}</p></div></div>
      <div className="se-review-layout"><div className="se-review-draft">
        {edited && edited.signature !== signature && <p className="se-brief-refresh" role="status">Your choices changed, so the brief was regenerated. Review the updated task before sending.</p>}
        <section className="se-editor" aria-label="Prepared setup draft">
        <div className="se-editor-tabs" role="tablist" aria-label="Setup preview">{previewTabs.map((item, index) => <button key={item.id} type="button" role="tab" tabIndex={preview === item.id ? 0 : -1} aria-selected={preview === item.id} aria-controls={`${baseId}-${item.id}`} id={`${baseId}-${item.id}-tab`} onClick={() => setPreview(item.id)} onKeyDown={event => {
          const next = event.key === 'ArrowRight' ? (index + 1) % previewTabs.length : event.key === 'ArrowLeft' ? (index - 1 + previewTabs.length) % previewTabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? previewTabs.length - 1 : null;
          if (next === null) return;
          event.preventDefault(); setPreview(previewTabs[next].id); document.getElementById(`${baseId}-${previewTabs[next].id}-tab`)?.focus();
        }}>{item.prefix && <span className="sr-only">{item.prefix}</span>}{item.label}</button>)}<span>{agent ? 'CLI setup' : integrationLabels[context.integration]}</span></div>
        <div className="se-editor-content">
          <div id={`${baseId}-brief`} role="tabpanel" aria-labelledby={`${baseId}-brief-tab`} hidden={preview !== 'brief'}><div className="se-file-heading"><span>Review or edit before sending</span>{edited?.signature === signature && <button type="button" className="text-button" onClick={() => { setEdited(null); }}>Reset Brief</button>}</div><label htmlFor={`${baseId}-prompt`} className="sr-only">Prepared agent prompt</label><textarea ref={promptRef} id={`${baseId}-prompt`} className="se-prompt" spellCheck={false} value={prompt} onChange={event => { setEdited({ signature, text: event.target.value }); }} /></div>
          {!agent && <div id={`${baseId}-code`} role="tabpanel" aria-labelledby={`${baseId}-code-tab`} hidden={preview !== 'code'}>{renderCode(createGatewayServerCode(context), 'app/api/generate/route.ts')}</div>}
          {intent === 'new' && <div id={`${baseId}-starter`} role="tabpanel" aria-labelledby={`${baseId}-starter-tab`} hidden={preview !== 'starter'}><div className="se-starter"><div><FileCode2 size={20} aria-hidden="true" /><span><strong>A minimal Next.js app</strong><span>{integrationLabels[context.integration]}, {modelLabel}, and server authentication.</span></span></div>{starterFiles}<button type="button" className="button secondary" onClick={downloadStarter} disabled={downloadState === 'preparing'}>{downloadState === 'preparing' ? 'Preparing…' : 'Download Starter'}<Download size={16} aria-hidden="true" /></button>{downloadState !== 'idle' && <p className="se-download-status" role="status">{downloadState === 'ready' ? 'Archive prepared. Follow its README to authenticate and run. Downloading does not verify a connection.' : downloadState === 'failed' ? 'The archive could not be prepared. Try again or use the editor brief.' : 'Preparing your selected client and routing configuration.'}</p>}</div></div>}
        </div>
      </section>
      <details className="se-terminal"><summary><Terminal size={16} aria-hidden="true" />Terminal commands<ChevronDown size={14} aria-hidden="true" /></summary><div className="se-terminal-content">{renderCode(terminal, 'Commands to review')}<p className="se-terminal-help">{agent ? 'Dry run first. Review the preview before interactive setup.' : 'Prepare server authentication and dependencies. Keep your existing package manager.'}<a href={createITermLink(agent ? AGENT_PREVIEW_COMMAND : terminal)}>Open in iTerm2<ExternalLink size={14} aria-hidden="true" /></a><span>Requires iTerm2 on macOS. Review its command dialog before running.</span></p></div></details>
      </div><aside className="se-review-inspector" aria-label="Connection handoff">
        <section className="se-handoff-panel" aria-label="Continue in your editor">
          <div className="se-handoff-heading"><Terminal size={18} aria-hidden="true" /><h3>Continue in your editor</h3></div>
          <div className="se-handoff-actions">
            <div className="se-editor-choice" role="group" aria-label="Handoff editor">{(['cursor', 'vscode'] as const).map(item => <button key={item} type="button" aria-pressed={item === editor} onClick={() => setEditor(item)}>{EDITOR_LABELS[item]}{item === editor && <Check size={14} aria-hidden="true" />}</button>)}</div>
            {primaryDisabled ? !publishesPrimaryAction && <button type="button" className="button primary" disabled>Open in {EDITOR_LABELS[editor]}</button> : editorLink}
            <button type="button" className="se-copy" onClick={copyPrompt}>{copyState === 'copied' ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{copyState === 'copied' ? 'Copied' : 'Copy Prompt'}</button>
          </div>
          <div className="se-handoff-status" role="status">{copyState === 'failed' ? 'Clipboard unavailable. Select the brief and copy it into your editor.' : !prompt.trim() ? 'Write a task or reset the brief before opening an editor.' : !links.cursor ? 'This brief exceeds Cursor’s link limit. Copy the prompt into your editor instead.' : handoff ? `Draft handoff requested. In ${EDITOR_LABELS[handoff]}, choose your workspace, review the brief, then send. If the app did not open, use Copy Prompt.` : 'Opens a draft for review. A handoff does not verify a connection.'}</div>
        </section>
        {(handoff || copyState === 'copied' || downloadState === 'ready') && <PreparedVerification agent={agent} model={requestModel}><button type="button" className="text-button" onClick={onDemo}>Try this workload in the demo<ArrowRight size={14} aria-hidden="true" /></button></PreparedVerification>}
        <section className="se-review-summary" role="group" aria-label="Prepared connection choices"><div className="se-summary-heading"><h3>Connection</h3><button type="button" className="se-subtle" onClick={() => moveTo('editor')}>Edit choices</button></div>{previousChoices}{connectionSettings}</section>
      </aside></div>
    </section>}

    {!review && <button type="button" className="se-subtle se-demo-link" onClick={onDemo}>Try a simulated request first<ArrowRight size={14} aria-hidden="true" /></button>}
  </div>;
}
