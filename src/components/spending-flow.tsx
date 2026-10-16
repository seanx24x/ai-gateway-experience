'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CalendarDays, Check, ChevronRight, KeyRound, ShieldCheck } from 'lucide-react';
import { budgetPeriodDescription, type BudgetPeriod, type WorkspaceBudget, type WorkspaceKey, type WorkspaceState } from '@/lib/workspace';

/** Applicable scopes, never a claim about utilization or recorded requests. */
export function BudgetPath({ attribution }: { attribution: WorkspaceKey['attribution'] }) {
  const scopes = attribution === 'member' ? ['API key', 'User', 'Team'] : ['API key', 'Team'];
  return <div className="sc-budget-path" data-scope-lane={attribution} role="group" aria-label={`Applicable documented budgets: ${scopes.join(', ')}`}>
    <div className="sc-budget-local"><KeyRound size={16} aria-hidden="true" /><span><strong>API key budget</strong><small>Editable here</small></span></div>
    <div className="sc-budget-related"><small>Also checked in Vercel</small><div>{scopes.slice(1).map(scope => <span key={scope}>{scope} budget</span>)}</div></div>
  </div>;
}

function useFlowEntry(entryScroll: number) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const flow = input.current?.closest('.sc-flow');
      if (!flow) return;
      const top = Math.max(0, flow.getBoundingClientRect().top + window.scrollY - 24);
      window.scrollTo({ top: Math.min(entryScroll, top), behavior: 'instant' });
      input.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [entryScroll]);
  return input;
}

