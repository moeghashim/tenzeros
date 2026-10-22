import { defineEventHandler } from 'h3'
import { eq } from 'drizzle-orm'
import { requireWorkspace } from '../../../../utils/workspace-request'
import { agents } from '../../../../db/schema'
export default defineEventHandler(async (event) => {
  const { db, workspace, role } = await requireWorkspace(event)
  return {
    agents: db.select().from(agents).where(eq(agents.workspaceId, workspace.id)).all(),
    canEdit: role === 'admin',
  }
})
