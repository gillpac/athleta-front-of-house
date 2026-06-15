'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { logAudit } from '@/lib/audit'
import type { SiteT, UserRole } from '@/types'

function revalidate() {
  revalidatePath('/settings')
  revalidatePath('/today')
}

// ── Blockout days ─────────────────────────────────────────────────────────────
export async function addBlockoutDay(sites: SiteT[], day: string, label: string, userId: string) {
  const admin = createAdminClient()
  for (const site of sites) {
    const { data, error } = await admin.from('blockout_days').insert({ site, day, label }).select().single()
    if (error) throw new Error(error.message)
    await logAudit({ entity: 'blockout_days', entity_id: data.id, user_id: userId, action: 'add_blockout', after: { site, day, label } })
  }
  revalidate()
}

export async function deleteBlockoutDay(id: string, userId: string) {
  const admin = createAdminClient()
  const { data: before } = await admin.from('blockout_days').select('*').eq('id', id).single()
  await admin.from('blockout_days').delete().eq('id', id)
  await logAudit({ entity: 'blockout_days', entity_id: id, user_id: userId, action: 'delete_blockout', before })
  revalidate()
}

// ── Programmes ────────────────────────────────────────────────────────────────
export async function upsertProgramme(
  id: string | null,
  name: string,
  minAge: number | null,
  maxAge: number | null,
  sort: number,
  userId: string
) {
  const admin = createAdminClient()
  if (id) {
    const { data: before } = await admin.from('programmes').select('*').eq('id', id).single()
    await admin.from('programmes').update({ name, min_age: minAge, max_age: maxAge, sort }).eq('id', id)
    await logAudit({ entity: 'programmes', entity_id: id, user_id: userId, action: 'update_programme', before, after: { name, minAge, maxAge, sort } })
  } else {
    const { data } = await admin.from('programmes').insert({ name, min_age: minAge, max_age: maxAge, sort, active: true }).select().single()
    await logAudit({ entity: 'programmes', entity_id: data?.id ?? '', user_id: userId, action: 'create_programme', after: { name, minAge, maxAge, sort } })
  }
  revalidate()
}

export async function archiveProgramme(id: string, userId: string) {
  const admin = createAdminClient()
  const { data: before } = await admin.from('programmes').select('*').eq('id', id).single()
  await admin.from('programmes').update({ active: false }).eq('id', id)
  await logAudit({ entity: 'programmes', entity_id: id, user_id: userId, action: 'archive_programme', before })
  revalidate()
}

export async function restoreProgramme(id: string, userId: string) {
  const admin = createAdminClient()
  await admin.from('programmes').update({ active: true }).eq('id', id)
  await logAudit({ entity: 'programmes', entity_id: id, user_id: userId, action: 'restore_programme' })
  revalidate()
}

// ── Checklist items ───────────────────────────────────────────────────────────
export async function upsertChecklistItem(
  id: string | null,
  label: string,
  site: SiteT | null,
  role: UserRole | null,
  sort: number,
  userId: string
) {
  const admin = createAdminClient()
  if (id) {
    const { data: before } = await admin.from('checklist_items').select('*').eq('id', id).single()
    await admin.from('checklist_items').update({ label, site, role, sort }).eq('id', id)
    await logAudit({ entity: 'checklist_items', entity_id: id, user_id: userId, action: 'update_checklist_item', before, after: { label, site, role, sort } })
  } else {
    const { data } = await admin.from('checklist_items').insert({ label, site, role, sort, active: true }).select().single()
    await logAudit({ entity: 'checklist_items', entity_id: data?.id ?? '', user_id: userId, action: 'create_checklist_item', after: { label, site, role, sort } })
  }
  revalidate()
}

export async function toggleChecklistItem(id: string, active: boolean, userId: string) {
  const admin = createAdminClient()
  await admin.from('checklist_items').update({ active }).eq('id', id)
  await logAudit({ entity: 'checklist_items', entity_id: id, user_id: userId, action: active ? 'enable_checklist_item' : 'disable_checklist_item' })
  revalidate()
}

// ── Users ─────────────────────────────────────────────────────────────────────
export async function createUser(
  email: string,
  name: string,
  role: UserRole,
  site: SiteT | null,
  userId: string
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const tempPassword = `Athleta${Math.random().toString(36).slice(2, 10)}!`
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password: tempPassword, email_confirm: true,
  })
  if (error || !created.user) return { ok: false, error: error?.message ?? 'Failed to create user' }
  await admin.from('app_users').insert({ id: created.user.id, email, name, role, site, active: true })
  await logAudit({ entity: 'app_users', entity_id: created.user.id, user_id: userId, action: 'create_user', after: { email, name, role, site } })
  revalidate()
  return { ok: true }
}

export async function updateUser(
  id: string,
  name: string,
  role: UserRole,
  site: SiteT | null,
  userId: string
) {
  const admin = createAdminClient()
  const { data: before } = await admin.from('app_users').select('*').eq('id', id).single()
  await admin.from('app_users').update({ name, role, site }).eq('id', id)
  await logAudit({ entity: 'app_users', entity_id: id, user_id: userId, action: 'update_user', before, after: { name, role, site } })
  revalidate()
}

export async function setUserActive(id: string, active: boolean, userId: string) {
  const admin = createAdminClient()
  await admin.from('app_users').update({ active }).eq('id', id)
  await logAudit({ entity: 'app_users', entity_id: id, user_id: userId, action: active ? 'activate_user' : 'deactivate_user' })
  revalidate()
}
