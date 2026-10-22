export function useApi() {
  return useNuxtApp().$api
}

// Keep Nuxt's route-aware response inference and SSR cookie forwarding.
export const useApiFetch = createUseFetch(() => ({ $fetch: useApi() }))
