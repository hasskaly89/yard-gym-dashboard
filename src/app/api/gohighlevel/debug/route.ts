import { NextResponse } from 'next/server';

const API_KEY = process.env.GHL_API_KEY ?? '';
const LOCATION_ID = process.env.GHL_LOCATION_ID ?? '';
const V1 = 'https://rest.gohighlevel.com/v1';

// Known pipeline IDs from previous debug
const PIPELINE_IDS = ['WxbBGLZQpAsWZweNJ73r', 'NZ7SCFBBmReBhwp2zngJ', 'Smo2vvB14O92YbIRpprh', 'rcdbmUAqdgDTCC0ObhF6'];

async function tryFetch(label: string, url: string) {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { label, status: res.status, ok: res.ok, keys: data && typeof data === 'object' ? Object.keys(data) : [], sample: data };
  } catch (e) {
    return { label, error: String(e) };
  }
}

export async function GET() {
  const results = await Promise.all([
    // Try opportunities with pipeline ID
    tryFetch('opps-pipeline-1', `${V1}/opportunities/search?pipelineId=${PIPELINE_IDS[0]}&locationId=${LOCATION_ID}&limit=3`),
    tryFetch('opps-pipeline-2', `${V1}/opportunities/search?pipelineId=${PIPELINE_IDS[2]}&locationId=${LOCATION_ID}&limit=3`),
    // Try conversations with different params
    tryFetch('convs-assigned', `${V1}/conversations/search?locationId=${LOCATION_ID}&assignedTo=&limit=5`),
    tryFetch('convs-q', `${V1}/conversations/search?locationId=${LOCATION_ID}&q=&limit=5`),
  ]);
  return NextResponse.json({ results });
}
