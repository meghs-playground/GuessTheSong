'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClipIndex, Era, GuessResult, RoundResult, SearchResult, SongReveal } from '@dhun/shared'
import { CLIP_DURATIONS, MAX_ATTEMPTS } from '@dhun/shared'
import { AudioEngine } from '@/lib/audio/engine'
import { apiClient } from '@/lib/api/client'
import { search, loadCatalogue } from '@/lib/search/index'
import { loadStats, saveStats, applyRoundResult, roundScore } from '@/lib/stats/index'
import { buildShareText, shareResult } from '@/lib/stats/share'

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

const initialState: GameState = {
  phase: 'idle',
  currentAttempt: 0,
  results: [],
  guesses: [],
  roundToken: null,
  reveal: null,
  isPlaying: false,
  score: 0,
  shareStatus: 'idle',
}

export function useGame(era: Era | null) {
  const [state, setState] = useState<GameState>(initialState)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [stats, setStats] = useState(() => loadStats())
  const engineRef = useRef<AudioEngine | null>(null)
  // Prefetch slot for the next round
  const prefetchRef = useRef<{ token: string; engine: AudioEngine } | null>(null)

  // Load catalogue once
  useEffect(() => {
    loadCatalogue().catch(console.error)
  }, [])

  // Ensure engine exists
  function getEngine(): AudioEngine {
    if (!engineRef.current) engineRef.current = new AudioEngine()
    return engineRef.current
  }

  // Prefetch the next song in the background
  const prefetchNext = useCallback(async () => {
    try {
      const { roundToken } = await apiClient.startRound(era ?? undefined)
      const { url } = await apiClient.resolveAudio(roundToken)
      const eng = new AudioEngine()
      await eng.load(url)
      prefetchRef.current = { token: roundToken, engine: eng }
    } catch {
      // Non-fatal: next round will just load fresh
    }
  }, [era])

  const startRound = useCallback(async () => {
    setState((s) => ({ ...s, phase: 'loading' }))

    try {
      let token: string
      let eng: AudioEngine

      if (prefetchRef.current) {
        // Use prefetched data
        ;({ token, engine: eng } = prefetchRef.current)
        prefetchRef.current = null
        engineRef.current?.dispose()
        engineRef.current = eng
      } else {
        const { roundToken } = await apiClient.startRound(era ?? undefined)
        token = roundToken
        const { url } = await apiClient.resolveAudio(token)
        eng = getEngine()
        await eng.load(url)
      }

      setState({
        ...initialState,
        phase: 'between-clips',
        roundToken: token,
        currentAttempt: 0,
      })

      // Start prefetching the next song
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

  const submitGuess = useCallback(
    async (selected: SearchResult) => {
      if (!state.roundToken || state.phase === 'revealed') return
      engineRef.current?.stop()

      try {
        const resp = await apiClient.guess({
          roundToken: state.roundToken,
          guess: selected.canonicalTitle,
        })

        const newResults: GuessResult[] = [...state.results, resp.result]
        const newGuesses = [...state.guesses, selected.canonicalTitle]
        const nextAttempt = (state.currentAttempt + 1) as ClipIndex
        const isOver =
          resp.result === 'correct' || nextAttempt >= MAX_ATTEMPTS

        if (isOver && resp.reveal) {
          const guessedCorrectly = resp.result === 'correct'
          const attemptsUsed = newResults.length
          const score = roundScore(attemptsUsed, guessedCorrectly)

          const roundResult: RoundResult = {
            songId: '',
            canonicalTitle: resp.reveal.canonicalTitle,
            film: resp.reveal.film,
            attemptsUsed,
            guessedCorrectly,
          }

          const newStats = applyRoundResult(stats, roundResult)
          saveStats(newStats)
          setStats(newStats)

          setState((s) => ({
            ...s,
            phase: 'revealed',
            results: newResults,
            guesses: newGuesses,
            reveal: resp.reveal!,
            isPlaying: false,
            score: s.score + score,
          }))
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
    [state, stats],
  )

  const skip = useCallback(async () => {
    if (!state.roundToken || state.phase === 'revealed') return
    engineRef.current?.stop()

    const newResults: GuessResult[] = [...state.results, 'skipped']
    const newGuesses = [...state.guesses, '']
    const nextAttempt = (state.currentAttempt + 1) as ClipIndex
    const isOver = nextAttempt >= MAX_ATTEMPTS

    if (isOver) {
      try {
        const resp = await apiClient.guess({
          roundToken: state.roundToken,
          guess: '',
        })

        if (resp.reveal) {
          const roundResult: RoundResult = {
            songId: '',
            canonicalTitle: resp.reveal.canonicalTitle,
            film: resp.reveal.film,
            attemptsUsed: MAX_ATTEMPTS,
            guessedCorrectly: false,
          }
          const newStats = applyRoundResult(stats, roundResult)
          saveStats(newStats)
          setStats(newStats)

          setState((s) => ({
            ...s,
            phase: 'revealed',
            results: newResults,
            guesses: newGuesses,
            reveal: resp.reveal!,
            isPlaying: false,
          }))
        }
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
  }, [state, stats])

  const giveUp = useCallback(async () => {
    if (!state.roundToken || state.phase === 'revealed') return
    engineRef.current?.stop()

    try {
      const resp = await apiClient.guess({ roundToken: state.roundToken, guess: '' })
      if (resp.reveal) {
        const roundResult: RoundResult = {
          songId: '',
          canonicalTitle: resp.reveal.canonicalTitle,
          film: resp.reveal.film,
          attemptsUsed: 0,
          guessedCorrectly: false,
        }
        const newStats = applyRoundResult(stats, roundResult)
        saveStats(newStats)
        setStats(newStats)

        setState((s) => ({
          ...s,
          phase: 'revealed',
          reveal: resp.reveal!,
          isPlaying: false,
        }))
      }
    } catch (err) {
      console.error('giveUp failed', err)
    }
  }, [state.roundToken, state.phase, stats])

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

  // Cleanup on unmount
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
