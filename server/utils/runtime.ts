import { useRuntimeConfig } from '#imports'

/** Nuxt's shared runtimeConfig is immutable. Resolve the plan's non-NUXT env
 * aliases into a server-only snapshot at call time, never into the build output.
 * Nothing from this snapshot is returned to a client or assigned to `public`.
 */
export function llmRuntimeConfig() {
  const config = useRuntimeConfig()
  return {
    deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? config.deepseekApiKey,
    deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || config.deepseekBaseUrl,
    deepseekModel: process.env.DEEPSEEK_MODEL || config.deepseekModel,
    llmMock: process.env.LLM_MOCK === undefined ? config.llmMock : process.env.LLM_MOCK === '1',
  }
}
