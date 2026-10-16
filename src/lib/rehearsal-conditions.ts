import { PROVIDER_NAMES, type ProviderId, type RehearsalFixture } from './gateway';

/** Experiment state is deliberately separate from deployable routing policy. */
export type RehearsalConditions = Partial<Record<ProviderId, boolean>>;
export interface RehearsalContext { base: RehearsalFixture; overrides: RehearsalConditions; }
const providers = Object.keys(PROVIDER_NAMES) as ProviderId[];

export function withRehearsalConditions(base: RehearsalFixture, overrides: RehearsalConditions): RehearsalFixture {
  const fixture = structuredClone(base);
  for (const provider of providers) {
    const available = overrides[provider];
    if (available === undefined) continue;
    fixture.providers[provider] = { ...fixture.providers[provider], available,
      reason: available ? 'Edited demo condition: provider restored before testing.' : 'Edited demo condition: provider unavailable before output.' };
  }
  // Stable identity includes the effective conditions, never the order of edits.
  const signature = JSON.stringify(providers.map(provider => [provider, fixture.providers[provider].available]));
  let hash = 2166136261;
  for (const char of signature) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  fixture.id = Object.keys(overrides).length ? `${base.id}_conditions_${(hash >>> 0).toString(16)}` : base.id;
  return fixture;
}

export function restoreRehearsalContext(value: unknown): RehearsalContext | null {
  try {
    const context = value as RehearsalContext;
    const base = context.base;
    if (!base || typeof base.id !== 'string' || typeof base.prompt !== 'string' || typeof base.response !== 'string'
      || !['oidc', 'api-key'].includes(base.auth) || base.provenance !== 'demo'
      || !(base.sourceId === null || typeof base.sourceId === 'string')
      || ![base.inputTokens, base.outputTokens].every(number => Number.isFinite(number) && number >= 0)
      || !context.overrides || typeof context.overrides !== 'object' || Array.isArray(context.overrides)) return null;
    if (!providers.every(provider => {
      const condition = base.providers[provider];
      return condition && typeof condition.available === 'boolean' && typeof condition.reason === 'string'
        && Number.isFinite(condition.latencyMs) && condition.latencyMs >= 0
        && Number.isFinite(condition.throughputTps) && condition.throughputTps > 0;
    })) return null;
    if (!Object.entries(context.overrides).every(([provider, available]) => providers.includes(provider as ProviderId) && typeof available === 'boolean')) return null;
    return structuredClone(context);
  } catch { return null; }
}
