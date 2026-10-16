/**
 * A small, deterministic rehearsal of documented Gateway routing semantics.
 * This is a prototype simulator, not Vercel's provider health or billing engine.
 * Catalog prices are the listed base USD rates per one million tokens; tiered
 * context, caching, tools, and platform add-on charges are not simulated.
 */
export type ProviderId = 'anthropic' | 'bedrock' | 'vertex' | 'openai' | 'azure';

export interface Model {
  id: string;
  name: string;
  creator: string;
  inputPrice: number;
  outputPrice: number;
  context: string;
  providers: ProviderId[];
  description: string;
}

export const CATALOG_DATE = '2026-10-04';
export const CATALOG_SOURCES = [
  'https://vercel.com/ai-gateway/models/claude-sonnet-4.6',
  'https://vercel.com/ai-gateway/models/claude-haiku-4.5',
  'https://vercel.com/ai-gateway/models/gpt-5.4',
];

/** Curated snapshot. Provider availability and team eligibility may change. */
export const MODELS: Model[] = [
  {
    id: 'anthropic/claude-sonnet-4.6',
    name: 'Claude Sonnet 4.6',
    creator: 'Anthropic',
    inputPrice: 3,
    outputPrice: 15,
    context: '1M',
    providers: ['anthropic', 'bedrock', 'vertex'],
    description: 'Reasoning, coding, and agent workflows.',
  },
  {
    id: 'anthropic/claude-haiku-4.5',
    name: 'Claude Haiku 4.5',
    creator: 'Anthropic',
    inputPrice: 1,
    outputPrice: 5,
    context: '200K',
    providers: ['anthropic', 'bedrock', 'vertex'],
    description: 'Fast responses for high-throughput applications.',
  },
  {
    id: 'openai/gpt-5.4',
    name: 'GPT-5.4',
    creator: 'OpenAI',
    inputPrice: 2.5,
    outputPrice: 15,
    context: '1.1M',
    providers: ['openai', 'azure'],
    description: 'Reasoning and multi-step knowledge work.',
  },
];

export const PROVIDER_NAMES: Record<ProviderId, string> = {
  anthropic: 'Anthropic',
  bedrock: 'Amazon Bedrock',
  vertex: 'Google Vertex AI',
  openai: 'OpenAI',
  azure: 'Azure',
};

export interface RoutingConfig {
  slug: string;
  model: string;
  order: ProviderId[];
  only: ProviderId[];
  fallbacks: string[];
  sort: 'default' | 'cost' | 'ttft' | 'tps';
  tags: string[];
  revision: number;
}

export const DEFAULT_CONFIG: RoutingConfig = {
  slug: 'support-agent',
  model: MODELS[0].id,
  order: ['anthropic', 'bedrock', 'vertex'],
  only: [],
  fallbacks: ['openai/gpt-5.4'],
  sort: 'default',
  tags: ['feature:support'],
  revision: 1,
};

export type Scenario =
  | 'healthy'
  | 'provider-failure'
  | 'model-fallback'
  | 'restricted'
  | 'budget'
  | 'rate-limit'
  | 'invalid-key'
  | 'expired-oidc'
  | 'model-unavailable';

export interface Attempt {
  provider: ProviderId;
  model: string;
  status: 'success' | 'failed' | 'excluded';
  latencyMs: number;
  reason: string;
}

export interface RequestRecord {
  /** Demo alias selected by the visitor; the effective snapshot remains concrete. */
  virtualModel?: string;
  id: string;
  timestamp: number;
  model: string;
  /** Empty when no model served a response. */
  servedModel: string;
  provider: ProviderId | null;
  status: 'success' | 'recovered' | 'failed' | 'cancelled';
  attempts: Attempt[];
  inputTokens: number;
  outputTokens: number;
  cost: number;
  /** Zero when no response started; exclude these records from TTFT metrics. */
  ttftMs: number;
  durationMs: number;
  auth: 'oidc' | 'api-key';
  tag: string;
  revision: number;
  response: string;
  scenario: Scenario;
  provenance: 'demo';
  /** The exact effective request options; revision alone is insufficient. */
  configSnapshot?: RoutingConfig;
  /** False after cancellation when final provider usage was not received. */
  usageKnown?: boolean;
  /** Exact workload text, including whitespace; older stored receipts may omit it. */
  prompt?: string;
  /** Local rehearsal provenance, not a Gateway response field. */
  fixtureId?: string;
  sourceId?: string;
  /** Observed cancellation cutoff; final generation duration remains unknown. */
  observedDurationMs?: number;
}

