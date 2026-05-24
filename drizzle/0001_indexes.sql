-- Hand-written index migration for things drizzle-kit doesn't model well yet.
-- Run AFTER drizzle-kit's generated migrations.

-- pgvector extension. Safe to run repeatedly.
CREATE EXTENSION IF NOT EXISTS vector;

-- pg_trgm for fuzzy search on titles / authors / glossary terms. Required
-- by /api/health and the preflight script; future-proofs synonym + Hinglish
-- typo tolerance even before any column index is added.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- HNSW vector index for cosine similarity.
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx
  ON chunks USING hnsw (embedding vector_cosine_ops);

-- BM25 over chunk text.
CREATE INDEX IF NOT EXISTS chunks_tsv_gin_idx
  ON chunks USING GIN (tsv);

-- Trigger to keep tsv in sync with content.
CREATE OR REPLACE FUNCTION chunks_tsv_trigger() RETURNS trigger AS $$
BEGIN
  NEW.tsv := to_tsvector('english', coalesce(NEW.content, ''));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chunks_tsv_update ON chunks;
CREATE TRIGGER chunks_tsv_update
  BEFORE INSERT OR UPDATE OF content ON chunks
  FOR EACH ROW EXECUTE FUNCTION chunks_tsv_trigger();
