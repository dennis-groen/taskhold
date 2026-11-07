ALTER TABLE "invite_code_attempt" DROP CONSTRAINT "invite_code_attempt_user_id_user_id_fk";--> statement-breakpoint
DROP INDEX "invite_code_attempt_userId_attemptedAt_idx";--> statement-breakpoint
ALTER TABLE "invite_code_attempt" DROP COLUMN "user_id";