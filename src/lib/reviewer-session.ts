import { PROVIDER_NAMES, validateConfig, type RequestRecord, type RoutingConfig } from './gateway';

export function isStoredRoute(value: unknown): value is RoutingConfig {
  try { return Boolean(value && typeof value === 'object' && validateConfig(value as RoutingConfig).length === 0); } catch { return false; }
}
/** Drop malformed optional entries without throwing away intact reviewer evidence. */
export function restoreReviewerReceipts(value: unknown): RequestRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((record): record is RequestRecord => {
    try {
      if (!record || typeof record !== 'object') return false;
      if (!['id','model','servedModel','tag','response','scenario'].every(key => typeof record[key] === 'string')) return false;
      if (!['timestamp','inputTokens','outputTokens','cost','ttftMs','durationMs','revision'].every(key => Number.isFinite(record[key]) && record[key] >= 0)) return false;
      if (record.timestamp > 8.64e15 || !['success','recovered','failed','cancelled'].includes(record.status) || !['oidc','api-key'].includes(record.auth)) return false;
      if (record.provenance !== 'demo' || !(record.provider === null || record.provider in PROVIDER_NAMES)) return false;
      if (!Array.isArray(record.attempts) || !record.attempts.every((attempt: Record<string, unknown>) => attempt && typeof attempt.model === 'string' && typeof attempt.reason === 'string' && typeof attempt.provider === 'string' && attempt.provider in PROVIDER_NAMES && ['success','failed','excluded'].includes(attempt.status as string) && Number.isFinite(attempt.latencyMs) && Number(attempt.latencyMs) >= 0)) return false;
      return record.configSnapshot === undefined || isStoredRoute(record.configSnapshot);
    } catch { return false; }
  }).slice(0, 200);
}
