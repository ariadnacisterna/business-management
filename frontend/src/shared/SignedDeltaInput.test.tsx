import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { DeltaPreview, SignedDeltaInput } from './SignedDeltaInput'
import { evaluateDelta } from './signedDelta'
import type { DeltaKind } from './signedDelta'

function Harness({ kind, current }: { kind: DeltaKind; current: number | string }) {
  const [value, setValue] = useState('')
  return (
    <>
      <SignedDeltaInput kind={kind} value={value} onChange={setValue} ariaLabel="Diferencia" className="" />
      <DeltaPreview kind={kind} current={current} evaluation={evaluateDelta(kind, current, value)} />
    </>
  )
}

describe('SignedDeltaInput', () => {
  it('accepts a typed minus sign and previews the result', async () => {
    const user = userEvent.setup()
    render(<Harness kind="stock" current={50} />)

    await user.type(screen.getByLabelText('Diferencia'), '-20')

    expect(screen.getByLabelText('Diferencia')).toHaveValue('-20')
    expect(screen.getByTestId('delta-preview')).toHaveTextContent('Stock: 50 → 30')
  })

  it('shows the price preview with two decimals and the floor error', async () => {
    const user = userEvent.setup()
    render(<Harness kind="price" current="1000.00" />)

    await user.type(screen.getByLabelText('Diferencia'), '500')
    expect(screen.getByTestId('delta-preview')).toHaveTextContent(/Precio:\s*\$\s1\.000,00\s*→\s*\$\s1\.500,00/)

    await user.clear(screen.getByLabelText('Diferencia'))
    await user.type(screen.getByLabelText('Diferencia'), '-1000')
    expect(screen.getByRole('alert')).toHaveTextContent('El precio no puede quedar en cero o menos')
  })

  it('explains why a letter was not typed', async () => {
    const user = userEvent.setup()
    render(<Harness kind="stock" current={50} />)

    await user.type(screen.getByLabelText('Diferencia'), '5a')

    expect(screen.getByLabelText('Diferencia')).toHaveValue('5')
    expect(screen.getByText('Solo se permiten números enteros.')).toBeInTheDocument()
  })
})
