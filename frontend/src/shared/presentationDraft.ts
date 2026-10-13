import type { Presentation } from '../api/types'
import { formatQuantity } from './formatQuantity'

export interface PresentationDraft {
  enabled: boolean
  name: string
  pluralName: string
  pluralEdited: boolean
  quantity: string
}

export const EMPTY_PRESENTATION_DRAFT: PresentationDraft = {
  enabled: false,
  name: '',
  pluralName: '',
  pluralEdited: false,
  quantity: '',
}

export function presentationToDraft(presentation: Presentation | null | undefined): PresentationDraft {
  if (!presentation) return EMPTY_PRESENTATION_DRAFT
  return {
    enabled: true,
    name: presentation.name,
    pluralName: presentation.plural_name,
    pluralEdited: true,
    quantity: formatQuantity(presentation.quantity),
  }
}

export function presentationDraftError(draft: PresentationDraft, allowDecimals: boolean): string | null {
  if (!draft.enabled) return null
  if (draft.name.trim() === '' || draft.pluralName.trim() === '') {
    return 'Escribí el nombre de la presentación en singular y en plural.'
  }
  const quantity = draft.quantity.trim().replace(',', '.')
  if (quantity === '') return 'Escribí cuánto trae cada presentación.'
  const pattern = allowDecimals ? /^(\d+\.?\d{0,3}|\.\d{1,3})$/ : /^\d+$/
  if (!pattern.test(quantity)) {
    return allowDecimals ? 'Usá como máximo 3 decimales.' : 'Esta unidad no admite decimales.'
  }
  if (Number(quantity) <= 0) return 'La cantidad de la presentación tiene que ser mayor que cero.'
  return null
}

export function draftToPresentation(draft: PresentationDraft): Presentation | null {
  if (!draft.enabled) return null
  return {
    name: draft.name.trim(),
    plural_name: draft.pluralName.trim(),
    quantity: Number(draft.quantity.trim().replace(',', '.')).toFixed(3),
  }
}

export function samePresentation(a: Presentation | null | undefined, b: Presentation | null | undefined): boolean {
  if (!a || !b) return !a && !b
  return a.name === b.name && a.plural_name === b.plural_name && Number(a.quantity) === Number(b.quantity)
}
