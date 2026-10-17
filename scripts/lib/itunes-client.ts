/**
 * itunes-client.ts
 *
 * High-performance, cached, rate-limited resolver for Apple iTunes Search API.
 * Uses system curl transport to bypass WAF TLS/undici fingerprinting.
 * Strictly verifies Bollywood tracks (drops Western pop, Punjabi rap singles, indie EPs, and non-Hindi tracks).
 */

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { Era } from '@dhun/shared'

const execFileAsync = promisify(execFile)

const __dirname = dirname(fileURLToPath(import.meta.url))
const CACHE_FILE = join(__dirname, '..', 'itunes-cache.local.json')

export interface ItunesTrack {
  trackId: number
  trackName: string
  collectionName: string
  releaseDate: string
  artistName: string
  previewUrl?: string | undefined
  primaryGenreName: string
}

export interface ResolvedSong {
  canonicalTitle: string
  film: string
  year: number
  era: Era
  artists: string[]
  composer: string
  sourcePlatform: 'itunes'
  trackId: string
  previewUrl: string
  popularityScore: number
  aliases: string[]
}

export interface PlaylistItemInput {
  cleanTitle: string
  artistOrChannel?: string | undefined
  movieOrAlbum?: string | undefined
}

export interface BatchProgress {
  current: number
  total: number
  matched: number
  failed: number
  fromCache: number
  currentTitle: string
}

const MAX_RETRIES = 2

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export function yearToEra(year: number): Era {
  if (year <= 1979) return '50s-70s'
  if (year <= 1989) return '80s'
  if (year <= 1999) return '90s'
  if (year <= 2009) return '2000s'
  if (year <= 2019) return '2010s'
  return '2020s'
}

