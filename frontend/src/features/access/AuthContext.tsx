import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  changeActiveBusiness,
  fetchCurrentAccount,
  login as loginRequest,
  logout as logoutRequest,
  updateOwnName,
  updatePreferences,
} from '../../api/auth'
import { setUnauthorizedHandler } from '../../api/client'
import type { Account } from '../../api/types'
import { applyFontSize, cacheFontSize } from '../../shared/fontSize'
import { useToast } from '../../shared/Toast'

type SessionStatus = 'loading' | 'ready'

interface AuthContextValue {
  account: Account | null
  status: SessionStatus
  justLoggedIn: boolean
  login: (userName: string, password: string) => Promise<void>
  logout: () => Promise<void>
  switchBusiness: (businessId: number) => Promise<void>
  changeFontSize: (fontSize: number) => Promise<void>
  changeName: (name: string) => Promise<void>
  acknowledgeLogin: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { showError } = useToast()
  const [account, setAccount] = useState<Account | null>(null)
  const [status, setStatus] = useState<SessionStatus>('loading')
  const [justLoggedIn, setJustLoggedIn] = useState(false)
  const accountRef = useRef<Account | null>(null)

  useEffect(() => {
    accountRef.current = account
  }, [account])

  useEffect(() => {
    if (account === null) return
    applyFontSize(account.font_size)
    cacheFontSize(account.font_size)
  }, [account])

  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (accountRef.current !== null) {
        showError('Tu sesión expiró. Iniciá sesión de nuevo.')
      }
      setAccount(null)
    })

    fetchCurrentAccount()
      .then(setAccount)
      .catch(() => setAccount(null))
      .finally(() => setStatus('ready'))

    return () => setUnauthorizedHandler(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      async changeFontSize(fontSize) {
        const previous = accountRef.current?.font_size
        applyFontSize(fontSize)
        try {
          setAccount(await updatePreferences(fontSize))
        } catch (error) {
          applyFontSize(previous)
          throw error
        }
      },
      async changeName(name) {
        setAccount(await updateOwnName(name))
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
