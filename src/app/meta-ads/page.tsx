'use client';

import { useEffect, useMemo, useState } from 'react';

// ── Types (mirror /api/meta-ads) ───────────────────────────────────────────────
type AdResultType = 'pixel_lead' | 'instant_form' | 'link_click' | 'none';

interface Creative {
  body: string | null;
  title: string | null;
  cta: string | null;
  linkUrl: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  previewUrl: string | null;
}

interface Ad {
  id: string;
  name: string;
  campaignId: string;
  campaignName: string;
  status: string;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  ctr: number;
  cpc: number | null;
  cpm: number;
  leads: number;
  cpl: number | null;
  resultType: AdResultType;
  format: 'video' | 'image';
  creative: Creative | null;
}

interface Campaign {
  id: string;
  name: string;
  objective: string;
  status: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number | null;
  cpm: number;
  leads: number;
  cpl: number | null;
}

interface MetaAdsData {
  mock: boolean;
  tokenPending: boolean;
  account: { id: string; name: string; currency: string };
  range: string;
  rangeLabel: string;
  updatedAt: string;
  error?: string;
  totals: {
    spend: number;
    leads: number;
    impressions: number;
    reach: number;
    clicks: number;
    ctr: number;
    cpc: number | null;
    cpl: number | null;
  };
  campaigns: Campaign[];
  ads: Ad[];
}

// ── Formatting ─────────────────────────────────────────────────────────────────
const aud = (n: number | null | undefined, dp = 2) =>
  n == null ? '—' : `$${n.toLocaleString('en-AU', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const num = (n: number | null | undefined) => (n == null ? '—' : Math.round(n).toLocaleString('en-AU'));
const pct = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(2)}%`);

// ── Verdict engine — gym lead-gen benchmarks (AUD) ─────────────────────────────
type VerdictKey = 'scale' | 'keep' | 'watch' | 'kill' | 'learning';
interface Verdict {
  key: VerdictKey;
  label: string;
  cls: string; // chip classes
  advice: string;
}

function verdict(ad: Ad): Verdict {
  const { leads, cpl, spend, ctr } = ad;
  const ctrNote =
    ctr >= 3 ? 'Scroll-stopping creative (CTR is strong).' : ctr < 1.5 ? 'Weak hook — low CTR means the creative is being scrolled past.' : 'CTR is around average.';

  if (spend < 10 && leads === 0) {
    return { key: 'learning', label: 'Learning', cls: 'bg-gray-100 text-gray-600 border-gray-200', advice: `Too little spend to judge yet (${aud(spend)}). Let it run before deciding. ${ctrNote}` };
  }
  if (leads > 0 && cpl != null) {
    if (cpl <= 25) return { key: 'scale', label: 'Scale', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', advice: `Winner — ${leads} lead${leads > 1 ? 's' : ''} at ${aud(cpl)} each, well below target. Pour more budget here and make more like it. ${ctrNote}` };
    if (cpl <= 45) return { key: 'keep', label: 'Keep', cls: 'bg-blue-50 text-blue-700 border-blue-200', advice: `Solid — ${leads} lead${leads > 1 ? 's' : ''} at ${aud(cpl)}. Profitable; keep running and watch it. ${ctrNote}` };
    if (cpl <= 70) return { key: 'watch', label: 'Watch', cls: 'bg-amber-50 text-amber-700 border-amber-200', advice: `Borderline — ${aud(cpl)}/lead is above target. Give it a few more days; if it doesn't improve, refresh the creative. ${ctrNote}` };
    return { key: 'kill', label: 'Kill', cls: 'bg-rose-50 text-rose-700 border-rose-200', advice: `Too expensive — ${aud(cpl)}/lead. Turn it off and shift the budget to a winner. ${ctrNote}` };
  }
  // No leads recorded
  if (spend >= 40) return { key: 'kill', label: 'Kill', cls: 'bg-rose-50 text-rose-700 border-rose-200', advice: `${aud(spend)} spent with 0 leads. Kill it. ${ctrNote}` };
  return { key: 'watch', label: 'Watch', cls: 'bg-amber-50 text-amber-700 border-amber-200', advice: `${aud(spend)} spent, no leads yet. On a short leash — kill it if it crosses ~$40 with nothing. ${ctrNote}` };
}

const VERDICT_ORDER: Record<VerdictKey, number> = { scale: 0, keep: 1, watch: 2, kill: 3, learning: 4 };

const STATUS_CLS: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  PAUSED: 'bg-gray-100 text-gray-500',
  CAMPAIGN_PAUSED: 'bg-gray-100 text-gray-500',
};