export function normalizeText(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0900-\u097f\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Strips film suffix from track name if present, e.g.
 * "Aankhein Chaar (From \"Tu Yaa Main\")" -> "Aankhein Chaar"
 */
export function cleanCanonicalTitle(title: string): string {
  return title
    .replace(/\s*[\(\[]\s*(?:from|from the movie|from the film)[^\)\]]+[\)\]]/gi, '')
    .replace(/\s*[\(\[]\s*(?:original motion picture soundtrack|soundtrack)[^\)\]]+[\)\]]/gi, '')
    .replace(/\s*-\s*single\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Bollywood Verification ───────────────────────────────────────────────────

const BOLLYWOOD_LEGENDS = [
  'lata mangeshkar',
  'kishore kumar',
  'mohammed rafi',
  'mohd. rafi',
  'mukesh',
  'asha bhosle',
  'r.d. burman',
  's.d. burman',
  'manna dey',
  'hemant kumar',
  'talat mahmood',
  'geeta dutt',
  'shamshad begum',
  'mahendra kapoor',
  'kalyanji anandji',
  'laxmikant pyarelal',
  'bappi lahiri',
  'shankar jaikishan',
  'naushad',
  'madan mohan',
  'khayyam',
  'kumar sanu',
  'udit narayan',
  'alka yagnik',
  'kavita krishnamurthy',
  'anuradha paudwal',
  'sadhana sargam',
  'abhijeet',
  'hariharan',
  'sonu nigam',
  'shreya ghoshal',
  'sunidhi chauhan',
  'arijit singh',
  'a.r. rahman',
  'pritam',
  'kk',
  'shaan',
  'mohit chauhan',
  'javed ali',
  'vishal-shekhar',
  'shankar ehsaan loy',
  'amit trivedi',
  'atif aslam',
  'mithoon',
  'jagjit singh',
]

export function isBollywoodTrack(t: ItunesTrack): boolean {
  const genre = (t.primaryGenreName || '').toLowerCase()
  const collection = (t.collectionName || '').toLowerCase()
  const track = (t.trackName || '').toLowerCase()
  const artist = (t.artistName || '').toLowerCase()

  // 1. Direct Bollywood genre
  if (genre === 'bollywood') return true

  // 2. Reject pure western genres
  const westernGenres = [
    'pop',
    'rock',
    'alternative',
    'hip-hop/rap',
    'hip-hop',
    'electronic',
    'dance',
    'r&b/soul',
    'country',
    'comedy',
  ]
  if (westernGenres.includes(genre)) return false

  // 3. Reject regional non-Hindi films/languages
  const regionalKeywords = [
    'gujarati',
    'marathi',
    'punjabi',
    'bhojpuri',
    'tamil',
    'telugu',
    'kannada',
    'malayalam',
    'fakt purusho maate',
    'mumbai pune mumbai',
    'reva',
    'kantara',
  ]
  if (regionalKeywords.some((r) => collection.includes(r) || track.includes(r))) {
    return false
  }

  // 4. Indian film soundtrack markers
  const hasSoundtrackMarker =
    collection.includes('soundtrack') ||
    collection.includes('motion picture') ||
    collection.includes('from "') ||
    collection.includes("from '") ||
    collection.includes('(from “') ||
    track.includes('from "') ||
    track.includes("from '") ||
    track.includes('(from “')

  if (hasSoundtrackMarker) return true

  // 5. Classic songs categorized as Indian Pop/Indian by legendary artists
  const isBollyArtist = BOLLYWOOD_LEGENDS.some((leg) => artist.includes(leg))
  if (
    (genre.includes('indian') || genre.includes('soundtrack') || genre.includes('world')) &&
    isBollyArtist
  ) {
    return true
  }

  return false
}

// ── Shared Adaptive Rate Limiter ─────────────────────────────────────────────

class SharedRateLimiter {
  private lastRequestTime = 0
  private minIntervalMs: number
  private pauseUntil = 0

  constructor(minIntervalMs = 800) {
    this.minIntervalMs = minIntervalMs
  }

  async acquire(): Promise<void> {
    while (true) {
      const now = Date.now()
      if (now < this.pauseUntil) {
        const wait = this.pauseUntil - now
        await sleep(wait)
        continue
      }
      const elapsed = now - this.lastRequestTime
      if (elapsed < this.minIntervalMs) {
        await sleep(this.minIntervalMs - elapsed)
      }
      this.lastRequestTime = Date.now()
      return
    }
  }

  pause(durationMs: number): void {
    const target = Date.now() + durationMs
    if (target > this.pauseUntil) {
      this.pauseUntil = target
    }
  }
}

const globalRateLimiter = new SharedRateLimiter(800)

// ── iTunes Search API (via Curl Transport) ───────────────────────────────────

interface SearchResult {
  results: ItunesTrack[]
  rateLimited: boolean
}

export async function searchItunesDetailed(term: string, limit = 5): Promise<SearchResult> {
  const url = new URL('https://itunes.apple.com/search')
  url.searchParams.set('term', term)
  url.searchParams.set('media', 'music')
  url.searchParams.set('entity', 'song')
  url.searchParams.set('country', 'in')
  url.searchParams.set('limit', limit.toString())
  url.searchParams.set('lang', 'en_us')

  let hitRateLimit = false

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await globalRateLimiter.acquire()

      const { stdout } = await execFileAsync('curl', ['-s', '--max-time', '8', url.toString()])

      if (!stdout || stdout.trim().length === 0) {
        return { results: [], rateLimited: false }
      }

      if (stdout.includes('Rate limit has been exceeded')) {
        hitRateLimit = true
        const wait = 10000 + Math.random() * 5000
        console.warn(`\n  [iTunes 429] Rate limit hit on "${term}". Pausing ${Math.round(wait / 1000)}s…`)
        globalRateLimiter.pause(wait)
        await sleep(wait)
        continue
      }

      const data = JSON.parse(stdout) as { results?: ItunesTrack[] }
      return { results: data.results ?? [], rateLimited: false }
    } catch {
      if (attempt < MAX_RETRIES - 1) await sleep(1000)
    }
  }

  return { results: [], rateLimited: hitRateLimit }
}

export async function searchItunes(term: string, limit = 5): Promise<ItunesTrack[]> {
  const res = await searchItunesDetailed(term, limit)
  return res.results
}

// ── Non-Artist Channel Filtering ──────────────────────────────────────────────

