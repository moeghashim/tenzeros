export default defineNuxtRouteMiddleware(async () => {
  const requestFetch = useRequestFetch()
  const { error } = await useAsyncData('account', () => requestFetch('/api/auth/me'))
  if (error.value?.statusCode === 401) return navigateTo('/login')
  if (error.value) throw createError({ statusCode: error.value.statusCode || 500, statusMessage: 'Could not load your account. Please try again.' })
})
