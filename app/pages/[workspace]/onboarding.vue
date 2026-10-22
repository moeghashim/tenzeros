<script setup lang="ts">
import { IconX } from '@tabler/icons-vue'
import { connectErrorMessage, type TaskKey } from '#shared/onboarding'
useHead({ title: 'Get started — Tenzeros' })
definePageMeta({ key: (route) => String(route.params.workspace) })
const route = useRoute(),
  router = useRouter()
const { data, error, refresh, tasks, completions, done, key } = await useOnboarding()
const identity = computed(() => `${data.value?.workspace.id}:${data.value?.user.id}`)
const displayed = useTaskCelebrations(identity, completions)
const completed = (taskKey: string) => displayed.value.some((row) => row.taskKey === taskKey)
const credits = (taskKey: TaskKey) =>
  displayed.value.find((row) => row.taskKey === taskKey)?.creditsAwarded ??
  data.value?.prospectiveCredits[taskKey] ??
  25
const prospective = computed(() =>
  Object.fromEntries(
    tasks.value.map((task) => [task.key, data.value?.prospectiveCredits[task.key] ?? 25]),
  ),
)
const allCompleted = computed(
  () => tasks.value.length > 0 && tasks.value.every((task) => completed(task.key)),
)
const connect = ref<'google' | 'notetaker' | 'linkedin' | 'instructions'>(),
  invite = ref(false),
  migration = ref('')
const toast = ref(''),
  connectAlert = ref(''),
  finishError = ref(''),
  finishing = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | undefined
