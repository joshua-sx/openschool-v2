import { getMigrationEnv } from '@openschool/config/server'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

/**
 * Infrastructure-only client for migrations, seed data, and guarded proofs.
 * Product code must use the transaction adapters exported from
 * `tenant-transaction.ts`; CI rejects application imports of this function.
 */
export function createMigrationClient(connectionString?: string) {
  const url = connectionString ?? getMigrationEnv().DATABASE_MIGRATION_URL
  const client = postgres(url, { max: 1, prepare: false })
  return drizzle(client, { schema })
}

export type MigrationDatabase = ReturnType<typeof createMigrationClient>
