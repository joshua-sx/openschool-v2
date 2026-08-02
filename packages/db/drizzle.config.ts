import { resolve } from 'node:path'
import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// Load .env.local from project root
config({ path: resolve(__dirname, '../../.env.local') })

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run Drizzle commands')
}

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
})
