import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

interface Journal {
  entries: Array<{ tag: string }>
}

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const migrationsDirectory = resolve(currentDirectory, '../migrations')
const policyDraft = resolve(currentDirectory, '../policy-drafts/0003_enable_rls.sql.disabled')

describe('database migration baseline', () => {
  it('contains exactly the SQL migrations recorded in the Drizzle journal', () => {
    const journal = JSON.parse(
      readFileSync(resolve(migrationsDirectory, 'meta/_journal.json'), 'utf8')
    ) as Journal
    const journalFiles = journal.entries.map(({ tag }) => `${tag}.sql`).sort()
    const migrationFiles = readdirSync(migrationsDirectory)
      .filter((file) => file.endsWith('.sql'))
      .sort()

    assert.deepEqual(migrationFiles, journalFiles)
  })

  it('keeps the unapproved RLS draft disabled and outside migrations', () => {
    const draft = readFileSync(policyDraft, 'utf8')

    assert.equal(policyDraft.endsWith('.sql.disabled'), true)
    assert.equal(draft.startsWith('-- UNAPPROVED SECURITY DESIGN - DO NOT APPLY'), true)
  })
})
