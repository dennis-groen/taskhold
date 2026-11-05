CREATE TABLE "shopping_purchase" (
	"id" text PRIMARY KEY,
	"household_id" text NOT NULL,
	"name" text NOT NULL,
	"bought_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "shopping_purchase_household_bought_idx" ON "shopping_purchase" ("household_id","bought_at");--> statement-breakpoint
ALTER TABLE "shopping_purchase" ADD CONSTRAINT "shopping_purchase_household_id_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "household"("id") ON DELETE CASCADE;