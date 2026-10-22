import { z } from 'zod'
export const flowKeys = [
  'pipeline-and-lists',
  'activate-agents',
  'existing-customers',
  'target-account-list',
  'start-outreach',
  'personalize-emails',
] as const
export type FlowKey = (typeof flowKeys)[number]
const text = z.string().min(1).max(2000)
const label = z.string().min(1).max(120)
const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/)
const path = z
  .string()
  .max(300)
  .regex(/^\/(?!\/)[a-zA-Z0-9/_-]*$/)
const common = {
  advances: z.boolean().optional(),
  outcome: z.object({ status: z.enum(['completed', 'skipped']), reason: text }).optional(),
  nextStepKey: id.optional(),
  finishesFlow: z.boolean().optional(),
  stepKey: id.optional(),
  moveOnLabel: label.optional(),
}
export const controlSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...common,
      kind: z.literal('continue'),
      label,
      responseText: text.optional(),
      path: path.optional(),
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal('conversation'),
      summary: text,
      label,
      prompt: text.optional(),
      responseText: text.optional(),
      path: path.optional(),
      answerKey: id.optional(),
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal('menu'),
      prompt: text,
      items: z
        .array(
          z
            .object({ id, label, description: text.optional(), responseText: text.optional() })
            .strict(),
        )
        .min(1)
        .max(12),
      continueLabel: label,
      visitedItemIds: z.array(id).max(12).optional(),
      continueResponseText: text.optional(),
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal('choice'),
      prompt: text,
      selectionMode: z.enum(['single', 'multiple']),
      options: z
        .array(z.object({ id, label, description: text.optional() }).strict())
        .min(1)
        .max(12),
      questionKey: id.optional(),
      allowOther: z.boolean().optional(),
      otherLabel: label.optional(),
      submitLabel: label.optional(),
    })
    .strict(),
])
export type Control = z.infer<typeof controlSchema>
export const responseSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.enum(['continue', 'conversation']), toolCallId: id, responseText: text })
    .strict(),
  z
    .object({
      kind: z.literal('choice'),
      toolCallId: id,
      selectedOptionIds: z.array(id).max(12),
      questionKey: id.optional(),
      otherText: text.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('menu'),
      toolCallId: id,
      action: z.enum(['visit', 'continue']),
      itemId: id.optional(),
      responseText: text,
    })
    .strict(),
])
export type ControlResponse = z.infer<typeof responseSchema>
export const turnSchema = z
  .object({
    content: z.string().min(1).max(20000).optional(),
    onboardingResponse: responseSchema.optional(),
    onboardingAdvance: z.object({ stepKey: id }).strict().optional(),
    onboardingFinish: z.boolean().optional(),
    start: z.boolean().optional(),
    retry: z.boolean().optional(),
  })
  .strict()
  .refine(
    (v) =>
      [v.content, v.onboardingResponse, v.onboardingAdvance, v.start, v.retry].filter(Boolean)
        .length === 1,
    'Send exactly one turn action',
  )
export type TurnInput = z.infer<typeof turnSchema>
export type PendingControl = {
  id: string
  control: Control
  finishesFlow: boolean
  action?: { name: string; args: Record<string, unknown> }
  display?: string
}
export type ChatState = {
  revision: number
  activeControl?: PendingControl
  currentStep?: { key: string; mode: 'milestone'; moveOnLabel: string; finishesFlow: boolean }
  completed?: boolean
  failedInput?: TurnInput
  error?: string
  started?: boolean
  effects?: string[]
}
export type StoredMessage = {
  id: string
  role: string
  content: string
  toolCalls?: Record<string, unknown>[] | null
  toolCallId?: string | null
}
export type ChatEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call_start'; id: string; name: string }
  | { type: 'tool_call_result'; id: string; result: unknown }
  | { type: 'control'; control: PendingControl }
  | { type: 'done'; state: ChatState }
  | { type: 'error'; message: string; retryable: boolean }
export const csvOpening =
  "Upload your CRM export and I'll map and import it. One file, or separate files for companies, contacts and deals."
