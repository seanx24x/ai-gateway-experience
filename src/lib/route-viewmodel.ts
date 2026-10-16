import { getModel, PROVIDER_NAMES, type ProviderId, type RequestRecord, type RoutingConfig } from './gateway';

export type RouteMode = 'preview' | 'live' | 'receipt' | 'replay';
export type RouteStatus = 'idle' | 'active' | 'success' | 'failed' | 'excluded';
export type RouteSelection = { modelId: string; providerId: string; attemptIndex?: number };
export type RouteRow = {
  key: string;
  modelId: string;
  provider: ProviderId;
  name: string;
  status: RouteStatus;
  preferencePosition?: number;
  attemptIndex?: number;
  attemptNumber?: number;
  latencyMs?: number;
  reason?: string;
};
export type RouteStage = {
  key: string;
  modelId: string;
  modelName: string;
  role: 'primary' | 'fallback';
  preferred: RouteRow[];
  pool: RouteRow[];
  observed: RouteRow[];
  excluded: RouteRow[];
  reached: boolean;
};

export const ROUTE_STRATEGY_LABELS: Record<RoutingConfig['sort'], string> = {
  default: 'Automatic routing', cost: 'Lowest cost', ttft: 'Fastest first token', tps: 'Highest throughput',
};

/** Preferences describe policy. The automatic pool does not predict a trace. */
export function previewRouteStages(config: RoutingConfig): RouteStage[] {
  return [config.model, ...config.fallbacks].map((modelId, index) => {
    const model = getModel(modelId);
    const available = model?.providers ?? [];
    const eligible = available.filter(provider => !config.only.length || config.only.includes(provider));
    const preferred = config.order.filter(provider => eligible.includes(provider));
    const row = (provider: ProviderId, status: RouteStatus, preferencePosition?: number): RouteRow => ({
      key: `${modelId}:${provider}`, modelId, provider, name: PROVIDER_NAMES[provider], status, preferencePosition,
    });
    return {
      key: `${modelId}:${index}`, modelId, modelName: model?.name ?? modelId,
      role: index === 0 ? 'primary' : 'fallback', observed: [], reached: false,
      preferred: preferred.map((provider, position) => row(provider, 'idle', position + 1)),
      pool: eligible.filter(provider => !preferred.includes(provider)).map(provider => row(provider, 'idle')),
      excluded: available.filter(provider => !eligible.includes(provider)).map(provider => row(provider, 'excluded')),
    };
  });
}

/** The observed path is ordered by receipt evidence, including repeated providers. */
export function observedRouteStages(record: RequestRecord, shownAttempts = record.attempts.length, activeAttemptIndex: number | null = null): RouteStage[] {
  const config = record.configSnapshot;
  const previews = config ? previewRouteStages(config) : [];
  const stages: RouteStage[] = [];
  let attemptNumber = 0;
  // ReplayFrame counts completed entries; its active index is the in-flight
  // entry immediately beyond that count and must also be visible.
  const visibleCount = Math.max(0, shownAttempts, activeAttemptIndex === null ? 0 : activeAttemptIndex + 1);
  const observed = record.attempts.slice(0, visibleCount);
  observed.forEach((attempt, attemptIndex) => {
    if (attempt.status === 'excluded') return;
    let stage = stages.at(-1);
    if (!stage || stage.modelId !== attempt.model) {
      const preview = previews.find(item => item.modelId === attempt.model);
      stage = {
        key: `${attempt.model}:observed:${attemptIndex}`, modelId: attempt.model,
        modelName: getModel(attempt.model)?.name ?? attempt.model,
        role: attempt.model === record.model ? 'primary' : 'fallback', reached: true,
        preferred: [], pool: [], observed: [], excluded: preview?.excluded ?? [],
      };
      stages.push(stage);
    }
    attemptNumber++;
    stage.observed.push({
      key: `${attempt.model}:${attempt.provider}:attempt:${attemptIndex}`,
      modelId: attempt.model, provider: attempt.provider, name: PROVIDER_NAMES[attempt.provider],
      status: attemptIndex === activeAttemptIndex ? 'active' : attempt.status,
      attemptIndex, attemptNumber,
      latencyMs: attemptIndex === activeAttemptIndex ? undefined : attempt.latencyMs,
      reason: attemptIndex === activeAttemptIndex ? undefined : attempt.reason,
    });
  });

  // Older stored receipts may lack a configuration snapshot. Preserve their
  // observed exclusions as disclosures, never as steps along an attempted path.
  if (!config) for (const [attemptIndex, attempt] of observed.entries()) {
    if (attempt.status !== 'excluded') continue;
    let stage = stages.find(item => item.modelId === attempt.model);
    if (!stage) {
      stage = {
        key: `${attempt.model}:excluded:${attemptIndex}`, modelId: attempt.model,
        modelName: getModel(attempt.model)?.name ?? attempt.model,
        role: attempt.model === record.model ? 'primary' : 'fallback', reached: false,
        preferred: [], pool: [], observed: [], excluded: [],
      };
      stages.push(stage);
    }
    stage.excluded.push({
      key: `${attempt.model}:${attempt.provider}:excluded:${attemptIndex}`,
      modelId: attempt.model, provider: attempt.provider, name: PROVIDER_NAMES[attempt.provider],
      status: 'excluded', reason: attempt.reason,
    });
  }

  // Add unused candidates without exposing the simulator's future attempt order.
  for (const [previewIndex, preview] of previews.entries()) {
    const matching = stages.filter(stage => stage.modelId === preview.modelId);
    const stage = matching.at(-1);
    if (stage) {
      const attempted = new Set(matching.flatMap(item => item.observed.map(row => row.provider)));
      stage.pool = [...preview.preferred, ...preview.pool].filter(row => !attempted.has(row.provider)).map(row => ({ ...row, preferencePosition: undefined }));
    } else {
      const unused = { ...preview, preferred: [], pool: [...preview.preferred, ...preview.pool].map(row => ({ ...row, preferencePosition: undefined })) };
      // A primary with no eligible provider can have no attempted stop while
      // a fallback does. Keep that skipped policy stage before the fallback.
      const insertion = stages.findIndex(item => previews.findIndex(candidate => candidate.modelId === item.modelId) > previewIndex);
      if (insertion >= 0) stages.splice(insertion, 0, unused);
      else stages.push(unused);
    }
  }
  if (!stages.length) stages.push({
    key: `${record.model}:empty`, modelId: record.model, modelName: getModel(record.model)?.name ?? record.model,
    role: 'primary', preferred: [], pool: [], observed: [], excluded: [], reached: false,
  });
  return stages;
}

/** Reorder one model's preferences without losing preferences for another model. */
export function replaceModelPreferenceOrder(config: RoutingConfig, modelId: string, next: ProviderId[]): ProviderId[] {
  const modelProviders = getModel(modelId)?.providers ?? [];
  const old = config.order.filter(provider => modelProviders.includes(provider) && (!config.only.length || config.only.includes(provider)));
  const valid = [...new Set(next)].filter(provider => modelProviders.includes(provider) && (!config.only.length || config.only.includes(provider)));
  let index = 0;
  const result: ProviderId[] = [];
  for (const provider of config.order) {
    if (old.includes(provider)) {
      if (index < valid.length) result.push(valid[index++]);
    } else result.push(provider);
  }
  result.push(...valid.slice(index));
  return result;
}
