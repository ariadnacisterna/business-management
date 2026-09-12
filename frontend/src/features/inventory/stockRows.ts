import { fetchAllStock, fetchStockCounts } from '../../api/catalog'
import type { StockRow } from '../../api/types'

export type { StockRow }

export async function fetchStockRows(): Promise<StockRow[]> {
  return fetchAllStock()
}

export interface StockSummary {
  total: number
  stockBajo: number
  sinStock: number
}

export function summarizeStockRows(rows: StockRow[]): StockSummary {
  return {
    total: rows.length,
    stockBajo: rows.filter((row) => row.status === 'stock_bajo').length,
    sinStock: rows.filter((row) => row.status === 'sin_stock').length,
  }
}

export async function fetchStockSummary(): Promise<StockSummary> {
  const counts = await fetchStockCounts()
  return { total: counts.total, stockBajo: counts.stock_bajo, sinStock: counts.sin_stock }
}
