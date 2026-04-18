import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local first, then .env.test.local (test values override)
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env.test.local'), override: true });

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }], ['line']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    actionTimeout: 12_000,
    navigationTimeout: 20_000,
  },
  projects: [
    // ── Setup: runs once, creates playwright/.auth/user.json
    {
      name: 'setup',
      testMatch: /global-setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // ── Anon: tests that do NOT need authentication
    {
      name: 'anon',
      testMatch: /smoke\/anon-.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // ── Auth: tests that need a logged-in user (depends on setup)
    {
      name: 'auth',
      testMatch: /smoke\/auth-.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
