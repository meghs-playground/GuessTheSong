import { GameBoardClient } from '@/components/game/GameBoardClient'

export default function HomePage() {
  return (
    <main style={{ minHeight: '100dvh', background: '#a7e2e3' }}>
      <GameBoardClient />
    </main>
  )
}
