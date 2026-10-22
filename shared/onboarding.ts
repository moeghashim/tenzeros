export const taskCatalogue = [
  {
    key: 'connect_gmail',
    scope: 'user',
    title: 'Connect Gmail and Calendar',
    description: 'Import contacts and get the full context to your CRM records',
  },
  {
    key: 'connect_notetaker',
    scope: 'user',
    title: 'Connect notetaker',
    description: 'Auto-create tasks, improve the context awareness of each record.',
  },
  {
    key: 'install_extension',
    scope: 'user',
    title: 'Sync LinkedIn to Tenzeros',
    description: 'Sync contacts, conversations and enable outbound',
  },
  {
    key: 'create_automation',
    scope: 'workspace',
    title: 'Enable agents',
    description: 'Install and enable agents to automate your work',
  },
  {
    key: 'invite_colleague',
    scope: 'workspace',
    title: 'Invite your team',
    description: 'Bring your colleagues into the workspace',
  },
  {
    key: 'import_data',
    scope: 'workspace',
    title: 'Migrate existing data',
    description:
      'Bring over contacts, companies, deals, and lists from your current CRM or spreadsheets without rebuilding everything from scratch.',
  },
] as const
export type TaskKey = (typeof taskCatalogue)[number]['key']
export type Completion = {
  id: string
  userId: string | null
  taskKey: string
  creditsAwarded: number
  completedAt: string
}
export type OnboardingDates = {
  onboardingStartedAt?: string | null
  onboardingCompletedAt: string | null
  onboardingSkippedAt: string | null
}
export const isFinished = (state: OnboardingDates) =>
  Boolean(state.onboardingCompletedAt || state.onboardingSkippedAt)
export const showWorkspaceTasks = (role: string, workspace: OnboardingDates) =>
  role === 'admin' && !isFinished(workspace)
export const onboardingDone = (
  role: string,
  membership: OnboardingDates,
  workspace: OnboardingDates,
) => isFinished(membership) && (role !== 'admin' || isFinished(workspace))
export const visibleTasks = (role: string, workspace: OnboardingDates) =>
  taskCatalogue.filter((task) => task.scope === 'user' || showWorkspaceTasks(role, workspace))
export const relevantCompletions = (rows: Completion[], userId: string, keys: readonly string[]) =>
  rows.filter((row) => keys.includes(row.taskKey) && (row.userId === null || row.userId === userId))
export function prospectiveCredits(taskKey: TaskKey, rows: Completion[], hasSubscription: boolean) {
  const task = taskCatalogue.find((task) => task.key === taskKey)!
  return hasSubscription &&
    (task.scope === 'workspace' ||
      rows.filter((row) => row.taskKey === taskKey && row.userId !== null).length < 4)
    ? 25
    : 0
}
export function progressSummary(rows: Completion[], prospective: Record<string, number>) {
  const completedKeys = new Set(rows.map((row) => row.taskKey))
  const remaining = Object.entries(prospective).filter(([key]) => !completedKeys.has(key))
  const countMode =
    rows.some((row) => row.creditsAwarded === 0) || remaining.some(([, credits]) => credits === 0)
  const earned = rows.reduce((sum, row) => sum + row.creditsAwarded, 0)
  const total = countMode
    ? rows.length + remaining.length
    : earned + remaining.reduce((sum, [, credits]) => sum + credits, 0)
  let accumulated = 0
  const checkpoints = rows.map((row) => {
    accumulated += countMode ? 1 : row.creditsAwarded
    return total ? (accumulated / total) * 100 : 0
  })
  return {
    countMode,
    earned,
    total,
    completed: rows.length,
    percent: total ? ((countMode ? rows.length : earned) / total) * 100 : 0,
    checkpoints,
  }
}
export const notetakerProviders = [
  'Fireflies.ai',
  'Circleback',
  'Fathom',
  'Granola',
  'Notion',
  'Wispr Flow',
  'Garba',
  'Jamie',
] as const
export const migrationSources = ['HubSpot', 'Attio', 'Affinity', 'Pipedrive', 'CSV'] as const
export const flowCatalogue = [
  {
    key: 'pipeline-and-lists',
    title: 'Set up your pipeline',
    description: 'Shape your deal stages and the lists your team works from.',
  },
  {
    key: 'activate-agents',
    title: 'Activate your agents',
    description: 'Pick the ready-made agents you want and switch them on.',
  },
  {
    key: 'existing-customers',
    title: 'Track customers',
    description: 'Find and tag your customers in a list that keeps itself current.',
  },
  {
    key: 'target-account-list',
    title: 'Target account list',
    description: 'Describe your ideal customer and rank accounts by fit.',
  },
  {
    key: 'start-outreach',
    title: 'Start outreach',
    description: 'Build a multi-channel sequence and approve every draft.',
  },
  {
    key: 'personalize-emails',
    title: 'Personalize your emails',
    description: 'Tenzeros learns your style so drafts sound like you.',
  },
] as const
export type FlowStatus = 'not_started' | 'in_progress' | 'completed'
export function orderedFlows(statuses: Record<string, FlowStatus>) {
  const rank = (key: string) =>
    statuses[key] === 'in_progress' ? 0 : statuses[key] === 'completed' ? 2 : 1
  return [...flowCatalogue].sort((a, b) => rank(a.key) - rank(b.key))
}
export function connectErrorMessage(status: string, provider: string, email?: string) {
  if (status === 'wrong_account')
    return `You connected a different ${provider} account. ${email ? `Reconnect with ${email} to fix this account.` : 'Try again with the original account.'}`
  if (status === 'denied')
    return `${provider} access wasn't granted. Try again to grant the required permissions.`
  if (status === 'admin_consent')
    return "Your organization's admin needs to approve Tenzeros. After they grant tenant-wide consent, come back and connect again. We are not notified when approval completes."
  if (status === 'error') return 'Something went wrong while connecting. Please try again.'
  return 'Some permissions were missing. Reconnect to grant the missing permissions.'
}
