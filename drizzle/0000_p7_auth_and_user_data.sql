CREATE TYPE "public"."affordability_tier" AS ENUM('free', 'low', 'mid', 'high');--> statement-breakpoint
CREATE TYPE "public"."companion_mode" AS ENUM('ephemeral', 'encrypted', 'vault');--> statement-breakpoint
CREATE TYPE "public"."directness" AS ENUM('gentle', 'matter_of_fact');--> statement-breakpoint
CREATE TYPE "public"."draft_status" AS ENUM('script_draft', 'clinician_reviewed', 'rendered', 'editor_reviewed', 'scheduled', 'posted', 'failed', 'taken_down');--> statement-breakpoint
CREATE TYPE "public"."instrument" AS ENUM('fsfi', 'iief5', 'griss', 'fsds_r', 'nsss', 'phq9', 'gad7');--> statement-breakpoint
CREATE TYPE "public"."license" AS ENUM('cc_by', 'cc_by_sa', 'cc_by_nc', 'cc_by_nc_sa', 'cc_by_nc_nd', 'cc0', 'public_domain', 'govt_work', 'oa_pmc', 'copyrighted', 'original');--> statement-breakpoint
CREATE TYPE "public"."pace" AS ENUM('slow', 'normal');--> statement-breakpoint
CREATE TYPE "public"."path_item_kind" AS ENUM('read', 'watch', 'listen', 'reflect', 'worksheet', 'assessment');--> statement-breakpoint
CREATE TYPE "public"."resource_kind" AS ENUM('article', 'video', 'podcast_episode', 'book', 'guideline', 'worksheet');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('journal', 'clinical_body', 'university', 'health_authority', 'publisher', 'video_channel', 'podcast', 'ngo', 'government');--> statement-breakpoint
CREATE TYPE "public"."tag_category" AS ENUM('topic', 'difficulty', 'population', 'modality');--> statement-breakpoint
CREATE TYPE "public"."trust_tier" AS ENUM('tier_1', 'tier_2', 'tier_3');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'clinician', 'editor', 'admin');--> statement-breakpoint
CREATE TYPE "public"."variant_type" AS ENUM('plain_language', 'audio_tts', 'translated_hi', 'translated_hinglish', 'translated_ta', 'translated_bn');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounts" (
	"userId" uuid NOT NULL,
	"type" varchar(32) NOT NULL,
	"provider" varchar(64) NOT NULL,
	"providerAccountId" varchar(128) NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" varchar(32),
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assessment_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"instrument_id" varchar(64) NOT NULL,
	"raw_score" integer NOT NULL,
	"severity" varchar(32) NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"instrument" "instrument" NOT NULL,
	"responses_ciphertext" text NOT NULL,
	"responses_iv" text NOT NULL,
	"responses_auth_tag" text NOT NULL,
	"score" integer NOT NULL,
	"interpretation_key" varchar(64) NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_hash" varchar(64) NOT NULL,
	"action" varchar(64) NOT NULL,
	"meta" jsonb,
	"ts" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bookmarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" varchar(16) NOT NULL,
	"content" text NOT NULL,
	"citations" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"scoped_resource_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"ord" integer NOT NULL,
	"content" text NOT NULL,
	"tokens" integer NOT NULL,
	"page_num" integer,
	"timestamp_seconds" integer,
	"tsv" "tsvector",
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clinical_advisors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"credentials" jsonb NOT NULL,
	"bio" text,
	"photo_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clinician_directory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"credentials" jsonb NOT NULL,
	"city" varchar(96),
	"country" varchar(4) NOT NULL,
	"languages" jsonb NOT NULL,
	"modalities" jsonb NOT NULL,
	"tele_consult" boolean DEFAULT false NOT NULL,
	"affordability" "affordability_tier" DEFAULT 'mid' NOT NULL,
	"contact_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "companion_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" varchar(16) NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "companion_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"mode" "companion_mode" NOT NULL,
	"dek_wrapped" text,
	"kms_key_id" text,
	"language" varchar(12) DEFAULT 'en' NOT NULL,
	"pronouns" varchar(48),
	"pace" "pace" DEFAULT 'normal' NOT NULL,
	"directness" "directness" DEFAULT 'gentle' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"session_fingerprint" varchar(64),
	"purpose" varchar(64) NOT NULL,
	"purpose_version" integer NOT NULL,
	"granted" boolean NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"legal_basis_in" varchar(64) NOT NULL,
	"legal_basis_eu" varchar(64) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid,
	"kind" varchar(16) NOT NULL,
	"language" varchar(12) DEFAULT 'en' NOT NULL,
	"brief" text NOT NULL,
	"script_md" text,
	"voiceover_url" text,
	"video_url" text,
	"captions_srt" text,
	"status" "draft_status" DEFAULT 'script_draft' NOT NULL,
	"clinician_reviewer_id" uuid,
	"editor_reviewer_id" uuid,
	"scheduled_at" timestamp with time zone,
	"posted_at" timestamp with time zone,
	"platform_post_ids" jsonb,
	"takedown_events" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "couple_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_a_user_id" uuid NOT NULL,
	"partner_b_user_id" uuid NOT NULL,
	"consented_at_a" timestamp with time zone,
	"consented_at_b" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crisis_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "crisis_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"session_fingerprint" varchar(64) NOT NULL,
	"surface" varchar(16) NOT NULL,
	"category" varchar(32) NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "eval_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" varchar(64) NOT NULL,
	"prompt_set_version" varchar(32) NOT NULL,
	"refusal_rate_bp" integer NOT NULL,
	"citation_faithfulness_bp" integer NOT NULL,
	"empathy_score_x100" integer NOT NULL,
	"bias_flags" jsonb,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_paths" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(200) NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"target_audience" text,
	"est_minutes" integer DEFAULT 60 NOT NULL,
	"language" varchar(12) DEFAULT 'en' NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_paths_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "path_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"path_id" uuid NOT NULL,
	"ord" integer NOT NULL,
	"resource_id" uuid,
	"kind" "path_item_kind" NOT NULL,
	"optional" boolean DEFAULT false NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "path_progress" (
	"user_id" uuid NOT NULL,
	"path_id" uuid NOT NULL,
	"completed_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "path_progress_user_id_path_id_pk" PRIMARY KEY("user_id","path_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "post_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"platform" varchar(16) NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"saves" integer DEFAULT 0 NOT NULL,
	"link_clicks" integer DEFAULT 0 NOT NULL,
	"pulled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "private_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"body_ciphertext" text NOT NULL,
	"body_iv" text NOT NULL,
	"body_auth_tag" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "resource_tags" (
	"resource_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "resource_tags_resource_id_tag_id_pk" PRIMARY KEY("resource_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "resource_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"variant_type" "variant_type" NOT NULL,
	"content" text NOT NULL,
	"audio_blob_url" text,
	"reviewer_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(200) NOT NULL,
	"source_id" uuid NOT NULL,
	"kind" "resource_kind" NOT NULL,
	"title" text NOT NULL,
	"authors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"author_credentials" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"language" varchar(12) DEFAULT 'en' NOT NULL,
	"license" "license" NOT NULL,
	"full_text_available" boolean DEFAULT false NOT NULL,
	"external_url" text NOT NULL,
	"pdf_blob_url" text,
	"summary" text,
	"curator_notes" text,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resources_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"notes" text,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_review_due" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"sessionToken" varchar(256) PRIMARY KEY NOT NULL,
	"userId" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" varchar(16) NOT NULL,
	"handle" varchar(64) NOT NULL,
	"account_id" varchar(96) NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text,
	"scopes" jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(96) NOT NULL,
	"name" text NOT NULL,
	"kind" "source_kind" NOT NULL,
	"url" text NOT NULL,
	"trust_tier" "trust_tier" NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(96) NOT NULL,
	"category" "tag_category" NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_path_progress" (
	"user_id" uuid NOT NULL,
	"path_slug" varchar(64) NOT NULL,
	"step_index" integer NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_path_progress_user_id_path_slug_step_index_pk" PRIMARY KEY("user_id","path_slug","step_index")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_roles" (
	"user_id" uuid NOT NULL,
	"role" "user_role" NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by" uuid,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" varchar(320),
	"emailVerified" timestamp with time zone,
	"image" text,
	"region" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vault_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" varchar(80) NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"salt" text NOT NULL,
	"kdf_iterations" integer DEFAULT 310000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verificationTokens" (
	"identifier" varchar(320) NOT NULL,
	"token" varchar(256) NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verificationTokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_scoped_resource_id_resources_id_fk" FOREIGN KEY ("scoped_resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chunks" ADD CONSTRAINT "chunks_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "companion_messages" ADD CONSTRAINT "companion_messages_session_id_companion_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."companion_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_clinician_reviewer_id_clinical_advisors_id_fk" FOREIGN KEY ("clinician_reviewer_id") REFERENCES "public"."clinical_advisors"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "path_items" ADD CONSTRAINT "path_items_path_id_learning_paths_id_fk" FOREIGN KEY ("path_id") REFERENCES "public"."learning_paths"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "path_items" ADD CONSTRAINT "path_items_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "path_progress" ADD CONSTRAINT "path_progress_path_id_learning_paths_id_fk" FOREIGN KEY ("path_id") REFERENCES "public"."learning_paths"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "post_metrics" ADD CONSTRAINT "post_metrics_draft_id_content_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."content_drafts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "private_notes" ADD CONSTRAINT "private_notes_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resource_tags" ADD CONSTRAINT "resource_tags_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resource_tags" ADD CONSTRAINT "resource_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resource_variants" ADD CONSTRAINT "resource_variants_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resources" ADD CONSTRAINT "resources_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reviews" ADD CONSTRAINT "reviews_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_id_clinical_advisors_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."clinical_advisors"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_path_progress" ADD CONSTRAINT "user_path_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vault_entries" ADD CONSTRAINT "vault_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assessment_results_user_idx" ON "assessment_results" USING btree ("user_id","taken_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookmarks_user_idx" ON "bookmarks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chunks_resource_idx" ON "chunks" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clinicians_country_idx" ON "clinician_directory" USING btree ("country");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clinicians_city_idx" ON "clinician_directory" USING btree ("city");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companion_messages_session_idx" ON "companion_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companion_sessions_user_idx" ON "companion_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companion_sessions_expires_idx" ON "companion_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consents_user_idx" ON "consents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "path_items_path_idx" ON "path_items" USING btree ("path_id","ord");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "private_notes_user_resource_idx" ON "private_notes" USING btree ("user_id","resource_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resource_tags_tag_idx" ON "resource_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resources_source_idx" ON "resources" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resources_kind_idx" ON "resources" USING btree ("kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resources_published_idx" ON "resources" USING btree ("is_published");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviews_resource_idx" ON "reviews" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviews_due_idx" ON "reviews" USING btree ("next_review_due");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tags_name_category_idx" ON "tags" USING btree ("category","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vault_entries_user_idx" ON "vault_entries" USING btree ("user_id","created_at");