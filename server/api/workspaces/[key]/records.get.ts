import { defineEventHandler } from 'h3'
import { eq } from 'drizzle-orm'
import { requireWorkspace } from '../../../utils/workspace-request'
import { companies, contacts } from '../../../db/schema'
export default defineEventHandler(async (event) => {
  const { db, workspace } = await requireWorkspace(event)
  return {
    companies: db.select().from(companies).where(eq(companies.workspaceId, workspace.id)).all(),
    contacts: db.select().from(contacts).where(eq(contacts.workspaceId, workspace.id)).all(),
  }
})
