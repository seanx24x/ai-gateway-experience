import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { DEFAULT_CONFIG } from './gateway';
import { AGENT_PREVIEW_COMMAND, CURSOR_URL_LIMIT, createEditorLinks, createGatewayServerCode, createHandoffPrompt, createITermLink, createStarterUrl, gatewayOptions, getDefaultHandoffContext, type HandoffContext } from './handoff';
import { buildStarterFiles, buildStarterZip, parseStarterContext } from './starter';

test('editor drafts encode all prompt text as one parameter and never auto-submit or select an unknown workspace', () => {
  const prompt = 'Review my app.\n模型 & route? #fragment + 50% "quotes"';
  const links = createEditorLinks(prompt);
  assert.equal(new URL(links.cursor!).searchParams.get('text'), prompt);
  assert.equal(new URL(links.vscode).searchParams.get('prompt'), prompt);
  assert.deepEqual([...new URL(links.vscode).searchParams.keys()], ['prompt']);
  assert.deepEqual([...new URL(links.cursor!).searchParams.keys()], ['text']);
  const command = 'echo "Review & run?"\n# Use your own folder';
  assert.equal(new URL(createITermLink(command)).searchParams.get('c'), command);
});

test('Cursor length is enforced after URL encoding including the prefix', () => {
  const prefix = 'https://cursor.com/link/prompt?text=';
  assert.equal(createEditorLinks('a'.repeat(CURSOR_URL_LIMIT - prefix.length)).cursor?.length, CURSOR_URL_LIMIT);
  assert.equal(createEditorLinks('a'.repeat(CURSOR_URL_LIMIT - prefix.length + 1)).cursor, null);
  assert.equal(createEditorLinks('模'.repeat(1200)).cursor, null);
  assert.ok(createEditorLinks('模'.repeat(1200)).vscode.startsWith('vscode://agents/new?prompt='));
});

test('application brief carries selected setup and documented request options without simulated revision fields', () => {
  const context = { ...getDefaultHandoffContext(), intent: 'existing' as const, integration: 'openai' as const, auth: 'api-key' as const, environment: 'elsewhere' as const };
  const prompt = createHandoffPrompt(context);
  assert.match(prompt, /First inspect its framework/);
  assert.match(prompt, /OpenAI SDK; Another platform; API key/);
  assert.match(prompt, /https:\/\/ai-gateway.vercel.sh\/v1/);
  assert.match(prompt, /Do not silently create keys, deploy, or make billable requests/);
  assert.deepEqual(gatewayOptions(context), { order: ['anthropic', 'bedrock', 'vertex'], models: ['openai/gpt-5.4'], tags: ['feature:support'] });
  assert.doesNotMatch(JSON.stringify(gatewayOptions(context)), /revision|slug|fallbacks/);
  assert.equal(new URL(createStarterUrl(context), 'https://example.com').searchParams.get('model'), context.model);
});

test('coding-agent brief always starts with a safe preview and separates agent traffic from app integration', () => {
  const prompt = createHandoffPrompt({ ...getDefaultHandoffContext(), intent: 'agent', integration: 'agent' });
  assert.match(prompt, /own model requests/);
  assert.ok(prompt.includes(`First run ${AGENT_PREVIEW_COMMAND}`));
  assert.match(prompt, /After I approve/);
  assert.match(prompt, /Do not use --yes, --all, or --non-interactive/);
  assert.doesNotMatch(prompt, /env pull|providerOptions\.gateway|NEXT_PUBLIC/);
});

test('captured workload survives reviewed handoff exactly without entering the starter URL or agent setup', () => {
  const workload = '  Reply to this customer.\nLiteral input: & ? # + 模型\n';
  const context = { ...getDefaultHandoffContext(), workload };
  const prompt = createHandoffPrompt(context);
  assert.ok(prompt.includes(JSON.stringify(workload)));
  assert.match(prompt, /Do not copy its prepared response, timings, or provider outcomes/);
  const links = createEditorLinks(prompt);
  assert.equal(new URL(links.cursor!).searchParams.get('text'), prompt);
  assert.doesNotMatch(createStarterUrl(context), /workload|Reply/);
  assert.ok(!createHandoffPrompt({ ...context, intent: 'agent', integration: 'agent' }).includes(JSON.stringify(workload)));
});

