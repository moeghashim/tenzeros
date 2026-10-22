<script setup lang="ts">
import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconSearch, IconHome, IconInbox, IconCheckbox, IconWorld, IconBolt, IconRoute, IconChartBar, IconTable, IconUser, IconLayoutKanban, IconSettings, IconGift, IconBook, IconMessageCircle, IconChevronDown, IconLogout, IconX } from '@tabler/icons-vue'
const props = defineProps<{
  workspace: { id: string; key: string; name: string; trialEndsAt: string; onboardingSkippedAt: string | null }
  workspaces: { id: string; key: string; name: string }[]
  chats: { id: string; title: string }[]
  dismissed: boolean
}>()
const emit = defineEmits<{ dismissed: [] }>()
const dismissDialog = ref<HTMLDialogElement>()
const dismissing = ref(false)
const dismissError = ref('')
async function dismissOnboarding() {
  dismissing.value = true; dismissError.value = ''
  try {
    await $fetch(`/api/workspaces/${props.workspace.key}/onboarding`, { method: 'PATCH', body: { action: 'dismiss' } })
    emit('dismissed'); dismissDialog.value?.close()
    await navigateTo(link('home'))
  } catch { dismissError.value = 'Could not dismiss onboarding. Please try again.' } finally { dismissing.value = false }
}
const collapsed = ref(false)
const width = ref(220)
const palette = ref<HTMLDialogElement>()
const query = ref('')
const now = ref(Date.now())
const days = computed(() => Math.min(14, Math.max(0, Math.ceil((Date.parse(props.workspace.trialEndsAt) - now.value) / 86400000))))
const nav = [
  { title: 'Home', path: 'home', icon: IconHome }, { title: 'Inbox', path: 'inbox', icon: IconInbox },
  { title: 'Tasks', path: 'tasks', icon: IconCheckbox }, { title: 'Lead search', path: 'lead-search', icon: IconWorld },
  { title: 'Agents', path: 'agents', icon: IconBolt }, { title: 'Sequences', path: 'sequences', icon: IconRoute },
  { title: 'Reports', path: 'reports', icon: IconChartBar }, { title: 'Records & Lists', path: 'lists', icon: IconTable },
]
const link = (path: string) => `/${props.workspace.key}/${path}`
function persist() { try { localStorage.setItem('tenzeros-sidebar', JSON.stringify({ collapsed: collapsed.value, width: width.value })) } catch { /* Storage may be unavailable. */ } }
function toggle() { collapsed.value = !collapsed.value; persist() }
function resizeTo(value: number) { width.value = Math.min(340, Math.max(200, value)) }
function resize(event: PointerEvent) {
  if (collapsed.value) return
  event.preventDefault()
  const start = event.clientX; const initial = width.value
  const move = (e: PointerEvent) => resizeTo(initial + e.clientX - start)
  const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); stopResize = undefined; persist() }
  stopResize?.(); stopResize = end
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end)
}
let stopResize: (() => void) | undefined
function resizeKey(event: KeyboardEvent) { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); resizeTo(width.value + (event.key === 'ArrowLeft' ? -10 : 10)); persist() } }
function keyboard(event: KeyboardEvent) { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); palette.value?.showModal() } }
async function switchWorkspace(event: Event) { await navigateTo(`/${(event.target as HTMLSelectElement).value}/onboarding`) }
async function logout() { await $fetch('/api/auth/logout', { method: 'POST' }); clearNuxtData(); await navigateTo('/login') }
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  try { const stored = JSON.parse(localStorage.getItem('tenzeros-sidebar') || 'null'); if (stored) { collapsed.value = Boolean(stored.collapsed); if (Number.isFinite(stored.width)) resizeTo(stored.width) } else collapsed.value = window.innerWidth < 700 } catch { /* Defaults are usable without storage. */ }
  window.addEventListener('keydown', keyboard)
  timer = setInterval(() => { now.value = Date.now() }, 60000)
})
onUnmounted(() => { window.removeEventListener('keydown', keyboard); clearInterval(timer); stopResize?.() })
</script>
<template>
  <aside :class="{ collapsed }" :style="{ width: `${collapsed ? 56 : width}px` }" aria-label="Workspace navigation">
    <div class="sidebar-inner">
      <header>
        <span v-if="!collapsed" class="avatar" aria-hidden="true">{{ workspace.name[0]?.toUpperCase() }}</span>
        <select v-if="!collapsed" aria-label="Switch workspace" :value="workspace.key" @change="switchWorkspace"><option v-for="item in workspaces" :key="item.id" :value="item.key">{{ item.name }}</option></select>
        <button class="icon-button" :title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'" :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'" @click="toggle"><component :is="collapsed ? IconLayoutSidebarLeftExpand : IconLayoutSidebarLeftCollapse" :size="17" /></button>
      </header>
      <button class="search" aria-label="Search workspace (Command or Control K)" @click="palette?.showModal()"><IconSearch :size="16" /><span v-if="!collapsed">Search</span><kbd v-if="!collapsed">⌘K</kbd></button>
      <nav aria-label="Main">
        <div v-if="!dismissed" class="onboarding-nav"><NuxtLink :to="link('onboarding')" title="Get started"><span class="progress-ring" aria-hidden="true" /><span v-if="!collapsed">Get started</span><span v-else class="sr-only">Get started</span></NuxtLink><button v-if="!collapsed" class="icon-button dismiss-button" title="Dismiss onboarding" aria-label="Dismiss onboarding" @click="dismissDialog?.showModal()"><IconX :size="13" /></button></div>
        <NuxtLink v-for="item in nav" :key="item.path" :to="link(item.path)" :title="item.title"><component :is="item.icon" :size="16" /><span :class="{ 'sr-only': collapsed }">{{ item.title }}</span></NuxtLink>
      </nav>
      <div v-if="!collapsed" class="group-label">Pinned lists <IconChevronDown :size="12" /></div>
      <nav aria-label="Pinned lists">
        <NuxtLink :to="link('lists/sales-pipeline')" title="Sales Pipeline"><IconLayoutKanban class="teal" :size="16" /><span :class="{ 'sr-only': collapsed }">Sales Pipeline</span></NuxtLink>
        <NuxtLink :to="link('lists/my-deals')" title="My deals"><IconUser class="blue" :size="16" /><span :class="{ 'sr-only': collapsed }">My deals</span></NuxtLink>
      </nav>
      <section v-if="!collapsed" class="chats" aria-label="Chats"><div class="group-label">Chats <IconChevronDown :size="12" /></div><p v-if="!chats.length" class="empty">No chats yet</p><nav v-else><NuxtLink v-for="chat in chats" :key="chat.id" :to="link(`chats/${chat.id}`)"><IconMessageCircle :size="16" /><span>{{ chat.title }}</span></NuxtLink></nav></section>
      <footer>
        <div v-if="!collapsed" class="trial"><span>{{ days }}/14 days left on your trial</span><div class="trial-track"><span :style="{ width: `${days / 14 * 100}%` }" /></div></div>
        <div class="footer-controls">
          <NuxtLink :to="link('settings')" title="Settings" aria-label="Settings"><IconSettings :size="17" /><span v-if="!collapsed">Settings</span></NuxtLink>
          <NuxtLink v-if="!collapsed" :to="link('referral')" title="Refer a friend" aria-label="Refer a friend"><IconGift :size="17" /></NuxtLink>
          <NuxtLink v-if="!collapsed" :to="link('docs')" title="Documentation" aria-label="Documentation"><IconBook :size="17" /></NuxtLink>
          <NuxtLink v-if="!collapsed" :to="link('feedback')" title="Feedback" aria-label="Feedback"><IconMessageCircle :size="17" /></NuxtLink>
        </div>
        <button class="logout" aria-label="Sign out" title="Sign out" @click="logout"><IconLogout :size="16" /><span v-if="!collapsed">Sign out</span></button>
      </footer>
    </div>
    <div v-if="!collapsed" class="resize-handle" role="separator" aria-label="Resize sidebar" aria-orientation="vertical" :aria-valuenow="width" :aria-valuemin="200" :aria-valuemax="340" tabindex="0" @pointerdown="resize" @keydown="resizeKey" />
    <dialog ref="dismissDialog" aria-labelledby="dismiss-title">
      <h2 id="dismiss-title">Dismiss onboarding?</h2>
      <p>Any unclaimed onboarding credits will be lost. This can't be undone.</p>
      <p v-if="dismissError" role="alert" class="error">{{ dismissError }}</p>
      <div class="dialog-actions"><button @click="dismissDialog?.close()">Cancel</button><button class="destructive" :disabled="dismissing" @click="dismissOnboarding">Dismiss</button></div>
    </dialog>
    <dialog ref="palette" aria-labelledby="search-title" @click="event => { if (event.target === palette) palette?.close() }">
      <div class="palette-top"><h2 id="search-title">Search workspace</h2><button class="icon-button" aria-label="Close search" @click="palette?.close()"><IconX :size="18" /></button></div>
      <input v-model="query" autofocus placeholder="Search…" aria-label="Search"><p class="muted">Workspace search is coming soon.</p>
    </dialog>
  </aside>
