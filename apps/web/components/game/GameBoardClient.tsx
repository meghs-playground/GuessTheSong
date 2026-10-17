'use client'

import dynamic from 'next/dynamic'

const GameBoard = dynamic(() => import('@/components/game/GameBoard').then((m) => m.GameBoard), {
  ssr: false,
})

export function GameBoardClient() {
  return <GameBoard />
}
