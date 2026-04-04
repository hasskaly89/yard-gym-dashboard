import { NextResponse } from 'next/server';

const V1 = 'https://rest.gohighlevel.com/v1';
const API_KEY = process.env.GHL_API_KEY ?? '';
const LOCATION_ID = process.env.GHL_LOCATION_ID ?? '';

const MOCK_DATA = {
  mock: true,
  apiPending: false,
  conversations: [
    { id: '1', contactName: 'James Fletcher', lastMessage: 'Hey, what are the membership prices?', lastMessageDate: new Date(Date.now() - 5 * 60 * 1000).toISOString(), unreadCount: 2, channel: 'SMS' },
    { id: '2', contactName: 'Priya Sharma', lastMessage: 'Can I book a personal training session?', lastMessageDate: new Date(Date.now() - 22 * 60 * 1000).toISOString(), unreadCount: 1, channel: 'Email' },
    { id: '3', contactName: 'Tom Wu', lastMessage: 'Is the gym open on public holidays?', lastMessageDate: new Date(Date.now() - 45 * 60 * 1000).toISOString(), unreadCount: 3, channel: 'SMS' },
    { id: '4', contactName: 'Lena Kovac', lastMessage: 'Just signed up! When can I start?', lastMessageDate: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), unreadCount: 1, channel: 'Instagram' },
    { id: '5', contactName: 'Marcus Daly', lastMessage: 'Do you offer student discounts?', lastMessageDate: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), unreadCount: 1, channel: 'Facebook' },
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

async function v1Fetch(path: string) {
  const res = await fetch(`${V1}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function GET() {
  if (!API_KEY || !LOCATION_ID) return NextResponse.json(MOCK_DATA);

  try {
    const [contactsData, convsData, oppsData] = await Promise.allSettled([
      v1Fetch(`/contacts/?locationId=${LOCATION_ID}&limit=1`),
      v1Fetch(`/conversations/search?locationId=${LOCATION_ID}&status=unread&limit=20`),
      v1Fetch(`/opportunities/search?locationId=${LOCATION_ID}&limit=100`),
    ]);

    // Contacts
    const contacts = contactsData.status === 'fulfilled'
      ? { total: contactsData.value.meta?.total ?? 0, newThisWeek: 0 }
      : { total: 0, newThisWeek: 0 };

    // Conversations
    type RawConv = {
      id: string;
      contactName?: string;
      fullName?: string;
      lastMessageBody?: string;
      lastMessage?: string;
      lastMessageDate?: string;
      dateUpdated?: string;
      unreadCount?: number;
      type?: string;
      channel?: string;
    };
    const rawConvs: RawConv[] = convsData.status === 'fulfilled'
      ? (convsData.value.conversations ?? [])
      : [];

    const conversations = rawConvs.map((c) => ({
      id: c.id,
      contactName: c.contactName ?? c.fullName ?? 'Unknown',
      lastMessage: c.lastMessageBody ?? c.lastMessage ?? '',
      lastMessageDate: c.lastMessageDate ?? c.dateUpdated ?? new Date().toISOString(),
      unreadCount: c.unreadCount ?? 1,
      channel: c.type ?? c.channel ?? 'SMS',
    }));

    // Opportunities
    type RawOpp = { stage?: { name?: string }; pipelineStage?: string };
    const rawOpps: RawOpp[] = oppsData.status === 'fulfilled'
      ? (oppsData.value.opportunities ?? [])
      : [];
    const stageCounts: Record<string, number> = {};
    for (const o of rawOpps) {
      const name = o.stage?.name ?? o.pipelineStage ?? 'Unknown';
      stageCounts[name] = (stageCounts[name] ?? 0) + 1;
    }

    return NextResponse.json({
      mock: false,
      apiPending: false,
      conversations,
      contacts,
      opportunities: {
        total: oppsData.status === 'fulfilled' ? (oppsData.value.meta?.total ?? rawOpps.length) : 0,
        stages: Object.entries(stageCounts).map(([name, count]) => ({ name, count })),
      },
    });
  } catch {
    return NextResponse.json({ ...MOCK_DATA, apiPending: true });
  }
}
