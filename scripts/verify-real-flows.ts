import { readFile, writeFile } from 'node:fs/promises'
import { flowKeys, type ControlResponse } from '../shared/chat'
const base = process.env.VERIFY_BASE_URL || 'http://127.0.0.1:3001'
const stamp = Date.now().toString(36)
let cookie = ''
async function request(path: string, body?: unknown, form?: FormData) {
  const response = await fetch(`${base}${path}`, {
    method: body !== undefined || form ? 'POST' : 'GET',
    headers: {
      cookie,
      origin: base,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: form || (body !== undefined ? JSON.stringify(body) : undefined),
  })
  if (response.headers.get('set-cookie'))
    cookie = response.headers.get('set-cookie')!.split(';')[0]!
  if (!response.ok) throw new Error(`${response.status}: ${(await response.text()).slice(0, 300)}`)
  return response
}
const reuse =
  process.env.VERIFY_REUSE === '1'
    ? JSON.parse(await readFile('/tmp/tenzeros-m3-verification-account.json', 'utf8'))
    : null
const account = await (
  await request(
    reuse ? '/api/auth/login' : '/api/auth/signup',
    reuse
      ? { name: reuse.name, email: reuse.email }
      : {
          name: 'M3 Verification',
          email: `m3-real-${stamp}@example.test`,
          workspaceName: `M3 Stripe ${stamp}`,
          domain: 'stripe.com',
        },
  )
).json()
const me = await (await request('/api/auth/me')).json()
const workspace = me.workspaces[0].workspace
await writeFile(
  '/tmp/tenzeros-m3-verification-account.json',
  JSON.stringify({
    email: me.user.email,
    name: me.user.name,
    workspace,
    redirect: account.redirect,
  }),
  { mode: 0o600 },
)
await request(`/api/workspaces/${workspace.key}/simulate`, { kind: 'google' })
// Wait for genuine homepage-grounded bootstrap; do not silently verify against empty context.
for (let tries = 0; tries < 90; tries++) {
  const contexts = await (await request(`/api/workspaces/${workspace.key}/contexts`)).json()
  if (contexts.status === 'ready') break
  if (contexts.status === 'failed') throw new Error(`Bootstrap failed: ${contexts.error}`)
  if (tries === 89) throw new Error('Context bootstrap timed out')
  await new Promise((r) => setTimeout(r, 1000))
}
const transcripts: Record<string, unknown[]> = {}
const samples = [
  'Hi Alex,\nThanks for the conversation today. Here is a short overview of how we can help your team simplify payments. Would a 15-minute call next week be useful?\nBest,\nMorgan',
  'Hi Sam,\nGood to meet you. I have attached the notes we discussed. Let me know if you would like a quick walkthrough. No rush.\nBest,\nMorgan',
]
for (const flowKey of [...flowKeys, 'csv-import']) {
  console.log(`START ${flowKey}`)
  const {
    data: { chatId },
  } = await (
    await request('/api/onboarding/flows/start', {
      workspaceId: workspace.id,
      flowKey,
      mode: 'restart',
    })
  ).json()
  transcripts[flowKey] = []
  async function turn(input: unknown) {
    const response = await request(`/api/chats/${chatId}/messages`, input)
    const text = await response.text()
    const events = text.split('\n\n').flatMap((f) => {
      const line = f.split('\n').find((l) => l.startsWith('data:'))
      return line ? [JSON.parse(line.slice(5))] : []
    })
    const error = events.find((e) => e.type === 'error')
    if (error) throw new Error(`${flowKey}: ${error.message}`)
    const state = await (await request(`/api/chats/${chatId}`)).json()
    transcripts[flowKey]!.push({
      input,
      messages: state.data.messages.filter((m: { role: string }) => m.role !== 'tool'),
      state: state.data.chat.state,
    })
    await writeFile('/tmp/tenzeros-m3-real-transcripts.json', JSON.stringify(transcripts, null, 2))
    return state.data.chat.state
  }
  if (flowKey === 'csv-import') {
    const form = new FormData()
    form.set(
      'file',
      new File(
        [
          'Company,Domain,Contact,Email,Deal,Amount\nStripe Test Customer,customer.example,Avery,avery@customer.example,Discovery,1200\nFormula Test,formula.example,Jordan,jordan@formula.example,=SUM(1),50\n',
        ],
        'crm.csv',
        { type: 'text/csv' },
      ),
    )
    await request(`/api/chats/${chatId}/upload`, undefined, form)
  }
  let state =
    flowKey === 'csv-import'
      ? (await (await request(`/api/chats/${chatId}`)).json()).data.chat.state
      : await turn({ start: true })
  for (let i = 0; i < 18 && !state.completed; i++) {
    const pending = state.activeControl
    if (!pending) {
      state = await turn({
        content:
          'Please continue with the next step and finish the walkthrough once the work is saved.',
      })
      continue
    }
    const c = pending.control
    let answer: ControlResponse
    if (c.kind === 'continue')
      answer = { kind: 'continue', toolCallId: pending.id, responseText: c.responseText || c.label }
    else if (c.kind === 'conversation') {
      const responseText =
        flowKey === 'pipeline-and-lists'
          ? 'We sell payments infrastructure to B2B SaaS teams. Use a discovery, evaluation, proposal, negotiation, won/lost motion and a Prospects company list. Please proceed with these defaults.'
          : flowKey === 'target-account-list'
            ? 'Our ICP is US B2B SaaS companies with 20–200 employees that need recurring billing and international payments. Use clearly labelled fictional Example accounts if none are available.'
            : flowKey === 'personalize-emails'
              ? samples.join('\n\n---\n\n')
              : flowKey === 'start-outreach'
                ? 'Target finance leaders at B2B SaaS companies. Offer a short discovery call about recurring billing. Draft one email, a two-day delay, and a LinkedIn follow-up. No sending.'
                : 'Use the existing workspace records; label examples clearly. Create a Customers list with the selected records.'
      answer = { kind: 'conversation', toolCallId: pending.id, responseText }
    } else if (c.kind === 'choice') {
      const preferred =
        c.options.find(
          (o: { id: string; label: string }) =>
            o.id === 'approve' || /generate|yes|example|use these|recommended/i.test(o.label),
        ) || c.options[0]
      answer = {
        kind: 'choice',
        toolCallId: pending.id,
        selectedOptionIds:
          c.selectionMode === 'multiple'
            ? c.options.slice(0, 2).map((o: { id: string }) => o.id)
            : [preferred.id],
      }
    } else
      answer = {
        kind: 'menu',
        toolCallId: pending.id,
        action: 'continue',
        responseText: c.continueResponseText || c.continueLabel,
      }
    console.log(`  ${flowKey}: ${c.kind} ${c.label || c.prompt}`)
    state = await turn({
      onboardingResponse: answer,
      ...(pending.finishesFlow ? { onboardingFinish: true } : {}),
    })
  }
  if (!state.completed) throw new Error(`${flowKey} failed to complete within 18 turns`)
  console.log(`PASS ${flowKey}`)
}
console.log(
  'All real DeepSeek flows completed. Transcripts: /tmp/tenzeros-m3-real-transcripts.json',
)
