import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { defineConfig } from '@playwright/test'

// Workers inherit this path; every run gets fresh state, never the developer DB.
process.env.E2E_DATABASE_PATH ||= resolve(`.data/e2e-${randomUUID()}.db`)
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  expect: { timeout: 10000 },
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3100',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'pnpm exec tsx tests/e2e/server.ts',
      env: { E2E_PORT: '3100', E2E_MOCK: '1' },
      url: 'http://localhost:3100/login',
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: 'pnpm exec tsx tests/e2e/server.ts',
      env: { E2E_PORT: '3101', E2E_MOCK: '0' },
      url: 'http://localhost:3101/login',
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
})
