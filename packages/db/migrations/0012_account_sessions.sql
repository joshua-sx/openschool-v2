CREATE TABLE "account_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"provider_session_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"assurance_level" text NOT NULL,
	"security_version" bigint NOT NULL,
	"authenticated_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_account_id" uuid,
	"revocation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_sessions_provider_session_id_unique" UNIQUE("provider_session_id"),
	CONSTRAINT "account_sessions_status_check" CHECK ("account_sessions"."status" IN ('active', 'revoked', 'expired')),
	CONSTRAINT "account_sessions_assurance_level_check" CHECK ("account_sessions"."assurance_level" IN ('aal1', 'aal2')),
	CONSTRAINT "account_sessions_security_version_positive" CHECK ("account_sessions"."security_version" > 0),
	CONSTRAINT "account_sessions_time_order_check" CHECK ("account_sessions"."expires_at" > "account_sessions"."authenticated_at"),
	CONSTRAINT "account_sessions_revocation_evidence_check" CHECK ("account_sessions"."status" <> 'revoked' OR ("account_sessions"."revoked_at" IS NOT NULL AND "account_sessions"."revocation_reason" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "account_sessions" ADD CONSTRAINT "account_sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "account_sessions" ADD CONSTRAINT "account_sessions_revoked_by_account_id_accounts_id_fk" FOREIGN KEY ("revoked_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "account_sessions_account_status_idx" ON "account_sessions" USING btree ("account_id","status","expires_at","id");