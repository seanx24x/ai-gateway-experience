/** Reviewer commentary is separate from product configuration and request evidence. */
export type ReviewerChapterId = 'understand' | 'trust' | 'control' | 'adopt' | 'operate';

export interface ReviewerDestination {
  view: string;
  label: string;
  goal: string;
  decision: string;
  href?: string;
}

export interface ReviewerChapter {
  id: ReviewerChapterId;
  title: string;
  headline: string;
  mission: string;
  reflection: string;
  route: string;
  userGoal: string;
  opportunity: string;
  problem: string;
  decision: string;
  tradeoff: string;
  craft: string;
  evidence: string;
  validation: string;
  sources: { label: string; href: string }[];
  destinations: ReviewerDestination[];
}

const DOCS = 'https://vercel.com/docs/ai-gateway';

export const REVIEW_CHAPTERS: readonly ReviewerChapter[] = [
  {
    id: 'understand', title: 'Understand', headline: 'Start with something useful.',
    mission: 'Run the prepared support request. See the reply before exploring the infrastructure behind it.',
    reflection: 'The customer task comes first. Its request becomes the thread through the rest of the experience.',
    route: '/',
    userGoal: 'Understand what Gateway makes possible and whether it fits an application.',
    opportunity: 'Vercel presents access to many models through one connection. My hypothesis is that a useful first result gives that promise a concrete starting point.',
    problem: 'In the earlier prototype, request controls and routing explanations competed with the reason to use Gateway.',
    decision: 'I put a support conversation in the foreground, then reveal its model, serving provider and request evidence after the reply.',
    tradeoff: 'One text example keeps the introduction focused. It does not demonstrate every Gateway modality or workload.',
    craft: 'A single request surface anchors the page. Quiet labels support the prompt and reply; responsive layouts retain the same reading order and visible action.',
    evidence: 'Run Request produces a simulated reply and an inspectable receipt. The selected model can continue into discovery or Connect.',
    validation: 'Can someone new to Gateway explain what it does after one request, without mistaking the simulated reply for a live model response?',
    sources: [{ label: 'AI Gateway product', href: 'https://vercel.com/ai-gateway' }],
    destinations: [
      { view: 'overview', label: 'Home', goal: 'Understand Gateway through a useful request.', decision: 'Lead with the application and disclose infrastructure through the result.' },
      { view: 'models', label: 'Model catalog', goal: 'Narrow model choices by capability and price.', decision: 'Keep model discovery connected to experimentation and integration.' },
      { view: 'models', label: 'Model detail', href: '/models?model=anthropic%2Fclaude-sonnet-4.6', goal: 'Understand a model and its candidate serving providers.', decision: 'Distinguish the model creator from the providers that can serve it.' },
      { view: 'leaderboards', label: 'Leaderboards', goal: 'Find a useful signal for further evaluation.', decision: 'Separate public usage rankings from local estimates; popularity is not application quality.' },
      { view: 'documentation', label: 'Documentation', goal: 'Find guidance relevant to the current task.', decision: 'Organize reference entry around making requests, authentication, routing and observation.' },
    ],
  },
  {
    id: 'trust', title: 'Trust', headline: 'Make resilience visible.',
    mission: 'Try a provider failure, then inspect the recovered request. Find the failed attempt and the provider that served the reply.',
    reflection: 'A success badge alone cannot explain recovery. Keeping the failed attempt makes the outcome understandable.',
    route: '/',
    userGoal: 'Understand what happened when a request encountered a provider failure.',
    opportunity: 'Gateway supports provider failover. I explored how to make that reliability inspectable at the level of one request.',
    problem: 'A final reply and serving-provider label concealed the earlier failed attempt and its time before output.',
    decision: 'I retain every recorded attempt beside its cause and interval. The same receipt opens from the reply, its chart signal and Logs.',
    tradeoff: 'Showing attempts adds detail. I keep the reply dominant and reveal the deeper record when someone chooses to inspect it.',
    craft: 'Aligned time lanes share an elapsed-time scale. Refined semantic color distinguishes recovery and failure; replay follows the recorded sequence without changing its timing values.',
    evidence: 'The recovery test keeps the customer task intact. Inspect the unsuccessful attempt, serving provider and first-output time, then replay the receipt without creating another request.',
    validation: 'Can someone identify the delay and distinguish provider recovery, model fallback, replay and a new request?',
    sources: [
      { label: 'Provider ordering and filtering', href: `${DOCS}/models-and-providers/provider-filtering-and-ordering` },
      { label: 'Model fallbacks', href: `${DOCS}/models-and-providers/model-fallbacks` },
    ],
    destinations: [
      { view: 'playground', label: 'Playground and receipts', goal: 'Experiment with a prompt and understand its outcome.', decision: 'Connect prompt, response and request evidence without an opening side pane.' },
    ],
  },
  {
    id: 'control', title: 'Control', headline: 'Change the route. See the consequence.',
    mission: 'Move a provider earlier, then Test Draft. Compare Original and Draft under the same simulated provider conditions.',
    reflection: 'The route is an instrument: policy changes are immediate, while their consequences require an explicit, inspectable test.',
    route: '/routes',
    userGoal: 'Adjust routing deliberately and understand the consequence before carrying it forward.',
    opportunity: 'Gateway offers provider preferences, restrictions and model fallbacks. My proposal brings these choices into one working surface with controlled comparison.',
    problem: 'Repeated policy summaries made the earlier routing screen dense, while separate records made the consequence of an edit difficult to compare.',
    decision: 'I made provider rows directly reorderable and pinned simulation conditions separately from policy. Original and Draft run the same workload and fixture.',
    tradeoff: 'A controlled fixture isolates the demonstrated change, but is not a forecast of production latency, output quality or provider health.',
    craft: 'Distinct drag, inspection and outage controls retain clear targets. Movement follows the reorder; keyboard Move Earlier and Move Later offer the same policy change. Settings expand in the page.',
    evidence: 'Reorder without creating a request, inspect the generated code, then compare receipts. Editing policy or conditions makes an earlier test stale. Review, simulated activation and verification remain separate.',
    validation: 'Can someone predict eligible providers, explain the comparison and identify which revision a later request used?',
    sources: [
      { label: 'Provider ordering and filtering', href: `${DOCS}/models-and-providers/provider-filtering-and-ordering` },
      { label: 'Virtual Models', href: `${DOCS}/models-and-providers/virtual-models` },
    ],
    destinations: [
      { view: 'routes', label: 'Routing', goal: 'Shape and test the policy for one workload.', decision: 'Keep preferences, restrictions, simulation conditions and observed attempts distinct.' },
      { view: 'virtual-models', label: 'Virtual Models', goal: 'Reuse a named configuration while understanding its current policy.', decision: 'Keep the alias stable and preserve historical request snapshots when its draft changes.' },
    ],
  },
  {
    id: 'adopt', title: 'Adopt', headline: 'Carry the intent into your app.',
    mission: 'Continue into Connect and review the prepared integration brief. See which choices travelled with the route.',
    reflection: 'A handoff should preserve intent and make its limits explicit. A prepared editor draft is a starting point for integration.',
    route: '/connect',
    userGoal: 'Connect Gateway to a new app, an existing app or a coding agent with relevant instructions.',
    opportunity: 'Gateway supports existing SDK interfaces and coding-agent setup. I explored continuity from evaluation into the tools where developers integrate it.',
    problem: 'Showing intent, environment, client and authentication controls together made the earlier Connect screen read like a form before there was a clear task.',
    decision: 'I use a sentence to establish intent and disclose one decision at a time. The reviewed brief carries model, client, environment, authentication and supported route options.',
    tradeoff: 'Editor links depend on installed tools and cannot verify execution. A visible prompt, copy fallback and downloadable starter keep the handoff reviewable.',
    craft: 'Large sentence choices create hierarchy without adding color. The connection artifact responds to selections; shared alignment and concise summaries keep the flow visually steady.',
    evidence: 'Review the prepared brief, switch integration paths and inspect the generated code. Simulation outages stay out of exported configuration. Opening an editor never marks the app connected.',
    validation: 'Can someone review the intended change, recover from an unavailable editor and distinguish app integration from configuring the coding agent itself?',
    sources: [
      { label: 'Getting started', href: `${DOCS}/getting-started` },
      { label: 'Authentication', href: `${DOCS}/authentication-and-byok` },
      { label: 'Coding-agent setup', href: 'https://vercel.com/docs/cli/ai-gateway#setup' },
    ],
    destinations: [
      { view: 'connect', label: 'Connect', goal: 'Prepare an integration appropriate to the application and environment.', decision: 'Carry context into a reviewable editor brief and keep real verification in the developer’s project.' },
    ],
  },
  {
    id: 'operate', title: 'Operate', headline: 'Turn a signal into an explanation.',
    mission: 'Select a request signal on Overview, inspect its receipt, then follow the same request into Logs.',
    reflection: 'Observation becomes useful when a signal leads to a cause, a preserved request and a next action.',
    route: '/dashboard',
    userGoal: 'Understand request outcomes, investigate a specific event and see the boundaries of operational controls.',
    opportunity: 'Gateway brings routing, billing and observability together. My hypothesis is that preserving context between them can support clearer operational decisions.',
    problem: 'Separate charts, tables and configuration pages risked leaving the viewer to reconstruct which request or credential a signal concerned.',
    decision: 'I connect each recorded signal to its receipt and scoped Logs. Credential and budget pages explain their coverage without claiming usage evidence the demo does not contain.',
    tradeoff: 'This browser stores simulated receipts and policy metadata. It cannot establish live provider health, per-key spend, credential validation or real billing enforcement.',
    craft: 'Quiet chart structure gives outcomes semantic emphasis. Hover, keyboard selection and receipt identity connect the signal to a full-width explanation; filters remain available on return.',
    evidence: 'Inspect the same request from Overview and Logs. Review API-key budget coverage and the separate provider-credential billing path. Follow a failed receipt back to its relevant adjustment.',
    validation: 'Can someone find the cause of a request outcome and explain which control applies without inferring unrecorded credential or billing data?',
    sources: [
      { label: 'Request Logs', href: `${DOCS}/observability-and-spend/logs` },
      { label: 'AI Gateway product', href: 'https://vercel.com/ai-gateway' },
    ],
    destinations: [
      { view: 'dashboard', label: 'Overview', goal: 'See recorded activity and find requests worth inspecting.', decision: 'Lead chart signals into individual receipts instead of leaving them as isolated metrics.' },
      { view: 'monitor', label: 'Logs', goal: 'Narrow recorded requests and explain an outcome.', decision: 'Preserve filters and request identity through inspection and route adjustment.' },
      { view: 'budgets', label: 'Budgets & Spend', goal: 'Understand the configured limit and its credential coverage.', decision: 'Make the budget boundary explicit and avoid presenting configured limits as measured spend.' },
      { view: 'keys', label: 'API Keys', goal: 'Understand credential metadata and its relationship to controls.', decision: 'Connect key metadata to budget coverage without inventing per-key usage.' },
      { view: 'byok', label: 'Bring Your Own Key', goal: 'Understand provider credentials and their billing path.', decision: 'Separate provider-account billing, Gateway credits and unvalidated demo connection metadata.' },
      { view: 'settings', label: 'Settings', goal: 'Understand and review workspace preferences and governance choices.', decision: 'Show consequences and distinguish saved local preferences from production enforcement.' },
    ],
  },
];

