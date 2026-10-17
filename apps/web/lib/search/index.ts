import Fuse from 'fuse.js'
import type { SearchResult } from '@dhun/shared'
import staticCatalogue from '../../public/catalogue.json'

/** Raw catalogue entry stored in the compressed static JSON */
export interface CatalogueEntry {
  id: string
  t: string // canonical title
  f: string // film
  y: number // year
  a: string[] // artists
  al: string[] // aliases (normalized)
}

interface SearchableItem {
  entry: CatalogueEntry
  cleanT: string
  cleanNorm: string
  cleanNoSpace: string
  titleNorm: string
  titleNoSpace: string
  filmNorm: string
  filmNoSpace: string
  artistNorm: string
  artistNoSpace: string
  aliasesNorm: string[]
  aliasesNoSpace: string[]
  combined: string
}

let catalogue: CatalogueEntry[] = staticCatalogue as CatalogueEntry[]
let searchableIndex: SearchableItem[] = []
let fuseInstance: Fuse<SearchableItem> | null = null
let loaded = true

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

/** Remove spaces for transliteration tolerance (e.g. "tumse hi" === "tum se hi") */
export function spaceless(str: string): string {
  return normalize(str).replace(/\s+/g, '')
}

/** Clean title: strip metadata like (LoFi), (feat. ...), [Remix], - Single, etc. */
export function cleanTitle(title: string): string {
  return title
    .replace(
      /\s*[\(\[]\s*(?:from|feat|featuring|with|remix|lofi|version|male|female|original|soundtrack|audio|video|official|lyrics|lyric|special|bhoomi|jhankar|bpm|\d+\s*bpm)[^\)\]]*[\)\]]/gi,
      '',
    )
    .replace(/\s*\[[^\]]+\]/g, '')
    .replace(/\s*-\s*single\s*$/i, '')
    .replace(/\s*-\s*(?:remix|lofi|female|male)\s*$/i, '')
    .replace(/[…\.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Extract meaningful phrases inside parentheses/brackets (e.g. "Dhanno" from "Aapka Kya Hoga (Dhanno)") */
function extractParentheticalPhrases(title: string): string[] {
  const matches = title.matchAll(/[\(\[]([^\)\]]+)[\)\]]/g)
  const phrases: string[] = []
  const metaRegex =
    /^(?:from|feat|featuring|with|remix|lofi|version|male|female|original|soundtrack|audio|video|official|lyrics|lyric|special|bhoomi|jhankar|bpm|\d+\s*bpm)/i

  for (const m of matches) {
    const p = m[1]?.trim()
    if (p && !metaRegex.test(p) && p.length >= 2) {
      phrases.push(p)
    }
  }
  return phrases
}

/** Rebuild searchable indices and Fuse instance from current catalogue */
function buildIndex(entries: CatalogueEntry[]): void {
  searchableIndex = entries.map((entry) => {
    const cleanT = cleanTitle(entry.t)
    const cleanNorm = normalize(cleanT)
    const cleanNoSpace = spaceless(cleanT)
    const titleNorm = normalize(entry.t)
    const titleNoSpace = spaceless(entry.t)
    const filmNorm = normalize(entry.f)
    const filmNoSpace = spaceless(entry.f)
    const artistNorm = entry.a.map(normalize).join(' ')
    const artistNoSpace = spaceless(artistNorm)

    const aliasesSet = new Set((entry.al || []).map(normalize))
    if (cleanNorm) aliasesSet.add(cleanNorm)

    for (const phrase of extractParentheticalPhrases(entry.t)) {
      const pNorm = normalize(phrase)
      if (pNorm) aliasesSet.add(pNorm)
    }

    const aliasesArr = Array.from(aliasesSet)
    const aliasesNoSpace = aliasesArr.map(spaceless)

    return {
      entry,
      cleanT,
      cleanNorm,
      cleanNoSpace,
      titleNorm,
      titleNoSpace,
      filmNorm,
      filmNoSpace,
      artistNorm,
      artistNoSpace,
      aliasesNorm: aliasesArr,
      aliasesNoSpace,
      combined: `${cleanNorm} ${titleNorm} ${filmNorm} ${artistNorm} ${aliasesArr.join(' ')}`,
    }
  })

  fuseInstance = new Fuse(searchableIndex, {
    keys: [
      { name: 'cleanNorm', weight: 3.5 },
      { name: 'titleNorm', weight: 2.5 },
      { name: 'aliasesNorm', weight: 2.5 },
      { name: 'filmNorm', weight: 1.5 },
      { name: 'artistNorm', weight: 1.2 },
    ],
    threshold: 0.38,
    ignoreLocation: true,
    includeScore: true,
    minMatchCharLength: 2,
  })
}

