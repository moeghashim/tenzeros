import Papa from 'papaparse'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import type { AppDatabase } from '../db'
import * as s from '../db/schema'
import { chat } from '../utils/llm'
import { requireActor, onboardingTransaction, completeTask, type Actor } from '../utils/onboarding'
import { dataRule, untrustedData, grounding } from './grounding'
export const csvFields = [
  'ignore',
  'company.name',
  'company.domain',
  'company.description',
  'company.industry',
  'contact.name',
  'contact.email',
  'contact.title',
  'contact.phone',
  'deal.name',
  'deal.value',
  'deal.currency',
] as const
export const mappingSchema = z
  .object({
    columns: z
      .array(z.object({ index: z.number().int().min(0), field: z.enum(csvFields) }).strict())
      .min(1)
      .max(100),
  })
  .strict()
export type CsvMapping = z.infer<typeof mappingSchema>
export function textCell(value: string) {
  return /^[\s\u0000-\u001f]*[=+\-@]/.test(value) ? `'${value}` : value
}
export function parseCsv(filename: string, buffer: Buffer) {
  if (!/\.csv$/i.test(filename) || !buffer.length || buffer.length > 5 * 1024 * 1024)
    throw new Error('Upload a non-empty CSV file up to 5 MB.')
  const source = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  if (source.includes('\0')) throw new Error('Binary files are not CSV.')
  const result = Papa.parse<string[]>(source, { skipEmptyLines: 'greedy' })
  if (result.errors.length || result.data.length < 2)
    throw new Error('CSV must contain a header and at least one valid row.')
  const [headers, ...rows] = result.data
  if (
    !headers?.length ||
    headers.length > 100 ||
    headers.some((h) => !h.trim() || h.length > 200) ||
    rows.some((row) => row.length !== headers.length || row.some((c) => c.length > 20000))
  )
    throw new Error('CSV columns are inconsistent or exceed supported limits.')
  return { headers, rows: rows.map((row) => row.map(textCell)) }
}
export async function prepareCsv(
  db: AppDatabase,
  actor: Actor,
  chatId: string,
  filename: string,
  buffer: Buffer,
) {
  requireActor(db, actor, true)
  const { headers, rows } = parseCsv(filename, buffer)
  const result = await chat({
    json: true,
    messages: [
      {
        role: 'system',
        content: `${dataRule}\nMap CSV columns to CRM fields. Return JSON {"columns":[{"index":0,"field":"company.name"}]}. Use each index exactly once and each non-ignore field at most once. Allowed fields: ${csvFields.join(', ')}. Ignore irrelevant columns. Map at least one entity name (company.name, contact.name, deal.name).\n${grounding(db, actor.workspaceId)}`,
      },
      { role: 'user', content: untrustedData({ headers, rows: rows.slice(0, 5) }) },
    ],
  })
  const mapping = mappingSchema.parse(JSON.parse(result.content || ''))
  const fields = mapping.columns.filter((c) => c.field !== 'ignore').map((c) => c.field)
  if (
    mapping.columns.length !== headers.length ||
    new Set(mapping.columns.map((c) => c.index)).size !== headers.length ||
    mapping.columns.some((c) => c.index >= headers.length) ||
    new Set(fields).size !== fields.length ||
    !fields.some((f) => f.endsWith('.name'))
  )
    throw new Error('The proposed mapping was incomplete. Please upload again to retry.')
  requireActor(db, actor, true)
  const job = db
    .insert(s.imports)
    .values({
      ...actor,
      chatId,
      type: 'csv',
      filename: filename.slice(0, 255),
      status: 'Mapping',
      mapping,
      rows,
    })
    .returning()
    .get()
  return {
    job,
    display: `### Review column mapping\n\n${mapping.columns.map((c) => `- ${headers[c.index]} → ${c.field}`).join('\n')}\n\n${rows.length} rows. Formula-like values will be stored as text.`,
  }
}
export function importCsv(db: AppDatabase, actor: Actor, chatId: string, importId: string) {
  return onboardingTransaction(db, actor.workspaceId, (mutation) => {
    const { tx, changes } = mutation
    requireActor(tx, actor, true)
    const job = tx
      .select()
      .from(s.imports)
      .where(
        and(
          eq(s.imports.id, importId),
          eq(s.imports.chatId, chatId),
          eq(s.imports.workspaceId, actor.workspaceId),
          eq(s.imports.userId, actor.userId),
        ),
      )
      .get()
    if (!job) throw new Error('Import not found')
    if (job.status === 'Completed')
      return { id: job.id, status: job.status, recordCount: job.recordCount }
    if (job.status !== 'Mapping' || !job.rows)
      throw new Error('Import is not awaiting confirmation')
    const mapping = mappingSchema.parse(job.mapping)
    let recordCount = 0
    for (const row of job.rows) {
      const value = (field: string) => {
        const col = mapping.columns.find((c) => c.field === field)
        return col ? textCell(row[col.index] || '') : ''
      }
      const attributes = { source: 'csv', importId: job.id }
      let companyId: string | undefined, contactId: string | undefined
      if (value('company.name')) {
        const company = tx
          .insert(s.companies)
          .values({
            workspaceId: actor.workspaceId,
            name: value('company.name'),
            domain: value('company.domain'),
            description: value('company.description'),
            industry: value('company.industry'),
            attributes,
          })
          .returning()
          .get()
        companyId = company.id
        recordCount++
        changes.push({ model: 'companies', op: 'insert', row: company })
      }
      if (value('contact.name')) {
        const contact = tx
          .insert(s.contacts)
          .values({
            workspaceId: actor.workspaceId,
            companyId,
            name: value('contact.name'),
            email: value('contact.email'),
            title: value('contact.title'),
            phone: value('contact.phone'),
            attributes,
          })
          .returning()
          .get()
        contactId = contact.id
        recordCount++
        changes.push({ model: 'contacts', op: 'insert', row: contact })
      }
      if (value('deal.name')) {
        const rawValue = value('deal.value'),
          number = rawValue ? Number(rawValue.replace(/[$,]/g, '')) : NaN
        const deal = tx
          .insert(s.deals)
          .values({
            workspaceId: actor.workspaceId,
            companyId,
            contactId,
            name: value('deal.name'),
            value: Number.isFinite(number) ? number : null,
            currency: value('deal.currency') || 'USD',
            attributes: { ...attributes, rawValue },
          })
          .returning()
          .get()
        recordCount++
        changes.push({ model: 'deals', op: 'insert', row: deal })
      }
    }
    if (!recordCount)
      throw new Error('No rows contain a mapped entity name. Upload a corrected CSV.')
    const completed = tx
      .update(s.imports)
      .set({ status: 'Completed', recordCount, rows: null })
      .where(eq(s.imports.id, job.id))
      .returning()
      .get()!
    changes.push({
      model: 'imports',
      op: 'update',
      row: { id: completed.id, status: completed.status, recordCount },
    })
    completeTask(mutation, actor, 'import_data')
    return { id: job.id, status: 'Completed', recordCount }
  })
}
