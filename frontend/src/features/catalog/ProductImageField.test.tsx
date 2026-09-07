import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import * as catalogApi from '../../api/catalog'
import type { Product } from '../../api/types'
import { ProductImageField } from './ProductImageField'

const PRODUCT: Product = {
  id: 1,
  name: 'Cinta bebé',
  category_id: 1,
  unit_id: 1,
  status: 'active',
  image_url: null,
  variants: [],
}

const PRODUCT_WITH_IMAGE: Product = {
  ...PRODUCT,
  image_url: 'https://example.supabase.co/storage/v1/object/public/product-images/products/1.png',
}

describe('ProductImageField', () => {
  it('asks for confirmation before uploading a selected image', async () => {
    const user = userEvent.setup()
    const uploaded = { ...PRODUCT_WITH_IMAGE }
    const uploadSpy = vi.spyOn(catalogApi, 'uploadProductImage').mockResolvedValue(uploaded)
    const onUpdated = vi.fn()

    render(<ProductImageField product={PRODUCT} onUpdated={onUpdated} />)

    const file = new File(['fake-bytes'], 'photo.png', { type: 'image/png' })
    const input = screen.getByLabelText('Elegir imagen del producto') as HTMLInputElement
    await user.upload(input, file)

    expect(await screen.findByRole('alertdialog', { name: 'Cambiar imagen' })).toBeInTheDocument()
    expect(uploadSpy).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Subir' }))

    expect(uploadSpy).toHaveBeenCalledWith(PRODUCT.id, file)
    expect(onUpdated).toHaveBeenCalledWith(uploaded)
  })

  it('does not upload when the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    const uploadSpy = vi.spyOn(catalogApi, 'uploadProductImage').mockResolvedValue(PRODUCT_WITH_IMAGE)

    render(<ProductImageField product={PRODUCT} onUpdated={vi.fn()} />)

    const file = new File(['fake-bytes'], 'photo.png', { type: 'image/png' })
    const input = screen.getByLabelText('Elegir imagen del producto') as HTMLInputElement
    await user.upload(input, file)

    await screen.findByRole('alertdialog', { name: 'Cambiar imagen' })
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(uploadSpy).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('asks for confirmation before removing the image', async () => {
    const user = userEvent.setup()
    const removed = { ...PRODUCT, image_url: null }
    const removeSpy = vi.spyOn(catalogApi, 'removeProductImage').mockResolvedValue(removed)
    const onUpdated = vi.fn()

    render(<ProductImageField product={PRODUCT_WITH_IMAGE} onUpdated={onUpdated} />)

    await user.click(screen.getByRole('button', { name: 'Quitar' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Quitar imagen' })
    expect(dialog).toBeInTheDocument()
    expect(removeSpy).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Quitar' }))

    expect(removeSpy).toHaveBeenCalledWith(PRODUCT_WITH_IMAGE.id)
    expect(onUpdated).toHaveBeenCalledWith(removed)
  })

  it('shows the current image when the product has one', () => {
    render(<ProductImageField product={PRODUCT_WITH_IMAGE} onUpdated={vi.fn()} />)

    expect(screen.getByAltText('Cinta bebé')).toHaveAttribute('src', PRODUCT_WITH_IMAGE.image_url as string)
  })
})
