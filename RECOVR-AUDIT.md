# Recovr — Feature Audit & Replacement Plan

Audited 2026-08-16 against the live account (`retention.recovr.com`, The Yard Gym
Edensor Park). Everything below was observed in the product, not taken from
marketing copy — where a claim comes only from the marketing site it is labelled.

**What it costs:** their ROI calculator cites a **$3,600/year** Recovr investment.
That's the number a replacement has to beat.

---

## The single most useful discovery

**Recovr sends through LeadConnector — which is GoHighLevel.** The message
composer on a client's Timeline reads `From: LeadConnector To: +61421677926`.

That means the outbound channel Recovr charges for is the CRM you already pay
for and already have wired into this dashboard (`src/lib/ghl/api.ts`). Replacing
the send path costs nothing extra — it's the same pipe.

The second discovery: Recovr's whole product is **MindBody data + a health score
+ an AI writer + a task queue**. You already have the first two working.

---

## What Recovr actually is

Four layers (their framing, and it matches what the app does):

1. **Data layer** — pulls the booking platform, normalises into member profiles
2. **Risk engine** — health score 0–100 and a band (Low / Medium / High)
3. **Action layer** — a daily task queue plus AI-drafted messages
4. **Learning loop** — outcomes feed back into what it recommends

You have layers 1 and 2. **Layer 3 is the actual product** — the reason people
pay. Layer 4 is the least verifiable claim.

---

## Full feature inventory

### Navigation
`My Tasks` · `Clients` · `Inbox (86)` · `Session Report` · `Workflows (Beta)` ·
`Reports` · `Settings` · `Recovr How To` · Support · global search ·
notifications · **location switcher** (multi-site).

### My Tasks — the core screen

Five queues with live counts, as seen on the account:

| Queue | Count |
|---|---|
| High Risk | 20 |
| Medium Risk | 76 |
| Conversions | 53 |
| Renewals | 58 |
| Assigned | 6 |

Each task card carries: photo, name, a one-line AI reason, health score %,
days since last visit, next booking if any ("Tomorrow 4:30 PM"), a **Sessions
used/total** bar, a **Time remaining** bar, and flag/snooze icons.

Real examples of the one-liners — this is the tone to reproduce:

- "Expired package and steep drop-off — immediate outreach needed."
- "Attendance down 60% in 2 weeks; no sessions booked."
- "Health score dropped 10 points despite attendance rise."
- "High-risk drop, membership expiring, no engagement."

### Client detail — four tabs

Header: photo, name, click-to-call, click-to-email, health badge, last visit,
tag control, and **Snooze / Flag / Assign** menus.

**Details** — an AI narrative that cites specifics:

> "Milica's 8-week TYG Foundation commitment expired today, leaving her with no
> active package or auto-renewal. Her health score has dropped from 28.2 to 5.3
> since Aug 3, attendance is down to 0.5 visits/week from 1.8, and her last visit
> was about 3 weeks ago with no future sessions booked. Despite recent staff
> check-ins, she hasn't booked anything — this is a key re-engagement window."

Note what it references: package expiry, auto-renewal state, **score delta with a
date**, **visits/week now vs before**, last visit, forward bookings, and prior
staff contact. Stamped "Generated Today 11:22 PM". Below it, a Renewal Status
panel (sessions used/total, time remaining) and a two-month calendar of visits.

**Timeline** — a unified member feed: join date, every attendance, late cancels,
no-shows, every SMS in both directions, every marketing email, and staff notes.
Plus the **RecovrAI Suggestion**: a pre-drafted message with Edit and Send.

> "Hey Milica, your 8-week commitment wrapped up today and we'd love to have you
> back on the mat. Want me to lock you in for Monday 5 AM RIG or another time
> that suits you better?"

Composer is SMS (0/160) sending via LeadConnector. Action bar:
**Message · Call · Note · Interact**.

**Packages** — each package with a type tag (`Membership`, `Intro`, `Reports`),
date range and Active state. This is the same membership-vs-intro-vs-class-pack
split you defined tonight.

**Graph** — daily health-score bars coloured by risk band, with attendance and
missed-session markers overlaid, a current-day line and zoom. Legend: Attended,
Missed, Low Risk, Medium Risk, High Risk, Non-Attender.

### Reports (12)

Old Dashboard · Summary · Absent Clients · Cancellation Summary · Drop Off
Report · Actions Report · High Risk Clients · Conversion Stats · New Clients ·
Client Visits · **Daily Briefing** · First Visit Report

### Settings (9)

Booking Platform · Communication Channels · Packages · Notifications ·
**RecovrAI** · Team Management · Labels · Custom Fields · Account

**RecovrAI** is the whole AI configuration, and it's small enough to copy
outright:

