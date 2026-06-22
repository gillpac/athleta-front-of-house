import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Only allow in non-production environments
export async function POST() {
  if (process.env.VERCEL_ENV === 'production') {
    return NextResponse.json({ error: 'Not allowed in production' }, { status: 403 })
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' }, { status: 500 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // ──────────────────────────────────────────────────────────────
  // 1. Auth users + app_users
  // ──────────────────────────────────────────────────────────────

  const testUsers = [
    { email: 'receptionist@athleta.test', password: 'Test1234!', name: 'Chiara Russo',    role: 'receptionist', site: 'coolaroo' },
    { email: 'sitelead@athleta.test',     password: 'Test1234!', name: 'Mustafa Demir',   role: 'site_lead',    site: 'altona_north' },
    { email: 'admin@athleta.test',        password: 'Test1234!', name: 'Admin User',       role: 'admin',        site: null },
    { email: 'management@athleta.test',   password: 'Test1234!', name: 'Management User',  role: 'management',   site: null },
  ]

  const results: Array<{ email: string; status: string; error?: string }> = []
  const userIdMap: Record<string, string> = {}

  for (const u of testUsers) {
    // Check if auth user already exists
    const { data: existing } = await supabase.auth.admin.listUsers()
    const existingUser = existing?.users.find((au) => au.email === u.email)

    let authId: string

    if (existingUser) {
      authId = existingUser.id
      results.push({ email: u.email, status: 'auth already exists' })
    } else {
      const { data: created, error } = await supabase.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
      })
      if (error || !created.user) {
        results.push({ email: u.email, status: 'error', error: error?.message })
        continue
      }
      authId = created.user.id
      results.push({ email: u.email, status: 'created' })
    }

    userIdMap[u.email] = authId

    // Upsert app_users row
    const { error: upsertError } = await supabase.from('app_users').upsert({
      id: authId,
      name: u.name,
      email: u.email,
      role: u.role,
      site: u.site,
      active: true,
    })
    if (upsertError) {
      results.push({ email: u.email, status: 'app_users upsert failed', error: upsertError.message })
    }
  }

  const receptionistId = userIdMap['receptionist@athleta.test'] ?? null

  // ──────────────────────────────────────────────────────────────
  // 2. Programmes (fetch existing so we can map by name)
  // ──────────────────────────────────────────────────────────────

  const { data: programmes } = await supabase.from('programmes').select('id, name')
  const progMap: Record<string, string> = {}
  for (const p of programmes ?? []) progMap[p.name] = p.id

  // ──────────────────────────────────────────────────────────────
  // 3. Checklist items
  // ──────────────────────────────────────────────────────────────

  const checklistLabels = [
    'Reception tidy & signage out',
    'Check voicemails & missed calls',
    'Mats & equipment walk-through',
    'Bathrooms checked & stocked',
    'End of day — banking & lock-up',
  ]

  for (let i = 0; i < checklistLabels.length; i++) {
    const label = checklistLabels[i]
    const { data: existing } = await supabase
      .from('checklist_items')
      .select('id')
      .eq('label', label)
      .limit(1)

    if (!existing || existing.length === 0) {
      await supabase.from('checklist_items').insert({
        site: null,   // all sites
        role: null,   // all roles
        label,
        sort: i + 1,
        active: true,
      })
    }
  }

  // ──────────────────────────────────────────────────────────────
  // 4. Guardians
  // ──────────────────────────────────────────────────────────────

  // Each guardian: { first_name, last_name, phone, email?, preferred_contact? }
  const guardianDefs = [
    { first_name: 'Sara',   last_name: 'Osman',   phone: '0424818405', email: 'sara.o@example.com',   preferred_contact: 'call' as string | null },
    { first_name: 'Gia',    last_name: 'Liotta',  phone: '0413220871', email: 'gia.l@example.com',    preferred_contact: null as string | null },
    { first_name: 'Kim',    last_name: 'Tran',    phone: '0431668220', email: 'kim.t@example.com',    preferred_contact: null as string | null },
    { first_name: 'Ana',    last_name: 'Kovač',   phone: '0401224678', email: 'ana.k@example.com',    preferred_contact: null as string | null },
    { first_name: 'Claire', last_name: 'Walsh',   phone: '0407119482', email: 'claire.w@example.com', preferred_contact: null as string | null },
    { first_name: 'Lina',   last_name: 'Haddad',  phone: '0422671350', email: 'lina.h@example.com',   preferred_contact: null as string | null },
    { first_name: 'Yusra',  last_name: 'Said',    phone: '0421775940', email: 'yusra.s@example.com',  preferred_contact: null as string | null },
    { first_name: 'Carla',  last_name: 'Ricci',   phone: '0418200113', email: 'carla.r@example.com',  preferred_contact: null as string | null },
    { first_name: 'Dan',    last_name: 'Webb',    phone: '0402331909', email: 'dan.w@example.com',    preferred_contact: null as string | null },
    { first_name: 'Rosa',   last_name: 'Tomasi',  phone: '0435887240', email: 'rosa.t@example.com',   preferred_contact: null as string | null },
    { first_name: 'Amal',   last_name: 'Yusuf',   phone: '0427660035', email: 'amal.y@example.com',   preferred_contact: null as string | null },
    { first_name: 'Jen',    last_name: 'Lim',     phone: '0411502668', email: 'jen.l@example.com',    preferred_contact: null as string | null },
    { first_name: 'Priya',  last_name: 'Patel',   phone: '0412558901', email: 'priya.p@example.com',  preferred_contact: null as string | null },
    { first_name: 'Marco',  last_name: 'Bruno',   phone: '0410552308', email: 'marco.b@example.com',  preferred_contact: null as string | null },
  ]

  // Upsert guardians by phone (idempotent)
  const guardianIdMap: Record<string, string> = {}

  for (const g of guardianDefs) {
    const { data: existing } = await supabase
      .from('guardians')
      .select('id')
      .eq('phone', g.phone)
      .limit(1)

    if (existing && existing.length > 0) {
      guardianIdMap[g.phone] = existing[0].id
    } else {
      const { data: inserted, error } = await supabase
        .from('guardians')
        .insert(g)
        .select('id')
        .single()
      if (inserted) guardianIdMap[g.phone] = inserted.id
      else results.push({ email: `guardian:${g.phone}`, status: 'error', error: error?.message })
    }
  }

  // ──────────────────────────────────────────────────────────────
  // 5. Leads
  // ──────────────────────────────────────────────────────────────

  // Helper: check lead exists by child_first + child_last + guardian_id
  async function leadExists(childFirst: string, childLast: string, guardianId: string): Promise<boolean> {
    const { data } = await supabase
      .from('leads')
      .select('id')
      .eq('child_first', childFirst)
      .eq('child_last', childLast)
      .eq('guardian_id', guardianId)
      .limit(1)
    return !!(data && data.length > 0)
  }

  type LeadInsert = {
    guardian_id: string
    relationship: string
    child_first: string
    child_last: string
    dob: string | null
    gender: string | null
    site: 'coolaroo' | 'altona_north'
    programme_id: string | null
    source: string
    status: 'new' | 'booked' | 'noshow' | 'won' | 'lost' | 'nurture'
    contacted: boolean
    last_outcome: string | null
    attempts: number
    rebooks: number
    trial_at: string | null
    confirmation_sent_at: string | null
    form_received: boolean
    next_action_at: string | null
    sold_at: string | null
    sold_by: string | null
    payment_taken: boolean
    verified_at: string | null
    verified_by: string | null
    lost_reason: string | null
    nurture_followup_at: string | null
    received_at: string
    created_by: string | null
    enquiry_raw: Record<string, unknown> | null
  }

  // Timestamps anchored to 2026-06-14 (today in seed context)
  const TODAY = '2026-06-14'
  const adminId = userIdMap['admin@athleta.test'] ?? null

  const leadsToSeed: LeadInsert[] = [
    // ── Harper Liotta — new, not contacted
    {
      guardian_id: guardianIdMap['0413220871'],
      relationship: 'Mother',
      child_first: 'Harper', child_last: 'Liotta',
      dob: '2022-03-12', gender: 'Female',
      site: 'coolaroo',
      programme_id: progMap['Kinder Gym'] ?? null,
      source: 'website',
      status: 'new', contacted: false, last_outcome: null,
      attempts: 0, rebooks: 0,
      trial_at: null, confirmation_sent_at: null, form_received: false,
      next_action_at: `${TODAY}T12:00:00+10:00`,
      sold_at: null, sold_by: null, payment_taken: false,
      verified_at: null, verified_by: null,
      lost_reason: null, nurture_followup_at: null,
      received_at: `${TODAY}T09:37:00+10:00`,
      created_by: receptionistId,
      enquiry_raw: { relationship: 'Mother', guardian: 'Gia Liotta', mobile: '0413 220 871', email: 'gia.l@example.com', childName: 'Harper Liotta', dob: '12/03/2022', gender: 'Female', prefDays: 'Saturday', prior: 'None' },
    },
    // ── Eli Osman — new, not contacted
    {
      guardian_id: guardianIdMap['0424818405'],
      relationship: 'Mother',
      child_first: 'Eli', child_last: 'Osman',
      dob: '2019-11-02', gender: 'Male',
      site: 'coolaroo',
      programme_id: progMap['Beginners Principles'] ?? null,
      source: 'website',
      status: 'new', contacted: false, last_outcome: null,
      attempts: 0, rebooks: 0,
      trial_at: null, confirmation_sent_at: null, form_received: false,
      next_action_at: `${TODAY}T10:00:00+10:00`,
      sold_at: null, sold_by: null, payment_taken: false,
      verified_at: null, verified_by: null,
      lost_reason: null, nurture_followup_at: null,
      received_at: `${TODAY}T07:10:00+10:00`,
      created_by: receptionistId,
      enquiry_raw: { relationship: 'Mother', guardian: 'Sara Osman', mobile: '0424 818 405', email: 'sara.o@example.com', childName: 'Eli Osman', dob: '02/11/2019', gender: 'Male', prefDays: 'Tuesday, Thursday', prior: 'Played soccer; very active' },
    },
    // ── Layla Osman — new, not contacted (same family as Eli)
    {
      guardian_id: guardianIdMap['0424818405'],
      relationship: 'Mother',
      child_first: 'Layla', child_last: 'Osman',
      dob: '2022-06-15', gender: 'Female',
      site: 'coolaroo',
      programme_id: progMap['Kinder Gym'] ?? null,
      source: 'website',
      status: 'new', contacted: false, last_outcome: null,
      attempts: 0, rebooks: 0,
      trial_at: null, confirmation_sent_at: null, form_received: false,
      next_action_at: `${TODAY}T10:00:00+10:00`,
      sold_at: null, sold_by: null, payment_taken: false,
      verified_at: null, verified_by: null,
      lost_reason: null, nurture_followup_at: null,
      received_at: `${TODAY}T07:10:00+10:00`,
      created_by: receptionistId,
      enquiry_raw: { relationship: 'Mother', guardian: 'Sara Osman', mobile: '0424 818 405', email: 'sara.o@example.com', childName: 'Layla Osman', dob: '15/06/2022', gender: 'Female', prefDays: 'Tuesday, Thursday', prior: 'None' },
    },
    // ── Jack Tran — new, 2 attempts, voicemail
    {
      guardian_id: guardianIdMap['0431668220'],
      relationship: 'Father',
      child_first: 'Jack', child_last: 'Tran',
      dob: '2020-06-21', gender: 'Male',
      site: 'coolaroo',
      programme_id: progMap['Beginners Principles'] ?? null,
      source: 'website',
      status: 'new', contacted: true, last_outcome: 'Left voicemail',
      attempts: 2, rebooks: 0,
      trial_at: null, confirmation_sent_at: null, form_received: false,
      next_action_at: `${TODAY}T17:00:00+10:00`,
      sold_at: null, sold_by: null, payment_taken: false,
      verified_at: null, verified_by: null,
      lost_reason: null, nurture_followup_at: null,
      received_at: '2026-06-13T08:30:00+10:00',
      created_by: receptionistId,
      enquiry_raw: { relationship: 'Father', guardian: 'Kim Tran', mobile: '0431 668 220', email: 'kim.t@example.com', childName: 'Jack Tran', dob: '21/06/2020', gender: 'Male', prefDays: 'Any weekday', prior: 'None' },
    },
    // ── Mila Kovač — booked, rebooked ×1
    {
      guardian_id: guardianIdMap['0401224678'],
      relationship: 'Mother',
      child_first: 'Mila', child_last: 'Kovač',
      dob: '2022-08-30', gender: 'Female',
      site: 'coolaroo',
      programme_id: progMap['Kinder Gym'] ?? null,
      source: 'website',
      status: 'booked', contacted: true, last_outcome: 'Trial booked',
      attempts: 1, rebooks: 1,
      trial_at: `${TODAY}T09:30:00+10:00`, confirmation_sent_at: '2026-06-09T10:03:00+10:00', form_received: true,
      next_action_at: `${TODAY}T09:30:00+10:00`,
      sold_at: null, sold_by: null, payment_taken: false,
      verified_at: null, verified_by: null,
      lost_reason: null, nurture_followup_at: null,
      received_at: '2026-06-09T09:48:00+10:00',
      created_by: receptionistId,
      enquiry_raw: { relationship: 'Mother', guardian: 'Ana Kovač', mobile: '0401 224 678', email: 'ana.k@example.com', childName: 'Mila Kovač', dob: '30/08/2022', gender: 'Female', prefDays: 'Saturday', prior: 'None' },
    },
    // ── Aarav Patel — booked today
    {
      guardian_id: guardianIdMap['0412558901'],
      relationship: 'Mother',
      child_first: 'Aarav', child_last: 'Patel',
      dob: '2021-02-14', gender: 'Male',
      site: 'coolaroo',
      programme_id: progMap['Beginners Principles'] ?? null,
      source: 'website',
      status: 'booked', contacted: true, last_outcome: 'Trial booked',
      attempts: 1, rebooks: 0,
      trial_at: `${TODAY}T16:00:00+10:00`, confirmation_sent_at: `${TODAY}T09:22:00+10:00`, form_received: true,
      next_action_at: `${TODAY}T16:00:00+10:00`,
      sold_at: null, sold_by: null, payment_taken: false,
      verified_at: null, verified_by: null,
      lost_reason: null, nurture_followup_at: null,
      received_at: '2026-06-13T18:15:00+10:00',
      created_by: receptionistId,
      enquiry_raw: { relationship: 'Mother', guardian: 'Priya Patel', mobile: '0412 558 901', email: 'priya.p@example.com', childName: 'Aarav Patel', dob: '14/02/2021', gender: 'Male', prefDays: 'Weekdays after 4', prior: 'A term of swimming' },
    },
    // ── Ruby Walsh — booked today 5:30 pm
    {
      guardian_id: guardianIdMap['0407119482'],
      relationship: 'Mother',
      child_first: 'Ruby', child_last: 'Walsh',
      dob: '2019-05-19', gender: 'Female',
      site: 'coolaroo',
      programme_id: progMap['Beginners Principles'] ?? null,
      source: 'website',
      status: 'booked', contacted: true, last_outcome: 'Trial booked',
      attempts: 1, rebooks: 0,
      trial_at: `${TODAY}T17:30:00+10:00`, confirmation_sent_at: '2026-06-07T11:31:00+10:00', form_received: false,
      next_action_at: `${TODAY}T17:30:00+10:00`,
      sold_at: null, sold_by: null, payment_taken: false,
      verified_at: null, verified_by: null,
      lost_reason: null, nurture_followup_at: null,
      received_at: '2026-06-07T11:05:00+10:00',
      created_by: receptionistId,
      enquiry_raw: { relationship: 'Mother', guardian: 'Claire Walsh', mobile: '0407 119 482', email: 'claire.w@example.com', childName: 'Ruby Walsh', dob: '19/05/2019', gender: 'Female', prefDays: 'Mon, Wed', prior: 'None' },
    },
    // ── Zara Haddad — booked tomorrow 10:00 am
    {
      guardian_id: guardianIdMap['0422671350'],
      relationship: 'Mother',
      child_first: 'Zara', child_last: 'Haddad',
      dob: '2021-09-03', gender: 'Female',
      site: 'coolaroo',
      programme_id: progMap['Kinder Gym'] ?? null,
      source: 'website',
      status: 'booked', contacted: true, last_outcome: 'Trial booked',
      attempts: 1, rebooks: 0,
      trial_at: '2026-06-15T10:00:00+10:00', confirmation_sent_at: null, form_received: false,
      next_action_at: '2026-06-15T10:00:00+10:00',
      sold_at: null, sold_by: null, payment_taken: false,
      verified_at: null, verified_by: null,
      lost_reason: null, nurture_followup_at: null,
      received_at: '2026-06-10T14:21:00+10:00',
      created_by: receptionistId,
      enquiry_raw: { relationship: 'Mother', guardian: 'Lina Haddad', mobile: '0422 671 350', email: 'lina.h@example.com', childName: 'Zara Haddad', dob: '03/09/2021', gender: 'Female', prefDays: 'Saturday', prior: 'None' },
    },
    // ── Sienna Bruno — no-show, rebooked ×1
    {
      guardian_id: guardianIdMap['0410552308'],
      relationship: 'Father',
      child_first: 'Sienna', child_last: 'Bruno',
      dob: '2022-04-16', gender: 'Female',
      site: 'coolaroo',
      programme_id: progMap['Kinder Gym'] ?? null,
      source: 'website',
      status: 'noshow', contacted: true, last_outcome: 'No-show',
      attempts: 1, rebooks: 1,
      // A no-show still has the original trial date — kept so it counts as a
      // booked trial and shows under Trials → This month / No-shows.
      trial_at: '2026-06-07T09:00:00+10:00', confirmation_sent_at: '2026-06-06T10:00:00+10:00', form_received: false,
      next_action_at: `${TODAY}T09:00:00+10:00`,
      sold_at: null, sold_by: null, payment_taken: false,
      verified_at: null, verified_by: null,
      lost_reason: null, nurture_followup_at: null,
      received_at: '2026-06-02T15:30:00+10:00',
      created_by: receptionistId,
      enquiry_raw: { relationship: 'Father', guardian: 'Marco Bruno', mobile: '0410 552 308', email: 'marco.b@example.com', childName: 'Sienna Bruno', dob: '16/04/2022', gender: 'Female', prefDays: 'Saturday', prior: 'None' },
    },
    // ── Noah Said — nurture
    {
      guardian_id: guardianIdMap['0421775940'],
      relationship: 'Mother',
      child_first: 'Noah', child_last: 'Said',
      dob: '2021-07-08', gender: 'Male',
      site: 'coolaroo',
      programme_id: progMap['Kinder Gym'] ?? null,
      source: 'website',
      status: 'nurture', contacted: true, last_outcome: 'Attended trial — did not enrol',
      attempts: 2, rebooks: 0,
      trial_at: null, confirmation_sent_at: null, form_received: false,
      next_action_at: null,
      sold_at: null, sold_by: null, payment_taken: false,
      verified_at: null, verified_by: null,
      lost_reason: null, nurture_followup_at: '2026-06-21',
      received_at: '2026-05-30T10:12:00+10:00',
      created_by: receptionistId,
      enquiry_raw: { relationship: 'Mother', guardian: 'Yusra Said', mobile: '0421 775 940', email: 'yusra.s@example.com', childName: 'Noah Said', dob: '08/07/2021', gender: 'Male', prefDays: 'Friday', prior: 'None' },
    },
    // ── Ava Ricci — won + verified
    {
      guardian_id: guardianIdMap['0418200113'],
      relationship: 'Mother',
      child_first: 'Ava', child_last: 'Ricci',
      dob: '2020-05-05', gender: 'Female',
      site: 'coolaroo',
      programme_id: progMap['Beginners Principles'] ?? null,
      source: 'website',
      status: 'won', contacted: true, last_outcome: 'Enrolled',
      attempts: 1, rebooks: 0,
      trial_at: '2026-06-03T16:00:00+10:00', confirmation_sent_at: '2026-06-03T09:00:00+10:00', form_received: true,
      next_action_at: null,
      sold_at: '2026-06-03T16:30:00+10:00', sold_by: receptionistId, payment_taken: true,
      verified_at: '2026-06-03T17:00:00+10:00', verified_by: adminId,
      lost_reason: null, nurture_followup_at: null,
      received_at: '2026-06-03T09:00:00+10:00',
      created_by: receptionistId,
      enquiry_raw: { relationship: 'Mother', guardian: 'Carla Ricci', mobile: '0418 200 113', email: 'carla.r@example.com', childName: 'Ava Ricci', dob: '05/05/2020', gender: 'Female', prefDays: 'Tuesday', prior: 'None' },
    },
    // ── Marcus Webb — won + verified
    {
      guardian_id: guardianIdMap['0402331909'],
      relationship: 'Father',
      child_first: 'Marcus', child_last: 'Webb',
      dob: '2022-10-22', gender: 'Male',
      site: 'coolaroo',
      programme_id: progMap['Kinder Gym'] ?? null,
      source: 'website',
      status: 'won', contacted: true, last_outcome: 'Enrolled',
      attempts: 1, rebooks: 0,
      trial_at: '2026-06-04T09:30:00+10:00', confirmation_sent_at: '2026-06-04T09:00:00+10:00', form_received: true,
      next_action_at: null,
      sold_at: '2026-06-04T10:00:00+10:00', sold_by: receptionistId, payment_taken: true,
      verified_at: '2026-06-04T11:00:00+10:00', verified_by: adminId,
      lost_reason: null, nurture_followup_at: null,
      received_at: '2026-06-04T09:00:00+10:00',
      created_by: receptionistId,
      enquiry_raw: { relationship: 'Father', guardian: 'Dan Webb', mobile: '0402 331 909', email: 'dan.w@example.com', childName: 'Marcus Webb', dob: '22/10/2022', gender: 'Male', prefDays: 'Saturday', prior: 'None' },
    },
    // ── Lily Tomasi — won + verified
    {
      guardian_id: guardianIdMap['0435887240'],
      relationship: 'Mother',
      child_first: 'Lily', child_last: 'Tomasi',
      dob: '2020-01-17', gender: 'Female',
      site: 'coolaroo',
      programme_id: progMap['Beginners Principles'] ?? null,
      source: 'website',
      status: 'won', contacted: true, last_outcome: 'Enrolled',
      attempts: 1, rebooks: 0,
      trial_at: '2026-06-06T16:30:00+10:00', confirmation_sent_at: '2026-06-06T09:00:00+10:00', form_received: true,
      next_action_at: null,
      sold_at: '2026-06-06T17:00:00+10:00', sold_by: receptionistId, payment_taken: true,
      verified_at: '2026-06-06T18:00:00+10:00', verified_by: adminId,
      lost_reason: null, nurture_followup_at: null,
      received_at: '2026-06-06T09:00:00+10:00',
      created_by: receptionistId,
      enquiry_raw: { relationship: 'Mother', guardian: 'Rosa Tomasi', mobile: '0435 887 240', email: 'rosa.t@example.com', childName: 'Lily Tomasi', dob: '17/01/2020', gender: 'Female', prefDays: 'Wednesday', prior: 'None' },
    },
    // ── Hana Yusuf — won + verified
    {
      guardian_id: guardianIdMap['0427660035'],
      relationship: 'Mother',
      child_first: 'Hana', child_last: 'Yusuf',
      dob: '2021-12-09', gender: 'Female',
      site: 'coolaroo',
      programme_id: progMap['Kinder Gym'] ?? null,
      source: 'website',
      status: 'won', contacted: true, last_outcome: 'Enrolled',
      attempts: 1, rebooks: 0,
      trial_at: '2026-06-09T10:30:00+10:00', confirmation_sent_at: '2026-06-09T09:00:00+10:00', form_received: true,
      next_action_at: null,
      sold_at: '2026-06-09T11:00:00+10:00', sold_by: receptionistId, payment_taken: true,
      verified_at: '2026-06-09T12:00:00+10:00', verified_by: adminId,
      lost_reason: null, nurture_followup_at: null,
      received_at: '2026-06-09T09:00:00+10:00',
      created_by: receptionistId,
      enquiry_raw: { relationship: 'Mother', guardian: 'Amal Yusuf', mobile: '0427 660 035', email: 'amal.y@example.com', childName: 'Hana Yusuf', dob: '09/12/2021', gender: 'Female', prefDays: 'Saturday', prior: 'None' },
    },
    // ── Oscar Lim — won + verified
    {
      guardian_id: guardianIdMap['0411502668'],
      relationship: 'Mother',
      child_first: 'Oscar', child_last: 'Lim',
      dob: '2019-03-28', gender: 'Male',
      site: 'coolaroo',
      programme_id: progMap['Beginners Principles'] ?? null,
      source: 'website',
      status: 'won', contacted: true, last_outcome: 'Enrolled',
      attempts: 1, rebooks: 0,
      trial_at: '2026-06-11T17:00:00+10:00', confirmation_sent_at: '2026-06-11T09:00:00+10:00', form_received: true,
      next_action_at: null,
      sold_at: '2026-06-11T17:30:00+10:00', sold_by: receptionistId, payment_taken: true,
      verified_at: '2026-06-11T18:00:00+10:00', verified_by: adminId,
      lost_reason: null, nurture_followup_at: null,
      received_at: '2026-06-11T09:00:00+10:00',
      created_by: receptionistId,
      enquiry_raw: { relationship: 'Mother', guardian: 'Jen Lim', mobile: '0411 502 668', email: 'jen.l@example.com', childName: 'Oscar Lim', dob: '28/03/2019', gender: 'Male', prefDays: 'Thursday', prior: 'None' },
    },
  ]

  for (const lead of leadsToSeed) {
    if (!lead.guardian_id) continue   // skip if guardian wasn't created
    const exists = await leadExists(lead.child_first, lead.child_last, lead.guardian_id)
    if (!exists) {
      const { error } = await supabase.from('leads').insert(lead)
      if (error) {
        results.push({ email: `lead:${lead.child_first} ${lead.child_last}`, status: 'error', error: error.message })
      }
    }
  }

  // ──────────────────────────────────────────────────────────────
  // 6. Cancellation — Lucas Romano
  // ──────────────────────────────────────────────────────────────

  const { data: existingCancel } = await supabase
    .from('cancellations')
    .select('id')
    .eq('member_name', 'Lucas Romano')
    .limit(1)

  if (!existingCancel || existingCancel.length === 0) {
    await supabase.from('cancellations').insert({
      member_name: 'Lucas Romano',
      guardian_name: null,
      phone: null,
      email: null,
      site: 'coolaroo',
      level: null,
      reasons: ['Moved away'],
      feedback: null,
      rating: null,
      notice_date: '2026-06-09',
      effective_date: '2026-06-23',
      stage: 'received',
      save_outcome: null,
      outcome: null,
      outstanding_fees_flag: false,
      processed_by: null,
      verified_at: null,
      verified_by: null,
    })
  }

  return NextResponse.json({ ok: true, results })
}
