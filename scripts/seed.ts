import { openDatabase, migrateDatabase } from '../server/db'
import { seedDemo } from '../server/utils/demo-seed'
const db = openDatabase()
try {
  migrateDatabase(db)
  const workspace = seedDemo(db)
  console.log(
    `Demo ready at /${workspace.key}/onboarding. Sign in with Demo User / demo@tenzeros.local. Seed does not call the LLM.`,
  )
} finally {
  db.$client.close()
}
