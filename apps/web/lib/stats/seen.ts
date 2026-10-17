/**
 * Tracks recently seen song IDs in localStorage so the API can exclude them.
 * Keeps a rolling window of the last SEEN_LIMIT IDs.
 */

const STORAGE_KEY = 'dhun_seen_v1'
const SEEN_LIMIT = 200

export function getSeenIds(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function markSeen(songId: string): void {
  if (typeof window === 'undefined') return
  const seen = getSeenIds()
  // Remove if already present, push to end (most recent last)
  const updated = [...seen.filter((id) => id !== songId), songId]
  // Keep only last SEEN_LIMIT
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated.slice(-SEEN_LIMIT)))
}
