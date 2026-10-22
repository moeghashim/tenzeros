import { afterEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { testDatabase, accountInput } from './database'
import { createAccount } from '../server/utils/accounts'
import {
  completeTask,
  onboardingTransaction,
  connectAccount,
  inviteTeam,
  importDemo,
  seedAgents,
  toggleAgent,
  finishOnboarding,
  onboardingSnapshot,
} from '../server/utils/onboarding'
import { realtimeHub } from '../server/utils/realtime'
import * as s from '../server/db/schema'
import {
  onboardingDone,
  visibleTasks,
  relevantCompletions,
  progressSummary,
  orderedFlows,
} from '../shared/onboarding'
const databases: ReturnType<typeof testDatabase>[] = []
function setup() {
  const db = testDatabase()
  databases.push(db)
  const { user, workspace } = createAccount(db, accountInput)
  return { db, user, workspace, actor: { workspaceId: workspace.id, userId: user.id } }
}
afterEach(() => {
  databases.splice(0).forEach((db) => db.$client.close())
})
describe('transactional completion service', () => {
  it('awards once across retries and publishes committed completion and credit rows', () => {
    const { db, actor } = setup()
    const listener = vi.fn(() =>
      expect(db.select().from(s.onboardingTaskCompletions).all()).toHaveLength(1),
    )
    const unsubscribe = realtimeHub.subscribe([actor.workspaceId], listener)
    const finish = () =>
      onboardingTransaction(db, actor.workspaceId, (tx) => completeTask(tx, actor, 'connect_gmail'))
    const first = finish()
    const second = finish()
    unsubscribe()
    expect(second.id).toBe(first.id)
    expect(first.creditsAwarded).toBe(25)
    expect(db.select().from(s.subscriptions).get()?.topupCreditsRemaining).toBe(2025)
    expect(listener.mock.calls).toHaveLength(2)
    expect(
      listener.mock.calls.map(
        (call) => (call as unknown as [{ targetModel: string }])[0].targetModel,
      ),
    ).toEqual(['onboardingTaskCompletions', 'subscriptions'])
  })
  it('rolls back completion, credits, domain row and all events together', () => {
    const { db, actor } = setup()
    const listener = vi.fn(),
      unsubscribe = realtimeHub.subscribe([actor.workspaceId], listener)
    expect(() =>
      onboardingTransaction(db, actor.workspaceId, (mutation) => {
        mutation.tx
          .insert(s.mailboxes)
          .values({ ...actor, type: 'google' })
          .run()
        completeTask(mutation, actor, 'connect_gmail')
        throw new Error('fail after credit update')
      }),
    ).toThrow('fail after credit update')
    unsubscribe()
    expect(db.select().from(s.mailboxes).all()).toHaveLength(0)
    expect(db.select().from(s.onboardingTaskCompletions).all()).toHaveLength(0)
    expect(db.select().from(s.subscriptions).get()?.topupCreditsRemaining).toBe(2000)
    expect(listener).not.toHaveBeenCalled()
  })
  it('awards the first four users independently for each personal task and zero thereafter', () => {
    const { db, actor } = setup()
    const credits: number[] = []
    for (let i = 0; i < 6; i++) {
      const user = db
        .insert(s.users)
        .values({ email: `user-${i}@example.test`, name: `User ${i}` })
        .returning()
        .get()
      db.insert(s.memberships).values({ workspaceId: actor.workspaceId, userId: user.id }).run()
      credits.push(
        connectAccount(
          db,
          { ...actor, userId: user.id },
          { kind: 'google', email: user.email, isDemo: true },
        ).creditsAwarded,
      )
    }
    expect(credits).toEqual([25, 25, 25, 25, 0, 0])
    expect(
      connectAccount(db, actor, {
        kind: 'notetaker',
        provider: 'Fathom',
        email: 'alex@example.test',
        isDemo: true,
      }).creditsAwarded,
    ).toBe(25)
    expect(db.select().from(s.subscriptions).get()?.topupCreditsRemaining).toBe(2125)
  })
  it('uses workspace scope once across admins and enforces administrator access', () => {
    const { db, actor } = setup()
    const other = db
      .insert(s.users)
      .values({ email: 'admin@example.test', name: 'Admin' })
      .returning()
      .get()
    db.insert(s.memberships)
      .values({ workspaceId: actor.workspaceId, userId: other.id, role: 'admin' })
      .run()
    const a = onboardingTransaction(db, actor.workspaceId, (tx) =>
      completeTask(tx, actor, 'invite_colleague'),
    )
    const b = onboardingTransaction(db, actor.workspaceId, (tx) =>
      completeTask(tx, { ...actor, userId: other.id }, 'invite_colleague'),
    )
    expect(a.userId).toBeNull()
    expect(b.id).toBe(a.id)
    db.update(s.memberships).set({ role: 'member' }).where(eq(s.memberships.userId, other.id)).run()
    expect(() =>
      onboardingTransaction(db, actor.workspaceId, (tx) =>
        completeTask(tx, { ...actor, userId: other.id }, 'import_data'),
      ),
    ).toThrow('administrator')
  })
  it('legacy workspaces and dismissed onboarding award zero', () => {
    const { db, actor } = setup()
    db.delete(s.subscriptions).run()
    expect(
      connectAccount(db, actor, { kind: 'google', email: accountInput.email, isDemo: true })
        .creditsAwarded,
    ).toBe(0)
    db.insert(s.subscriptions).values({ workspaceId: actor.workspaceId }).run()
    finishOnboarding(db, actor, 'dismiss')
    expect(
      connectAccount(db, actor, { kind: 'linkedin', email: accountInput.email, isDemo: true })
        .creditsAwarded,
    ).toBe(0)
    expect(inviteTeam(db, actor, ['friend@example.test'], 'member')).toHaveLength(1)
    expect(db.select().from(s.subscriptions).get()?.topupCreditsRemaining).toBe(2000)
  })
  it('simulates each connection with its qualifying rows and keeps credentials out of snapshots and SSE', () => {
    const { db, actor } = setup()
    const events: unknown[] = [],
      unsubscribe = realtimeHub.subscribe([actor.workspaceId], (event) => events.push(event))
    for (const kind of ['google', 'notetaker', 'linkedin'] as const)
      connectAccount(db, actor, {
        kind,
        email: accountInput.email,
        provider: kind === 'notetaker' ? 'Fireflies.ai' : undefined,
        isDemo: true,
        settings: { secret: 'not-for-clients' },
      })
    unsubscribe()
    expect(db.select().from(s.mailboxes).all()).toHaveLength(1)
    expect(db.select().from(s.calendars).all()).toHaveLength(1)
    expect(db.select().from(s.notetakers).all()).toHaveLength(1)
    expect(db.select().from(s.linkedinAccounts).all()).toHaveLength(1)
    expect(
      db
        .select()
        .from(s.onboardingTaskCompletions)
        .all()
        .map((row) => row.taskKey),
    ).toEqual(['connect_gmail', 'connect_notetaker', 'install_extension'])
    expect(JSON.stringify(events)).not.toContain('not-for-clients')
    expect(JSON.stringify(onboardingSnapshot(db, actor))).not.toContain('not-for-clients')
    connectAccount(db, actor, { kind: 'google', email: accountInput.email, isDemo: true })
    expect(db.select().from(s.mailboxes).all()).toHaveLength(1)
  })
  it('seeds exactly six agents and completes only when an agent is enabled', () => {
    const { db, actor } = setup()
    seedAgents(db, actor.workspaceId)
    seedAgents(db, actor.workspaceId)
    const agents = db.select().from(s.agents).all()
    expect(agents).toHaveLength(6)
    toggleAgent(db, actor, agents[0]!.id, false)
    expect(db.select().from(s.onboardingTaskCompletions).all()).toHaveLength(0)
    toggleAgent(db, actor, agents[0]!.id, true)
    toggleAgent(db, actor, agents[1]!.id, true)
    expect(db.select().from(s.subscriptions).get()?.topupCreditsRemaining).toBe(2025)
    expect(() => toggleAgent(db, actor, crypto.randomUUID(), true)).toThrow('Agent not found')
  })
  it('invites unique emails, skips active members, and does not change roles on duplicate invites', () => {
    const { db, actor } = setup()
    expect(inviteTeam(db, actor, [accountInput.email], 'admin')).toHaveLength(0)
    expect(db.select().from(s.onboardingTaskCompletions).all()).toHaveLength(0)
    expect(
      inviteTeam(db, actor, ['friend@example.test', 'friend@example.test'], 'member'),
    ).toHaveLength(1)
    expect(inviteTeam(db, actor, ['friend@example.test'], 'admin')).toHaveLength(0)
    const invite = db
      .select()
      .from(s.memberships)
      .where(eq(s.memberships.inviteEmail, 'friend@example.test'))
      .get()!
    expect(invite.status).toBe('invited')
    expect(invite.role).toBe('member')
    expect(db.select().from(s.onboardingTaskCompletions).get()?.taskKey).toBe('invite_colleague')
  })
  it('imports 20 clearly fictional records and completes after Running → Completed, once per source', () => {
    const { db, actor } = setup()
    const statuses: string[] = [],
      unsubscribe = realtimeHub.subscribe([actor.workspaceId], (event) => {
        if (event.type !== 'custom' && event.targetModel === 'imports')
          statuses.push(String(event.data.status))
      })
    const job = importDemo(db, actor, 'hubspot')
    expect(importDemo(db, actor, 'hubspot').id).toBe(job.id)
    unsubscribe()
    expect(statuses).toEqual(['Running', 'Completed'])
    expect(job.recordCount).toBe(20)
    expect(db.select().from(s.companies).all()).toHaveLength(10)
    expect(db.select().from(s.contacts).all()).toHaveLength(10)
    expect(
      db
        .select()
        .from(s.companies)
        .all()
        .every(
          (row) => row.isExample && row.attributes.source === 'demo' && row.name.endsWith('(Demo)'),
        ),
    ).toBe(true)
    expect(db.select().from(s.onboardingTaskCompletions).get()?.taskKey).toBe('import_data')
  })
  it('rejects premature completion, then finishes both membership and workspace for admins', () => {
    const { db, actor } = setup()
    expect(() => finishOnboarding(db, actor, 'complete')).toThrow(
      'Complete all visible tasks first',
    )
    for (const task of visibleTasks('admin', {
      onboardingCompletedAt: null,
      onboardingSkippedAt: null,
    }))
      onboardingTransaction(db, actor.workspaceId, (tx) => completeTask(tx, actor, task.key))
    finishOnboarding(db, actor, 'complete')
    expect(db.select().from(s.memberships).get()?.onboardingCompletedAt).toBeTruthy()
    expect(db.select().from(s.workspaces).get()?.onboardingCompletedAt).toBeTruthy()
    expect(db.select().from(s.subscriptions).get()?.topupCreditsRemaining).toBe(2150)
  })
})
describe('shared visibility, progress and ordering', () => {
  const fresh = { onboardingCompletedAt: null, onboardingSkippedAt: null }
  it('shows workspace tasks only to admins while workspace onboarding is open', () => {
    expect(visibleTasks('admin', fresh)).toHaveLength(6)
    expect(visibleTasks('member', fresh)).toHaveLength(3)
    expect(visibleTasks('admin', { ...fresh, onboardingCompletedAt: 'now' })).toHaveLength(3)
    expect(onboardingDone('admin', { ...fresh, onboardingCompletedAt: 'now' }, fresh)).toBe(false)
    expect(onboardingDone('member', { ...fresh, onboardingSkippedAt: 'now' }, fresh)).toBe(true)
  })
  it('filters other users and hidden workspace tasks out of progress', () => {
    const rows = [
      { id: '1', userId: 'self', taskKey: 'connect_gmail', creditsAwarded: 25, completedAt: '1' },
      { id: '2', userId: 'other', taskKey: 'connect_gmail', creditsAwarded: 25, completedAt: '2' },
      { id: '3', userId: null, taskKey: 'import_data', creditsAwarded: 25, completedAt: '3' },
    ]
    expect(relevantCompletions(rows, 'self', ['connect_gmail'])).toEqual([rows[0]])
    expect(progressSummary([rows[0]!], { connect_gmail: 25, connect_notetaker: 25 }).percent).toBe(
      50,
    )
    expect(progressSummary([rows[0]!], { connect_gmail: 0, connect_notetaker: 0 })).toMatchObject({
      countMode: true,
      completed: 1,
      total: 2,
      percent: 50,
    })
  })
  it('orders in progress, unstarted, completed with stable catalogue ties', () => {
    const flows = orderedFlows({
      'pipeline-and-lists': 'completed',
      'existing-customers': 'in_progress',
    })
    expect(flows[0]?.key).toBe('existing-customers')
    expect(flows[1]?.key).toBe('activate-agents')
    expect(flows.at(-1)?.key).toBe('pipeline-and-lists')
  })
})
