import { resolve } from 'node:path'
import { getServerEnv } from '@openschool/config/server'
import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// Load .env.local from project root
config({ path: resolve(__dirname, '../../.env.local'), override: false, quiet: true })

const { DATABASE_URL } = getServerEnv()

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: DATABASE_URL,
  },
})
