import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'

export function openDatabase(filename = resolve('.data/tenzeros.db')) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true })
  const sqlite = new Database(filename)
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('busy_timeout = 5000')
  return drizzle(sqlite, { schema })
}
export type AppDatabase = ReturnType<typeof openDatabase>
export function migrateDatabase(db: AppDatabase) {
  migrate(db, { migrationsFolder: resolve('server/db/migrations') })
}
let database: AppDatabase | undefined
export function getDb() {
  return (database ??= openDatabase())
}
