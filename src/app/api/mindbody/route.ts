import { NextResponse } from 'next/server';

const MB_BASE = 'https://api.mindbodyonline.com/public/v6';
const SITE_ID = process.env.MINDBODY_SITE_ID ?? '-99';
const API_KEY = process.env.MINDBODY_API_KEY ?? '';
const USERNAME = process.env.MINDBODY_USERNAME ?? '';
const PASSWORD = process.env.MINDBODY_PASSWORD ?? '';

// Mock data used until MindBody approves API access
const MOCK_DATA = {
  mock: true,
  clients: {
    TotalResults: 248,
    Clients: [],
  },
  classes: {
    Classes: [
      { Id: 1, ClassDescription: { Name: 'CrossFit' }, StartDateTime: new Date().toISOString(), TotalBooked: 14, MaxCapacity: 20, Staff: { Name: 'Jake Morley' } },
      { Id: 2, ClassDescription: { Name: 'Boxing' }, StartDateTime: new Date().toISOString(), TotalBooked: 8, MaxCapacity: 15, Staff: { Name: 'Sara Hill' } },
      { Id: 3, ClassDescription: { Name: 'Yoga Flow' }, StartDateTime: new Date().toISOString(), TotalBooked: 12, MaxCapacity: 12, Staff: { Name: 'Mia Chen' } },
      { Id: 4, ClassDescription: { Name: 'HIIT' }, StartDateTime: new Date().toISOString(), TotalBooked: 10, MaxCapacity: 18, Staff: { Name: 'Jake Morley' } },
    ],
  },
  visits: {
    TotalResults: 312,
    ClientVisits: [],
  },
};

async function getStaffToken(): Promise<string> {
  const res = await fetch(`${MB_BASE}/usertoken/issue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'API-Key': API_KEY,
      'SiteId': SITE_ID,
    },
    body: JSON.stringify({ Username: USERNAME, Password: PASSWORD }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token error: ${err}`);
  }

  const data = await res.json();
  return data.AccessToken;
}

async function mbFetch(path: string, token: string) {
  const res = await fetch(`${MB_BASE}${path}`, {
    headers: {
      'API-Key': API_KEY,
      'SiteId': SITE_ID,
      'Authorization': `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error(`MindBody API error on ${path}: ${res.status}`);
  return res.json();
}

export async function GET() {
  // Fall back to mock data if no API key set
  if (!API_KEY) {
    return NextResponse.json(MOCK_DATA);
  }

  try {
    const token = await getStaffToken();

    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const [clientsData, classesData, visitsData] = await Promise.allSettled([
      mbFetch(`/client/clients?limit=200`, token),
      mbFetch(`/class/classes?startDateTime=${today}&limit=20`, token),
      mbFetch(`/client/clientvisits?startDate=${weekAgo}&endDate=${today}&limit=200`, token),
    ]);

    return NextResponse.json({
      mock: false,
      clients: clientsData.status === 'fulfilled' ? clientsData.value : null,
      classes: classesData.status === 'fulfilled' ? classesData.value : null,
      visits: visitsData.status === 'fulfilled' ? visitsData.value : null,
    });
  } catch {
    // API not approved yet — return mock data with a flag
    return NextResponse.json({ ...MOCK_DATA, apiPending: true });
  }
}
