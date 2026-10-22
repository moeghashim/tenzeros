<script setup lang="ts">
const props = defineProps<{ mode: 'signup' | 'login' }>()
const form = reactive({ name: '', email: '', workspaceName: '', domain: '' })
const busy = ref(false)
const error = ref('')
async function submit() {
  busy.value = true; error.value = ''
  try {
    const result = await $fetch(`/api/auth/${props.mode}`, { method: 'POST', body: form })
    clearNuxtData()
    await navigateTo(result.redirect)
  } catch (cause) {
    error.value = (cause as { data?: { statusMessage?: string } }).data?.statusMessage || 'Could not continue. Check your details and try again.'
  } finally { busy.value = false }
}
</script>
<template>
  <main class="auth-page">
    <section class="auth-card">
      <div class="brand">Tenzeros<span aria-hidden="true">·</span></div>
      <h1>{{ mode === 'signup' ? 'Create your workspace' : 'Welcome back' }}</h1>
      <p class="muted">{{ mode === 'signup' ? 'A little context. A better place to start.' : 'Sign in with your name and email.' }}</p>
      <form @submit.prevent="submit">
        <label>Your name<input v-model="form.name" name="name" autocomplete="name" required maxlength="100"></label>
        <label>Email<input v-model="form.email" name="email" type="email" autocomplete="email" required maxlength="254"></label>
        <template v-if="mode === 'signup'">
          <label>Workspace name<input v-model="form.workspaceName" name="workspaceName" autocomplete="organization" required maxlength="100" placeholder="Acme"></label>
          <label>Company domain<input v-model="form.domain" name="domain" required maxlength="253" placeholder="acme.com" autocapitalize="none"></label>
        </template>
        <p v-if="error" role="alert" class="error">{{ error }}</p>
        <button class="primary" :disabled="busy" type="submit">{{ busy ? 'Please wait…' : mode === 'signup' ? 'Create workspace' : 'Sign in' }}</button>
      </form>
      <p class="muted footnote">Local demo sign-in uses no password or email verification.</p>
      <NuxtLink :to="mode === 'signup' ? '/login' : '/signup'">{{ mode === 'signup' ? 'Already have an account? Sign in' : 'New to Tenzeros? Create a workspace' }}</NuxtLink>
    </section>
  </main>
</template>
<style scoped>
.auth-page { min-height: 100dvh; display: grid; place-items: center; padding: 24px; }
.auth-card { width: 100%; max-width: 420px; padding: 32px; background: white; border: 1px solid var(--color-borderSubtle); border-radius: var(--radius-2xl); box-shadow: var(--shadow-sm); }
.brand { font-weight: 600; font-size: 22px; letter-spacing: -.06em; margin-bottom: 32px; }.brand span { color: var(--color-accentSolid); }
h1 { font-size: 20px; } form { display: grid; gap: 16px; margin: 24px 0; } label { display: grid; gap: 6px; font-weight: 500; } .footnote { font-size: 12px; margin-bottom: 16px; }
</style>
