import { useState } from 'react'
import { FONT_SIZE_STEPS } from '../../shared/fontSize'
import { useToast } from '../../shared/Toast'
import { useAuth } from '../access/AuthContext'
import { PasswordSection } from './PasswordSection'
import { ProfileSection } from './ProfileSection'

export function SettingsPage() {
  const { account, changeFontSize } = useAuth()
  const { showSuccess, showError } = useToast()
  const [selected, setSelected] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  if (account === null) return null

  const saved = account.font_size
  const current = selected ?? saved
  const currentStep = FONT_SIZE_STEPS.find((option) => option.step === current)
  const hasChanges = current !== saved

  async function handleSave() {
    if (saving || !hasChanges || currentStep === undefined) return
    setSaving(true)
    try {
      await changeFontSize(currentStep.step)
      setSelected(null)
      showSuccess(`Tamaño de letra: ${currentStep.label}.`)
    } catch {
      setSelected(null)
      showError('No se pudo guardar el tamaño de letra. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="-m-4 flex min-h-[calc(100svh-4rem)] flex-col gap-4 bg-line/10 p-4 md:-m-6 md:p-6">
      <h1 className="text-3xl font-bold">Configuración</h1>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <ProfileSection />

        <PasswordSection />

        <section className="rounded-2xl border border-line bg-surface p-5" aria-labelledby="font-size-heading">
          <h2 id="font-size-heading" className="m-0 mb-1 text-2xl font-bold">
            Tamaño de letra
          </h2>
          <p className="m-0 mb-4 text-lg opacity-70">
            Elegí un tamaño, mirá la vista previa y después tocá Guardar. Queda guardado en tu
            cuenta y se ve igual en cualquier aparato.
          </p>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            {FONT_SIZE_STEPS.map((option) => {
              const isCurrent = option.step === current
              return (
                <button
                  key={option.step}
                  type="button"
                  aria-pressed={isCurrent}
                  onClick={() => setSelected(option.step)}
                  className={`min-h-16 whitespace-nowrap rounded-xl border-2 px-2 text-lg font-semibold transition-colors disabled:cursor-wait ${
                    isCurrent
                      ? 'border-brand bg-brand text-brand-contrast'
                      : 'border-line hover:border-brand hover:bg-surface-brand'
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>

          <div
            className="mt-5 rounded-xl bg-surface-brand p-4"
            style={{ fontSize: `${currentStep?.basePx ?? 16}px` }}
          >
            <p className="m-0 mb-1 text-[0.875em] font-semibold uppercase tracking-wider opacity-60">
              Vista previa
            </p>
            <p className="m-0 text-[1.5em] font-bold leading-tight">Casa Diaco</p>
            <p className="m-0 text-[1.125em]">
              Así se van a ver los textos de la aplicación con este tamaño.
            </p>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="h-14 whitespace-nowrap rounded-xl bg-brand px-8 text-lg font-semibold text-brand-contrast transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </section>
      </div>
    </section>
  )
}
