import { and, asc, eq, sql } from 'drizzle-orm'
import { createError } from 'h3'
import type { AppDatabase } from '../db'
import * as s from '../db/schema'
import { emitChange } from './realtime'
import {
  prospectiveCredits,
  relevantCompletions,
  taskCatalogue,
  visibleTasks,
  type TaskKey,
} from '../../shared/onboarding'

type Tx = Parameters<Parameters<AppDatabase['transaction']>[0]>[0]
type Change = {
  model: string
  op: 'insert' | 'update'
  row: { id: string; [key: string]: unknown }
}
export type Mutation = { tx: Tx; changes: Change[] }
export type Actor = { workspaceId: string; userId: string }
/** A transaction-local outbox: nothing is published when a write rolls back. */
export function onboardingTransaction<T>(
  db: AppDatabase,
  workspaceId: string,
  write: (mutation: Mutation) => T,
): T {
  const changes: Change[] = []
  const result = db.transaction((tx) => write({ tx, changes }), { behavior: 'immediate' })
  for (const change of changes) emitChange(workspaceId, change.model, change.op, change.row)
  return result
}
export function requireActor(tx: Pick<AppDatabase, 'select'>, actor: Actor, admin = false) {
  const row = tx
    .select()
    .from(s.memberships)
    .where(
      and(
        eq(s.memberships.workspaceId, actor.workspaceId),
        eq(s.memberships.userId, actor.userId),
        eq(s.memberships.status, 'active'),
      ),
    )
    .get()
  if (!row || (admin && row.role !== 'admin'))
    throw createError({ statusCode: 403, statusMessage: 'Workspace administrator access required' })
  return row
}
/** Call only from a qualifying domain write, inside its transaction. Partial indexes arbitrate retries. */
export function completeTask({ tx, changes }: Mutation, actor: Actor, taskKey: TaskKey) {
  const task = taskCatalogue.find((task) => task.key === taskKey)!
  const membership = requireActor(tx, actor, task.scope === 'workspace')
  const workspace = tx
    .select()
    .from(s.workspaces)
    .where(eq(s.workspaces.id, actor.workspaceId))
    .get()!
  const subscription = tx
    .select()
    .from(s.subscriptions)
    .where(eq(s.subscriptions.workspaceId, actor.workspaceId))
    .get()
  const rows = tx
    .select()
    .from(s.onboardingTaskCompletions)
    .where(eq(s.onboardingTaskCompletions.workspaceId, actor.workspaceId))
    .all()
  const dismissed =
    task.scope === 'workspace' ? workspace.onboardingSkippedAt : membership.onboardingSkippedAt
  const creditsAwarded = dismissed ? 0 : prospectiveCredits(taskKey, rows, Boolean(subscription))
  const completion = tx
    .insert(s.onboardingTaskCompletions)
    .values({
      workspaceId: actor.workspaceId,
      userId: task.scope === 'user' ? actor.userId : null,
      taskKey,
      creditsAwarded,
    })
    .onConflictDoNothing()
    .returning()
    .get()
  if (!completion)
    return rows.find(
      (row) =>
        row.taskKey === taskKey && row.userId === (task.scope === 'user' ? actor.userId : null),
    )!
  changes.push({ model: 'onboardingTaskCompletions', op: 'insert', row: completion })
  if (subscription) {
    const updated = tx
      .update(s.subscriptions)
      .set({
        topupCreditsRemaining: sql`${s.subscriptions.topupCreditsRemaining} + ${creditsAwarded}`,
      })
      .where(eq(s.subscriptions.id, subscription.id))
      .returning()
      .get()!
    changes.push({ model: 'subscriptions', op: 'update', row: updated })
  }
  return completion
}
export function connectAccount(
  db: AppDatabase,
  actor: Actor,
  input: {
    kind: 'google' | 'notetaker' | 'linkedin'
    provider?: string
    email: string
    isDemo: boolean
    settings?: Record<string, unknown>
  },
) {
  return onboardingTransaction(db, actor.workspaceId, (mutation) => {
    requireActor(mutation.tx, actor)
    const tables =
      input.kind === 'google'
        ? [s.mailboxes, s.calendars]
        : input.kind === 'notetaker'
          ? [s.notetakers]
          : [s.linkedinAccounts]
    for (const table of tables) {
      const model =
        table === s.mailboxes
          ? 'mailboxes'
          : table === s.calendars
            ? 'calendars'
            : table === s.notetakers
              ? 'notetakers'
              : 'linkedinAccounts'
      const existing = mutation.tx
        .select()
        .from(table)
        .where(and(eq(table.workspaceId, actor.workspaceId), eq(table.userId, actor.userId)))
        .get()
      const values = {
        ...actor,
        type: input.provider || input.kind,
        email: input.email,
        status: 'connected',
        isDemo: input.isDemo,
        settings: input.settings || {},
      }
      const row = existing
        ? mutation.tx.update(table).set(values).where(eq(table.id, existing.id)).returning().get()!
        : mutation.tx.insert(table).values(values).returning().get()
      // Credentials never enter a workspace-wide stream or API response.
      const { settings: _settings, ...publicRow } = row
      mutation.changes.push({ model, op: existing ? 'update' : 'insert', row: publicRow })
    }
    return completeTask(
      mutation,
      actor,
      input.kind === 'google'
        ? 'connect_gmail'
        : input.kind === 'notetaker'
          ? 'connect_notetaker'
          : 'install_extension',
    )
  })
}
export const agentCatalogue = [
  {
    key: 'meeting-brief',
    name: 'Meeting brief',
    description: 'Prepare a short account summary before each customer meeting.',
  },
  {
    key: 'follow-up',
    name: 'Follow-up planner',
    description: 'Turn meeting notes into suggested next steps for your team.',
  },
  {
    key: 'deal-health',
    name: 'Deal health monitor',
    description: 'Flag stalled opportunities and missing next steps.',
  },
  {
    key: 'contact-care',
    name: 'Contact caretaker',
    description: 'Spot incomplete contact records and suggest what to fill in.',
  },
  {
    key: 'customer-pulse',
    name: 'Customer pulse',
    description: 'Surface customers who may need a check-in.',
  },
  {
    key: 'pipeline-digest',
    name: 'Pipeline digest',
    description: 'Summarize pipeline changes for your weekly review.',
  },
] as const
export function seedAgents(db: AppDatabase, workspaceId: string) {
  db.insert(s.agents)
    .values(agentCatalogue.map((agent) => ({ ...agent, workspaceId })))
    .onConflictDoNothing()
    .run()
}
export function toggleAgent(db: AppDatabase, actor: Actor, id: string, enabled: boolean) {
  return onboardingTransaction(db, actor.workspaceId, (mutation) => {
    requireActor(mutation.tx, actor, true)
    const row = mutation.tx
      .update(s.agents)
      .set({ enabled })
      .where(and(eq(s.agents.id, id), eq(s.agents.workspaceId, actor.workspaceId)))
      .returning()
      .get()
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Agent not found' })
    mutation.changes.push({ model: 'agents', op: 'update', row })
    if (enabled) completeTask(mutation, actor, 'create_automation')
    return row
  })
}
export function inviteTeam(
  db: AppDatabase,
  actor: Actor,
  emails: string[],
  role: 'admin' | 'member',
) {
  return onboardingTransaction(db, actor.workspaceId, (mutation) => {
    requireActor(mutation.tx, actor, true)
    const invited = []
    for (const email of new Set(emails)) {
      const existingUser = mutation.tx.select().from(s.users).where(eq(s.users.email, email)).get()
      if (
        existingUser &&
        mutation.tx
          .select()
          .from(s.memberships)
          .where(
            and(
              eq(s.memberships.workspaceId, actor.workspaceId),
              eq(s.memberships.userId, existingUser.id),
              eq(s.memberships.status, 'active'),
            ),
          )
          .get()
      )
        continue
      const row = mutation.tx
        .insert(s.memberships)
        .values({
          workspaceId: actor.workspaceId,
          inviteEmail: email,
          invitedById: actor.userId,
          role,
          status: 'invited',
        })
        .onConflictDoNothing()
        .returning()
        .get()
      if (row) {
        invited.push(row)
        mutation.changes.push({ model: 'memberships', op: 'insert', row })
      }
    }
    if (invited.length) completeTask(mutation, actor, 'invite_colleague')
    return invited
  })
}
const sampleCompanies = [
  'Alder Workshop',
  'Cobalt Orchard',
  'Maple Circuit',
  'Juniper Studio',
  'Copper Harbor',
  'Willow Metrics',
  'Cedar Lantern',
  'Birch Meadow',
  'Amber Compass',
  'Silver Fern',
]
const sampleNames = [
  'Avery Chen',
  'Jordan Patel',
  'Riley Morgan',
  'Taylor Brooks',
  'Casey Rivera',
  'Morgan Reed',
  'Cameron Lee',
  'Quinn Hayes',
  'Jamie Ellis',
  'Drew Parker',
]
export function importDemo(db: AppDatabase, actor: Actor, source: string) {
  return onboardingTransaction(db, actor.workspaceId, (mutation) => {
    requireActor(mutation.tx, actor, true)
    const existing = mutation.tx
      .select()
      .from(s.imports)
      .where(
        and(
          eq(s.imports.workspaceId, actor.workspaceId),
          eq(s.imports.type, source),
          eq(s.imports.status, 'Completed'),
        ),
      )
      .get()
    if (existing) return existing
    const job = mutation.tx
      .insert(s.imports)
      .values({ ...actor, type: source, status: 'Running' })
      .returning()
      .get()
    mutation.changes.push({ model: 'imports', op: 'insert', row: job })
    sampleCompanies.forEach((name, i) => {
      const company = mutation.tx
        .insert(s.companies)
        .values({
          workspaceId: actor.workspaceId,
          name: `${name} (Demo)`,
          domain: `demo-${i + 1}.example`,
          description: 'Fictional sample company for exploring Tenzeros.',
          industry: i % 2 ? 'Professional services' : 'Software',
          isExample: true,
          attributes: { source: 'demo', importId: job.id },
        })
        .returning()
        .get()
      const contact = mutation.tx
        .insert(s.contacts)
        .values({
          workspaceId: actor.workspaceId,
          companyId: company.id,
          name: `${sampleNames[i]} (Demo)`,
          email: `hello@demo-${i + 1}.example`,
          title: i % 2 ? 'Head of Operations' : 'Sales Director',
          isExample: true,
          attributes: { source: 'demo', importId: job.id },
        })
        .returning()
        .get()
      mutation.changes.push(
        { model: 'companies', op: 'insert', row: company },
        { model: 'contacts', op: 'insert', row: contact },
      )
    })
    const completed = mutation.tx
      .update(s.imports)
      .set({ status: 'Completed', recordCount: 20 })
      .where(eq(s.imports.id, job.id))
      .returning()
      .get()!
    mutation.changes.push({ model: 'imports', op: 'update', row: completed })
    completeTask(mutation, actor, 'import_data')
    return completed
  })
}
export function finishOnboarding(db: AppDatabase, actor: Actor, action: 'complete' | 'dismiss') {
  return onboardingTransaction(db, actor.workspaceId, (mutation) => {
    const membership = requireActor(mutation.tx, actor)
    const workspace = mutation.tx
      .select()
      .from(s.workspaces)
      .where(eq(s.workspaces.id, actor.workspaceId))
      .get()!
    if (action === 'complete') {
      const keys = visibleTasks(membership.role, workspace).map((task) => task.key)
      const rows = mutation.tx
        .select()
        .from(s.onboardingTaskCompletions)
        .where(eq(s.onboardingTaskCompletions.workspaceId, actor.workspaceId))
        .all()
      if (relevantCompletions(rows, actor.userId, keys).length !== keys.length)
        throw createError({ statusCode: 409, statusMessage: 'Complete all visible tasks first' })
    }
    const field = action === 'complete' ? 'onboardingCompletedAt' : 'onboardingSkippedAt'
    const now = new Date().toISOString()
    const row = mutation.tx
      .update(s.memberships)
      .set({ [field]: membership[field] || now })
      .where(eq(s.memberships.id, membership.id))
      .returning()
      .get()!
    mutation.changes.push({ model: 'memberships', op: 'update', row })
    if (
      membership.role === 'admin' &&
      !workspace.onboardingCompletedAt &&
      !workspace.onboardingSkippedAt
    ) {
      const updated = mutation.tx
        .update(s.workspaces)
        .set({ [field]: now })
        .where(eq(s.workspaces.id, actor.workspaceId))
        .returning()
        .get()!
      mutation.changes.push({ model: 'workspaces', op: 'update', row: updated })
    }
    return { completed: action === 'complete', dismissed: action === 'dismiss' }
  })
}
export function onboardingSnapshot(db: AppDatabase, actor: Actor) {
  const rows = db
    .select()
    .from(s.onboardingTaskCompletions)
    .where(eq(s.onboardingTaskCompletions.workspaceId, actor.workspaceId))
    .orderBy(asc(s.onboardingTaskCompletions.completedAt))
    .all()
  const subscription = db
    .select()
    .from(s.subscriptions)
    .where(eq(s.subscriptions.workspaceId, actor.workspaceId))
    .get()
  const ownConnections = (
    table:
      typeof s.mailboxes | typeof s.calendars | typeof s.notetakers | typeof s.linkedinAccounts,
  ) =>
    db
      .select({
        id: table.id,
        type: table.type,
        email: table.email,
        status: table.status,
        isDemo: table.isDemo,
      })
      .from(table)
      .where(and(eq(table.workspaceId, actor.workspaceId), eq(table.userId, actor.userId)))
      .all()
  return {
    completions: rows,
    prospectiveCredits: Object.fromEntries(
      taskCatalogue.map((task) => [
        task.key,
        prospectiveCredits(task.key, rows, Boolean(subscription)),
      ]),
    ),
    mailboxes: ownConnections(s.mailboxes),
    calendars: ownConnections(s.calendars),
    notetakers: ownConnections(s.notetakers),
    linkedinAccounts: ownConnections(s.linkedinAccounts),
    members: db
      .select({
        id: s.memberships.id,
        userId: s.memberships.userId,
        role: s.memberships.role,
        status: s.memberships.status,
        email: s.memberships.inviteEmail,
        name: s.users.name,
        userEmail: s.users.email,
        avatarColor: s.users.avatarColor,
      })
      .from(s.memberships)
      .leftJoin(s.users, eq(s.users.id, s.memberships.userId))
      .where(eq(s.memberships.workspaceId, actor.workspaceId))
      .all(),
    imports: db
      .select()
      .from(s.imports)
      .where(and(eq(s.imports.workspaceId, actor.workspaceId), eq(s.imports.status, 'Completed')))
      .orderBy(asc(s.imports.createdAt))
      .all(),
    googleAvailable: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  }
}
