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

export interface AttributeValueSummary {
  attribute_id: number
  attribute_name: string
  value: string
}

export interface SearchResultItem {
  variant_id: number
  product_id: number
  product_name: string
  category_id: number
  category_name: string
  label: string | null
  attribute_values: AttributeValueSummary[]
  price_amount: string
}

export interface SearchResponse {
  results: SearchResultItem[]
}
