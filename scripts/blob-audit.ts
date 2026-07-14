/**
 * One-off storage audit: lists EVERY blob in the store (not just renders/),
 * grouped by top-level prefix with total size. Used to find what is consuming
 * the 1GB Hobby quota when the render pipeline reports "quota exceeded" but the
 * renders/-only prune shows headroom. Read-only; deletes nothing.
 */
import "dotenv/config";

const MB = (b: number) => (b / 1048576).toFixed(1);

async function main() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.error("BLOB_READ_WRITE_TOKEN not set");
    process.exit(2);
  }
  const { list } = await import("@vercel/blob");

  const byPrefix = new Map<string, { count: number; bytes: number }>();
  let total = 0;
  let totalCount = 0;
  const biggest: Array<{ pathname: string; size: number }> = [];

  let cursor: string | undefined;
  do {
    const page = await list({ cursor, limit: 1000, token });
    for (const b of page.blobs) {
      total += b.size;
      totalCount += 1;
      const top = b.pathname.split("/")[0] || "(root)";
      const cur = byPrefix.get(top) ?? { count: 0, bytes: 0 };
      cur.count += 1;
      cur.bytes += b.size;
      byPrefix.set(top, cur);
      biggest.push({ pathname: b.pathname, size: b.size });
    }
    cursor = page.cursor;
  } while (cursor);

  console.log(`=== TOTAL: ${totalCount} blobs, ${MB(total)} MB ===`);
  console.log("=== by top-level prefix ===");
  for (const [prefix, v] of [...byPrefix.entries()].sort((a, b) => b[1].bytes - a[1].bytes)) {
    console.log(`  ${MB(v.bytes).padStart(9)} MB  ${String(v.count).padStart(4)} blobs  ${prefix}/`);
  }
  console.log("=== 15 biggest blobs ===");
  biggest.sort((a, b) => b.size - a.size);
  for (const b of biggest.slice(0, 15)) {
    console.log(`  ${MB(b.size).padStart(9)} MB  ${b.pathname}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("[blob-audit] FATAL:", (e as Error).message);
  process.exit(1);
});