export interface ReviewerProgress {
  chapter: ReviewerChapterId;
  visited: ReviewerChapterId[];
  demonstrated: ReviewerChapterId[];
  skipped: ReviewerChapterId[];
  destinations: string[];
  finished: boolean;
}

export type ReviewerEvent =
  | { type: 'visited'; chapter: ReviewerChapterId }
  | { type: 'demonstrated'; chapter: ReviewerChapterId }
  | { type: 'skipped'; chapter: ReviewerChapterId }
  | { type: 'destination'; view: string }
  | { type: 'finished' };

export function reviewerChapter(value: unknown): ReviewerChapter | null {
  return REVIEW_CHAPTERS.find(chapter => chapter.id === value) ?? null;
}

export function initialReviewerProgress(): ReviewerProgress {
  return { chapter: 'understand', visited: [], demonstrated: [], skipped: [], destinations: [], finished: false };
}

const DESTINATION_VIEWS = new Set(REVIEW_CHAPTERS.flatMap(chapter => chapter.destinations.map(destination => destination.view)));

/** Invalid reviewer data never invalidates product records. Unknown fields are ignored. */
export function restoreReviewerProgress(value: unknown): ReviewerProgress | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<ReviewerProgress>;
  if (!reviewerChapter(candidate.chapter)) return null;
  const chapters = (items: unknown): ReviewerChapterId[] => Array.isArray(items)
    ? [...new Set(items.filter((item): item is ReviewerChapterId => reviewerChapter(item) !== null))]
    : [];
  const demonstrated = chapters(candidate.demonstrated);
  const skipped = chapters(candidate.skipped).filter(chapter => !demonstrated.includes(chapter));
  return {
    chapter: candidate.chapter as ReviewerChapterId,
    visited: [...new Set([...chapters(candidate.visited), ...demonstrated, ...skipped])],
    demonstrated,
    skipped,
    destinations: Array.isArray(candidate.destinations)
      ? [...new Set(candidate.destinations.filter((item): item is string => typeof item === 'string' && DESTINATION_VIEWS.has(item)))]
      : [],
    finished: candidate.finished === true,
  };
}

