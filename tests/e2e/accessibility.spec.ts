import AxeBuilder from '@axe-core/playwright'
import { test, expect, type Page } from '@playwright/test'
import { signup, connect } from './helpers'

async function accessible(page: Page) {
  const result = await new AxeBuilder({ page }).analyze()
  expect(
    result.violations
      .filter((v) => ['serious', 'critical'].includes(v.impact || ''))
      .map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
      })),
  ).toEqual([])
}

test('onboarding, agents, context and docked chat have no serious or critical axe violations', async ({
  page,
}) => {
  const { key } = await signup(page)
  await accessible(page)
  await page.goto(`/${key}/agents`)
  await expect(page.getByRole('switch')).toHaveCount(6)
  await accessible(page)
  await page.goto(`/${key}/settings/workspace/context`)
  await expect(page.getByRole('textbox')).toHaveCount(4)
  await accessible(page)
  await page.goto(`/${key}/onboarding`)
  await page.locator('[data-flow="activate-agents"]').click()
  await page.getByRole('button', { name: 'Start setup', exact: true }).click()
  await expect(page.getByRole('button', { name: /Meeting brief/ })).toBeEnabled()
  await accessible(page)
})

test('keyboard cards, dialogs, carousel and chat; reduced motion avoids confetti and springs', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const { key } = await signup(page)
  const trigger = page.locator('[data-task="connect_gmail"]')
  await page.keyboard.press('Tab')
  await trigger.focus()
  await expect(trigger).toBeFocused()
  expect(await trigger.evaluate((e) => getComputedStyle(e).outlineStyle)).toBe('solid')
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: 'Simulate connection' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
  await page.keyboard.press('Space')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
  await connect(page, 'connect_gmail')
  await expect(trigger).toBeFocused()
  await expect(page.getByRole('progressbar')).toHaveAttribute(
    'aria-valuetext',
    '25 of 150 credits earned',
  )
  await expect(page.locator('canvas')).toHaveCount(0)
  expect(
    await page.evaluate(
      () => document.getAnimations().filter((a) => a.playState === 'running').length,
    ),
  ).toBe(0)
  await expect(page.locator('.progress-showcase .fill')).toHaveCSS(
    'transform',
    /matrix\(0\.166667, 0, 0, 1, 0, 0\)/,
  )

  const track = page.getByLabel('Guided setups', { exact: true })
  await track.focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => track.evaluate((e) => e.scrollLeft)).toBeGreaterThan(0)
  const previous = page.getByRole('button', { name: 'Show previous setups' })
  await expect(previous).toBeEnabled()
  await previous.focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => track.evaluate((e) => e.scrollLeft)).toBe(0)
  const flow = page.locator('[data-flow="activate-agents"]')
  await flow.focus()
  await page.keyboard.press('Enter')
  const chat = page.getByRole('complementary', { name: 'Tenzeros chat' })
  await expect(chat.getByRole('button', { name: 'Start setup', exact: true })).toBeFocused()
  await chat.getByRole('button', { name: 'Start setup', exact: true }).focus()
  await page.keyboard.press('Enter')
  const option = chat.getByRole('button', { name: /Meeting brief/ })
  await expect(option).toBeEnabled()
  await option.focus()
  await page.keyboard.press('Space')
  await expect(option).toHaveAttribute('aria-pressed', 'true')
  await chat.getByRole('button', { name: 'Continue', exact: true }).focus()
  await page.keyboard.press('Control+Enter')
  await expect(
    chat.getByRole('button', { name: 'Finish walkthrough and return to onboarding' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(chat).not.toBeVisible()
  // Starting a flow replaces its button with a status article; fallback focus is main.
  await expect(page.locator('#main')).toBeFocused()
  await page.goto(`/${key}/onboarding`)
  await expect(page.locator('canvas')).toHaveCount(0)
  await page.locator('[data-flow="pipeline-and-lists"]').focus()
  await page.keyboard.press('Enter')
  const begin = chat.getByRole('button', { name: 'Start setup', exact: true })
  await expect(begin).toBeEnabled()
  await begin.focus()
  await page.keyboard.press('Enter')
  const composer = chat.getByRole('textbox', { name: 'Message Tenzeros' })
  await expect(composer).toBeEnabled()
  await composer.fill('We sell consulting through discovery, proposal and close.')
  await page.keyboard.press('Control+Enter')
  await expect(chat.locator('.message.user').last()).toContainText(
    'We sell consulting through discovery, proposal and close.',
  )
  await expect(composer).toHaveValue('')
})
