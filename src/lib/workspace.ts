import { DEMO_NOW, PROVIDER_NAMES, getMetrics, type ProviderId, type RequestRecord } from './gateway';

export type BudgetPeriod = 'daily' | 'weekly' | 'monthly' | 'none';
export interface WorkspaceBudget {
  id: string;
  keyId: string;
  limitUsd: number;
  period: BudgetPeriod;
  enabled: boolean;
}
export interface WorkspaceKey {
  id: string;
  name: string;
  createdAt: number;
  attribution: 'team' | 'member';
  status: 'active' | 'revoked';
}
export interface WorkspaceConnection {
  id: string;
  provider: ProviderId;
  label: string;
  createdAt: number;
  enabled: boolean;
}
export interface WorkspaceSettings {
  name: string;
  activityDensity: 'comfortable' | 'compact';
  showWorkloadPreview: boolean;
}
/** Browser-local metadata only. No credential, billing, or enforcement state. */
export interface WorkspaceState {
  version: 1;
  budgets: WorkspaceBudget[];
  keys: WorkspaceKey[];
  connections: WorkspaceConnection[];
  settings: WorkspaceSettings;
}

export function defaultWorkspace(): WorkspaceState {
  return {
    version: 1,
    keys: [
      { id: 'demo_key_local', name: 'Local development', createdAt: DEMO_NOW - 86_400_000 * 4, attribution: 'member', status: 'active' },
      { id: 'demo_key_agent', name: 'Coding agent', createdAt: DEMO_NOW - 86_400_000 * 2, attribution: 'team', status: 'active' },
    ],
    budgets: [{ id: 'demo_budget_agent', keyId: 'demo_key_agent', limitUsd: 25, period: 'monthly', enabled: true }],
    connections: [],
    settings: { name: 'Acme', activityDensity: 'comfortable', showWorkloadPreview: false },
  };
}

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isName = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 64;
const isId = (value: unknown): value is string => typeof value === 'string' && /^demo_[a-z0-9_-]{1,100}$/i.test(value);
const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const onlyFields = (value: Record<string, unknown>, names: string[]) => Object.keys(value).every(name => names.includes(name));
const uniqueIds = (items: { id: string }[]) => new Set(items.map(item => item.id)).size === items.length;

/** Reject malformed persisted metadata and fields that could hold secrets. */
export function validateWorkspaceState(value: unknown): value is WorkspaceState {
  if (!isObject(value) || !onlyFields(value, ['version', 'budgets', 'keys', 'connections', 'settings']) || value.version !== 1) return false;
  if (!Array.isArray(value.keys) || !Array.isArray(value.budgets) || !Array.isArray(value.connections) || !isObject(value.settings)) return false;
  if (value.keys.length > 100 || value.budgets.length > 100 || value.connections.length > 100) return false;
  if (!value.keys.every(key => isObject(key) && onlyFields(key, ['id', 'name', 'createdAt', 'attribution', 'status'])
    && isId(key.id) && isName(key.name) && isTime(key.createdAt) && typeof key.attribution === 'string' && ['team', 'member'].includes(key.attribution) && typeof key.status === 'string' && ['active', 'revoked'].includes(key.status))) return false;
  if (!value.budgets.every(budget => isObject(budget) && onlyFields(budget, ['id', 'keyId', 'limitUsd', 'period', 'enabled'])
    && isId(budget.id) && isId(budget.keyId) && typeof budget.limitUsd === 'number' && Number.isFinite(budget.limitUsd) && budget.limitUsd >= 1
    && typeof budget.period === 'string' && ['daily', 'weekly', 'monthly', 'none'].includes(budget.period) && typeof budget.enabled === 'boolean')) return false;
  if (!value.connections.every(connection => isObject(connection) && onlyFields(connection, ['id', 'provider', 'label', 'createdAt', 'enabled'])
    && isId(connection.id) && typeof connection.provider === 'string' && Object.hasOwn(PROVIDER_NAMES, connection.provider)
    && isName(connection.label) && isTime(connection.createdAt) && typeof connection.enabled === 'boolean')) return false;
  const settings = value.settings;
  if (!onlyFields(settings, ['name', 'activityDensity', 'showWorkloadPreview']) || !isName(settings.name)
    || typeof settings.activityDensity !== 'string' || !['comfortable', 'compact'].includes(settings.activityDensity) || typeof settings.showWorkloadPreview !== 'boolean') return false;
  const keys = value.keys as WorkspaceKey[];
  const budgets = value.budgets as WorkspaceBudget[];
  const connections = value.connections as WorkspaceConnection[];
  return uniqueIds(keys) && uniqueIds(budgets) && uniqueIds(connections)
    && new Set(budgets.map(budget => budget.keyId)).size === budgets.length
    && budgets.every(budget => keys.some(key => key.id === budget.keyId));
}

function validated(next: WorkspaceState): WorkspaceState {
  if (!validateWorkspaceState(next)) throw new Error('Check the demo metadata. Names are required, budget limits start at $1, and each key has at most one budget.');
  return next;
}

export function addWorkspaceKey(state: WorkspaceState, key: WorkspaceKey): WorkspaceState {
  return validated({ ...state, keys: [...state.keys, { ...key, name: key.name.trim() }] });
}

/** Restoring is deliberately a reversible demo action, not real key recovery. */
export function setWorkspaceKeyStatus(state: WorkspaceState, keyId: string, status: WorkspaceKey['status']): WorkspaceState {
  if (!state.keys.some(key => key.id === keyId)) throw new Error('That demo key is no longer available.');
  return validated({ ...state, keys: state.keys.map(key => key.id === keyId ? { ...key, status } : key) });
}

export function upsertWorkspaceBudget(state: WorkspaceState, budget: WorkspaceBudget): WorkspaceState {
  const existing = state.budgets.find(item => item.keyId === budget.keyId && item.id !== budget.id);
  if (existing) throw new Error('This demo key already has a budget. Edit that budget instead.');
  return validated({ ...state, budgets: [...state.budgets.filter(item => item.id !== budget.id), { ...budget }] });
}

export function removeWorkspaceBudget(state: WorkspaceState, id: string): WorkspaceState {
  return validated({ ...state, budgets: state.budgets.filter(budget => budget.id !== id) });
}

export function addWorkspaceConnection(state: WorkspaceState, connection: WorkspaceConnection): WorkspaceState {
  return validated({ ...state, connections: [...state.connections, { ...connection, label: connection.label.trim() }] });
}

export function setWorkspaceConnectionEnabled(state: WorkspaceState, id: string, enabled: boolean): WorkspaceState {
  if (!state.connections.some(connection => connection.id === id)) throw new Error('That demo connection is no longer available.');
  return validated({ ...state, connections: state.connections.map(connection => connection.id === id ? { ...connection, enabled } : connection) });
}

export function saveWorkspaceSettings(state: WorkspaceState, settings: WorkspaceSettings): WorkspaceState {
  return validated({ ...state, settings: { ...settings, name: settings.name.trim() } });
}

/** Auth-lane totals cannot be attributed to any mock key or BYOK connection. */
export function getIdentityUsage(requests: RequestRecord[], identity: RequestRecord['auth']) {
  const records = requests.filter(request => request.auth === identity);
  return { ...getMetrics(records), records };
}

export function budgetPeriodDescription(period: BudgetPeriod): string {
  return period === 'daily' ? 'Resets at midnight UTC each day'
    : period === 'weekly' ? 'Resets Monday at midnight UTC'
      : period === 'monthly' ? 'Resets on the first of the month at midnight UTC'
        : 'Cumulative limit; does not reset';
}
