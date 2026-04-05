import { NextResponse } from 'next/server';

const LOCATION_ID = process.env.GHL_LOCATION_ID ?? '';
const PRIVATE_TOKEN = process.env.GHL_PRIVATE_TOKEN ?? '';
const V2 = 'https://services.leadconnectorhq.com';

async function tryFetch(label: string, url: string, token: string) {
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Version: '2021-07-28',
      },
      cache: 'no-store',
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
    tryFetch('convs-all', `${V2}/conversations/search?locationId=${LOCATION_ID}&limit=5`, PRIVATE_TOKEN),
    tryFetch('convs-unread', `${V2}/conversations/search?locationId=${LOCATION_ID}&unreadOnly=true&limit=5`, PRIVATE_TOKEN),
    tryFetch('convs-unread2', `${V2}/conversations/search?locationId=${LOCATION_ID}&unread=true&limit=5`, PRIVATE_TOKEN),
    tryFetch('convs-status', `${V2}/conversations/search?locationId=${LOCATION_ID}&status=unread&limit=5`, PRIVATE_TOKEN),
  ]);
  return NextResponse.json({ locationId: LOCATION_ID, hasPrivateToken: !!PRIVATE_TOKEN, results });
}