const periods: { value: BudgetPeriod; label: string }[] = [
  { value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' }, { value: 'none', label: 'No reset' },
];

function FlowBack({ destination, onClose }: { destination: string; onClose: () => void }) {
  return <div className="sc-flow-nav"><button className="text-button" type="button" onClick={onClose}><ArrowLeft size={16} />Back to {destination}</button><span className="demo-label">Demo metadata</span></div>;
}

export function BudgetEditor({ state, budget, initialKeyId, saveError, destination, entryScroll, onSave, onClose }: {
  state: WorkspaceState; budget: WorkspaceBudget | null; initialKeyId?: string; saveError: string; destination: string; entryScroll: number;
  onSave: (next: WorkspaceBudget) => void; onClose: () => void;
}) {
  const entryInput = useFlowEntry(entryScroll);
  const eligibleKeys = state.keys.filter(key => key.status === 'active' && (!state.budgets.some(item => item.keyId === key.id) || key.id === budget?.keyId));
  const [keyId, setKeyId] = useState(budget?.keyId ?? initialKeyId ?? eligibleKeys[0]?.id ?? '');
  const [amount, setAmount] = useState(String(budget?.limitUsd ?? 25));
  const [period, setPeriod] = useState<BudgetPeriod>(budget?.period ?? 'monthly');
  const [enabled, setEnabled] = useState(budget?.enabled ?? true);
  const [error, setError] = useState('');
  const key = eligibleKeys.find(item => item.id === keyId);
  return <section className="sc-flow" role="region" aria-label={budget ? 'Edit demo budget' : 'Create demo budget'}>
    <FlowBack destination={destination} onClose={onClose} />
    <form className="ops-form sc-flow-form" onSubmit={event => {
      event.preventDefault();
      const limitUsd = Number(amount);
      if (!keyId || !Number.isFinite(limitUsd) || limitUsd < 1) { setError('Choose a demo key and enter a limit of at least $1.'); return; }
      onSave({ id: budget?.id ?? `demo_budget_${crypto.randomUUID()}`, keyId, limitUsd, period, enabled });
    }}>
      <div className="sc-flow-context">
        <h2>{budget ? 'Edit budget' : 'Create a budget'}</h2>
        <p>Choose a spending boundary for one API key.</p>
        <label><span className="field-label">Demo API key</span><select value={keyId} onChange={event => setKeyId(event.target.value)} disabled={!!budget} required>{eligibleKeys.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}{!eligibleKeys.length && <option value="">No available demo key</option>}</select></label>
      </div>
      <div className="sc-flow-fields">
        <label className="sc-amount-field"><span className="field-label">Spend limit (USD)</span><span className="sc-amount-input"><span aria-hidden="true">$</span><input ref={entryInput} type="number" min="1" step="0.01" value={amount} onChange={event => { setAmount(event.target.value); setError(''); }} required /></span></label>
        <fieldset className="sc-period-picker"><legend className="field-label">Refresh period</legend><div>{periods.map(option => <label key={option.value}><input type="radio" name="budget-period" value={option.value} checked={period === option.value} onChange={() => setPeriod(option.value)} /><span>{option.label}</span><Check size={13} aria-hidden="true" /></label>)}</div></fieldset>
        <div className="sc-reset-preview" aria-live="polite"><CalendarDays size={16} /><span>{budgetPeriodDescription(period)}.</span></div>
        <label className="ops-checkbox"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /><span>Enable this demo cap</span></label>
        <p className="sc-flow-note"><ShieldCheck size={15} />Saved in this browser. No real spending is enforced.</p>
        {(error || saveError) && <p className="ops-error" role="alert">{error || saveError}</p>}
        <div className="ops-form-footer"><button className="button secondary" type="button" onClick={onClose}>Cancel</button><button className="button primary" type="submit" disabled={!eligibleKeys.length}>Save demo budget</button></div>
      </div>
      <div className="sc-flow-explainer">
        <div className="sc-flow-scope"><span>Applicable scopes</span><BudgetPath attribution={key?.attribution ?? 'team'} /><p>Every applicable cap must allow the request. Scope totals are not additive.</p></div>
        <details className="sc-flow-help"><summary><ChevronRight size={14} />What this cap covers</summary><p>OIDC requests are outside this key’s scope. In production they can count toward project and team budgets. Spend billed through your own provider credentials is excluded from Gateway budgets.</p></details>
      </div>
    </form>
  </section>;
}

export function KeyEditor({ saveError, entryScroll, onSave, onClose }: { saveError: string; entryScroll: number; onSave: (next: WorkspaceKey) => void; onClose: () => void }) {
  const entryInput = useFlowEntry(entryScroll);
  const [name, setName] = useState('');
  const [attribution, setAttribution] = useState<WorkspaceKey['attribution']>('member');
  return <section className="sc-flow" role="region" aria-label="Create demo key metadata">
    <FlowBack destination="keys" onClose={onClose} />
    <form className="ops-form sc-flow-form" onSubmit={event => {
      event.preventDefault();
      if (!name.trim()) return;
      onSave({ id: `demo_key_${crypto.randomUUID()}`, name: name.trim(), attribution, status: 'active', createdAt: Date.now() });
    }}>
      <div className="sc-flow-context">
        <h2>Give your application an identity.</h2>
        <p>A name you’ll recognize, with a clear spending attribution.</p>
      </div>
      <div className="sc-flow-fields">
        <label><span className="field-label">Key name</span><input ref={entryInput} placeholder="e.g. CI coding agent" maxLength={64} value={name} onChange={event => setName(event.target.value)} required /></label>
        <label><span className="field-label">Spend attribution</span><select value={attribution} onChange={event => setAttribution(event.target.value as WorkspaceKey['attribution'])}><option value="member">Member</option><option value="team">Team</option></select></label>
        <p className="sc-flow-note"><KeyRound size={15} />This demo creates metadata. No usable secret is generated.</p>
        {saveError && <p className="ops-error" role="alert">{saveError}</p>}
        <div className="ops-form-footer"><button className="button secondary" type="button" onClick={onClose}>Cancel</button><button className="button primary" type="submit" disabled={!name.trim()}>Create demo metadata</button></div>
      </div>
      <div className="sc-flow-explainer">
        <div className="sc-flow-scope"><span>Applicable scopes</span><BudgetPath attribution={attribution} /><p>{attribution === 'member' ? 'In production, requests count toward the attributed member’s budgets and the team budget.' : 'In production, requests count toward the team budget, with no member budget attribution.'}</p></div>
        <details className="sc-flow-help"><summary><ChevronRight size={14} />Handling a real key</summary><p>A real Gateway key is shown once when created. Store it server side as <code>AI_GATEWAY_API_KEY</code>. On Vercel, project OIDC avoids a manually managed key.</p></details>
      </div>
    </form>
  </section>;
}
