import { getMBToken, fetchMBClients } from './api'
import { createAdminClient } from '@/lib/supabase/admin'

export async function syncMindBodyMembers() {
  const token = await getMBToken()
  const supabase = createAdminClient()

  let offset = 0
  const limit = 200
  let totalSynced = 0
  const errors: string[] = []

  while (true) {
    const data = await fetchMBClients(token, offset, limit)
    const clients = data.Clients || []

    if (clients.length === 0) break

    const rows = clients
      .filter((c: any) => c.Email)
      .map((c: any) => ({
        mindbody_client_id: String(c.Id),
        first_name: c.FirstName || '',
        last_name: c.LastName || '',
        email: c.Email?.toLowerCase(),
        phone: c.MobilePhone || null,
        photo_url: c.PhotoUrl || null,
        active: c.Active ?? true,
        birth_date: c.BirthDate ? c.BirthDate.split('T')[0] : null,
        membership_start_date: c.CreationDate ? c.CreationDate.split('T')[0] : null,
        status: c.Active ? 'active' : 'inactive',
        last_synced_at: new Date().toISOString(),
      }))

    const { error } = await supabase
      .from('members')
      .upsert(rows, { onConflict: 'mindbody_client_id' })

    if (error) errors.push(error.message)
    else totalSynced += rows.length

    if (clients.length < limit) break
    offset += limit
  }

  return { synced: totalSynced, errors }
}
