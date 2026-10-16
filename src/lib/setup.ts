export type Integration = 'sdk' | 'openai' | 'anthropic' | 'agent';

export type AuthMode = 'oidc' | 'api-key';

export type SetupIntent = 'new' | 'existing' | 'agent';
export type SetupEnvironment = 'vercel' | 'local' | 'elsewhere';

export interface SetupOptions {
  intent: SetupIntent;
  environment: SetupEnvironment;
}

export interface MigrationChange {
  label: 'Endpoint' | 'Authentication' | 'Model ID';
  value: string;
}

export interface SetupStep {
  title: string;
  description: string;
  code: string;
  language: string;
}

export const integrationLabels: Record<Integration, string> = {
  sdk: 'AI SDK',
  openai: 'OpenAI SDK',
  anthropic: 'Anthropic SDK',
  agent: 'Coding agent',
};

export const authModeLabels: Record<AuthMode, string> = {
  oidc: 'Vercel OIDC',
  'api-key': 'API key',
};

/** Recommended application auth. The coding-agent CLI always uses a key. */
export function getEnvironmentAuth(environment: SetupEnvironment): AuthMode {
  return environment === 'elsewhere' ? 'api-key' : 'oidc';
}

export function getMigrationChanges(
  integration: Exclude<Integration, 'agent'>,
  auth: AuthMode,
  model: string,
): MigrationChange[] {
  return [
    {
      label: 'Endpoint',
      value: integration === 'sdk'
        ? 'Gateway selected automatically by AI SDK'
        : integration === 'openai'
          ? 'https://ai-gateway.vercel.sh/v1'
          : 'https://ai-gateway.vercel.sh',
    },
    {
      label: 'Authentication',
      value: integration === 'sdk'
        ? auth === 'oidc' ? 'Vercel OIDC, resolved by AI SDK' : 'AI_GATEWAY_API_KEY, read by AI SDK'
        : auth === 'oidc' ? 'apiKey: await getVercelOidcToken()' : 'apiKey: process.env.AI_GATEWAY_API_KEY',
    },
    { label: 'Model ID', value: model },
  ];
}

function createAuthStep(auth: AuthMode, environment: SetupEnvironment): SetupStep {
  if (auth === 'oidc') {
    if (environment === 'vercel') {
      return {
        title: 'Use your Vercel project identity',
        description:
          'Choose the correct Vercel team and project. Vercel supplies a current OIDC token to deployed server requests. You do not need a local token file for deployment. Leave AI_GATEWAY_API_KEY unset when using AI SDK with OIDC, because a key takes precedence.',
        code: 'npx vercel@latest link\n\n# Your Vercel deployment supplies the current OIDC token.\n# Keep Gateway requests in server code.',
        language: 'bash',
      };
    }

    if (environment === 'elsewhere') {
      return {
        title: 'Supply a valid Vercel OIDC token',
        description:
          'Another platform does not receive Vercel identity automatically. This override requires a valid Vercel OIDC token in your server environment and a refresh process before its 12-hour expiry. An API key is the recommended path here. Leave AI_GATEWAY_API_KEY unset when using AI SDK with OIDC.',
        code: 'export VERCEL_OIDC_TOKEN="<valid-vercel-oidc-token>"',
        language: 'bash',
      };
    }

    return {
      title: 'Link your Vercel project',
      description:
        'Choose the correct team and project, then pull an OIDC token for local server development. Local tokens last 12 hours; run vercel env pull again to refresh. Leave AI_GATEWAY_API_KEY unset when using AI SDK with OIDC, because a key takes precedence.',
      code: 'npx vercel@latest link\nnpx vercel@latest env pull .env.local',
      language: 'bash',
    };
  }

  if (environment === 'vercel') {
    return {
      title: 'Set your Vercel server environment',
      description:
        'Create a Gateway key in your Vercel team, then add AI_GATEWAY_API_KEY to the linked project and intended deployment environment. Deploy after saving it. Keep the key in server code.',
      code: 'npx vercel@latest env add AI_GATEWAY_API_KEY',
      language: 'bash',
    };
  }

  return {
    title: 'Set your server environment',
    description:
      'Create a Gateway key in your team and copy it once. Set it in the terminal or server environment that runs this example. Keep the key out of browser code.',
    code: 'export AI_GATEWAY_API_KEY="<your-ai-gateway-api-key>"',
    language: 'bash',
  };
}

