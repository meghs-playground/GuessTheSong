/**
 * seed-library.ts
 *
 * Seeds the Neon DB with Bollywood songs from the iTunes Search API.
 *
 * Usage:
 *   DATABASE_URL=postgres://... tsx scripts/seed-library.ts
 *
 * The script is idempotent — re-running it upserts on (source_platform, track_id).
 *
 * iTunes Search API docs: https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI
 * Rate limit: ~20 req/min per IP. We stay well under with a token bucket.
 */

import { neon } from '@neondatabase/serverless'
import type { Era } from '@dhun/shared'

// ── Config ────────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env['DATABASE_URL']
if (!DATABASE_URL) throw new Error('DATABASE_URL env var is required')

const sql = neon(DATABASE_URL)

// Token bucket: max 15 req/min (leaves headroom below iTunes' ~20 limit)
const RATE_LIMIT_INTERVAL_MS = 60_000 / 15 // ~4000ms per request
const MAX_RETRIES = 3

// ── Seed artists / albums by era ──────────────────────────────────────────────

const SEED_ARTISTS: Array<{ term: string; era: Era }> = [
  // 50s–70s
  { term: 'Lata Mangeshkar', era: '50s-70s' },
  { term: 'Mohammed Rafi', era: '50s-70s' },
  { term: 'Kishore Kumar', era: '50s-70s' },
  { term: 'Mukesh singer', era: '50s-70s' },
  { term: 'Asha Bhosle 1960s', era: '50s-70s' },
  { term: 'S.D. Burman Bollywood', era: '50s-70s' },
  { term: 'R.D. Burman 1970s', era: '50s-70s' },
  // 80s
  { term: 'Asha Bhosle 1980s', era: '80s' },
  { term: 'Lata Mangeshkar 1980s', era: '80s' },
  { term: 'Kishore Kumar 1980s', era: '80s' },
  { term: 'Bappi Lahiri Bollywood', era: '80s' },
  { term: 'Laxmikant Pyarelal', era: '80s' },
  // 90s
  { term: 'A.R. Rahman Bollywood', era: '90s' },
  { term: 'Kumar Sanu Bollywood', era: '90s' },
  { term: 'Udit Narayan 1990s', era: '90s' },
  { term: 'Alka Yagnik 1990s', era: '90s' },
  { term: 'Kavita Krishnamurthy', era: '90s' },
  // 2000s
  { term: 'Sonu Nigam Bollywood 2000s', era: '2000s' },
  { term: 'Shreya Ghoshal Bollywood', era: '2000s' },
  { term: 'A.R. Rahman 2000s', era: '2000s' },
  { term: 'Shankar Ehsaan Loy', era: '2000s' },
  { term: 'Vishal Shekhar Bollywood', era: '2000s' },
  // 2010s
  { term: 'Arijit Singh Bollywood', era: '2010s' },
  { term: 'Pritam Bollywood 2010s', era: '2010s' },
  { term: 'Badshah Hindi', era: '2010s' },
  { term: 'Nucleya Hindi', era: '2010s' },
  // 2020s
  { term: 'Arijit Singh 2020s', era: '2020s' },
  { term: 'B Praak Bollywood', era: '2020s' },
  { term: 'Tanvir Evans Bollywood', era: '2020s' },
]

// ── iTunes API types ──────────────────────────────────────────────────────────

interface ItunesTrack {
  trackId: number
  trackName: string
  collectionName: string
  releaseDate: string
  artistName: string
  previewUrl?: string
  country: string
  primaryGenreName: string
  trackCensoredName?: string
}