/** Add reviewer context without discarding product query parameters or the fragment. */
export function reviewerHref(path: string, chapter: ReviewerChapterId): string {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || !reviewerChapter(chapter)) return '/review';
  try {
    const url = new URL(path, 'https://gateway-concept.invalid');
    if (url.origin !== 'https://gateway-concept.invalid') return '/review';
    url.searchParams.set('review', chapter);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return '/review'; }
}

/** Navigation is not demonstration. The integration reports only observed product actions. */
export function recordReviewerEvent(progress: ReviewerProgress, event: ReviewerEvent): ReviewerProgress {
  const next = { ...progress, visited: [...progress.visited], demonstrated: [...progress.demonstrated], skipped: [...progress.skipped], destinations: [...progress.destinations] };
  const add = <T,>(items: T[], item: T) => { if (!items.includes(item)) items.push(item); };
  if (event.type === 'finished') return { ...next, finished: true };
  if (event.type === 'destination') {
    if (DESTINATION_VIEWS.has(event.view)) add(next.destinations, event.view);
    return next;
  }
  if (!reviewerChapter(event.chapter)) return next;
  add(next.visited, event.chapter);
  if (event.type === 'visited') next.chapter = event.chapter;
  if (event.type === 'demonstrated') {
    add(next.demonstrated, event.chapter);
    next.skipped = next.skipped.filter(chapter => chapter !== event.chapter);
  }
  if (event.type === 'skipped' && !next.demonstrated.includes(event.chapter)) add(next.skipped, event.chapter);
  return next;
}
