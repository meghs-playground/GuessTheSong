'use client'

import type { ClipIndex, GuessResult } from '@dhun/shared'
import { CLIP_DURATIONS, MAX_ATTEMPTS } from '@dhun/shared'

type StepState = 'locked' | 'current' | 'unlocked' | 'wrong' | 'correct'

interface ClipProgressProps {
  currentAttempt: ClipIndex
  results: GuessResult[]
  isCorrect: boolean
}

function getStepState(
  idx: number,
  currentAttempt: ClipIndex,
  results: GuessResult[],
  isCorrect: boolean,
): StepState {
  if (isCorrect && idx === results.length - 1) return 'correct'
  const result = results[idx]
  if (result === 'wrong' || result === 'skipped') return 'wrong'
  if (idx === currentAttempt) return 'current'
  if (idx < currentAttempt) return 'unlocked'
  return 'locked'
}

const STATE_CLASSES: Record<StepState, string> = {
  locked: 'clip-locked',
  current: 'clip-current',
  unlocked: 'clip-unlocked',
  wrong: 'clip-wrong',
  correct: 'clip-correct',
}

const STATE_LABEL: Record<StepState, string> = {
  locked: 'locked',
  current: 'current',
  unlocked: 'unlocked',
  wrong: 'wrong guess',
  correct: 'correct',
}

export function ClipProgress({ currentAttempt, results, isCorrect }: ClipProgressProps) {
  return (
    <div className="flex gap-2 w-full" role="list" aria-label="Clip attempts">
      {CLIP_DURATIONS.map((duration, idx) => {
        const state = getStepState(idx, currentAttempt, results, isCorrect)
        return (
          <div
            key={idx}
            role="listitem"
            aria-label={`Clip ${idx + 1}: ${duration}s – ${STATE_LABEL[state]}`}
            className={`
              flex-1 h-10 brutal-border brutal-shadow-sm flex items-center justify-center
              text-xs font-bold text-ink select-none
              ${STATE_CLASSES[state]}
            `}
          >
            {duration}s
          </div>
        )
      })}
    </div>
  )
}
