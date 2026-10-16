import { PROVIDER_NAMES, type RoutingConfig } from './gateway';

/** Explain recorded policy changes, rather than attributing every timing delta to order. */
export function routeDifferences(original?: RoutingConfig, draft?: RoutingConfig): { label: string; original: string; draft: string }[] {
  if (!original || !draft) return [];
  const providers = (items: RoutingConfig['order']) => items.length ? items.map(id => PROVIDER_NAMES[id]).join(' → ') : 'Automatic eligible pool';
  const fields = [
    { label:'Provider preference', original:providers(original.order), draft:providers(draft.order) },
    { label:'Eligible providers', original:original.only.length ? original.only.map(id => PROVIDER_NAMES[id]).join(', ') : 'All supported', draft:draft.only.length ? draft.only.map(id => PROVIDER_NAMES[id]).join(', ') : 'All supported' },
    { label:'Model', original:original.model, draft:draft.model },
    { label:'Model fallbacks', original:original.fallbacks.join(' → ') || 'None', draft:draft.fallbacks.join(' → ') || 'None' },
    { label:'Routing strategy', original:original.sort, draft:draft.sort },
  ];
  return fields.filter(field => field.original !== field.draft);
}
