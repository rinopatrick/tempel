export const RATE_LIMIT_POST_PER_MINUTE = 10;
export const RATE_LIMIT_GET_PER_MINUTE = 60;
export const RATE_LIMIT_WINDOW_MS = 60_000;

interface Bucket {
  hits: number[];
}

interface Expiry {
  key: string;
  at: number;
}

const buckets = new Map<string, Bucket>();

// One entry per allowed hit, in time order, so the oldest idle bucket is
// always at `queueHead` and eviction never scans the map.
let queue: Expiry[] = [];
let queueHead = 0;

// Latest time seen. A `now` that steps back is clamped to it, so hits stay
// sorted and a clock rollback never shortens the window.
let clock = -Infinity;

function bucketKey(ip: string, scope: string): string {
  return `${scope}:${ip}`;
}

function prune(now: number, bucket: Bucket): void {
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  while (bucket.hits.length > 0 && bucket.hits[0] <= cutoff) {
    bucket.hits.shift();
  }
}

function evictIdle(now: number): void {
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  while (queueHead < queue.length && queue[queueHead].at <= cutoff) {
    const { key, at } = queue[queueHead];
    queueHead += 1;
    const bucket = buckets.get(key);
    if (bucket !== undefined && bucket.hits[bucket.hits.length - 1] === at) {
      buckets.delete(key);
    }
  }
  if (queueHead > 1024 && queueHead * 2 > queue.length) {
    queue = queue.slice(queueHead);
    queueHead = 0;
  }
}

export function checkRateLimit(
  ip: string,
  scope: "post-secret" | "get-secret",
  now = performance.now(),
): { allowed: boolean; retryAfterSeconds: number } {
  const limit =
    scope === "post-secret"
      ? RATE_LIMIT_POST_PER_MINUTE
      : RATE_LIMIT_GET_PER_MINUTE;
  clock = Math.max(clock, now);
  now = clock;
  evictIdle(now);
  const key = bucketKey(ip, scope);
  let bucket = buckets.get(key);
  if (bucket === undefined) {
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }
  prune(now, bucket);
  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0];
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000),
    );
    return { allowed: false, retryAfterSeconds };
  }
  bucket.hits.push(now);
  queue.push({ key, at: now });
  return { allowed: true, retryAfterSeconds: 0 };
}

export function clientIp(request: Request): string {
  const cloudflare = request.headers.get("cf-connecting-ip");
  if (cloudflare !== null && cloudflare.trim().length > 0) {
    return cloudflare.trim();
  }
  const vercel = request.headers.get("x-vercel-forwarded-for");
  if (vercel !== null) {
    const first = vercel.split(",")[0].trim();
    if (first.length > 0) return first;
  }
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded !== null) {
    const first = forwarded.split(",")[0].trim();
    if (first.length > 0) return first;
  }
  const real = request.headers.get("x-real-ip");
  if (real !== null && real.trim().length > 0) return real.trim();
  return "unknown";
}

// Test seam: drop all in-process buckets between cases.
export function resetRateLimits(): void {
  buckets.clear();
  queue = [];
  queueHead = 0;
  clock = -Infinity;
}

// Test seam: number of live in-process buckets.
export function bucketCount(): number {
  return buckets.size;
}
