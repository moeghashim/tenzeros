import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core'

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID())
const createdAt = () =>
  text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
const updatedAt = () =>
  text('updated_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .$onUpdate(() => new Date().toISOString())
const workspaceId = () =>
  text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' })
const userId = () => text('user_id').references(() => users.id, { onDelete: 'set null' })
const json = (name: string) => text(name, { mode: 'json' }).$type<Record<string, unknown>>()

export const users = sqliteTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  avatarColor: text('avatar_color').notNull().default('#0d74ce'),
  createdAt: createdAt(),
})
export const workspaces = sqliteTable('workspaces', {
  id: id(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  domain: text('domain').notNull(),
  settings: json('settings').notNull().default({}),
  trialEndsAt: text('trial_ends_at').notNull(),
  onboardingStartedAt: text('onboarding_started_at'),
  onboardingCompletedAt: text('onboarding_completed_at'),
  onboardingSkippedAt: text('onboarding_skipped_at'),
  contextStatus: text('context_status', { enum: ['pending', 'ready', 'failed'] })
    .notNull()
    .default('pending'),
  contextError: text('context_error'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})
export const memberships = sqliteTable(
  'memberships',
  {
    id: id(),
    workspaceId: workspaceId(),
    userId: userId(),
    role: text('role', { enum: ['admin', 'member'] })
      .notNull()
      .default('member'),
    invitedById: text('invited_by_id').references(() => users.id, { onDelete: 'set null' }),
    inviteEmail: text('invite_email'),
    status: text('status', { enum: ['active', 'invited'] })
      .notNull()
      .default('active'),
    onboardingStartedAt: text('onboarding_started_at'),
    onboardingCompletedAt: text('onboarding_completed_at'),
    onboardingSkippedAt: text('onboarding_skipped_at'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('membership_user').on(t.workspaceId, t.userId),
    uniqueIndex('membership_invite').on(t.workspaceId, t.inviteEmail),
    index('membership_by_user').on(t.userId),
  ],
)
export const subscriptions = sqliteTable('subscriptions', {
  id: id(),
  workspaceId: workspaceId().unique(),
  status: text('status', { enum: ['trialing', 'active', 'expired'] })
    .notNull()
    .default('trialing'),
  monthlyCreditsRemaining: integer('monthly_credits_remaining').notNull().default(0),
  topupCreditsRemaining: integer('topup_credits_remaining').notNull().default(2000),
  updatedAt: updatedAt(),
})
export const onboardingTaskCompletions = sqliteTable(
  'onboarding_task_completions',
  {
    id: id(),
    workspaceId: workspaceId(),
    userId: userId(),
    taskKey: text('task_key').notNull(),
    creditsAwarded: integer('credits_awarded').notNull().default(25),
    completedAt: createdAt(),
  },
  (t) => [
    uniqueIndex('completion_user_scope')
      .on(t.workspaceId, t.userId, t.taskKey)
      .where(sql`${t.userId} IS NOT NULL`),
    uniqueIndex('completion_workspace_scope')
      .on(t.workspaceId, t.taskKey)
      .where(sql`${t.userId} IS NULL`),
  ],
)
export const chats = sqliteTable(
  'chats',
  {
    id: id(),
    workspaceId: workspaceId(),
    userId: userId(),
    flowKey: text('flow_key'),
    title: text('title').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('chats_workspace').on(t.workspaceId)],
)
export const onboardingFlowStatuses = sqliteTable(
  'onboarding_flow_statuses',
  {
    id: id(),
    workspaceId: workspaceId(),
    userId: userId(),
    flowKey: text('flow_key').notNull(),
    status: text('status', { enum: ['not_started', 'in_progress', 'completed'] })
      .notNull()
      .default('not_started'),
    chatId: text('chat_id').references(() => chats.id, { onDelete: 'set null' }),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('flow_user').on(t.workspaceId, t.userId, t.flowKey)],
)
export const aiContexts = sqliteTable(
  'ai_contexts',
  {
    id: id(),
    workspaceId: workspaceId(),
    name: text('name').notNull(),
    content: text('content').notNull(),
    type: text('type', { enum: ['prompt'] })
      .notNull()
      .default('prompt'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('context_name').on(t.workspaceId, t.name)],
)
const connection = () => ({
  id: id(),
  workspaceId: workspaceId(),
  userId: userId(),
  type: text('type').notNull(),
  status: text('status').notNull().default('connected'),
  email: text('email'),
  isDemo: integer('is_demo', { mode: 'boolean' }).notNull().default(true),
  settings: json('settings').notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})
export const mailboxes = sqliteTable('mailboxes', connection())
export const calendars = sqliteTable('calendars', connection())
export const notetakers = sqliteTable('notetakers', connection())
export const linkedinAccounts = sqliteTable('linkedin_accounts', connection())
export const integrations = sqliteTable('integrations', connection())
export const pipelines = sqliteTable('pipelines', {
  id: id(),
  workspaceId: workspaceId(),
  name: text('name').notNull(),
  createdAt: createdAt(),
})
export const pipelineStages = sqliteTable(
  'pipeline_stages',
  {
    id: id(),
    workspaceId: workspaceId(),
    pipelineId: text('pipeline_id')
      .notNull()
      .references(() => pipelines.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull(),
  },
  (t) => [uniqueIndex('stage_position').on(t.pipelineId, t.position)],
)
export const companies = sqliteTable('companies', {
  id: id(),
  workspaceId: workspaceId(),
  name: text('name').notNull(),
  domain: text('domain'),
  description: text('description'),
  industry: text('industry'),
  isExample: integer('is_example', { mode: 'boolean' }).notNull().default(false),
  attributes: json('attributes').notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})
export const contacts = sqliteTable('contacts', {
  id: id(),
  workspaceId: workspaceId(),
  companyId: text('company_id').references(() => companies.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  email: text('email'),
  title: text('title'),
  phone: text('phone'),
  isExample: integer('is_example', { mode: 'boolean' }).notNull().default(false),
  attributes: json('attributes').notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})
export const deals = sqliteTable('deals', {
  id: id(),
  workspaceId: workspaceId(),
  name: text('name').notNull(),
  companyId: text('company_id').references(() => companies.id, { onDelete: 'set null' }),
  contactId: text('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  pipelineId: text('pipeline_id').references(() => pipelines.id, { onDelete: 'set null' }),
  stageId: text('stage_id').references(() => pipelineStages.id, { onDelete: 'set null' }),
  ownerId: userId(),
  value: real('value'),
  currency: text('currency').notNull().default('USD'),
  attributes: json('attributes').notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})
export const lists = sqliteTable('lists', {
  id: id(),
  workspaceId: workspaceId(),
  name: text('name').notNull(),
  entityType: text('entity_type', { enum: ['companies', 'contacts', 'deals'] })
    .notNull()
    .default('companies'),
  filters: json('filters').notNull().default({}),
  aiColumns: text('ai_columns', { mode: 'json' })
    .$type<Record<string, unknown>[]>()
    .notNull()
    .default([]),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})
export const listEntries = sqliteTable(
  'list_entries',
  {
    id: id(),
    workspaceId: workspaceId(),
    listId: text('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    entityId: text('entity_id').notNull(),
    scores: json('scores').notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('list_entry').on(t.listId, t.entityId)],
)
export const agents = sqliteTable(
  'agents',
  {
    id: id(),
    workspaceId: workspaceId(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
    config: json('config').notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('agent_key').on(t.workspaceId, t.key)],
)
export const sequences = sqliteTable('sequences', {
  id: id(),
  workspaceId: workspaceId(),
  name: text('name').notNull(),
  status: text('status', { enum: ['draft', 'active', 'paused'] })
    .notNull()
    .default('draft'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})
export const sequenceSteps = sqliteTable(
  'sequence_steps',
  {
    id: id(),
    workspaceId: workspaceId(),
    sequenceId: text('sequence_id')
      .notNull()
      .references(() => sequences.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    type: text('type', { enum: ['email', 'delay', 'linkedin'] }).notNull(),
    subject: text('subject'),
    content: text('content'),
    delayDays: integer('delay_days'),
    approved: integer('approved', { mode: 'boolean' }).notNull().default(false),
    config: json('config').notNull().default({}),
  },
  (t) => [uniqueIndex('sequence_position').on(t.sequenceId, t.position)],
)
export const writingStyles = sqliteTable('writing_styles', {
  id: id(),
  workspaceId: workspaceId(),
  userId: userId(),
  name: text('name').notNull(),
  content: text('content').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})
export const imports = sqliteTable('imports', {
  id: id(),
  workspaceId: workspaceId(),
  userId: userId(),
  type: text('type').notNull(),
  status: text('status', { enum: ['Pending', 'Mapping', 'Importing', 'Completed', 'Failed'] })
    .notNull()
    .default('Pending'),
  filename: text('filename'),
  mapping: json('mapping'),
  recordCount: integer('record_count').notNull().default(0),
  error: text('error'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})
export const chatMessages = sqliteTable(
  'chat_messages',
  {
    id: id(),
    workspaceId: workspaceId(),
    chatId: text('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['system', 'user', 'assistant', 'tool'] }).notNull(),
    content: text('content').notNull().default(''),
    toolCalls: text('tool_calls', { mode: 'json' }).$type<Record<string, unknown>[]>(),
    toolCallId: text('tool_call_id'),
    createdAt: createdAt(),
  },
  (t) => [index('messages_chat').on(t.chatId, t.createdAt)],
)
