import { test, expect } from '@playwright/test'
test('guided agents flow: start, resume after refresh, select, complete and celebrate', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/signup')
  await expect(page.getByRole('button', { name: 'Create workspace', exact: true })).toBeEnabled()
  await page.locator('input[name=name]').fill('M3 E2E')
  await page.locator('input[name=email]').fill(`m3-e2e-${Date.now()}@example.test`)
  await page.locator('input[name=workspaceName]').fill('M3 E2E Workspace')
  await page.locator('input[name=domain]').fill('stripe.com')
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click()
  await page.waitForURL(/\/onboarding$/)
  await expect(page.getByRole('link', { name: 'Reports', exact: true })).toBeInViewport()
  const card = page.locator('[data-flow="activate-agents"]')
  await card.click()
  const panel = page.getByRole('complementary', { name: 'Tenzeros chat' })
  await expect(panel.getByRole('button', { name: 'Start setup', exact: true })).toBeVisible()
  await panel.getByRole('button', { name: 'Start setup', exact: true }).click()
  await expect(panel.getByRole('button', { name: /Meeting brief/ })).toBeVisible()
  if (process.env.CAPTURE_CHAT_SCREENSHOT) {
    await page.setViewportSize({ width: 1600, height: 1000 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: 'docs/screenshots/m3-docked-chat.png' })
  }
  await page.reload()
  await card.getByRole('button', { name: 'Resume', exact: true }).click()
  await expect(panel.getByRole('button', { name: /Meeting brief/ })).toBeVisible()
  await panel.getByRole('button', { name: /Meeting brief/ }).click()
  await panel.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(
    panel.getByRole('button', { name: 'Finish walkthrough and return to onboarding' }),
  ).toBeVisible()
  await panel.getByRole('button', { name: 'Finish walkthrough and return to onboarding' }).click()
  await expect(panel).not.toBeVisible()
  await expect(card).toContainText('Completed')
  await expect(page.locator('[data-task="create_automation"]')).toHaveClass(/completed/)
  await card.getByRole('button', { name: 'Start from beginning' }).click()
  await expect(panel.getByRole('button', { name: 'Start setup', exact: true })).toBeVisible()
  await panel.getByRole('button', { name: 'Close chat' }).click()
  await page.getByRole('button', { name: 'Import from CSV', exact: true }).click()
  await expect(panel).toContainText(
    "Upload your CRM export and I'll map and import it. One file, or separate files for companies, contacts and deals.",
  )
  await expect(panel.locator('input[type=file]')).toBeVisible()
  expect(errors).toEqual([])
})
