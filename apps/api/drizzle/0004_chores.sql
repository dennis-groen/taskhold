CREATE TYPE "public"."chore_repeat_unit" AS ENUM('day', 'week');--> statement-breakpoint
CREATE TABLE "chore" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"name" text NOT NULL,
	"repeat_every" integer,
	"repeat_unit" "chore_repeat_unit",
	"due_on" date,
	"assignee_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chore_repeat_check" CHECK (("chore"."repeat_every" is null and "chore"."repeat_unit" is null) or ("chore"."repeat_every" > 0 and "chore"."repeat_unit" is not null and "chore"."due_on" is not null))
);
--> statement-breakpoint
CREATE TABLE "chore_completion" (
	"id" text PRIMARY KEY NOT NULL,
	"chore_id" text NOT NULL,
	"completed_by_id" text,
	"completed_on" date NOT NULL,
	"previous_due_on" date,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chore" ADD CONSTRAINT "chore_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chore" ADD CONSTRAINT "chore_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chore_completion" ADD CONSTRAINT "chore_completion_chore_id_chore_id_fk" FOREIGN KEY ("chore_id") REFERENCES "public"."chore"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chore_completion" ADD CONSTRAINT "chore_completion_completed_by_id_user_id_fk" FOREIGN KEY ("completed_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chore_householdId_idx" ON "chore" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "chore_completion_choreId_createdAt_idx" ON "chore_completion" USING btree ("chore_id","created_at");