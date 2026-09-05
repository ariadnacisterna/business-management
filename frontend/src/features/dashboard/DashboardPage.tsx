export function DashboardPage() {
  return (
    <section className="-m-4 flex min-h-[calc(100svh-4rem)] flex-col gap-4 bg-line/10 p-4 md:-m-6 md:p-6">
      <div>
        <h1 className="text-3xl font-bold">Panel</h1>
        <p className="mt-1 text-lg opacity-60">Resumen general del negocio</p>
      </div>

      <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface px-6 py-16 text-center">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-10 w-10 opacity-40"
        >
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z" />
        </svg>
        <p className="text-xl font-semibold opacity-70">En construcción</p>
        <p className="text-lg opacity-50">Próximamente vas a ver acá el resumen de ingresos y egresos del negocio.</p>
      </div>
    </section>
  )
}
