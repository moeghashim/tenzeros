import type { ChatOptions, ChatResult } from './llm'
function parseData(content: unknown) {
  const value = String(content)
  try {
    return JSON.parse(
      value.includes('UNTRUSTED_DATA_JSON_BEGIN\n')
        ? value.split('UNTRUSTED_DATA_JSON_BEGIN\n').at(-1)!.split('\nUNTRUSTED_DATA_JSON_END')[0]!
        : value,
    )
  } catch {
    return undefined
  }
}
function call(name: string, args: unknown, content?: string): ChatResult {
  return {
    content: content || null,
    tool_calls: [
      {
        id: `mock-${crypto.randomUUID()}`,
        type: 'function',
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  }
}
/** Offline fixtures only. The adapter invokes this exclusively with LLM_MOCK=1. */
export function flowMock(options: ChatOptions): ChatResult | undefined {
  const system = String(options.messages[0]?.content || ''),
    data = parseData(options.messages.at(-1)?.content)
  if (options.json) {
    if (system.includes('Map CSV columns')) {
      const used = new Set<string>()
      return {
        content: JSON.stringify({
          columns: (data.headers as string[]).map((header, index) => {
            const key = header.toLowerCase().trim()
            const candidates: Record<string, string> = {
              company: 'company.name',
              'company name': 'company.name',
              domain: 'company.domain',
              industry: 'company.industry',
              description: 'company.description',
              contact: 'contact.name',
              person: 'contact.name',
              'contact name': 'contact.name',
              email: 'contact.email',
              title: 'contact.title',
              phone: 'contact.phone',
              deal: 'deal.name',
              'deal name': 'deal.name',
              value: 'deal.value',
              amount: 'deal.value',
              currency: 'deal.currency',
            }
            const field =
              candidates[key] && !used.has(candidates[key]!) ? candidates[key]! : 'ignore'
            used.add(field)
            return { index, field }
          }),
        }),
      }
    }
    if (system.includes('fictional EXAMPLE accounts'))
      return {
        content: JSON.stringify({
          accounts: Array.from(
            { length: Number(system.match(/Generate (\d+)/)?.[1] || 5) },
            (_, i) => ({
              name: `Fictional Software ${i + 1}`,
              description: 'Fictional B2B SaaS with recurring billing needs.',
              industry: 'Software',
            }),
          ),
        }),
      }
    if (system.includes('Rank every supplied account'))
      return {
        content: JSON.stringify({
          scores: data.accounts.map((a: { id: string }, i: number) => ({
            id: a.id,
            score: Math.max(0, 90 - i * 5),
            rationale: 'Mock estimate: recurring software revenue matches the supplied ICP.',
          })),
        }),
      }
    if (system.includes('Derive a writing style'))
      return {
        content: JSON.stringify({
          tone: 'Friendly and direct',
          length: 'Short',
          greeting: 'Hi, first name',
          signOff: 'Best',
          do: ['Make one clear ask'],
          dont: ['Use hype'],
          sampleRewrite:
            'Hi Alex, thanks for the conversation. Would a short call next week help? Best, Morgan',
        }),
      }
    return undefined
  }
  const tools =
    options.tools?.flatMap((t) => (t.type === 'function' ? [t.function.name] : [])) || []
  if (!tools.includes('present_onboarding_control')) return undefined
  const calls = options.messages.flatMap((m) =>
    m.role === 'assistant'
      ? (m.tool_calls || []).flatMap((t) =>
          t.type === 'function'
            ? [{ id: t.id, name: t.function.name, args: parseData(t.function.arguments) }]
            : [],
        )
      : [],
  )
  const result = (name: string) => {
    for (const c of [...calls].reverse().filter((c) => c.name === name)) {
      const message = options.messages.find((m) => m.role === 'tool' && m.tool_call_id === c.id)
      const value = message && parseData(message.content)
      if (value && !value.error && !value.rejected) return value
    }
    return undefined
  }
  const answered = (kind: string) =>
    calls.some(
      (c) =>
        c.name === 'present_onboarding_control' &&
        c.args?.kind === kind &&
        options.messages.some((m) => m.role === 'tool' && m.tool_call_id === c.id),
    )
  const present = (args: unknown, text?: string) => call('present_onboarding_control', args, text)
  if (!calls.length)
    return present(
      { kind: 'continue', label: 'Start setup' },
      "I'll help you set this up one step at a time. You'll confirm the choices before we finish.",
    )
  if (tools.includes('create_pipeline_stages')) {
    if (!answered('conversation'))
      return present({
        kind: 'conversation',
        summary: 'Describe your sales motion.',
        label: 'Confirm sales motion',
        responseText: 'B2B SaaS discovery, evaluation, proposal and close.',
      })
    if (!result('create_pipeline_stages'))
      return call('create_pipeline_stages', {
        name: 'Sales Pipeline',
        stages: ['Discovery', 'Evaluation', 'Proposal', 'Won', 'Lost'],
      })
    if (!result('create_list')) return call('create_list', { name: 'Prospects' })
    if (!calls.some((c) => c.args?.stepKey === 'pipeline-ready'))
      return present(
        {
          kind: 'continue',
          label: 'Continue',
          stepKey: 'pipeline-ready',
          moveOnLabel: 'Let’s move on.',
        },
        'Your pipeline stages and Prospects list are ready.',
      )
  } else if (tools.includes('enable_agents')) {
    const agents = result('list_agents')
    if (!agents) return call('list_agents', {})
    if (!answered('choice'))
      return present(
        {
          kind: 'choice',
          prompt: 'Which agents would you like to enable?',
          selectionMode: 'multiple',
          options: agents.map((a: { id: string; name: string }) => ({ id: a.id, label: a.name })),
        },
        'Choose the agents that would help your team. You can enable more later.',
      )
    if (!result('enable_agents'))
      return call('enable_agents', {
        agentIds: result('present_onboarding_control').selectedOptionIds,
      })
  } else if (tools.includes('search_companies')) {
    const scoring = tools.includes('score_accounts')
    if (scoring && !answered('conversation'))
      return present({
        kind: 'conversation',
        summary: 'Describe your ideal customer.',
        label: 'Confirm ICP',
        responseText: 'B2B SaaS businesses with recurring billing needs.',
      })
    const companies = result('search_companies')
    if (!companies) return call('search_companies', { query: '' })
    if (!companies.length && !answered('choice'))
      return present({
        kind: 'choice',
        prompt: scoring
          ? 'Generate five fictional Example accounts?'
          : 'Create an empty Customers list?',
        selectionMode: 'single',
        options: [
          { id: 'approve', label: scoring ? 'Generate Example accounts' : 'Create Customers list' },
        ],
      })
    if (!scoring && companies.length && !answered('choice'))
      return present({
        kind: 'choice',
        prompt: 'Which records are customers?',
        selectionMode: 'multiple',
        options: companies
          .slice(0, 12)
          .map((c: { id: string; name: string }) => ({ id: c.id, label: c.name })),
      })
    const list = result('create_list')
    if (!list) return call('create_list', { name: scoring ? 'Target accounts' : 'Customers' })
    if (scoring && !result('score_accounts'))
      return call('score_accounts', {
        listId: list.id,
        icp: 'B2B SaaS with recurring billing needs',
        generateExamples: !companies.length,
        exampleCount: 5,
      })
    if (!scoring && companies.length && !result('add_companies_to_list'))
      return call('add_companies_to_list', {
        listId: list.id,
        companyIds: result('present_onboarding_control').selectedOptionIds,
      })
  } else if (tools.includes('create_sequence')) {
    if (!answered('conversation'))
      return present({
        kind: 'conversation',
        summary: 'Who are you contacting, and what do you offer?',
        label: 'Draft sequence',
      })
    if (!result('create_sequence'))
      return call('create_sequence', {
        name: 'Discovery outreach',
        steps: [
          {
            type: 'email',
            subject: 'Quick question',
            content:
              'Hi Alex, would a short conversation about recurring billing be useful? Best, Morgan',
          },
          { type: 'delay', delayDays: 2 },
          {
            type: 'linkedin',
            content:
              'Hi Alex, following up on my email. Happy to compare notes on recurring billing.',
          },
        ],
      })
  } else if (tools.includes('save_writing_style')) {
    if (!answered('conversation'))
      return present({
        kind: 'conversation',
        summary: 'Paste 2–3 sample emails separated by ---. No mailbox reading.',
        label: 'Analyze my style',
      })
    if (!result('save_writing_style'))
      return call('save_writing_style', {
        samples: String(result('present_onboarding_control').responseText)
          .split(/\n?---\n?/)
          .map((s) => s.trim()),
      })
  }
  return call(
    'complete_flow',
    {},
    'Your setup is saved. Finish the walkthrough to return to onboarding.',
  )
}
