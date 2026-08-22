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
  creativesLoaded?: boolean;
  account: { id: string; name: string; currency: string };
  range: string;
  rangeLabel: string;
  updatedAt: string;
  error?: string;
  totals: {
    spend: number;
    leads: number;
    impressions: number;
    /** De-duplicated people. Null when Meta didn't answer — never a sum. */
    reach: number | null;
    clicks: number;
    ctr: number;
    cpc: number | null;
    cpl: number | null;
  };
  campaigns: Campaign[];
  ads: Ad[];
  daily: { date: string; spend: number; leads: number }[];
  platforms: { platform: string; spend: number; leads: number }[];
}

// ── Formatting ─────────────────────────────────────────────────────────────────
const aud = (n: number | null | undefined, dp = 2) =>
  n == null ? '—' : `$${n.toLocaleString('en-AU', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const num = (n: number | null | undefined) => (n == null ? '—' : Math.round(n).toLocaleString('en-AU'));
const pct = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(2)}%`);

// ── Deep links into Meta Ads Manager ──────────────────────────────────────────
// Ads Manager scopes by `act=<numeric account id>` and pre-selects rows via
// `selected_*_ids`. If Meta ever stops honouring the selection parameter the
// link still lands on the right account's ad table, so the failure mode is
// "one extra click", not a broken link.
const adsManagerUrl = (
  view: 'ads' | 'campaigns',
  accountId: string,
  selectedId: string,
) => {
  const param = view === 'ads' ? 'selected_ad_ids' : 'selected_campaign_ids';
  const act = accountId.replace(/^act_/, '');
  return `https://business.facebook.com/adsmanager/manage/${view}?act=${encodeURIComponent(act)}&${param}=${encodeURIComponent(selectedId)}`;
};

// ── Verdict engine — gym lead-gen benchmarks (AUD) ─────────────────────────────
// ⚠️ These thresholds are generic gym lead-gen numbers, NOT The Yard's own
// economics, and they drive the Scale/Kill advice on this page. If a member is
// worth well over these figures, "Kill" is being shown for ads that are in fact
// profitable. They should be Hassan's numbers, and ideally editable rather than
// compiled in.
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

const PLATFORM_LABEL: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  audience_network: 'Audience Network',
  messenger: 'Messenger',
  unknown: 'Other',
};

// Single-series line + area chart with a hover crosshair. One axis (value) —
// spend and leads are always rendered as two separate charts, never one
// dual-axis chart, since they're different units.
const LINE_COLORS = {
  rose: { stroke: '#e11d48', fill: 'rgba(225,29,72,0.08)' },
  emerald: { stroke: '#059669', fill: 'rgba(5,150,105,0.08)' },
} as const;

