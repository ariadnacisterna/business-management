import { createContext, useContext } from 'react'
import type { Account } from '../../api/types'

export type SessionStatus = 'loading' | 'ready'

export interface AuthContextValue {
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

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
