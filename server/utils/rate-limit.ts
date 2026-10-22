import { createError, setHeader, type H3Event } from 'h3'

/** Single-process token bucket. Inject time for deterministic refill tests.
 * Bound memory without evicting active buckets (which would bypass the limit).
 */
export function createTokenBucket(capacity: number, refillMs: number, maxKeys = 10000) {
  const buckets = new Map<string, { tokens: number; updated: number }>()
  return (key: string, now = Date.now()) => {
    let bucket = buckets.get(key)
    if (!bucket) {
      if (buckets.size >= maxKeys) {
        for (const [id, value] of buckets)
          if (now - value.updated >= capacity * refillMs) buckets.delete(id)
        if (buckets.size >= maxKeys) return Math.ceil((capacity * refillMs) / 1000)
      }
      bucket = { tokens: capacity, updated: now }
      buckets.set(key, bucket)
    }
    bucket.tokens = Math.min(capacity, bucket.tokens + Math.max(0, now - bucket.updated) / refillMs)
    bucket.updated = now
    if (bucket.tokens < 1) return Math.ceil(((1 - bucket.tokens) * refillMs) / 1000)
    bucket.tokens -= 1
    return 0
  }
}
export const signupLimit = createTokenBucket(20, 30000)
export const chatLimit = createTokenBucket(60, 1000)
export function enforceRateLimit(event: H3Event, retryAfter: number) {
  if (!retryAfter) return
  setHeader(event, 'Retry-After', retryAfter)
  throw createError({ statusCode: 429, statusMessage: 'Too many requests. Please retry shortly.' })
}
