import { NextResponse } from 'next/server';
import {
  buildSnapshot,
  type MetaAd,
  type MetaAdsData,
  type MetaCampaign,
  type AdResultType,
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

const LEAD_ACTION_TYPES = new Set([
  'offsite_conversion.fb_pixel_lead',
  'leadgen.other',
  'lead',
  'onsite_web_lead',
]);

function sumLeads(actions: Array<{ action_type: string; value: string }> | undefined): number {
  if (!actions) return 0;
  // Prefer the dedicated lead-form / pixel-lead counters; fall back to generic "lead".
  const pick = (t: string) =>
    actions.filter((a) => a.action_type === t).reduce((s, a) => s + Number(a.value || 0), 0);
  return (
    pick('offsite_conversion.fb_pixel_lead') ||
    pick('leadgen.other') ||
    pick('onsite_web_lead') ||
    pick('lead') ||
    0
  );
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
  const insights = await graph<{ data: InsightRow[] }>(`${act}/insights`, {
    level: 'ad',
    date_preset: range,
    limit: '500',
    fields:
      'ad_id,ad_name,campaign_id,campaign_name,spend,impressions,reach,frequency,clicks,ctr,cpc,cpm,actions',
  });

  // 2) Ad entities for status + creative (only for ads that have insight rows).
  type AdRow = {
    id: string;
    name: string;
    effective_status: string;
    creative?: GraphCreative;
  };
  const adsResp = await graph<{ data: AdRow[] }>(`${act}/ads`, {
    limit: '500',
    fields:
      'id,name,effective_status,creative{id,body,title,image_url,thumbnail_url,object_type,video_id,link_url,call_to_action_type,object_story_spec,asset_feed_spec}',
  });
  const adMeta = new Map(adsResp.data.map((a) => [a.id, a]));

  const ads: MetaAd[] = insights.data
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

  // 3) Roll up campaigns from the ad rows.
  const byCampaign = new Map<string, MetaCampaign>();
  for (const a of ads) {
    const c = byCampaign.get(a.campaignId) ?? {
      id: a.campaignId,
      name: a.campaignName,
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
    .map((c) => ({
      ...c,
      ctr: c.impressions ? (c.clicks / c.impressions) * 100 : 0,
      cpc: c.clicks ? c.spend / c.clicks : null,
      cpm: c.impressions ? (c.spend / c.impressions) * 1000 : 0,
      cpl: c.leads ? c.spend / c.leads : null,
    }))
    .sort((a, b) => b.spend - a.spend);

  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
  const totalLeads = campaigns.reduce((s, c) => s + c.leads, 0);
  const totalImpressions = campaigns.reduce((s, c) => s + c.impressions, 0);
  const totalReach = campaigns.reduce((s, c) => s + c.reach, 0);
  const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);

  return {
    mock: false,
    tokenPending: false,
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
