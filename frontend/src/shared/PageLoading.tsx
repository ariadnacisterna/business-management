export function PageLoading() {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center" role="status">
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-brand" />
      <p className="text-xl font-semibold">Cargando…</p>
    </div>
  )
}
