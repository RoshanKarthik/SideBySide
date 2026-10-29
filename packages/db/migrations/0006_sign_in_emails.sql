CREATE TABLE "sign_in_emails" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email_hash" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sign_in_emails_hash_sent_idx" ON "sign_in_emails" USING btree ("email_hash","sent_at");--> statement-breakpoint
CREATE INDEX "sign_in_emails_sent_idx" ON "sign_in_emails" USING btree ("sent_at");