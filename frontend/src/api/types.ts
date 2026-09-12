export interface Business {
  id: number
  name: string
  industry: string
}

export interface Account {
  id: number
  name: string
  user_name: string
  status: string
  role: string | null
  active_business_id: number
  businesses: Business[]
}

export interface Category {
  id: number
  name: string
  status: string
}

export interface Unit {
  id: number
  name: string
  abbreviation: string
  allows_fraction: boolean
  status: string
}

export interface Attribute {
  id: number
  name: string
  status: string
}

export interface AttributeValue {
  id: number
  attribute_id: number
  value: string
  status: string
}

export interface Variant {
  id: number
  product_id: number
  label: string | null
  is_implicit: boolean
  status: string
  attribute_value_ids: number[]
  price_amount: string | null
}

export interface Product {
  id: number
  name: string
  category_id: number
  unit_id: number
  status: string
  image_url: string | null
  variants: Variant[]
  provider_id: number | null
}

export interface Provider {
  id: number
  name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  last_purchase_at: string | null
  status: string
  category_ids: number[]
}

export interface Shortage {
  id: number
  variant_id: number
  product_id: number
  product_name: string
  category_id: number
  provider_id: number | null
  status: string
  created_at: string
  created_by_account_id: number
}

export interface ProductPage {
  items: Product[]
  total: number
  page: number
  page_size: number
}

export interface VariantInput {
  label?: string | null
  attribute_value_ids?: number[]
}

export interface ProductCreationResult {
  product: Product
  possible_duplicates: Variant[]
}

export interface VariantCreationResult {
  variant: Variant
  possible_duplicates: Variant[]
}

export interface Price {
  id: number
  variant_id: number
  business_id: number
  amount: string
  effective_from: string
  effective_to: string | null
  created_by_account_id: number
  created_by_account_name: string
  created_at: string
}

export interface CurrentPrice {
  variant_id: number
  price: Price | null
}

export interface Customer {
  id: number
  name: string
  phone: string | null
  status: string
}

export interface CustomerBalance {
  customer_id: number
  balance: string
}

export interface Credit {
  id: number
  customer_id: number
  type: string
  amount: string
  created_at: string
  created_by_account_id: number
}

export interface CustomerWithBalance {
  customer: Customer
  balance: string
}

export interface MovementReason {
  id: number
  name: string
  status: string
}

export interface Stock {
  variant_id: number
  quantity: number
  minimum_quantity: number | null
  effective_minimum_quantity: number
  status: string
}

export interface StockRow {
  product_id: number
  product_name: string
  category_id: number
  unit_id: number
  variant_id: number
  variant_label: string | null
  quantity: number
  minimum_quantity: number | null
  effective_minimum_quantity: number
  status: string
  last_movement_at: string | null
  last_movement_by_account_name: string | null
}

export interface StockPage {
  items: StockRow[]
  total: number
  page: number
  page_size: number
}

export interface StockCounts {
  total: number
  stock_bajo: number
  sin_stock: number
}

export interface StockMovement {
  id: number
  variant_id: number
  reason_id: number
  quantity_before: number
  quantity_after: number
  observation: string | null
  created_at: string
  created_by_account_id: number
}

export interface ManagedAccount {
  id: number
  name: string
  user_name: string
  status: string
  role: string | null
  businesses: Business[]
}
