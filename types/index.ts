export type UserRole = 'receptionist' | 'site_lead' | 'admin' | 'management'
export type SiteT = 'coolaroo' | 'altona_north'
export type LeadStatus = 'new' | 'booked' | 'noshow' | 'won' | 'lost' | 'nurture'
export type CancelStage = 'received' | 'save_attempt' | 'processed' | 'verified'
export type CancelOutcome = 'departed' | 'saved' | 'paused'

export interface AppUser {
  id: string
  email: string
  name: string
  role: UserRole
  site: SiteT | null
  active: boolean
  created_at: string
}

export interface Programme {
  id: string
  name: string
  min_age: number | null
  max_age: number | null
  sort: number
  active: boolean
}

export interface Guardian {
  id: string
  first_name: string
  last_name: string
  phone: string
  email: string | null
  preferred_contact: string | null
  secondary_contact_note: string | null
  created_at: string
  archived_at: string | null
  archived_by: string | null
}

export interface Lead {
  id: string
  guardian_id: string
  relationship: string | null
  child_first: string
  child_last: string
  dob: string | null          // ISO date
  gender: string | null
  site: SiteT
  programme_id: string | null
  source: string
  referrer_name: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  status: LeadStatus
  contacted: boolean
  last_outcome: string | null
  attempts: number
  rebooks: number
  trial_at: string | null     // ISO timestamptz
  confirmation_sent_at: string | null
  form_received: boolean
  form_sent_at: string | null   // when Jotform was first sent
  next_action_at: string | null
  first_class_date: string | null
  first_class: string | null
  sold_at: string | null
  sold_by: string | null
  payment_taken: boolean
  verified_at: string | null
  verified_by: string | null
  lost_reason: string | null
  nurture_followup_at: string | null
  enquiry_raw: Record<string, unknown> | null
  received_at: string
  created_by: string | null
  prev_state: Record<string, unknown> | null
  archived_at: string | null
  archived_by: string | null
}

export interface Activity {
  id: string
  lead_id: string
  user_id: string | null
  kind: string    // comm | status | note | system | undo | verify
  body: string
  created_at: string
}

export interface Cancellation {
  id: string
  member_name: string
  guardian_name: string | null
  phone: string | null
  email: string | null
  site: SiteT
  level: string | null
  reasons: string[]
  feedback: string | null
  rating: number | null
  notice_date: string          // ISO date
  effective_date: string       // ISO date
  stage: CancelStage
  save_outcome: string | null
  outcome: CancelOutcome | null
  outstanding_fees_flag: boolean
  processed_by: string | null
  verified_at: string | null
  verified_by: string | null
  created_at: string
  archived_at: string | null
  archived_by: string | null
}

export interface Target {
  id: string
  site: SiteT
  month: string       // ISO date (first of month)
  net_growth_goal: number
  sales_goal: number | null
}

export interface BlockoutDay {
  id: string
  site: SiteT
  day: string         // ISO date
  label: string
}

export interface ChecklistItem {
  id: string
  site: SiteT | null
  role: UserRole | null
  label: string
  sort: number
  active: boolean
}

export interface ChecklistCompletion {
  id: string
  item_id: string
  user_id: string
  day: string         // ISO date
  completed_at: string
}

export interface SiteSettings {
  site: SiteT
  current_members: number
  updated_at: string | null
  updated_by: string | null
}

export interface AuditLog {
  id: number
  entity: string
  entity_id: string
  user_id: string | null
  action: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  at: string
}
