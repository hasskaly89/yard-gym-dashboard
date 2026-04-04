import { NextResponse } from 'next/server';

const V1 = 'https://rest.gohighlevel.com/v1';
const API_KEY = process.env.GHL_API_KEY ?? '';
const LOCATION_ID = process.env.GHL_LOCATION_ID ?? '';

const MOCK_CONVERSATIONS = [
  { id: '1', contactName: 'James Fletcher', lastMessage: 'Hey, what are the membership prices?', lastMessageDate: new Date(Date.now() - 5 * 60 * 1000).toISOString(), unreadCount: 2, channel: 'SMS' },
  { id: '2', contactName: 'Priya Sharma', lastMessage: 'Can I book a personal training session?', lastMessageDate: new Date(Date.now() - 22 * 60 * 1000).toISOString(), unreadCount: 1, channel: 'Email' },
  { id: '3', contactName: 'Tom Wu', lastMessage: 'Is the gym open on public holidays?', lastMessageDate: new Date(Date.now() - 45 * 60 * 1000).toISOString(), unreadCount: 3, channel: 'SMS' },
  { id: '4', contactName: 'Lena Kovac', lastMessage: 'Just signed up! When can I start?', lastMessageDate: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), unreadCount: 1, channel: 'Instagram' },
  { id: '5', contactName: 'Marcus Daly', lastMessage: 'Do you offer student discounts?', lastMessageDate: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), unreadCount: 1, channel: 'Facebook' },
];

async function v1Fetch(path: string) {
  const res = await fetch(`${V1}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function GET() {
  if (!API_KEY || !LOCATION_ID) {
    return NextResponse.json({ mock: true, conversations: MOCK_CONVERSATIONS, contacts: { total: 1842 }, opportunities: { total: 47, stages: [] } });
  }

  const [contactsData, pipelinesData] = await Promise.allSettled([
    v1Fetch(`/contacts/?locationId=${LOCATION_ID}&limit=1`),
    v1Fetch(`/pipelines/?locationId=${LOCATION_ID}`),
  ]);

  const contacts = contactsData.status === 'fulfilled'
    ? { total: contactsData.value.meta?.total ?? 0 }
    : { total: 0 };

  // Build pipeline stages from real pipeline data
  type Stage = { id: string; name: string };
  type Pipeline = { id: string; name: string; stages: Stage[] };
  const pipelines: Pipeline[] = pipelinesData.status === 'fulfilled'
    ? (pipelinesData.value.pipelines ?? [])
    : [];

  // Try to get opportunity counts per pipeline
  const oppResults = await Promise.allSettled(
    pipelines.slice(0, 4).map(p =>
      v1Fetch(`/opportunities/search?pipelineId=${p.id}&locationId=${LOCATION_ID}&limit=100`)
        .then(d => ({ pipelineId: p.id, name: p.name, total: d.meta?.total ?? (d.opportunities?.length ?? 0) }))
        .catch(() => ({ pipelineId: p.id, name: p.name, total: 0 }))
    )
  );

  const stages = oppResults
    .filter(r => r.status === 'fulfilled')
    .map(r => (r as PromiseFulfilledResult<{ name: string; total: number }>).value)
    .map(({ name, total }) => ({ name, count: total }));

  const totalOpps = stages.reduce((sum, s) => sum + s.count, 0);

  return NextResponse.json({
    mock: false,
    apiPending: false,
    conversations: MOCK_CONVERSATIONS, // real convs need OAuth — showing sample
    conversationsNote: 'GHL v1 does not expose conversations — requires OAuth upgrade',
    contacts,
    opportunities: { total: totalOpps, stages },
  });
}
