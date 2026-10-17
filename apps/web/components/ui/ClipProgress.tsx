'use client'

import type { ClipIndex, GuessResult } from '@dhun/shared'
import { CLIP_DURATIONS } from '@dhun/shared'

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
  const result = results[idx]
  if (result === 'correct' || (isCorrect && idx === results.length - 1)) return 'correct'
  if (result === 'wrong' || result === 'skipped') return 'wrong'
  if (idx === currentAttempt) return 'current'
  if (idx < currentAttempt) return 'unlocked'
  return 'locked'
}

const STATE_CLASS: Record<StepState, string> = {
  locked:   'step-locked',
  current:  'step-current',
  unlocked: 'step-unlocked',
  wrong:    'step-wrong',
  correct:  'step-correct',
}

const STATE_LABEL: Record<StepState, string> = {
  locked:   'locked',
  current:  'current',
  unlocked: 'unlocked',
  wrong:    'wrong',
  correct:  'correct',
}

export function ClipProgress({ currentAttempt, results, isCorrect }: ClipProgressProps) {
  return (
    <div className="flex gap-1.5 w-full" role="list" aria-label="Clip attempts">
      {CLIP_DURATIONS.map((duration, idx) => {
        const state = getStepState(idx, currentAttempt, results, isCorrect)
        return (
          <div
            key={idx}
            role="listitem"
            aria-label={`Clip ${idx + 1}: ${duration}s – ${STATE_LABEL[state]}`}
            className={`flex-1 h-11 border-3 border-black box-border flex items-center justify-center text-xs font-black select-none ${STATE_CLASS[state]}`}
            style={{ border: '3px solid #000', boxShadow: '2px 2px 0 #000' }}
          >
            {duration}s
          </div>
        )
      })}
    </div>
  )
}