export function getSetupInstallStep(integration: Exclude<Integration, 'agent'>, auth: AuthMode): SetupStep {
  const packageName = {
    sdk: 'ai@latest',
    openai: 'openai@latest',
    anthropic: '@anthropic-ai/sdk@latest',
  }[integration];
  const oidcPackage = auth === 'oidc' && integration !== 'sdk' ? ' @vercel/oidc@latest' : '';

  return {
    title: `Install ${integrationLabels[integration]}`,
    description:
      'Use Node.js 22.18 or later for this TypeScript script. Your application can call Gateway from Vercel, another server, or local development.',
    code: `pnpm add ${packageName}${oidcPackage}`,
    language: 'bash',
  };
}

function createMigrationStep(
  integration: Exclude<Integration, 'agent'>,
  auth: AuthMode,
  model: string,
): SetupStep {
  const modelLiteral = JSON.stringify(model);
  const oidcImport = auth === 'oidc' ? "import { getVercelOidcToken } from '@vercel/oidc';\n" : '';
  const credential = auth === 'oidc' ? 'await getVercelOidcToken()' : 'process.env.AI_GATEWAY_API_KEY';
  const client = integration === 'openai' ? 'OpenAI' : 'Anthropic';
  const endpoint = integration === 'openai' ? 'https://ai-gateway.vercel.sh/v1' : 'https://ai-gateway.vercel.sh';

  return {
    title: 'Update your existing client',
    description: integration === 'sdk'
      ? 'Use a creator/model string in place of your direct provider model. AI SDK selects Gateway automatically and resolves the chosen server authentication. Apply this model to your existing generation call; check support for any provider-specific options.'
      : 'Keep your SDK and update its base URL, server credential, and request model ID. Apply these settings to your existing client and calls. Check support for any provider-specific options before migrating.',
    code: integration === 'sdk'
      ? `// AI SDK selects the Gateway endpoint automatically.\n// ${auth === 'oidc' ? 'Vercel OIDC is resolved automatically; leave AI_GATEWAY_API_KEY unset.' : 'AI SDK reads AI_GATEWAY_API_KEY from your server environment.'}\nconst model = ${modelLiteral};\n\n// Pass model to your existing generateText or streamText call.`
      : `${oidcImport}const client = new ${client}({\n  baseURL: '${endpoint}',\n  apiKey: ${credential},\n});\n\n// Pass this Gateway model ID to your existing requests.\nconst model = ${modelLiteral};`,
    language: 'typescript',
  };
}

function createRequestStep(
  integration: Exclude<Integration, 'agent'>,
  auth: AuthMode,
  model: string,
  environment: SetupEnvironment,
): SetupStep {
  const modelLiteral = JSON.stringify(model);
  const promptLiteral = JSON.stringify('Describe a useful AI feature for a small support team.');
  const oidcImport = auth === 'oidc' ? "import { getVercelOidcToken } from '@vercel/oidc';\n" : '';
  const credential = auth === 'oidc' ? 'await getVercelOidcToken()' : 'process.env.AI_GATEWAY_API_KEY';
  let code: string;

  if (integration === 'sdk') {
    code = `import { generateText } from 'ai';

const response = await generateText({
  model: ${modelLiteral},
  prompt: ${promptLiteral},
  maxOutputTokens: 256,
});

console.log(response.text);`;
  } else if (integration === 'openai') {
    code = `import OpenAI from 'openai';
${oidcImport}
const client = new OpenAI({
  apiKey: ${credential},
  baseURL: 'https://ai-gateway.vercel.sh/v1',
});

const response = await client.chat.completions.create({
  model: ${modelLiteral},
  messages: [{ role: 'user', content: ${promptLiteral} }],
});

console.log(response.choices[0]?.message.content);`;
  } else {
    code = `import Anthropic from '@anthropic-ai/sdk';
${oidcImport}
const client = new Anthropic({
  apiKey: ${credential},
  baseURL: 'https://ai-gateway.vercel.sh',
});

const response = await client.messages.create({
  model: ${modelLiteral},
  max_tokens: 256,
  messages: [{ role: 'user', content: ${promptLiteral} }],
});

for (const block of response.content) {
  if (block.type === 'text') console.log(block.text);
}`;
  }

  if (environment === 'vercel') {
    const imports = integration === 'sdk'
      ? "import { generateText } from 'ai';"
      : integration === 'openai'
        ? `import OpenAI from 'openai';\n${oidcImport.trimEnd()}`.trimEnd()
        : `import Anthropic from '@anthropic-ai/sdk';\n${oidcImport.trimEnd()}`.trimEnd();
    const body = integration === 'sdk'
      ? `  const response = await generateText({\n    model: ${modelLiteral},\n    prompt: ${promptLiteral},\n    maxOutputTokens: 256,\n  });\n\n  return response.text;`
      : integration === 'openai'
        ? `  const client = new OpenAI({\n    apiKey: ${credential},\n    baseURL: 'https://ai-gateway.vercel.sh/v1',\n  });\n\n  const response = await client.chat.completions.create({\n    model: ${modelLiteral},\n    messages: [{ role: 'user', content: ${promptLiteral} }],\n  });\n\n  return response.choices[0]?.message.content;`
        : `  const client = new Anthropic({\n    apiKey: ${credential},\n    baseURL: 'https://ai-gateway.vercel.sh',\n  });\n\n  const response = await client.messages.create({\n    model: ${modelLiteral},\n    max_tokens: 256,\n    messages: [{ role: 'user', content: ${promptLiteral} }],\n  });\n\n  return response.content\n    .filter(block => block.type === 'text')\n    .map(block => block.text)\n    .join('');`;
    code = `${imports}\n\n// Call this function from your application’s server handler.\nexport async function requestGateway() {\n${body}\n}`;
  }

  return {
    title: 'Write your first request',
    description: environment === 'vercel'
      ? `Add this function to your server code and call it from your app’s handler. ${auth === 'oidc' ? 'The current identity is resolved when the request runs.' : 'The Gateway key stays in your server environment.'} Check that the selected model is available to your team.`
      : 'Save this as index.mts on your server. Check that the selected model is available to your team. This example uses your chosen model and authentication method.',
    code,
    language: 'typescript',
  };
}

