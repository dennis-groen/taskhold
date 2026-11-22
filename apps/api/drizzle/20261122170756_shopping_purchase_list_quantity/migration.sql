ALTER TABLE "shopping_purchase" ADD COLUMN "list_id" text;--> statement-breakpoint
ALTER TABLE "shopping_purchase" ADD COLUMN "quantity" text;--> statement-breakpoint
ALTER TABLE "shopping_purchase" ADD CONSTRAINT "shopping_purchase_list_id_shopping_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "shopping_list"("id") ON DELETE SET NULL;