function statusLabel(s: string) {
  if (s === 'ACTIVE') return 'Active';
  if (s === 'CAMPAIGN_PAUSED') return 'Campaign off';
  if (s === 'PAUSED') return 'Paused';
  return s;
}

// Deterministic gradient for creatives we can't show an image for yet.
const GRADIENTS = [
  'from-rose-400 to-orange-300',
  'from-indigo-400 to-sky-300',
  'from-emerald-400 to-teal-300',
  'from-fuchsia-400 to-pink-300',
  'from-amber-400 to-yellow-300',
  'from-violet-400 to-purple-300',
];
function gradientFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

const RESULT_LABEL: Record<AdResultType, string> = {
  pixel_lead: 'Website lead',
  instant_form: 'Instant form',
  link_click: 'Link click',
  none: 'No result',
};

// ── Small components ───────────────────────────────────────────────────────────
function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gym-surface border border-gym-border rounded-xl p-5">
      <p className="text-gym-muted text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className="text-gym-text text-3xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-gym-muted text-xs mt-1">{sub}</p>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-gym-muted text-[11px] uppercase tracking-wide">{label}</p>
      <p className="text-gym-text text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

// Facebook/Instagram-style creative thumbnail
function Thumb({ ad, small }: { ad: Ad; small?: boolean }) {
  const img = ad.creative?.imageUrl || ad.creative?.thumbnailUrl;
  if (img) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={img} alt={ad.name} className="w-full h-full object-cover" />
    );
  }
  return (
    <div className={`w-full h-full bg-gradient-to-br ${gradientFor(ad.id)} flex items-center justify-center relative`}>
      {ad.format === 'video' && (
        <div className={`${small ? 'w-8 h-8' : 'w-12 h-12'} rounded-full bg-white/85 flex items-center justify-center shadow`}>
          <span className="text-gym-text ml-0.5" style={{ fontSize: small ? 14 : 20 }}>▶</span>
        </div>
      )}
      {ad.format === 'image' && !small && (
        <span className="text-white/90 font-bold text-sm px-3 text-center drop-shadow">{ad.name.replace(/^Static \| /, '')}</span>
      )}
    </div>
  );
}