const NON_ARTIST_CHANNELS = new Set([
  't-series',
  'tseries',
  't-series bollywood classics',
  't-series classics',
  't-series bhakti sagar',
  'zee music company',
  'zee music',
  'zee classic',
  'sony music india',
  'sonymusicindiavevo',
  'sony music',
  'sonymusicsouthvevo',
  'yrf',
  'yash raj films',
  'tips official',
  'tips films',
  'tips',
  'saregama music',
  'saregama',
  'eros now',
  'eros now music',
  'venus',
  'venus movies',
  'shemaroo',
  'shemaroo filmi gaane',
  'speed records',
  'speed records bhojpuri',
  'white hill music',
  'geet mp3',
  'desimelodies',
  'svf',
  'times music',
  't-series regional',
  'release',
  'various artists',
  'topic',
  'youtube music',
  'bolly station',
  'bolly 90s',
  'bollywood classic',
])

function isGenuineArtist(artist?: string): boolean {
  if (!artist || artist.trim().length === 0) return false
  const norm = normalizeText(artist)
  if (NON_ARTIST_CHANNELS.has(norm)) return false
  if (
    norm.startsWith('t series') ||
    norm.startsWith('zee music') ||
    norm.startsWith('sony music') ||
    norm.startsWith('tips ') ||
    norm.startsWith('saregama')
  ) {
    return false
  }
  return true
}

// ── Persistent Disk Cache ─────────────────────────────────────────────────────

type DiskCache = Record<string, ResolvedSong | null>

let inMemoryCache: DiskCache | null = null
let cacheDirty = false

export function loadCache(): DiskCache {
  if (inMemoryCache) return inMemoryCache
  if (existsSync(CACHE_FILE)) {
    try {
      inMemoryCache = JSON.parse(readFileSync(CACHE_FILE, 'utf8')) as DiskCache
      return inMemoryCache
    } catch {
      inMemoryCache = {}
    }
  } else {
    inMemoryCache = {}
  }
  return inMemoryCache
}

export function saveCache(): void {
  if (!inMemoryCache || !cacheDirty) return
  try {
    writeFileSync(CACHE_FILE, JSON.stringify(inMemoryCache, null, 2))
    cacheDirty = false
  } catch (err) {
    console.warn('Could not save iTunes cache:', err)
  }
}

function getCacheKey(cleanTitle: string, film?: string): string {
  const normTitle = normalizeText(cleanTitle)
  return film ? `${normTitle}:::${normalizeText(film)}` : normTitle
}

// ── Single Track Resolution ───────────────────────────────────────────────────

