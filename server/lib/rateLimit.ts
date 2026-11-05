type Bucket = { hits: number[]; }
const buckets = new Map<string, Bucket>()

let lastSweep = Date.now()
const SWEEP_INTERVAL = 60_000

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL) return
  lastSweep = now
  for (const [key, bucket] of buckets) {
    if (bucket.hits.length === 0 || now - bucket.hits[bucket.hits.length - 1] > 3_600_000) {
      buckets.delete(key)
    }
  }
}

/**
 * Returns true when the caller is still within the allowed number of hits.
 */
export function consume(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  sweep(now)
  const bucket = buckets.get(key) ?? { hits: [] }
  bucket.hits = bucket.hits.filter((time) => now - time < windowMs)
  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket)
    return false
  }
  bucket.hits.push(now)
  buckets.set(key, bucket)
  return true
}

export function retryAfterSeconds(key: string, windowMs: number): number {
  const bucket = buckets.get(key)
  if (!bucket || bucket.hits.length === 0) return 0
  const oldest = bucket.hits[0]
  return Math.max(1, Math.ceil((windowMs - (Date.now() - oldest)) / 1000))
}

/** Test helper. */
export function resetRateLimits(): void {
  buckets.clear()
}
