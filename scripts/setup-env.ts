#!/usr/bin/env bun

import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { parsePublicEnv } from '@openschool/config/public'
import {
  parseInvitationDeliveryEnv,
  parseMigrationEnv,
  parseServerEnv,
  parseStudentSliceEnv,
  parseWorkerEnv,
} from '@openschool/config/server'
import { config } from 'dotenv'

const root = process.cwd()
const examplePath = resolve(root, '.env.example')
const localPath = resolve(root, '.env.local')

function setup(): void {
  if (!existsSync(examplePath)) {
    throw new Error(`Environment template not found: ${examplePath}`)
  }

  if (existsSync(localPath)) {
    throw new Error(
      '.env.local already exists. Refusing to overwrite it; run `bun run env:check` instead.'
    )
  }

  copyFileSync(examplePath, localPath)
  console.log('Created .env.local from .env.example.')
  console.log(
    'Replace the Supabase and invitation-encryption placeholders, then run `bun run env:check`.'
  )
}

function check(): void {
  if (existsSync(localPath)) {
    config({ path: localPath, override: false, quiet: true })
  }

  const publicEnv = parsePublicEnv(process.env)
  const serverEnv = parseServerEnv(process.env)
  const workerEnv = parseWorkerEnv(process.env)
  const migrationEnv = parseMigrationEnv(process.env)
  const studentSliceEnv = parseStudentSliceEnv(process.env)
  const invitationDeliveryEnv = parseInvitationDeliveryEnv(process.env)
  const migrationUsername = decodeURIComponent(
    new URL(migrationEnv.DATABASE_MIGRATION_URL).username
  )
  if (migrationUsername !== serverEnv.DATABASE_MIGRATION_ROLE) {
    throw new Error(
      'DATABASE_MIGRATION_URL username must match the non-secret DATABASE_MIGRATION_ROLE assertion.'
    )
  }
  const keyType = publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')
    ? 'publishable'
    : 'legacy anon'

  console.log('Environment configuration is valid.')
  console.log(`- Supabase origin: ${new URL(publicEnv.NEXT_PUBLIC_SUPABASE_URL).origin}`)
  console.log(`- Public key type: ${keyType}`)
  console.log(`- App origin: ${new URL(publicEnv.NEXT_PUBLIC_APP_URL).origin}`)
  console.log(`- Marketing origin: ${new URL(publicEnv.NEXT_PUBLIC_WWW_URL).origin}`)
  console.log(`- Migration database host: ${new URL(migrationEnv.DATABASE_MIGRATION_URL).host}`)
  console.log(`- Migration database role: ${serverEnv.DATABASE_MIGRATION_ROLE}`)
  console.log(`- Runtime database role: ${serverEnv.DATABASE_RUNTIME_ROLE}`)
  console.log(`- Worker database role: ${workerEnv.DATABASE_WORKER_ROLE}`)
  console.log(`- Student slice mode: ${studentSliceEnv.OPENSCHOOL_STUDENT_SLICE_MODE}`)
  console.log(
    `- Invitation encryption key: ${invitationDeliveryEnv.INVITATION_TOKEN_ENCRYPTION_KEY_ID}`
  )
}

const command = process.argv[2]

try {
  if (command === 'setup') {
    setup()
  } else if (command === 'check') {
    check()
  } else {
    throw new Error('Usage: bun run scripts/setup-env.ts <setup|check>')
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Environment setup failed: ${message}`)
  process.exit(1)
}
