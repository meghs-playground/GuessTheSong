// ── Song ─────────────────────────────────────────────────────────────────────

export type Era = '50s-70s' | '80s' | '90s' | '2000s' | '2010s' | '2020s'

export interface Song {
  id: string
  canonicalTitle: string
  film: string
  year: number
  era: Era
  artists: string[]
  composer: string
  language: string
  sourcePlatform: 'itunes' | 'deezer'
  trackId: string
  previewUrl: string
  difficulty: number // 1-5
  popularityScore: number
}

export interface SongAlias {
  songId: string
  alias: string // normalized lowercase
}

// ── Round / game state ────────────────────────────────────────────────────────

export const CLIP_DURATIONS = [0.2, 0.5, 1, 2, 4, 8] as const
export type ClipIndex = 0 | 1 | 2 | 3 | 4 | 5
export const MAX_ATTEMPTS = CLIP_DURATIONS.length

export type GuessResult = 'correct' | 'wrong' | 'skipped'

export interface RoundStartResponse {
  /** Opaque signed token — never contains the answer */
  roundToken: string
  /** How long the full preview is (seconds) */
  previewDuration: number
  /** Filters that were active when this round was created */
  era: Era | null
}

export interface GuessRequest {
  roundToken: string
  guess: string // raw user input, server normalizes
}

export interface GuessResponse {
  result: GuessResult
  /** Only set when result === 'correct' or round is over */
  reveal?: SongReveal
}

export interface SongReveal {
  canonicalTitle: string
  film: string
  year: number
  artists: string[]
  composer: string
  previewUrl: string
  streamingLink: string // deep link to Apple Music
}

// ── Search ────────────────────────────────────────────────────────────────────

export interface SearchResult {
  songId: string
  display: string // "Title · Film (Year)"
  canonicalTitle: string
}

// ── Filters ───────────────────────────────────────────────────────────────────

export interface RoundFilters {
  era?: Era
}

// ── Stats (client-side only) ──────────────────────────────────────────────────

export interface SessionStats {
  roundsPlayed: number
  roundsGuessed: number
  totalAttempts: number
  currentStreak: number
  bestStreak: number
  /** attempt index (0-5) → count */
  attemptDistribution: [number, number, number, number, number, number]
}

export interface RoundResult {
  songId: string
  canonicalTitle: string
  film: string
  attemptsUsed: number // 1-6, 0 = gave up
  guessedCorrectly: boolean
}
