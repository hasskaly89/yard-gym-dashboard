import { NextResponse } from 'next/server';

const GHL_BASE = 'https://services.leadconnectorhq.com';
const API_KEY = process.env.GHL_API_KEY ?? '';
const LOCATION_ID = process.env.GHL_LOCATION_ID ?? '';

const MOCK_DATA = {
  mock: true,
  conversations: [
    {
      id: '1',
      contactName: 'James Fletcher',
      lastMessage: 'Hey, what are the membership prices?',
      lastMessageDate: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      unreadCount: 2,
      channel: 'SMS',
    },
    {
      id: '2',
      contactName: 'Priya Sharma',
      lastMessage: 'Can I book a personal training session?',
      lastMessageDate: new Date(Date.now() - 22 * 60 * 1000).toISOString(),
      unreadCount: 1,
      channel: 'Email',
    },
    {
      id: '3',
      contactName: 'Tom Wu',
      lastMessage: 'Is the gym open on public holidays?',
      lastMessageDate: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      unreadCount: 3,
      channel: 'SMS',
    },
    {
      id: '4',
      contactName: 'Lena Kovac',
      lastMessage: 'Just signed up! When can I start?',
      lastMessageDate: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      unreadCount: 1,
      channel: 'Instagram',
    },
    {
      id: '5',
      contactName: 'Marcus Daly',
      lastMessage: 'Do you offer student discounts?',
      lastMessageDate: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      unreadCount: 1,
      channel: 'Facebook',
    },
  ],
  contacts: { total: 1842, newThisWeek: 23 },
  opportunities: {
    total: 47,
    stages: [
      { name: 'New Lead', count: 18 },
      { name: 'Contacted', count: 12 },
      { name: 'Trial Booked', count: 9 },
      { name: 'Member', count: 8 },
    ],
  },
};

async function ghlFetch(path: string) {
  const res = await fetch(`${GHL_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      Version: '2021-07-28',
    },
  });
  if (!res.ok) throw new Error(`GHL error ${res.status} on ${path}`);
  return res.json();
}

export async function GET() {
  if (!API_KEY || !LOCATION_ID) {
    return NextResponse.json(MOCK_DATA);
  }

  try {
    const [convData, contactData, oppData] = await Promise.allSettled([
      ghlFetch(`/conversations/?locationId=${LOCATION_ID}&unreadOnly=true&limit=20`),
      ghlFetch(`/contacts/?locationId=${LOCATION_ID}&limit=1`),
      ghlFetch(`/opportunities/search?location_id=${LOCATION_ID}&limit=100`),
    ]);

    const rawConvs = convData.status === 'fulfilled'
      ? (convData.value.conversations ?? [])
      : [];

    const conversations = rawConvs.map((c: {
      id: string;
      contactName?: string;
      fullName?: string;
      lastMessage?: { body?: string; dateAdded?: string };
      unreadCount?: number;
      type?: string;
    }) => ({
      id: c.id,
      contactName: c.contactName ?? c.fullName ?? 'Unknown',
      lastMessage: c.lastMessage?.body ?? '',
      lastMessageDate: c.lastMessage?.dateAdded ?? new Date().toISOString(),
      unreadCount: c.unreadCount ?? 1,
      channel: c.type ?? 'SMS',
    }));

    const contacts = contactData.status === 'fulfilled'
      ? { total: contactData.value.total ?? 0, newThisWeek: 0 }
      : { total: 0, newThisWeek: 0 };

    const stages: Record<string, number> = {};
    if (oppData.status === 'fulfilled') {
      for (const o of oppData.value.opportunities ?? []) {
        const name = o.stage?.name ?? 'Unknown';
        stages[name] = (stages[name] ?? 0) + 1;
      }
    }

    return NextResponse.json({
      mock: false,
      conversations,
      contacts,
      opportunities: {
        total: oppData.status === 'fulfilled' ? (oppData.value.total ?? 0) : 0,
        stages: Object.entries(stages).map(([name, count]) => ({ name, count })),
      },
    });
  } catch {
    return NextResponse.json({ ...MOCK_DATA, apiPending: true });
  }
}
