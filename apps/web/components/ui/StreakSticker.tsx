interface StreakStickerProps {
  streak: number
  score: number
}

export function StreakSticker({ streak, score }: StreakStickerProps) {
  if (streak === 0 && score === 0) return null
  return (
    <div
      className="flex gap-3"
      aria-label={`Score: ${score}, Streak: ${streak}`}
    >
      {score > 0 && (
        <div
          className="bg-[var(--color-apricot)] brutal-border brutal-shadow-sm px-3 py-1 font-bold text-sm select-none"
          style={{ transform: 'rotate(-2deg)' }}
          aria-hidden="true"
        >
          {score} pts
        </div>
      )}
      {streak >= 2 && (
        <div
          className="bg-[var(--color-apricot)] brutal-border brutal-shadow-sm px-3 py-1 font-bold text-sm select-none"
          style={{ transform: 'rotate(2deg)' }}
          aria-hidden="true"
        >
          🔥 ×{streak}
        </div>
      )}
    </div>
  )
}
