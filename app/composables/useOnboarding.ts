import { onboardingDone, relevantCompletions, visibleTasks } from '#shared/onboarding'
export async function useOnboarding() {
  const route = useRoute()
  const key = computed(() => String(route.params.workspace))
  const result = await useApiFetch(
    () => `/api/workspaces/${encodeURIComponent(key.value)}/onboarding`,
  )
  const tasks = computed(() =>
    result.data.value ? visibleTasks(result.data.value.role, result.data.value.workspace) : [],
  )
  const completions = computed(() =>
    result.data.value
      ? relevantCompletions(
          result.data.value.completions,
          result.data.value.user.id,
          tasks.value.map((task) => task.key),
        )
      : [],
  )
  const done = computed(() =>
    result.data.value
      ? onboardingDone(
          result.data.value.role,
          result.data.value.membership,
          result.data.value.workspace,
        )
      : false,
  )
  return { ...result, tasks, completions, done, key }
}