export const DEMO_NOW = Date.UTC(2026, 9, 4, 18, 0, 0);

/** Illustrative fixture metrics, not live provider benchmarks. */
const DEMO_PROVIDER_METRICS: Record<ProviderId, { ttft: number; tps: number; cost: number }> = {
  anthropic: { ttft: 420, tps: 55, cost: 1 },
  bedrock: { ttft: 510, tps: 70, cost: 1 },
  vertex: { ttft: 370, tps: 60, cost: 1 },
  openai: { ttft: 610, tps: 64, cost: 1 },
  azure: { ttft: 650, tps: 93, cost: 1 },
};

export function getModel(id: string): Model | undefined {
  return MODELS.find((model) => model.id === id);
}

export function validateConfig(config: RoutingConfig): string[] {
  const errors: string[] = [];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(config.slug) || config.slug.length > 64) {
    errors.push('Use a slug of up to 64 lowercase letters, numbers, or hyphens.');
  }
  if (!getModel(config.model)) errors.push('Choose a model from the curated catalog.');
  if (!Number.isInteger(config.revision) || config.revision < 1) {
    errors.push('The configuration revision must be a positive whole number.');
  }
  if (!['default', 'cost', 'ttft', 'tps'].includes(config.sort)) {
    errors.push('Choose a supported routing strategy.');
  }
  for (const key of ['order', 'only'] as const) {
    if (config[key].some((provider) => !Object.hasOwn(PROVIDER_NAMES, provider))) {
      errors.push(`The ${key} list contains an unsupported provider.`);
    }
    if (new Set(config[key]).size !== config[key].length) {
      errors.push(`Each provider can appear only once in the ${key} list.`);
    }
  }
  if (config.fallbacks.some((model) => !getModel(model))) {
    errors.push('Choose fallback models from the curated catalog.');
  }
  if (new Set([config.model, ...config.fallbacks]).size !== config.fallbacks.length + 1) {
    errors.push('The primary and fallback models must be different.');
  }
  if (config.tags.some((tag) => !tag.trim()) || new Set(config.tags).size !== config.tags.length) {
    errors.push('Tags must be nonempty and unique.');
  }
  return errors;
}

/** Apply the allowlist first; ordered preferences never widen it. */
export function eligibleProviders(config: RoutingConfig, modelId = config.model): ProviderId[] {
  const model = getModel(modelId);
  if (!model) return [];
  const allowed = model.providers.filter((provider) => !config.only.length || config.only.includes(provider));
  const preferred = config.order.filter((provider) => allowed.includes(provider));
  const remaining = allowed.filter((provider) => !preferred.includes(provider));
  if (config.sort !== 'default') {
    const option = config.sort;
    remaining.sort((a, b) => {
      const difference = DEMO_PROVIDER_METRICS[a][option] - DEMO_PROVIDER_METRICS[b][option];
      return option === 'tps' ? -difference : difference;
    });
  }
  return [...preferred, ...remaining];
}

/** Deliberate fault injection stays separate from the saved route. */
export function scenarioConfig(config: RoutingConfig, scenario: Scenario): RoutingConfig {
  const snapshot = structuredClone(config);
  if (scenario === 'restricted') {
    const firstEligible = eligibleProviders(config)[0];
    // Do not widen an existing allowlist if the primary has no eligible provider.
    if (firstEligible) snapshot.only = [firstEligible];
  }
  return snapshot;
}

export function inferenceCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const model = getModel(modelId);
  if (!model) return 0;
  return (inputTokens * model.inputPrice + outputTokens * model.outputPrice) / 1_000_000;
}

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) {
    result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  }
  return result >>> 0;
}

function demoResponse(prompt: string): string {
  if (/haiku|poem/i.test(prompt)) {
    return 'One request takes flight\nQuiet paths carry the answer\nYour next thought arrives';
  }
  if (/gateway|routing|fallback/i.test(prompt)) {
    return 'AI Gateway gives your application one connection to multiple models and inference providers. Choose a model, set provider preferences and fallback models, then inspect the request to see which route served the response. The model creator and the inference provider can be different.';
  }
  if (/code|typescript|function/i.test(prompt)) {
    return 'Start with one server-side request using the AI SDK. Keep credentials in the environment, choose a supported model slug, and record the returned usage and routing metadata. Add provider or model fallbacks where your workload needs them, then test failure behavior before shipping.';
  }
  return 'Build a support assistant that turns a customer question into a useful next step. Retrieve relevant help content, draft a concise response, and hand uncertain cases to a person. Start with a small scope, inspect real requests, and improve the experience using measured latency, cost, and failure behavior.';
}

