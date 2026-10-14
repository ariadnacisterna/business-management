import type { Attribute } from '../../api/types'
import { normalizeForComparison } from '../../shared/normalizeForComparison'

export interface DraftValue {
  id: number
  attribute_id: number
  value: string
}

export interface DraftVariant {
  key: number
  label: string
  values: DraftValue[]
}

export interface ServerProblem {
  step: 1 | 2
  selector: string
  buttonLabel: string
}

export function repeatedAttributeProblem(values: DraftValue[], attributes: Attribute[]): string | null {
  const byAttribute = new Map<number, string[]>()
  for (const value of values) {
    byAttribute.set(value.attribute_id, [...(byAttribute.get(value.attribute_id) ?? []), value.value])
  }
  for (const [attributeId, names] of byAttribute) {
    if (names.length > 1) {
      const attribute = attributes.find((candidate) => candidate.id === attributeId)
      return `Esta variante tiene más de un valor de ${attribute?.name ?? 'un mismo atributo'} (${names.join(' y ')}). Dejá uno solo.`
    }
  }
  return null
}

export function duplicateVariantProblem(drafts: DraftVariant[], index: number): string | null {
  const signature = (draft: DraftVariant) =>
    `${normalizeForComparison(draft.label)}|${draft.values
      .map((value) => value.id)
      .sort((a, b) => a - b)
      .join(',')}`
  if (drafts[index].label.trim() === '' && drafts[index].values.length === 0) return null
  const current = signature(drafts[index])
  for (let earlier = 0; earlier < index; earlier += 1) {
    if (signature(drafts[earlier]) === current) {
      return `Esta variante es igual a la variante ${earlier + 1}. Cambiá el nombre o los valores.`
    }
  }
  return null
}

export function stockSignProblem(value: string): string | null {
  return value.trim().startsWith('-') ? 'No puede ser negativo.' : null
}

export function locateServerProblem(message: string): ServerProblem | null {
  const text = normalizeForComparison(message)
  if (text.includes('presentacion') || text.includes('largo')) {
    return { step: 1, selector: '[name="presentation-name"]', buttonLabel: 'Corregir la presentación' }
  }
  if (text.includes('categoria')) {
    return { step: 1, selector: '[aria-label="Categoría"]', buttonLabel: 'Corregir la categoría' }
  }
  if (text.includes('unidad')) {
    return { step: 1, selector: '[aria-label="Unidad"]', buttonLabel: 'Corregir la unidad' }
  }
  if (text.includes('nombre') && !text.includes('variante') && !text.includes('implicita')) {
    return { step: 1, selector: '#product-name', buttonLabel: 'Corregir el nombre' }
  }
  if (text.includes('variante') || text.includes('atributo') || text.includes('valores')) {
    return {
      step: 2,
      selector: '[aria-label="Nombre de la variante"]',
      buttonLabel: 'Corregir las variantes',
    }
  }
  return null
}
