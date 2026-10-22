import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000'
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1200, height: 852 } })
const page = await context.newPage()
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
await mkdir('docs/screenshots', { recursive: true })
try {
  await page.goto(`${baseURL}/signup`)
  await page.waitForFunction(() =>
    Boolean(
      (document.querySelector('#__nuxt') as HTMLElement & { __vue_app__?: unknown })?.__vue_app__,
    ),
  )
  const stamp = Date.now()
  await page.locator('input[name="name"]').fill('Morgan Demo')
  await page.locator('input[name="email"]').fill(`m2+${stamp.toString(36)}@example.test`)
  await page.locator('input[name="workspaceName"]').fill('M2 Demo')
  await page.locator('input[name="domain"]').fill('example.test')
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click()
  await page.waitForURL(/\/onboarding$/)
  const onboardingURL = page.url(),
    workspaceKey = new URL(onboardingURL).pathname.split('/')[1]!
  await expect(page.locator('[data-task]')).toHaveCount(6)
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  await page.screenshot({ path: 'docs/screenshots/m2-onboarding-fresh.png' })
  const observerPage = await context.newPage()
  await observerPage.goto(onboardingURL)
  await expect(observerPage.locator('[data-task]')).toHaveCount(6)
  await observerPage.waitForFunction(() =>
    Boolean(
      (document.querySelector('#__nuxt') as HTMLElement & { __vue_app__?: unknown })?.__vue_app__,
    ),
  )
  await page.bringToFront()
  // Validate the gallery's overflow controls and the mailbox lock.
  await page.getByRole('button', { name: 'Show next setups' }).click()
  await page.getByRole('button', { name: /Start outreach/ }).click()
  await expect(page.getByRole('dialog')).toContainText('One quick thing before Google opens')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Import from CSV', exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'Tenzeros chat' })).toContainText(
    'Drop your CSV here',
  )
  await page.getByRole('button', { name: 'Close chat', exact: true }).click()
  for (const task of ['connect_gmail', 'connect_notetaker', 'install_extension']) {
    await page.locator(`[data-task="${task}"]`).click()
    await expect(page.getByRole('dialog')).toContainText('Demo')
    await page.getByRole('button', { name: 'Simulate connection', exact: true }).click()
    await expect(page.locator(`[data-task="${task}"]`)).toHaveClass(/completed/)
    if (task === 'connect_gmail') {
      // No action/refresh in this tab: its UI must reconcile the other tab's SSE write.
      await observerPage.bringToFront()
      await expect(observerPage.locator('[data-task="connect_gmail"]')).toHaveClass(/completed/)
      await expect(observerPage.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '17')
      await observerPage.close()
      await page.bringToFront()
    }
  }
  await page.locator('[data-task="create_automation"]').click()
  await expect(page.getByRole('switch')).toHaveCount(6)
  await page.getByRole('switch').first().click()
  await expect(page.getByRole('switch').first()).toHaveAttribute('aria-checked', 'true')
  await page.goto(onboardingURL)
  await page.waitForFunction(() =>
    Boolean(
      (document.querySelector('#__nuxt') as HTMLElement & { __vue_app__?: unknown })?.__vue_app__,
    ),
  )
  await expect(page.locator('[data-task="create_automation"]')).toHaveClass(/completed/)
  await page.locator('[data-task="invite_colleague"]').click()
  await page
    .getByLabel('Email addresses')
    .fill('alex.teammate@example.test, jordan.teammate@example.test')
  await page.getByRole('button', { name: 'Invite teammates', exact: true }).click()
  await expect(page.locator('[data-task="invite_colleague"]')).toHaveClass(/completed/)
  await expect(page.locator('[data-task="invite_colleague"]')).toContainText(
    '2 invited, waiting for them all to join',
  )
  await page.getByRole('button', { name: 'Import from HubSpot', exact: true }).click()
  await page.getByRole('button', { name: 'Simulate connection', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Complete onboarding', exact: true })).toBeVisible()
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  const balance = await page.evaluate(
    async (key) =>
      (await (await fetch(`/api/workspaces/${key}`)).json()).subscription.topupCreditsRemaining,
    workspaceKey,
  )
  expect(balance).toBe(2150)
  const storage = await page.evaluate(() =>
    Object.fromEntries(
      Object.entries(localStorage).filter(([key]) => key.startsWith('onboarding')),
    ),
  )
  expect(Object.values(storage)).toContain('1')
  expect(
    Object.values(storage).some((value) => {
      try {
        return JSON.parse(value).length === 6
      } catch {
        return false
      }
    }),
  ).toBe(true)
  // Reload proves persisted completion state; no animation should replay.
  await page.reload()
  await page.waitForFunction(() =>
    Boolean(
      (document.querySelector('#__nuxt') as HTMLElement & { __vue_app__?: unknown })?.__vue_app__,
    ),
  )
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator('.badge')).toHaveText('150')
  await expect(page.locator('.badge')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: 'docs/screenshots/m2-onboarding-completed.png' })
  await page.screenshot({
    path: 'docs/screenshots/m2-onboarding-completed-full.png',
    fullPage: true,
  })
  await page.getByRole('button', { name: /Set up your pipeline/ }).click()
  await expect(page.getByRole('status')).toHaveText('Guided setup arrives in M3')
  // Responsive checks with both expanded and collapsed sidebar.
  for (const width of [900, 390]) {
    await page.setViewportSize({ width, height: 852 })
    if (width === 390) await page.getByRole('button', { name: 'Collapse sidebar' }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 1200, height: 852 })
  await page.getByRole('button', { name: 'Complete onboarding', exact: true }).click()
  await page.waitForURL(`${baseURL}/${workspaceKey}`)
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Get started', exact: true })).toHaveCount(0)
  const final = await page.evaluate(
    async (key) => await (await fetch(`/api/workspaces/${key}/onboarding`)).json(),
    workspaceKey,
  )
  expect(final.workspace.onboardingCompletedAt).toBeTruthy()
  expect(final.membership.onboardingCompletedAt).toBeTruthy()
  expect(errors).toEqual([])
  console.log(
    'PASS: onboarding UI, six tasks, 150 credits, persistence, responsive layout, gallery, completion redirect. Screenshots saved in docs/screenshots/.',
  )
} finally {
  await context.close()
  await browser.close()
}
