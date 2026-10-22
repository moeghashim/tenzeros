import { defineEventHandler } from 'h3'
import { requireWorkspace } from '../../../utils/workspace-request'
import { onboardingSnapshot } from '../../../utils/onboarding'
export default defineEventHandler(async (event) => {
  const { db, actor, workspace, membership, user, role } = await requireWorkspace(event)
  return { ...onboardingSnapshot(db, actor), workspace, membership, user, role }
})
