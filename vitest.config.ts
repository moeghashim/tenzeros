import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
export default defineConfig({ resolve: { alias: { '#imports': fileURLToPath(new URL('./tests/runtime-config.ts', import.meta.url)) } }, test: { environment: 'node', include: ['tests/**/*.test.ts'], env: { LLM_MOCK: '1' } } })
