import { getModel, type RequestRecord } from './gateway';

export interface RequestGuidance {
  kind: 'authentication' | 'budget' | 'eligibility' | 'routing' | 'rate-limit' | 'inspect';
  title: string;
  description: string;
  actionLabel: string;
}

/**
 * Advice from this demo's recorded evidence. Scenario and reason strings belong
 * to the local simulator; they are not additional Gateway response metadata.
 */
export function getRequestGuidance(record: RequestRecord): RequestGuidance {
  if (record.status === 'cancelled') return {
    kind: 'inspect',
    title: 'The application stopped observing.',
    description: 'The completed attempts and partial output remain available. Final provider usage is unknown, so review what was observed before starting a new request.',
    actionLabel: 'Review observed output',
  };

  if (record.status === 'failed') {
    const evidence = [record.response, ...record.attempts.map(attempt => attempt.reason)].join(' ');
    if (record.scenario === 'expired-oidc' || record.scenario === 'invalid-key' || /\b401\b/.test(evidence)) {
      const expiredOidc = record.scenario === 'expired-oidc' || /expired.*oidc|oidc.*expired/i.test(evidence);
      return expiredOidc ? {
        kind: 'authentication',
        title: 'Refresh the local project identity.',
        description: 'This demo records an expired local OIDC token. Run vercel env pull again in your project, then retry. Deployment OIDC is refreshed automatically.',
        actionLabel: 'Review OIDC setup',
      } : {
        kind: 'authentication',
        title: 'Check the Gateway API key.',
        description: 'An explicit AI_GATEWAY_API_KEY takes precedence over OIDC. Check that the key is valid and belongs to the intended team before retrying.',
        actionLabel: 'Review API key setup',
      };
    }
    if (record.scenario === 'budget' || /\b402\b/.test(evidence)) return {
      kind: 'budget',
      title: 'Review the applicable budgets.',
      description: `The demo request was rejected before a provider attempt. ${record.auth === 'oidc' ? 'Check the team and project budgets for this project identity.' : 'Check the team, API key, and any attributed team member budgets. API-key traffic does not count toward a project budget.'} Changing provider order does not resolve this rejection.`,
      actionLabel: 'Review budget guidance',
    };
    if (record.scenario === 'model-unavailable') return {
      kind: 'eligibility',
      title: 'Check model availability for your team.',
      description: 'No provider attempt started. Check current model availability and credit-tier eligibility before selecting an available model or retrying.',
      actionLabel: 'Review model availability',
    };
    if (!getModel(record.model) || /Choose a model from the curated catalog|Choose fallback models from the curated catalog/.test(evidence)) return {
      kind: 'eligibility',
      title: 'Choose an available model.',
      description: 'This demo could not validate the model configuration. Check the primary and fallback model IDs against the current catalog before sending a request.',
      actionLabel: 'Review model configuration',
    };
    if (record.attempts.length > 0 && record.attempts.every(attempt => attempt.status === 'excluded')) return {
      kind: 'eligibility',
      title: 'The allowlist left no eligible provider.',
      description: 'Every recorded provider was excluded, so no request was sent to a provider. The allowlist applies to the primary model and every fallback model.',
      actionLabel: 'Review provider eligibility',
    };
    if (record.scenario === 'rate-limit' || /\b429\b/.test(evidence)) return {
      kind: 'rate-limit',
      title: 'Eligible providers were rate limited.',
      description: 'Review the failed attempts, respect Retry-After when it is returned, and use exponential backoff before retrying. This receipt does not record a Retry-After value.',
      actionLabel: 'Review retry guidance',
    };
  }

  const failedAttempts = record.attempts.filter(attempt => attempt.status === 'failed');
  if (record.status === 'recovered' || failedAttempts.length > 0) return {
    kind: 'routing',
    title: record.status === 'recovered' ? 'Recovery preserved the response.' : 'The attempted providers could not respond.',
    description: record.status === 'recovered'
      ? `${failedAttempts.reduce((total, attempt) => total + attempt.latencyMs, 0).toLocaleString('en-US')} ms were spent on failed attempts in this fixture. Preserve the workload and policy, then compare a draft under the same provider conditions.`
      : 'The trace records provider failures before output. Preserve this workload and policy to compare a draft; review the allowlist across fallback models as well as provider preferences.',
    actionLabel: 'Test an adjustment',
  };

  return record.status === 'success' ? {
    kind: 'inspect',
    title: 'A direct path to the response.',
    description: 'No provider failure is recorded. Review the served model, response, and usage before deciding whether a route change is needed.',
    actionLabel: 'Review response and usage',
  } : {
    kind: 'inspect',
    title: 'The request did not reach a provider.',
    description: 'Review the recorded explanation and request configuration before retrying. There is no provider attempt to diagnose in this receipt.',
    actionLabel: 'Review request setup',
  };
}

type RecordIdentity = string | Pick<RequestRecord, 'id'>;
const identity = (record: RecordIdentity) => typeof record === 'string' ? record : record.id;

export function requestRole(record: RecordIdentity): 'Baseline' | 'Draft' | 'Request' {
  const id = identity(record);
  return id.startsWith('demo_baseline_') ? 'Baseline' : id.startsWith('demo_draft_') ? 'Draft' : 'Request';
}

/** Keep the comparison role visible even when both records share a suffix. */
export function visibleRequestIdentity(record: RecordIdentity): string {
  const id = identity(record).replace(/^demo_/, '');
  const role = requestRole(record);
  if (role !== 'Request') return `${role.toLowerCase()}_${id.replace(/^(baseline|draft)_/, '').slice(-12)}`;
  return id.length <= 20 ? id : `${id.slice(0, 7)}…${id.slice(-9)}`;
}

/** Actual UTC dates avoid identical hour labels across distinct chart days. */
export function formatRequestHour(timestamp: number, bucketTimestamps: readonly number[]): string {
  const date = new Date(timestamp);
  const time = date.toISOString().slice(11, 16);
  const day = date.toISOString().slice(0, 10);
  const multipleDays = bucketTimestamps.some(bucket => new Date(bucket).toISOString().slice(0, 10) !== day);
  return multipleDays ? `${day} · ${time}` : time;
}
