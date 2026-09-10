import { CrossIcon } from './icons'

interface Props {
  message: string
  onRetry: () => void
}

export function LoadErrorCard({ message, onRetry }: Props) {
  return (
    <div
      role="alert"
      className="relative mx-auto mt-8 flex w-full max-w-md flex-col items-center gap-2 rounded-2xl border border-line bg-surface px-6 pb-7 pt-12 text-center shadow-sm"
    >
      <span className="absolute -top-8 flex h-16 w-16 items-center justify-center rounded-full border-4 border-surface bg-danger text-white">
        <CrossIcon className="h-8 w-8" />
      </span>
      <h2 className="m-0 text-3xl font-bold">Error</h2>
      <p className="m-0 text-xl opacity-80">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 h-14 rounded-full bg-danger px-7 text-lg font-bold text-white transition-colors hover:bg-danger/90"
      >
        Reintentar
      </button>
    </div>
  )
}
