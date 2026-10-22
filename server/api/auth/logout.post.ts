import { defineEventHandler } from 'h3'
import { authSession, requireSameOrigin } from '../../utils/auth'
export default defineEventHandler(async event => { requireSameOrigin(event); await (await authSession(event)).clear(); return { success: true } })
