// Real Yard Gym (Edensor Park) Meta Ads data — last 30 days, account 741182451528211.
// Captured from the Meta Marketing API so the page is fully usable before a live
// access token is wired in. Once META_ACCESS_TOKEN is set, route.ts serves live data
// (including real ad creatives, images and click-through links) and this is unused.

export type AdResultType = 'pixel_lead' | 'instant_form' | 'link_click' | 'none';

export interface MetaAd {
  id: string;
  name: string;
  campaignId: string;
  campaignName: string;
  status: string; // ACTIVE | PAUSED | CAMPAIGN_PAUSED
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  ctr: number; // %
  cpc: number | null;
  cpm: number;
  leads: number;
  cpl: number | null; // cost per lead
  resultType: AdResultType;
  format: 'video' | 'image';
  // Creative — only populated in live mode (needs an access token). In snapshot
  // mode these are null and the UI shows a "connect to load creative" placeholder.
  creative: {
    body: string | null;
    title: string | null;
    cta: string | null;
    linkUrl: string | null;
    imageUrl: string | null;
    thumbnailUrl: string | null;
    previewUrl: string | null;
  } | null;
}

export interface MetaCampaign {
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

export interface MetaAdsData {
  mock: boolean;
  tokenPending: boolean;
  account: { id: string; name: string; currency: string };
  range: string;
  rangeLabel: string;
  updatedAt: string;
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
  campaigns: MetaCampaign[];
  ads: MetaAd[];
}

const CAMPAIGNS: MetaCampaign[] = [
  {
    id: '120244433009090300',
    name: 'KIYO | EP OW | Leads | MAY26',
    objective: 'OUTCOME_LEADS',
    status: 'PAUSED',
    spend: 1148.3,
    impressions: 48726,
    reach: 11859,
    clicks: 1730,
    ctr: 3.55,
    cpc: 0.66,
    cpm: 23.57,
    leads: 26,
    cpl: 44.17,
  },
  {
    id: '120240723780900300',
    name: 'KIYO 5x50 | Leads | FEB26 (IF)',
    objective: 'OUTCOME_LEADS',
    status: 'ACTIVE',
    spend: 377.0,
    impressions: 17312,
    reach: 8464,
    clicks: 332,
    ctr: 1.92,
    cpc: 1.14,
    cpm: 21.78,
    leads: 6,
    cpl: 62.83,
  },
  {
    id: '120245837907050300',
    name: 'EP YARD42 | Leads | JUNE26',
    objective: 'OUTCOME_LEADS',
    status: 'ACTIVE',
    spend: 49.93,
    impressions: 3684,
    reach: 1695,
    clicks: 141,
    ctr: 3.83,
    cpc: 0.35,
    cpm: 13.55,
    leads: 3,
    cpl: 16.64,
  },
];

const CAMPAIGN_NAME: Record<string, string> = Object.fromEntries(
  CAMPAIGNS.map((c) => [c.id, c.name]),
);

type RawAd = Omit<MetaAd, 'campaignName' | 'creative'>;

const RAW_ADS: RawAd[] = [
  { id: '120244433234890300', name: 'Video | OW #2', campaignId: '120244433009090300', status: 'PAUSED', spend: 382.6, impressions: 13932, reach: 5662, frequency: 2.46, clicks: 646, ctr: 4.64, cpc: 0.59, cpm: 27.46, leads: 7, cpl: 54.66, resultType: 'pixel_lead', format: 'video' },
  { id: '120244433009130300', name: 'Video | OW #1', campaignId: '120244433009090300', status: 'CAMPAIGN_PAUSED', spend: 202.82, impressions: 9652, reach: 3897, frequency: 2.48, clicks: 319, ctr: 3.31, cpc: 0.64, cpm: 21.01, leads: 6, cpl: 33.8, resultType: 'pixel_lead', format: 'video' },
  { id: '120244433263690300', name: 'Video | Nat ACC', campaignId: '120244433009090300', status: 'CAMPAIGN_PAUSED', spend: 137.44, impressions: 8350, reach: 4194, frequency: 1.99, clicks: 204, ctr: 2.44, cpc: 0.67, cpm: 16.46, leads: 5, cpl: 27.49, resultType: 'pixel_lead', format: 'video' },
  { id: '120245300489350300', name: 'Video | Ricky', campaignId: '120244433009090300', status: 'PAUSED', spend: 125.3, impressions: 1285, reach: 791, frequency: 1.62, clicks: 149, ctr: 11.6, cpc: 0.84, cpm: 97.51, leads: 1, cpl: 125.3, resultType: 'pixel_lead', format: 'video' },
  { id: '120240723780950300', name: 'Video | Josephine Testimonial', campaignId: '120240723780900300', status: 'PAUSED', spend: 119.05, impressions: 5978, reach: 3699, frequency: 1.62, clicks: 132, ctr: 2.21, cpc: 0.9, cpm: 19.91, leads: 1, cpl: 119.05, resultType: 'instant_form', format: 'video' },
  { id: '120240723780910300', name: 'Video | Alan Testimonial M', campaignId: '120240723780900300', status: 'ACTIVE', spend: 85.39, impressions: 2972, reach: 1840, frequency: 1.62, clicks: 34, ctr: 1.14, cpc: 2.51, cpm: 28.73, leads: 2, cpl: 42.7, resultType: 'instant_form', format: 'video' },
  { id: '120244798528370300', name: 'Static | OW1', campaignId: '120244433009090300', status: 'CAMPAIGN_PAUSED', spend: 80.31, impressions: 5376, reach: 2894, frequency: 1.86, clicks: 75, ctr: 1.4, cpc: 1.07, cpm: 14.94, leads: 2, cpl: 40.16, resultType: 'pixel_lead', format: 'image' },
  { id: '120244433282780300', name: 'Video | Breanna CC', campaignId: '120244433009090300', status: 'PAUSED', spend: 80.16, impressions: 4264, reach: 2706, frequency: 1.58, clicks: 116, ctr: 2.72, cpc: 0.69, cpm: 18.8, leads: 1, cpl: 80.16, resultType: 'pixel_lead', format: 'video' },
  { id: '120244433318910300', name: 'Video | Nat+Chris CC', campaignId: '120244433009090300', status: 'PAUSED', spend: 74.41, impressions: 4849, reach: 2643, frequency: 1.83, clicks: 120, ctr: 2.47, cpc: 0.62, cpm: 15.35, leads: 4, cpl: 18.6, resultType: 'pixel_lead', format: 'video' },
  { id: '120240729069680300', name: 'Video | Ellen Testimonial', campaignId: '120240723780900300', status: 'ACTIVE', spend: 57.1, impressions: 3053, reach: 2203, frequency: 1.39, clicks: 43, ctr: 1.41, cpc: 1.33, cpm: 18.7, leads: 0, cpl: null, resultType: 'instant_form', format: 'video' },
  { id: '120245300078280300', name: 'Video | Paula', campaignId: '120244433009090300', status: 'PAUSED', spend: 43.56, impressions: 436, reach: 310, frequency: 1.41, clicks: 59, ctr: 13.53, cpc: 0.74, cpm: 99.91, leads: 0, cpl: null, resultType: 'pixel_lead', format: 'video' },
  { id: '120240723780940300', name: 'Static | F Pulldown', campaignId: '120240723780900300', status: 'ACTIVE', spend: 42.01, impressions: 1800, reach: 1234, frequency: 1.46, clicks: 32, ctr: 1.78, cpc: 1.31, cpm: 23.34, leads: 1, cpl: 42.01, resultType: 'instant_form', format: 'image' },
  { id: '120245838068690300', name: 'Static | Y42 Green', campaignId: '120245837907050300', status: 'ACTIVE', spend: 35.31, impressions: 2791, reach: 1424, frequency: 1.96, clicks: 108, ctr: 3.87, cpc: 0.33, cpm: 12.65, leads: 3, cpl: 11.77, resultType: 'pixel_lead', format: 'image' },
  { id: '120240729119030300', name: 'Video | Natalie Testimonial', campaignId: '120240723780900300', status: 'ACTIVE', spend: 28.19, impressions: 1299, reach: 893, frequency: 1.45, clicks: 34, ctr: 2.62, cpc: 0.83, cpm: 21.7, leads: 0, cpl: null, resultType: 'instant_form', format: 'video' },
  { id: '120240723780920300', name: 'Video | Talia Testimonial F', campaignId: '120240723780900300', status: 'ACTIVE', spend: 26.04, impressions: 1491, reach: 1011, frequency: 1.47, clicks: 31, ctr: 2.08, cpc: 0.84, cpm: 17.46, leads: 1, cpl: 26.04, resultType: 'instant_form', format: 'video' },
  { id: '120245556818570300', name: 'Video | New', campaignId: '120244433009090300', status: 'CAMPAIGN_PAUSED', spend: 21.7, impressions: 582, reach: 411, frequency: 1.42, clicks: 42, ctr: 7.22, cpc: 0.52, cpm: 37.29, leads: 0, cpl: null, resultType: 'pixel_lead', format: 'video' },
  { id: '120240723780960300', name: 'Video | Has & Kiki Walk Thru', campaignId: '120240723780900300', status: 'ACTIVE', spend: 14.38, impressions: 627, reach: 497, frequency: 1.26, clicks: 21, ctr: 3.35, cpc: 0.68, cpm: 22.93, leads: 0, cpl: null, resultType: 'instant_form', format: 'video' },
  { id: '120245837907060300', name: 'Video | Y42', campaignId: '120245837907050300', status: 'ACTIVE', spend: 6.78, impressions: 360, reach: 250, frequency: 1.44, clicks: 19, ctr: 5.28, cpc: 0.36, cpm: 18.83, leads: 0, cpl: null, resultType: 'pixel_lead', format: 'video' },
  { id: '120245838146470300', name: 'Static | Are You Up For A Challenge?', campaignId: '120245837907050300', status: 'ACTIVE', spend: 5.22, impressions: 369, reach: 260, frequency: 1.42, clicks: 11, ctr: 2.98, cpc: 0.47, cpm: 14.15, leads: 0, cpl: null, resultType: 'pixel_lead', format: 'image' },
  { id: '120240723780930300', name: 'Video | Jolena Testimonial', campaignId: '120240723780900300', status: 'ACTIVE', spend: 3.42, impressions: 59, reach: 51, frequency: 1.16, clicks: 5, ctr: 8.47, cpc: 0.68, cpm: 57.97, leads: 1, cpl: 3.42, resultType: 'instant_form', format: 'video' },
  { id: '120245838103820300', name: 'Static | This Is Y42', campaignId: '120245837907050300', status: 'ACTIVE', spend: 2.62, impressions: 164, reach: 129, frequency: 1.27, clicks: 3, ctr: 1.83, cpc: 0.87, cpm: 15.98, leads: 0, cpl: null, resultType: 'pixel_lead', format: 'image' },
  { id: '120240723780970300', name: 'Video | EP Reel', campaignId: '120240723780900300', status: 'ACTIVE', spend: 1.42, impressions: 33, reach: 30, frequency: 1.1, clicks: 0, ctr: 0, cpc: null, cpm: 43.03, leads: 0, cpl: null, resultType: 'instant_form', format: 'video' },
];

export function buildSnapshot(): MetaAdsData {
  const ads: MetaAd[] = RAW_ADS.map((a) => ({
    ...a,
    campaignName: CAMPAIGN_NAME[a.campaignId] ?? '—',
    creative: null,
  }));

  const totalSpend = CAMPAIGNS.reduce((s, c) => s + c.spend, 0);
  const totalLeads = CAMPAIGNS.reduce((s, c) => s + c.leads, 0);
  const totalImpressions = CAMPAIGNS.reduce((s, c) => s + c.impressions, 0);
  const totalReach = CAMPAIGNS.reduce((s, c) => s + c.reach, 0);
  const totalClicks = CAMPAIGNS.reduce((s, c) => s + c.clicks, 0);

  return {
    mock: true,
    tokenPending: true,
    account: { id: '741182451528211', name: 'The Yard Gym Edensor Park', currency: 'AUD' },
    range: 'last_30d',
    rangeLabel: 'Last 30 days',
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
    campaigns: CAMPAIGNS,
    ads,
  };
}