function handler(context: HandoffContext, env: Record<string, string>, clients: Record<string, unknown> = {}) {
  const output = stripTypeScriptTypes(createGatewayServerCode(context), { mode: 'strip' })
    .replace(/^import (.+) from '(.+)';$/gm, (_, binding: string, name: string) => `const ${binding} = require('${name}');`)
    .replace(/^export /gm, '') + '\nmodule.exports.POST = POST;';
  const module = { exports: {} as { POST: (request: Request) => Promise<Response> } };
  runInNewContext(output, { module, exports: module.exports, require: (name: string) => clients[name] ?? {}, process: { env }, Response, URL, Date, console });
  return module.exports.POST;
}

test('generated handlers reject malformed prompts, cross-origin calls, and missing credentials before any model request', async () => {
  for (const integration of ['sdk', 'openai', 'anthropic'] as const) {
    let calls = 0;
    const POST = handler({ ...getDefaultHandoffContext(), integration, auth: 'api-key' }, {}, { ai: { generateText: () => { calls++; } } });
    const missing = await POST(new Request('https://example.com/api/generate', { method: 'POST', body: JSON.stringify({ prompt: 'Hello' }) }));
    assert.equal(missing.status, 401);
    assert.match((await missing.json()).error, /Set AI_GATEWAY_API_KEY/);
    const malformed = await POST(new Request('https://example.com/api/generate', { method: 'POST', body: '{' }));
    assert.equal(malformed.status, 400);
    const tooLong = await POST(new Request('https://example.com/api/generate', { method: 'POST', body: JSON.stringify({ prompt: 'a'.repeat(4001) }) }));
    assert.equal(tooLong.status, 400);
    const crossOrigin = await POST(new Request('https://example.com/api/generate', { method: 'POST', headers: { origin: 'https://other.com' }, body: JSON.stringify({ prompt: 'Hello' }) }));
    assert.equal(crossOrigin.status, 403);
    assert.equal(calls, 0);
  }
});

test('OIDC starter resolves a current token on the server and handles a missing identity with refresh instructions', async () => {
  const POST = handler(getDefaultHandoffContext(), {}, { '@vercel/oidc': { getVercelOidcToken: () => { throw new Error('Missing'); } } });
  const response = await POST(new Request('https://example.com/api/generate', { method: 'POST', body: JSON.stringify({ prompt: 'Hello' }) }));
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /env pull.*12 hours/);
  assert.match(createGatewayServerCode(getDefaultHandoffContext()), /await getVercelOidcToken\(\)/);
});

test('starter receipt reports actual SDK text and usage and bounds output without inventing provider attempts', async () => {
  let supplied: Record<string, unknown> | undefined;
  const POST = handler({ ...getDefaultHandoffContext(), auth: 'api-key' }, { AI_GATEWAY_API_KEY: 'visitor-test-key' }, { ai: { generateText: async (options: Record<string, unknown>) => { supplied = options; return { text: 'Actual SDK response', usage: { inputTokens: 4, outputTokens: 3 } }; } } });
  const response = await POST(new Request('https://example.com/api/generate', { method: 'POST', body: JSON.stringify({ prompt: 'Hello' }) }));
  const receipt = await response.json();
  assert.equal(response.status, 200);
  assert.equal(supplied?.maxOutputTokens, 256);
  assert.equal(supplied?.prompt, 'Hello');
  assert.deepEqual(receipt.usage, { inputTokens: 4, outputTokens: 3 });
  assert.equal(receipt.text, 'Actual SDK response');
  assert.equal('attempts' in receipt, false);
  assert.equal('provider' in receipt, false);
  assert.equal(JSON.stringify(receipt).includes('visitor-test-key'), false);
});

test('generated failures present useful budget and rate limit states without echoing server errors or credentials', async () => {
  for (const statusCode of [402, 429]) {
    const POST = handler({ ...getDefaultHandoffContext(), auth: 'api-key' }, { AI_GATEWAY_API_KEY: 'secret-test-key' }, { ai: { generateText: async () => { throw { statusCode, message: 'secret-test-key' }; } } });
    const response = await POST(new Request('https://example.com/api/generate', { method: 'POST', body: JSON.stringify({ prompt: 'Hello' }) }));
    assert.equal(response.status, statusCode);
    assert.equal((await response.text()).includes('secret-test-key'), false);
  }
});

