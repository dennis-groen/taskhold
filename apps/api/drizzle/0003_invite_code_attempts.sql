CREATE TABLE "invite_code_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"attempted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invite_code_attempt" ADD CONSTRAINT "invite_code_attempt_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invite_code_attempt_userId_attemptedAt_idx" ON "invite_code_attempt" USING btree ("user_id","attempted_at");