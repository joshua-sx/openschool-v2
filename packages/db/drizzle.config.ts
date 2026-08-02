import { resolve } from 'node:path'
import { getMigrationEnv } from '@openschool/config/server'
import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// Load .env.local from project root
config({ path: resolve(__dirname, '../../.env.local'), override: false, quiet: true })

const { DATABASE_MIGRATION_URL } = getMigrationEnv()

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: DATABASE_MIGRATION_URL,
  },
})
