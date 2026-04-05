'use client';

import { useEffect, useState } from 'react';

interface Conversation {
  id: string;
  contactName: string;
  lastMessage: string;
  lastMessageDate: string;
  unreadCount: number;
  channel: string;
}

interface Stage {
  name: string;
  count: number;
}

interface GHLData {
  mock?: boolean;
  apiPending?: boolean;
  conversations: Conversation[];
  totalUnread?: number;
  contacts: { total: number; newThisWeek: number };
  opportunities: { total: number; stages: Stage[] };
}

const CHANNEL_COLOURS: Record<string, string> = {
  SMS: 'bg-blue-500/20 text-blue-400',
  Email: 'bg-purple-500/20 text-purple-400',
  Instagram: 'bg-pink-500/20 text-pink-400',
  Facebook: 'bg-indigo-500/20 text-indigo-400',
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gym-surface border border-gym-border rounded-xl p-5">
      <p className="text-gym-muted text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className="text-gym-text text-3xl font-bold">{value}</p>
      {sub && <p className="text-gym-muted text-xs mt-1">{sub}</p>}
    </div>
  );
}

export default function GoHighLevelPage() {
  const [data, setData] = useState<GHLData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/gohighlevel')
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const totalUnread = data?.totalUnread ?? data?.conversations.reduce((sum, c) => sum + c.unreadCount, 0) ?? 0;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gym-text">GoHighLevel CRM</h1>
          <p className="text-gym-muted text-sm mt-1">Contacts, pipeline & messages</p>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full font-medium ${
          loading ? 'bg-yellow-500/10 text-yellow-400' :
          data?.apiPending ? 'bg-yellow-500/10 text-yellow-400' :
          data?.mock ? 'bg-blue-500/10 text-blue-400' :
          'bg-green-500/10 text-green-400'
        }`}>
          {loading ? 'Connecting…' : data?.apiPending ? 'API Key Needed' : data?.mock ? 'Sample Data' : 'Live'}
        </span>
      </div>

      {/* Notices */}
      {data?.apiPending && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 mb-6 flex items-start gap-3">
          <span className="text-yellow-400">⏳</span>
          <div>
            <p className="text-yellow-400 font-semibold text-sm">API Key Required</p>
            <p className="text-gym-muted text-xs mt-0.5">Add GHL_API_KEY and GHL_LOCATION_ID to your Vercel environment variables to see live data.</p>
          </div>
        </div>
      )}
      {data?.mock && !data?.apiPending && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-6 flex items-start gap-3">
          <span className="text-blue-400">ℹ️</span>
          <div>
            <p className="text-blue-400 font-semibold text-sm">Sample Data</p>
            <p className="text-gym-muted text-xs mt-0.5">Add your GHL API key and Location ID to connect live CRM data.</p>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Unread Messages"
          value={loading ? '—' : totalUnread}
          sub={`${data?.conversations.length ?? 0} open conversations`}
        />
        <StatCard
          label="Total Contacts"
          value={loading ? '—' : (data?.contacts.total ?? 0).toLocaleString()}
          sub={data?.contacts.newThisWeek ? `+${data.contacts.newThisWeek} this week` : undefined}
        />
        <StatCard
          label="Open Opportunities"
          value={loading ? '—' : data?.opportunities.total ?? 0}
          sub="In pipeline"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Unread messages — 2 cols */}
        <div className="lg:col-span-2 bg-gym-surface border border-gym-border rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gym-border flex items-center justify-between">
            <h2 className="text-gym-text font-semibold">Unread Messages</h2>
            {totalUnread > 0 && (
              <span className="bg-gym-accent text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {totalUnread}
              </span>
            )}
          </div>

          {loading ? (
            <div className="p-12 text-center text-gym-muted text-sm">Loading…</div>
          ) : (data?.conversations.length ?? 0) === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gym-text font-medium mb-1">All caught up!</p>
              <p className="text-gym-muted text-sm">No unread messages right now.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gym-border">
              {data?.conversations.map(conv => (
                <li key={conv.id} className="px-6 py-4 hover:bg-gym-border/20 transition-colors cursor-pointer">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-gym-accent/20 flex items-center justify-center flex-shrink-0 text-gym-accent font-semibold text-sm">
                        {conv.contactName.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-gym-text font-semibold text-sm truncate">{conv.contactName}</p>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${CHANNEL_COLOURS[conv.channel] ?? 'bg-gym-border text-gym-muted'}`}>
                            {conv.channel}
                          </span>
                        </div>
                        <p className="text-gym-muted text-xs truncate">{conv.lastMessage}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <p className="text-gym-muted text-xs">{timeAgo(conv.lastMessageDate)}</p>
                      {conv.unreadCount > 0 && (
                        <span className="bg-gym-accent text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Pipeline stages */}
        <div className="bg-gym-surface border border-gym-border rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gym-border">
            <h2 className="text-gym-text font-semibold">Pipeline</h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-gym-muted text-sm">Loading…</div>
          ) : (
            <ul className="divide-y divide-gym-border">
              {data?.opportunities.stages.map((stage, i) => {
                const maxCount = Math.max(...(data?.opportunities.stages.map(s => s.count) ?? [1]));
                const pct = Math.round((stage.count / maxCount) * 100);
                const colours = ['bg-blue-500', 'bg-purple-500', 'bg-gym-accent', 'bg-green-500'];
                return (
                  <li key={stage.name} className="px-6 py-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-gym-text text-sm font-medium">{stage.name}</p>
                      <p className="text-gym-muted text-sm">{stage.count}</p>
                    </div>
                    <div className="bg-gym-border rounded-full h-1.5">
                      <div
                        className={`${colours[i % colours.length]} h-1.5 rounded-full transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