export async function resolveItunesTrack(
  cleanTitle: string,
  artistOrChannel?: string,
  film?: string,
  useCache = true,
): Promise<ResolvedSong | null> {
  const cacheKey = getCacheKey(cleanTitle, film)
  const normTitle = normalizeText(cleanTitle)

  if (useCache) {
    const cache = loadCache()
    if (cacheKey in cache) {
      return cache[cacheKey] ?? null
    }
    if (normTitle in cache && cache[normTitle]) {
      return cache[normTitle] ?? null
    }
  }

  const queries: string[] = []
  const hasArtist = isGenuineArtist(artistOrChannel)

  if (film) {
    queries.push(`${cleanTitle} ${film}`)
  } else if (hasArtist && artistOrChannel) {
    queries.push(`${cleanTitle} ${artistOrChannel}`)
  }
  queries.push(cleanTitle)

  const uniqueQueries = Array.from(new Set(queries.map((q) => q.trim()).filter(Boolean)))
  let matchedTrack: ItunesTrack | null = null
  let hadRateLimit = false

  for (const q of uniqueQueries) {
    const searchRes = await searchItunesDetailed(q, 4)
    if (searchRes.rateLimited) {
      hadRateLimit = true
    }

    const results = searchRes.results
    if (results.length > 0) {
      const normClean = normalizeText(cleanTitle)

      // Strictly must be a verified Bollywood track with audio preview
      const best = results.find((t) => {
        if (!t.previewUrl) return false
        if (!isBollywoodTrack(t)) return false
        const tNorm = normalizeText(cleanCanonicalTitle(t.trackName))
        return tNorm === normClean || tNorm.includes(normClean) || normClean.includes(tNorm)
      })

      if (best) {
        matchedTrack = best
        break // Stop searching once verified Bollywood track with preview found
      }
    }
  }

  let result: ResolvedSong | null = null

  if (matchedTrack && matchedTrack.previewUrl) {
    const year = new Date(matchedTrack.releaseDate).getFullYear() || 2020
    const era = yearToEra(year)
    const canonical = cleanCanonicalTitle(matchedTrack.trackName)

    const rawCollection = matchedTrack.collectionName ?? ''
    const filmName =
      rawCollection
        .replace(
          /\s*[\(\[]\s*(?:original motion picture soundtrack|soundtrack)[^\)\]]+[\)\]]/gi,
          '',
        )
        .replace(/\s*-\s*single\s*$/i, '')
        .trim() ||
      film ||
      canonical

    const aliasSet = new Set<string>()
    aliasSet.add(normalizeText(canonical))
    if (matchedTrack.trackName !== canonical) {
      aliasSet.add(normalizeText(matchedTrack.trackName))
    }
    if (cleanTitle !== canonical) {
      aliasSet.add(normalizeText(cleanTitle))
    }
    if (filmName && filmName !== canonical) {
      aliasSet.add(normalizeText(`${canonical} ${filmName}`))
    }

    result = {
      canonicalTitle: canonical,
      film: filmName,
      year,
      era,
      artists: [matchedTrack.artistName],
      composer: matchedTrack.artistName,
      sourcePlatform: 'itunes',
      trackId: matchedTrack.trackId.toString(),
      previewUrl: matchedTrack.previewUrl,
      popularityScore: 100,
      aliases: Array.from(aliasSet),
    }
  }

  if (useCache) {
    const cache = loadCache()
    if (result) {
      cache[cacheKey] = result
      cacheDirty = true
    } else if (!hadRateLimit) {
      cache[cacheKey] = null
      cacheDirty = true
    }
  }

  return result
}

// ── Batch Concurrent Resolution with Live Progress ────────────────────────────

export async function resolveItunesTracksBatch(
  candidates: PlaylistItemInput[],
  options: {
    concurrency?: number
    onProgress?: (progress: BatchProgress) => void
  } = {},
): Promise<{
  resolvedMap: Map<string, ResolvedSong>
  matchedCount: number
  failedCount: number
  cacheHitCount: number
}> {
  const concurrency = options.concurrency ?? 1
  loadCache()

  const resolvedMap = new Map<string, ResolvedSong>()
  let currentIdx = 0
  let matchedCount = 0
  let failedCount = 0
  let cacheHitCount = 0

  let dirtyWrites = 0

  async function worker() {
    while (true) {
      const idx = currentIdx++
      if (idx >= candidates.length) break

      const candidate = candidates[idx]!
      const cacheKey = getCacheKey(candidate.cleanTitle, candidate.movieOrAlbum)
      const isCached = inMemoryCache && cacheKey in inMemoryCache

      if (isCached) {
        cacheHitCount++
      }

      try {
        const resolved = await resolveItunesTrack(
          candidate.cleanTitle,
          candidate.artistOrChannel,
          candidate.movieOrAlbum,
          true,
        )

        if (resolved) {
          matchedCount++
          const dedupKey = normalizeText(cleanCanonicalTitle(resolved.canonicalTitle))
          if (resolvedMap.has(dedupKey)) {
            const existing = resolvedMap.get(dedupKey)!
            const merged = new Set([...existing.aliases, ...resolved.aliases])
            existing.aliases = Array.from(merged)
          } else {
            resolvedMap.set(dedupKey, resolved)
          }
        } else {
          failedCount++
        }

        dirtyWrites++
        if (dirtyWrites >= 10) {
          saveCache()
          dirtyWrites = 0
        }

        options.onProgress?.({
          current: idx + 1,
          total: candidates.length,
          matched: matchedCount,
          failed: failedCount,
          fromCache: cacheHitCount,
          currentTitle: candidate.cleanTitle,
        })
      } catch (err) {
        failedCount++
        console.error(`  Error resolving "${candidate.cleanTitle}":`, err)
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker())
  await Promise.all(workers)

  saveCache()

  return {
    resolvedMap,
    matchedCount,
    failedCount,
    cacheHitCount,
  }
}
