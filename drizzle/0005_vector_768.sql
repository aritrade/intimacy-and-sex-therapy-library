-- Hand-written migration: ensure chunk embeddings use the Gemini
-- gemini-embedding-001 768-dim vector type (see lib/ai/embeddings.ts).
--
-- IMPORTANT: this file is re-applied on every `db:migrate` run, so it MUST be
-- non-destructive. An earlier version unconditionally DROPped + re-added the
-- `embedding` column, which silently wiped every stored vector whenever
-- migrations were re-run against a populated database. It now only *adds* the
-- column when missing and never drops populated data.
--
-- The historical 1536-dim -> 768-dim conversion was a one-time change applied
-- when the table was empty; fresh databases get vector(768) directly from the
-- drizzle-kit generated migration, so there is nothing to convert here.

DO $$
DECLARE
  has_col boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'chunks' AND column_name = 'embedding'
  ) INTO has_col;

  IF NOT has_col THEN
    ALTER TABLE chunks ADD COLUMN embedding vector(768);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx
  ON chunks USING hnsw (embedding vector_cosine_ops);
