const MB_BASE = 'https://api.mindbodyonline.com/public/v6'

// --- Call instrumentation -------------------------------------------------
// MindBody bills $0.002 per API call, so every request is money. This module
// keeps a running counter of outbound MindBody requests. Sync jobs reset it at
// the start of a run and read it at the end (getMBCallCount) to report — and
// cap — how many calls (and therefore dollars) a run cost. This is the guard
// rail that keeps us from ever recreating the 203k-call / $406 month.
let mbCallCount = 0

export function getMBCallCount(): number {
  return mbCallCount
}

export function resetMBCallCount(): void {
  mbCallCount = 0
}

/** Wraps fetch, counting every MindBody call. Use for all MB requests. */
async function mbFetch(url: string, init?: RequestInit): Promise<Response> {
  mbCallCount++
  return fetch(url, init)
}

function mbHeaders(token?: string) {
  const headers: Record<string, string> = {
    'Api-Key': process.env.MINDBODY_API_KEY!,
    'SiteId': process.env.MINDBODY_SITE_ID!,
  }
  if (token) headers['Authorization'] = token
  return headers
}

export async function getMBToken(): Promise<string> {
  const res = await mbFetch(`${MB_BASE}/usertoken/issue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...mbHeaders(),
    },
    body: JSON.stringify({
      Username: process.env.MINDBODY_USERNAME,
      Password: process.env.MINDBODY_PASSWORD,
    }),
  })
  if (!res.ok) throw new Error(`MB token error: ${await res.text()}`)
  const data = await res.json()
  return data.AccessToken
}

export async function fetchMBClients(token: string, offset = 0, limit = 200) {
  const res = await mbFetch(
    `${MB_BASE}/client/clients?Active=true&Limit=${limit}&Offset=${offset}`,
    { headers: mbHeaders(token) }
  )
  if (!res.ok) throw new Error(`MB clients error: ${await res.text()}`)
  return res.json()
}

export async function fetchMBClientVisits(
  token: string,
  clientId: string,
  startDate?: string,
  endDate?: string,
  offset = 0,
  limit = 200
) {
  const params = new URLSearchParams({
    ClientId: clientId,
    Limit: String(limit),
    Offset: String(offset),
  })
  if (startDate) params.set('StartDate', startDate)
  if (endDate) params.set('EndDate', endDate)

  const res = await mbFetch(
    `${MB_BASE}/client/clientvisits?${params}`,
    { headers: mbHeaders(token) }
  )
  if (!res.ok) throw new Error(`MB visits error: ${await res.text()}`)
  return res.json()
}

export async function fetchMBActiveMemberships(
  token: string,
  clientId?: string,
  offset = 0,
  limit = 200
) {
  const params = new URLSearchParams({
    Limit: String(limit),
    Offset: String(offset),
  })
  if (clientId) params.set('ClientId', clientId)

  const res = await mbFetch(
    `${MB_BASE}/client/activeclientmemberships?${params}`,
    { headers: mbHeaders(token) }
  )
  if (!res.ok) throw new Error(`MB memberships error: ${await res.text()}`)
  return res.json()
}
