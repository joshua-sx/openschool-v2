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

  it('installs canonical learner admission with forced RLS and compatibility parity', () => {
    const migration = readFileSync(join(migrationsDirectory, '0028_greedy_ultimates.sql'), 'utf8')
    for (const expected of [
      'CREATE TABLE "school_enrollments"',
      'CREATE TABLE "student_compatibility_evidence"',
      'ALTER TABLE "school_enrollments" FORCE ROW LEVEL SECURITY',
      'ALTER TABLE "student_compatibility_evidence" FORCE ROW LEVEL SECURITY',
      'school_enrollments_primary_no_active_overlap',
      'openschool_canonical_student_scope_allows',
      'openschool_validate_school_enrollment',
      'student_compatibility_evidence_append_only',
      'openschool_private"."admit_canonical_student',
      'openschool_private"."update_canonical_student',
      'OWNER TO "openschool_student_admitter"',
      'REVOKE INSERT, UPDATE, DELETE ON TABLE "students" FROM "openschool_runtime"',
      'CANONICAL_STUDENT_ADMISSION_CONTEXT_INVALID',
      'STUDENT_COMPATIBILITY_LINK_MISMATCH',
    ]) {
      assert.equal(migration.includes(expected), true, `migration must include ${expected}`)
    }
  })

  it('installs immutable Academic Years, Terms, and Learner Levels', () => {
    const migration = readFileSync(
      join(migrationsDirectory, '0029_overconfident_iron_lad.sql'),
      'utf8'
    )
    for (const expected of [
      'CREATE TABLE "academic_years"',
      'CREATE TABLE "academic_terms"',
      'CREATE TABLE "learner_levels"',
      'CREATE TABLE "academic_compatibility_evidence"',
      'academic_years_no_overlapping_lifecycle_dates',
      'academic_terms_no_overlapping_dates',
      'lag(created_term.end_date) OVER (ORDER BY created_term.ordinal)',
      'ALTER TABLE "academic_years" FORCE ROW LEVEL SECURITY',
      'guard_academic_year_lifecycle',
      'guard_academic_compatibility_evidence',
      'openschool_private"."create_academic_year',
      'openschool_private"."publish_academic_year',
      'openschool_private"."close_academic_year',
      'OWNER TO "openschool_academic_configurator"',
      '"school_governance_assignments", "organization_tree_versions"',
      'ACADEMIC_YEAR_TIMEZONE_INVALID',
      'no dates were inferred',
      'REVOKE INSERT, UPDATE, DELETE ON TABLE "academic_years"',
    ]) {
      assert.equal(migration.includes(expected), true, `migration must include ${expected}`)
    }
  })

  it('installs an append-only learner enrollment transition authority', () => {
    const migration = readFileSync(join(migrationsDirectory, '0030_milky_lord_tyger.sql'), 'utf8')
    for (const expected of [
      'CREATE TABLE "school_enrollment_transition_events"',
      'ALTER TABLE "school_enrollment_transition_events" FORCE ROW LEVEL SECURITY',
      'school_enrollments_period_guard',
      'school_enrollment_transition_events_append_only',
      'openschool_enrollment_transition_scope_allows',
      'openschool_private"."schedule_school_enrollment_transition',
      'openschool_private"."apply_school_enrollment_transition',
      'openschool_private"."cancel_school_enrollment_transition',
      'pg_advisory_xact_lock',
      'membership_version = account.membership_version + 1',
      'ENROLLMENT_TRANSITION_STALE',
      'ENROLLMENT_TRANSITION_UNAVAILABLE',
      'OWNER TO "openschool_student_admitter"',
      'REVOKE INSERT, UPDATE, DELETE ON "school_enrollment_transition_events"',
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

  it('installs guarded Audit Ledger partition lifecycle automation', () => {
    const migration = readFileSync(
      join(migrationsDirectory, '0027_audit_partition_lifecycle.sql'),
      'utf8'
    )
    for (const expected of [
      'openschool_audit_partition_manager',
      'maintain_audit_partition_horizon',
      'pg_advisory_xact_lock',
      'AUDIT_DEFAULT_PARTITION_MISSING',
      'AUDIT_PARTITION_METADATA_INVALID',
      'AUDIT_PARTITION_PROTECTIONS_INVALID',
      'audit_events_partition_manager_select',
      'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
      'ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',
      'GRANT EXECUTE ON FUNCTION "openschool_hash_audit_event_on_insert"()',
      'GRANT EXECUTE ON FUNCTION "openschool_guard_audit_event_insert"()',
      'GRANT EXECUTE ON FUNCTION "openschool_reject_audit_event_change"()',
      'GRANT EXECUTE ON FUNCTION "openschool_reject_audit_evidence_delete"()',
      'FROM PUBLIC',
      'TO "openschool_worker"',
    ]) {
      assert.equal(migration.includes(expected), true, `migration must include ${expected}`)
    }
    assert.equal(migration.includes('TO "openschool_runtime"'), false)
    assert.equal(migration.includes('TO "openschool_control_plane"'), false)
  })

  it('installs invitation-only onboarding with forced RLS and a private acceptance seam', () => {
    const migration = readFileSync(join(migrationsDirectory, '0016_careful_violations.sql'), 'utf8')
    for (const expected of [
      'ALTER TABLE "account_invitations" FORCE ROW LEVEL SECURITY',
      'ALTER TABLE "invitation_delivery_outbox" FORCE ROW LEVEL SECURITY',
      'account_invitations_pending_person_unique',
      'accounts_primary_email_normalized_unique',
      'ACCOUNT_EMAIL_NORMALIZATION_CONFLICT',
      'openschool_invitation_scope_allows',
      'openschool_guard_account_invitation_change',
      'openschool_guard_invitation_delivery_change',
      'CREATE SCHEMA IF NOT EXISTS "openschool_private"',
      'account_invitations_acceptance_select',
      'account_invitations_acceptance_update',
      'audit_events_invitation_denial_insert',
      'audit_outbox_invitation_denial_insert',
      "current_user = 'openschool_invitation_acceptor'",
      'SECURITY DEFINER',
      'OWNER TO "openschool_invitation_acceptor"',
      'TO "openschool_invitation_acceptor"',
      'Terminal invitation delivery must erase credential material',
      'SET search_path = pg_catalog',
      "session_user <> 'openschool_runtime'",
      'INVITATION_IDENTITY_MISMATCH',
      'REVOKE ALL ON FUNCTION "openschool_private"."accept_account_invitation"',
      'GRANT EXECUTE ON FUNCTION "openschool_private"."accept_account_invitation"',
    ]) {
      assert.equal(migration.includes(expected), true, `migration must include ${expected}`)
    }

    const invitationRead = migration.indexOf('SELECT candidate.* INTO invitation')
    const identityMismatch = migration.indexOf(
      'IF invitation.identity_provider <> verified_identity_provider'
    )
    const eligibilityLock = migration.search(
      /PERFORM\s+1\s+FROM\s+public\.account_invitations\s+AS\s+candidate/
    )
    assert.ok(invitationRead >= 0 && invitationRead < identityMismatch)
    assert.ok(identityMismatch < eligibilityLock)
    assert.equal(migration.slice(invitationRead, identityMismatch).includes('FOR UPDATE'), false)
    assert.equal(
      migration
        .slice(eligibilityLock, migration.indexOf('IF NOT EXISTS (', eligibilityLock))
        .includes('FOR UPDATE'),
      true
    )
    assert.ok(
      migration.indexOf('ACCOUNT_EMAIL_NORMALIZATION_CONFLICT') <
        migration.indexOf('CREATE UNIQUE INDEX "accounts_primary_email_normalized_unique"')
    )
  })

  it('allows invitation capabilities to resolve Schools through the existing scope guard', () => {
    const migration = readFileSync(
      join(migrationsDirectory, '0017_outstanding_cerebro.sql'),
      'utf8'
    )
    for (const expected of [
      'ALTER POLICY "schools_runtime_select"',
      "'tenant.accounts.invite', 'tenant.accounts.manage'",
      'public.openschool_school_scope_allows',
    ]) {
      assert.equal(migration.includes(expected), true, `migration must include ${expected}`)
    }
  })

  it('validates encrypted invitation payloads without unsupported regex bounds', () => {
    const migration = readFileSync(
      join(migrationsDirectory, '0018_outgoing_moon_knight.sql'),
      'utf8'
    )
    assert.equal(migration.includes("token_ciphertext\" ~ '^[A-Za-z0-9_-]+$'"), true)
    assert.equal(migration.includes('token_ciphertext") BETWEEN 16 AND 1024'), true)
    assert.equal(migration.includes('{16,1024}'), false)
  })

  it('restricts invitation denial outbox returning to the current request', () => {
    const migration = readFileSync(
      join(migrationsDirectory, '0019_invitation_denial_outbox_returning.sql'),
      'utf8'
    )
    for (const expected of [
      'CREATE POLICY "audit_outbox_invitation_denial_select"',
      'FOR SELECT TO "openschool_runtime"',
      `"context" ->> 'requestId' = nullif(current_setting('app.request_id', true), '')`,
      `"context" ->> 'actorAccountId' IS NULL`,
      `"payload" ->> 'eventType' = 'account.invitation.accept'`,
      `"payload" ->> 'outcome' = 'denied'`,
      `'account.invitation.accept.denied:' || ("audit_outbox"."payload" ->> 'targetId')`,
    ]) {
      assert.equal(migration.includes(expected), true, `migration must include ${expected}`)
    }
  })

  it('hardens invitation integrity and throttles unaffiliated acceptance', () => {
    const integrityMigration = readFileSync(
      join(migrationsDirectory, '0020_reflective_nuke.sql'),
      'utf8'
    )
    const acceptancePolicyMigration = readFileSync(
      join(migrationsDirectory, '0021_gray_vance_astro.sql'),
      'utf8'
    )
    for (const expected of [
      'account_invitations_affiliation_kind_check',
      'jsonb_array_length("account_invitations"."role_template_keys") = 1',
      'invitation_delivery_status_evidence_check',
      '"encryption_key_id" IS NOT NULL',
      'invitation.intended_email = "invitation_delivery_outbox"."recipient_email"',
      'ALTER TABLE "invitation_acceptance_rate_limits" FORCE ROW LEVEL SECURITY',
      'consume_invitation_acceptance_rate_limit',
      'current_attempt_count <= 10',
      'REVOKE UPDATE ON TABLE public.account_invitations',
      'app.invitation_token_hash',
    ]) {
      assert.equal(
        integrityMigration.includes(expected),
        true,
        `integrity migration must include ${expected}`
      )
    }
    assert.equal(acceptancePolicyMigration.includes('app.invitation_token_hash'), true)
    assert.equal(acceptancePolicyMigration.includes('app.tenant_id'), true)
  })

  it('installs recent-auth session evidence and a narrow identity revocation authority', () => {
    const migration = readFileSync(join(migrationsDirectory, '0022_funny_sunset_bain.sql'), 'utf8')
    for (const expected of [
      'reauthenticated_at',
      'VALIDATE CONSTRAINT "account_sessions_reauthentication_time_check"',
      'Account Session reauthentication evidence cannot move backwards',
      'apply_identity_revocation',
      'SECURITY DEFINER',
      'IDENTITY_REVOCATION_CONTEXT_STALE',
      'IDENTITY_REVOCATION_TARGET_OUT_OF_SCOPE',
      "current_user <> 'openschool_identity_revoker'",
      "current_setting('app.reauthenticated_at', true)",
      "current_setting('app.policy_capability', true)",
      'CREATE POLICY "schools_identity_revoker_select"',
      "current_setting('app.assurance_level', true)",
      'openschool_invitation_scope_allows',
      'OWNER TO "openschool_identity_revoker"',
      'TO "openschool_runtime"',
    ]) {
      assert.equal(migration.includes(expected), true, `migration must include ${expected}`)
    }
    assert.equal(
      migration.includes('GRANT UPDATE ON TABLE public.accounts TO "openschool_runtime"'),
      false
    )
    assert.equal(
      migration.includes('GRANT UPDATE ON TABLE public.affiliations TO "openschool_runtime"'),
      false
    )
  })

  it('installs an isolated platform grant store and atomic Tenant lifecycle authority', () => {
    const migration = readFileSync(join(migrationsDirectory, '0023_cloudy_blue_shield.sql'), 'utf8')
    for (const expected of [
      'CREATE TABLE "platform_access_grants"',
      'platform_access_grants_no_active_overlap',
      'Platform Access Grant anchors are immutable',
      'resolve_tenant_admission_status',
      'resolve_platform_access',
      'apply_tenant_lifecycle',
      'SECURITY DEFINER',
      "session_user <> 'openschool_control_plane'",
      "current_user <> 'openschool_tenant_lifecycle_manager'",
      "current_setting('app.platform_access_grant_id', true)",
      "'security.context.invalidate'",
      'audit_events_platform_lifecycle_insert',
      'audit_outbox_platform_lifecycle_insert',
      "CHECK (\"actor_type\" IN ('account', 'worker', 'system', 'support', 'platform')) NOT VALID",
      'VALIDATE CONSTRAINT "audit_events_actor_type_check"',
      'VALIDATE CONSTRAINT "audit_events_source_check"',
      'VALIDATE CONSTRAINT "audit_events_account_actor_check"',
      'VALIDATE CONSTRAINT "audit_events_support_context_check"',
      'OWNER TO "openschool_platform_access_resolver"',
      'OWNER TO "openschool_tenant_admission_resolver"',
      'OWNER TO "openschool_tenant_lifecycle_manager"',
      'TO "openschool_control_plane"',
      'REVOKE ALL ON TABLE public.platform_access_grants',
      'TO "openschool_runtime", "openschool_worker"',
    ]) {
      assert.equal(migration.includes(expected), true, `migration must include ${expected}`)
    }
    assert.equal(
      migration.includes('GRANT SELECT ON TABLE public.tenants TO "openschool_control_plane"'),
      false
    )
    assert.equal(
      migration.includes('GRANT UPDATE ON TABLE public.tenants TO "openschool_control_plane"'),
      false
    )
  })

  it('installs durable provider MFA reconciliation without persisting provider subjects', () => {
    const migration = readFileSync(
      join(migrationsDirectory, '0024_perpetual_absorbing_man.sql'),
      'utf8'
    )
    for (const expected of [
      'CREATE TABLE "provider_security_reconciliation_outbox"',
      'provider_security_reconciliation_effect_unique',
      'FORCE ROW LEVEL SECURITY',
      'provider_security_reconciliation_change_guard',
      'apply_identity_revocation_with_reconciliation',
      'resolve_provider_mfa_reconciliation',
      'openschool_provider_security_resolver',
      'PROVIDER_SECURITY_RECONCILIATION_UNAVAILABLE',
      'REVOKE EXECUTE ON FUNCTION "openschool_private"."apply_identity_revocation"',
      'GRANT SELECT, UPDATE ON TABLE public.provider_security_reconciliation_outbox',
    ]) {
      assert.equal(migration.includes(expected), true, `migration must include ${expected}`)
    }

    const tableDefinition = migration.slice(
      migration.indexOf('CREATE TABLE "provider_security_reconciliation_outbox"'),
      migration.indexOf('ALTER TABLE "provider_security_reconciliation_outbox" ENABLE')
    )
    assert.equal(tableDefinition.includes('provider_subject'), false)
    assert.equal(tableDefinition.includes('identity_provider'), false)
    assert.equal(
      migration.includes(
        'ON CONFLICT (tenant_id, account_id, action, expected_security_version) DO NOTHING'
      ),
      false
    )
    const revokerPolicy = migration.slice(
      migration.indexOf('CREATE POLICY "provider_security_reconciliation_revoker_insert"'),
      migration.indexOf('CREATE POLICY "provider_security_reconciliation_worker_select"')
    )
    assert.equal(revokerPolicy.includes("session_user = 'openschool_runtime'"), true)
    assert.equal(revokerPolicy.includes("current_user = 'openschool_identity_revoker'"), true)
    assert.equal(revokerPolicy.includes('target_account.security_version'), false)
  })

  it('blocks new identity sessions until the latest provider MFA reset completes', () => {
    const migration = readFileSync(join(migrationsDirectory, '0025_fine_nemesis.sql'), 'utf8')
    for (const expected of [
      'provider_security_reconciliation_identity_resolver_select',
      'is_provider_security_ready',
      'PROVIDER_SECURITY_READINESS_CONTEXT_INVALID',
      "reconciliation.status = 'completed'",
      'ORDER BY reconciliation.expected_security_version DESC',
      'OWNER TO "openschool_provider_security_resolver"',
      'TO "openschool_runtime"',
    ]) {
      assert.equal(migration.includes(expected), true, `migration must include ${expected}`)
    }
  })

  it('installs Tenant-approved Support Access and isolated break-glass controls', () => {
    const migration = readFileSync(
      join(migrationsDirectory, '0026_tiresome_grey_gargoyle.sql'),
      'utf8'
    )
    for (const expected of [
      'CREATE TABLE "support_access_grants"',
      'CREATE TABLE "support_access_notifications"',
      'CREATE TABLE "support_notification_outbox"',
      'FORCE ROW LEVEL SECURITY',
      'support_access_grants_no_live_overlap',
      'Support Access Grant anchors are immutable',
      'issue_support_access_grant',
      'tenant_admin_can_view_support_notification',
      'resolve_support_access',
      'close_support_access',
      'revoke_support_access_grant',
      'expire_support_access_grant',
      'review_support_access_grant',
      'open_break_glass_access',
      "session_user <> 'openschool_runtime'",
      "session_user <> 'openschool_control_plane'",
      "session_user <> 'openschool_worker'",
      "current_setting('app.reauthenticated_at', true)",
      "current_setting('app.support_grant_id', true)",
      'SUPPORT_ACCESS_SESSION_REUSED',
      'support_access_notifications_worker_select',
      'accounts_support_manager_select',
      'account_sessions_support_resolver_select',
      'platform_access_grants_support_resolver_select',
      'schools_support_manager_select',
      'public.platform_access_grants, public.tenants',
      'app.target_support_account_id',
      'app.target_platform_access_grant_id',
      'OWNER TO "openschool_support_grant_manager"',
      'OWNER TO "openschool_support_access_resolver"',
      'public.support_access_grants, public.support_access_notifications',
    ]) {
      assert.equal(migration.includes(expected), true, `migration must include ${expected}`)
    }
    assert.equal(
      migration.includes('GRANT SELECT ON TABLE public.students TO "openschool_control_plane"'),
      false
    )
    assert.equal(
      migration.includes('GRANT SELECT ON TABLE public.students TO "openschool_worker"'),
      false
    )
    assert.equal(migration.includes('CHECK (("audit_events".'), false)
    assert.equal(migration.includes('CHECK ("platform_access_grants".'), false)
    assert.equal(migration.includes('SELECT account, account_session, platform_grant'), false)
    assert.equal(migration.includes('SELECT account, account_session, support_grant'), false)
  })
})
