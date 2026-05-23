const V1 = 'https://rest.gohighlevel.com/v1'
const V2 = 'https://services.leadconnectorhq.com'
const API_KEY = () => process.env.GHL_API_KEY ?? ''
const PRIVATE_TOKEN = () => process.env.GHL_PRIVATE_TOKEN ?? ''
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

async function ghlV2Fetch(path: string) {
  // GHL v2 rate limits aggressively — retry on 429 with linear backoff
  // (1s, then 2s) before giving up. Real not-found responses (404) and other
  // errors bubble immediately.
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${V2}${path}`, {
      headers: {
        Authorization: `Bearer ${PRIVATE_TOKEN()}`,
        Version: '2021-07-28',
        Accept: 'application/json',
      },
    })
    if (res.status === 429 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
      continue
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`GHL v2 ${res.status}: ${body.slice(0, 200)}`)
    }
    return res.json()
  }
  throw new Error('GHL v2 429: rate-limited after retries')
}

export interface GHLContactPayload {
  firstName: string
  lastName: string
  email?: string
  phone?: string
  tags?: string[]
  customField?: Record<string, string>
}

// Normalise an AU phone number to E.164 (+61...). GHL stores Australian
// numbers as +61XXXXXXXXX; MindBody often returns local format "0404..." or
// just "404..." or already-formatted "+61404...". Returns null if the input
// is too short to be a real number.
function toE164AU(raw: string): string | null {
  if (!raw) return null
  if (raw.trim().startsWith('+')) return raw.trim().replace(/\s+/g, '')
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10 && digits.startsWith('0')) return '+61' + digits.slice(1)
  if (digits.length === 9) return '+61' + digits
  if (digits.startsWith('61') && digits.length >= 11) return '+' + digits
  if (digits.length >= 8) return '+' + digits
  return null
}

export async function findGHLContactByPhone(phone: string): Promise<string | null> {
  if (!PRIVATE_TOKEN() || !LOCATION_ID()) return null
  const normalized = toE164AU(phone)
  if (!normalized) return null
  try {
    const data = await ghlV2Fetch(
      `/contacts/search/duplicate?locationId=${encodeURIComponent(LOCATION_ID())}&number=${encodeURIComponent(normalized)}`,
    )
    return data.contact?.id ?? null
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('404')) {
      console.error('[GHL] findGHLContactByPhone failed for', phone, msg)
    }
    return null
  }
}

export async function findGHLContactByEmail(email: string): Promise<string | null> {
  // GHL v1 /contacts?query= returns 404 (deprecated). Use v2's
  // /contacts/search/duplicate which is the canonical "find by email" lookup
  // and authenticates with the Private Integration Token.
  if (!PRIVATE_TOKEN() || !LOCATION_ID()) return null
  try {
    const data = await ghlV2Fetch(
      `/contacts/search/duplicate?locationId=${encodeURIComponent(LOCATION_ID())}&email=${encodeURIComponent(email)}`,
    )
    return data.contact?.id ?? null
  } catch (err) {
    // Don't spam logs for "no duplicate found" — that's a normal 404 here.
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('404')) {
      console.error('[GHL] findGHLContactByEmail failed for', email, msg)
    }
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
