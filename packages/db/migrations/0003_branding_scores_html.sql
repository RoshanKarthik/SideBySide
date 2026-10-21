ALTER TYPE "public"."language" ADD VALUE 'html';--> statement-breakpoint
ALTER TABLE "code_runs" ADD COLUMN "score" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "company_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "brand_logo" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "brand_color" text;