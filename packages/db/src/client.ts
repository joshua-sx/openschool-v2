import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

// For use in server components and API routes
export function createClient(connectionString?: string) {
  const url = connectionString || process.env.DATABASE_URL!
  const client = postgres(url, { prepare: false })
  return drizzle(client, { schema })
}

// Singleton for most use cases
let db: ReturnType<typeof createClient> | null = null

export function getDb() {
  if (!db) {
    db = createClient()
  }
  return db
}

export { db }