- What you call your business ("Studio") and your customers ("Clients")
- Business description
- Tone preset ("Friendly & Encouraging") + free-text communication guidelines
- **"Populate from your messages"** — reads a sample of real outbound SMS and
  infers tone, sign-off and vocabulary. Genuinely clever, and cheap to copy
- Five message categories, each customisable or default: **High Risk Client,
  New Member Activation, Existing Bookings, Lapsed Client, Engaged Client**

### Workflows (Beta)
Overview · New Workflow · Results · Activity Log. Still beta on their side.

### Marketing claims (not verified in-app)
6–12 week early detection, 15%+ retention improvement, 30% churn improvement,
message success rates (personal call 92%, class reminder SMS 78%), learning loop.

---

## Gap analysis

### You already have

| Recovr feature | Where yours lives |
|---|---|
| Health score 0–100, low = risk | `src/lib/retention/healthScore.ts` |
| Risk bands (high/medium/healthy) | same |
| AI "why at risk + what to do" | `src/lib/ai/retention-summary.ts` |
| At-risk list with scores | `src/app/retention/page.tsx` |
| MindBody attendance sync | `src/lib/mindbody/sync-visits.ts` |
| GHL contact/message integration | `src/lib/ghl/api.ts` |
| Task complete / snooze | `dashboard_task_state` |
| Period-filtered business metrics | `src/app/api/business/route.ts` — **Recovr has no equivalent** |

### The real gaps, ranked by how much of the $3,600 they represent

**1. The task queue (highest value).** Five prioritised queues, not one list.
Conversions and Renewals are separate from risk, and that's what makes it a daily
habit rather than a report. Yours has an at-risk list but no queue, no
assignment, no snooze/flag per member.

**2. Per-member timeline.** One feed of attendance + every message + notes. You
have the visit data and the GHL conversation data already — they've just never
been merged into one view. This is mostly assembly, not new capability.

**3. AI message drafting + send.** Draft, edit, send via GHL, track the outcome.
You already have the Anthropic client and the GHL send path. The missing pieces
are the five message categories, the tone config, and an outbox.

**4. Health graph over time.** Requires storing a daily score snapshot — you
compute scores but only keep the latest. A small table plus a nightly write.

**5. Packages view + renewal status.** Sessions used/remaining and time
remaining. `AutopayStatus` on `/client/clientcontracts` gives you the status side
(found during last night's audit).

**6. The 12 reports.** Mostly straightforward queries over data you already sync.
Daily Briefing overlaps heavily with the brief system you already built.

**7. Workflows.** Beta on their side. Lowest priority — and the piece most likely
to be a liability without the outbound safety net (see `NEXT-SESSION.md`).

---

## Replacement plan

**Do not build a second dashboard.** Everything here is a Retention section
inside the app you already have — it shares the members table, the health score,
the AI client and the GHL integration. A separate app would duplicate all four.

Suggested order, each independently useful:

1. **Daily score snapshot table** — one nightly row per member. Unlocks the graph
   and every "score dropped X points since Y" phrase in the AI narrative. Cheap
   and it must start collecting early, because history can't be backfilled.
2. **Task queue with the five tabs** — reusing the existing scoring. This alone
   replaces most of the day-to-day use.
3. **Unified member timeline** — merge `member_visits` with GHL conversations.
4. **AI drafting with the five categories + tone settings**, send via GHL,
   logged to an outbox. **Needs the outbound safety net first** — this sends to
   real members, and there is still no dev/staging separation.
5. **Packages + renewal status** via `AutopayStatus`.
6. **Reports**, as demand dictates. Several are one query each.

### Running cost

Small, and mostly things you already pay for:

- MindBody: attendance already syncs. Class-level data is 1 call/week (~$0.002)
- GHL: not billed per call — the send path is free
- Anthropic: the expensive part is per-member narratives. At ~100 at-risk members
  refreshed daily that's real money; refresh only on score *change* rather than
  nightly and it drops sharply
- Supabase/Vercel: already paid

**Realistically a few dollars a month against $300.**

---

## Honest limits of this audit

- I mapped all 12 reports and all 9 settings pages by name, and went deep on My
  Tasks, the four client tabs and RecovrAI. **I did not open each of the 12
  reports individually** — the next pass should, since some may contain metrics
  worth copying.
- Inbox (86), Session Report, Clients sub-pages and Workflows internals were
  identified but not explored in depth.
- I deliberately touched **no** Send, Act Now or Interact control. This app
  messages real members and I was not going to risk firing one.
- Their scoring model internals aren't visible. Yours already approximates the
  behaviour; matching it exactly isn't possible and probably isn't necessary.

## Before cancelling

Recovr holds history you'd lose: message threads with members, action outcomes,
and the score history behind the graph. Export anything worth keeping first, and
run both in parallel for a few weeks — long enough to confirm your queue surfaces
the same members theirs does.
