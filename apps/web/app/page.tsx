import dynamic from 'next/dynamic'

// Disable SSR entirely for the game — it uses Web Audio API, localStorage,
// and AudioContext which don't exist on the server. This also eliminates
// all hydration mismatches.
const GameBoard = dynamic(
  () => import('@/components/game/GameBoard').then((m) => m.GameBoard),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          minHeight: '100dvh',
          background: '#a7e2e3',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            background: '#fff',
            border: '3px solid #000',
            boxShadow: '4px 4px 0 #000',
            padding: '24px 40px',
            fontWeight: 800,
            fontSize: '1.1rem',
          }}
        >
          Loading Dhun…
        </div>
      </div>
    ),
  },
)

export default function HomePage() {
  return (
    <main style={{ minHeight: '100dvh', background: '#a7e2e3' }}>
      <GameBoard />
    </main>
  )
}
