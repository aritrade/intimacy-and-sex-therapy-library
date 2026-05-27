CREATE TYPE "public"."feedback_category" AS ENUM('improvement', 'praise', 'bug', 'other');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "channel_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" varchar(16) NOT NULL,
	"account_id" varchar(96) NOT NULL,
	"handle" varchar(64),
	"followers" integer DEFAULT 0 NOT NULL,
	"posts" integer DEFAULT 0 NOT NULL,
	"total_views" bigint DEFAULT 0 NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb,
	"pulled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"message" text NOT NULL,
	"category" "feedback_category" DEFAULT 'other' NOT NULL,
	"locale" varchar(8),
	"ip_hash" varchar(32),
	"source_path" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_metrics_platform_time_idx" ON "channel_metrics" USING btree ("platform","pulled_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_feedback_created_at_idx" ON "user_feedback" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_feedback_category_idx" ON "user_feedback" USING btree ("category","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_feedback_email_idx" ON "user_feedback" USING btree ("email");