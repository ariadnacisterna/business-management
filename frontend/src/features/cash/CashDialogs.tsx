import { useState, type FormEvent, type ReactNode } from 'react'
import { addCashMovement, closeCashRegister, closeCashRegisterTransfers, type CashMovementKind, type CashRegister } from '../../api/cash'
import { errorMessage } from '../../api/client'
import { Breadcrumb } from '../../shared/Breadcrumb'
import { CloseButton } from '../../shared/CloseButton'
import { Dialog } from '../../shared/Dialog'
import { formatDateTime } from '../../shared/formatDateTime'
import { formatMoney } from '../../shared/formatPrice'
import { PriceInput } from '../../shared/PriceInput'
import { useToast } from '../../shared/useToast'
import { fieldClasses, primaryButtonClasses, secondaryButtonClasses } from '../sales/SaleDialogs'
import { differenceText, differenceTone, moneyProblem, REASON_MAX_LENGTH, STATUS_LABELS } from './cashMath'

function CashDialogShell({
  title,
  onClose,
  onSubmit,
  widthClass,
  children,
}: {
  title: string
  onClose: () => void
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
  widthClass: string
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <Dialog
        label={title}
        onClose={onClose}
        onSubmit={onSubmit}
        noValidate
        className={`scrollbar-clean relative flex max-h-[calc(100svh-2rem)] w-full ${widthClass} flex-col gap-4 overflow-y-auto rounded-2xl bg-surface p-5 shadow-2xl sm:p-6`}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Breadcrumb segments={['Caja', title]} />
            </div>
            <CloseButton onClose={onClose} />
          </div>
          <h2 className="m-0 text-window-title">{title}</h2>
        </div>
        {children}
      </Dialog>
    </div>
  )
}

