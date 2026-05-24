/**
 * Tiny rate limiter.
 *
 *   - If UPSTASH_REDIS_REST_URL/TOKEN are set, uses an Upstash sliding window
 *     via the REST API (no extra dep, just fetch).
 *   - Otherwise, falls back to a per-process in-memory window. Fine for
 *     dev and single-instance deploys; production should configure Upstash.
 */

type LimitResult = { ok: boolean; remaining: number; resetAt: number };

const MEMORY = new Map<string, { count: number; windowStart: number }>();

export async function rateLimit({
  key,
  limit,
  windowMs,
}: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<LimitResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return upstashLimit({ url, token, key, limit, windowMs });
  return memoryLimit({ key, limit, windowMs });
}

function memoryLimit({
  key,
  limit,
  windowMs,
}: {
  key: string;
  limit: number;
  windowMs: number;
}): LimitResult {
  const now = Date.now();
  const cur = MEMORY.get(key);
  if (!cur || now - cur.windowStart > windowMs) {
    MEMORY.set(key, { count: 1, windowStart: now });
    return { ok: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  cur.count += 1;
  const remaining = Math.max(0, limit - cur.count);
  const resetAt = cur.windowStart + windowMs;
  return { ok: cur.count <= limit, remaining, resetAt };
}

async function upstashLimit({
  url,
  token,
  key,
  limit,
  windowMs,
}: {
  url: string;
  token: string;
  key: string;
  limit: number;
  windowMs: number;
}): Promise<LimitResult> {
  const now = Date.now();
  const windowStart = now - windowMs;
  const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;

  // Sliding window via sorted set:
  //   ZREMRANGEBYSCORE key 0 windowStart
  //   ZADD key now member
  //   ZCARD key
  //   PEXPIRE key windowMs
  const pipeline = [
    ["ZREMRANGEBYSCORE", key, "0", String(windowStart)],
    ["ZADD", key, String(now), member],
    ["ZCARD", key],
    ["PEXPIRE", key, String(windowMs)],
  ];

  try {
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(pipeline),
    });
    if (!res.ok) throw new Error(`Upstash ${res.status}`);
    const data = (await res.json()) as Array<{ result: number | string | null }>;
    const count = Number(data[2]?.result ?? 0);
    return {
      ok: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt: now + windowMs,
    };
  } catch {
    // Fail-open: never break the chatbot because rate limiting failed.
    return { ok: true, remaining: limit, resetAt: now + windowMs };
  }
}

export function clientFingerprint(req: Request): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anon";
  return `chat:${ip}`;
}
