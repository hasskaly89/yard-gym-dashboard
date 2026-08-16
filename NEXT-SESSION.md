# Yard Gym Dashboard — Next Session Spec

Written 2026-08-15. Everything here was verified against live data, not assumed.
Costs, IDs and endpoint behaviour are recorded so the next session doesn't have
to re-derive them (some of that re-derivation costs real money — MindBody bills
$0.002/call).

---

## Where things stand

**Live on Vercel** (`main` @ `439434b`, in sync with origin):

- Email brief grounded in deterministic pre-scoring (`src/lib/ai/email-signals.ts`)
- GoHighLevel fixed — v1 `/opportunities/search` is retired and 404s; moved to
  v2. Open opportunities went 0 → 868
- Truncation flag + banner, `MAX_TASKS = 20` cap, salvage parser
- "Already replied" suppression, List-Unsubscribe bulk detection
- Warning comment on the milestones cron

**Local, uncommitted** — three API auth guards on `/api/dashboard`,
`/api/dashboard/chat`, `/api/timesheets`. Verified to return 401 when logged
out; **never verified logged-in**. That check comes first: if a same-origin
`fetch` doesn't carry the session cookie, the dashboard goes blank. Revert
rather than ship blind.

**Waiting on Hassan** — `GMAIL_PERSONAL_USER` and `GMAIL_PERSONAL_APP_PASSWORD`
in Vercel (Production). Without them the personal brief never regenerates in
production. The app password is 19 characters *including two spaces*; if Vercel
trims it on paste you get 16 and it fails at IMAP with a valid-looking value.
Note `personalConnected: true` only proves the vars are non-empty — the real
proof is a brief run that fetches mail.

---

## Priority order

### P0 — The nightly cron has never fired

Nothing else stays true without this. Everything below will go stale exactly the
way visit data did.

**Evidence:** every row in `milestone_log` is timestamped 12:4x UTC on Aug 12 —
a manual run. `vercel.json` schedules `/api/milestones/cron` at `0 21 * * *`.
Nothing has ever run at 21:00. `sync_state.visit_sync` is frozen at the same
manual run.

**Consequence:** `member_visits` had no rows for Aug 13/14/15. The dashboard
compared a complete prior week (462) against a truncated current week (321) and
reported a 30% attendance collapse. MindBody's own figure for the same week was
**533 signed in, 88.83/day**. There was no drop. Health scores inherit the same
staleness, so the high-risk count and the call list were inflated too.

**Also fix the failure shape.** The route wraps each step in `try/catch`, pushes
errors into a summary, and returns **HTTP 200**. A failing cron reports success.
Make it return a non-2xx when any step errors.

**Acceptance:** a `milestone_log` row or `sync_state.last_run_at` at ~21:00 UTC
that nobody triggered by hand.

### P1 — Membership IDs (one line, evidence complete)

`src/lib/mindbody/active-memberships.ts:15`

```ts
// current — produces 219
export const ACTIVE_MEMBERSHIP_IDS = new Set<number>([11, 12, 24, 26, 27, 33]);
// correct — produces 215
export const ACTIVE_MEMBERSHIP_IDS = new Set<number>([11, 12, 26, 27, 33, 42, 43]);
```

Remove **24 (Influencer — Non-Fitness, 12 people)**, add **42 (Founders Day
Weekly, 7)** and **43 (Unlimited PIF 8-Week, 1)**.

The constant alone changes nothing — `has_paid_membership` is a stored flag, so
the count only moves after `syncMemberMemberships()` re-runs (~1,250 calls,
~$2.50). Use `/api/mindbody/sync-refresh`, which syncs without sending anything.

### P2 — Revenue from MindBody

The dashboard has **no revenue figure at all** today. This fills the hole Xero
was meant to fill, without building Xero OAuth.

`GET /sale/sales?StartSaleDateTime=<iso>&limit=200` — verified 200 OK, 531 sales
in August, 200/page. **~3 calls per month of history (~$0.006).**

- Sync into Supabase alongside visits; store enough history for year-on-year
- Surface as a Revenue tile with a YoY delta
- **Gotcha:** summing `Payments[].Amount` gives gross. My test returned $11,610
  across the first 200 of 531 sales, while Analytics reports **net** sales of
  $24,919 for the month — net excludes tax and refunds. Match their definition
  or label the tile "gross" honestly.

MindBody Analytics 2.0 itself cannot be embedded — it's a separate BI product
with no public API for its dashboards, and it can't be iframed.

### P3 — Outbound safety net (**prerequisite for P4**)

There is no dev/staging separation: local `.env.local` and Vercel production
point at the **same Supabase project**. Any local run that sends, sends for real.

`/api/milestones/cron` already messages real members via `triggerMilestone()` →
GHL webhooks. Running it locally both messages people *and* writes the
`milestone_log` dedupe row, so the real 21:00 run then skips them. It fails
silently in the worst direction.

Build before anything else sends:

1. **One `dispatch()` chokepoint.** Outbound is currently scattered across
   `api/timesheets`, `api/cron/eod-summary`, `lib/milestones/trigger.ts` and GHL
   contact writes. A net only works if everything funnels through it.
2. **Gate on `process.env.VERCEL_ENV === 'production'`.** Not a `DRY_RUN` flag —
   a flag fails open when someone forgets. `VERCEL_ENV` is absent locally, so
   local code *structurally* cannot send, and it blocks preview deploys too.
3. **Outbox table** logging every attempt as `sent` / `suppressed`, with
   recipient and payload. Local runs write `suppressed` rows — that *is* the
   dry-run artifact.
