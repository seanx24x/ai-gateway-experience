import assert from 'node:assert/strict';
import test from 'node:test';
import { Script } from 'node:vm';
import {
  createSetupSteps,
  getEnvironmentAuth,
  getMigrationChanges,
  getSetupInstallStep,
  type AuthMode,
  type Integration,
  type SetupEnvironment,
} from './setup';

const MODEL = 'anthropic/claude-sonnet-4.6';
const CLIENTS = ['sdk', 'openai', 'anthropic'] as const;

test('environment recommendations distinguish deployments, linked local work, and another platform', () => {
  assert.equal(getEnvironmentAuth('vercel'), 'oidc');
  assert.equal(getEnvironmentAuth('local'), 'oidc');
  assert.equal(getEnvironmentAuth('elsewhere'), 'api-key');
});

test('three-argument setup retains the existing local script lane and coding-agent lane', () => {
  for (const integration of CLIENTS) {
    const steps = createSetupSteps(integration, 'oidc', MODEL);
    assert.equal(steps.length, 4);
    assert.match(steps[0].title, /^Install /);
    assert.equal(steps[1].code, 'npx vercel@latest link\nnpx vercel@latest env pull .env.local');
    assert.equal(steps[3].code, 'node --env-file=.env.local index.mts\n\n# Open AI Gateway → Logs in your Vercel team.');
    assert.match(steps[2].code, /console\.log/);
  }
  const agent = createSetupSteps('agent', 'oidc', MODEL);
  assert.equal(agent.length, 2);
  assert.equal(agent[0].code, 'npx vercel@latest ai-gateway setup');
});

test('deployed OIDC setup uses current project identity without requiring a local token file', () => {
  for (const integration of CLIENTS) {
    const steps = createSetupSteps(integration, 'oidc', MODEL, { intent: 'new', environment: 'vercel' });
    assert.match(steps[1].description, /Vercel supplies a current OIDC token/);
    assert.match(steps[2].code, /export async function requestGateway/);
    assert.match(steps[3].code, /Trigger the request from your app/);
    assert.doesNotMatch(steps.map(step => step.code).join('\n'), /\.env\.local|env pull|--env-file|node index\.mts/);
    if (integration !== 'sdk') {
      assert.ok(steps[2].code.indexOf('getVercelOidcToken()') > steps[2].code.indexOf('export async function requestGateway'));
      assert.match(steps[0].code, /@vercel\/oidc@latest/);
    }
  }
});

test('Vercel API-key override sets the project environment instead of exporting only to a terminal', () => {
  const steps = createSetupSteps('openai', 'api-key', MODEL, { intent: 'new', environment: 'vercel' });
  assert.equal(steps[1].code, 'npx vercel@latest env add AI_GATEWAY_API_KEY');
  assert.match(steps[1].description, /intended deployment environment/);
  assert.match(steps[2].code, /apiKey: process\.env\.AI_GATEWAY_API_KEY/);
  assert.doesNotMatch(steps[2].code, /getVercelOidcToken/);
  assert.equal(steps[3].language, 'text');
});

test('local OIDC instructions include the 12-hour refresh and load the pulled token when verifying', () => {
  const steps = createSetupSteps('sdk', 'oidc', MODEL, { intent: 'new', environment: 'local' });
  assert.match(steps[1].description, /12 hours.*vercel env pull/);
  assert.match(steps[1].description, /key takes precedence/);
  assert.match(steps[1].code, /env pull \.env\.local/);
  assert.match(steps[3].code, /^node --env-file=\.env\.local index\.mts/);
  assert.match(steps[3].description, /successful response confirms execution/);
  assert.match(steps[3].description, /up to 90 seconds/);
});

