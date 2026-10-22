import { openDatabase, migrateDatabase } from '../server/db/index'
const db = openDatabase()
try { migrateDatabase(db); console.log('Database migrations applied.') } finally { db.$client.close() }
