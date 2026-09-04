import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../../features/access/AuthContext'
import { BusinessSwitcher } from '../../features/access/BusinessSwitcher'
import { Brand } from '../Brand'
import styles from './AppLayout.module.css'

export function AppLayout() {
  const { account, logout } = useAuth()
  const [logoutError, setLogoutError] = useState<string | null>(null)

  async function handleLogout() {
    setLogoutError(null)
    try {
      await logout()
    } catch {
      setLogoutError('No se pudo cerrar sesión. Intentá de nuevo.')
    }
  }

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.headerBrand}>
          <Brand />
          <span className={styles.accountName}>{account?.name}</span>
        </div>
        <div className={styles.headerActions}>
          <BusinessSwitcher />
          <button type="button" onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>
      </header>

      {logoutError !== null && <p role="alert">{logoutError}</p>}

      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  )
}
