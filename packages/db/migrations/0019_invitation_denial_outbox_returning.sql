CREATE POLICY "audit_outbox_invitation_denial_select" ON "audit_outbox" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (
        "audit_outbox"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND "audit_outbox"."context" ->> 'requestId' = nullif(current_setting('app.request_id', true), '')
        AND "audit_outbox"."context" ->> 'actorAccountId' IS NULL
        AND "audit_outbox"."context" ->> 'actorPersonId' IS NULL
        AND "audit_outbox"."topic" = 'audit.event.committed'
        AND "audit_outbox"."payload" ->> 'eventType' = 'account.invitation.accept'
        AND "audit_outbox"."payload" ->> 'outcome' = 'denied'
        AND "audit_outbox"."payload" ->> 'targetType' = 'account.invitation'
        AND nullif("audit_outbox"."payload" ->> 'targetId', '') IS NOT NULL
        AND "audit_outbox"."deduplication_key" =
          'account.invitation.accept.denied:' || ("audit_outbox"."payload" ->> 'targetId') || ':' ||
          nullif(current_setting('app.request_id', true), '')
      );