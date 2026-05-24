# Ingest manifests

Drop JSON files here that the ingest CLI can load with
`npm run ingest -- --from-file=manifests/<name>.json`.

Each manifest must be a JSON array of objects matching the
`IngestRecord` shape from `lib/ingest/pipeline.ts`:

```json
[
  {
    "sourceSlug": "pmc-oa",
    "title": "Mindfulness for sexual desire",
    "authors": ["Brotto, Lori A."],
    "authorCredentials": ["PhD, UBC"],
    "publishedAt": "2018-06-01",
    "language": "en",
    "license": "oa_pmc",
    "externalUrl": "https://example.org/article",
    "abstract": "...",
    "kind": "article"
  }
]
```

Required fields: `sourceSlug`, `title`, `externalUrl`, `kind`, `license`.
`sourceSlug` must already exist in the `sources` table — run
`npm run db:seed` first to populate the allowlist.

The pipeline applies the same checks regardless of the source mode:

- Source must be allowlisted (otherwise the row is skipped).
- License must be one of `lib/ingest/license-gate.ts:LICENSES`. Unknown
  licenses are rejected.
- Full-text body is only chunked + embedded when the license permits it
  (CC-BY family, public domain, government work, OA-PMC, original).
- Every resource is inserted as `is_published=false`. Approve via the
  admin UI before anything appears on the public catalog.