function LineChart({
  data,
  color,
  formatValue,
}: {
  data: { date: string; value: number }[];
  color: keyof typeof LINE_COLORS;
  formatValue: (n: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 600;
  const height = 160;
  const padding = { top: 12, right: 8, bottom: 22, left: 8 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const max = Math.max(1, ...data.map((d) => d.value));
  const xFor = (i: number) => padding.left + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const yFor = (v: number) => padding.top + innerH - (v / max) * innerH;
  const c = LINE_COLORS[color];

  if (data.length === 0) {
    return <div className="h-40 flex items-center justify-center text-gym-muted text-sm">No data.</div>;
  }

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(d.value)}`).join(' ');
  const areaPath = `${linePath} L ${xFor(data.length - 1)} ${padding.top + innerH} L ${xFor(0)} ${padding.top + innerH} Z`;
  const labelIdxs = data.length > 1 ? [0, Math.floor((data.length - 1) / 2), data.length - 1] : [0];
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    let nearest = 0;
    let nearestDist = Infinity;
    data.forEach((_, i) => {
      const dist = Math.abs(xFor(i) - relX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    setHover(nearest);
  }

  const hoveredPoint = hover != null ? data[hover] : null;

  return (
    <div className="relative overflow-visible">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-40 cursor-crosshair"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        <path d={areaPath} fill={c.fill} stroke="none" />
        <path d={linePath} fill="none" stroke={c.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {hover != null && (
          <>
            <line x1={xFor(hover)} x2={xFor(hover)} y1={padding.top} y2={padding.top + innerH} stroke="#e5e7eb" strokeWidth="1" />
            <circle cx={xFor(hover)} cy={yFor(data[hover].value)} r="4" fill={c.stroke} stroke="white" strokeWidth="1.5" />
          </>
        )}
        {labelIdxs.map((i) => (
          <text
            key={i}
            x={xFor(i)}
            y={height - 6}
            fontSize="9"
            textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
            fill="#9ca3af"
          >
            {fmtDate(data[i].date)}
          </text>
        ))}
      </svg>
      {hoveredPoint && (
        <div
          className="absolute bg-gym-text text-white text-xs rounded-lg px-2.5 py-1.5 pointer-events-none shadow-lg whitespace-nowrap z-10"
          style={{
            left: `${(xFor(hover!) / width) * 100}%`,
            top: `${(yFor(hoveredPoint.value) / height) * 100}%`,
            transform: 'translate(-50%, -130%)',
          }}
        >
          <p className="font-semibold">{formatValue(hoveredPoint.value)}</p>
          <p className="text-gray-300">{fmtDate(hoveredPoint.date)}</p>
        </div>
      )}
    </div>
  );
}

// Horizontal bar chart, single measure — value drives bar length, an
// optional sublabel (e.g. lead count) is direct-labeled rather than encoded
// as a second axis.
const BAR_COLORS = { rose: 'bg-rose-500', blue: 'bg-blue-500' } as const;

function BarChart({
  items,
  color,
  formatValue,
}: {
  items: { label: string; value: number; sublabel?: string }[];
  color: keyof typeof BAR_COLORS;
  formatValue: (n: number) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="flex items-center justify-between text-xs mb-1 gap-2">
            <span className="text-gym-text font-medium truncate">{item.label}</span>
            <span className="text-gym-text-secondary tabular-nums flex-none">
              {formatValue(item.value)}
              {item.sublabel ? ` · ${item.sublabel}` : ''}
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${BAR_COLORS[color]} rounded-full`}
              style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
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
function ClientPreview({
  ad,
  onClose,
  mock,
  creativesLoaded = true,
}: {
  ad: Ad;
  onClose: () => void;
  mock: boolean;
  creativesLoaded?: boolean;
}) {
  // Three different situations used to render as one message telling the user
  // to connect Meta — including when Meta was connected and working fine.
  const creativeMissingNote = mock
    ? '\u201cConnect Meta to load the real ad copy.\u201d \u2014 this is where the primary text the client reads will appear.'
    : creativesLoaded
      ? 'No primary text on this creative.'
      : 'Meta didn\u2019t return this ad\u2019s creative just now \u2014 the spend and lead figures above are unaffected. Reload to try again.';
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
              {c?.body || creativeMissingNote}
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

      {/* Performance over time */}
      {!loading && data && (
        <div className="mb-8">
          <h2 className="text-gym-text font-semibold mb-3">Performance over time</h2>
          {data.daily.length > 0 ? (
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-gym-surface border border-gym-border rounded-xl p-5">
                <p className="text-gym-muted text-[11px] uppercase tracking-wide mb-2">Daily spend</p>
                <LineChart
                  data={data.daily.map((d) => ({ date: d.date, value: d.spend }))}
                  color="rose"
                  formatValue={(n) => aud(n, 0)}
                />
              </div>
              <div className="bg-gym-surface border border-gym-border rounded-xl p-5">
                <p className="text-gym-muted text-[11px] uppercase tracking-wide mb-2">Daily leads</p>
                <LineChart
                  data={data.daily.map((d) => ({ date: d.date, value: d.leads }))}
                  color="emerald"
                  formatValue={(n) => num(n)}
                />
              </div>
            </div>
          ) : (
            <div className="bg-gym-surface border border-dashed border-gray-300 rounded-xl p-8 text-center text-gym-muted text-sm">
              Daily trend needs a live Meta connection — not available on the sample snapshot.
            </div>
          )}
        </div>
      )}

      {/* Spend breakdowns */}
      {!loading && data && (data.campaigns.length > 0 || data.tokenPending) && (
        <div className="mb-8 grid md:grid-cols-2 gap-4">
          <div className="bg-gym-surface border border-gym-border rounded-xl p-5">
            <h2 className="text-gym-text font-semibold mb-4">Spend by campaign</h2>
            <BarChart
              items={data.campaigns.map((c) => ({ label: c.name, value: c.spend, sublabel: `${c.leads} leads` }))}
              color="rose"
              formatValue={(n) => aud(n, 0)}
            />
          </div>
          <div className="bg-gym-surface border border-gym-border rounded-xl p-5">
            <h2 className="text-gym-text font-semibold mb-4">Facebook vs Instagram</h2>
            {data.platforms.length > 0 ? (
              <BarChart
                items={data.platforms.map((p) => ({
                  label: PLATFORM_LABEL[p.platform] ?? p.platform,
                  value: p.spend,
                  sublabel: `${p.leads} leads`,
                }))}
                color="blue"
                formatValue={(n) => aud(n, 0)}
              />
            ) : (
              <div className="py-8 text-center text-gym-muted text-sm">
                Platform split needs a live Meta connection.
              </div>
            )}
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
                        <a
                          href={adsManagerUrl('campaigns', data.account.id, c.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Open "${c.name}" in Meta Ads Manager`}
                          className="flex items-center gap-2 hover:underline"
                        >
                          <span className={`w-2 h-2 rounded-full flex-none ${c.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                          <span className="text-gym-text font-medium">{c.name}</span>
                        </a>
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
        <p className="text-gym-muted text-xs">Click any ad to open it in Meta Ads Manager · hover for Preview</p>
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
            // The card is a plain container: the whole-tile link and the Preview
            // button are SIBLINGS, because a <button> nested inside an <a> is
            // invalid HTML and browsers handle it inconsistently.
            <div
              key={ad.id}
              className="group relative bg-gym-surface border border-gym-border rounded-xl overflow-hidden hover:shadow-lg hover:border-gym-accent/40 transition-all"
            >
              <a
                href={adsManagerUrl('ads', data?.account.id ?? '', ad.id)}
                target="_blank"
                rel="noopener noreferrer"
                title={`Open "${ad.name}" in Meta Ads Manager`}
                className="absolute inset-0 z-0"
              >
                <span className="sr-only">Open {ad.name} in Meta Ads Manager</span>
              </a>

              <div className="aspect-[4/3] bg-gray-100 relative pointer-events-none">
                <Thumb ad={ad} small />
                <span className={`absolute top-2 left-2 text-[11px] px-2 py-0.5 rounded-full font-semibold border ${v.cls}`}>{v.label}</span>
                <span className={`absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded font-semibold ${STATUS_CLS[ad.status] ?? 'bg-gray-100 text-gray-500'}`}>{statusLabel(ad.status)}</span>
                <span className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">{ad.format === 'video' ? '▶ Video' : '▦ Image'}</span>
              </div>

              {/* Above the link surface so it wins the click. */}
              <button
                type="button"
                onClick={() => setOpenAd(ad)}
                className="absolute top-2 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-100 focus:opacity-100 bg-white/95 text-gym-text text-[11px] font-semibold px-2.5 py-1 rounded-full border border-gym-border shadow-sm transition-opacity"
              >
                Preview
              </button>

              <div className="p-3 pointer-events-none">
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
            </div>
          ))}
        </div>
      )}

      {openAd && (
        <ClientPreview
          ad={openAd}
          mock={data?.tokenPending ?? false}
          creativesLoaded={data?.creativesLoaded ?? true}
          onClose={() => setOpenAd(null)}
        />
      )}
    </div>
  );
}
