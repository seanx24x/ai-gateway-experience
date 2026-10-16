import { Buffer } from 'node:buffer';
import { MODELS, validateConfig, type RoutingConfig } from './gateway';
import { createGatewayServerCode, createHandoffPrompt, environmentLabels, type HandoffContext } from './handoff';
import { integrationLabels } from './setup';
import { isVirtualModelAlias } from './virtual-models';

/** Exact versions verified against the registry on 2026-10-05. */
export const STARTER_VERSIONS = {
  next: '16.3.8', react: '19.3.0', 'react-dom': '19.3.0', ai: '7.0.127', openai: '7.28.0',
  '@anthropic-ai/sdk': '0.131.0', '@vercel/oidc': '4.0.0', typescript: '7.0.2',
  '@types/node': '26.6.4', '@types/react': '19.3.0', '@types/react-dom': '19.3.0',
} as const;

export function parseStarterContext(params: URLSearchParams): HandoffContext | null {
  const integration = params.get('integration') ?? 'sdk';
  const auth = params.get('auth') ?? 'oidc';
  const environment = params.get('environment') ?? 'local';
  const model = params.get('model') ?? MODELS[0].id;
  if (!['sdk', 'openai', 'anthropic'].includes(integration) || !['oidc', 'api-key'].includes(auth) || !['vercel', 'local', 'elsewhere'].includes(environment) || !MODELS.some(item => item.id === model)) return null;
  const context = { intent: 'new', integration, auth, environment, model } as HandoffContext;
  const alias = params.get('virtualModel');
  if (alias && !isVirtualModelAlias(alias)) return null;
  if (alias) context.virtualModel = alias;
  const route = params.get('route');
  if (route) {
    if (route.length > 8000) return null;
    try {
      const config = JSON.parse(route) as RoutingConfig;
      if (!config || typeof config !== 'object' || !Array.isArray(config.order) || !Array.isArray(config.only) || !Array.isArray(config.fallbacks) || !Array.isArray(config.tags) || typeof config.slug !== 'string' || typeof config.model !== 'string' || config.tags.some(tag => typeof tag !== 'string') || validateConfig(config).length || config.model !== model) return null;
      context.routingConfig = config;
    } catch { return null; }
  }
  return context;
}

const STARTER_PAGE = `'use client';

import { useState, type FormEvent } from 'react';

interface Receipt { text: string; model: string; durationMs: number; usage?: Record<string, number>; }

export default function Home() {
  const [prompt, setPrompt] = useState('Suggest a useful response to a customer whose invitation link has expired.');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true); setError(''); setReceipt(null);
    try {
      const response = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error || 'The request could not complete.'); return; }
      setReceipt(data);
    } catch { setError('Could not reach your server. Check that the application is running.'); }
    finally { setPending(false); }
  }

  return <main>
    <header><span className="mark" aria-hidden="true">▲</span><span>AI Gateway / Your starter</span></header>
    <h1>Your first real request.</h1>
    <p className="intro">One server connection to your selected model. Requests use your own Gateway credentials and credits.</p>
    <form onSubmit={send}>
      <label htmlFor="prompt">Prompt</label>
      <textarea id="prompt" value={prompt} maxLength={4000} onChange={event => setPrompt(event.target.value)} rows={4} required />
      <button disabled={pending || !prompt.trim()} type="submit">{pending ? 'Sending request…' : 'Send real request'}<span aria-hidden="true">↗</span></button>
      <p className="support">Credentials stay on your server. Response is limited to 256 output tokens.</p>
    </form>
    <section aria-label="Request result" aria-live="polite" aria-busy={pending}>
      {error ? <p className="error" role="alert">{error}</p> : receipt ? <>
        <div className="receipt-title"><h2>Response received</h2><span>{receipt.durationMs} ms</span></div>
        <p className="answer">{receipt.text || 'The model returned no text. Inspect the request in Gateway Logs.'}</p>
        <dl><div><dt>Requested model</dt><dd>{receipt.model}</dd></div>{receipt.usage && <div><dt>Reported usage</dt><dd><pre>{JSON.stringify(receipt.usage, null, 2)}</pre></dd></div>}</dl>
        <a href="https://vercel.com/docs/ai-gateway/observability-and-spend/logs" target="_blank" rel="noreferrer">Inspect the provider, cost, and attempts in AI Gateway Logs ↗</a>
        <p className="support">Logs may take up to 90 seconds to appear. The elapsed time above is measured by your server.</p>
      </> : <p className="empty">{pending ? 'Waiting for your server’s response.' : 'A real response and usage receipt will appear here.'}</p>}
    </section>
    <footer>Created from Sean Lynch’s independent AI Gateway concept. This application sends real requests only when you choose Send.</footer>
  </main>;
}
`;