interface ItunesResponse {
  resultCount: number
  results: ItunesTrack[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function yearToEra(year: number): Era {
  if (year <= 1979) return '50s-70s'
  if (year <= 1989) return '80s'
  if (year <= 1999) return '90s'
  if (year <= 2009) return '2000s'
  if (year <= 2019) return '2010s'
  return '2020s'
}

function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0900-\u097f\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Remove common remix/reprise/karaoke suffixes */
function isClean(title: string): boolean {
  const lower = title.toLowerCase()
  const blocklist = [
    'remix', 'reprise', 'karaoke', 'instrumental', 'lo-fi', 'lofi',
    'slowed', 'reverb', 'cover', 'tribute', 'recreat', 'remastered',
    'from the film', '(version)', 'version)', 'unplugged',
  ]
  return !blocklist.some((b) => lower.includes(b))
}

async function fetchItunesTracks(
  term: string,
  retries = MAX_RETRIES,
): Promise<ItunesTrack[]> {
  const url = new URL('https://itunes.apple.com/search')
  url.searchParams.set('term', term)
  url.searchParams.set('media', 'music')
  url.searchParams.set('entity', 'song')
  url.searchParams.set('country', 'in') // India catalogue
  url.searchParams.set('limit', '50')
  url.searchParams.set('lang', 'en_us')

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url.toString())
      if (res.status === 429) {
        const wait = Math.pow(2, attempt + 1) * 1000 + Math.random() * 500
        console.warn(`  429 for "${term}", retrying in ${wait}ms…`)
        await sleep(wait)
        continue
      }
      if (!res.ok) {
        console.warn(`  HTTP ${res.status} for "${term}"`)
        return []
      }
      const data = await res.json() as ItunesResponse
      return data.results ?? []
    } catch (err) {
      console.warn(`  Fetch error for "${term}":`, err)
      if (attempt < retries - 1) await sleep(2000)
    }
  }
  return []
}

// ── DB upsert ─────────────────────────────────────────────────────────────────

async function upsertSong(track: ItunesTrack, era: Era): Promise<{ id: string; isNew: boolean }> {
  const year = new Date(track.releaseDate).getFullYear()
  const resolvedEra = yearToEra(year) // use actual year, not seed era

  // Upsert song
  const rows = await sql`
    INSERT INTO songs (
      canonical_title, film, year, era, artists, composer,
      source_platform, track_id, preview_url,
      difficulty, popularity_score, active
    ) VALUES (
      ${track.trackName},
      ${track.collectionName},
      ${year},
      ${resolvedEra},
      ${[track.artistName]},
      ${track.artistName},
      'itunes',
      ${track.trackId.toString()},
      ${track.previewUrl ?? ''},
      3,
      0,
      ${!!track.previewUrl}
    )
    ON CONFLICT (source_platform, track_id) DO UPDATE
      SET preview_url   = EXCLUDED.preview_url,
          updated_at    = NOW()
    RETURNING id, (xmax = 0) AS is_new
  `

  const row = rows[0] as { id: string; is_new: boolean }

  // Upsert alias (normalized title)
  const alias = normalizeTitle(track.trackName)
  await sql`
    INSERT INTO song_aliases (song_id, alias) VALUES (${row.id}, ${alias})
    ON CONFLICT (song_id, alias) DO NOTHING
  `

  return { id: row.id, isNew: row.is_new }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Seeding ${SEED_ARTISTS.length} artist/era queries…\n`)

  let totalNew = 0
  let totalUpdated = 0
  let totalSkipped = 0

  for (const { term, era } of SEED_ARTISTS) {
    console.log(`→ Fetching: "${term}" (${era})`)
    const tracks = await fetchItunesTracks(term)

    const eligible = tracks.filter(
      (t) => t.previewUrl && t.primaryGenreName.includes('Bollywood') && isClean(t.trackName),
    )

    console.log(`  ${tracks.length} tracks fetched, ${eligible.length} eligible`)

    for (const track of eligible) {
      const { isNew } = await upsertSong(track, era)
      if (isNew) totalNew++
      else totalUpdated++
    }

    totalSkipped += tracks.length - eligible.length

    // Respect rate limit
    await sleep(RATE_LIMIT_INTERVAL_MS)
  }

  console.log(`\nDone. New: ${totalNew} | Updated: ${totalUpdated} | Skipped: ${totalSkipped}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
