export type UserRole = 'receptionist' | 'site_lead' | 'admin' | 'management'
export type SiteT = 'coolaroo' | 'altona_north'

export interface AppUser {
  id: string
  email: string
  full_name: string
  role: UserRole
  site: SiteT | null
  is_active: boolean
  created_at: string
}
