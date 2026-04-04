import { NextResponse } from 'next/server';

const API_KEY = process.env.GHL_API_KEY ?? '';
const LOCATION_ID = process.env.GHL_LOCATION_ID ?? '';
const V1 = 'https://rest.gohighlevel.com/v1';

async function tryFetch(label: string, url: string) {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { label, status: res.status, ok: res.ok, data };
  } catch (e) {
    return { label, error: String(e) };
  }
}

export async function GET() {
  const results = await Promise.all([
    tryFetch('contacts', `${V1}/contacts/?locationId=${LOCATION_ID}&limit=3`),
    tryFetch('conversations-search', `${V1}/conversations/search?locationId=${LOCATION_ID}&limit=5`),
    tryFetch('conversations-list', `${V1}/conversations/?locationId=${LOCATION_ID}&limit=5`),
    tryFetch('conversations-unread', `${V1}/conversations/?locationId=${LOCATION_ID}&status=unread&limit=5`),
    tryFetch('pipelines', `${V1}/pipelines/?locationId=${LOCATION_ID}`),
    tryFetch('opportunities', `${V1}/opportunities/?locationId=${LOCATION_ID}&limit=5`),
    tryFetch('opportunities-search', `${V1}/opportunities/search?locationId=${LOCATION_ID}&limit=5`),
  ]);
  return NextResponse.json({ locationId: LOCATION_ID, results });
}
