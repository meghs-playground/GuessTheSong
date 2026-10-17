'use client'

interface PlayButtonProps {
  isPlaying: boolean
  isLoading: boolean
  onClick: () => void
  disabled?: boolean
}

export function PlayButton({ isPlaying, isLoading, onClick, disabled }: PlayButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || isLoading}
      className="brutal-btn bg-[var(--color-maya-blue)] w-16 h-16 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
      aria-label={isLoading ? 'Loading…' : isPlaying ? 'Pause clip' : 'Play clip'}
    >
      {isLoading ? (
        <LoadingIcon />
      ) : isPlaying ? (
        <PauseIcon />
      ) : (
        <PlayIcon />
      )}
    </button>
  )
}

function PlayIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  )
}

function LoadingIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      className="animate-spin"
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  )
}
