CREATE TRIGGER "account_sessions_identity_anchors_immutable"
  BEFORE UPDATE ON "account_sessions"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_identity_anchor_change"(
    'account_id', 'provider_session_id', 'security_version', 'authenticated_at'
  );
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "openschool_guard_account_session_transition"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" IN ('revoked', 'expired') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'inactive Account Session records are immutable';
  END IF;

  IF OLD."status" = 'active' AND NEW."status" = 'revoked' AND (
    NEW."revoked_at" IS NULL OR
    NEW."revocation_reason" IS NULL OR
    btrim(NEW."revocation_reason") = ''
  ) THEN
    RAISE EXCEPTION 'revoked Account Sessions require timestamped, non-empty evidence';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER "account_sessions_state_transition_guard"
  BEFORE UPDATE ON "account_sessions"
  FOR EACH ROW EXECUTE FUNCTION "openschool_guard_account_session_transition"();
