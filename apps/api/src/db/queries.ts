import type { Sql } from './client'
import type { Era } from '@dhun/shared'

// Neon's tagged template returns a union; cast results via this helper
function rows<T>(result: unknown): T[] {
  return result as T[]
}

export interface SongRow {
  id: string
  canonical_title: string
  film: string
  year: number
  era: Era
  artists: string[]
  composer: string
  source_platform: string
  track_id: string
  preview_url: string
  difficulty: number
  popularity_score: number
}

export interface AliasRow {
  alias: string
}

/**
 * Pick one random active song, optionally filtered by era.
 * Uses a fast ORDER BY RANDOM() LIMIT 1 — fine at 5k-20k rows.
 * For larger catalogues, precompute ID lists per era in Redis.
 */
export async function getRandomSong(sql: Sql, era?: Era, excludeIds: string[] = []): Promise<SongRow | null> {
  // Build exclude clause — only applies if we have IDs to exclude
  // If excluding would leave no results, fall back to ignoring excludes
  const result = era
    ? excludeIds.length > 0
      ? await sql`
          SELECT id, canonical_title, film, year, era, artists, composer,
                 source_platform, track_id, preview_url, difficulty, popularity_score
          FROM songs
          WHERE active = true AND era = ${era} AND id != ALL(${excludeIds}::text[])
          ORDER BY RANDOM() LIMIT 1
        `
      : await sql`
          SELECT id, canonical_title, film, year, era, artists, composer,
                 source_platform, track_id, preview_url, difficulty, popularity_score
          FROM songs
          WHERE active = true AND era = ${era}
          ORDER BY RANDOM() LIMIT 1
        `
    : excludeIds.length > 0
      ? await sql`
          SELECT id, canonical_title, film, year, era, artists, composer,
                 source_platform, track_id, preview_url, difficulty, popularity_score
          FROM songs
          WHERE active = true AND id != ALL(${excludeIds}::text[])
          ORDER BY RANDOM() LIMIT 1
        `
      : await sql`
          SELECT id, canonical_title, film, year, era, artists, composer,
                 source_platform, track_id, preview_url, difficulty, popularity_score
          FROM songs
          WHERE active = true
          ORDER BY RANDOM() LIMIT 1
        `

  // If exclude filtered out everything, retry without exclusions
  const found = rows<SongRow>(result)[0]
  if (!found && excludeIds.length > 0) {
    return getRandomSong(sql, era)
  }
  return found ?? null
}

/** Fetch all normalized aliases for a song */
export async function getSongAliases(sql: Sql, songId: string): Promise<string[]> {
  const result = await sql`
    SELECT alias FROM song_aliases WHERE song_id = ${songId}
  `
  return rows<AliasRow>(result).map((r) => r.alias)
}

/** Fetch song by ID (used at reveal time) */
export async function getSongById(sql: Sql, id: string): Promise<SongRow | null> {
  const result = await sql`
    SELECT id, canonical_title, film, year, era, artists, composer,
           source_platform, track_id, preview_url, difficulty, popularity_score
    FROM songs WHERE id = ${id}
  `
  return rows<SongRow>(result)[0] ?? null
}

/**
 * Check if a guess matches a song's canonical title or any alias.
 * Normalization (lowercase, no diacritics/punctuation) is done by the caller.
 */
export async function isCorrectGuess(
  sql: Sql,
  songId: string,
  normalizedGuess: string,
): Promise<boolean> {
  const result = await sql`
    SELECT 1 FROM songs
    WHERE id = ${songId}
      AND (
        LOWER(REGEXP_REPLACE(canonical_title, '[^a-zA-Z0-9\u0900-\u097F ]', '', 'g')) = ${normalizedGuess}
        OR EXISTS (
          SELECT 1 FROM song_aliases
          WHERE song_id = ${songId} AND alias = ${normalizedGuess}
        )
      )
    LIMIT 1
  `
  return rows<unknown>(result).length > 0
}

/** Mark a song inactive (bad quality, wrong metadata, DMCA) */
export async function deactivateSong(sql: Sql, id: string): Promise<void> {
  await sql`UPDATE songs SET active = false WHERE id = ${id}`
}
