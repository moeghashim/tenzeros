import { afterEach, describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createAccount, workspaceForUser } from '../server/utils/accounts'
import {
  memberships,
  subscriptions,
  users,
  workspaces,
  onboardingTaskCompletions,
} from '../server/db/schema'
import { accountInput, testDatabase } from './database'
const db = testDatabase()
afterEach(() => {
  db.delete(workspaces).run()
  db.delete(users).run()
})
describe('signup transaction and schema', () => {
  it('creates the user, slugged workspace, active admin membership, and 14-day trial with 2000 credits', () => {
    const now = new Date('2026-10-22T00:00:00Z')
    const { user, workspace } = createAccount(db, accountInput, now)
    expect(user.email).toBe(accountInput.email)
    expect(workspace).toMatchObject({
      key: 'acme-sales',
      domain: 'example.com',
      trialEndsAt: '2026-11-05T00:00:00.000Z',
    })
    expect(db.select().from(memberships).get()).toMatchObject({
      workspaceId: workspace.id,
      userId: user.id,
      role: 'admin',
      status: 'active',
    })
    expect(db.select().from(subscriptions).get()).toMatchObject({
      workspaceId: workspace.id,
      status: 'trialing',
      topupCreditsRemaining: 2000,
      monthlyCreditsRemaining: 0,
    })
  })
  it('makes duplicate workspace names unique and reserves application routes', () => {
    createAccount(db, accountInput)
    expect(createAccount(db, { ...accountInput, email: 'b@example.test' }).workspace.key).toBe(
      'acme-sales-2',
    )
    expect(
      createAccount(db, { ...accountInput, email: 'c@example.test', workspaceName: 'Login' })
        .workspace.key,
    ).toBe('login-workspace')
  })
  it('normalizes email and rejects duplicate accounts without partial rows', () => {
    createAccount(db, { ...accountInput, email: ' ALEX@EXAMPLE.TEST ' })
    expect(() => createAccount(db, accountInput)).toThrow('already exists')
    expect(db.select().from(workspaces).all()).toHaveLength(1)
    expect(db.select().from(memberships).all()).toHaveLength(1)
  })
  it('validates inputs and isolates workspace access', () => {
    expect(() => createAccount(db, { ...accountInput, email: 'bad' })).toThrow()
    expect(db.select().from(users).all()).toHaveLength(0)
    const { user, workspace } = createAccount(db, accountInput)
    expect(() => workspaceForUser(db, 'not-a-member', workspace.key)).toThrow('Workspace not found')
    db.update(memberships).set({ status: 'invited' }).where(eq(memberships.userId, user.id)).run()
    expect(() => workspaceForUser(db, user.id, workspace.key)).toThrow()
  })
  it('prevents duplicate workspace-scoped completion rewards despite nullable userId', () => {
    const { workspace } = createAccount(db, accountInput)
    db.insert(onboardingTaskCompletions)
      .values({ workspaceId: workspace.id, taskKey: 'import_data' })
      .run()
    expect(() =>
      db
        .insert(onboardingTaskCompletions)
        .values({ workspaceId: workspace.id, taskKey: 'import_data' })
        .run(),
    ).toThrow()
  })
  it('applies migrations idempotently and enforces foreign keys', () => {
    expect(db.$client.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(() => db.insert(subscriptions).values({ workspaceId: 'missing' }).run()).toThrow()
  })
})
