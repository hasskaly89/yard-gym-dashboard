import { NextResponse } from 'next/server';

const GHL_BASE = 'https://services.leadconnectorhq.com';
const API_KEY = process.env.GHL_API_KEY ?? '';
const LOCATION_ID = process.env.GHL_LOCATION_ID ?? '';

async function ghlFetch(path: string) {
  const res = await fetch(`${GHL_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      Version: '2021-07-28',
    },
  });
  const text = await res.text();
  try {
    return { status: res.status, ok: res.ok, data: JSON.parse(text) };
  } catch {
    return { status: res.status, ok: res.ok, data: text };
  }
}

export async function GET() {
  const results = {
    locationId: LOCATION_ID,
    hasApiKey: !!API_KEY,
    conversations: await ghlFetch(`/conversations/search?locationId=${LOCATION_ID}&limit=5`),
    contacts: await ghlFetch(`/contacts/?locationId=${LOCATION_ID}&limit=5`),
    opportunities: await ghlFetch(`/opportunities/search?location_id=${LOCATION_ID}&limit=5`),
  };
  return NextResponse.json(results);
}
