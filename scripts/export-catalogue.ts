/**
 * export-catalogue.ts
 *
 * Exports the song library from Neon DB to a compressed JSON file
 * that gets served from the Next.js /public directory for client-side search.
 *
 * Usage:
 *   DATABASE_URL=postgres://... tsx scripts/export-catalogue.ts
 *
 * Output: apps/web/public/catalogue.json
 *
 * The file is intentionally compact (short keys) to minimize download size.
 * At 5,000 songs with typical metadata, expect ~200–400KB uncompressed,
 * ~50–80KB gzip. Brotli on the CDN will compress it further.
 */

import { neon } from '@neondatabase/serverless'
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DATABASE_URL = process.env['DATABASE_URL']
if (!DATABASE_URL) throw new Error('DATABASE_URL env var is required')

const sql = neon(DATABASE_URL)

interface CatalogueEntry {
  id: string
  t: string    // canonical title
  f: string    // film
  y: number    // year
  a: string[]  // artists
  al: string[] // normalized aliases
}

async function main() {
  console.log('Exporting catalogue…')

  const songs = await sql`
    SELECT s.id, s.canonical_title, s.film, s.year, s.artists,
           COALESCE(
             ARRAY_AGG(sa.alias) FILTER (WHERE sa.alias IS NOT NULL),
             '{}'::text[]
           ) AS aliases
    FROM songs s
    LEFT JOIN song_aliases sa ON sa.song_id = s.id
    WHERE s.active = true
    GROUP BY s.id
    ORDER BY s.popularity_score DESC, s.year DESC
  ` as Array<{
    id: string
    canonical_title: string
    film: string
    year: number
    artists: string[]
    aliases: string[]
  }>

  const catalogue: CatalogueEntry[] = songs.map((s) => ({
    id: s.id,
    t: s.canonical_title,
    f: s.film,
    y: s.year,
    a: s.artists,
    al: s.aliases,
  }))

  const outPath = join(__dirname, '..', 'apps', 'web', 'public', 'catalogue.json')
  writeFileSync(outPath, JSON.stringify(catalogue))

  console.log(`Exported ${catalogue.length} songs → ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