function AmountField({
  label,
  value,
  onChange,
  error,
  autoFocus = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  error: string | null
  autoFocus?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-lg font-semibold">
        {label} <span className="text-danger">*</span>
      </span>
      <PriceInput
        value={value}
        onChange={onChange}
        ariaLabel={label}
        placeholder="0"
        autoFocus={autoFocus}
        className={`${fieldClasses} pl-8`}
      />
      {error !== null && (
        <p role="alert" className="m-0 text-lg text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

const MOVEMENT_TEXT: Record<CashMovementKind, { title: string; button: string; done: string; hint: string }> = {
  ingreso: {
    title: 'Ingresar efectivo',
    button: 'Ingresar',
    done: 'Efectivo ingresado.',
    hint: 'Para sumar plata a tu caja, por ejemplo para tener cambio.',
  },
  retiro: {
    title: 'Retirar efectivo',
    button: 'Retirar',
    done: 'Efectivo retirado.',
    hint: 'Para sacar plata de tu caja, por ejemplo para pagar el sueldo o la luz.',
  },
}

export function MovementDialog({
  kind,
  onClose,
  onDone,
}: {
  kind: CashMovementKind
  onClose: () => void
  onDone: (register: CashRegister) => void
}) {
  const { showSuccess, showError } = useToast()
  const text = MOVEMENT_TEXT[kind]
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const amountError = moneyProblem(amount, false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAttempted(true)
    if (amountError !== null || saving) return
    setSaving(true)
    try {
      const register = await addCashMovement(kind, amount, reason)
      showSuccess(text.done)
      onDone(register)
    } catch (error) {
      showError(errorMessage(error, 'No se pudo guardar el movimiento. Intentá de nuevo.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <CashDialogShell title={text.title} onClose={onClose} onSubmit={submit} widthClass="max-w-md">
      <p className="m-0 text-lg opacity-70">{text.hint}</p>
      <AmountField label="Importe" value={amount} onChange={setAmount} error={attempted ? amountError : null} autoFocus />
      <label className="flex flex-col gap-1.5">
        <span className="text-lg font-semibold">Motivo (opcional)</span>
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={REASON_MAX_LENGTH}
          placeholder="Por ejemplo: sueldo, luz, otros"
          className={fieldClasses}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className={primaryButtonClasses}>
          {text.button}
        </button>
        <button type="button" onClick={onClose} className={secondaryButtonClasses}>
          Cancelar
        </button>
      </div>
    </CashDialogShell>
  )
}

function Row({ label, value, strong = false, tone = '' }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? 'text-xl font-bold' : ''} ${tone}`}>
      <dt className={strong ? '' : 'opacity-70'}>{label}</dt>
      <dd className="m-0 whitespace-nowrap font-semibold">{value}</dd>
    </div>
  )
}

export function CashSummary({ register }: { register: CashRegister }) {
  const closed = register.status === 'cerrada'
  return (
    <div className="flex flex-col gap-4 text-lg">
      <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        <div>
          <dt className="inline opacity-60">Caja de: </dt>
          <dd className="m-0 inline [overflow-wrap:anywhere]">{register.account_name}</dd>
        </div>
        <div>
          <dt className="inline opacity-60">Estado: </dt>
          <dd className="m-0 inline font-semibold">{STATUS_LABELS[register.status]}</dd>
        </div>
        <div>
          <dt className="inline opacity-60">Abrió: </dt>
          <dd className="m-0 inline">{formatDateTime(register.opened_at)}</dd>
        </div>
        <div>
          <dt className="inline opacity-60">{closed ? 'Cerró: ' : 'Termina: '}</dt>
          <dd className="m-0 inline">{formatDateTime(register.closed_at ?? register.ends_at)}</dd>
        </div>
        {register.closed_by_account_name !== null && (
          <div>
            <dt className="inline opacity-60">Cerrada por: </dt>
            <dd className="m-0 inline [overflow-wrap:anywhere]">{register.closed_by_account_name}</dd>
          </div>
        )}
      </dl>

      <section aria-label="Efectivo" className="flex flex-col gap-1 border-t border-line pt-3">
        <h3 className="m-0 text-lg font-bold">Efectivo</h3>
        <dl className="m-0 flex flex-col gap-1">
          <Row label="Cobrado en ventas" value={formatMoney(register.cash_sales)} />
          <Row label="Devuelto por anulaciones" value={formatMoney(register.cash_voided)} />
          <Row label="Ingresos" value={formatMoney(register.deposits)} />
          <Row label="Retiros" value={formatMoney(register.withdrawals)} />
          <Row label="Efectivo esperado" value={formatMoney(register.expected_cash)} strong />
          {register.counted_cash !== null && <Row label="Efectivo contado" value={formatMoney(register.counted_cash)} />}
          {register.cash_difference !== null && (
            <Row label="Diferencia" value={differenceText(register.cash_difference)} tone={differenceTone(register.cash_difference)} />
          )}
        </dl>
      </section>

      {register.transfers_visible && register.transfer_sales !== null && register.transfer_voided !== null && register.expected_transfer !== null && (
        <section aria-label="Transferencias" className="flex flex-col gap-1 border-t border-line pt-3">
          <h3 className="m-0 text-lg font-bold">Transferencias</h3>
          <dl className="m-0 flex flex-col gap-1">
            <Row label="Cobrado en ventas" value={formatMoney(register.transfer_sales)} />
            <Row label="Devuelto por anulaciones" value={formatMoney(register.transfer_voided)} />
            <Row label="Transferencias esperadas" value={formatMoney(register.expected_transfer)} strong />
            {register.counted_transfer !== null && <Row label="Transferencias controladas" value={formatMoney(register.counted_transfer)} />}
            {register.transfer_difference !== null && (
              <Row label="Diferencia" value={differenceText(register.transfer_difference)} tone={differenceTone(register.transfer_difference)} />
            )}
          </dl>
        </section>
      )}

      <section aria-label="Fiado" className="flex flex-col gap-1 border-t border-line pt-3">
        <dl className="m-0 flex flex-col gap-1">
          <Row label="Vendido en fiado" value={formatMoney(register.fiado_sales)} />
        </dl>
      </section>

      {register.movements.length > 0 && (
        <section aria-label="Ingresos y retiros" className="flex flex-col gap-1 border-t border-line pt-3">
          <h3 className="m-0 text-lg font-bold">Ingresos y retiros</h3>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {register.movements.map((movement) => (
              <li key={movement.id} className="flex flex-wrap justify-between gap-x-4">
                <span className="[overflow-wrap:anywhere]">
                  {movement.kind === 'ingreso' ? 'Ingreso' : 'Retiro'}
                  {movement.reason !== null ? `: ${movement.reason}` : ''}
                  <span className="opacity-60"> · {formatDateTime(movement.created_at)}</span>
                </span>
                <span className="font-semibold">
                  {movement.kind === 'ingreso' ? '+' : '-'}
                  {formatMoney(movement.amount)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export function CloseRegisterDialog({
  register,
  canCloseTransfers,
  onClose,
  onChanged,
}: {
  register: CashRegister
  canCloseTransfers: boolean
  onClose: () => void
  onChanged: (register: CashRegister) => void
}) {
  const { showSuccess, showError } = useToast()
  const cashOpen = register.status !== 'cerrada'
  const transfersOpen = register.transfers_visible && register.transfers_closed_at === null
  const askTransfers = canCloseTransfers && transfersOpen
  const [countedCash, setCountedCash] = useState('')
  const [countedTransfer, setCountedTransfer] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const cashError = cashOpen ? moneyProblem(countedCash, true) : null
  const transferError = askTransfers ? moneyProblem(countedTransfer, true) : null
  const cashPreview = cashOpen && cashError === null ? String(Number(countedCash) - Number(register.expected_cash)) : null
  const transferPreview =
    askTransfers && transferError === null && register.expected_transfer !== null
      ? String(Number(countedTransfer) - Number(register.expected_transfer))
      : null

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAttempted(true)
    if (cashError !== null || transferError !== null || saving) return
    setSaving(true)
    try {
      const updated = cashOpen
        ? await closeCashRegister(register.id, countedCash, askTransfers ? countedTransfer : undefined)
        : await closeCashRegisterTransfers(register.id, countedTransfer)
      showSuccess(cashOpen ? 'Caja cerrada.' : 'Transferencias cerradas.')
      onChanged(updated)
    } catch (error) {
      showError(errorMessage(error, 'No se pudo cerrar la caja. Intentá de nuevo.'))
    } finally {
      setSaving(false)
    }
  }

  const title = cashOpen ? `Cerrar caja N° ${register.id}` : `Cerrar transferencias de la caja N° ${register.id}`

  return (
    <CashDialogShell title={title} onClose={onClose} onSubmit={submit} widthClass="max-w-xl">
      <CashSummary register={register} />
      {cashOpen && (
        <div className="flex flex-col gap-1">
          <AmountField label="Efectivo contado" value={countedCash} onChange={setCountedCash} error={attempted ? cashError : null} autoFocus />
          {cashPreview !== null && (
            <p aria-live="polite" className={`m-0 text-lg font-semibold ${differenceTone(cashPreview)}`}>
              {differenceText(cashPreview)}
            </p>
          )}
        </div>
      )}
      {askTransfers && (
        <div className="flex flex-col gap-1">
          <AmountField
            label="Transferencias controladas"
            value={countedTransfer}
            onChange={setCountedTransfer}
            error={attempted ? transferError : null}
            autoFocus={!cashOpen}
          />
          {transferPreview !== null && (
            <p aria-live="polite" className={`m-0 text-lg font-semibold ${differenceTone(transferPreview)}`}>
              {differenceText(transferPreview)}
            </p>
          )}
        </div>
      )}
      <p className="m-0 text-base opacity-70">Al cerrar no se puede deshacer.</p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className={primaryButtonClasses}>
          {cashOpen ? 'Cerrar caja' : 'Cerrar transferencias'}
        </button>
        <button type="button" onClick={onClose} className={secondaryButtonClasses}>
          Cancelar
        </button>
      </div>
    </CashDialogShell>
  )
}

export function RegisterDetailDialog({ register, onClose }: { register: CashRegister; onClose: () => void }) {
  return (
    <CashDialogShell title={`Caja N° ${register.id}`} onClose={onClose} widthClass="max-w-xl">
      <CashSummary register={register} />
      <div className="flex">
        <button type="button" onClick={onClose} className={secondaryButtonClasses}>
          Cerrar
        </button>
      </div>
    </CashDialogShell>
  )
}
