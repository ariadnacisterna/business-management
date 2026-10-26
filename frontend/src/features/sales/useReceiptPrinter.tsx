import { useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import type { Sale } from '../../api/types'
import { activeBusiness } from '../access/roles'
import { useAuth } from '../access/useAuth'
import { Receipt } from './Receipt'

export function useReceiptPrinter(sale: Sale) {
  const { account } = useAuth()
  const business = activeBusiness(account)
  const [printing, setPrinting] = useState(false)

  function print() {
    flushSync(() => setPrinting(true))
    window.print()
    setPrinting(false)
  }

  const receipt = printing
    ? createPortal(
        <Receipt sale={sale} businessName={business?.name ?? ''} alias={business?.transfer_alias ?? null} />,
        document.body,
      )
    : null

  return { print, receipt }
}
