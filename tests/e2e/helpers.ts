import { randomUUID } from 'node:crypto'
import { expect, type Page } from '@playwright/test'

export async function signup(page: Page, origin = '') {
  const email = `e2e-${randomUUID()}@example.test`
  await page.goto(`${origin}/signup`)
  const submit = page.getByRole('button', { name: 'Create workspace', exact: true })
  await expect(submit).toBeEnabled()
  await page.getByLabel('Your name').fill('E2E User')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Workspace name').fill('E2E Workspace')
  await page.getByLabel('Company domain').fill('example.test')
  await submit.click()
  await page.waitForURL(/\/onboarding$/)
  await expect(page.getByRole('heading', { name: 'Get started', exact: true })).toBeVisible()
  return { key: new URL(page.url()).pathname.split('/')[1]!, email }
}
export async function connect(page: Page, task: string) {
  await page.locator(`[data-task="${task}"]`).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Demo')
  await dialog.getByRole('button', { name: 'Simulate connection', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.locator(`[data-task="${task}"]`)).toHaveClass(/completed/)
}
export async function finishAgentsFlow(page: Page) {
  const card = page.locator('[data-flow="activate-agents"]')
  await card.click()
  const panel = page.getByRole('complementary', { name: 'Tenzeros chat' })
  await panel.getByRole('button', { name: 'Start setup', exact: true }).click()
  await panel.getByRole('button', { name: /Meeting brief/ }).click()
  await panel.getByRole('button', { name: 'Continue', exact: true }).click()
  await panel.getByRole('button', { name: 'Finish walkthrough and return to onboarding' }).click()
  await expect(panel).not.toBeVisible()
  await expect(card).toContainText('Completed')
}
export async function snapshot(page: Page, key: string) {
  const response = await page.request.get(`/api/workspaces/${key}/onboarding`)
  expect(response.ok()).toBe(true)
  const state = await response.json()
  const workspace = await (await page.request.get(`/api/workspaces/${key}`)).json()
  return { ...state, subscription: workspace.subscription }
}
