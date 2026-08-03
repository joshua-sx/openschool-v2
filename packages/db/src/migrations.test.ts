import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

interface Journal {
  entries: Array<{ tag: string }>
}

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const migrationsDirectory = resolve(currentDirectory, '../migrations')
const retiredPolicyDraft = resolve(
  currentDirectory,
  '../policy-drafts/0003_enable_rls.sql.disabled'
)

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

  it('removes the disabled RLS draft after its reviewed replacement is executable', () => {
    assert.equal(existsSync(retiredPolicyDraft), false)
  })

  it('forces named-role RLS for the reviewed School and Student slice', () => {
    const migration = readFileSync(
      join(migrationsDirectory, '0014_student_school_forced_rls.sql'),
      'utf8'
    )
    for (const expected of [
      'ALTER TABLE "schools" FORCE ROW LEVEL SECURITY',
      'ALTER TABLE "students" FORCE ROW LEVEL SECURITY',
      'CREATE POLICY "schools_runtime_select"',
      'CREATE POLICY "students_runtime_select"',
      'CREATE POLICY "students_runtime_insert"',
      'CREATE POLICY "students_runtime_update"',
      'CREATE POLICY "students_runtime_delete"',
      'TO "openschool_runtime"',
      'TO "openschool_worker"',
      'WITH CHECK',
      'openschool_student_scope_allows',
      'REVOKE ALL ON FUNCTION "openschool_policy_constraints"() FROM PUBLIC',
    ]) {
      assert.equal(migration.includes(expected), true, `migration must include ${expected}`)
    }
  })

  it('installs a partitioned append-only Audit Ledger and guarded outbox', () => {
    const migration = readFileSync(
      join(migrationsDirectory, '0015_atomic_audit_outbox.sql'),
      'utf8'
    )
    for (const expected of [
      'PARTITION BY RANGE ("occurred_at")',
      'CREATE TABLE "audit_events_2026_q4" PARTITION OF "audit_events"',
      'CREATE TABLE "audit_events_2027_q1" PARTITION OF "audit_events"',
      'CREATE TABLE "audit_events_default" PARTITION OF "audit_events" DEFAULT',
      'ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY',
      'ALTER TABLE "audit_outbox" FORCE ROW LEVEL SECURITY',
      'ALTER TABLE "audit_archive_manifests" FORCE ROW LEVEL SECURITY',
      'CREATE POLICY "audit_events_runtime_insert"',
      'CREATE POLICY "audit_events_runtime_update_deny"',
      'CREATE POLICY "audit_events_runtime_delete_deny"',
      'CREATE POLICY "audit_outbox_worker_update"',
      'openschool_hash_audit_event_on_insert',
      "'hashSchemaVersion', 1",
      'SET search_path = pg_catalog, extensions, public',
      'openschool_guard_audit_event_insert',
      'openschool_guard_audit_outbox_change',
      "OLD.status = 'processing' AND NEW.status = 'processing'",
      "context\" ->> 'actorAccountId' = nullif(current_setting('app.account_id'",
      'audit_archive_manifest_delete_rejected',
      'REVOKE ALL ON FUNCTION "openschool_audit_scope_allows"',
    ]) {
      assert.equal(migration.includes(expected), true, `migration must include ${expected}`)
    }
    assert.equal(migration.includes('to_jsonb(NEW)'), false)
    assert.equal(migration.includes('to_jsonb(event)'), false)
  })
})
