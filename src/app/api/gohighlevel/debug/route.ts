import { NextResponse } from 'next/server';

const API_KEY = process.env.GHL_API_KEY ?? '';
const LOCATION_ID = process.env.GHL_LOCATION_ID ?? '';

async function tryFetch(label: string, url: string, headers: Record<string, string>) {
  try {
    const res = await fetch(url, { headers });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { label, status: res.status, ok: res.ok, data };
  } catch (e) {
    return { label, error: String(e) };
  }
}

export async function GET() {
  const v1Headers = {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  };
  const v2Headers = {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };

  const results = await Promise.all([
    // v1 endpoints
    tryFetch('v1-contacts', `https://rest.gohighlevel.com/v1/contacts/?locationId=${LOCATION_ID}&limit=5`, v1Headers),
    tryFetch('v1-conversations', `https://rest.gohighlevel.com/v1/conversations/?locationId=${LOCATION_ID}&limit=5`, v1Headers),
    tryFetch('v1-pipelines', `https://rest.gohighlevel.com/v1/opportunities/pipelines/?locationId=${LOCATION_ID}`, v1Headers),
    // v2 endpoints
    tryFetch('v2-contacts', `https://services.leadconnectorhq.com/contacts/?locationId=${LOCATION_ID}&limit=5`, v2Headers),
    tryFetch('v2-conversations', `https://services.leadconnectorhq.com/conversations/search?locationId=${LOCATION_ID}&limit=5`, v2Headers),
  ]);

  return NextResponse.json({ locationId: LOCATION_ID, hasApiKey: !!API_KEY, results });
}