4. **`OUTBOUND_REDIRECT_TO`** for genuine end-to-end tests: real transport, real
   message, delivered to Hassan with the intended recipient noted.
5. **Env-scope the milestone dedupe** (add an `env` column) so a non-production
   run can't consume production's daily slot. This is a bug in deployed code and
   is worth doing on its own, independent of any new feature.

Note the invariant this breaks: `src/lib/ai/brief.ts` currently promises
"Draft-and-suggest: it surfaces and drafts, it never sends anything."

### P4 — New-lead alert, Trials pipeline

**Needs from Hassan: the filters he uses, and the alert channel.**

Design **webhook, not polling** — GHL outbound webhook → an endpoint here,
modelled on `/api/mindbody/webhooks`. Polling would depend on the cron, which
(see P0) has never fired, so a scheduled checker would silently never run.

Definition matters: "new lead in Trials" could mean opportunity created,
contact tagged, or a move into a specific stage. Hassan's filters settle it.

Scale check: the Trials pipeline holds **715 open opportunities** — by far the
largest of the five. Worth confirming those are live trials and not years of
stale ones, or the alert will fire more than he wants.

The endpoint must verify a shared secret — `/api/*` is not behind the page auth
gate (see below).

---

## Also open

- **`/api/*` is entirely unauthenticated.** `src/proxy.ts:117` excludes `api`
  from the matcher, so ~15 routes serve member names, AI notes, brief bodies, ad
  spend and CRM data to anyone with the URL; `/api/dashboard/chat` spends the
  Anthropic budget and `/api/timesheets` sends mail. The three local guards
  cover the worst. The rest needs a per-route policy: session **or** valid
  Bearer secret, with `/api/mindbody/webhooks` (signature instead) and
  `/api/auth/gmail/callback` (needs a `state` check) staying public.
- **Delta 3** — learn from `dashboard_task_state` complete/snooze history to
  weight future briefs. Deliberately deferred until signal quality is trusted.
- **MindBody enrichment** — `intro`, `classPacks`, `declined`, `suspended` are
  hardcoded to `0` in `src/app/api/mindbody/route.ts`. Real values are known:
  Intro Offers 39, Class Packs 7, declined 11, suspended 68, terminated 5.
  `declined` is the "Missed payments" tile. 68 suspended is 24% of the base and
  is invisible today.
- **Xero** — still a dead placeholder. P2 may remove the need for it.
- **`eslint.config.mjs` exports an empty config**, so `npm run lint` checks
  nothing.

---

## Reference — verified, don't re-derive

### Membership IDs

The classic report's `optMembership` URL parameter **is** the API's
`MembershipId` (confirmed: Founders Day = 42 in both). So IDs can be read free
from report URLs — no scanning needed.

| ID | Membership | Active | Counts? |
|----|------------|--------|---------|
| 12 | TYG Membership | 106 | yes |
| 27 | VIP | 71 | yes |
| 11 | Foundation Tier 1 | 28 | yes |
| 42 | Founders Day \| Weekly | 7 | yes — **missing from code** |
| 33 | Black Friday \| Weekly | 2 | yes |
| 43 | Unlimited PIF \| 8 Week | 1 | yes — **missing from code** |
| 26 | Foundation Tier 2 | 0 | yes |
| 24 | Influencer (Non-Fitness) | 12 | **no — remove** |
| 10 | Intro Offers | 39 | no — count separately |
| — | Class Packs | 7 | no — count separately |

### "Active members" means three different things

| Source | Count | Definition |
|--------|-------|------------|
| MindBody Analytics 2.0 | 270 | every membership type incl. Intro + Class Packs |
| Hassan's definition | 215 | the 7 TYG tiers above |
| Current dashboard | 219 | the buggy ID set |

None is wrong; they answer different questions. The dashboard should say which.

Also note attendance scope: `member_visits` only syncs **active paid members**
(`sync-visits.ts:122`), so it can never equal MindBody's class attendance, which
counts everyone in the room. And the dashboard uses a **rolling 7-day window**
while MindBody uses a **Monday-start week** — those differ even with perfect data.

### Endpoints

| Endpoint | Status |
|----------|--------|
| MindBody `/sale/sales` | ✅ works — 531 sales in Aug, 200/page |
| MindBody `/sale/memberships` | ❌ does not exist (returns HTML) |
| MindBody membership names | only per-client via `/client/clientmemberships` |
| GHL v1 `/opportunities/search` | ❌ retired, 404s — a `catch` turned this into a silent 0 |
| GHL v2 `/opportunities/search` | ✅ works, needs the Private Integration Token |
| Meta Graph platform breakdown | `publisher_platform` is a **breakdown**, not a field |

### Traps

- `mailparser`'s `parsed.headers` is a **curated subset** and omits `list-*`
  entirely — `headerLines` is required. Checking `.headers` silently returns
  false for every marketing email.
- Never run `npm run build` and then `next dev` against the same `.next`
  directory. Routes 404 while still executing. Clear `.next` first.
- Local writes are production writes. Snapshot any table before a run that
  mutates it, so a before/after comparison is possible.
- To test brief generation use `/api/dashboard/brief-cron` (calls `runBriefs()`
  only, sends nothing). **Never** `/api/milestones/cron`.

---

## Standard of proof

Every claim in this document is backed by an observed result. Hold the next
session to the same bar: a fix isn't done because the code looks right, it's
done when the behaviour was observed changing. Tonight's two most valuable
findings — the truncated personal brief and the cron that never fires — were
both invisible until something was actually run.
