import { z } from 'zod'

export const emailSchema = z.string().trim().toLowerCase().email().max(254)
export const domainSchema = z.string().trim().min(1).max(253).transform((value, ctx) => {
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/') throw new Error()
    return url.hostname.toLowerCase()
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Enter a company domain, such as example.com.' })
    return z.NEVER
  }
})
export const signupSchema = z.object({ name: z.string().trim().min(1).max(100), email: emailSchema, workspaceName: z.string().trim().min(1).max(100), domain: domainSchema })
export const loginSchema = z.object({ email: emailSchema, name: z.string().trim().min(1).max(100) })
export const contextUpdateSchema = z.object({ content: z.string().trim().min(1).max(20000) }).strict()
export type SignupInput = z.infer<typeof signupSchema>
export const contextNames = ['Company overview', 'Ideal Customer Profile (ICP)', 'Sales motion', 'Example customers'] as const
export const generatedContextsSchema = z.object({ contexts: z.array(z.object({ name: z.enum(contextNames), content: z.string().trim().min(20).max(20000) })).length(4) }).refine(value => new Set(value.contexts.map(c => c.name)).size === 4, 'All four context names are required')