const STARTER_CSS = `:root{color-scheme:light dark;--background:#fff;--foreground:#171717;--muted:#666;--border:#eaeaea;--surface:#fafafa}*{box-sizing:border-box}body{margin:0;background:var(--background);color:var(--foreground);font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5}main{max-width:760px;margin:auto;padding:40px 24px}header{display:flex;gap:12px;align-items:center;padding-bottom:40px;font-size:14px}.mark{font-size:20px}h1{font-size:40px;line-height:1.15;letter-spacing:-.04em;font-weight:550;margin:0 0 16px}h2{font-size:16px;margin:0}.intro{font-size:16px;color:var(--muted);max-width:52ch;margin:0 0 32px}label{display:block;font-weight:500;margin-bottom:8px}textarea{display:block;width:100%;padding:16px;background:var(--background);color:var(--foreground);border:1px solid var(--border);border-radius:6px;font:inherit;font-size:16px;resize:vertical}button{display:flex;align-items:center;gap:24px;justify-content:space-between;margin-top:16px;border:1px solid var(--foreground);border-radius:6px;background:var(--foreground);color:var(--background);min-height:44px;padding:10px 16px;font:inherit;cursor:pointer}button:disabled{opacity:.5;cursor:wait}textarea:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid #0070f3;outline-offset:3px}.support{font-size:12px;color:var(--muted);margin:12px 0}section{margin-top:32px;border-top:1px solid var(--border);padding:24px 0}.receipt-title{display:flex;justify-content:space-between;gap:16px}.receipt-title>span,dt{color:var(--muted);font-size:12px}.answer{white-space:pre-wrap;font-size:16px;line-height:1.6}dl{border-top:1px solid var(--border);padding-top:16px}dl>div{display:grid;grid-template-columns:140px minmax(0,1fr);gap:16px;margin:8px 0}dd{margin:0;overflow-wrap:anywhere}pre{font-size:12px;white-space:pre-wrap;margin:0}a{color:inherit;text-underline-offset:3px}.error{padding:16px;border:1px solid #e5484d;border-radius:6px;color:#b42318}.empty{color:var(--muted)}footer{margin-top:40px;color:var(--muted);font-size:12px}@media(prefers-color-scheme:dark){:root{--background:#0a0a0a;--foreground:#ededed;--muted:#a1a1a1;--border:#252525;--surface:#111}.error{color:#ff8a8a}}@media(max-width:500px){main{padding:24px 20px}h1{font-size:32px}dl>div{grid-template-columns:1fr;gap:4px}header{padding-bottom:32px}}`;

