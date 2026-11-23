CREATE TABLE "shopping_trip" (
	"id" text PRIMARY KEY,
	"household_id" text NOT NULL,
	"list_id" text NOT NULL,
	"shopper_id" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"notified" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX "shopping_trip_listId_startedAt_idx" ON "shopping_trip" ("list_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shopping_trip_one_running_per_list" ON "shopping_trip" ("list_id") WHERE "ended_at" is null;--> statement-breakpoint
ALTER TABLE "shopping_trip" ADD CONSTRAINT "shopping_trip_household_id_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "household"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "shopping_trip" ADD CONSTRAINT "shopping_trip_list_id_shopping_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "shopping_list"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "shopping_trip" ADD CONSTRAINT "shopping_trip_shopper_id_user_id_fkey" FOREIGN KEY ("shopper_id") REFERENCES "user"("id") ON DELETE CASCADE;