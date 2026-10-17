/**
 * seed-from-playlists.ts
 *
 * Seeds songs from private YouTube Music playlists, backfills eras under threshold,
 * deduplicates tracks, merges aliases, and updates Neon DB and catalogue.json.
 *
 * Usage:
 *   # With Neon DB:
 *   DATABASE_URL=postgres://... pnpm --filter scripts seed:playlists
 *
 *   # Local JSON catalogue generation only:
 *   pnpm --filter scripts seed:playlists --local-only
 *
 * NOTE: Playlist URLs are kept private in scripts/playlists.local.json (gitignored).
 */

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { neon } from '@neondatabase/serverless'
import type { Era } from '@dhun/shared'
import { scrapePlaylist, isCleanSongTitle, type PlaylistItem } from './lib/youtube-scraper.js'
import {
  resolveItunesTrack,
  resolveItunesTracksBatch,
  searchItunes,
  cleanCanonicalTitle,
  normalizeText,
  yearToEra,
  sleep,
  type ResolvedSong,
} from './lib/itunes-client.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Configuration ─────────────────────────────────────────────────────────────

const MIN_SONGS_PER_ERA = 50
const ALL_ERAS: Era[] = ['50s-70s', '80s', '90s', '2000s', '2010s', '2020s']

// Curated artist queries per era for backfilling gaps
const BACKFILL_QUERIES: Record<Era, string[]> = {
  '50s-70s': [
    'Lata Mangeshkar classic',
    'Mohammed Rafi hit',
    'Kishore Kumar 1970s',
    'Mukesh singer classic',
    'Asha Bhosle 1960s',
    'R.D. Burman 1970s',
    'S.D. Burman classic',
    'Manna Dey Hindi',
    'Hemant Kumar Hindi',
  ],
  '80s': [
    'Kishore Kumar 1980s',
    'Lata Mangeshkar 1980s',
    'Asha Bhosle 1980s',
    'Bappi Lahiri 1980s',
    'Laxmikant Pyarelal 1980s',
    'Kalyanji Anandji 1980s',
    'Pankaj Udhas ghazal',
    'Shabbir Kumar Bollywood',
  ],
  '90s': [
    'Kumar Sanu 1990s',
    'Udit Narayan 1990s',
    'Alka Yagnik 1990s',
    'A.R. Rahman 1990s',
    'Kavita Krishnamurthy 1990s',
    'Abhijeet Bhattacharya',
    'Hariharan Bollywood',
    'Jatin Lalit 1990s',
    'Nadeem Shravan 1990s',
  ],
  '2000s': [
    'Sonu Nigam 2000s',
    'Shreya Ghoshal 2000s',
    'A.R. Rahman 2000s',
    'Shankar Ehsaan Loy',
    'Vishal Shekhar 2000s',
    'Sunidhi Chauhan 2000s',
    'KK Bollywood 2000s',
    'Shaan Bollywood',
    'Lucky Ali Bollywood',
  ],
  '2010s': [
    'Arijit Singh 2010s',
    'Pritam 2010s',
    'Atif Aslam Bollywood',
    'Mohit Chauhan Bollywood',
    'Ankit Tiwari',
    'Armaan Malik',
    'Amit Trivedi Bollywood',
    'Mithoon Bollywood',
  ],
  '2020s': [
    'Arijit Singh 2020s',
    'B Praak Bollywood',
    'Jubin Nautiyal Bollywood',
    'Darshan Raval Bollywood',
    'Vishal Mishra Bollywood',
    'Sachin-Jigar 2020s',
    'Tanishk Bagchi 2020s',
  ],
}

// ── Load playlist URLs ────────────────────────────────────────────────────────

