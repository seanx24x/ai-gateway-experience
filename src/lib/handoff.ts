import { DEFAULT_CONFIG, MODELS, type RoutingConfig } from './gateway';
import { authModeLabels, integrationLabels, type AuthMode, type Integration, type SetupEnvironment, type SetupIntent } from './setup';
import { isVirtualModelAlias } from './virtual-models';

/** A credential-free brief. Opening a tool is never evidence of a connection. */
export interface HandoffContext {
  intent: SetupIntent;
  environment: SetupEnvironment;
  integration: Integration;
  auth: AuthMode;
  model: string;
  routingConfig?: RoutingConfig;
  /** An alias created in the demo, to verify or create in the visitor's real team. */
  virtualModel?: string;
  /** Application-captured input, included only in the user-reviewed editor brief. */
  workload?: string;
}

export const CURSOR_URL_LIMIT = 10_000;
export const AGENT_PREVIEW_COMMAND = 'npx vercel@latest ai-gateway setup --dry-run';
export const AGENT_SETUP_COMMAND = 'npx vercel@latest ai-gateway setup';

export const environmentLabels: Record<SetupEnvironment, string> = {
  vercel: 'On Vercel', local: 'Local development', elsewhere: 'Another platform',
};

/** Only documented Gateway request fields travel into a real integration. */
export function gatewayOptions(context: HandoffContext): Record<string, string | string[]> {
  if (context.virtualModel) return {};
  const config = context.routingConfig;
  if (!config) return {};
  return {
    ...(config.order.length ? { order: [...config.order] } : {}),
    ...(config.only.length ? { only: [...config.only] } : {}),
    ...(config.fallbacks.length ? { models: [...config.fallbacks] } : {}),
    ...(config.sort !== 'default' ? { sort: config.sort } : {}),
    ...(config.tags.length ? { tags: [...config.tags] } : {}),
  };
}

