import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Milestone bands (existing list from src/lib/milestones/detect.ts).
// Each member is grouped into their HIGHEST band achieved.
export const MILESTONE_BANDS = [
  1000, 500, 300, 250, 200, 150, 100, 50, 25,
] as const;

export type MilestoneBand = (typeof MILESTONE_BANDS)[number];

export type MilestoneMember = {
  mindbody_client_id: string;
  first_name: string;
  last_name: string;
  total_visit_count: number;
  last_visit_date: string | null;
};

export type MilestoneBandGroup = {
  band: MilestoneBand;
  label: string;
  members: MilestoneMember[];
};

export type MilestonesResponse = {
  bands: MilestoneBandGroup[];
  totalActiveMembers: number;
  totalSignedInClasses: number;
  topMember: MilestoneMember | null;
  underThreshold: number; // active members under the lowest band (25)
  updatedAt: string;
};

function bandFor(count: number): MilestoneBand | null {
  for (const b of MILESTONE_BANDS) {
    if (count >= b) return b;
  }
  return null;
}

function labelFor(band: MilestoneBand): string {
  return `${band}+ Classes`;
}

export async function GET() {
  const supabase = createAdminClient();

  const { data: members, error } = await supabase
    .from('members')
    .select(
      'mindbody_client_id, first_name, last_name, total_visit_count, last_visit_date',
    )
    .eq('status', 'active')
    .eq('has_paid_membership', true)
    .order('total_visit_count', { ascending: false });

  if (error || !members) {
    return NextResponse.json(
      { error: error?.message ?? 'Failed to load members' },
      { status: 500 },
    );
  }

  const groups = new Map<MilestoneBand, MilestoneMember[]>();
  let underThreshold = 0;
  let totalClasses = 0;
  let topMember: MilestoneMember | null = null;

  for (const m of members) {
    const count = m.total_visit_count ?? 0;
    totalClasses += count;
    if (!topMember || count > (topMember.total_visit_count ?? 0)) {
      topMember = m;
    }
    const band = bandFor(count);
    if (band === null) {
      underThreshold++;
      continue;
    }
    if (!groups.has(band)) groups.set(band, []);
    groups.get(band)!.push(m);
  }

  // Hide empty bands; order high → low.
  const bands: MilestoneBandGroup[] = MILESTONE_BANDS.filter((b) =>
    groups.has(b),
  ).map((b) => ({
    band: b,
    label: labelFor(b),
    members: (groups.get(b) ?? []).sort(
      (a, b) => (b.total_visit_count ?? 0) - (a.total_visit_count ?? 0),
    ),
  }));

  const body: MilestonesResponse = {
    bands,
    totalActiveMembers: members.length,
    totalSignedInClasses: totalClasses,
    topMember,
    underThreshold,
    updatedAt: new Date().toISOString(),
  };

  return NextResponse.json(body);
}
