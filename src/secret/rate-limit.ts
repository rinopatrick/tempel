export const RATE_LIMIT_POST_PER_MINUTE = 10;
export const RATE_LIMIT_GET_PER_MINUTE = 60;
export const RATE_LIMIT_WINDOW_MS = 60_000;

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

function bucketKey(ip: string, scope: string): string {
  return `${scope}:${ip}`;
}

function prune(now: number, bucket: Bucket): void {
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  while (bucket.hits.length > 0 && bucket.hits[0] <= cutoff) {
    bucket.hits.shift();
  }
}

export function checkRateLimit(
  ip: string,
  scope: "post-secret" | "get-secret",
  now = Date.now(),
): { allowed: boolean; retryAfterSeconds: number } {
  const limit =
    scope === "post-secret"
      ? RATE_LIMIT_POST_PER_MINUTE
      : RATE_LIMIT_GET_PER_MINUTE;
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
  return { allowed: true, retryAfterSeconds: 0 };
}

export function clientIp(request: Request): string {
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
}
