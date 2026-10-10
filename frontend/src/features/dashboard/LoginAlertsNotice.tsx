import { fetchLoginAlerts } from '../../api/accounts'
import type { LoginAlert } from '../../api/types'
import { formatDateTime } from '../../shared/formatDateTime'
import { useLoad } from '../../shared/useLoad'

const LOOKBACK_HOURS = 24

function describeTimes(count: number): string {
  return count === 1 ? '1 vez' : `${count} veces`
}

function AlertItem({ alert }: { alert: LoginAlert }) {
  return (
    <li className="text-lg [overflow-wrap:anywhere]">
      <span className="font-bold">{alert.name}</span> (usuario <span className="font-semibold">{alert.user_name}</span>):{' '}
      se bloqueó la entrada {describeTimes(alert.blocked_attempts)} por poner mal la contraseña muchas veces seguidas.
      {' '}Última vez: {formatDateTime(alert.last_blocked_at)}.
    </li>
  )
}

export function LoginAlertsNotice() {
  const { status, data } = useLoad(fetchLoginAlerts, [])

  if (status !== 'success' || !Array.isArray(data) || data.length === 0) return null

  return (
    <div className="rounded-xl border-2 border-danger bg-surface p-5" role="alert">
      <p className="m-0 text-2xl font-bold text-danger">Atención: posibles intentos de entrar sin permiso</p>
      <p className="mt-2 text-lg">En las últimas {LOOKBACK_HOURS} horas:</p>
      <ul className="mt-2 flex list-disc flex-col gap-2 pl-6">
        {data.map((alert) => (
          <AlertItem key={alert.account_id} alert={alert} />
        ))}
      </ul>
      <p className="mt-3 text-lg font-semibold">Qué hacer:</p>
      <ul className="mt-1 flex list-disc flex-col gap-1 pl-6 text-lg">
        <li>Avisale a esa persona y preguntale si fue ella, por ejemplo porque se olvidó la contraseña.</li>
        <li>Si no fue ella, cambiale la contraseña desde Cuentas y pasale la nueva en persona.</li>
      </ul>
    </div>
  )
}
