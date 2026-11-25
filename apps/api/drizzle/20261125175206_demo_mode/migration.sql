ALTER TABLE "user" ADD COLUMN "is_anonymous" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "household" ADD COLUMN "demo" boolean DEFAULT false NOT NULL;