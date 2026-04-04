import { NextResponse } from 'next/server';

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

async function ghlFetch(base: string, path: string, version?: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  };
  if (version) headers['Version'] = version;

  const res = await fetch(`${base}${path}`, { headers });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${res.status}: ${err}`);
  }
  return res.json();
}

export async function GET() {
  if (!API_KEY || !LOCATION_ID) {
    return NextResponse.json(MOCK_DATA);
  }

  // Try v1 API first (works with Location JWT keys)
  const V1 = 'https://rest.gohighlevel.com/v1';
  // Try v2 API as fallback
  const V2 = 'https://services.leadconnectorhq.com';
  const V2_VERSION = '2021-07-28';

  try {
    // Try v1 contacts first to see which API works
    let useV2 = false;
    try {
      await ghlFetch(V1, `/contacts/?limit=1`);
    } catch {
      useV2 = true;
    }

    if (useV2) {
      const [convData, contactData, oppData] = await Promise.allSettled([
        ghlFetch(V2, `/conversations/search?locationId=${LOCATION_ID}&limit=20`, V2_VERSION),
        ghlFetch(V2, `/contacts/?locationId=${LOCATION_ID}&limit=1`, V2_VERSION),
        ghlFetch(V2, `/opportunities/search?location_id=${LOCATION_ID}&limit=100`, V2_VERSION),
      ]);

      if (convData.status === 'rejected' && contactData.status === 'rejected') {
        // Both APIs failed — show mock with error notice
        return NextResponse.json({ ...MOCK_DATA, apiPending: true });
      }

      return NextResponse.json({
        mock: false,
        apiPending: false,
        conversations: convData.status === 'fulfilled'
          ? (convData.value.conversations ?? []).map((c: Record<string, unknown> & { lastMessage?: Record<string, unknown> }) => ({
              id: c.id,
              contactName: c.contactName ?? c.fullName ?? 'Unknown',
              lastMessage: (c.lastMessage as Record<string, unknown>)?.body ?? '',
              lastMessageDate: (c.lastMessage as Record<string, unknown>)?.dateAdded ?? new Date().toISOString(),
              unreadCount: c.unreadCount ?? 1,
              channel: c.type ?? 'SMS',
            }))
          : [],
        contacts: contactData.status === 'fulfilled'
          ? { total: contactData.value.total ?? 0, newThisWeek: 0 }
          : { total: 0, newThisWeek: 0 },
        opportunities: oppData.status === 'fulfilled'
          ? {
              total: oppData.value.total ?? 0,
              stages: Object.entries(
                (oppData.value.opportunities ?? []).reduce((acc: Record<string, number>, o: Record<string, unknown> & { stage?: Record<string, unknown> }) => {
                  const name = (o.stage as Record<string, unknown>)?.name as string ?? 'Unknown';
                  acc[name] = (acc[name] ?? 0) + 1;
                  return acc;
                }, {})
              ).map(([name, count]) => ({ name, count })),
            }
          : { total: 0, stages: [] },
      });
    }

    // v1 API worked — fetch all data
    const [convData, contactData, oppData] = await Promise.allSettled([
      ghlFetch(V1, `/conversations/?locationId=${LOCATION_ID}&limit=20`),
      ghlFetch(V1, `/contacts/?locationId=${LOCATION_ID}&limit=1`),
      ghlFetch(V1, `/opportunities/pipelines/?locationId=${LOCATION_ID}`),
    ]);

    const rawConvs: Array<Record<string, unknown>> = convData.status === 'fulfilled'
      ? (convData.value.conversations ?? [])
      : [];

    const unreadConvs = rawConvs
      .filter((c) => (c.unreadCount as number) > 0)
      .map((c) => ({
        id: c.id,
        contactName: (c.contact as Record<string, unknown>)?.name ?? c.contactName ?? 'Unknown',
        lastMessage: c.lastMessageBody ?? c.lastMessage ?? '',
        lastMessageDate: c.lastMessageDate ?? new Date().toISOString(),
        unreadCount: c.unreadCount ?? 1,
        channel: c.type ?? 'SMS',
      }));

    return NextResponse.json({
      mock: false,
      apiPending: false,
      conversations: unreadConvs,
      contacts: contactData.status === 'fulfilled'
        ? { total: contactData.value.total ?? 0, newThisWeek: 0 }
        : { total: 0, newThisWeek: 0 },
      opportunities: oppData.status === 'fulfilled'
        ? {
            total: (oppData.value.pipelines ?? []).reduce((sum: number, p: Record<string, unknown>) => sum + ((p.stages as unknown[])?.length ?? 0), 0),
            stages: (oppData.value.pipelines ?? []).flatMap((p: Record<string, unknown>) =>
              (p.stages as Array<Record<string, unknown>> ?? []).map((s) => ({ name: s.name as string, count: 0 }))
            ),
          }
        : { total: 0, stages: [] },
    });
  } catch {
    return NextResponse.json({ ...MOCK_DATA, apiPending: true });
  }
}
