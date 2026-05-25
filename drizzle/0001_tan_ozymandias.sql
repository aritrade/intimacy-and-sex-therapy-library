CREATE TYPE "public"."proposal_kind" AS ENUM('fix_url', 'needs_refresh', 'new_resource', 'remove_resource', 'metadata_drift');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('open', 'approved', 'rejected', 'applied', 'errored');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "resource_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "proposal_kind" NOT NULL,
	"proposed_by" varchar(96) NOT NULL,
	"resource_id" uuid,
	"payload" jsonb NOT NULL,
	"summary" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb,
	"confidence" integer DEFAULT 50 NOT NULL,
	"status" "proposal_status" DEFAULT 'open' NOT NULL,
	"decided_by" varchar(96),
	"decided_at" timestamp with time zone,
	"decision_notes" text,
	"applied_result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- NOTE: `content_drafts.reviewer_notes` is added by the hand-written
-- `drizzle/0002_reviewer_notes.sql` migration; we skip it here so we
-- don't double-apply the column.
DO $$ BEGIN
 ALTER TABLE "resource_proposals" ADD CONSTRAINT "resource_proposals_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resource_proposals_status_idx" ON "resource_proposals" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resource_proposals_kind_idx" ON "resource_proposals" USING btree ("kind","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resource_proposals_resource_idx" ON "resource_proposals" USING btree ("resource_id");