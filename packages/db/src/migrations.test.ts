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
      'GRANT INSERT ON "school_enrollment_transition_events"',
      'GRANT UPDATE ("school_id", "status", "updated_at")',
    ]) {
      assert.equal(migration.includes(expected), true, `migration must include ${expected}`)
    }
  })

  it('hardens lifecycle references, event shapes, and hierarchy evidence', () => {
    const migration = readFileSync(
      join(migrationsDirectory, '0031_curved_rumiko_fujikawa.sql'),
      'utf8'
    )
    for (const expected of [
      'school_enrollments_transition_reference_unique',
      'school_enrollment_transition_events_tenant_from_fk',
      'school_enrollment_transition_events_tenant_to_fk',
      'school_enrollment_transition_events_shape_check',
      'school_enrollments_native_tree_version_check',
      'openschool_private"."assign_school_enrollment_tree_version',
      'school_enrollments_assign_tree_version',
      "= 'tenant.student_enrollments.manage'",
      'SCHOOL_ENROLLMENT_TREE_CONTEXT_STALE',
    ]) {
      assert.equal(migration.includes(expected), true, `migration must include ${expected}`)
    }
  })

  it('allows student capabilities to resolve schools for canonical learner reads', () => {
    const migration = readFileSync(join(migrationsDirectory, '0032_flaky_speedball.sql'), 'utf8')
    for (const expected of [
      'ALTER POLICY "schools_runtime_select"',
      "'tenant.students.create', 'tenant.students.read'",
      "'tenant.students.update', 'tenant.students.delete'",
      'public.openschool_school_scope_allows',
    ]) {
      assert.equal(migration.includes(expected), true, `migration must include ${expected}`)
    }
  })

  it('installs explicit guardian contact facts behind forced RLS and guarded functions', () => {
    const migration = readFileSync(join(migrationsDirectory, '0033_volatile_wraith.sql'), 'utf8')
    for (const expected of [
      'CREATE TABLE "contact_profiles"',
      'ALTER TABLE "person_relationships" FORCE ROW LEVEL SECURITY',
      'ALTER TABLE "contact_profiles" FORCE ROW LEVEL SECURITY',
      'person_relationships_portal_eligibility_check',
      'person_relationships_one_active_contact_per_learner_idx',
      "relationship.type IN ('parent_of', 'guardian_of', 'emergency_contact_of')",
      'openschool_guardian_contact_manage_scope_allows',
      'openschool_private"."create_guardian_contact',
      'openschool_private"."update_guardian_contact',
      'openschool_private"."end_guardian_contact',
      'OWNER TO "openschool_guardian_contact_manager"',
      'GRANT SELECT ("id", "membership_version") ON "accounts"',
      'membership_version = account.membership_version + 1',
      'GUARDIAN_CONTACT_STALE',
      'Execution roles must not assume the Guardian contact manager',
    ]) {
      assert.equal(migration.includes(expected), true, `migration must include ${expected}`)
    }
  })

  it('installs effective households, residences, and narrow authority roles', () => {
    const migration = readFileSync(
      join(migrationsDirectory, '0034_futuristic_rafael_vega.sql'),
      'utf8'
    )
    for (const expected of [
      'CREATE TABLE "households"',
      'CREATE TABLE "household_addresses"',
      'CREATE TABLE "household_memberships"',
      'household_memberships_no_effective_overlap',
      'household_memberships_primary_residence_no_overlap',
      'household_memberships_primary_mailing_no_overlap',
      'household_addresses_primary_type_no_overlap',
      'ALTER TABLE "households" FORCE ROW LEVEL SECURITY',
      "'tenant.households.read', 'tenant.households.manage'",
      'openschool_household_person_manage_scope_allows',
      'openschool_private"."create_household',
      'openschool_private"."add_household_member',
      'openschool_private"."revise_household_member',
      'openschool_private"."end_household_member',
      'openschool_private"."add_household_address',
      'openschool_private"."revise_household_address',
      'OWNER TO "openschool_household_scope_resolver"',
      '"openschool_canonical_student_scope_allows"(uuid, uuid, uuid)',
      '"openschool_guardian_contact_manage_scope_allows"(uuid, uuid)',
      '"student_profiles", "enrollments", "affiliations"',
      '"organization_tree_closure", "organization_tree_versions"',
      'OWNER TO "openschool_household_manager"',
      'Execution roles must not assume Household authority roles',
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

  it('installs canonical Sections behind scoped reads and guarded manager functions', () => {
    const foundation = readFileSync(join(migrationsDirectory, '0035_curvy_snowbird.sql'), 'utf8')
    const manager = readFileSync(join(migrationsDirectory, '0037_unusual_robin_chapel.sql'), 'utf8')
    const roleProvisioning = readFileSync(
      join(currentDirectory, 'provision-database-roles.ts'),
      'utf8'
    )
    for (const expected of [
      'CREATE TABLE "courses"',
      'CREATE TABLE "sections"',
      'CREATE TABLE "section_staff_assignments"',
      'CREATE TABLE "section_roster_memberships"',
      'CREATE TABLE "section_compatibility_evidence"',
      'section_staff_no_effective_overlap',
      'section_rosters_no_effective_overlap',
      'openschool_section_roster_scope_allows',
      'Legacy Class Academic Year is a label without authoritative dates',
      'FORCE ROW LEVEL SECURITY',
    ]) {
      assert.equal(foundation.includes(expected), true, `foundation must include ${expected}`)
    }
    for (const expected of [
      'openschool_private"."create_course',
      'openschool_private"."create_section',
      'openschool_private"."assign_section_staff',
      'openschool_private"."add_section_roster_member',
      'openschool_private"."end_section_staff_assignment',
      'openschool_private"."end_section_roster_membership',
      'openschool_private"."close_section',
      "current_setting('app.assurance_level', true), '') <> 'aal2'",
      'OWNER TO "openschool_section_manager"',
      'GRANT EXECUTE ON FUNCTION public.openschool_policy_constraints()',
      'public.openschool_school_scope_allows(uuid, uuid)',
      '"school_governance_assignments", "organization_tree_closure", "organization_tree_versions"',
      'COALESCE(p_valid_until, (v_section.end_date + 1)::timestamp)',
      'assignment.valid_until IS NULL OR p_valid_until <= assignment.valid_until',
      'membership.valid_until IS NULL OR p_valid_until <= membership.valid_until',
      'Execution roles must not assume the Section manager',
      'REVOKE INSERT, UPDATE, DELETE ON TABLE "courses"',
    ]) {
      assert.equal(manager.includes(expected), true, `manager migration must include ${expected}`)
    }
    assert.equal(manager.includes('GRANT INSERT ON TABLE "courses" TO "openschool_runtime"'), false)
    assert.equal(
      manager.includes('GRANT UPDATE ON TABLE "sections" TO "openschool_runtime"'),
      false
    )
    assert.equal(manager.includes('GRANT DELETE ON TABLE "section_roster_memberships"'), false)
    for (const table of [
      'courses',
      'sections',
      'section_staff_assignments',
      'section_roster_memberships',
      'section_compatibility_evidence',
    ]) {
      assert.equal(
        roleProvisioning.includes(table),
        true,
        `runtime role provisioning must include ${table}`
      )
    }
  })

  it('installs versioned duplicate review without an automatic merge path', () => {
    const foundation = readFileSync(
      join(migrationsDirectory, '0038_duplicate_review_foundation.sql'),
      'utf8'
    )
    const workflow = readFileSync(
      join(migrationsDirectory, '0039_duplicate_review_workflow.sql'),
      'utf8'
    )
    const roleProvisioning = readFileSync(
      join(currentDirectory, 'provision-database-roles.ts'),
      'utf8'
    )
    for (const expected of [
      'CREATE TABLE "person_duplicate_cases"',
      'CREATE TABLE "person_duplicate_case_events"',
      'person_duplicate_cases_school_pair_unique',
      'person_duplicate_cases_pair_order_check',
      'person_duplicate_case_events_case_version_unique',
      'person_duplicate_case_events_manager_insert',
    ]) {
      assert.equal(foundation.includes(expected), true, `foundation must include ${expected}`)
    }
    for (const expected of [
      'FORCE ROW LEVEL SECURITY',
      'person_duplicate_case_events_append_only',
      'person_duplicate_case_events_validate_school',
      'openschool_private"."refresh_person_duplicate_candidates',
      'openschool_private"."review_person_duplicate_case',
      "p_action NOT IN ('mark_distinct', 'request_merge_approval')",
      "v_case.status = 'merge_approval_requested'",
      'v_case.current_evidence_hash IS DISTINCT FROM v_candidate.evidence_hash',
      'person_relationships_duplicate_manager_select',
      "'tenant.people_duplicates.read', 'tenant.people_duplicates.review'",
      "SET status = 'superseded'",
      "'evidence_no_longer_matches'",
      'SET search_path = pg_catalog, extensions, public',
      'jsonb_array_length(scored.signals) >= 2',
      'cardinality(v_seen_case_ids) < 20',
      "v_case.status <> 'open'",
      'LEAST(100',
      'Execution roles must not assume the duplicate review manager',
    ]) {
      assert.equal(workflow.includes(expected), true, `workflow must include ${expected}`)
    }
    assert.equal(
      /'merge'(?!_approval)/.test(workflow),
      false,
      'workflow must not accept a merge action'
    )
    for (const expected of [
      'openschool_duplicate_review_manager',
      'person_duplicate_cases, person_duplicate_case_events',
    ]) {
      assert.equal(
        roleProvisioning.includes(expected),
        true,
        `role provisioning must include ${expected}`
      )
    }
  })

  it('installs an immutable person merge preview and approval foundation', () => {
    const migration = readFileSync(join(migrationsDirectory, '0040_violet_omega_red.sql'), 'utf8')
    const roleProvisioning = readFileSync(
      join(currentDirectory, 'provision-database-roles.ts'),
      'utf8'
    )

    for (const expected of [
      'CREATE TABLE "person_merge_operations"',
      'CREATE TABLE "person_merge_preview_items"',
      'CREATE TABLE "person_merge_events"',
      'person_merge_operations_active_source_unique',
      'person_merge_preview_items_operation_record_unique',
      'person_merge_events_operation_version_unique',
      'ALTER TABLE "person_merge_operations" FORCE ROW LEVEL SECURITY',
      'ALTER TABLE "person_merge_preview_items" FORCE ROW LEVEL SECURITY',
      'ALTER TABLE "person_merge_events" FORCE ROW LEVEL SECURITY',
      'person_merge_preview_items_append_only',
      'person_merge_events_append_only',
      'person_merge_operations_anchors_immutable',
      'openschool_person_merge_manager must remain a constrained NOLOGIN role',
      'execution roles must not inherit person merge manager',
    ]) {
      assert.equal(migration.includes(expected), true, `migration must include ${expected}`)
    }
    for (const expected of [
      'openschool_person_merge_manager',
      'person_merge_operations, person_merge_preview_items, person_merge_events',
    ]) {
      assert.equal(
        roleProvisioning.includes(expected),
        true,
        `role provisioning must include ${expected}`
      )
    }
    assert.equal(
      migration.includes('execute_person_merge'),
      false,
      'foundation must not expose a merge execution path'
    )
  })

  it('builds locked person merge previews and fails closed on new references', () => {
    const workflow = readFileSync(
      join(migrationsDirectory, '0041_person_merge_preview_workflow.sql'),
      'utf8'
    )
    for (const expected of [
      'openschool_private"."create_person_merge_preview',
      'people_person_merge_manager_select',
      'GRANT EXECUTE ON FUNCTION "openschool_policy_constraints"()',
      '"school_governance_assignments", "organization_tree_closure", "organization_tree_versions"',
      'school_governance_person_merge_manager_select',
      'GRANT UPDATE ON TABLE "people", "person_duplicate_cases"',
      'people_person_merge_manager_lock',
      'person_duplicate_cases_person_merge_manager_lock',
      "<> 'tenant.people_merges.preview'",
      "<> 'aal2'",
      "interval '15 minutes'",
      'pg_advisory_xact_lock',
      'ORDER BY person.id',
      'FOR UPDATE',
      "v_case.status <> 'merge_approval_requested'",
      "constraint_row.confrelid = 'public.people'::regclass",
      'WHERE inheritance.inhrelid = child.oid',
      "'kind', 'person_anchor'",
      "item.metadata->>'kind' = 'person_anchor'",
      'PERSON_MERGE_PERSON_CHANGED',
      "THEN 'UNREVIEWED_PERSON_REFERENCE'",
      "'TARGET_PROFILE_EXISTS'",
      "'SELF_RELATIONSHIP'",
      "WHEN v_conflict_count = 0 THEN 'pending_approval' ELSE 'blocked'",
      'SET search_path = pg_catalog, extensions, public',
      'OWNER TO "openschool_person_merge_manager"',
      'GRANT EXECUTE ON FUNCTION',
      'openschool_private"."approve_person_merge_preview',
      'PERSON_MERGE_DISTINCT_APPROVER_REQUIRED',
      'PERSON_MERGE_DEPENDENCY_SET_CHANGED',
      'PERSON_MERGE_TARGET_CONFLICT_CHANGED',
      "'approval_granted', 'approved'",
    ]) {
      assert.equal(workflow.includes(expected), true, `preview workflow must include ${expected}`)
    }
    assert.equal(
      workflow.includes('execute_person_merge'),
      false,
      'preview workflow must not expose merge execution'
    )
    assert.equal(
      workflow.includes('v_operation.initiated_by_account_id = v_account_id'),
      true,
      'approval must reject the initiating Account'
    )
  })

  it('installs a forced-RLS Person merge alias and immutable move ledger', () => {
    const migration = readFileSync(join(migrationsDirectory, '0042_brave_maelstrom.sql'), 'utf8')
    for (const expected of [
      'CREATE TABLE "person_merge_aliases"',
      'CREATE TABLE "person_merge_moves"',
      '"plan_version" integer DEFAULT 1 NOT NULL',
      '"execution_digest" text',
      'person_merge_aliases_tenant_source_unique',
      'person_merge_moves_operation_sequence_unique',
      'ALTER TABLE "person_merge_aliases" FORCE ROW LEVEL SECURITY',
      'ALTER TABLE "person_merge_moves" FORCE ROW LEVEL SECURITY',
      'person_merge_moves_append_only',
      'people_merged_alias_immutable',
      'CREATE FUNCTION "openschool_private"."protect_merged_person_alias"()\nRETURNS trigger\nLANGUAGE plpgsql\nSECURITY DEFINER',
      'OLD.plan_version IS DISTINCT FROM NEW.plan_version',
      "'tenant.people_merges.execute'",
    ]) {
      assert.equal(migration.includes(expected), true, `execution ledger must include ${expected}`)
    }
  })

  it('finalizes dependency-complete Person merge plan version 2', () => {
    const migration = readFileSync(
      join(migrationsDirectory, '0043_person_merge_plan_v2.sql'),
      'utf8'
    )
    for (const expected of [
      'create_person_merge_preview_v1',
      'finalize_person_merge_preview_v2',
      "'kind', 'derived_dependency'",
      "'path', 'affiliation_role'",
      "'path', 'account_invalidation'",
      "'path', 'account_session'",
      "'path', 'legacy_enrollment_grade'",
      'TARGET_ACCOUNT_LINK_EXISTS',
      'TARGET_AFFILIATION_EXISTS',
      'TARGET_HOUSEHOLD_MEMBERSHIP_EXISTS',
      'TARGET_RELATIONSHIP_EXISTS',
      'TARGET_SCHOOL_ENROLLMENT_EXISTS',
      'TARGET_SECTION_STAFF_EXISTS',
      'TARGET_SECTION_ROSTER_EXISTS',
      "'plan:2:'",
      'assert_person_merge_plan_v2_current',
      'approve_person_merge_preview_v1',
      'PERSON_MERGE_DERIVED_DEPENDENCY_SET_CHANGED',
      'Person merge plan v2 implementation helpers are exposed',
    ]) {
      assert.equal(migration.includes(expected), true, `plan v2 must include ${expected}`)
    }
  })
})