test('another platform receives server-key instructions and does not inherit deployment identity', () => {
  const steps = createSetupSteps('anthropic', getEnvironmentAuth('elsewhere'), MODEL, { intent: 'new', environment: 'elsewhere' });
  assert.match(steps[1].code, /^export AI_GATEWAY_API_KEY=/);
  assert.match(steps[2].code, /process\.env\.AI_GATEWAY_API_KEY/);
  assert.match(steps[2].code, /baseURL: 'https:\/\/ai-gateway\.vercel\.sh'/);
  assert.match(steps[3].code, /^node index\.mts/);
  assert.doesNotMatch(steps.map(step => step.code).join('\n'), /env pull|VERCEL_OIDC_TOKEN|--env-file/);

  const override = createSetupSteps('openai', 'oidc', MODEL, { intent: 'new', environment: 'elsewhere' });
  assert.match(override[1].description, /does not receive Vercel identity automatically/);
  assert.match(override[1].description, /12-hour expiry/);
  assert.match(override[1].code, /^export VERCEL_OIDC_TOKEN=/);
  assert.match(override[3].code, /^node index\.mts/);
});

test('existing client paths lead with exact migration changes and make installation optional', () => {
  for (const integration of CLIENTS) {
    for (const auth of ['oidc', 'api-key'] as const) {
      const steps = createSetupSteps(integration, auth, MODEL, { intent: 'existing', environment: 'local' });
      assert.equal(steps[0].title, 'Update your existing client');
      assert.doesNotMatch(steps[0].code, /pnpm add/);
      assert.match(steps[0].code, new RegExp(`const model = ${JSON.stringify(MODEL).replaceAll('.', '\\.')};`));
      const changes = getMigrationChanges(integration, auth, MODEL);
      assert.deepEqual(changes.map(change => change.label), ['Endpoint', 'Authentication', 'Model ID']);
      assert.equal(changes[2].value, MODEL);
      if (integration === 'sdk') {
        assert.match(changes[0].value, /automatically/);
        assert.match(steps[0].code, /existing generateText or streamText/);
      } else {
        assert.ok(steps[0].code.includes(changes[0].value));
        assert.ok(steps[2].code.includes(changes[0].value));
        assert.ok(steps[0].code.includes(changes[1].value));
        assert.ok(steps[2].code.includes(changes[1].value));
      }
      assert.equal(getSetupInstallStep(integration, auth).code.includes('@vercel/oidc'), auth === 'oidc' && integration !== 'sdk');
    }
  }
});

test('coding-agent intent always keeps the CLI key lane independent of application auth and environment', () => {
  for (const environment of ['vercel', 'local', 'elsewhere'] as SetupEnvironment[]) {
    for (const auth of ['oidc', 'api-key'] as AuthMode[]) {
      for (const integration of ['sdk', 'agent'] as Integration[]) {
        const steps = createSetupSteps(integration, auth, MODEL, { intent: 'agent', environment });
        assert.equal(steps.length, 2);
        assert.equal(steps[0].code, 'npx vercel@latest ai-gateway setup');
        assert.match(steps[1].description, /API-key authentication/);
        assert.doesNotMatch(steps.map(step => step.code).join('\n'), /env pull|env add|OIDC|AI_GATEWAY_API_KEY=/);
      }
    }
  }
});

test('all generated TypeScript keeps model input inside a string literal', () => {
  const model = 'creator/model";\nthrow new Error("injected"); //\\';
  for (const integration of CLIENTS) {
    for (const auth of ['oidc', 'api-key'] as const) {
      for (const environment of ['vercel', 'local', 'elsewhere'] as const) {
        for (const intent of ['new', 'existing'] as const) {
          const steps = createSetupSteps(integration, auth, model, { intent, environment });
          for (const step of steps.filter(step => step.language === 'typescript')) {
            const literal = JSON.stringify(model);
            assert.equal(step.code.split(literal).length - 1, 1);
            assert.doesNotMatch(step.code.replace(literal, ''), /throw new Error/);
            // These examples use JavaScript-compatible TypeScript. Parse without
            // running the snippets or importing their live request dependencies.
            const body = step.code.replace(/^import .+;$/gm, '').replace(/^export /gm, '');
            assert.doesNotThrow(() => new Script(`(async function () {\n${body}\n})`));
          }
        }
      }
    }
  }
});
