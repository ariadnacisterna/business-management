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
  variants: Variant[]
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

export interface ManagedAccount {
  id: number
  name: string
  user_name: string
  status: string
  role: string | null
  businesses: Business[]
}