/**
 * Faults happen before any output. Each successful record has exactly one
 * successful attempt; no failed request implies free production inference.
 * Fixed defaults make a rehearsal reproducible. UI may supply a current time.
 */
export function simulateRequest(
  config: RoutingConfig,
  scenario: Scenario,
  prompt: string,
  id = `demo_${hash(JSON.stringify({ config, scenario, prompt })).toString(16)}`,
  timestamp = DEMO_NOW,
): RequestRecord {
  config = scenarioConfig(config, scenario);
  const record: RequestRecord = {
    id,
    timestamp,
    model: config.model,
    servedModel: '',
    provider: null,
    status: 'failed',
    attempts: [],
    inputTokens: 0,
    outputTokens: 0,
    cost: 0,
    ttftMs: 0,
    durationMs: 0,
    auth: 'oidc',
    tag: config.tags[0] ?? 'untagged',
    revision: config.revision,
    response: '',
    scenario,
    provenance: 'demo',
    configSnapshot: structuredClone(config),
    usageKnown: true,
    prompt,
  };
  const errors = validateConfig(config);
  if (errors.length) {
    record.response = errors.join(' ');
    return record;
  }
  if (!prompt.trim()) {
    record.response = 'Write a prompt before sending a request.';
    return record;
  }
  if (scenario === 'invalid-key' || scenario === 'expired-oidc' || scenario === 'model-unavailable') {
    record.durationMs = 24;
    const messages = {
      'invalid-key': '401 · Simulated invalid Gateway API key. An explicit AI_GATEWAY_API_KEY takes precedence over OIDC, including when the key is invalid. Check the key and its team scope before retrying.',
      'expired-oidc': '401 · Simulated expired local OIDC token. Local tokens from vercel env pull expire after 12 hours. Run vercel env pull again, then retry. Vercel deployment OIDC is refreshed automatically.',
      'model-unavailable': 'Simulated model unavailable for this team. Check current catalog availability and credit-tier eligibility before choosing a model or retrying.',
    };
    record.response = messages[scenario];
    return record;
  }
  if (scenario === 'budget') {
    record.durationMs = 24;
    record.response = '402 · Simulated Gateway budget rejection. Review the budgets that apply to this request’s identity and attribution before retrying. BYOK spend is excluded from Gateway budgets.';
    return record;
  }

  let elapsed = 18;
  let failedAttempts = 0;
  const candidates = [config.model, ...config.fallbacks];
  for (let modelIndex = 0; modelIndex < candidates.length; modelIndex++) {
    const modelId = candidates[modelIndex];
    const model = getModel(modelId)!;
    const providers = eligibleProviders(config, modelId);
    const excluded = model.providers.filter((provider) => !providers.includes(provider));
    for (const provider of excluded) {
      record.attempts.push({
        model: modelId,
        provider,
        status: 'excluded',
        latencyMs: 0,
        reason: 'Excluded by the provider allowlist. No request sent.',
      });
    }
    for (const provider of providers) {
      const mustFail = scenario === 'restricted' || scenario === 'rate-limit'
        || (scenario === 'model-fallback' && modelIndex === 0)
        || (scenario === 'provider-failure' && failedAttempts === 0);
      if (mustFail) {
        const latencyMs = 1280 + failedAttempts * 90;
        elapsed += latencyMs;
        failedAttempts++;
        record.attempts.push({
          model: modelId,
          provider,
          status: 'failed',
          latencyMs,
          reason: scenario === 'rate-limit'
            ? 'Simulated upstream provider rate limit (429). No output started.'
            : scenario === 'restricted'
              ? 'Simulated outage within the allowed provider set. No output started.'
              : 'Simulated provider unavailable (503). No output started.',
        });
        continue;
      }
      const variation = hash(`${id}:${provider}:${prompt}`) % 81;
      const latencyMs = DEMO_PROVIDER_METRICS[provider].ttft + variation;
      elapsed += latencyMs;
      record.attempts.push({
        model: modelId,
        provider,
        status: 'success',
        latencyMs,
        reason: failedAttempts
          ? 'Response started after a failed attempt. Simulated recovery.'
          : 'Response started on the first eligible provider.',
      });
      record.provider = provider;
      record.servedModel = modelId;
      record.status = failedAttempts || modelIndex > 0 ? 'recovered' : 'success';
      record.response = demoResponse(prompt);
      // Illustrative token counts, not a tokenizer or model-generated usage.
      record.inputTokens = Math.ceil(prompt.length / 4) + 164;
      record.outputTokens = Math.ceil(record.response.length / 4);
      record.cost = inferenceCost(modelId, record.inputTokens, record.outputTokens);
      record.ttftMs = elapsed;
      record.durationMs = elapsed + Math.round(record.outputTokens / DEMO_PROVIDER_METRICS[provider].tps * 1000);
      return record;
    }
  }
  record.durationMs = elapsed;
  record.response = scenario === 'rate-limit'
    ? '429 · All eligible providers in this simulation returned an upstream rate limit before output. Respect Retry-After and use exponential backoff before retrying.'
    : 'No eligible provider completed the simulated request. The provider allowlist applies to every fallback model. Review the allowed providers or retry when they recover.';
  return record;
}

