import { ArrowDown, ChevronRight, CornerDownRight, KeyRound, Layers3, ShieldCheck, Triangle } from 'lucide-react';
import './credential-scope.css';

export type CredentialScopeLane = 'member' | 'team' | 'oidc' | 'byok';

/** A documented relationship, never an assertion about a recorded request. */
export function CredentialScope({ lane, name, provider = 'Provider' }: { lane: CredentialScopeLane; name?: string; provider?: string }) {
  const scopes = lane === 'member' ? ['API key', 'User', 'Team'] : lane === 'team' ? ['API key', 'Team'] : lane === 'oidc' ? ['Project', 'Team'] : [];
  return <div className="credential-scope" data-scope-lane={lane} role="group" aria-label="Documented credential and budget relationship">
    <p className="credential-scope-caption credential-scope-qualification">Documented relationship</p>
    <div className="credential-scope-auth" aria-label={lane === 'byok' ? 'Gateway uses your credentials to authenticate to the provider' : 'Your app authenticates to Gateway'}>
      <div className="credential-scope-origin"><span className="credential-scope-icon">{lane === 'oidc' ? <ShieldCheck size={18} /> : <KeyRound size={18} />}</span><span><strong>{lane === 'byok' ? 'Your provider credentials' : lane === 'oidc' ? 'Project OIDC' : name || 'Gateway API key'}</strong><small>{lane === 'byok' ? 'Used by Gateway' : 'Used by your app'}</small></span></div>
      <span className="credential-scope-connector" aria-hidden="true"><ArrowDown size={14} /></span>
      <div className="credential-scope-destination"><span className="credential-scope-icon">{lane === 'byok' ? <Layers3 size={18} /> : <Triangle size={17} fill="currentColor" />}</span><span><strong>{lane === 'byok' ? provider : 'AI Gateway'}</strong><small>{lane === 'byok' ? 'Authenticates with your account' : 'One authenticated request path'}</small></span></div>
    </div>
    {lane === 'byok' ? <div className="credential-scope-coverage">
      <div className="credential-scope-billing"><span className="credential-scope-caption">Billed to</span><strong>Your provider account</strong><small>Provider-side billing and controls</small></div>
      <div className="credential-scope-branch"><CornerDownRight size={17} /><span>If own credentials fail</span></div>
      <div className="credential-scope-node credential-scope-node--conditional"><span>System credential fallback</span><strong>Gateway credits</strong><small>Can use purchased Gateway credits</small></div>
      <p className="credential-scope-note">Own-credential spend is outside Gateway budgets.</p>
      <details className="credential-scope-evidence"><summary><ChevronRight size={13} />Identify the serving credentials</summary><p>Inspect production <code>credentialType</code> to establish which path served a request. These demo receipts do not record it.</p></details>
    </div> : <div className="credential-scope-coverage">
      <div className="credential-scope-budget-heading"><span className="credential-scope-caption">Applicable caps</span><small>Every cap must allow the request</small></div>
      <div className="credential-scope-chain" aria-label={`Applicable documented budgets: ${scopes.join(', ')}`}>{scopes.map((scope, index) => <div key={scope} className="credential-scope-node"><span className="credential-scope-gate" aria-hidden="true"><span /></span><span>{scope} budget</span><small>{scope === 'API key' ? 'Editable' : 'In Vercel'}</small>{index === 0 && <span className="sr-only">{scope === 'API key' ? 'Editable in this demo' : 'Configured in Vercel'}</span>}</div>)}</div>
      <p className="credential-scope-note">Overlapping scope totals are not additive.</p>
    </div>}
  </div>;
}
