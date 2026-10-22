import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'
import { openDatabase, migrateDatabase } from '../../server/db'

const path = process.env.E2E_DATABASE_PATH
if (!path || !/e2e-[\w-]+\.db$/.test(path))
  throw new Error('Expected an isolated e2e database path')
const databasePath = process.env.E2E_MOCK === '0' ? `${path}.missing` : path
const db = openDatabase(databasePath)
migrateDatabase(db)
db.$client.close()
const server = spawn(process.execPath, ['.output/server/index.mjs'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: process.env.E2E_PORT,
    DATABASE_PATH: databasePath,
    NUXT_SESSION_SECRET: 'e2e-only-secret-never-use-for-a-deployment-0123456789',
    LLM_MOCK: process.env.E2E_MOCK,
    NUXT_LLM_MOCK: 'false',
    DEEPSEEK_API_KEY: '',
    NUXT_DEEPSEEK_API_KEY: '',
    GOOGLE_CLIENT_ID: '',
    GOOGLE_CLIENT_SECRET: '',
  },
})
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    server.kill(signal)
  })
server.on('exit', (code) => {
  for (const suffix of ['', '-shm', '-wal']) rmSync(databasePath + suffix, { force: true })
  process.exit(code || 0)
})
