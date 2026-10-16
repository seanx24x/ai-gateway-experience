import { restoreRehearsalContext, type RehearsalContext } from './rehearsal-conditions';
import { DEFAULT_CONFIG, MODELS, validateConfig, type RoutingConfig } from './gateway';

export function createVirtualModel(slug: string, model: string, existing: RoutingConfig[]): { config: RoutingConfig | null; error: string | null } {
  const config: RoutingConfig = { ...structuredClone(DEFAULT_CONFIG), slug: slug.trim(), model, order: [], only: [], fallbacks: [], tags: [], revision: 1 };
  const errors = validateConfig(config);
  if (errors.length) return { config: null, error: errors[0] };
  if (existing.some(item => item.slug === config.slug)) return { config: null, error: 'That alias already exists. Choose another slug.' };
  return { config, error: null };
}

export function restoreVirtualModels(value: unknown, active: RoutingConfig): RoutingConfig[] {
  const valid = Array.isArray(value) ? value.filter((item): item is RoutingConfig => {
    try { return item && typeof item === 'object' && Array.isArray(item.order) && Array.isArray(item.only) && Array.isArray(item.fallbacks) && Array.isArray(item.tags) && validateConfig(item).length === 0; } catch { return false; }
  }) : [];
  return [...new Map([structuredClone(DEFAULT_CONFIG), ...valid, active].map(config => [config.slug, structuredClone(config)])).values()];
}

export function isVirtualModelAlias(value: unknown): value is string {
  return typeof value === 'string' && /^vmc\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 68;
}

export function concreteModelConfig(model: string, current: RoutingConfig): RoutingConfig {
  const available = MODELS.find(item => item.id === model)?.providers ?? [];
  return { ...structuredClone(current), model, order: current.order.filter(provider => available.includes(provider)), fallbacks: current.fallbacks.filter(id => id !== model), only: [] };
}

export interface VirtualModelSession { draft: RoutingConfig; pending: RoutingConfig | null; sourceId: string | null; rehearsal?: RehearsalContext; }
export function restoreVirtualModelSessions(value: unknown): Record<string, VirtualModelSession> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0,100).filter(([slug, entry]) => {
    try {
      const session = entry as VirtualModelSession;
      return session && session.draft?.slug === slug && validateConfig(session.draft).length === 0 && (!session.pending || session.pending.slug === slug && validateConfig(session.pending).length === 0) && (session.sourceId === null || typeof session.sourceId === 'string');
    } catch { return false; }
  }).map(([slug, entry]) => {
    const session = entry as VirtualModelSession;
    const rehearsal = restoreRehearsalContext(session.rehearsal);
    return [slug, { draft: session.draft, pending: session.pending, sourceId: session.sourceId,
      ...(rehearsal && rehearsal.base.sourceId === session.sourceId ? { rehearsal } : {}) }];
  })) as Record<string, VirtualModelSession>;
}
