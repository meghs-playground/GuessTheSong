'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ClipIndex,
  Era,
  GuessResult,
  RoundResult,
  SearchResult,
  SongReveal,
} from '@dhun/shared'
import { CLIP_DURATIONS, MAX_ATTEMPTS } from '@dhun/shared'
import { AudioEngine } from '@/lib/audio/engine'
import { apiClient } from '@/lib/api/client'
import { search, loadCatalogue } from '@/lib/search/index'
import { loadStats, saveStats, applyRoundResult, roundScore, defaultStats } from '@/lib/stats/index'
import { buildShareText, shareResult } from '@/lib/stats/share'
import { getSeenIds, markSeen } from '@/lib/stats/seen'
import { initAnalytics, trackGameStart, trackGuess, trackGameFinish } from '@/lib/analytics/tracker'

type Phase = 'idle' | 'loading' | 'playing' | 'between-clips' | 'revealed'

interface GameState {
  phase: Phase
  currentAttempt: ClipIndex
  results: GuessResult[]
  guesses: string[]
  roundToken: string | null
  reveal: SongReveal | null
  isPlaying: boolean
  score: number
  shareStatus: 'idle' | 'shared' | 'copied'
}

const initialRoundState: Omit<GameState, 'score' | 'shareStatus'> = {
  phase: 'between-clips',
  currentAttempt: 0,
  results: [],
  guesses: [],
  roundToken: null,
  reveal: null,
  isPlaying: false,
}

