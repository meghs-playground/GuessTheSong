import type { GuessResult } from '@dhun/shared'
import { MAX_ATTEMPTS } from '@dhun/shared'

const EMOJI: Record<GuessResult, string> = {
  correct: '🟩',
  wrong: '🟥',
  skipped: '⬛',
}

/**
 * Generate the Wordle-style emoji grid for sharing.
 * Remaining locked slots are shown as ⬜.
 */
export function buildShareText(
  canonicalTitle: string,
  results: GuessResult[],
  guessedCorrectly: boolean,
  score: number,
  streak: number,
): string {
  const grid = results.map((r) => EMOJI[r]).join('')
  const blanks = '⬜'.repeat(MAX_ATTEMPTS - results.length)
  const attemptStr = guessedCorrectly ? `${results.length}/${MAX_ATTEMPTS}` : 'X/' + MAX_ATTEMPTS

  const lines = [
    `🎵 Dhun – Bollywood Heardle`,
    `${attemptStr} ${grid}${blanks}`,
    score > 0 ? `Score: ${score} pts${streak >= 2 ? ` · 🔥 ×${streak}` : ''}` : '',
    ``,
    `Play: https://dhun.app`,
  ]

  return lines.filter(Boolean).join('\n')
}

export async function shareResult(text: string): Promise<'shared' | 'copied'> {
  if (navigator.share) {
    try {
      await navigator.share({ text })
      return 'shared'
    } catch {
      // User cancelled or share failed — fall through to clipboard
    }
  }
  await navigator.clipboard.writeText(text)
  return 'copied'
}
