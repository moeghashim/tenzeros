import { eq } from 'drizzle-orm'
import { openDatabase, migrateDatabase } from '../server/db'
import { users } from '../server/db/schema'
import { createAccount } from '../server/utils/accounts'
const db = openDatabase()
try {
  migrateDatabase(db)
  if (!db.select().from(users).where(eq(users.email, 'demo@tenzeros.local')).get()) {
    createAccount(db, { name: 'Demo User', email: 'demo@tenzeros.local', workspaceName: 'Demo Workspace', domain: 'example.com' })
  }
  console.log('Demo ready. Sign in with Demo User / demo@tenzeros.local. Seed does not call the LLM.')
} finally { db.$client.close() }
