'use client';

import { type ReactNode, useId } from 'react';
import { ArrowRight, Check, ChevronDown, Play, Square, Inbox } from 'lucide-react';
import { MODELS, PROVIDER_NAMES, getModel, type RequestRecord, type Scenario } from '@/lib/gateway';
import { DISCOVERY_PROMPT } from '@/lib/discovery';
import { RequestIdentity } from './request-identity';
import { JourneyNote } from './journey-note';
import './discovery-demo.css';

type DiscoveryPhase = 'idle' | 'routing' | 'streaming' | 'complete' | 'failed';

export interface DiscoveryDemoProps {
  model: string;
  scenario: Scenario;
  busy: boolean;
  phase: DiscoveryPhase;
  output: string;
  record: RequestRecord | null;
  onModelChange: (model: string) => void;
  onScenarioChange: (scenario: Scenario) => void;
  onRun: () => void;
  onCancel: () => void;
  onInspect: (record: RequestRecord) => void;
  onExploreRoute: () => void;
  onRehearse: (scenario: Scenario) => void;
  children?: ReactNode;
}

const scenarios = [
  { value: 'healthy', label: 'Successful request' },
  { value: 'provider-failure', label: 'Provider recovery' },
  { value: 'model-fallback', label: 'Model fallback' },
] as const;

