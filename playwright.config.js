import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './output/playwright/results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  timeout: 75_000,
  expect: { timeout: 8_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: './output/playwright/report', open: 'never' }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173',
    viewport: { width: 360, height: 640 },
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
  },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      viewport: { width: 360, height: 640 },
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } }
        : {}),
    },
  }],
  // Run against an explicitly started production preview. A dev server does not
  // exercise the generated service worker and would give false offline results.
});