export function createHandoffPrompt(context: HandoffContext): string {
  if (context.intent === 'agent' || context.integration === 'agent') return [
    'Prepare to route my coding agent’s own model requests through Vercel AI Gateway.',
    'Read https://vercel.com/docs/cli/ai-gateway#setup and check which agents are supported. Keep this separate from integrating Gateway into an application.',
    `First run ${AGENT_PREVIEW_COMMAND}. It previews changes without writing files or creating a key. Summarize the detected agents, team scope, and proposed changes for me to review.`,
    `After I approve, run ${AGENT_SETUP_COMMAND} interactively in my terminal. Do not use --yes, --all, or --non-interactive. Let me choose the agents, team, key budget, and expiry. Never print or share credentials; CLI machine-readable success output can contain a full key.`,
    `Then help me select ${JSON.stringify(context.model)} if the agent and my team support it. Send one short prompt only when I explicitly ask. Inspect the real request in my team’s AI Gateway Logs; logs may take up to 90 seconds to appear.`,
    'Opening this draft, reviewing configuration, or seeing a simulated receipt does not verify a real connection.',
  ].join('\n\n');

  const authentication = context.auth === 'oidc'
    ? context.environment === 'vercel'
      ? 'Use the Vercel project’s current OIDC identity at server request time. AI SDK resolves OIDC automatically when AI_GATEWAY_API_KEY is unset; other SDKs use getVercelOidcToken() from @vercel/oidc. Do not add a long-lived key.'
      : context.environment === 'local'
        ? 'Link the correct Vercel team/project with npx vercel@latest link, then pull .env.local with npx vercel@latest env pull .env.local. OIDC tokens last 12 hours locally; refresh by pulling again. Keep AI_GATEWAY_API_KEY unset for OIDC. Resolve credentials only on the server.'
        : 'This platform does not receive Vercel OIDC automatically. Explain the need for a valid token and refresh process before using this override. Recommend an AI Gateway API key if Vercel identity cannot be maintained.'
    : 'Use AI_GATEWAY_API_KEY in the server environment only. Reuse a configured key without displaying it. If it is missing, guide me to create a team-scoped key with an appropriate budget and expiry and save it privately; never place it in browser code, source control, URLs, or this chat.';
  return [
    context.intent === 'existing'
      ? 'Integrate Vercel AI Gateway into this existing application. First inspect its framework, package manager, server boundaries, AI client, and tests. Preserve existing behavior and explain the proposed changes before editing.'
      : 'Build a minimal Next.js application with a prompt form, a server-side AI Gateway request, and a readable response and usage receipt. Use the project’s existing conventions if a workspace is already open; otherwise ask me to choose a folder before creating files.',
    `Selected setup: ${integrationLabels[context.integration]}; ${environmentLabels[context.environment]}; ${authModeLabels[context.auth]}; model ${JSON.stringify(context.virtualModel ?? context.model)}. Check current model and provider availability for my team before sending a request.`,
    ...(context.workload !== undefined ? [`Workload to preserve exactly in the request interface:\n${JSON.stringify(context.workload)}\nThis input was rehearsed in a simulated workspace. Do not copy its prepared response, timings, or provider outcomes as real application results. Review the input before sending it to a real model.`] : []),
    'Read https://vercel.com/docs/ai-gateway/getting-started and the selected SDK’s current integration documentation. Reuse installed dependencies where appropriate. Keep Gateway calls on the server, validate prompts, and limit the first response to 256 output tokens.',
    authentication,
    context.integration === 'sdk'
      ? `Use generateText from ai with ${context.virtualModel ? 'the stable Virtual Model alias' : 'the creator/model ID'}; AI SDK selects the Gateway. ${context.virtualModel ? 'Keep routing configured in the Virtual Model.' : 'Pass routing options in providerOptions.gateway.'}`
      : `Keep the ${integrationLabels[context.integration]}. Set baseURL to ${context.integration === 'openai' ? 'https://ai-gateway.vercel.sh/v1' : 'https://ai-gateway.vercel.sh'} and use the Gateway credential and ${context.virtualModel ? 'stable Virtual Model alias. Keep routing configured in the Virtual Model; do not add inline request routing overrides.' : 'creator/model ID. Gateway extension fields go in providerOptions.gateway, using an object spread where upstream SDK types omit them.'} Verify compatibility with any existing provider-specific options.`,
    context.virtualModel
      ? `Use stable alias ${JSON.stringify(context.virtualModel)}. It exists only in the public demo until verified in my actual Vercel team. Review or create that Virtual Model in my team before making a request; do not overwrite an existing alias without my review. Requested primary model: ${JSON.stringify(context.model)}. Configuration to review:\n${JSON.stringify({ ...gatewayOptions({ ...context, virtualModel: undefined }), model: context.model }, null, 2)}\nKeep this configuration in the Virtual Model. Do not add inline request routing overrides. The demo revision is not a Vercel API field. Read https://vercel.com/docs/ai-gateway/models-and-providers/virtual-models.`
      : `Requested Gateway options:\n${JSON.stringify(gatewayOptions(context), null, 2)}\norder is preference; only restricts every model in the chain; models are failure fallbacks. These are request options, not a saved Virtual Model or an activated production revision.`,
    'Run the build and relevant tests without making a live request. Handle missing/expired authentication, unavailable models, rate limits, and exhausted budgets with useful messages. Do not silently create keys, deploy, or make billable requests.',
    'When I ask to verify, send one short real request using my server credentials. Show its actual response and usage; inspect model, provider, cost, and attempts in AI Gateway Logs (which may take up to 90 seconds). Do not copy simulated timings or claim a connection until server execution succeeds.',
  ].join('\n\n');
}

export function createEditorLinks(prompt: string): { cursor: string | null; vscode: string; cursorLength: number } {
  const encoded = encodeURIComponent(prompt);
  const cursor = `https://cursor.com/link/prompt?text=${encoded}`;
  return { cursor: cursor.length <= CURSOR_URL_LIMIT ? cursor : null, cursorLength: cursor.length, vscode: `vscode://agents/new?prompt=${encoded}` };
}

export function createITermLink(command: string): string {
  return `iterm2:/command?c=${encodeURIComponent(command)}`;
}

