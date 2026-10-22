import { and, eq, sql } from 'drizzle-orm'
import { createError, getValidatedRouterParams, type H3Event } from 'h3'
import { z } from 'zod'
import { getDb, type AppDatabase } from '../db'
import * as s from '../db/schema'
import { requireUser } from '../utils/auth'
import { requireActor, onboardingTransaction, type Actor } from '../utils/onboarding'
import { emitCustomEvent } from '../utils/realtime'
import { csvOpening, type ChatState, type FlowKey } from '../../shared/chat'
import { flowCatalogue } from '../../shared/onboarding'
import { assertChatIdle } from './chat-lock'
import { requireMailbox } from './domain-tools'
export type StoredChat = typeof s.chats.$inferSelect
export function ownChat(db: AppDatabase, userId: string, id: string) {
  const row = db
    .select()
    .from(s.chats)
    .where(and(eq(s.chats.id, id), eq(s.chats.userId, userId)))
    .get()
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Chat not found' })
  requireActor(db, { workspaceId: row.workspaceId, userId })
  return row
}
export async function requireChat(event: H3Event) {
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.uuid() }).parse)
  const user = await requireUser(event)
  const db = getDb(),
    chat = ownChat(db, user.id, id)
  return { db, chat, actor: { workspaceId: chat.workspaceId, userId: user.id } }
}
export function history(db: AppDatabase, chatId: string) {
  return db
    .select()
    .from(s.chatMessages)
    .where(eq(s.chatMessages.chatId, chatId))
    .orderBy(sql`rowid`)
    .all()
}
export function saveState(db: AppDatabase, chatId: string, state: ChatState) {
  state.revision++
  db.update(s.chats)
    .set({ state: { ...state } })
    .where(eq(s.chats.id, chatId))
    .run()
}
export const publicFlowStatus = (status: string) =>
  status === 'completed'
    ? ('completed' as const)
    : status === 'in_progress'
      ? ('active' as const)
      : ('unstarted' as const)
export function flowStatusEvent(actor: Actor, flowKey: string, chatId: string, status: string) {
  emitCustomEvent(actor.workspaceId, 'onboardingFlowStatusChanged', {
    ...actor,
    flowKey,
    chatId,
    status: publicFlowStatus(status),
  })
}
export function startFlow(
  db: AppDatabase,
  actor: Actor,
  flowKey: FlowKey | 'csv-import',
  mode: 'continue' | 'restart',
) {
  requireActor(db, actor, flowKey !== 'personalize-emails')
  if (flowKey === 'start-outreach' || flowKey === 'personalize-emails') requireMailbox(db, actor)
  const row = onboardingTransaction(db, actor.workspaceId, ({ tx, changes }) => {
    const existing = tx
      .select()
      .from(s.onboardingFlowStatuses)
      .where(
        and(
          eq(s.onboardingFlowStatuses.workspaceId, actor.workspaceId),
          eq(s.onboardingFlowStatuses.userId, actor.userId),
          eq(s.onboardingFlowStatuses.flowKey, flowKey),
        ),
      )
      .get()
    if (mode === 'restart' && existing?.chatId) assertChatIdle(existing.chatId)
    if (mode === 'continue' && existing?.chatId) return ownChat(db, actor.userId, existing.chatId)
    const chat = tx
      .insert(s.chats)
      .values({
        ...actor,
        flowKey,
        title: flowCatalogue.find((f) => f.key === flowKey)?.title || 'Import your data',
        state: { revision: 0 },
      })
      .returning()
      .get()
    tx.insert(s.onboardingFlowStatuses)
      .values({ ...actor, flowKey, chatId: chat.id, status: 'not_started' })
      .onConflictDoUpdate({
        target: [
          s.onboardingFlowStatuses.workspaceId,
          s.onboardingFlowStatuses.userId,
          s.onboardingFlowStatuses.flowKey,
        ],
        set: { chatId: chat.id, status: 'not_started' },
      })
      .run()
    if (flowKey === 'csv-import')
      tx.insert(s.chatMessages)
        .values({
          workspaceId: actor.workspaceId,
          chatId: chat.id,
          role: 'assistant',
          content: csvOpening,
        })
        .run()
    changes.push({ model: 'chats', op: 'insert', row: { id: chat.id, userId: actor.userId } })
    return chat
  })
  const status = db
    .select()
    .from(s.onboardingFlowStatuses)
    .where(eq(s.onboardingFlowStatuses.chatId, row.id))
    .get()!
  flowStatusEvent(actor, flowKey, row.id, status.status)
  return row
}
export function setFlowStatus(
  db: AppDatabase,
  actor: Actor,
  chat: StoredChat,
  status: 'in_progress' | 'completed',
) {
  const row = db
    .update(s.onboardingFlowStatuses)
    .set({ status })
    .where(
      and(
        eq(s.onboardingFlowStatuses.chatId, chat.id),
        eq(s.onboardingFlowStatuses.userId, actor.userId),
        eq(s.onboardingFlowStatuses.workspaceId, actor.workspaceId),
      ),
    )
    .returning()
    .get()
  if (!row)
    throw createError({
      statusCode: 409,
      statusMessage: 'This walkthrough was restarted. Open the latest chat.',
    })
  flowStatusEvent(actor, chat.flowKey!, chat.id, status)
}
export function assertCurrentFlow(db: AppDatabase, chat: StoredChat) {
  if (
    !db
      .select()
      .from(s.onboardingFlowStatuses)
      .where(eq(s.onboardingFlowStatuses.chatId, chat.id))
      .get()
  )
    throw createError({
      statusCode: 409,
      statusMessage: 'This walkthrough was restarted. Open the latest chat.',
    })
}