export function useGame(era: Era | null) {
  const [state, setState] = useState<GameState>({
    ...initialRoundState,
    phase: 'idle',
    score: 0,
    shareStatus: 'idle',
  })
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  // Use default stats on first render (SSR-safe), hydrate from localStorage after mount
  const [stats, setStats] = useState(defaultStats)
  useEffect(() => {
    setStats(loadStats())
  }, [])
  const engineRef = useRef<AudioEngine | null>(null)
  const prefetchRef = useRef<{ token: string; engine: AudioEngine; songId: string } | null>(null)
  // Track era in a ref so prefetch always uses the latest value
  const eraRef = useRef<Era | null>(era)

  useEffect(() => {
    eraRef.current = era
  }, [era])

  useEffect(() => {
    loadCatalogue().catch(console.error)
    const cleanup = initAnalytics()
    return cleanup
  }, [])

  // When era changes mid-game, immediately start a new round
  const isFirstMount = useRef(true)
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false
      return
    }
    // Discard any prefetch for the old era
    if (prefetchRef.current) {
      prefetchRef.current.engine.dispose()
      prefetchRef.current = null
    }
    startRound()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [era])

  function getEngine(): AudioEngine {
    if (!engineRef.current) engineRef.current = new AudioEngine()
    return engineRef.current
  }

  const prefetchNext = useCallback(async () => {
    try {
      const currentEra = eraRef.current
      const seen = getSeenIds()
      const { roundToken } = await apiClient.startRound(currentEra ?? undefined, seen)
      const { url, songId } = await apiClient.resolveAudio(roundToken)
      const eng = new AudioEngine()
      await eng.load(url)
      // Only store if era hasn't changed while we were fetching
      if (eraRef.current === currentEra) {
        prefetchRef.current?.engine.dispose()
        prefetchRef.current = { token: roundToken, engine: eng, songId }
      } else {
        eng.dispose()
      }
    } catch {
      // Non-fatal
    }
  }, [])

  const startRound = useCallback(async () => {
    setState((s) => ({ ...s, phase: 'loading', isPlaying: false }))
    engineRef.current?.stop()

    try {
      let token: string
      let eng: AudioEngine
      let songId: string

      const seen = getSeenIds()

      if (prefetchRef.current) {
        ;({ token, engine: eng, songId } = prefetchRef.current)
        prefetchRef.current = null
        engineRef.current?.dispose()
        engineRef.current = eng
      } else {
        const resp = await apiClient.startRound(era ?? undefined, seen)
        token = resp.roundToken
        const audio = await apiClient.resolveAudio(token)
        songId = audio.songId
        eng = getEngine()
        await eng.load(audio.url)
      }

      markSeen(songId)
      trackGameStart(era)

      setState((s) => ({
        ...initialRoundState,
        phase: 'between-clips',
        roundToken: token,
        score: s.score,
        shareStatus: 'idle',
      }))

      prefetchNext()
    } catch (err) {
      console.error('startRound failed', err)
      setState((s) => ({ ...s, phase: 'idle' }))
    }
  }, [era, prefetchNext])

  const playClip = useCallback(() => {
    const eng = engineRef.current
    if (!eng) return
    const duration = CLIP_DURATIONS[state.currentAttempt]
    if (duration === undefined) return
    eng.play(duration, () => {
      setState((s) => ({ ...s, isPlaying: false, phase: 'between-clips' }))
    })
    setState((s) => ({ ...s, isPlaying: true, phase: 'playing' }))
  }, [state.currentAttempt])

  const stopClip = useCallback(() => {
    engineRef.current?.stop()
    setState((s) => ({ ...s, isPlaying: false, phase: 'between-clips' }))
  }, [])

  const handleSearch = useCallback((query: string) => {
    setSearchResults(search(query))
  }, [])

  const finishRound = useCallback(
    (newResults: GuessResult[], newGuesses: string[], reveal: SongReveal) => {
      const guessedCorrectly = newResults.at(-1) === 'correct'
      const attemptsUsed = newResults.length
      const score = roundScore(attemptsUsed, guessedCorrectly)

      const roundResult: RoundResult = {
        songId: '',
        canonicalTitle: reveal.canonicalTitle,
        film: reveal.film,
        attemptsUsed,
        guessedCorrectly,
      }
      const newStats = applyRoundResult(stats, roundResult)
      saveStats(newStats)
      setStats(newStats)

      trackGameFinish(guessedCorrectly, attemptsUsed, score, eraRef.current, reveal.canonicalTitle)

      setState((s) => ({
        ...s,
        phase: 'revealed',
        results: newResults,
        guesses: newGuesses,
        reveal,
        isPlaying: false,
        score: s.score + score,
      }))
    },
    [stats],
  )

  const submitGuess = useCallback(
    async (selected: SearchResult) => {
      if (!state.roundToken || state.phase === 'revealed') return
      engineRef.current?.stop()

      try {
        const resp = await apiClient.guess({
          roundToken: state.roundToken,
          guess: selected.canonicalTitle,
        })

        trackGuess(state.currentAttempt + 1, resp.result, selected.canonicalTitle)

        const newResults: GuessResult[] = [...state.results, resp.result]
        const newGuesses = [...state.guesses, selected.canonicalTitle]
        const nextAttempt = (state.currentAttempt + 1) as ClipIndex
        const isOver = resp.result === 'correct' || nextAttempt >= MAX_ATTEMPTS

        if (isOver && resp.reveal) {
          finishRound(newResults, newGuesses, resp.reveal)
        } else {
          setState((s) => ({
            ...s,
            results: newResults,
            guesses: newGuesses,
            currentAttempt: nextAttempt,
            phase: 'between-clips',
          }))
        }
        setSearchResults([])
      } catch (err) {
        console.error('submitGuess failed', err)
      }
    },
    [state, finishRound],
  )

  const skip = useCallback(async () => {
    if (!state.roundToken || state.phase === 'revealed') return
    engineRef.current?.stop()

    trackGuess(state.currentAttempt + 1, 'skipped')

    const newResults: GuessResult[] = [...state.results, 'skipped']
    const newGuesses = [...state.guesses, '']
    const nextAttempt = (state.currentAttempt + 1) as ClipIndex
    const isOver = nextAttempt >= MAX_ATTEMPTS

    if (isOver) {
      try {
        const resp = await apiClient.guess({ roundToken: state.roundToken, guess: '' })
        if (resp.reveal) finishRound(newResults, newGuesses, resp.reveal)
      } catch (err) {
        console.error('skip/reveal failed', err)
      }
    } else {
      setState((s) => ({
        ...s,
        results: newResults,
        guesses: newGuesses,
        currentAttempt: nextAttempt,
        phase: 'between-clips',
      }))
    }
  }, [state, finishRound])

  const giveUp = useCallback(async () => {
    if (!state.roundToken || state.phase === 'revealed') return
    engineRef.current?.stop()
    try {
      const resp = await apiClient.guess({ roundToken: state.roundToken, guess: '' })
      if (resp.reveal) finishRound(state.results, state.guesses, resp.reveal)
    } catch (err) {
      console.error('giveUp failed', err)
    }
  }, [state, finishRound])

  const share = useCallback(async () => {
    if (!state.reveal) return
    const text = buildShareText(
      state.reveal.canonicalTitle,
      state.results,
      state.results.at(-1) === 'correct',
      state.score,
      stats.currentStreak,
    )
    const status = await shareResult(text)
    setState((s) => ({ ...s, shareStatus: status }))
    setTimeout(() => setState((s) => ({ ...s, shareStatus: 'idle' })), 2500)
  }, [state.reveal, state.results, state.score, stats.currentStreak])

  useEffect(() => {
    return () => {
      engineRef.current?.dispose()
      prefetchRef.current?.engine.dispose()
    }
  }, [])

  return {
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
  }
}
