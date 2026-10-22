CREATE TYPE "public"."report_kind" AS ENUM('interviewer', 'candidate');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "session_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"round_number" integer DEFAULT 1 NOT NULL,
	"kind" "report_kind" NOT NULL,
	"status" "report_status" DEFAULT 'pending' NOT NULL,
	"content" jsonb,
	"error" text,
	"model" text,
	"generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_reports" ADD CONSTRAINT "session_reports_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "session_reports_room_round_kind_idx" ON "session_reports" USING btree ("room_id","round_number","kind");