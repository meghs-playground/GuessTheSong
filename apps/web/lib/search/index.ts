import type { SearchResult } from '@dhun/shared'

/** Raw catalogue entry stored in the compressed static JSON */
export interface CatalogueEntry {
  id: string
  t: string   // canonical title
  f: string   // film
  y: number   // year
  a: string[] // artists
  al: string[] // aliases (normalized)
}

let catalogue: CatalogueEntry[] = []
let loaded = false

/** Fetch and cache the compressed catalogue JSON (served from CDN / public dir) */
export async function loadCatalogue(): Promise<void> {
  if (loaded) return
  const res = await fetch('/catalogue.json')
  if (!res.ok) throw new Error('Failed to load catalogue')
  catalogue = await res.json() as CatalogueEntry[]
  loaded = true
}

/** Normalize a string for matching: lowercase, strip diacritics & punctuation */
export function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacriticals
    .replace(/[^a-z0-9\u0900-\u097f\s]/g, '') // keep latin, devanagari, digits
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Search the in-memory catalogue.
 * Returns up to `limit` results sorted by match quality.
 */
export function search(query: string, limit = 8): SearchResult[] {
  if (!loaded || query.length < 2) return []

  const q = normalize(query)
  const results: Array<{ entry: CatalogueEntry; score: number }> = []

  for (const entry of catalogue) {
    const titleNorm = normalize(entry.t)
    const filmNorm = normalize(entry.f)
    const artistNorm = entry.a.map(normalize).join(' ')

    let score = 0

    if (titleNorm === q) {
      score = 100
    } else if (titleNorm.startsWith(q)) {
      score = 80
    } else if (titleNorm.includes(q)) {
      score = 60
    } else if (entry.al.some((alias) => alias.startsWith(q))) {
      score = 55
    } else if (entry.al.some((alias) => alias.includes(q))) {
      score = 40
    } else if (filmNorm.includes(q)) {
      score = 30
    } else if (artistNorm.includes(q)) {
      score = 20
    }

    if (score > 0) results.push({ entry, score })
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ entry }) => ({
      songId: entry.id,
      canonicalTitle: entry.t,
      display: `${entry.t} · ${entry.f} (${entry.y})`,
    }))
}