/** Preserve observed events and partial output without inventing final usage. */
export function cancelRequest(record: RequestRecord, shownAttempts: number, partialOutput: string, elapsedMs?: number): RequestRecord {
  const attempts = structuredClone(record.attempts.slice(0, Math.max(0, shownAttempts)));
  const served = attempts.find((attempt) => attempt.status === 'success');
  return {
    ...record,
    status: 'cancelled',
    attempts,
    provider: served?.provider ?? null,
    servedModel: served?.model ?? '',
    inputTokens: 0,
    outputTokens: 0,
    cost: 0,
    ttftMs: served ? 18 + attempts.reduce((total, attempt) => total + attempt.latencyMs, 0) : 0,
    durationMs: 0,
    observedDurationMs: elapsedMs === undefined ? undefined : Math.max(0, elapsedMs),
    response: partialOutput,
    usageKnown: false,
    configSnapshot: record.configSnapshot ? structuredClone(record.configSnapshot) : undefined,
  };
}

export interface RehearsalProvider {
  available: boolean;
  /** Fixed time to failure or first output, independent of route position. */
  latencyMs: number;
  throughputTps: number;
  reason: string;
}

export interface RehearsalFixture {
  id: string;
  prompt: string;
  auth: RequestRecord['auth'];
  inputTokens: number;
  outputTokens: number;
  response: string;
  sourceId: string | null;
  providers: Record<ProviderId, RehearsalProvider>;
  provenance: 'demo';
}

/**
 * Hold a workload and illustrative provider conditions constant for comparison.
 * An observed failed provider stays failed when reordered. Unobserved providers
 * use local fixtures, not inferred production health. Null source deliberately
 * injects an Anthropic outage so the first rehearsal has a useful recovery case.
 */
export function createRehearsalFixture(source: RequestRecord | null, prompt: string): RehearsalFixture {
  const exactPrompt = source?.prompt ?? prompt;
  const completed = source?.status === 'success' || source?.status === 'recovered';
  const knownUsage = completed && source?.usageKnown !== false;
  const response = completed ? source.response : demoResponse(exactPrompt);
  const providers = Object.fromEntries(
    (Object.keys(PROVIDER_NAMES) as ProviderId[]).map((provider) => {
      const failed = source?.attempts.find((attempt) => attempt.provider === provider && attempt.status === 'failed');
      const served = source?.attempts.find((attempt) => attempt.provider === provider && attempt.status === 'success');
      const unavailable = !!failed || (!source && provider === 'anthropic');
      const streamMs = source && served ? source.durationMs - source.ttftMs : 0;
      return [provider, {
        available: !unavailable,
        latencyMs: failed?.latencyMs ?? served?.latencyMs
          ?? (unavailable ? 1280 : DEMO_PROVIDER_METRICS[provider].ttft + hash(`${provider}:${exactPrompt}`) % 81),
        throughputTps: knownUsage && served && streamMs > 0 && source.outputTokens > 0
          ? source.outputTokens / streamMs * 1000
          : DEMO_PROVIDER_METRICS[provider].tps,
        reason: failed?.reason ?? (unavailable
          ? 'Fixed demo condition: Anthropic unavailable before output.'
          : served ? 'Observed response start retained in this local fixture.'
            : 'Illustrative available provider; not observed in the source request.'),
      } satisfies RehearsalProvider];
    }),
  ) as Record<ProviderId, RehearsalProvider>;
  const fixture = {
    prompt: exactPrompt,
    auth: source?.auth ?? 'oidc',
    inputTokens: knownUsage ? source.inputTokens : Math.ceil(exactPrompt.length / 4) + 164,
    outputTokens: knownUsage ? source.outputTokens : Math.ceil(response.length / 4),
    response,
    sourceId: source?.id ?? null,
    providers,
    provenance: 'demo' as const,
  };
  return { id: `fixture_${hash(JSON.stringify(fixture)).toString(16)}`, ...fixture };
}

