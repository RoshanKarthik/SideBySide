CREATE TYPE "public"."language" AS ENUM('python', 'javascript', 'typescript', 'java', 'cpp', 'c', 'go');--> statement-breakpoint
CREATE TYPE "public"."room_mode" AS ENUM('interview', 'practice');--> statement-breakpoint
CREATE TYPE "public"."room_role" AS ENUM('owner', 'interviewer', 'candidate', 'peer');--> statement-breakpoint
CREATE TYPE "public"."room_status" AS ENUM('scheduled', 'live', 'ended');--> statement-breakpoint
CREATE TYPE "public"."run_kind" AS ENUM('run', 'tests');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('ok', 'error', 'timeout', 'unsupported');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('all', 'interviewers');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "code_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"participant_id" uuid,
	"language" "language" NOT NULL,
	"source_code" text NOT NULL,
	"stdin" text DEFAULT '' NOT NULL,
	"kind" "run_kind" DEFAULT 'run' NOT NULL,
	"question_id" uuid,
	"status" "run_status" NOT NULL,
	"stdout" text DEFAULT '' NOT NULL,
	"stderr" text DEFAULT '' NOT NULL,
	"compile_output" text,
	"exit_code" integer,
	"time_ms" integer,
	"memory_kb" integer,
	"tests_passed" integer,
	"tests_total" integer,
	"details" jsonb,
	"server_ts" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"room_id" uuid NOT NULL,
	"round_number" integer DEFAULT 1 NOT NULL,
	"participant_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"visibility" "visibility" DEFAULT 'all' NOT NULL,
	"server_ts" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"user_id" uuid,
	"display_name" text NOT NULL,
	"role" "room_role" NOT NULL,
	"consent_accepted_at" timestamp with time zone,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"claim_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"mode" "room_mode" DEFAULT 'interview' NOT NULL,
	"title" text NOT NULL,
	"status" "room_status" DEFAULT 'scheduled' NOT NULL,
	"default_language" "language" DEFAULT 'python' NOT NULL,
	"share_replay_with_candidate" boolean DEFAULT false NOT NULL,
	"share_report_with_candidate" boolean DEFAULT false NOT NULL,
	"retention_days" integer DEFAULT 30 NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"delete_after" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "session_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"round_number" integer NOT NULL,
	"interviewer_participant_id" uuid,
	"candidate_participant_id" uuid,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"default_language" "language" DEFAULT 'python' NOT NULL,
	"low_bandwidth" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_runs" ADD CONSTRAINT "code_runs_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_runs" ADD CONSTRAINT "code_runs_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_rounds" ADD CONSTRAINT "session_rounds_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_rounds" ADD CONSTRAINT "session_rounds_interviewer_participant_id_participants_id_fk" FOREIGN KEY ("interviewer_participant_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_rounds" ADD CONSTRAINT "session_rounds_candidate_participant_id_participants_id_fk" FOREIGN KEY ("candidate_participant_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "code_runs_room_ts_idx" ON "code_runs" USING btree ("room_id","server_ts");--> statement-breakpoint
CREATE INDEX "events_room_ts_idx" ON "events" USING btree ("room_id","server_ts");--> statement-breakpoint
CREATE INDEX "participants_room_idx" ON "participants" USING btree ("room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participants_room_user_idx" ON "participants" USING btree ("room_id","user_id") WHERE "participants"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "rooms_owner_idx" ON "rooms" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "rooms_delete_after_idx" ON "rooms" USING btree ("delete_after");--> statement-breakpoint
CREATE UNIQUE INDEX "session_rounds_room_round_idx" ON "session_rounds" USING btree ("room_id","round_number");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");