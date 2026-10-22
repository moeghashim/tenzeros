import { test, expect } from '@playwright/test'
import { signup, connect, finishAgentsFlow } from './helpers'

test('missing DeepSeek key explains configuration in chat and context with retry', async ({
  page,
}) => {
  const { key } = await signup(page, 'http://localhost:3101')
  await page.locator('[data-flow="activate-agents"]').click()
  const chat = page.getByRole('complementary', { name: 'Tenzeros chat' })
  await expect(chat.getByRole('alert')).toContainText('Set DEEPSEEK_API_KEY on the server')
  await chat.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(chat.getByRole('alert')).toContainText('Set DEEPSEEK_API_KEY on the server')
  await chat.getByRole('button', { name: 'Close chat' }).click()
  await page.goto(`http://localhost:3101/${key}/settings/workspace/context`)
  await expect(page.getByRole('status').filter({ hasText: 'Set DEEPSEEK_API_KEY' })).toBeVisible()
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/contexts/retry') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Retry generation' }).click()
  expect((await response).ok()).toBe(true)
  await expect(page.getByRole('button', { name: 'Retry generation' })).toBeEnabled()
  await expect(page.getByRole('status').filter({ hasText: 'Set DEEPSEEK_API_KEY' })).toBeVisible()
})

test('mid-stream provider error remains visible and Retry recovers', async ({ page }) => {
  await signup(page)
  await page.route(
    '**/api/chats/*/messages',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body:
          'event: text_delta\ndata: {"type":"text_delta","text":"Let us set up"}\n\n' +
          'event: error\ndata: {"type":"error","message":"DeepSeek streaming was interrupted. Please retry."}\n\n',
      })
    },
    { times: 1 },
  )
  await page.locator('[data-flow="activate-agents"]').click()
  const chat = page.getByRole('complementary', { name: 'Tenzeros chat' })
  await expect(chat.getByRole('alert')).toContainText('DeepSeek streaming was interrupted')
  await chat.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(chat.getByRole('button', { name: 'Start setup', exact: true })).toBeVisible()
  await expect(chat.getByRole('alert')).toHaveCount(0)
})

test('SSE disconnection announces recovery and refetches missed rewards and flow statuses', async ({
  page,
  context,
}) => {
  // Return one closed stream, then hold the native EventSource reconnect until
  // writes have happened. Real server streams cover delivery in onboarding.spec.
  let reconnect!: () => void
  const gate = new Promise<void>((resolve) => {
    reconnect = resolve
  })
  let first = true
  await page.route('**/api/stream', async (route) => {
    if (first) {
      first = false
      await route.fulfill({ contentType: 'text/event-stream', body: 'event: ready\ndata: {}\n\n' })
    } else {
      await gate
      await route.continue()
    }
  })
  const { key } = await signup(page)
  await expect(
    page.getByRole('status').filter({ hasText: 'Reconnecting to live updates' }),
  ).toBeVisible()
  const writer = await context.newPage()
  await writer.goto(`/${key}/onboarding`)
  await connect(writer, 'connect_gmail')
  await finishAgentsFlow(writer)
  await expect(page.locator('[data-flow="activate-agents"]')).not.toContainText('Completed')
  const refreshed = page.waitForResponse((r) => r.url().includes('/flows/statuses') && r.ok())
  reconnect()
  await refreshed
  await expect(
    page.getByRole('status').filter({ hasText: 'Reconnecting to live updates' }),
  ).toHaveCount(0)
  await expect(page.getByRole('progressbar')).toHaveAttribute(
    'aria-valuetext',
    '50 of 150 credits earned',
  )
  await expect(page.locator('[data-flow="activate-agents"]')).toContainText('Completed')
  await expect(page.locator('[data-flow="start-outreach"]')).not.toContainText('Connect Gmail')
})

test('API 401 redirects an active workspace to login', async ({ page, context }) => {
  const { key } = await signup(page)
  await page.goto(`/${key}/agents`)
  await expect(page.getByRole('switch')).toHaveCount(6)
  await context.clearCookies()
  await page.getByRole('switch').first().click()
  await page.waitForURL('**/login')
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
})

test('chat-stream 401 redirects to login', async ({ page }) => {
  await signup(page)
  await page.locator('[data-flow="activate-agents"]').click()
  const start = page.getByRole('button', { name: 'Start setup', exact: true })
  await expect(start).toBeEnabled()
  await page.route(
    '**/api/chats/*/messages',
    (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ statusMessage: 'Sign in to continue' }),
      }),
    { times: 1 },
  )
  await start.click()
  await page.waitForURL('**/login')
})

test('unknown workspace returns a useful 404 and production security headers', async ({ page }) => {
  await signup(page)
  const response = await page.goto('/workspace-does-not-exist/onboarding')
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'Workspace or page not found' })).toBeVisible()
  expect(response?.headers()['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(response?.headers()['x-content-type-options']).toBe('nosniff')
  expect(response?.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin')
  await page.getByRole('button', { name: 'Back to sign in' }).click()
  await page.waitForURL('**/login')
})
