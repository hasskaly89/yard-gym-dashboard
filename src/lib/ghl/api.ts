const V1 = 'https://rest.gohighlevel.com/v1'
const API_KEY = () => process.env.GHL_API_KEY ?? ''
const LOCATION_ID = () => process.env.GHL_LOCATION_ID ?? ''

async function ghlFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${V1}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_KEY()}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GHL ${res.status}: ${body}`)
  }
  return res.json()
}

export interface GHLContactPayload {
  firstName: string
  lastName: string
  email?: string
  phone?: string
  tags?: string[]
  customField?: Record<string, string>
}

export async function findGHLContactByEmail(email: string): Promise<string | null> {
  try {
    const data = await ghlFetch(
      `/contacts/?locationId=${LOCATION_ID()}&query=${encodeURIComponent(email)}&limit=1`
    )
    const contacts = data.contacts ?? []
    return contacts.length > 0 ? contacts[0].id : null
  } catch {
    return null
  }
}

export async function createGHLContact(payload: GHLContactPayload): Promise<string> {
  const data = await ghlFetch('/contacts/', {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      locationId: LOCATION_ID(),
    }),
  })
  return data.contact?.id ?? data.id
}

export async function updateGHLContact(contactId: string, payload: Partial<GHLContactPayload>) {
  return ghlFetch(`/contacts/${contactId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function addGHLTag(contactId: string, tag: string) {
  return ghlFetch(`/contacts/${contactId}/tags`, {
    method: 'POST',
    body: JSON.stringify({ tags: [tag] }),
  })
}

export async function createOrSyncGHLContact(member: {
  first_name: string
  last_name: string
  email?: string | null
  phone?: string | null
  mindbody_client_id: string
  total_visit_count?: number
  last_visit_date?: string | null
  membership_start_date?: string | null
}): Promise<string | null> {
  if (!API_KEY() || !LOCATION_ID()) return null

  try {
    let contactId = member.email
      ? await findGHLContactByEmail(member.email)
      : null

    const payload: GHLContactPayload = {
      firstName: member.first_name,
      lastName: member.last_name,
      email: member.email ?? undefined,
      phone: member.phone ?? undefined,
      customField: {
        mindbody_client_id: member.mindbody_client_id,
        ...(member.total_visit_count !== undefined && {
          total_sessions: String(member.total_visit_count),
        }),
        ...(member.last_visit_date && { last_visit_date: member.last_visit_date }),
        ...(member.membership_start_date && {
          membership_start_date: member.membership_start_date,
        }),
      },
    }

    if (contactId) {
      await updateGHLContact(contactId, payload)
    } else {
      contactId = await createGHLContact(payload)
    }

    return contactId
  } catch (err) {
    console.error('[GHL] Contact sync failed:', err)
    return null
  }
}

export async function triggerGHLWebhook(
  webhookUrl: string,
  payload: Record<string, unknown>
) {
  if (!webhookUrl) return null

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    console.error(`[GHL Webhook] ${res.status}: ${await res.text()}`)
    return null
  }

  return res.json().catch(() => ({ ok: true }))
}
