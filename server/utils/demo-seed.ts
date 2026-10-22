import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../db'
import { users, workspaces, aiContexts } from '../db/schema'
import { contextNames } from '../../shared/validation'
import { createAccount, userWorkspaces } from './accounts'
import { seedAgents } from './onboarding'

/** Idempotent, offline demo. Preserve edited context and agent settings. */
export function seedDemo(db: AppDatabase) {
  return db.transaction(() => {
    const existing = db.select().from(users).where(eq(users.email, 'demo@tenzeros.local')).get()
    const workspace = existing
      ? userWorkspaces(db, existing.id)[0]?.workspace
      : createAccount(db, {
          name: 'Demo User',
          email: 'demo@tenzeros.local',
          workspaceName: 'Demo Workspace',
          domain: 'example.com',
        }).workspace
    if (!workspace) throw new Error('Demo user has no active workspace.')
    for (const name of contextNames)
      db.insert(aiContexts)
        .values({
          workspaceId: workspace.id,
          name,
          content: `Demo ${name.toLowerCase()}. This fictional workspace sells CRM consulting to small sales teams.\n\nThese are illustrative starting points, not verified company facts. Edit this context for your business before using AI suggestions.`,
        })
        .onConflictDoNothing()
        .run()
    db.update(workspaces)
      .set({ contextStatus: 'ready', contextError: null })
      .where(eq(workspaces.id, workspace.id))
      .run()
    seedAgents(db, workspace.id)
    return workspace
  })
}
