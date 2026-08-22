import { NextResponse } from 'next/server';
import {
  buildSnapshot,
  type MetaAd,
  type MetaAdsData,
  type MetaCampaign,
  type AdResultType,
  type DailyPoint,
  type PlatformBreakdown,
} from './snapshot';

// ── Config ───────────────────────────────────────────────────────────────────
const GRAPH = 'https://graph.facebook.com/v21.0';
const TOKEN = process.env.META_ACCESS_TOKEN ?? '';
const ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID ?? '741182451528211';
const ACCOUNT_NAME = process.env.META_AD_ACCOUNT_NAME ?? 'The Yard Gym Edensor Park';

const VALID_RANGES = new Set(['last_7d', 'last_30d', 'last_90d']);
const RANGE_LABELS: Record<string, string> = {
  last_7d: 'Last 7 days',
  last_30d: 'Last 30 days',
  last_90d: 'Last 90 days',
};

const CACHE_TTL = 5 * 60 * 1000;
const cache = new Map<string, { data: MetaAdsData; ts: number }>();

// ── Graph helpers ─────────────────────────────────────────────────────────────
async function graph<T = unknown>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH}/${path}`);
  url.searchParams.set('access_token', TOKEN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { cache: 'no-store' });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || `Graph error ${res.status} on ${path}`);
  }
  return json as T;
}

// How many days each window covers — used to size requests to the window
// instead of always asking for the largest one.
const RANGE_DAYS: Record<string, number> = { last_7d: 7, last_30d: 30, last_90d: 90 };

// Graph caps a multi-object `?ids=` read at 50.
const IDS_PER_CALL = 50;

// Runaway guard on pagination, not a real ceiling: 10 x 500 rows is far more
// ads than this account will run in a 90-day window.
const MAX_PAGES = 10;

// Keep this list LIGHT. Commit a6c1839 fixed a "Please reduce the amount of data
// you're asking for" error caused by requesting object_story_spec and
// asset_feed_spec across many ads — do not reintroduce them here.
const AD_FIELDS =
  'id,name,effective_status,creative{id,body,title,image_url,thumbnail_url,object_type,video_id,link_url,call_to_action_type}';

type AdRow = { id: string; name: string; effective_status: string; creative?: GraphCreative };

// Follow paging.next to exhaustion. Without this an account with more ad rows
// than one page silently reports partial spend — the page looks fine and the
// numbers are just quietly wrong.
async function graphPaged<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const first = await graph<{ data: T[]; paging?: { next?: string } }>(path, params);
  const out: T[] = [...(first.data ?? [])];
  let next = first.paging?.next;
  for (let i = 1; i < MAX_PAGES && next; i++) {
    const res = await fetch(next, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok || json.error) {
      throw new Error(json.error?.message || `Graph paging error ${res.status}`);
    }
    out.push(...(json.data ?? []));
    next = json.paging?.next;
  }
  return out;
}

// Ad entities (status + creative) for EXACTLY the ads that delivered in this
// window.
//
// This was `act_<id>/ads?limit=100` with NO date filter — the whole account
// history, oldest first. As the account grew, the ads actually on screen fell
// outside those arbitrary 100, so the lookup missed and they rendered with
// status UNKNOWN and no creative, which made the preview tell you to connect
// Meta on an account that was already connected.
//
// Now the request volume scales with ads on screen rather than account age.
async function fetchAdEntities(
  adIds: string[],
): Promise<{ byId: Map<string, AdRow>; complete: boolean }> {
  const byId = new Map<string, AdRow>();
  if (adIds.length === 0) return { byId, complete: true };

  const chunks: string[][] = [];
  for (let i = 0; i < adIds.length; i += IDS_PER_CALL) {
    chunks.push(adIds.slice(i, i + IDS_PER_CALL));
  }

  // Fail soft PER CHUNK — creatives are decoration, spend and leads are the
  // point, so one bad chunk costs a few thumbnails rather than the whole page.
  const results = await Promise.all(
    chunks.map((chunk) =>
      graph<Record<string, AdRow>>('', { ids: chunk.join(','), fields: AD_FIELDS })
        .then((res) => ({ ok: true as const, res }))
        .catch((err) => {
          console.error('Meta Ads creative chunk failed (numbers unaffected):', err);
          return { ok: false as const, res: {} as Record<string, AdRow> };
        }),
    ),
  );

  let complete = true;
  for (const r of results) {
    if (!r.ok) {
      complete = false;
      continue;
    }
    for (const [id, row] of Object.entries(r.res)) {
      if (row && typeof row === 'object' && row.id) byId.set(id, row);
    }
  }
  return { byId, complete };
}

type InsightTotals = {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  leads: number;
};

type TotalsRow = {
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  actions?: Array<{ action_type: string; value: string }>;
};

// Account-level totals for the window.
//
// Needed because REACH CANNOT BE SUMMED. Reach counts de-duplicated PEOPLE, so
// adding per-ad reach counts anyone who saw three of your ads three times — the
// Reach figure on this page has been inflated for exactly that reason. Meta
// de-duplicates properly when asked at account level.
async function fetchAccountTotals(act: string, range: string): Promise<InsightTotals | null> {
  const rows = await graph<{ data: TotalsRow[] }>(`${act}/insights`, {
    level: 'account',
    date_preset: range,
    limit: '1',
    fields: 'spend,impressions,reach,clicks,actions',
  });
  const r = rows.data?.[0];
  if (!r) return null;
  return {
    spend: Number(r.spend || 0),
    impressions: Number(r.impressions || 0),
    reach: Number(r.reach || 0),
    clicks: Number(r.clicks || 0),
    leads: sumLeads(r.actions),
  };
}

// Per-campaign figures straight from Meta, for the same de-duplication reason as
// above — rolling reach up from the ad rows overstates every campaign row.
async function fetchCampaignTotals(
  act: string,
  range: string,
): Promise<Map<string, InsightTotals>> {
  type Row = TotalsRow & { campaign_id?: string };
  const rows = await graphPaged<Row>(`${act}/insights`, {
    level: 'campaign',
    date_preset: range,
    limit: '200',
    fields: 'campaign_id,spend,impressions,reach,clicks,actions',
  });
  const out = new Map<string, InsightTotals>();
  for (const r of rows) {
    if (!r.campaign_id) continue;
    out.set(r.campaign_id, {
      spend: Number(r.spend || 0),
      impressions: Number(r.impressions || 0),
      reach: Number(r.reach || 0),
      clicks: Number(r.clicks || 0),
      leads: sumLeads(r.actions),
    });
  }
  return out;
}

const LEAD_ACTION_TYPES = new Set([
  'offsite_conversion.fb_pixel_lead',
  'leadgen.other',
  'lead',
  'onsite_web_lead',
]);

function sumLeads(actions: Array<{ action_type: string; value: string }> | undefined): number {
  if (!actions) return 0;
  const pick = (t: string) =>
    actions.filter((a) => a.action_type === t).reduce((s, a) => s + Number(a.value || 0), 0);

  // These three are DISTINCT lead sources and one ad can produce more than one
  // (a website pixel lead and an on-Facebook instant form, say). This used to be
  // a `||` chain, which reported whichever was found first and silently dropped
  // the rest — undercounting leads, which in turn inflates cost-per-lead and can
  // flip an ad's verdict from Keep to Kill.
  const specific =
    pick('offsite_conversion.fb_pixel_lead') + pick('leadgen.other') + pick('onsite_web_lead');

  // `lead` is Meta's roll-up ACROSS those counters, not a fourth source. It is a
  // fallback and never an addend — adding it would double-count every lead.
  return specific > 0 ? specific : pick('lead');
}

function resultTypeFromActions(
  actions: Array<{ action_type: string; value: string }> | undefined,
): AdResultType {
  if (!actions) return 'none';
  if (actions.some((a) => a.action_type === 'offsite_conversion.fb_pixel_lead')) return 'pixel_lead';
  if (actions.some((a) => a.action_type === 'leadgen.other')) return 'instant_form';
  if (actions.some((a) => a.action_type === 'link_click')) return 'link_click';
  return 'none';
}

type GraphCreative = {
  id?: string;
  body?: string;
  title?: string;
  image_url?: string;
  thumbnail_url?: string;
  object_type?: string;
  video_id?: string;
  link_url?: string;
  call_to_action_type?: string;
  object_story_spec?: {
    link_data?: {
      message?: string;
      name?: string;
      link?: string;
      picture?: string;
      call_to_action?: { type?: string; value?: { link?: string } };
    };
    video_data?: {
      message?: string;
      title?: string;
      image_url?: string;
      call_to_action?: { type?: string; value?: { link?: string } };
    };
  };
  asset_feed_spec?: {
    bodies?: Array<{ text?: string }>;
    titles?: Array<{ text?: string }>;
    link_urls?: Array<{ website_url?: string }>;
    call_to_action_types?: string[];
  };
};

function prettyCta(type: string | undefined): string | null {
  if (!type) return null;
  return type
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

function extractCreative(c: GraphCreative | undefined): MetaAd['creative'] {
  if (!c) return null;
  const ld = c.object_story_spec?.link_data;
  const vd = c.object_story_spec?.video_data;
  const afs = c.asset_feed_spec;

  const body = c.body || ld?.message || vd?.message || afs?.bodies?.[0]?.text || null;
  const title = c.title || ld?.name || vd?.title || afs?.titles?.[0]?.text || null;
  const linkUrl =
    ld?.call_to_action?.value?.link ||
    vd?.call_to_action?.value?.link ||
    ld?.link ||
    c.link_url ||
    afs?.link_urls?.[0]?.website_url ||
    null;
  const ctaType =
    c.call_to_action_type ||
    ld?.call_to_action?.type ||
    vd?.call_to_action?.type ||
    afs?.call_to_action_types?.[0];
  const imageUrl = c.image_url || vd?.image_url || ld?.picture || null;
  const thumbnailUrl = c.thumbnail_url || vd?.image_url || ld?.picture || null;

  return {
    body,
    title,
    cta: prettyCta(ctaType),
    linkUrl,
    imageUrl,
    thumbnailUrl,
    previewUrl: null,
  };
}

// Day-by-day spend/leads trend, for the performance-over-time chart.
async function fetchDaily(act: string, range: string): Promise<DailyPoint[]> {
  type DailyRow = {
    date_start: string;
    spend?: string;
    impressions?: string;
    clicks?: string;
    actions?: Array<{ action_type: string; value: string }>;
  };
  // One row per day, so the window's length IS the row count. Hardcoding 90 made
  // a 7-day view ask for 90 rows, and left no headroom at all on the 90-day one.
  const res = await graph<{ data: DailyRow[] }>(`${act}/insights`, {
    level: 'account',
    date_preset: range,
    time_increment: '1',
    limit: String((RANGE_DAYS[range] ?? 30) + 5),
    fields: 'spend,impressions,clicks,actions',
  });
  return res.data
    .map((row) => ({
      date: row.date_start,
      spend: Number(row.spend || 0),
      leads: sumLeads(row.actions),
      impressions: Number(row.impressions || 0),
      clicks: Number(row.clicks || 0),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Facebook vs Instagram (vs Audience Network / Messenger) split.
async function fetchPlatforms(act: string, range: string): Promise<PlatformBreakdown[]> {
  type PlatformRow = {
    publisher_platform?: string;
    spend?: string;
    impressions?: string;
    clicks?: string;
    actions?: Array<{ action_type: string; value: string }>;
  };
  const res = await graph<{ data: PlatformRow[] }>(`${act}/insights`, {
    level: 'account',
    date_preset: range,
    breakdowns: 'publisher_platform',
    limit: '20',
    fields: 'spend,impressions,clicks,actions',
  });
  return res.data
    .map((row) => ({
      platform: row.publisher_platform || 'unknown',
      spend: Number(row.spend || 0),
      leads: sumLeads(row.actions),
      impressions: Number(row.impressions || 0),
      clicks: Number(row.clicks || 0),
    }))
    .sort((a, b) => b.spend - a.spend);
}

// ── Live fetch ────────────────────────────────────────────────────────────────
async function fetchLive(range: string): Promise<MetaAdsData> {
  const act = `act_${ACCOUNT_ID}`;

  // 1) Ad-level insights for the window.
  type InsightRow = {
    ad_id: string;
    ad_name: string;
    campaign_id: string;
    campaign_name: string;
    spend?: string;
    impressions?: string;
    reach?: string;
    frequency?: string;
    clicks?: string;
    ctr?: string;
    cpc?: string;
    cpm?: string;
    actions?: Array<{ action_type: string; value: string }>;
  };
  const [insightRows, daily, platforms, accountTotals, campaignTotals] = await Promise.all([
    // Paged — the old flat `limit: 500` silently truncated past 500 ad rows,
    // which understates spend without any visible sign that it happened.
    graphPaged<InsightRow>(`${act}/insights`, {
      level: 'ad',
      date_preset: range,
      limit: '500',
      fields:
        'ad_id,ad_name,campaign_id,campaign_name,spend,impressions,reach,frequency,clicks,ctr,cpc,cpm,actions',
    }),
    // Chart data is supplementary — fail soft so a breakdown hiccup never
    // takes down the core numbers/ads above.
    fetchDaily(act, range).catch((err) => {
      console.error('Meta Ads daily trend fetch failed:', err);
      return [] as DailyPoint[];
    }),
    fetchPlatforms(act, range).catch((err) => {
      console.error('Meta Ads platform breakdown fetch failed:', err);
      return [] as PlatformBreakdown[];
    }),
    fetchAccountTotals(act, range).catch((err) => {
      console.error('Meta Ads account totals fetch failed:', err);
      return null;
    }),
    fetchCampaignTotals(act, range).catch((err) => {
      console.error('Meta Ads campaign totals fetch failed:', err);
      return new Map<string, InsightTotals>();
    }),
  ]);

  // Ad entities come AFTER the insights, because the whole point is to ask for
  // only the ads those insights name.
  const { byId: adMeta, complete: creativesLoaded } = await fetchAdEntities(
    [...new Set(insightRows.map((r) => r.ad_id))],
  );

  const ads: MetaAd[] = insightRows
    .map((row): MetaAd => {
      const meta = adMeta.get(row.ad_id);
      const spend = Number(row.spend || 0);
      const leads = sumLeads(row.actions);
      const impressions = Number(row.impressions || 0);
      const clicks = Number(row.clicks || 0);
      const creative = extractCreative(meta?.creative);
      return {
        id: row.ad_id,
        name: row.ad_name,
        campaignId: row.campaign_id,
        campaignName: row.campaign_name,
        status: meta?.effective_status ?? 'UNKNOWN',
        spend,
        impressions,
        reach: Number(row.reach || 0),
        frequency: Number(row.frequency || 0),
        clicks,
        ctr: Number(row.ctr || 0),
        cpc: row.cpc ? Number(row.cpc) : null,
        cpm: Number(row.cpm || 0),
        leads,
        cpl: leads ? spend / leads : null,
        resultType: resultTypeFromActions(row.actions),
        format: meta?.creative?.video_id || meta?.creative?.object_type === 'VIDEO' ? 'video' : 'image',
        creative,
      };
    })
    .filter((a) => a.impressions > 0 || a.spend > 0)
    .sort((a, b) => b.spend - a.spend);

  // 3) Campaign rows.
  //
  // Identity (name, status) is rolled up from the ad rows, but the FIGURES come
  // from Meta's own campaign-level insights where available. Summing per-ad
  // reach into a campaign total double-counts anyone who saw two ads in it —
  // reach is de-duplicated people, not an additive quantity. The roll-up
  // survives only as a fallback for when that call fails.
  const byCampaign = new Map<string, MetaCampaign>();
  for (const a of ads) {
    const c = byCampaign.get(a.campaignId) ?? {
      id: a.campaignId,
      name: a.campaignName,
      // TODO: hardcoded. The real objective is never fetched, so a traffic or
      // awareness campaign is mislabelled here AND judged on cost-per-lead by
      // the verdict engine, which is the wrong yardstick for it.
      objective: 'OUTCOME_LEADS',
      status: a.status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
      spend: 0,
      impressions: 0,
      reach: 0,
      clicks: 0,
      ctr: 0,
      cpc: null,
      cpm: 0,
      leads: 0,
      cpl: null,
    };
    c.spend += a.spend;
    c.impressions += a.impressions;
    c.reach += a.reach;
    c.clicks += a.clicks;
    c.leads += a.leads;
    if (a.status === 'ACTIVE') c.status = 'ACTIVE';
    byCampaign.set(a.campaignId, c);
  }
  const campaigns = [...byCampaign.values()]
    .map((c) => {
      const authoritative = campaignTotals.get(c.id);
      const merged = authoritative ? { ...c, ...authoritative } : c;
      return {
        ...merged,
        ctr: merged.impressions ? (merged.clicks / merged.impressions) * 100 : 0,
        cpc: merged.clicks ? merged.spend / merged.clicks : null,
        cpm: merged.impressions ? (merged.spend / merged.impressions) * 1000 : 0,
        cpl: merged.leads ? merged.spend / merged.leads : null,
      };
    })
    .sort((a, b) => b.spend - a.spend);

  // Account totals likewise come from Meta directly, for the same reason: only
  // Meta can de-duplicate reach across every ad that ran.
  const summed = {
    spend: campaigns.reduce((s, c) => s + c.spend, 0),
    leads: campaigns.reduce((s, c) => s + c.leads, 0),
    impressions: campaigns.reduce((s, c) => s + c.impressions, 0),
    clicks: campaigns.reduce((s, c) => s + c.clicks, 0),
  };
  const totalSpend = accountTotals?.spend ?? summed.spend;
  const totalLeads = accountTotals?.leads ?? summed.leads;
  const totalImpressions = accountTotals?.impressions ?? summed.impressions;
  const totalClicks = accountTotals?.clicks ?? summed.clicks;
  // No honest fallback for reach — summing it is the bug. Null renders as "—",
  // which is the truth when Meta didn't answer, rather than an inflated number.
  const totalReach = accountTotals?.reach ?? null;

  return {
    mock: false,
    tokenPending: false,
    // Whether every creative actually came back. Without this the UI can't tell
    // "this ad has no primary text" from "we failed to load creatives", and it
    // used to resolve that ambiguity by telling a connected user to connect Meta.
    creativesLoaded,
    account: { id: ACCOUNT_ID, name: ACCOUNT_NAME, currency: 'AUD' },
    range,
    rangeLabel: RANGE_LABELS[range] ?? range,
    updatedAt: new Date().toISOString(),
    totals: {
      spend: totalSpend,
      leads: totalLeads,
      impressions: totalImpressions,
      reach: totalReach,
      clicks: totalClicks,
      ctr: totalImpressions ? (totalClicks / totalImpressions) * 100 : 0,
      cpc: totalClicks ? totalSpend / totalClicks : null,
      cpl: totalLeads ? totalSpend / totalLeads : null,
    },
    campaigns,
    ads,
    daily,
    platforms,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const url = new URL(request.url);
  const rangeParam = url.searchParams.get('range') ?? 'last_30d';
  const range = VALID_RANGES.has(rangeParam) ? rangeParam : 'last_30d';

  if (!TOKEN) {
    // Snapshot is a fixed 30-day capture — keep its own label so the range
    // buttons don't imply numbers that didn't change.
    return NextResponse.json(buildSnapshot());
  }

  const hit = cache.get(range);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return NextResponse.json({ ...hit.data, cached: true });
  }

  try {
    const data = await fetchLive(range);
    cache.set(range, { data, ts: Date.now() });
    return NextResponse.json(data);
  } catch (error) {
    console.error('Meta Ads API error:', error);
    // Fall back to the snapshot so the page still renders, flagged as sample.
    return NextResponse.json({
      ...buildSnapshot(),
      error: error instanceof Error ? error.message : 'Failed to fetch Meta Ads data',
    });
  }
}
