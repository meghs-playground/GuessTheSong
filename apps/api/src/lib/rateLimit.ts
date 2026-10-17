/**
 * Simple in-memory sliding-window rate limiter for Cloudflare Workers.
 * Uses a Map stored per-isolate — good enough for per-IP edge limiting.
 *
 * For production at scale, back this with Cloudflare KV or Durable Objects.
 */

interface Window {
  count: number
  resetAt: number
}

const windows = new Map<string, Window>()

export function checkRateLimit(
  key: string,
  limitPerWindow: number,
  windowMs: number,
): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const existing = windows.get(key)

  if (!existing || now >= existing.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limitPerWindow - 1 }
  }

  if (existing.count >= limitPerWindow) {
    return { allowed: false, remaining: 0 }
  }

  existing.count++
  return { allowed: true, remaining: limitPerWindow - existing.count }
}

/** Periodically prune expired windows to avoid memory growth */
export function pruneExpiredWindows(): void {
  const now = Date.now()
  for (const [key, w] of windows.entries()) {
    if (now >= w.resetAt) windows.delete(key)
  }
}