/** Safe, server-only Next.js handler shown in the UI and shipped in the starter. */
export function createGatewayServerCode(context: HandoffContext): string {
  const integration = context.integration === 'agent' ? 'sdk' : context.integration;
  const model = JSON.stringify(isVirtualModelAlias(context.virtualModel) ? context.virtualModel : context.model);
  const options = JSON.stringify(gatewayOptions(context), null, 2).replaceAll('\n', '\n      ');
  const imports = integration === 'sdk' ? "import { generateText } from 'ai';" : integration === 'openai' ? "import OpenAI from 'openai';" : "import Anthropic from '@anthropic-ai/sdk';";
  const authImport = context.auth === 'oidc' ? "\nimport { getVercelOidcToken } from '@vercel/oidc';" : '';
  const authCode = context.auth === 'oidc'
    ? `    if (process.env.AI_GATEWAY_API_KEY) return Response.json({ error: 'This starter uses OIDC. Remove AI_GATEWAY_API_KEY to use your project identity.' }, { status: 400 });\n    let credential: string;\n    try { credential = await getVercelOidcToken(); } catch {\n      return Response.json({ error: 'Link a Vercel project and run npx vercel@latest env pull .env.local, or deploy this server to Vercel. Refresh local tokens after 12 hours.' }, { status: 401 });\n    }`
    : `    const credential = process.env.AI_GATEWAY_API_KEY;\n    if (!credential) return Response.json({ error: 'Set AI_GATEWAY_API_KEY in your server’s .env.local or deployment environment, then restart the server.' }, { status: 401 });`;
  const requestCode = integration === 'sdk'
    ? `    const result = await generateText({\n      model: ${model},\n      prompt,\n      maxOutputTokens: 256,\n      providerOptions: { gateway: ${options} },\n    });\n    return Response.json({ text: result.text, model: ${model}, usage: result.usage, durationMs: Date.now() - started });`
    : integration === 'openai'
      ? `    const client = new OpenAI({ apiKey: credential, baseURL: 'https://ai-gateway.vercel.sh/v1' });\n    const result = await client.chat.completions.create({\n      model: ${model},\n      messages: [{ role: 'user', content: prompt }],\n      max_tokens: 256,\n      ...{ providerOptions: { gateway: ${options} } },\n    });\n    return Response.json({ text: result.choices[0]?.message.content ?? '', model: ${model}, usage: result.usage, durationMs: Date.now() - started });`
      : `    const client = new Anthropic({ apiKey: credential, baseURL: 'https://ai-gateway.vercel.sh' });\n    const result = await client.messages.create({\n      model: ${model},\n      messages: [{ role: 'user', content: prompt }],\n      max_tokens: 256,\n      ...{ providerOptions: { gateway: ${options} } },\n    });\n    const text = result.content.filter(block => block.type === 'text').map(block => block.text).join('');\n    return Response.json({ text, model: ${model}, usage: result.usage, durationMs: Date.now() - started });`;
  return `${imports}${authImport}\n\nexport const runtime = 'nodejs';\n\nexport async function POST(request: Request) {\n  const started = Date.now();\n  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) {\n    return Response.json({ error: 'Send this request from your own application.' }, { status: 403 });\n  }\n  let body: unknown;\n  try { body = await request.json(); } catch { return Response.json({ error: 'Send a JSON prompt.' }, { status: 400 }); }\n  const prompt = body && typeof body === 'object' && 'prompt' in body ? body.prompt : undefined;\n  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 4000) {\n    return Response.json({ error: 'Write a prompt between 1 and 4,000 characters.' }, { status: 400 });\n  }\n  try {\n${authCode}\n${requestCode}\n  } catch (error) {\n    const status = typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' ? error.status : 502;\n    const messages: Record<number, string> = {\n      401: 'Your Gateway credential is missing, invalid, or expired. Check your server environment.',\n      403: 'Your team does not have access to this model or provider.',\n      402: 'Your Gateway credits or applicable budget need attention.',\n      404: 'Check that this model is currently available to your team.',\n      429: 'The request was rate limited. Wait before trying again.',\n    };\n    return Response.json({ error: messages[status] ?? 'Gateway could not complete this request. Inspect AI Gateway Logs for details.' }, { status: status >= 400 && status <= 599 ? status : 502 });\n  }\n}\n`;
}

export function createStarterUrl(context: HandoffContext): string {
  const query = new URLSearchParams({ integration: context.integration, auth: context.auth, environment: context.environment, model: context.model });
  if (context.routingConfig) query.set('route', JSON.stringify(context.routingConfig));
  if (isVirtualModelAlias(context.virtualModel)) query.set('virtualModel', context.virtualModel);
  return `/api/starter?${query}`;
}

export function getDefaultHandoffContext(): HandoffContext {
  return { intent: 'new', integration: 'sdk', environment: 'local', auth: 'oidc', model: MODELS[0].id, routingConfig: structuredClone(DEFAULT_CONFIG) };
}
