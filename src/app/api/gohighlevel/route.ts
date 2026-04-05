import { NextResponse } from 'next/server';

const V1 = 'https://rest.gohighlevel.com/v1';
const V2 = 'https://services.leadconnectorhq.com';
const API_KEY = process.env.GHL_API_KEY ?? '';
const PRIVATE_TOKEN = process.env.GHL_PRIVATE_TOKEN ?? '';
const LOCATION_ID = process.env.GHL_LOCATION_ID ?? '';

async function v1Fetch(path: string) {
  const res = await fetch(`${V1}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`v1 ${res.status}`);
  return res.json();
}

async function v2Fetch(path: string) {
  const res = await fetch(`${V2}${path}`, {
    headers: {
      Authorization: `Bearer ${PRIVATE_TOKEN}`,
      'Content-Type': 'application/json',
      Version: '2021-07-28',
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`v2 ${res.status}`);
  return res.json();
}

export async function GET() {
  if (!API_KEY || !LOCATION_ID) {
    return NextResponse.json({ mock: true });
  }

  // Fetch contacts & pipelines via v1 (known working)
  const [contactsData, pipelinesData] = await Promise.allSettled([
    v1Fetch(`/contacts/?locationId=${LOCATION_ID}&limit=1`),
    v1Fetch(`/pipelines/?locationId=${LOCATION_ID}`),
  ]);

  const contacts = contactsData.status === 'fulfilled'
    ? { total: contactsData.value.meta?.total ?? 0 }
    : { total: 0 };

  type Stage = { id: string; name: string };
  type Pipeline = { id: string; name: string; stages: Stage[] };
  const pipelines: Pipeline[] = pipelinesData.status === 'fulfilled'
    ? (pipelinesData.value.pipelines ?? [])
    : [];

  // Fetch opportunity counts per pipeline via v1
  const oppResults = await Promise.allSettled(
    pipelines.slice(0, 4).map(p =>
      v1Fetch(`/opportunities/search?pipelineId=${p.id}&locationId=${LOCATION_ID}&limit=1`)
        .then(d => ({ name: p.name, count: d.meta?.total ?? (d.opportunities?.length ?? 0) }))
        .catch(() => ({ name: p.name, count: 0 }))
    )
  );

  const stages = oppResults
    .filter(r => r.status === 'fulfilled')
    .map(r => (r as PromiseFulfilledResult<{ name: string; count: number }>).value);

  const totalOpps = stages.reduce((sum, s) => sum + s.count, 0);

  // Fetch real unread conversations via v2 Private Integration
  let conversations: {
    id: string;
    contactName: string;
    lastMessage: string;
    lastMessageDate: string;
    unreadCount: number;
    channel: string;
  }[] = [];

  if (PRIVATE_TOKEN) {
    try {
      const convData = await v2Fetch(
        `/conversations/search?locationId=${LOCATION_ID}&status=unread&limit=20`
      );
      const rawConvs = convData.conversations ?? [];

      const channelMap: Record<string, string> = {
        TYPE_INSTAGRAM: 'Instagram',
        TYPE_SMS: 'SMS',
        TYPE_EMAIL: 'Email',
        TYPE_FB_MESSENGER: 'Facebook',
        TYPE_WHATSAPP: 'WhatsApp',
        TYPE_PHONE: 'Phone',
      };

      conversations = rawConvs
        .filter((c: { unreadCount?: number }) => (c.unreadCount ?? 0) > 0)
        .map((c: {
          id: string;
          contactName?: string;
          fullName?: string;
          lastMessageBody?: string;
          lastMessageDate?: number;
          unreadCount?: number;
          lastMessageType?: string;
        }) => ({
          id: c.id,
          contactName: c.contactName ?? c.fullName ?? 'Unknown',
          lastMessage: c.lastMessageBody ?? '',
          lastMessageDate: c.lastMessageDate
            ? new Date(c.lastMessageDate).toISOString()
            : new Date().toISOString(),
          unreadCount: c.unreadCount ?? 1,
          channel: channelMap[c.lastMessageType ?? ''] ?? 'SMS',
        }));
    } catch {
      conversations = [];
    }
  }

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  return NextResponse.json({
    mock: false,
    apiPending: false,
    conversations,
    totalUnread,
    contacts,
    opportunities: { total: totalOpps, stages },
  });
}