// Build index synchronously on module import
buildIndex(catalogue)

/** Fetch and cache the compressed catalogue JSON (served from CDN / public dir) */
export async function loadCatalogue(): Promise<void> {
  try {
    const res = await fetch('/catalogue.json')
    if (!res.ok) return
    const data = (await res.json()) as CatalogueEntry[]
    if (Array.isArray(data) && data.length > 0) {
      catalogue = data
      loaded = true
      buildIndex(catalogue)
    }
  } catch {
    // If network fetch fails, we already have staticCatalogue loaded synchronously!
  }
}

/**
 * Search the in-memory catalogue with multi-tier exact, prefix, token, and fuzzy matching.
 * Returns up to `limit` results sorted by match quality.
 */
export function search(query: string, limit = 8): SearchResult[] {
  if (!query || query.trim().length < 2) return []

  const q = normalize(query)
  if (q.length < 2) return []

  const qNoSpace = spaceless(query)
  const qTokens = q.split(' ').filter(Boolean)
  const scored = new Map<string, { entry: CatalogueEntry; score: number }>()

  // Tier 1 to Tier 4: Exact, Prefix, Substring, and Token matching
  for (const item of searchableIndex) {
    let score = 0

    // Tier 1: Exact matches
    if (item.cleanNorm === q) score = Math.max(score, 1000)
    else if (item.titleNorm === q) score = Math.max(score, 980)
    else if (item.cleanNoSpace === qNoSpace || item.titleNoSpace === qNoSpace)
      score = Math.max(score, 970)
    else if (item.aliasesNorm.includes(q)) score = Math.max(score, 950)
    else if (item.aliasesNoSpace.includes(qNoSpace)) score = Math.max(score, 930)

    // Tier 2: Prefix matches
    if (item.cleanNorm.startsWith(q)) score = Math.max(score, 880)
    else if (item.titleNorm.startsWith(q)) score = Math.max(score, 850)
    else if (item.cleanNoSpace.startsWith(qNoSpace) || item.titleNoSpace.startsWith(qNoSpace))
      score = Math.max(score, 830)
    else if (item.aliasesNorm.some((a) => a.startsWith(q))) score = Math.max(score, 800)

    // Tier 3: Word boundary / phrase match
    const wordRegex = new RegExp(
      '(?:^|\\s)' + q.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '(?:\\s|$)',
      'i',
    )
    if (wordRegex.test(item.cleanNorm)) score = Math.max(score, 750)
    else if (wordRegex.test(item.titleNorm)) score = Math.max(score, 720)

    // Tier 4: Substrings and Metadata
    if (item.cleanNorm.includes(q)) score = Math.max(score, 680)
    else if (item.titleNorm.includes(q)) score = Math.max(score, 650)
    else if (item.cleanNoSpace.includes(qNoSpace) || item.titleNoSpace.includes(qNoSpace))
      score = Math.max(score, 630)
    else if (item.aliasesNorm.some((a) => a.includes(q))) score = Math.max(score, 600)
    else if (item.filmNorm.startsWith(q)) score = Math.max(score, 580)
    else if (item.filmNorm.includes(q)) score = Math.max(score, 520)
    else if (item.artistNorm.startsWith(q)) score = Math.max(score, 490)
    else if (item.artistNorm.includes(q)) score = Math.max(score, 450)

    // Multi-token match: all query words present across title + film + artist + aliases
    if (qTokens.length > 1) {
      if (qTokens.every((tok) => item.combined.includes(tok))) {
        score = Math.max(score, 620)
      }
    }

    if (score > 0) {
      scored.set(item.entry.id, { entry: item.entry, score })
    }
  }

  // Tier 5: Fuzzy Search via Fuse.js
  if (fuseInstance) {
    const fuseResults = fuseInstance.search(q)
    for (const res of fuseResults) {
      const fuseScore = Math.round((1 - (res.score ?? 0)) * 450)
      const existing = scored.get(res.item.entry.id)
      if (existing) {
        existing.score = Math.max(existing.score, fuseScore)
      } else if (fuseScore >= 180) {
        scored.set(res.item.entry.id, { entry: res.item.entry, score: fuseScore })
      }
    }
  }

  return Array.from(scored.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ entry }) => {
      const isSelfTitled = entry.f && normalize(entry.f) === normalize(entry.t)
      const display = isSelfTitled
        ? `${entry.t} (${entry.y})`
        : `${entry.t} · ${entry.f} (${entry.y})`
      return {
        songId: entry.id,
        canonicalTitle: entry.t,
        display,
      }
    })
}