test('starter accepts only bounded supported contexts and pins client-specific dependencies', () => {
  for (const integration of ['sdk', 'openai', 'anthropic'] as const) {
    const context = { ...getDefaultHandoffContext(), integration };
    const parsed = parseStarterContext(new URL(createStarterUrl(context), 'https://example.com').searchParams);
    assert.equal(parsed?.integration, integration);
    assert.deepEqual(parsed?.routingConfig, DEFAULT_CONFIG);
    const files = buildStarterFiles(context);
    const pkg = JSON.parse(files['package.json']);
    assert.ok(pkg.dependencies[integration === 'sdk' ? 'ai' : integration === 'openai' ? 'openai' : '@anthropic-ai/sdk']);
    assert.ok(Object.values(pkg.dependencies).every(version => /^\d+\.\d+\.\d+$/.test(String(version))));
    assert.equal('app/api/generate/route.ts' in files, true);
    assert.doesNotMatch(files['app/page.tsx'], /AI_GATEWAY_API_KEY|getVercelOidcToken/);
  }
  for (const query of ['integration=agent', 'model=unknown/model', 'auth=unknown', 'route=null', 'route=%7B%7D']) assert.equal(parseStarterContext(new URLSearchParams(query)), null);
  const mismatched = new URL(createStarterUrl({ ...getDefaultHandoffContext(), model: 'openai/gpt-5.4' }), 'https://example.com');
  assert.equal(parseStarterContext(mismatched.searchParams), null);
});

test('ZIP local entries contain the generated files unchanged and finish with a matching directory', () => {
  const context = getDefaultHandoffContext();
  const files = buildStarterFiles(context);
  const zip = buildStarterZip(context);
  let offset = 0;
  let count = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const length = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString();
    const dataAt = offset + 30 + nameLength;
    assert.equal(zip.subarray(dataAt, dataAt + length).toString(), files[name.replace('gateway-starter/', '')]);
    offset = dataAt + length; count++;
  }
  assert.equal(count, Object.keys(files).length);
  assert.equal(zip.readUInt32LE(offset), 0x02014b50);
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
  assert.equal(zip.readUInt16LE(zip.length - 12), count);
});

test('a demo Virtual Model handoff prepares its real configuration and keeps inline routing empty', () => {
  const context = { ...getDefaultHandoffContext(), virtualModel: 'vmc/support-agent' };
  const prompt = createHandoffPrompt(context);
  assert.match(prompt, /exists only in the public demo/);
  assert.match(prompt, /Do not add inline request routing overrides/);
  const code = createGatewayServerCode(context);
  assert.match(code, /model: "vmc\/support-agent"/);
  assert.doesNotMatch(code, /"order":/);
  const parsed = parseStarterContext(new URL(createStarterUrl(context), 'http://localhost').searchParams);
  assert.equal(parsed?.virtualModel, context.virtualModel);
  assert.equal(parseStarterContext(new URLSearchParams({ virtualModel: 'vmc/../keys' })), null);
});

test('every supported client and downloaded README use the alias and require its real-team configuration', () => {
  for (const integration of ['sdk', 'openai', 'anthropic'] as const) {
    const context = { ...getDefaultHandoffContext(), integration, virtualModel: 'vmc/support-agent' };
    const prompt = createHandoffPrompt(context);
    assert.match(prompt, /stable Virtual Model alias/);
    assert.match(prompt, /Do not add inline request routing overrides/);
    assert.doesNotMatch(prompt, /creator\/model ID|Gateway extension fields go in/);
    const files = buildStarterFiles(context);
    assert.match(files['app/api/generate/route.ts'], /model: "vmc\/support-agent"/);
    assert.doesNotMatch(files['app/api/generate/route.ts'], /"order":/);
    assert.match(files['README.md'], /Model: `vmc\/support-agent`/);
    assert.match(files['README.md'], /Before sending, verify that it exists in your actual Vercel team or create it/);
    assert.match(files['README.md'], /missing alias can return 404 even with valid credentials/);
    assert.match(files['README.md'], /does not add inline routing overrides/);
  }
});
