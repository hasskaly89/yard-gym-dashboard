const MB_BASE = 'https://api.mindbodyonline.com/public/v6'

function mbHeaders(token?: string) {
  const headers: Record<string, string> = {
    'Api-Key': process.env.MINDBODY_API_KEY!,
    'SiteId': process.env.MINDBODY_SITE_ID!,
  }
  if (token) headers['Authorization'] = token
  return headers
}

export async function getMBToken(): Promise<string> {
  const res = await fetch(`${MB_BASE}/usertoken/issue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...mbHeaders(),
    },
    body: JSON.stringify({
      Username: process.env.MINDBODY_STAFF_USERNAME,
      Password: process.env.MINDBODY_STAFF_PASSWORD,
    }),
  })
  if (!res.ok) throw new Error(`MB token error: ${await res.text()}`)
  const data = await res.json()
  return data.AccessToken
}

export async function fetchMBClients(token: string, offset = 0, limit = 200) {
  const res = await fetch(
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

  const res = await fetch(
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

  const res = await fetch(
    `${MB_BASE}/client/activeclientmemberships?${params}`,
    { headers: mbHeaders(token) }
  )
  if (!res.ok) throw new Error(`MB memberships error: ${await res.text()}`)
  return res.json()
}