// ── Client-view modal (the ad as a customer sees it) ───────────────────────────
function ClientPreview({ ad, onClose, mock }: { ad: Ad; onClose: () => void; mock: boolean }) {
  const v = verdict(ad);
  const c = ad.creative;
  const link = c?.linkUrl ?? null;
  const domain = link ? (() => { try { return new URL(link).hostname.replace('www.', ''); } catch { return link; } })() : null;
  const cta = c?.cta ?? (ad.resultType === 'instant_form' ? 'Sign Up' : 'Learn More');

  return (
    <div className="fixed inset-0 z-[60] flex items-start md:items-center justify-center bg-black/50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-gym-surface w-full max-w-4xl rounded-2xl shadow-2xl my-4 grid md:grid-cols-2 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Left — the ad as a client sees it */}
        <div className="bg-gray-50 p-6 border-b md:border-b-0 md:border-r border-gym-border">
          <p className="text-gym-muted text-xs uppercase tracking-wider mb-3">Client view · Facebook / Instagram feed</p>
          <div className="bg-white rounded-xl border border-gym-border shadow-sm max-w-sm mx-auto overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2.5 p-3">
              <div className="w-9 h-9 rounded-full bg-gym-accent flex items-center justify-center text-white font-bold flex-shrink-0">Y</div>
              <div className="min-w-0">
                <p className="text-gym-text text-sm font-semibold leading-tight">The Yard Gym</p>
                <p className="text-gym-muted text-[11px] leading-tight">Sponsored · Edensor Park</p>
              </div>
              <span className="ml-auto text-gym-muted">···</span>
            </div>
            {/* Primary text */}
            <p className="px-3 pb-2.5 text-gym-text text-sm whitespace-pre-line">
              {c?.body || (mock ? '“Connect Meta to load the real ad copy.” — this is where the primary text the client reads will appear.' : 'No primary text on this creative.')}
            </p>
            {/* Media */}
            <div className="aspect-square bg-gray-100">
              <Thumb ad={ad} />
            </div>
            {/* Link card / CTA */}
            <div className="flex items-center gap-3 p-3 bg-gray-50 border-t border-gym-border">
              <div className="min-w-0 flex-1">
                {domain && <p className="text-gym-muted text-[11px] uppercase tracking-wide truncate">{domain}</p>}
                <p className="text-gym-text text-sm font-semibold truncate">
                  {c?.title || (ad.resultType === 'instant_form' ? 'Claim your free trial' : 'The Yard Gym Edensor Park')}
                </p>
              </div>
              {link ? (
                <a href={link} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 bg-gym-accent hover:bg-gym-accent-hover text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors">
                  {cta}
                </a>
              ) : (
                <span className="flex-shrink-0 bg-gray-200 text-gray-500 text-xs font-semibold px-3.5 py-2 rounded-lg" title={mock ? 'Connect Meta to enable the live link' : 'On-Facebook instant form — opens inside Facebook'}>
                  {cta}
                </span>
              )}
            </div>
          </div>
          {link ? (
            <a href={link} target="_blank" rel="noopener noreferrer" className="mt-4 block text-center text-gym-accent text-sm font-semibold hover:underline">
              Open the landing page the client lands on ↗
            </a>
          ) : (
            <p className="mt-4 text-center text-gym-muted text-xs">
              {ad.resultType === 'instant_form'
                ? 'This ad uses an Instant Form that opens inside Facebook — there is no external landing page.'
                : mock
                ? 'Live landing-page link loads once Meta is connected.'
                : 'No click-through link on this creative.'}
            </p>
          )}
        </div>

        {/* Right — performance + the read */}
        <div className="p-6">
          <div className="flex items-start justify-between gap-3 mb-1">
            <div>
              <h3 className="text-gym-text font-bold text-lg leading-tight">{ad.name}</h3>
              <p className="text-gym-muted text-xs mt-0.5">{ad.campaignName}</p>
            </div>
            <button onClick={onClose} className="text-gym-muted hover:text-gym-text text-xl leading-none -mt-1">✕</button>
          </div>
          <div className="flex items-center gap-2 mb-4">
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${STATUS_CLS[ad.status] ?? 'bg-gray-100 text-gray-500'}`}>{statusLabel(ad.status)}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold border ${v.cls}`}>{v.label}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">{RESULT_LABEL[ad.resultType]}</span>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-5">
            <Metric label="Spend" value={aud(ad.spend)} />
            <Metric label="Leads" value={num(ad.leads)} />
            <Metric label="Cost / lead" value={ad.cpl == null ? '—' : aud(ad.cpl)} />
            <Metric label="Reach" value={num(ad.reach)} />
            <Metric label="Impressions" value={num(ad.impressions)} />
            <Metric label="Frequency" value={ad.frequency.toFixed(2)} />
            <Metric label="Clicks" value={num(ad.clicks)} />
            <Metric label="CTR" value={pct(ad.ctr)} />
            <Metric label="CPC" value={ad.cpc == null ? '—' : aud(ad.cpc)} />
          </div>

          <div className="bg-gray-50 border border-gym-border rounded-xl p-4">
            <p className="text-gym-muted text-xs uppercase tracking-wider mb-1">The read</p>
            <p className="text-gym-text text-sm leading-relaxed">{v.advice}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
const RANGES = [
  { key: 'last_7d', label: '7d' },
  { key: 'last_30d', label: '30d' },
  { key: 'last_90d', label: '90d' },
];

export default function MetaAdsPage() {
  const [range, setRange] = useState('last_30d');
  const [data, setData] = useState<MetaAdsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [openAd, setOpenAd] = useState<Ad | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/meta-ads?range=${range}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [range]);

  const adsRanked = useMemo(() => {
    if (!data) return [];
    return [...data.ads]
      .map((ad) => ({ ad, v: verdict(ad) }))
      .sort((a, b) => VERDICT_ORDER[a.v.key] - VERDICT_ORDER[b.v.key] || b.ad.spend - a.ad.spend);
  }, [data]);

  const winners = adsRanked.filter((x) => x.v.key === 'scale').map((x) => x.ad);
  const losers = adsRanked.filter((x) => x.v.key === 'kill').map((x) => x.ad);
  const spendNoLead = data ? data.ads.filter((a) => a.leads === 0 && a.spend >= 40) : [];
  const wastedSpend = spendNoLead.reduce((s, a) => s + a.spend, 0);

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gym-text">Meta Ads</h1>
          <p className="text-gym-muted text-sm mt-1">
            {data?.account.name ?? 'The Yard Gym'} · Facebook &amp; Instagram · {data?.rangeLabel ?? '…'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-gym-surface border border-gym-border rounded-lg p-0.5">
            {RANGES.map((r) => {
              // Snapshot is a fixed 30-day capture — only 30d is meaningful until live.
              const locked = (data?.tokenPending ?? false) && r.key !== 'last_30d';
              return (
                <button
                  key={r.key}
                  onClick={() => !locked && setRange(r.key)}
                  disabled={locked}
                  title={locked ? 'Connect Meta to unlock other date ranges' : undefined}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${range === r.key ? 'bg-gym-accent text-white' : locked ? 'text-gym-muted/50 cursor-not-allowed' : 'text-gym-text-secondary hover:text-gym-text'}`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
          <span className={`text-xs px-3 py-1 rounded-full font-medium ${loading ? 'bg-yellow-500/10 text-yellow-600' : data?.tokenPending ? 'bg-blue-500/10 text-blue-600' : 'bg-green-500/10 text-green-600'}`}>
            {loading ? 'Loading…' : data?.tokenPending ? 'Sample Data' : 'Live'}
          </span>
        </div>
      </div>

      {/* Token notice */}
      {data?.tokenPending && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-6 flex items-start gap-3">
          <span className="text-blue-600">ℹ️</span>
          <div>
            <p className="text-blue-700 font-semibold text-sm">Showing your real numbers — connect Meta to go fully live</p>
            <p className="text-gym-text-secondary text-xs mt-0.5 leading-relaxed">
              Every figure below is your actual account data. Add <code className="bg-blue-500/10 px-1 rounded">META_ACCESS_TOKEN</code> to your environment to pull live updates plus the real ad images, copy and click-through links inside each preview.
            </p>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard label="Spend" value={loading ? '—' : aud(data?.totals.spend ?? 0, 0)} sub={`${data?.ads.length ?? 0} ads with delivery`} />
        <StatCard label="Leads" value={loading ? '—' : num(data?.totals.leads)} sub={`across ${data?.campaigns.length ?? 0} campaigns`} />
        <StatCard label="Cost / Lead" value={loading ? '—' : aud(data?.totals.cpl ?? null)} sub="blended average" />
        <StatCard label="Reach" value={loading ? '—' : num(data?.totals.reach)} sub={`${num(data?.totals.impressions)} impressions`} />
      </div>

      {/* Coach's read */}
      {!loading && data && (
        <div className="bg-gym-surface border border-gym-border rounded-xl p-5 mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🎯</span>
            <h2 className="text-gym-text font-semibold">The read on your ads</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4">
              <p className="text-emerald-700 font-semibold mb-1">✅ Scale these</p>
              {winners.length ? (
                <ul className="text-gym-text-secondary space-y-1">
                  {winners.slice(0, 4).map((a) => (
                    <li key={a.id}><span className="font-medium text-gym-text">{a.name}</span> — {a.leads} leads @ {aud(a.cpl)}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-gym-muted">No clear sub-$25/lead winners in this window.</p>
              )}
            </div>
            <div className="bg-rose-50 border border-rose-100 rounded-lg p-4">
              <p className="text-rose-700 font-semibold mb-1">🛑 Kill these</p>
              {losers.length ? (
                <ul className="text-gym-text-secondary space-y-1">
                  {losers.slice(0, 4).map((a) => (
                    <li key={a.id}><span className="font-medium text-gym-text">{a.name}</span> — {a.cpl != null ? `${aud(a.cpl)}/lead` : `${aud(a.spend)}, 0 leads`}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-gym-muted">Nothing bleeding badly right now.</p>
              )}
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-4">
              <p className="text-amber-700 font-semibold mb-1">💡 Where the money's going</p>
              <p className="text-gym-text-secondary leading-relaxed">
                {wastedSpend > 0
                  ? `${aud(wastedSpend, 0)} went to ${spendNoLead.length} ad${spendNoLead.length > 1 ? 's' : ''} that spent $40+ with zero leads. That's the first budget to reclaim.`
                  : 'No major spend leaking into zero-lead ads. Tighten by shifting budget from "Watch" ads into the winners.'}
                {data.totals.cpl != null && ` Your blended cost per lead is ${aud(data.totals.cpl)}.`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Campaign rollup */}
      {!loading && data && data.campaigns.length > 0 && (
        <div className="mb-8">
          <h2 className="text-gym-text font-semibold mb-3">Campaigns</h2>
          <div className="bg-gym-surface border border-gym-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gym-muted text-[11px] uppercase tracking-wide border-b border-gym-border">
                    <th className="text-left font-medium px-4 py-2.5">Campaign</th>
                    <th className="text-right font-medium px-4 py-2.5">Spend</th>
                    <th className="text-right font-medium px-4 py-2.5">Leads</th>
                    <th className="text-right font-medium px-4 py-2.5">Cost/Lead</th>
                    <th className="text-right font-medium px-4 py-2.5">CTR</th>
                    <th className="text-right font-medium px-4 py-2.5">Reach</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gym-border">
                  {data.campaigns.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${c.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                          <span className="text-gym-text font-medium">{c.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gym-text">{aud(c.spend)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gym-text">{c.leads}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-gym-text">{aud(c.cpl)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gym-text-secondary">{pct(c.ctr)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gym-text-secondary">{num(c.reach)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Ad grid */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-gym-text font-semibold">Ads — ranked by verdict</h2>
        <p className="text-gym-muted text-xs">Click any ad to view it as a client &amp; read its verdict</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-gym-surface border border-gym-border rounded-xl h-72 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {adsRanked.map(({ ad, v }) => (
            <button
              key={ad.id}
              onClick={() => setOpenAd(ad)}
              className="group bg-gym-surface border border-gym-border rounded-xl overflow-hidden text-left hover:shadow-lg hover:border-gym-accent/40 transition-all"
            >
              <div className="aspect-[4/3] bg-gray-100 relative">
                <Thumb ad={ad} small />
                <span className={`absolute top-2 left-2 text-[11px] px-2 py-0.5 rounded-full font-semibold border ${v.cls}`}>{v.label}</span>
                <span className={`absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded font-semibold ${STATUS_CLS[ad.status] ?? 'bg-gray-100 text-gray-500'}`}>{statusLabel(ad.status)}</span>
                <span className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">{ad.format === 'video' ? '▶ Video' : '▦ Image'}</span>
              </div>
              <div className="p-3">
                <p className="text-gym-text text-sm font-semibold truncate">{ad.name}</p>
                <p className="text-gym-muted text-[11px] truncate mb-2">{ad.campaignName}</p>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-gym-muted text-[10px] uppercase tracking-wide">Cost/lead</p>
                    <p className="text-gym-text text-base font-bold tabular-nums">{ad.cpl == null ? '—' : aud(ad.cpl)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-gym-muted text-[10px] uppercase tracking-wide">Leads · Spend</p>
                    <p className="text-gym-text-secondary text-xs tabular-nums">{ad.leads} · {aud(ad.spend, 0)}</p>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {openAd && <ClientPreview ad={openAd} mock={data?.tokenPending ?? false} onClose={() => setOpenAd(null)} />}
    </div>
  );
}