/** Same fixture, same input and provider conditions; this is not an optimizer. */
export function rehearseRequest(
  config: RoutingConfig,
  fixture: RehearsalFixture,
  id: string,
  timestamp: number,
): RequestRecord {
  // Reuse validation and receipt shape, then project the fixed conditions below.
  const record = simulateRequest(config, 'healthy', fixture.prompt, id, timestamp);
  record.auth = fixture.auth;
  record.fixtureId = fixture.id;
  if (fixture.sourceId) record.sourceId = fixture.sourceId;
  if (validateConfig(config).length || !fixture.prompt.trim()) return record;
  Object.assign(record, {
    attempts: [], provider: null, servedModel: '', status: 'failed',
    inputTokens: 0, outputTokens: 0, cost: 0, ttftMs: 0, durationMs: 0, response: '',
  });
  const primaryProviders = eligibleProviders(config);
  record.scenario = primaryProviders.length && primaryProviders.every((provider) => !fixture.providers[provider].available)
    ? 'model-fallback'
    : primaryProviders.some((provider) => !fixture.providers[provider].available) ? 'provider-failure' : 'healthy';
  let elapsed = 18;
  let failures = 0;
  for (const [modelIndex, modelId] of [config.model, ...config.fallbacks].entries()) {
    const model = getModel(modelId)!;
    const providers = eligibleProviders(config, modelId);
    for (const provider of model.providers.filter((candidate) => !providers.includes(candidate))) {
      record.attempts.push({ provider, model: modelId, status: 'excluded', latencyMs: 0,
        reason: 'Excluded by the provider allowlist. No request sent.' });
    }
    for (const provider of providers) {
      const condition = fixture.providers[provider];
      elapsed += condition.latencyMs;
      record.attempts.push({ provider, model: modelId,
        status: condition.available ? 'success' : 'failed', latencyMs: condition.latencyMs,
        reason: condition.available ? 'Response started under the same fixed rehearsal conditions.' : condition.reason });
      if (!condition.available) { failures++; continue; }
      record.provider = provider;
      record.servedModel = modelId;
      record.status = failures || modelIndex > 0 ? 'recovered' : 'success';
      record.inputTokens = fixture.inputTokens;
      record.outputTokens = fixture.outputTokens;
      record.response = fixture.response;
      record.cost = inferenceCost(modelId, fixture.inputTokens, fixture.outputTokens);
      record.ttftMs = elapsed;
      record.durationMs = elapsed + Math.round(fixture.outputTokens / condition.throughputTps * 1000);
      return record;
    }
  }
  record.durationMs = elapsed;
  record.response = 'No eligible provider completed this rehearsal under the fixed provider conditions. The allowlist applies to every fallback model.';
  return record;
}

/** 48 synthetic requests across eight hours; bucket six illustrates recovery. */
export function createSeedRequests(anchor = DEMO_NOW): RequestRecord[] {
  const hour = 3_600_000;
  const start = Math.floor(anchor / hour) * hour - 8 * hour;
  const records: RequestRecord[] = [];
  for (let bucket = 0; bucket < 8; bucket++) {
    for (let item = 0; item < 6; item++) {
      const index = bucket * 6 + item;
      const spike = bucket === 5;
      const scenario: Scenario = spike ? 'provider-failure' : 'healthy';
      const model = !spike && index % 5 === 0 ? MODELS[1].id : MODELS[0].id;
      const config: RoutingConfig = {
        ...DEFAULT_CONFIG,
        model,
        order: index % 4 === 0 && !spike ? ['bedrock', 'anthropic', 'vertex'] : [...DEFAULT_CONFIG.order],
        tags: [index % 4 === 0 ? 'feature:search' : 'feature:support'],
      };
      const request = simulateRequest(
        config,
        scenario,
        `Suggest a useful support response for demo customer ${index + 1}.`,
        `demo_seed_${String(index + 1).padStart(3, '0')}`,
        start + bucket * hour + item * 8 * 60_000 + 2 * 60_000,
      );
      request.auth = index % 4 === 0 ? 'api-key' : 'oidc';
      // The fixtures contain complete usage; receipts and charts use this data.
      request.inputTokens = 520 + index * 37;
      request.outputTokens = 124 + index % 7 * 23;
      request.cost = inferenceCost(request.servedModel, request.inputTokens, request.outputTokens);
      request.durationMs = request.ttftMs + Math.round(request.outputTokens / DEMO_PROVIDER_METRICS[request.provider!].tps * 1000);
      records.push(request);
    }
  }
  return records.sort((a, b) => b.timestamp - a.timestamp);
}

