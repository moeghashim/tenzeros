import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { eq, and } from 'drizzle-orm'
import { openDatabase } from '../../server/db'
import { memberships, users } from '../../server/db/schema'
import { signup, connect, finishAgentsFlow, snapshot } from './helpers'

const taskKeys = [
  'connect_gmail',
  'connect_notetaker',
  'install_extension',
  'create_automation',
  'invite_colleague',
  'import_data',
]

test('all six tasks, cross-tab rewards, one celebration per task, member visibility and guided setup', async ({
  page,
  context,
  browser,
}) => {
  // Observe the existing animation/storage boundaries, without changing app behavior.
  await context.addInitScript(() => {
    const events: string[] = []
    Object.assign(window, { taskAnimations: events })
    const animate = HTMLElement.prototype.animate
    HTMLElement.prototype.animate = function (...args) {
      if (this.dataset.task) events.push(this.dataset.task)
      return animate.apply(this, args)
    }
  })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const { key } = await signup(page)
  const initial = await snapshot(page, key)
  const storageKey = `onboarding-seen-tasks:${initial.workspace.id}:${initial.user.id}`
  const second = await context.newPage()
  await second.goto(`/${key}/onboarding`)
  await expect(second.getByRole('progressbar')).toHaveAttribute(
    'aria-valuetext',
    '0 of 150 credits earned',
  )
  for (const flow of ['start-outreach', 'personalize-emails'])
    await expect(page.locator(`[data-flow="${flow}"]`)).toContainText('Connect Gmail')

  await connect(page, 'connect_gmail')
  for (const flow of ['start-outreach', 'personalize-emails'])
    await expect(page.locator(`[data-flow="${flow}"]`)).not.toContainText('Connect Gmail')
  await expect(second.getByRole('progressbar')).toHaveAttribute(
    'aria-valuetext',
    '25 of 150 credits earned',
  )
  await connect(page, 'connect_notetaker')
  await connect(page, 'install_extension')
  await page.locator('[data-task="create_automation"]').click()
  await page.getByRole('switch', { name: 'Enable Meeting brief' }).click()
  await expect(page.getByRole('switch', { name: 'Enable Meeting brief' })).toBeChecked()
  await page.getByRole('link', { name: '← Get started', exact: true }).click()
  await expect(page.locator('[data-task="create_automation"]')).toHaveClass(/completed/)

  await page.locator('[data-task="invite_colleague"]').click()
  const inviteEmail = `member-${initial.workspace.id}@example.test`
  await page.getByLabel('Email addresses').fill(inviteEmail)
  await page.getByRole('button', { name: 'Invite teammates', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.locator('[data-task="invite_colleague"]')).toHaveClass(/completed/)

  // Accept this real UI-created invitation in the isolated test database. There
  // is deliberately no privileged seed/accept route in the production server.
  const db = openDatabase(process.env.E2E_DATABASE_PATH!)
  try {
    db.transaction(() => {
      const user = db
        .insert(users)
        .values({ name: 'Invited Member', email: inviteEmail })
        .returning()
        .get()
      const updated = db
        .update(memberships)
        .set({ userId: user.id, status: 'active', onboardingStartedAt: new Date().toISOString() })
        .where(
          and(
            eq(memberships.workspaceId, initial.workspace.id),
            eq(memberships.inviteEmail, inviteEmail),
          ),
        )
        .returning()
        .all()
      expect(updated).toHaveLength(1)
    })
  } finally {
    db.$client.close()
  }
  const memberContext = await browser.newContext()
  const member = await memberContext.newPage()
  await member.goto('http://localhost:3100/login')
  await member.getByLabel('Your name').fill('Invited Member')
  await member.getByLabel('Email', { exact: true }).fill(inviteEmail)
  await member.getByRole('button', { name: 'Sign in', exact: true }).click()
  await member.waitForURL(`**/${key}/onboarding`)
  await expect(member.locator('[data-task]')).toHaveCount(3)
  for (const task of taskKeys.slice(3))
    await expect(member.locator(`[data-task="${task}"]`)).toHaveCount(0)
  expect(
    (await member.request.post(`/api/workspaces/${key}/agents/seed`, { data: {} })).status(),
  ).toBe(403)
  await memberContext.close()

  await page.getByRole('button', { name: 'Import from CSV', exact: true }).click()
  const chat = page.getByRole('complementary', { name: 'Tenzeros chat' })
  await chat
    .getByLabel('Choose CSV')
    .setInputFiles(fileURLToPath(new URL('../fixtures/contacts.csv', import.meta.url)))
  await expect(chat).toContainText('company.name')
  await chat.getByRole('button', { name: /Confirm mapping and import/ }).click()
  await expect(chat).not.toBeVisible()
  await expect(page.getByRole('progressbar')).toHaveAttribute(
    'aria-valuetext',
    '150 of 150 credits earned',
  )
  await expect(second.getByRole('progressbar')).toHaveAttribute(
    'aria-valuetext',
    '150 of 150 credits earned',
  )
  const completed = await snapshot(page, key)
  expect(completed.completions).toHaveLength(6)
  expect(completed.imports[0]).toMatchObject({ type: 'csv', status: 'Completed', recordCount: 4 })
  const records = await (await page.request.get(`/api/workspaces/${key}/records`)).json()
  expect(records.contacts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'Alex Orchard', email: 'alex@orchard.example' }),
      expect.objectContaining({ name: 'Sam Harbor', email: 'sam@harbor.example' }),
    ]),
  )
  expect(completed.subscription.topupCreditsRemaining).toBe(2150)
  expect(completed.workspace.onboardingCompletedAt).toBeNull()
  await expect(page.getByRole('button', { name: 'Complete onboarding', exact: true })).toBeVisible()

  const seen = (p: typeof page) =>
    p.evaluate((key) => JSON.parse(localStorage.getItem(key) || '[]') as string[], storageKey)
  await expect.poll(() => seen(page)).toEqual(expect.arrayContaining(taskKeys))
  expect(new Set(await seen(page)).size).toBe(6)
  // Each task's animation/confetti path was claimed by exactly one tab.
  const animations = async (p: typeof page) =>
    p.evaluate(() => (window as unknown as { taskAnimations: string[] }).taskAnimations)
  expect([...(await animations(page)), ...(await animations(second))].sort()).toEqual(
    [...taskKeys].sort(),
  )
  await page.reload()
  await expect(page.getByRole('progressbar')).toHaveAttribute(
    'aria-valuetext',
    '150 of 150 credits earned',
  )
  expect(await animations(page)).toEqual([])
  expect((await seen(page)).sort()).toEqual([...taskKeys].sort())
  await finishAgentsFlow(page)
  await expect(second.locator('[data-flow="activate-agents"]')).toContainText('Completed')
  await page.getByRole('button', { name: 'Complete onboarding', exact: true }).click()
  await page.waitForURL(`**/${key}`)
  await second.waitForURL(`**/${key}`)
  const final = await snapshot(page, key)
  expect(final.workspace.onboardingCompletedAt).toEqual(expect.any(String))
  expect(final.membership.onboardingCompletedAt).toEqual(expect.any(String))
  expect(final.subscription.topupCreditsRemaining).toBe(2150)
  expect(errors).toEqual([])
})