function createVerificationStep(auth: AuthMode, environment: SetupEnvironment): SetupStep {
  if (environment === 'vercel') {
    return {
      title: 'Run and inspect the request',
      description:
        'Deploy the request in server code, then trigger it from your application. A successful response confirms execution. Inspect the resulting model, provider, usage, cost, and attempts in AI Gateway Logs. Logs can take up to 90 seconds to appear.',
      code: '1. Deploy your server request to the linked Vercel project.\n2. Trigger the request from your app.\n3. Confirm that your app receives a response.\n4. Open AI Gateway → Logs in your Vercel team.',
      language: 'text',
    };
  }

  return {
    title: 'Run and inspect the request',
    description:
      'A successful response confirms execution. Open AI Gateway Logs to inspect the model, provider, usage, cost, and attempts. Logs can take up to 90 seconds to appear.',
    code:
      auth === 'oidc' && environment === 'local'
        ? 'node --env-file=.env.local index.mts\n\n# Open AI Gateway → Logs in your Vercel team.'
        : 'node index.mts\n\n# Open AI Gateway → Logs in your Vercel team.',
    language: 'bash',
  };
}

/**
 * Instructional code only. Acknowledging or copying these steps does not prove
 * connectivity. App requests run in a server environment; the prototype's
 * frontend must never collect or persist a real Gateway key.
 */
export function createSetupSteps(
  integration: Integration,
  auth: AuthMode,
  model: string,
  options?: SetupOptions,
): SetupStep[] {
  const intent = options?.intent ?? (integration === 'agent' ? 'agent' : 'new');
  const environment = options?.environment ?? 'local';

  if (integration === 'agent' || intent === 'agent') {
    return [
      {
        title: 'Connect your coding agent',
        description:
          'The CLI detects supported agents, previews configuration, and creates or reuses a Gateway API key. Select the agents you want to connect and review the changes.',
        code: 'npx vercel@latest ai-gateway setup',
        language: 'bash',
      },
      {
        title: 'Verify traffic from your agent',
        description:
          'Agent setup uses API-key authentication. Open the configured agent, select a supported model, and send a short prompt. Check the resulting request in AI Gateway Logs.',
        code: `1. Open your configured coding agent.\n2. Select ${JSON.stringify(model)} using its supported model picker or configuration.\n3. Send a short prompt.\n4. Inspect the request in AI Gateway → Logs.\n\nLogs can take up to 90 seconds to appear.`,
        language: 'text',
      },
    ];
  }

  return [
    intent === 'existing'
      ? createMigrationStep(integration, auth, model)
      : getSetupInstallStep(integration, auth),
    createAuthStep(auth, environment),
    createRequestStep(integration, auth, model, environment),
    createVerificationStep(auth, environment),
  ];
}
