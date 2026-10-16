import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 2,
  timeout: 40_000,
  expect: { timeout: 7_000 },
  outputDir: './test-results',
  reporter: [['list']],
  use: {
    baseURL: process.env.GATEWAY_BASE_URL ?? 'http://127.0.0.1:4317',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: process.env.GATEWAY_BASE_URL ? undefined : {
    command: 'pnpm dev',
    url: 'http://127.0.0.1:4317',
    reuseExistingServer: true,
    timeout: 90_000,
  },
});
