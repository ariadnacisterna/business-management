import { Component, type ReactNode } from 'react'

type ErrorBoundaryProps = {
  children: ReactNode
  resetKey?: string
}

type ErrorBoundaryState = {
  failed: boolean
  resetKey: string | undefined
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false, resetKey: this.props.resetKey }

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { failed: true }
  }

  static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState,
  ): ErrorBoundaryState | null {
    if (props.resetKey === state.resetKey) return null
    return { failed: false, resetKey: props.resetKey }
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <div
        className="flex flex-col items-center gap-4 py-12 text-center"
        role="alert"
      >
        <p className="max-w-xl text-xl font-semibold">
          No se pudo cargar esta pantalla. Puede ser un corte de conexión o una versión nueva de
          la aplicación.
        </p>
        <button
          type="button"
          className="rounded-lg bg-brand px-6 py-3 text-xl font-semibold text-white"
          onClick={() => window.location.reload()}
        >
          Recargar
        </button>
      </div>
    )
  }
}
