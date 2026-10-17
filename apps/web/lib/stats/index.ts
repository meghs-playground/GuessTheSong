import type { SessionStats, RoundResult } from '@dhun/shared'
import { MAX_ATTEMPTS } from '@dhun/shared'

const STORAGE_KEY = 'dhun_stats_v1'

export function loadStats(): SessionStats {
  if (typeof window === 'undefined') return defaultStats()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultStats()
    return JSON.parse(raw) as SessionStats
  } catch {
    return defaultStats()
  }
}

export function saveStats(stats: SessionStats): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats))
}

export function applyRoundResult(stats: SessionStats, result: RoundResult): SessionStats {
  const next = { ...stats }
  next.attemptDistribution = [...stats.attemptDistribution] as SessionStats['attemptDistribution']

  next.roundsPlayed += 1

  if (result.guessedCorrectly) {
    next.roundsGuessed += 1
    next.totalAttempts += result.attemptsUsed
    next.currentStreak += 1
    next.bestStreak = Math.max(next.bestStreak, next.currentStreak)
    const idx = (result.attemptsUsed - 1) as 0 | 1 | 2 | 3 | 4 | 5
    next.attemptDistribution[idx] += 1
  } else {
    next.currentStreak = 0
  }

  return next
}

/** Score for a round: 6 points for first try down to 1 for last, 0 for give-up */
export function roundScore(attemptsUsed: number, guessedCorrectly: boolean): number {
  if (!guessedCorrectly) return 0
  return Math.max(MAX_ATTEMPTS - attemptsUsed + 1, 1)
}

function defaultStats(): SessionStats {
  return {
    roundsPlayed: 0,
    roundsGuessed: 0,
    totalAttempts: 0,
    currentStreak: 0,
    bestStreak: 0,
    attemptDistribution: [0, 0, 0, 0, 0, 0],
  }
}
