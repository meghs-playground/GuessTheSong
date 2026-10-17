/**
 * Normalize a song title for fuzzy comparison.
 * Mirrors the logic in the DB query and the client-side search index.
 */
export function normalizeGuess(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacriticals
    .replace(/[^a-z0-9\u0900-\u097f\s]/g, '') // keep latin, devanagari, digits, spaces
    .replace(/\s+/g, ' ')
    .trim()
}
