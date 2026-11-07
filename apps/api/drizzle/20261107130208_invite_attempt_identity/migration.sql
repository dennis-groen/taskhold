ALTER TABLE "invite_code_attempt" ADD COLUMN "identity" text;--> statement-breakpoint
CREATE INDEX "invite_code_attempt_identity_attemptedAt_idx" ON "invite_code_attempt" ("identity","attempted_at");