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
