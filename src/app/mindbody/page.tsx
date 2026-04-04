'use client';

import { useEffect, useState } from 'react';

interface MBClass {
  Id: number;
  ClassDescription: { Name: string };
  StartDateTime: string;
  TotalBooked: number;
  MaxCapacity: number;
  Staff: { Name: string };
}

interface MBClient {
  Id: string;
  FirstName: string;
  LastName: string;
  Email: string;
  Status: string;
}

interface MBData {
  clients: { Clients: MBClient[]; TotalResults: number } | null;
  classes: { Classes: MBClass[] } | null;
  visits: { ClientVisits: unknown[]; TotalResults: number } | null;
  error?: string;
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

export default function MindBodyPage() {
  const [data, setData] = useState<MBData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/mindbody')
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError('Failed to connect to MindBody'))
      .finally(() => setLoading(false));
  }, []);

  const totalClients = data?.clients?.TotalResults ?? 0;
  const todaysClasses = data?.classes?.Classes ?? [];
  const weeklyVisits = data?.visits?.TotalResults ?? 0;

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gym-text">MindBody</h1>
          <p className="text-gym-muted text-sm mt-1">Live member & class data</p>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full font-medium ${
          error ? 'bg-red-500/10 text-red-400' :
          loading ? 'bg-yellow-500/10 text-yellow-400' :
          'bg-green-500/10 text-green-400'
        }`}>
          {error ? 'Disconnected' : loading ? 'Connecting…' : 'Live'}
        </span>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 mb-6">
          <p className="text-red-400 font-semibold mb-1">Connection Error</p>
          <p className="text-red-300 text-sm">{error}</p>
          {error.includes('MINDBODY_API_KEY') && (
            <p className="text-gym-muted text-sm mt-3">
              Add your API key to <code className="bg-gym-border px-1 rounded">.env.local</code> as{' '}
              <code className="bg-gym-border px-1 rounded">MINDBODY_API_KEY</code>, then redeploy.
            </p>
          )}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Total Members"
          value={loading ? '—' : totalClients.toLocaleString()}
          sub="Active clients"
        />
        <StatCard
          label="Today's Classes"
          value={loading ? '—' : todaysClasses.length}
          sub="Scheduled today"
        />
        <StatCard
          label="Visits This Week"
          value={loading ? '—' : weeklyVisits.toLocaleString()}
          sub="Last 7 days"
        />
      </div>

      {/* Today's classes */}
      <div className="bg-gym-surface border border-gym-border rounded-xl overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gym-border">
          <h2 className="text-gym-text font-semibold">Today&apos;s Classes</h2>
        </div>
        {loading ? (
          <div className="p-12 text-center text-gym-muted text-sm">Loading…</div>
        ) : todaysClasses.length === 0 ? (
          <div className="p-12 text-center text-gym-muted text-sm">No classes scheduled today</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gym-border">
                <th className="px-6 py-3 text-left text-gym-muted font-medium">Class</th>
                <th className="px-6 py-3 text-left text-gym-muted font-medium">Time</th>
                <th className="px-6 py-3 text-left text-gym-muted font-medium">Trainer</th>
                <th className="px-6 py-3 text-left text-gym-muted font-medium">Booked</th>
              </tr>
            </thead>
            <tbody>
              {todaysClasses.map((c) => {
                const time = new Date(c.StartDateTime).toLocaleTimeString('en-AU', {
                  hour: '2-digit', minute: '2-digit',
                });
                const pct = Math.round((c.TotalBooked / c.MaxCapacity) * 100);
                return (
                  <tr key={c.Id} className="border-b border-gym-border last:border-0 hover:bg-gym-border/20 transition-colors">
                    <td className="px-6 py-4 text-gym-text font-medium">{c.ClassDescription.Name}</td>
                    <td className="px-6 py-4 text-gym-muted">{time}</td>
                    <td className="px-6 py-4 text-gym-muted">{c.Staff.Name}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gym-border rounded-full h-1.5 w-20">
                          <div
                            className="bg-gym-accent h-1.5 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-gym-muted text-xs">{c.TotalBooked}/{c.MaxCapacity}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Setup notice if no API key */}
      {!loading && !error && (
        <p className="text-gym-muted text-xs text-center">
          Sandbox data from MindBody Site ID: -99 — swap in your production API key to see live gym data.
        </p>
      )}
    </div>
  );
}