async function migrate(source: string) {
  if (source !== 'CSV') {
    migration.value = source
    return
  }
  try {
    const result = await $fetch('/api/onboarding/flows/start', {
      method: 'POST',
      body: { workspaceId: data.value!.workspace.id, flowKey: 'csv-import', mode: 'restart' },
    })
    useChatSurface().openDocked(result.data.chatId)
  } catch {
    showToast('Could not start the import chat. Please retry.')
  }
}
function showToast(message: string) {
  toast.value = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
  }, 4000)
}
const pending = computed(
  () => data.value?.members.filter((member) => member.status === 'invited').length || 0,
)
const joined = computed(
  () =>
    data.value?.members.filter(
      (member) => member.userId !== data.value?.user.id && member.status === 'active',
    ) || [],
)
const inviteLabel = computed(() =>
  pending.value
    ? `${pending.value} invited, waiting for ${pending.value === 1 ? 'them' : 'them all'} to join`
    : joined.value.length === 1
      ? `${joined.value[0]?.name || 'Teammate'} joined`
      : joined.value.length > 1
        ? `${joined.value.length} teammates joined`
        : 'Bring your colleagues into the workspace',
)
const mailError = computed(() =>
  [...(data.value?.mailboxes || []), ...(data.value?.calendars || [])].some((row) =>
    ['missing_scopes', 'auth_expired', 'error'].includes(row.status),
  ),
)
function status(taskKey: TaskKey) {
  if (taskKey === 'connect_gmail')
    return mailError.value
      ? 'Reconnect required'
      : data.value?.calendars[0]?.email || data.value?.mailboxes[0]?.email || 'Connected'
  if (taskKey === 'connect_notetaker') return data.value?.notetakers[0]?.type || 'Connected'
  if (taskKey === 'install_extension') return 'Synced'
  if (taskKey === 'create_automation') return 'Activated'
  return inviteLabel.value
}
function isError(taskKey: TaskKey) {
  return taskKey === 'connect_gmail'
    ? mailError.value
    : taskKey === 'connect_notetaker' && data.value?.notetakers[0]?.status === 'error'
}
function isDemo(taskKey: TaskKey) {
  return taskKey === 'connect_gmail'
    ? data.value?.mailboxes[0]?.isDemo
    : taskKey === 'connect_notetaker'
      ? data.value?.notetakers[0]?.isDemo
      : taskKey === 'install_extension'
        ? data.value?.linkedinAccounts[0]?.isDemo
        : false
}
async function activate(taskKey: TaskKey) {
  if (taskKey === 'connect_gmail') {
    if (completed(taskKey) && !mailError.value)
      await navigateTo(`/${key.value}/settings/user/connected-accounts`)
    else connect.value = 'google'
  } else if (taskKey === 'connect_notetaker') connect.value = 'notetaker'
  else if (taskKey === 'install_extension') connect.value = 'linkedin'
  else if (taskKey === 'create_automation') await navigateTo(`/${key.value}/agents`)
  else if (taskKey === 'invite_colleague') invite.value = true
}
async function finish() {
  finishing.value = true
  finishError.value = ''
  celebrate()
  await new Promise((resolve) => setTimeout(resolve, 1500))
  try {
    await $fetch(`/api/workspaces/${key.value}/onboarding`, {
      method: 'PATCH',
      body: { action: 'complete' },
    })
    await refresh()
    await navigateTo(`/${key.value}`, { replace: true })
  } catch {
    finishError.value = 'Could not complete onboarding. Please try again.'
  } finally {
    finishing.value = false
  }
}
watch(
  done,
  (value) => {
    if (value) void navigateTo(`/${key.value}`, { replace: true })
  },
  { immediate: true },
)
onMounted(() => {
  if (!done.value) {
    try {
      const storageKey = `onboarding_started:${identity.value}`
      if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, '1')
    } catch {
      /* Storage is optional. */
    }
  }
  const provider = route.query.google_status ? 'Google' : 'Microsoft'
  const status = String(route.query.google_status || route.query.microsoft_status || '')
  if (status) {
    if (status !== 'success')
      connectAlert.value = connectErrorMessage(
        status,
        provider,
        typeof route.query.expected_email === 'string' ? route.query.expected_email : undefined,
      )
    const query = { ...route.query }
    for (const name of [
      'google_status',
      'microsoft_status',
      'expected_email',
      'missing_scopes',
      'mailboxId',
      'calendarId',
    ])
      delete query[name]
    void router.replace({ query })
  }
})
onUnmounted(() => clearTimeout(toastTimer))
</script>
<template>
  <section v-if="data && !done" class="onboarding-page">
    <div v-if="connectAlert" class="connect-alert" role="alert">
      <div>
        <strong>Connection didn't complete.</strong>
        <p>{{ connectAlert }}</p>
      </div>
      <div class="alert-actions">
        <button @click="connect = 'google'">Try again</button
        ><button @click="connect = 'instructions'">Why did this fail?</button
        ><button aria-label="Dismiss" @click="connectAlert = ''"><IconX :size="16" /></button>
      </div>
    </div>
    <header class="bento-header">
      <h1>Get started</h1>
      <p>Complete these steps to set up your workspace and earn bonus credits!</p>
    </header>
    <OnboardingCompletionProgress :completions="displayed" :prospective="prospective" />
    <div class="bento-grid">
      <OnboardingTaskCard
        v-for="task in tasks.filter((task) => task.scope === 'user')"
        :key="task.key"
        :task="task"
        :credits="credits(task.key)"
        :completed="completed(task.key)"
        :status="status(task.key)"
        :error="isError(task.key)"
        :demo="isDemo(task.key)"
        @activate="activate(task.key)"
      />
      <div v-if="tasks.some((task) => task.scope === 'workspace')" class="bento-split-row">
        <OnboardingTaskCard
          v-for="task in tasks.filter((task) =>
            ['create_automation', 'invite_colleague'].includes(task.key),
          )"
          :key="task.key"
          :task="task"
          :credits="credits(task.key)"
          :completed="completed(task.key)"
          :status="status(task.key)"
          :description="task.key === 'invite_colleague' ? inviteLabel : undefined"
          @activate="activate(task.key)"
        >
          <template v-if="task.key === 'invite_colleague'" #illustration
            ><div class="avatar-illustration">
              <OnboardingAvatarStack :members="data.members" :user-id="data.user.id" /></div
          ></template>
        </OnboardingTaskCard>
      </div>
      <OnboardingMigrationCard
        v-if="tasks.some((task) => task.key === 'import_data')"
        :completed="completed('import_data')"
        :credits="credits('import_data')"
        :source="data.imports[0]?.type"
        @select="migrate"
      />
    </div>
    <div v-if="allCompleted" class="completion-footer">
      <button class="primary" :disabled="finishing" @click="finish">
        {{ finishing ? 'Finishing…' : 'Complete onboarding' }}
      </button>
      <p v-if="finishError" class="error" role="alert">{{ finishError }}</p>
    </div>
    <OnboardingGuidedGallery
      :workspace-id="data.workspace.id"
      :has-mailbox="data.mailboxes.length > 0"
      @unlock="connect = 'google'"
      @toast="showToast"
    />
    <OnboardingConnectModal
      v-if="connect"
      :kind="connect"
      :workspace-key="key"
      :workspace-id="data.workspace.id"
      :google-available="data.googleAvailable"
      @close="connect = undefined"
      @connected="refresh()"
    />
    <OnboardingInviteModal
      v-if="invite"
      :workspace-key="key"
      :workspace-id="data.workspace.id"
      @close="invite = false"
      @invited="refresh()"
    />
    <OnboardingImportModal
      v-if="migration"
      :source="migration"
      :workspace-key="key"
      @close="migration = ''"
      @imported="refresh()"
    />
    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </section>
  <section v-else-if="error" class="page">
    <h1>Could not load onboarding</h1>
    <button @click="refresh()">Try again</button>
  </section>
</template>
<style scoped>
.onboarding-page {
  max-width: 1064px;
  padding: 7vh 40px 64px 32px;
  margin: 0 auto;
  container-type: inline-size;
}
.bento-header {
  margin-bottom: 32px;
}
h1 {
  font-size: 14px;
  font-weight: 600;
}
.bento-header p {
  color: #777;
  font-size: 13px;
}
.bento-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.bento-split-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  grid-column: 1 / -1;
}
.avatar-illustration {
  padding: 6px 4px 0;
}
.completion-footer {
  text-align: center;
  margin-top: 24px;
}
.completion-footer button {
  padding: 12px 24px;
  border-radius: 99px;
}
.connect-alert {
  background: #fff6e7;
  border: 1px solid #f3dfba;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 24px;
}
.alert-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.alert-actions button {
  font-size: 12px;
  display: flex;
  align-items: center;
}
.toast {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  background: #202020;
  color: white;
  border-radius: 12px;
  padding: 12px 20px;
  box-shadow: var(--shadow-lg);
  z-index: 100;
}
@container (max-width: 720px) {
  .bento-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .bento-split-row {
    display: contents;
  }
  :deep([data-task='invite_colleague']) {
    grid-column: 1 / -1;
  }
}
@container (max-width: 460px) {
  .bento-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }
}
@media (max-width: 600px) {
  .onboarding-page {
    padding: 30px 18px;
  }
}
</style>
