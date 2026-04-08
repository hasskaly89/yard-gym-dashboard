const MB_BASE = 'https://api.mindbodyonline.com/public/v6'

export async function getMBToken(): Promise<string> {
  const res = await fetch(`${MB_BASE}/usertoken/issue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Api-Key': process.env.MINDBODY_API_KEY!,
      'SiteId': process.env.MINDBODY_SITE_ID!,
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
    {
      headers: {
        'Api-Key': process.env.MINDBODY_API_KEY!,
        'SiteId': process.env.MINDBODY_SITE_ID!,
        'Authorization': token,
      },
    }
  )
  if (!res.ok) throw new Error(`MB clients error: ${await res.text()}`)
  return res.json()
}
