import { defineEventHandler } from 'h3'
import { requireUser } from '../../utils/auth'
import { userWorkspaces } from '../../utils/accounts'
import { getDb } from '../../db'
export default defineEventHandler(async event => { const user = await requireUser(event); return { user, workspaces: userWorkspaces(getDb(), user.id) } })
