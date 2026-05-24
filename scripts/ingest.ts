/**
 * Ingestion CLI.
 *
 *   npm run ingest -- --source=pmc --query="vaginismus" --limit=20
 *   npm run ingest -- --source=wpath
 *   npm run ingest -- --from-file=manifests/topic-pack-low-desire.json
 *
 * Source modes:
 *   - pmc       Europe PMC search by query.
 *   - wpath     WPATH SOC8 + translations (CC BY-NC-ND).
 *   - from-file A JSON manifest with an array of IngestRecord objects (must
 *               obey the same shape as `lib/ingest/pipeline.ts:IngestRecord`).
 *               Source slugs in the manifest must already exist in the
 *               sources table (run `npm run db:seed` first).
 */

import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fetchFullText, searchEuropePmc } from "../lib/ingest/sources/pmc";
import { listWpathDocs } from "../lib/ingest/sources/wpath";
import { ingestMany, type IngestRecord } from "../lib/ingest/pipeline";

type Args = {
  source?: "pmc" | "wpath";
  query?: string;
  limit?: number;
  fromFile?: string;
};

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (const a of argv) {
    const m = a.replace(/^--/, "").split("=");
    const k = m[0];
    const v = m.slice(1).join("=");
    if (k === "source") out.source = v as Args["source"];
    else if (k === "query") out.query = v;
    else if (k === "limit") out.limit = Number(v);
    else if (k === "from-file") out.fromFile = v;
  }
  if (!out.source && !out.fromFile) {
    console.error(
      "Usage:\n" +
        "  npm run ingest -- --source=pmc --query='vaginismus' [--limit=N]\n" +
        "  npm run ingest -- --source=wpath\n" +
        "  npm run ingest -- --from-file=manifests/foo.json",
    );
    process.exit(2);
  }
  return out;
}

async function loadManifest(path: string): Promise<IngestRecord[]> {
  const raw = await readFile(path, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Manifest must be a JSON array of IngestRecord objects: ${path}`);
  }
  return parsed.map((r, i) => {
    const rec = r as Partial<IngestRecord> & { publishedAt?: string };
    if (!rec.sourceSlug || !rec.title || !rec.externalUrl || !rec.kind || !rec.license) {
      throw new Error(
        `Manifest entry ${i} missing required fields (sourceSlug, title, externalUrl, kind, license)`,
      );
    }
    return {
      ...(rec as IngestRecord),
      publishedAt: rec.publishedAt ? new Date(rec.publishedAt) : undefined,
      authors: rec.authors ?? [],
    } satisfies IngestRecord;
  });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Run npm run db:migrate first.");
    process.exit(2);
  }

  const args = parseArgs(process.argv.slice(2));
  const records: IngestRecord[] = [];

  if (args.fromFile) {
    console.log(`Loading manifest: ${args.fromFile}`);
    const fromManifest = await loadManifest(args.fromFile);
    console.log(`  ${fromManifest.length} records`);
    records.push(...fromManifest);
  } else if (args.source === "pmc") {
    if (!args.query) {
      console.error("--query is required for source=pmc");
      process.exit(2);
    }
    console.log(`Searching Europe PMC for: ${args.query} (limit=${args.limit ?? 25})`);
    const hits = await searchEuropePmc({ query: args.query, limit: args.limit ?? 25 });
    console.log(`  ${hits.length} OA hits`);

    for (const hit of hits) {
      const body = (await fetchFullText(hit)) ?? undefined;
      records.push({
        sourceSlug: "pmc-oa",
        title: hit.title,
        authors: hit.authors,
        authorCredentials: [],
        publishedAt: hit.publishedYear ? new Date(`${hit.publishedYear}-01-01`) : undefined,
        language: "en",
        license: hit.license,
        externalUrl: hit.externalUrl,
        abstract: hit.abstract,
        body,
        kind: "article",
      });
    }
  } else if (args.source === "wpath") {
    for (const doc of listWpathDocs()) {
      records.push({
        sourceSlug: "wpath",
        title: doc.title,
        authors: doc.authors,
        authorCredentials: ["WPATH SOC8 Revision Committee"],
        publishedAt: new Date(`${doc.publishedYear}-01-01`),
        language: doc.language,
        license: doc.license,
        externalUrl: doc.externalUrl,
        pdfBlobUrl: doc.pdfUrl,
        abstract:
          "WPATH Standards of Care, Version 8: clinical guidance for health professionals supporting transgender and gender-diverse people.",
        body: undefined,
        kind: "guideline",
      });
    }
  }

  console.log(`Ingesting ${records.length} records...`);
  const summary = await ingestMany(records);
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
