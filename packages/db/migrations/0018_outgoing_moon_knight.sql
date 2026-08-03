ALTER TABLE "invitation_delivery_outbox" DROP CONSTRAINT "invitation_delivery_encryption_check";--> statement-breakpoint
ALTER TABLE "invitation_delivery_outbox" ADD CONSTRAINT "invitation_delivery_encryption_check" CHECK ((
            "invitation_delivery_outbox"."status" IN ('pending', 'processing', 'failed')
            AND "invitation_delivery_outbox"."encryption_key_id" ~ '^[A-Za-z0-9_.-]{1,64}$'
            AND "invitation_delivery_outbox"."token_ciphertext" ~ '^[A-Za-z0-9_-]+$'
            AND char_length("invitation_delivery_outbox"."token_ciphertext") BETWEEN 16 AND 1024
            AND "invitation_delivery_outbox"."token_iv" ~ '^[A-Za-z0-9_-]{16}$'
            AND "invitation_delivery_outbox"."token_auth_tag" ~ '^[A-Za-z0-9_-]{22}$'
          ) OR (
            "invitation_delivery_outbox"."status" IN ('delivered', 'dead_letter')
            AND "invitation_delivery_outbox"."encryption_key_id" IS NULL
            AND "invitation_delivery_outbox"."token_ciphertext" IS NULL
            AND "invitation_delivery_outbox"."token_iv" IS NULL
            AND "invitation_delivery_outbox"."token_auth_tag" IS NULL
          ));