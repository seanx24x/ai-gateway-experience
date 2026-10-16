import type { RequestRecord } from './gateway';

export type JourneyView = 'overview' | 'dashboard' | 'connect' | 'playground' | 'routes' | 'monitor' | 'models' | 'virtual-models' | 'leaderboards' | 'documentation' | 'budgets' | 'keys' | 'byok' | 'settings';
export type JourneyTarget = { view: JourneyView; requestId?: string; model?: string; alias?: string };
export type JourneyOrigin = { requestId: string; href: string; view: JourneyView };

export type GuidanceAction = 'run' | 'recover' | 'inspect' | 'adjust' | 'test' | 'review' | 'activate' | 'verify' | 'monitor' | 'diagnose' | 'navigate' | 'edit-route';
export type GuidanceContext = {
  view: JourneyView;
  busy: boolean;
  result: RequestRecord | null;
  inspectedId: string | null;
  dirty: boolean;
  pendingRevision: number | null;
  activeRevision: number;
  tested: boolean;
  hasRecovered?: boolean;
  visibleRequests?: readonly RequestRecord[];
  testOutcome?: RequestRecord['status'] | 'stale' | null;
  selectedModel?: string | null;
  selectedAlias?: string | null;
  referenceTask?: 'request' | 'authentication' | 'routing' | 'observability';
  saved?: boolean;
  uncappedKeys?: number;
};
export type ActionGuidance = { key: string; title: string; description: string; label: string; action: GuidanceAction; target?: JourneyTarget };

