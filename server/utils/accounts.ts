import { eq, and } from 'drizzle-orm'
import { createError } from 'h3'
import type { AppDatabase } from '../db'
import { users, workspaces, memberships, subscriptions } from '../db/schema'
import { signupSchema } from '../../shared/validation'

export function createAccount(db: AppDatabase, input: unknown, now = new Date()) {
  const data = signupSchema.parse(input)
  return db.transaction((tx) => {
    if (tx.select().from(users).where(eq(users.email, data.email)).get())
      throw createError({
        statusCode: 409,
        statusMessage: 'An account with this email already exists. Sign in instead.',
      })
    const base =
      data.workspaceName
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60) || 'workspace'
    const reserved = new Set(['api', 'signup', 'login', 'settings', '_nuxt'])
    const slugBase = reserved.has(base) ? `${base}-workspace` : base
    let key = slugBase
    for (
      let suffix = 2;
      tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.key, key)).get();
      suffix++
    )
      key = `${slugBase}-${suffix}`
    const user = tx.insert(users).values({ name: data.name, email: data.email }).returning().get()
    const workspace = tx
      .insert(workspaces)
      .values({
        key,
        name: data.workspaceName,
        domain: data.domain,
        trialEndsAt: new Date(now.getTime() + 14 * 86400000).toISOString(),
        onboardingStartedAt: now.toISOString(),
      })
      .returning()
      .get()
    tx.insert(memberships)
      .values({
        workspaceId: workspace.id,
        userId: user.id,
        role: 'admin',
        status: 'active',
        onboardingStartedAt: now.toISOString(),
      })
      .run()
    tx.insert(subscriptions)
      .values({ workspaceId: workspace.id, status: 'trialing', topupCreditsRemaining: 2000 })
      .run()
    return { user, workspace }
  })
}
export function userWorkspaces(db: AppDatabase, userId: string) {
  return db
    .select({ workspace: workspaces, role: memberships.role, membership: memberships })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(and(eq(memberships.userId, userId), eq(memberships.status, 'active')))
    .all()
}
export function workspaceForUser(db: AppDatabase, userId: string, key: string) {
  const result = userWorkspaces(db, userId).find((row) => row.workspace.key === key)
  if (!result) throw createError({ statusCode: 404, statusMessage: 'Workspace not found' })
  return result
}
