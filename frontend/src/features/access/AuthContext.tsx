import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  changeActiveBusiness,
  fetchCurrentAccount,
  login as loginRequest,
  logout as logoutRequest,
} from '../../api/auth'
import { setUnauthorizedHandler } from '../../api/client'
import type { Account } from '../../api/types'

type SessionStatus = 'loading' | 'ready'

interface AuthContextValue {
  account: Account | null
  status: SessionStatus
  justLoggedIn: boolean
  login: (userName: string, password: string) => Promise<void>
  logout: () => Promise<void>
  switchBusiness: (businessId: number) => Promise<void>
  acknowledgeLogin: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null)
  const [status, setStatus] = useState<SessionStatus>('loading')
  const [justLoggedIn, setJustLoggedIn] = useState(false)

  useEffect(() => {
    setUnauthorizedHandler(() => setAccount(null))

    fetchCurrentAccount()
      .then(setAccount)
      .catch(() => setAccount(null))
      .finally(() => setStatus('ready'))

    return () => setUnauthorizedHandler(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      account,
      status,
      justLoggedIn,
      async login(userName, password) {
        setAccount(await loginRequest(userName, password))
        setJustLoggedIn(true)
      },
      async logout() {
        await logoutRequest()
        setAccount(null)
        setJustLoggedIn(false)
      },
      async switchBusiness(businessId) {
        setAccount(await changeActiveBusiness(businessId))
      },
      acknowledgeLogin() {
        setJustLoggedIn(false)
      },
    }),
    [account, status, justLoggedIn],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
