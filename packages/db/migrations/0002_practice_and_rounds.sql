CREATE TABLE "practice_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"problem_solving" integer NOT NULL,
	"communication" integer NOT NULL,
	"interviewing" integer NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "current_round" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "practice_ratings" ADD CONSTRAINT "practice_ratings_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_ratings" ADD CONSTRAINT "practice_ratings_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_ratings" ADD CONSTRAINT "practice_ratings_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "practice_ratings_room_from_idx" ON "practice_ratings" USING btree ("room_id","from_user_id");--> statement-breakpoint
CREATE INDEX "practice_ratings_to_idx" ON "practice_ratings" USING btree ("to_user_id");