function loadPlaylistUrls(): string[] {
  // 1. Check CLI arg --playlists=url1,url2
  const arg = process.argv.find((a) => a.startsWith('--playlists='))
  if (arg) {
    return arg
      .split('=')[1]!
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  // 2. Check process.env.PLAYLIST_URLS
  if (process.env['PLAYLIST_URLS']) {
    return process.env['PLAYLIST_URLS']
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  // 3. Check scripts/playlists.local.json
  const localFile = join(__dirname, 'playlists.local.json')
  if (existsSync(localFile)) {
    try {
      const urls = JSON.parse(readFileSync(localFile, 'utf8')) as string[]
      if (Array.isArray(urls) && urls.length > 0) return urls
    } catch (e) {
      console.warn('Could not parse playlists.local.json', e)
    }
  }

  // 4. Check root playlists.local.json
  const rootLocal = join(__dirname, '..', 'playlists.local.json')
  if (existsSync(rootLocal)) {
    try {
      const urls = JSON.parse(readFileSync(rootLocal, 'utf8')) as string[]
      if (Array.isArray(urls) && urls.length > 0) return urls
    } catch {}
  }

  return []
}

// ── Catalogue JSON entry format ───────────────────────────────────────────────

interface CatalogueEntry {
  id: string
  t: string // canonical title
  f: string // film
  y: number // year
  a: string[] // artists
  al: string[] // normalized aliases
}

// ── Main Seeder Logic ─────────────────────────────────────────────────────────

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗')
  console.log('║               DHUN PLAYLIST SEEDER & CURATOR              ║')
  console.log('╚═══════════════════════════════════════════════════════════╝\n')

  const isLocalOnly = process.argv.includes('--local-only') || !process.env['DATABASE_URL']
  const databaseUrl = process.env['DATABASE_URL']

  if (databaseUrl && !isLocalOnly) {
    console.log('✓ Target: Neon PostgreSQL Database + catalogue.json')
  } else {
    console.log('✓ Target: Local catalogue.json export (no DB required)')
  }

  const playlistUrls = loadPlaylistUrls()
  if (playlistUrls.length === 0) {
    console.error('\n✖ Error: No playlist URLs found!')
    console.error(
      '  Please ensure scripts/playlists.local.json exists or pass PLAYLIST_URLS in env.',
    )
    process.exit(1)
  }

  console.log(`✓ Loaded ${playlistUrls.length} playlists to seed\n`)

  // Step 1: Candidate songs from playlists (with local disk cache)
  console.log('── Step 1: Gathering playlist candidates ───────────────────')
  const forceScrape =
    process.argv.includes('--force-scrape') || process.argv.includes('--refresh-playlists')
  const scrapedCacheFile = join(__dirname, 'playlists-scraped.local.json')

  let songCandidates: PlaylistItem[] = []

  if (!forceScrape && existsSync(scrapedCacheFile)) {
    try {
      songCandidates = JSON.parse(readFileSync(scrapedCacheFile, 'utf8'))
      console.log(`✓ Loaded ${songCandidates.length} song candidates from local cache (${scrapedCacheFile})`)
    } catch {
      songCandidates = []
    }
  }

  if (songCandidates.length === 0) {
    console.log('  Scraping YouTube playlists…')
    const seenCandidateKeys = new Set<string>()

    for (const url of playlistUrls) {
      const items = await scrapePlaylist(url)
      for (const item of items) {
        const key = normalizeText(item.cleanTitle)
        if (key && !seenCandidateKeys.has(key)) {
          seenCandidateKeys.add(key)
          songCandidates.push(item)
        }
      }
    }

    try {
      writeFileSync(scrapedCacheFile, JSON.stringify(songCandidates, null, 2))
      console.log(`✓ Cached ${songCandidates.length} song candidates to playlists-scraped.local.json`)
    } catch {}
  }

  // Pre-filter: Drop non-Bollywood tracks (Western pop, Punjabi rap singles, regional non-Hindi, indie EPs)
  const NON_BOLLYWOOD_ARTIST_REGEX =
    /\b(?:selena gomez|rick astley|ed sheeran|taylor swift|the weeknd|coldplay|dua lipa|billie eilish|eminem|drake|justin bieber|post malone|shawn mendes|charlie puth|marshmello|alan walker|chainsmokers|imagine dragons|maroon 5|katy perry|ariana grande|bruno mars|shubh|bohemia|sidhu moose|karan aujla|ap dhillon|ritviz)\b/i

  const NON_BOLLYWOOD_TITLE_REGEX =
    /\b(?:never gonna give you up|wolves|same beef|cheques|udd gaye|raahi|breathless album|sage|chalo chalein|bad guy|rap god|shape of you|believer)\b/i

  const NON_HINDI_FILM_REGEX =
    /\b(?:gujarati|marathi|punjabi|bhojpuri|tamil|telugu|kannada|malayalam|fakt purusho maate|mumbai pune mumbai|reva|kantara)\b/i

  const bollywoodCandidates = songCandidates.filter((item) => {
    const title = item.cleanTitle.toLowerCase()
    const artist = (item.artistOrChannel || '').toLowerCase()
    const film = (item.movieOrAlbum || '').toLowerCase()

    if (NON_BOLLYWOOD_ARTIST_REGEX.test(artist) || NON_BOLLYWOOD_ARTIST_REGEX.test(title)) {
      return false
    }
    if (NON_BOLLYWOOD_TITLE_REGEX.test(title)) {
      return false
    }
    if (NON_HINDI_FILM_REGEX.test(title) || NON_HINDI_FILM_REGEX.test(film)) {
      return false
    }
    return true
  })

  console.log(
    `✓ Filtered ${songCandidates.length} raw candidates down to ${bollywoodCandidates.length} pure Bollywood candidates (dropped ${songCandidates.length - bollywoodCandidates.length} non-Bollywood).\n`,
  )

  // Step 2: Resolve on iTunes using High-Speed Parallel Worker Pool + Persistent Cache
  console.log('── Step 2: Resolving metadata & audio previews on iTunes (Safe Pacing, Strict Bollywood) ───')
  const concurrency = 1
  let lastReport = 0

  const {
    resolvedMap: resolvedSongsMap,
    matchedCount,
    failedCount,
    cacheHitCount,
  } = await resolveItunesTracksBatch(bollywoodCandidates, {
    concurrency,
    onProgress: ({ current, total, matched, failed, fromCache, currentTitle }) => {
      const now = Date.now()
      if (now - lastReport > 350 || current === total) {
        lastReport = now
        const pct = Math.round((current / total) * 100)
        const titleSnippet = currentTitle.length > 25 ? currentTitle.slice(0, 25) + '…' : currentTitle
        process.stdout.write(
          `\r  [${current}/${total}] (${pct}%) | Matched: ${matched} | Missed: ${failed} | Cache hits: ${fromCache} | "${titleSnippet}"                 `,
        )
      }
    },
  })

  console.log(`\n\n✓ iTunes Matching Complete: ${matchedCount} matched, ${failedCount} skipped (${cacheHitCount} loaded from cache).`)
  console.log(`✓ Unique songs from playlists: ${resolvedSongsMap.size}\n`)

  // Step 3: Check era balance & backfill
  console.log('── Step 3: Era Distribution & Backfilling ──────────────────')

  const eraCounts: Record<Era, number> = {
    '50s-70s': 0,
    '80s': 0,
    '90s': 0,
    '2000s': 0,
    '2010s': 0,
    '2020s': 0,
  }

  for (const song of resolvedSongsMap.values()) {
    eraCounts[song.era] = (eraCounts[song.era] || 0) + 1
  }

  console.log('Current era breakdown:')
  for (const era of ALL_ERAS) {
    console.log(`  • ${era.padEnd(8)}: ${eraCounts[era]} songs`)
  }

  for (const era of ALL_ERAS) {
    if (eraCounts[era] < MIN_SONGS_PER_ERA) {
      const needed = MIN_SONGS_PER_ERA - eraCounts[era]
      console.log(`\n→ Backfilling era "${era}" (needs at least ${needed} more songs)…`)

      const queries = BACKFILL_QUERIES[era] ?? []
      let eraAdded = 0

      for (const query of queries) {
        if (eraCounts[era] >= MIN_SONGS_PER_ERA) break
        console.log(`  Searching iTunes for: "${query}"`)
        const tracks = await searchItunes(query, 30)
        await sleep(300)

        for (const t of tracks) {
          if (eraCounts[era] >= MIN_SONGS_PER_ERA) break
          if (!t.previewUrl) continue
          if (!isCleanSongTitle(t.trackName)) continue

          const year = new Date(t.releaseDate).getFullYear() || 1990
          const trackEra = yearToEra(year)
          if (trackEra !== era) continue

          const canonical = cleanCanonicalTitle(t.trackName)
          const dedupKey = normalizeText(canonical)

          if (resolvedSongsMap.has(dedupKey)) continue

          const filmName =
            (t.collectionName ?? '')
              .replace(
                /\s*[\(\[]\s*(?:original motion picture soundtrack|soundtrack)[^\)\]]+[\)\]]/gi,
                '',
              )
              .replace(/\s*-\s*single\s*$/i, '')
              .trim() || canonical

          const aliasSet = new Set<string>()
          aliasSet.add(normalizeText(canonical))
          if (t.trackName !== canonical) aliasSet.add(normalizeText(t.trackName))
          if (filmName !== canonical) aliasSet.add(normalizeText(`${canonical} ${filmName}`))

          resolvedSongsMap.set(dedupKey, {
            canonicalTitle: canonical,
            film: filmName,
            year,
            era: trackEra,
            artists: [t.artistName],
            composer: t.artistName,
            sourcePlatform: 'itunes',
            trackId: t.trackId.toString(),
            previewUrl: t.previewUrl,
            popularityScore: 50, // backfilled songs have base popularity
            aliases: Array.from(aliasSet),
          })

          eraCounts[era]++
          eraAdded++
        }
      }

      console.log(`  ✓ Added ${eraAdded} songs to "${era}". New count: ${eraCounts[era]}`)
    }
  }

  console.log('\nFinal era counts:')
  for (const era of ALL_ERAS) {
    console.log(`  • ${era.padEnd(8)}: ${eraCounts[era]} songs`)
  }

  const allSongs = Array.from(resolvedSongsMap.values())
  console.log(`\n✓ Total curated & balanced library: ${allSongs.length} songs\n`)

  // Step 4: Database Update (if DATABASE_URL is available)
  if (databaseUrl && !isLocalOnly) {
    console.log('── Step 4: Updating Neon Database ──────────────────────────')
    const sql = neon(databaseUrl)

    // In replace mode: mark existing songs inactive
    console.log('  Deactivating old songs (fresh replace mode)…')
    await sql`UPDATE songs SET active = false`

    let dbUpserted = 0
    for (const song of allSongs) {
      const rows = (await sql`
        INSERT INTO songs (
          canonical_title, film, year, era, artists, composer,
          source_platform, track_id, preview_url,
          difficulty, popularity_score, active
        ) VALUES (
          ${song.canonicalTitle},
          ${song.film},
          ${song.year},
          ${song.era},
          ${song.artists},
          ${song.composer},
          ${song.sourcePlatform},
          ${song.trackId},
          ${song.previewUrl},
          3,
          ${song.popularityScore},
          true
        )
        ON CONFLICT (source_platform, track_id) DO UPDATE
          SET canonical_title = EXCLUDED.canonical_title,
              film            = EXCLUDED.film,
              preview_url     = EXCLUDED.preview_url,
              popularity_score= EXCLUDED.popularity_score,
              active          = true,
              updated_at      = NOW()
        RETURNING id
      `) as Array<{ id: string }>

      const songId = rows[0]?.id
      if (songId) {
        for (const alias of song.aliases) {
          await sql`
            INSERT INTO song_aliases (song_id, alias)
            VALUES (${songId}, ${alias})
            ON CONFLICT (song_id, alias) DO NOTHING
          `
        }
        dbUpserted++
      }
    }

    console.log(`  ✓ Successfully upserted ${dbUpserted} active songs in Neon DB!`)
  }

  // Step 5: Export to apps/web/public/catalogue.json
  console.log('\n── Step 5: Exporting apps/web/public/catalogue.json ─────────')
  const outPath = join(__dirname, '..', 'apps', 'web', 'public', 'catalogue.json')

  const catalogueData: CatalogueEntry[] = allSongs.map((s) => ({
    id: `song-${s.trackId}`,
    t: s.canonicalTitle,
    f: s.film,
    y: s.year,
    a: s.artists,
    al: s.aliases,
  }))

  writeFileSync(outPath, JSON.stringify(catalogueData, null, 2))
  console.log(`✓ Exported ${catalogueData.length} deduplicated songs to ${outPath}`)

  console.log('\n╔═══════════════════════════════════════════════════════════╗')
  console.log('║               SEEDING & DEDUPLICATION COMPLETE            ║')
  console.log('╚═══════════════════════════════════════════════════════════╝\n')
}

main().catch((err) => {
  console.error('\n✖ Seeding failed:', err)
  process.exit(1)
})