export function buildStarterFiles(context: HandoffContext): Record<string, string> {
  const sdkPackage = context.integration === 'openai' ? 'openai' : context.integration === 'anthropic' ? '@anthropic-ai/sdk' : 'ai';
  const dependencies = { next: STARTER_VERSIONS.next, react: STARTER_VERSIONS.react, 'react-dom': STARTER_VERSIONS['react-dom'], [sdkPackage]: STARTER_VERSIONS[sdkPackage], ...(context.auth === 'oidc' ? { '@vercel/oidc': STARTER_VERSIONS['@vercel/oidc'] } : {}) };
  const authInstructions = context.auth === 'oidc'
    ? context.environment === 'elsewhere'
      ? 'This OIDC override needs a valid Vercel token and a refresh process on your platform. It does not receive identity automatically. Prefer a Gateway API key if you cannot maintain that identity. Keep AI_GATEWAY_API_KEY unset for OIDC.'
      : 'For local development, run `npx vercel@latest link`, select the right team/project, then `npx vercel@latest env pull .env.local`. Refresh local OIDC tokens every 12 hours by pulling again. Keep AI_GATEWAY_API_KEY unset. Vercel deployments receive current project identity automatically.'
    : 'Create a Gateway key in your Vercel team, choose a budget, and privately save `AI_GATEWAY_API_KEY` in `.env.local` or your server environment. On Vercel use `npx vercel@latest env add AI_GATEWAY_API_KEY` for the intended deployment environment. Never commit the key or put it in NEXT_PUBLIC variables.';
  const requestedModel = context.virtualModel ?? context.model;
  const virtualModelInstructions = context.virtualModel
    ? `## Prepare your Virtual Model\n\nThis server requests \`${context.virtualModel}\`, an alias selected in the public demo. Before sending, verify that it exists in your actual Vercel team or create it in AI Gateway → Virtual Models. Review the primary model \`${context.model}\` and configuration in \`AGENT_BRIEF.md\`. Do not overwrite an existing alias without reviewing its configuration. Downloading this starter does not create or activate a Virtual Model. A missing alias can return 404 even with valid credentials.\n\n`
    : '';
  const routingInstructions = context.virtualModel
    ? `The server uses stable alias \`${context.virtualModel}\`; keep provider preferences, restrictions, and model fallbacks in that Virtual Model. It does not add inline routing overrides. Review \`AGENT_BRIEF.md\` to prepare its configuration in your real team.`
    : 'Provider `order` is preference; `only` restricts all models in the fallback chain. `models` are failure fallbacks. No Virtual Model is saved or activated by downloading this starter.';
  return {
    'package.json': JSON.stringify({ name: 'gateway-starter', version: '1.0.0', private: true, engines: { node: '>=22.18.0' }, scripts: { dev: 'next dev --hostname 127.0.0.1', build: 'next build', start: 'next start --hostname 127.0.0.1', typecheck: 'tsc --noEmit' }, dependencies, devDependencies: { typescript: STARTER_VERSIONS.typescript, '@types/node': STARTER_VERSIONS['@types/node'], '@types/react': STARTER_VERSIONS['@types/react'], '@types/react-dom': STARTER_VERSIONS['@types/react-dom'] } }, null, 2) + '\n',
    'app/layout.tsx': `import type { Metadata } from 'next';\nimport './globals.css';\n\nexport const metadata: Metadata = { title: 'Your AI Gateway starter', robots: { index: false, follow: false } };\n\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return <html lang="en"><body>{children}</body></html>;\n}\n`,
    'app/page.tsx': STARTER_PAGE,
    'app/globals.css': STARTER_CSS,
    'app/api/generate/route.ts': createGatewayServerCode(context),
    'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', lib: ['dom', 'dom.iterable', 'esnext'], allowJs: true, skipLibCheck: true, strict: true, noEmit: true, esModuleInterop: true, module: 'esnext', moduleResolution: 'bundler', resolveJsonModule: true, isolatedModules: true, jsx: 'react-jsx', incremental: true, plugins: [{ name: 'next' }] }, include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts', '.next/dev/types/**/*.ts'], exclude: ['node_modules'] }, null, 2) + '\n',
    'next-env.d.ts': '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n',
    'next.config.ts': "import type { NextConfig } from 'next';\nconst config: NextConfig = {};\nexport default config;\n",
    '.gitignore': 'node_modules/\n.next/\n.env*\n!.env.example\n.vercel/\n',
    '.env.example': context.auth === 'api-key' ? '# Privately set this in .env.local. Never commit a real key.\nAI_GATEWAY_API_KEY=\n' : '# Vercel OIDC is resolved on your server.\n# Locally: npx vercel@latest link && npx vercel@latest env pull .env.local\n# Leave AI_GATEWAY_API_KEY unset when using OIDC.\n',
    'AGENT_BRIEF.md': createHandoffPrompt(context) + '\n',
    'README.md': `# Your AI Gateway starter\n\nA minimal Next.js app using ${integrationLabels[context.integration]}. Selected target: ${environmentLabels[context.environment]}. Model: \`${requestedModel}\`. Direct dependencies are pinned to versions verified on 2026-10-05.\n\n${virtualModelInstructions}## Run locally\n\nUse Node.js 22.18 or later. Run \`npm install\`, then configure server authentication:\n\n${authInstructions}\n\nRun \`npm run dev\`, open http://localhost:3000, and choose **Send real request**. The form calls your own server; it does not call the portfolio prototype. No request is sent during install, build, or page load.\n\n## Verify\n\nRun \`npm run build\` and \`npm run typecheck\`. Without credentials, the request displays actionable authentication instructions. With credentials, the explicit Send action uses your team's Gateway credits and is limited to 256 output tokens. Confirm current model/provider availability and account eligibility before sending.\n\nInspect the actual request's provider, cost, and routing attempts in your team's AI Gateway Logs. Logs may take up to 90 seconds to appear. This starter shows actual response text, SDK-reported usage, and server elapsed time. It does not invent provider attempts or import simulated receipts.\n\n## Selected routing\n\nSee \`app/api/generate/route.ts\`. ${routingInstructions}\n\nKeep keys and OIDC tokens in server environments. Add your application's authentication and workload limits before exposing a real request endpoint publicly.\n\nReferences: [Getting started](https://vercel.com/docs/ai-gateway/getting-started), [OIDC](https://vercel.com/docs/ai-gateway/authentication-and-byok/oidc), [Gateway options](https://vercel.com/docs/ai-gateway/models-and-providers/provider-options).\n\nCreated from Sean Lynch's independent AI Gateway concept.\n`,
  };
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Deterministic ZIP with stored entries; no dependencies or runtime file access. */
export function buildStarterZip(context: HandoffContext): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const files = buildStarterFiles(context);
  for (const [path, source] of Object.entries(files)) {
    const name = Buffer.from(`gateway-starter/${path}`);
    const data = Buffer.from(source);
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt16LE(0x5d45, 12); header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26);
    local.push(header, name, data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x800, 8); entry.writeUInt16LE(0x5d45, 14); entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(name.length, 28); entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += header.length + name.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