export interface Metrics {
  count: number;
  spend: number;
  /** Percentage from 0 to 100, excluding cancellations; null means no sample. */
  successRate: number | null;
  /** Nearest-rank P75, in milliseconds, for successful/recovered requests. */
  p75Ttft: number | null;
  /** Total input plus output tokens per completed request with known usage. */
  avgTokens: number | null;
  recovered: number;
  successful: number;
  failed: number;
  cancelled: number;
  unknownUsage: number;
}

export function getMetrics(requests: RequestRecord[]): Metrics {
  const completed = requests.filter((request) => request.status === 'success' || request.status === 'recovered');
  const knownUsage = completed.filter((request) => request.usageKnown !== false);
  const knownOutcomes = requests.filter((request) => request.status !== 'cancelled');
  const ttft = completed.map((request) => request.ttftMs).sort((a, b) => a - b);
  return {
    count: requests.length,
    spend: requests.reduce((total, request) => total + (request.status === 'cancelled' || request.usageKnown === false ? 0 : request.cost), 0),
    successRate: knownOutcomes.length ? completed.length / knownOutcomes.length * 100 : null,
    p75Ttft: ttft.length ? ttft[Math.ceil(ttft.length * 0.75) - 1] : null,
    avgTokens: knownUsage.length
      ? knownUsage.reduce((total, request) => total + request.inputTokens + request.outputTokens, 0) / knownUsage.length
      : null,
    recovered: requests.filter((request) => request.status === 'recovered').length,
    successful: completed.length,
    failed: requests.filter((request) => request.status === 'failed').length,
    cancelled: requests.filter((request) => request.status === 'cancelled').length,
    unknownUsage: requests.filter((request) => request.status === 'cancelled' || request.usageKnown === false).length,
  };
}

export function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

/** Concrete-model code rehearses the draft; saving a Virtual Model is separate. */
export function routingCode(config: RoutingConfig, style: 'sdk' | 'openai' = 'sdk'): string {
  const options: Record<string, string[] | string> = {};
  if (config.order.length) options.order = config.order;
  if (config.only.length) options.only = config.only;
  if (config.fallbacks.length) options.models = config.fallbacks;
  if (config.sort !== 'default') options.sort = config.sort;
  if (config.tags.length) options.tags = config.tags;
  const formatted = JSON.stringify(options, null, 2);
  if (style === 'openai') {
    return `// Server-side. Set AI_GATEWAY_API_KEY in your environment.\nimport OpenAI from 'openai';\n\nconst client = new OpenAI({\n  baseURL: 'https://ai-gateway.vercel.sh/v1',\n  apiKey: process.env.AI_GATEWAY_API_KEY,\n});\n\nconst result = await client.chat.completions.create({\n  model: ${JSON.stringify(config.model)},\n  messages: [{ role: 'user', content: 'Describe a useful AI feature.' }],\n  // Gateway extension fields are not in the upstream SDK types.\n  ...{ providerOptions: { gateway: ${formatted.replaceAll('\n', '\n  ')} } },\n});\n\nconsole.log(result.choices[0]?.message.content);`;
  }
  return `// Server-side. Use a Gateway key locally or deployment OIDC on Vercel.\nimport { generateText } from 'ai';\n\nconst result = await generateText({\n  model: ${JSON.stringify(config.model)},\n  prompt: 'Describe a useful AI feature.',\n  providerOptions: {\n    gateway: ${formatted.replaceAll('\n', '\n    ')},\n  },\n});\n\nconsole.log(result.text);`;
}