</template>
<style scoped>
aside { position: sticky; top: 0; height: 100dvh; flex-shrink: 0; padding: 6px 0 6px 6px; }
.sidebar-inner { height: 100%; display: flex; flex-direction: column; overflow-y: auto; padding: 10px 8px; border-radius: 16px; background: white; box-shadow: var(--shadow-sm); }
header { display: flex; align-items: center; gap: 4px; min-height: 30px; margin-bottom: 8px; } .avatar { display: grid; place-items: center; width: 25px; height: 25px; flex-shrink: 0; border-radius: 8px; background: var(--color-bgSecondary); font-weight: 600; } select { border: 0; padding: 2px; flex: 1; width: 0; cursor: pointer; appearance: none; } .icon-button { padding: 4px; border: 0; display: flex; align-items: center; justify-content: center; background: transparent; }
.search { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 999px; color: var(--color-textTertiary); margin-bottom: 8px; text-align: left; } kbd { margin-left: auto; padding: 0 3px; border-radius: 4px; font: inherit; font-size: 11px; background: var(--color-bgSecondary); }
nav { display: grid; gap: 2px; } nav a, .footer-controls a { text-decoration: none; display: flex; align-items: center; gap: 9px; padding: 6px 8px; border-radius: 10px; min-height: 30px; color: var(--color-textSecondary); white-space: nowrap; } nav a span { overflow: hidden; text-overflow: ellipsis; } svg { flex-shrink: 0; color: var(--color-textTertiary); } nav a:hover, .icon-button:hover, .footer-controls a:hover { background: var(--color-bgHover); } nav a.router-link-exact-active { background: var(--color-bgActive); color: var(--color-textPrimary); }
.onboarding-nav { display: flex; align-items: center; position: relative; }.onboarding-nav a { flex: 1; }.dismiss-button { position: absolute; right: 4px; opacity: 0; }.onboarding-nav:hover .dismiss-button, .dismiss-button:focus-visible { opacity: 1; }.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px; }.destructive { background: var(--color-destructiveSolid); color: white; border: 0; }
.progress-ring { display: block; width: 14px; height: 14px; margin: 1px; border: 2px solid var(--color-borderNormal); border-radius: 50%; flex-shrink: 0; }.group-label { display: flex; align-items: center; gap: 5px; margin: 18px 8px 10px; color: var(--color-textTertiary); font-size: 12px; }.empty { color: var(--color-textTertiary); margin: 16px 8px; }.teal { color: #00a89c; }.blue { color: #6079f5; } footer { margin-top: auto; padding-top: 24px; }.trial { padding: 12px 14px; border: 1px solid var(--color-borderSubtle); border-radius: 9px; font-size: 11px; margin-bottom: 10px; color: var(--color-textSecondary); }.trial-track { height: 2px; background: var(--color-bgSecondary); margin-top: 6px; }.trial-track span { display: block; height: 100%; background: var(--color-textSecondary); }.footer-controls { display: flex; align-items: center; justify-content: space-between; }.footer-controls a { padding: 5px; font-size: 12px; }.logout { border: 0; background: transparent; display: flex; align-items: center; gap: 9px; font-size: 11px; color: var(--color-textTertiary); padding: 8px; }.resize-handle { position: absolute; right: -4px; width: 8px; top: 20px; bottom: 20px; cursor: col-resize; touch-action: none; }.resize-handle:hover { background: var(--color-accentBg); }.collapsed header { justify-content: center; }.collapsed .search { border: 0; padding: 6px; }.collapsed nav a { padding: 8px 6px; }.collapsed .footer-controls { justify-content: center; }
dialog { border: 1px solid var(--color-borderNormal); border-radius: 16px; padding: 24px; width: min(500px, calc(100vw - 32px)); box-shadow: var(--shadow-xl); } dialog::backdrop { background: var(--color-overlay); } .palette-top { display: flex; align-items: center; justify-content: space-between; } .palette-top h2 { margin: 0 0 16px; } dialog input { width: 100%; margin-bottom: 20px; }
</style>
