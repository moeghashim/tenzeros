/** Share one auth-aware client between snapshots and imperative API mutations. */
export default defineNuxtPlugin((app) => {
  const api = import.meta.server
    ? useRequestFetch()
    : $fetch.create({
        onResponseError({ request, response }) {
          const path = typeof request === 'string' ? request : request.url
          if (
            import.meta.client &&
            response.status === 401 &&
            path.startsWith('/api/') &&
            !['/api/auth/login', '/api/auth/signup'].includes(path)
          ) {
            void app.runWithContext(() => navigateTo('/login', { replace: true }))
          }
        },
      })
  return { provide: { api } }
})