/** Useful output first; the routing instrument remains available on demand. */
export function DiscoveryDemo({ model, scenario, busy, phase, output, record, onModelChange, onScenarioChange, onRun, onCancel, onInspect, onExploreRoute, onRehearse, children }: DiscoveryDemoProps) {
  const id = useId();
  const completed = !busy && phase === 'complete' && (record?.status === 'success' || record?.status === 'recovered');
  const stopped = !busy && record?.status === 'cancelled' && phase === 'complete';
  const failed = phase === 'failed';
  const served = record?.servedModel ? getModel(record.servedModel) : null;
  const modelLabel = served?.name ?? getModel(model)?.name ?? model;
  const status = stopped ? 'Request stopped. Final usage is unknown.'
    : failed ? 'This demo request did not complete.'
      : completed ? record.status === 'recovered' ? 'The reply arrived after Gateway recovered the route.' : 'The reply arrived through Gateway.'
        : phase === 'streaming' ? 'The model is replying.'
          : phase === 'routing' ? 'Gateway is finding a route to the model.'
            : '';
  const prepared = !record || record.prompt === DISCOVERY_PROMPT;
  const instruction = 'Draft a helpful reply. Ask for details to investigate.';
  const customerMessage = 'I was charged twice for my order. Can you help?';

  const gatewayContribution = completed && record.provider
    ? `${record.status === 'recovered' ? 'Recovered via' : 'Routed to'} ${PROVIDER_NAMES[record.provider]}`
    : failed ? 'No route completed'
      : stopped ? 'Observation stopped'
        : phase === 'routing' ? 'Choosing a provider' : 'Routes to a provider';

  return <section className="discovery-demo" aria-label="Try AI Gateway" data-phase={phase} data-outcome={record?.status ?? 'none'}>
    <div className="discovery-heading"><strong><Inbox size={15} aria-hidden="true" /> Support inbox <span className="discovery-app-breadcrumb">/ Reply assistant</span></strong><span className="discovery-demo-label">Simulated example</span></div>
    <div className="discovery-application" aria-label="Support application preview">

    <div className="discovery-workload">
      <div className="discovery-workload-label"><span className="discovery-avatar" aria-hidden="true">J</span><span>{prepared ? 'Jamie · Customer message' : 'Prompt'}</span><span className="discovery-ticket">#1042</span></div>
      {prepared ? <>
        <blockquote><p>“{customerMessage}”</p></blockquote>
        <p className="discovery-instruction"><span>Your app asks:</span>{' '}{instruction}</p>
      </> : <p className="discovery-current-prompt">{record?.prompt ?? 'This older receipt did not store the prompt. Open the request to inspect the available evidence.'}</p>}
    </div>

    <div className="discovery-controls">
      <label className="discovery-model"><span>Try a model</span><span className="discovery-select-wrap"><select value={model} onChange={event => onModelChange(event.target.value)} disabled={busy}>{MODELS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={14} aria-hidden="true" /></span></label>
      <button key={busy ? 'cancel-example' : 'run-example'} className="button primary discovery-run" aria-label={busy ? 'Cancel request' : 'Run a demo request'} onClick={busy ? onCancel : onRun}>{busy ? <Square size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}<span>{busy ? 'Cancel request' : 'Run Request'}</span></button>
    </div>

    <div className="discovery-answer" aria-labelledby={`${id}-answer`}>
      <div className="discovery-answer-heading"><span id={`${id}-answer`}>{failed ? 'Failure explanation' : stopped ? 'Observed output' : prepared ? 'Draft reply' : 'Response'}</span>{completed && <span key={record.id} className="discovery-answer-state"><Check size={12} aria-hidden="true" />Received</span>}</div>
      {output ? <p className={`discovery-answer-text ${phase === 'streaming' ? 'discovery-streaming' : ''}`}>{output}</p>
        : <><p className="discovery-answer-empty">{phase === 'routing' ? 'Waiting for the model to start replying.' : phase === 'streaming' ? 'The reply is starting.' : failed ? record?.response ?? 'Open the request to inspect what happened.' : stopped ? 'No output was observed before cancellation.' : 'Send the request. Watch the reply arrive.'}</p>{phase === 'idle' && <div className="discovery-output-placeholder" aria-hidden="true"><i /><i /><i /></div>}</>}
    </div>

    </div>
    <aside className="discovery-evidence" aria-label="Gateway request evidence"><div className="discovery-evidence-heading"><strong>Behind the reply</strong><span>{busy ? 'Observing' : record ? 'Recorded' : 'Ready'}</span></div>
    <div className="discovery-journey"><div className="discovery-path" aria-label="How the request works">
      <div className={`discovery-path-step ${phase !== 'idle' ? 'discovery-path-observed' : ''}`}><span className="discovery-path-dot" /><strong>Your app</strong><span>Sends the request</span></div>
      <ArrowRight size={14} className="discovery-path-arrow" aria-hidden="true" />
      <div className={`discovery-path-step ${phase === 'routing' ? 'discovery-path-active' : phase !== 'idle' ? 'discovery-path-observed' : ''}`}><span className="discovery-path-dot" /><strong>AI Gateway</strong><span>{gatewayContribution}</span></div>
      <ArrowRight size={14} className="discovery-path-arrow" aria-hidden="true" />
      <div className={`discovery-path-step ${phase === 'streaming' ? 'discovery-path-active' : completed ? 'discovery-path-observed' : ''}`}><span className="discovery-path-dot" /><strong>The model</strong><span>Creates the reply</span></div>
    </div><div className="discovery-status" role="status">{status}</div></div>

    {record && <div className="discovery-live-evidence">{children}</div>}
    </aside>
    {(completed || failed || stopped) && record && <div className="discovery-receipt"><RequestIdentity record={record} anchorId={`landing-${record.id}`} /><div><strong>{completed ? `${modelLabel} answered.` : stopped ? 'Observation stopped.' : 'No completed reply.'}</strong><p>{completed && record.provider ? `${PROVIDER_NAMES[record.provider]} served the request.${record.status === 'recovered' ? record.model !== record.servedModel ? ' A fallback model completed the reply.' : ' Same model. Another provider.' : ''}` : stopped ? 'Final usage is unknown.' : 'Inspect the recorded cause.'}</p>{record.status === 'recovered' && <p>Recovery happened before output began.</p>}</div><button className="text-button" onClick={event => { event.currentTarget.focus(); onInspect(record); }}>Inspect request <ArrowRight size={13} aria-hidden="true" /></button></div>}
    {completed && record.status === 'success' && <button className="discovery-recovery" onClick={() => onRehearse('provider-failure')}>What if a provider fails? <ArrowRight size={13} aria-hidden="true" /></button>}
    {completed && record.status === 'recovered' && <button className="discovery-recovery" onClick={onExploreRoute}>Adjust this route <ArrowRight size={13} aria-hidden="true" /></button>}

    <div className="discovery-support">
    <details className="discovery-definitions"><summary>What’s a model or provider?</summary><dl><div><dt>Model</dt><dd>The AI that creates a response, such as Claude or GPT.</dd></div><div><dt>Provider</dt><dd>The service that runs that model. The same model can be available through several providers.</dd></div></dl></details>

    <details className="discovery-mechanics"><summary>Request conditions</summary><div className="discovery-mechanics-body"><label className="discovery-scenario"><span>Simulate a scenario</span><span className="discovery-select-wrap"><select value={scenarios.some(item => item.value === scenario) ? scenario : 'healthy'} onChange={event => onScenarioChange(event.target.value as Scenario)} disabled={busy}>{scenarios.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select><ChevronDown size={14} aria-hidden="true" /></span></label><p className="discovery-mechanics-explanation">Provider recovery keeps the same model. Model fallback tries a different model after the primary model’s eligible providers fail.</p></div></details>

    </div>
    <div className="discovery-footer"><span>Prepared output and illustrative timings. No live API call.</span><button className="text-button" onClick={onExploreRoute}>Explore routing controls <ArrowRight size={13} aria-hidden="true" /></button></div>
    <JourneyNote topic="application" />
  </section>;
}
