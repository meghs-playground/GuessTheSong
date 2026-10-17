import dynamic from 'next/dynamic'

const GameBoard = dynamic(
  () => import('@/components/game/GameBoard').then((m) => m.GameBoard),
  { ssr: false },
)

export default function HomePage() {
  return (
    <main style={{ minHeight: '100dvh', background: '#a7e2e3' }}>
      <GameBoard />
    </main>
  )
}
