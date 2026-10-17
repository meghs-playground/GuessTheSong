interface StreakStickerProps {
  streak: number
  score: number
}

export function StreakSticker({ streak, score }: StreakStickerProps) {
  if (streak === 0 && score === 0) return null
  return (
    <div style={{ display: 'flex', gap: 8 }} aria-label={`Score: ${score}, Streak: ${streak}`}>
      {score > 0 && (
        <div
          className="sticker-left"
          style={{
            background: '#f9c784',
            border: '3px solid #000',
            boxShadow: '2px 2px 0 #000',
            padding: '4px 10px',
            fontWeight: 800,
            fontSize: '0.8rem',
            userSelect: 'none',
          }}
          aria-hidden="true"
        >
          {score} pts
        </div>
      )}
      {streak >= 2 && (
        <div
          className="sticker-right"
          style={{
            background: '#f9c784',
            border: '3px solid #000',
            boxShadow: '2px 2px 0 #000',
            padding: '4px 10px',
            fontWeight: 800,
            fontSize: '0.8rem',
            userSelect: 'none',
          }}
          aria-hidden="true"
        >
          🔥 ×{streak}
        </div>
      )}
    </div>
  )
}
