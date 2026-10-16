import {
  createRehearsalFixture,
  PROVIDER_NAMES,
  type ProviderId,
  type RehearsalFixture,
  type RequestRecord,
  type RoutingConfig,
} from './gateway';

export interface WorkingSource {
  readonly record: RequestRecord;
  readonly prompt: string;
  /** Legacy receipts can lack application-captured input. */
  readonly promptOrigin: 'captured' | 'fallback';
  readonly config: RoutingConfig;
  readonly configOrigin: 'captured' | 'fallback';
  readonly fixture: RehearsalFixture;
}

function freezeSnapshot<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeSnapshot(child);
    Object.freeze(value);
  }
  return value;
}

/** Capture evidence without sharing mutable references with the working draft. */
export function captureWorkingSource(
  record: RequestRecord,
  fallbackPrompt: string,
  fallbackConfig: RoutingConfig,
): WorkingSource {
  const receipt = structuredClone(record);
  const prompt = receipt.prompt ?? fallbackPrompt;
  return freezeSnapshot<WorkingSource>({
    record: receipt,
    prompt,
    promptOrigin: receipt.prompt === undefined ? 'fallback' : 'captured',
    config: structuredClone(receipt.configSnapshot ?? fallbackConfig),
    configOrigin: receipt.configSnapshot === undefined ? 'fallback' : 'captured',
    fixture: createRehearsalFixture(receipt, prompt),
  });
}

function policySignature(config: RoutingConfig | null) {
  if (!config) return null;
  // Revision is save/activation metadata, rather than an effective request option.
  return {
    slug: config.slug,
    model: config.model,
    order: config.order,
    only: config.only,
    fallbacks: config.fallbacks,
    sort: config.sort,
    tags: config.tags,
  };
}

/** A tested draft is valid only for its captured source, input, and conditions. */
export function workingComparisonSignature(
  draft: RoutingConfig,
  fixture: RehearsalFixture,
  source: RequestRecord | null = null,
  baseline: RoutingConfig | null = source?.configSnapshot ?? null,
): string {
  return JSON.stringify({
    draft: policySignature(draft),
    baseline: policySignature(baseline),
    source: source ? {
      id: source.id,
      revision: source.revision,
      prompt: source.prompt ?? null,
      auth: source.auth,
      virtualModel: source.virtualModel ?? null,
    } : null,
    fixture: {
      id: fixture.id,
      sourceId: fixture.sourceId,
      prompt: fixture.prompt,
      auth: fixture.auth,
      inputTokens: fixture.inputTokens,
      outputTokens: fixture.outputTokens,
      response: fixture.response,
      provenance: fixture.provenance,
      providers: (Object.keys(PROVIDER_NAMES) as ProviderId[]).map(provider => {
        const condition = fixture.providers[provider];
        return {
          provider,
          available: condition.available,
          latencyMs: condition.latencyMs,
          throughputTps: condition.throughputTps,
          reason: condition.reason,
        };
      }),
    },
  });
}
