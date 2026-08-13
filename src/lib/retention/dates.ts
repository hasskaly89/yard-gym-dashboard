const SYDNEY_YMD = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Australia/Sydney',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// "Days ago" as a human (or MindBody) means it — by Sydney calendar date, not
// by floor(elapsed-ms / 24h). A visit at 11pm yesterday is "yesterday" even
// if only a few hours have technically elapsed; a raw ms/86400000 floor can
// under- or over-count by a day depending what time of day "now" falls at.
export function daysSinceSydney(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const visit = new Date(iso);
  if (Number.isNaN(visit.getTime())) return null;

  const visitMidnight = Date.parse(`${SYDNEY_YMD.format(visit)}T00:00:00Z`);
  const nowMidnight = Date.parse(`${SYDNEY_YMD.format(new Date())}T00:00:00Z`);

  return Math.max(0, Math.round((nowMidnight - visitMidnight) / 86400000));
}
