import { openDatabase, migrateDatabase } from '../server/db'
export function testDatabase() {
  const db = openDatabase(':memory:')
  migrateDatabase(db)
  return db
}
export const accountInput = {
  name: 'Alex Example',
  email: 'alex@example.test',
  workspaceName: 'Acme Sales',
  domain: 'example.com',
}