/** Suggestions follow evidence, rather than page visits or copied instructions. */
export function getActionGuidance(context: GuidanceContext): ActionGuidance | null {
  const { view, result } = context;
  if (context.busy) return null;
  if (view === 'routes') {
    if (context.pendingRevision !== null) return { key: `activate:${context.pendingRevision}`, title: 'Your revision is saved.', description: 'Activation is separate. New requests will use it after you activate.', label: 'Activate demo revision', action: 'activate' };
    if (context.testOutcome === 'failed' || context.testOutcome === 'cancelled') return { key: 'correct-draft', title: 'This draft did not complete the request.', description: 'Inspect eligibility and failed attempts before changing or testing this policy again.', label: 'Edit route', action: 'edit-route' };
    if (context.testOutcome === 'stale' && (context.dirty || context.activeRevision <= 1)) return { key: 'retest-draft', title: 'The draft has changed since this test.', description: 'Compare again under the same provider conditions before treating the result as current.', label: 'Test this draft', action: 'test' };
    if (context.dirty && context.tested) return { key: 'review', title: 'You can see the consequence.', description: 'Review the changes before saving a revision.', label: 'Review changes', action: 'review' };
    if (context.dirty) return { key: 'test', title: 'You changed the route.', description: 'Compare it with the baseline under the same provider conditions.', label: 'Test this draft', action: 'test' };
    if (context.activeRevision > 1 && (!result || result.revision !== context.activeRevision)) return { key: `verify:${context.activeRevision}`, title: 'Verify the active revision.', description: 'A new request gives you evidence of the revision it used.', label: 'Send a verification request', action: 'verify' };
    if (context.activeRevision > 1 && result?.revision === context.activeRevision && (result.status === 'failed' || result.status === 'cancelled')) return { key: `verify-stopped:${result.id}`, title: `Revision r${result.revision} was observed. The request did not complete.`, description: 'Inspect its cause before calling this a successful verification.', label: 'Inspect verification outcome', action: 'inspect', target: { view: 'playground', requestId: result.id } };
    if (context.activeRevision > 1 && result?.revision === context.activeRevision) return { key: `verified:${result.id}`, title: `This request used r${result.revision}.`, description: 'Its receipt preserves the configuration and observed attempts.', label: 'Inspect verification', action: 'inspect' };
    return { key: 'shape', title: 'Shape the route. See the consequence.', description: 'Move a provider to change preference, then test a failure.', label: 'Test the current route', action: 'test' };
  }
  if (view === 'monitor') {
    const candidate = context.visibleRequests?.find(record => record.status === 'failed' || record.status === 'cancelled') ?? context.visibleRequests?.find(record => record.status === 'recovered');
    if (context.visibleRequests) return candidate ? { key: `scope:${candidate.id}`, title: candidate.status === 'recovered' ? 'A response recovered inside this scope.' : 'This scope contains an incomplete request.', description: 'Follow its recorded attempts and cause. Every suggestion respects the visible filters.', label: candidate.status === 'recovered' ? 'Inspect a recovered request' : 'Inspect the outcome', action: 'monitor', target: { view: 'monitor', requestId: candidate.id } } : null;
    return context.hasRecovered === false ? null : { key: 'monitor', title: 'Follow recovery to its cause.', description: 'A successful response can still contain a failed provider attempt.', label: 'Inspect a recovered request', action: 'monitor' };
  }
  if (view === 'models') return context.selectedModel ? { key: `try:${context.selectedModel}`, title: 'Try the model against your workload.', description: 'Its model identifier travels into Playground. Provider eligibility is evaluated separately.', label: 'Try this model', action: 'navigate', target: { view: 'playground', model: context.selectedModel } } : null;
  if (view === 'virtual-models') return context.selectedAlias ? { key: `route:${context.selectedAlias}`, title: 'A stable name. An inspectable policy.', description: 'Open the alias to shape provider preference, restrictions and fallback before testing.', label: 'Inspect routing', action: 'navigate', target: { view: 'routes', alias: context.selectedAlias } } : { key: 'underlying-model', title: 'Start with the model behind the name.', description: 'Choose the capability first, then give its routing policy a stable alias.', label: 'Choose an underlying model', action: 'navigate', target: { view: 'models' } };
  if (view === 'leaderboards') return { key: 'evaluate-model', title: 'Popularity is a starting point.', description: 'Use the catalog to inspect a model, then try it on your own task. Usage is not answer quality.', label: 'Explore models', action: 'navigate', target: { view: 'models' } };
  if (view === 'documentation') {
    const destination = context.referenceTask === 'authentication' ? 'connect' : context.referenceTask === 'routing' ? 'routes' : context.referenceTask === 'observability' ? 'monitor' : 'connect';
    return { key: `reference:${destination}`, title: 'Put the reference into practice.', description: 'Continue with your selected model and client. Official documentation remains available for the full interface.', label: destination === 'connect' ? 'Review connection setup' : destination === 'routes' ? 'Shape a route' : destination === 'monitor' ? 'Inspect recorded requests' : 'Try in Playground', action: 'navigate', target: { view: destination, model: context.selectedModel ?? undefined } };
  }
  if (view === 'dashboard') return { key: 'explore-records', title: 'From a signal to its request.', description: 'Inspect a dot or open the table. Browser demo receipts represent no live provider health or billing balance.', label: 'All request logs', action: 'navigate', target: { view: 'monitor' } };
  if (view === 'keys') return { key: 'key-coverage', title: context.uncappedKeys ? 'Give each key an explicit boundary.' : 'Review the boundaries around your keys.', description: 'API-key budgets cover that credential lane. Individual usage is not attributed to these demo key rows.', label: 'Review API-key budgets', action: 'navigate', target: { view: 'budgets' } };
  if (view === 'budgets') return { key: 'budget-identity', title: 'The boundary follows the credential.', description: 'Review which API key a cap belongs to. OIDC and provider-credential billing have different coverage.', label: 'Review API keys', action: 'navigate', target: { view: 'keys' } };
  if (view === 'byok') return { key: 'provider-evidence', title: 'Configuration and request evidence are separate.', description: 'These receipts cannot establish which provider credential served a request. Inspect their recorded route without inferring BYOK use.', label: 'Inspect recorded requests', action: 'navigate', target: { view: 'monitor' } };
  if (view === 'settings') return context.saved ? { key: 'saved-preferences', title: 'Your display preferences are saved.', description: 'See them applied to the same recorded activity on Overview.', label: 'See on Overview', action: 'navigate', target: { view: 'dashboard' } } : null;
  if (view === 'connect') return { key: 'connect', title: 'Try the result before integrating.', description: 'The prepared example runs here. Your editor draft runs in your own project.', label: 'Run the demo request', action: 'run' };
  if (!result) return { key: 'first-request', title: 'Start with a useful response.', description: 'Send the prepared request, then follow its route.', label: 'Send a request', action: 'run' };
  if (context.activeRevision > 1 && result.revision === context.activeRevision && result.status !== 'failed' && result.status !== 'cancelled' && context.inspectedId !== result.id) return { key: `verified:${result.id}`, title: `This request used r${result.revision}.`, description: 'Inspect the receipt to verify the configuration and observed route.', label: 'Inspect verification', action: 'inspect' };
  if (result.status === 'failed' || result.status === 'cancelled') return { key: `diagnose:${result.id}`, title: 'The receipt keeps the evidence.', description: 'Inspect where the request stopped and the relevant next action.', label: 'Inspect this request', action: 'diagnose' };
  if (result.status === 'recovered') {
    if (context.inspectedId === result.id) return { key: `adjust:${result.id}`, title: 'Turn the evidence into an adjustment.', description: 'Carry this request and its exact configuration into a draft.', label: 'Shape this route', action: 'adjust' };
    return { key: `inspect:${result.id}`, title: 'The reply arrived through another route.', description: 'Inspect the attempt that failed and the provider that recovered.', label: 'Inspect recovery', action: 'inspect' };
  }
  return { key: `recover:${result.id}`, title: 'Now make a provider fail.', description: 'See how Gateway can recover before the response starts.', label: 'Try a provider failure', action: 'recover' };
}

export function pageGuidance(view: JourneyView, extra: Partial<GuidanceContext> = {}): ActionGuidance | null {
  return getActionGuidance({ busy: false, result: null, inspectedId: null, dirty: false, pendingRevision: null, activeRevision: 1, tested: false, ...extra, view });
}

export function restoreJourneyOrigin(value: unknown, records: readonly RequestRecord[]): JourneyOrigin | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<JourneyOrigin>;
  if (typeof candidate.requestId !== 'string' || typeof candidate.href !== 'string' || typeof candidate.view !== 'string' || !records.some(record => record.id === candidate.requestId)) return null;
  if (!candidate.href.startsWith('/') || candidate.href.startsWith('//')) return null;
  let url: URL;
  try { url = new URL(candidate.href, 'https://gateway-concept.invalid'); } catch { return null; }
  if (url.origin !== 'https://gateway-concept.invalid') return null;
  const path = candidate.view === 'overview' ? '/' : `/${candidate.view}`;
  const views: JourneyView[] = ['overview','dashboard','connect','playground','routes','monitor','models','virtual-models','leaderboards','documentation','budgets','keys','byok','settings'];
  return views.includes(candidate.view as JourneyView) && url.pathname === path && url.searchParams.get('request') === candidate.requestId ? candidate as JourneyOrigin : null;
}
