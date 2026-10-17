'use client'

import { useState } from 'react'
import type { Era } from '@dhun/shared'
import { useGame } from '@/hooks/useGame'
import { ClipProgress } from '@/components/ui/ClipProgress'
import { PlayButton } from '@/components/ui/PlayButton'
import { SearchBox } from '@/components/ui/SearchBox'
import { GuessChip } from '@/components/ui/GuessChip'
import { RevealCard } from '@/components/ui/RevealCard'
import { EraFilter } from '@/components/ui/EraFilter'
import { StreakSticker } from '@/components/ui/StreakSticker'
import { StatsPanel } from '@/components/game/StatsPanel'

export function GameBoard() {
  const [era, setEra] = useState<Era | null>(null)
  const [showStats, setShowStats] = useState(false)

  const {
    state,
    stats,
    searchResults,
    startRound,
    playClip,
    stopClip,
    handleSearch,
    submitGuess,
    skip,
    giveUp,
    share,
  } = useGame(era)

  const { phase, currentAttempt, results, guesses, reveal, isPlaying, score, shareStatus } = state
  const isRevealed = phase === 'revealed'
  const isLoading = phase === 'loading'
  const hasStarted = phase !== 'idle'

  return (
    <div className="flex flex-col gap-6 w-full max-w-lg mx-auto px-4 py-8">
      {/* Header */}
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-black tracking-tight">Dhun 🎵</h1>
        <div className="flex items-center gap-3">
          <StreakSticker streak={stats.currentStreak} score={score} />
          <button
            onClick={() => setShowStats((v) => !v)}
            className="brutal-btn bg-[var(--color-paper)] px-3 py-2 text-sm font-bold"
            aria-label="View stats"
            aria-expanded={showStats}
          >
            Stats
          </button>
        </div>
      </header>

      {/* Stats panel */}
      {showStats && (
        <StatsPanel stats={stats} onClose={() => setShowStats(false)} />
      )}

      {/* Era filter */}
      <EraFilter selected={era} onChange={setEra} />

      {/* Start / idle state */}
      {phase === 'idle' && (
        <div className="flex flex-col items-center gap-6 py-8">
          <p className="text-lg font-medium text-center">
            Hear a tiny clip. Guess the Bollywood song.
          </p>
          <button
            onClick={startRound}
            className="brutal-btn bg-[var(--color-maya-blue)] px-8 py-4 text-xl font-black"
          >
            Play
          </button>
        </div>
      )}

      {/* Active round */}
      {hasStarted && (
        <>
          {/* Clip progress bar */}
          <ClipProgress
            currentAttempt={currentAttempt}
            results={results}
            isCorrect={results.at(-1) === 'correct'}
          />

          {/* Play / Stop controls */}
          {!isRevealed && (
            <div className="flex items-center gap-4">
              <PlayButton
                isPlaying={isPlaying}
                isLoading={isLoading}
                onClick={isPlaying ? stopClip : playClip}
                disabled={isLoading}
              />
              <span className="text-sm font-medium text-gray-600" aria-live="polite">
                {isLoading
                  ? 'Loading song…'
                  : isPlaying
                  ? 'Playing…'
                  : 'Press play to hear the clip'}
              </span>
            </div>
          )}

          {/* Previous guesses */}
          {guesses.length > 0 && (
            <div className="flex flex-col gap-2" aria-label="Previous guesses" role="list">
              {guesses.map((g, i) => {
                const r = results[i]
                if (r === 'correct') return null
                return (
                  <GuessChip
                    key={i}
                    title={g || ''}
                    type={r === 'skipped' ? 'skipped' : 'wrong'}
                  />
                )
              })}
            </div>
          )}

          {/* Search + action buttons */}
          {!isRevealed && (
            <div className="flex flex-col gap-3">
              <SearchBox
                results={searchResults}
                onSearch={handleSearch}
                onSelect={submitGuess}
                disabled={isLoading || isRevealed}
                placeholder="Search song, film or artist…"
              />
              <div className="flex gap-3">
                <button
                  onClick={skip}
                  disabled={isLoading || isRevealed}
                  className="brutal-btn bg-[var(--color-paper)] flex-1 py-2 font-bold text-sm disabled:opacity-50"
                >
                  Skip →
                </button>
                <button
                  onClick={giveUp}
                  disabled={isLoading || isRevealed}
                  className="brutal-btn bg-[var(--color-orchid)] flex-1 py-2 font-bold text-sm disabled:opacity-50"
                >
                  Give Up
                </button>
              </div>
            </div>
          )}

          {/* Reveal card */}
          {isRevealed && reveal && (
            <RevealCard
              reveal={reveal}
              guessedCorrectly={results.at(-1) === 'correct'}
              attemptsUsed={results.length}
              onNext={startRound}
              onShare={share}
            />
          )}

          {/* Share feedback */}
          {shareStatus !== 'idle' && (
            <p className="text-center font-bold text-sm" role="status" aria-live="polite">
              {shareStatus === 'shared' ? '✓ Shared!' : '✓ Copied to clipboard!'}
            </p>
          )}
        </>
      )}
    </div>
  )
}
