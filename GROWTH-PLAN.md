# The Yard Edensor Park — Plan to 300 Members

Built 2026-08-16 from live data: MindBody, GoHighLevel, Meta Ads, the content
calendar and the Recovr account. Every number was pulled, not estimated.
**Nothing was changed** — this is read-only analysis.

**Where you are: 215 members. Target: 300. Gap: +85.**

---

## The one finding that matters

Your leads are going into the wrong funnel.

| Pipeline | Won | Total | Conversion | New leads (60d) |
|---|---|---|---|---|
| **Open Week** | 42 | 80 | **52.5%** | **0** |
| Challenge | 19 | 132 | 14.4% | 0 |
| **Trials** | 71 | 874 | **8.1%** | **126** |

In the last 60 days, **134 new opportunities were created and 126 landed in
Trials** — including all **53 Facebook leads**. Open Week, which converts more
than six times better, received **nothing**. It's dormant.

Meta is working: your KIYO campaign delivers leads at **$16.69**. The money isn't
the problem. The destination is.

**What that difference is worth**, at your current ~26 Facebook leads/month:

- Into Trials at 8.1% → **~2 members/month** → +85 takes **40 months**
- Into Open Week at 52.5% → **~14 members/month** → +85 takes **~6 months**

**The honest caveat:** Open Week's 52.5% is measured on whoever enters it today —
likely warm, referral and walk-in traffic. Cold paid traffic will convert lower.
Do not bank on 52.5% transferring intact. But even at **half** that rate it is
still 3× better than Trials, and that is the single cheapest change available to
you. Treat it as a test with a real hypothesis, not a certainty.

---

## Do these tomorrow, in this order

### 1. Re-point Meta leads from Trials to Open Week — 30 minutes

The highest-leverage half hour in this document. In GoHighLevel, change the
automation that creates opportunities from the Facebook lead form so it drops
them into **Open Week** instead of **Trials**. Leave everything else alone.

Then let it run two weeks and compare conversion against the 8.1% baseline. If
cold traffic converts at even 20%, you have found roughly **$15,000 of ad
efficiency** without spending another dollar.

### 2. Kill the $50 trial ad — 5 minutes

`pd_$50Trial_Cold_Conv`: **$46.14 spent, 1 lead, CPL $46.14**. Your other
campaign is at $16.69. Turn it off and move the budget.

### 3. Work the 47 live trials — today, by hand

Of 718 open trials, only **47 were created in the last 30 days** and only **26
people are actually in trial right now**:

- 12 In Trial (Next Class Booked) — closest to converting, call these first
- 10 Registered Trial (Class Booked)
- 3 In Trial (No Class Booked) — book them in
- 1 Registered, no booking

Twenty-six conversations. At Trials' own 8% that's 2 members; worked properly by
phone it should be far better. This is the fastest win in the list.

### 4. Accept that 557 trials are dead

**557 of the 718 open trials are over 90 days old** — 413 are over 180 days.
They are not a pipeline, they are a list. Two implications:

- Stop counting 718 as opportunity. Your real live funnel is 26 people.
- Run **one** reactivation campaign to the dormant list, then close them out. At
  a realistic 1–3% that's 5–17 members for near-zero cost — worth doing once,
  not worth building a strategy on.

Closing them also makes your dashboard honest again.

### 5. Turn the content calendar on — the cheapest acquisition you have

Your September plan is fully built and **entirely unexecuted**: 11 posts pending,
**0 approved**, 0 story days planned, against a target of 2 posts/week and 6–8
stories/day. Pillars and formats are already mapped (Training 8, Community 10,
Education 8, Leadership 5; 13 Reels, 10 Photos, 8 Carousels).

Organic costs nothing but time and is the only channel here with no CPL. The
plan doesn't need more planning — it needs approving and scheduling. Batch a
fortnight in one sitting.

---

## Fix the things quietly costing you

### The retention system has never run

`/api/milestones/cron` is scheduled for 21:00 UTC daily and has **never fired** —
confirmed three ways: every milestone log entry is a manual 12:4x run, sync state
frozen at Aug 12, and MindBody's own API billing shows **zero calls** on the days
it should have run.

So: no birthday messages, no anniversary messages, no inactivity nudges, no
refreshed risk scores. Retention has been running on nothing. Check Vercel →
Settings → Cron Jobs first thing.

**Keeping members is cheaper than buying them.** At 8% monthly churn you lose
roughly 17 members a month — you need +85 net, so every member saved is a member
you don't have to pay $17–33 to acquire.

### Cancel Recovr — $3,600/year

Full audit in `RECOVR-AUDIT.md`. It is MindBody data + a health score + an AI
writer + a task queue, and you already own the first two. Critically, **Recovr
sends through LeadConnector, which is GoHighLevel** — the CRM you already pay
for. It has also created just **2 opportunities in 60 days**.

Don't cancel today: export the message history and score history first, and run
both in parallel for a few weeks.

### Your numbers were lying to you

- Attendance reported **−30%** when reality was **−2.7%** (546 this week vs 561
  last). Fixed — the dashboard now compares like-for-like on a Monday-start week.
- Member count was wrong in both directions: counting 12 Influencer comps who
  don't pay, missing 8 who do. One-line fix pending in `NEXT-SESSION.md`.

---

## The arithmetic to 300

| Source | Monthly | Cost |
|---|---|---|
| Meta → Open Week (at a conservative 25%) | ~7 | ~$450/mo |
| Live trials worked by phone | ~3 | $0 |
| Organic content, once running | ~2–4 | $0 |
| Retention saved (once the cron runs) | ~5 recovered | $0 |
| **Net** | **~12–15/month** | |

**+85 in roughly 6–7 months at about $450/month in ad spend** — under $40 per
member acquired, against a $69/week membership. That works.

It only works if the routing change happens. Everything else is optimisation.

---

## What I could not verify

- **GoHighLevel workflows returned zero** via the API. That's either a token
  scope limit or genuinely no active workflows. **Check this by hand tomorrow** —
  if the Facebook→Trials routing is a workflow, that's exactly where you change
  it, and if there are no workflows at all, nothing is nurturing those leads.
- **Meta automated ad creation** and **social scheduling tools** weren't
  assessed — no automation is currently connected to the content calendar, so
  scheduling is manual today regardless.
- Whether the 52.5% Open Week rate survives cold traffic. Only the test answers
  that.

---

## If you do only three things

1. **Re-point Facebook leads to Open Week** — 30 minutes, no cost, biggest lever
2. **Check the Vercel cron** — retention has been dead for months
3. **Ring the 26 people currently in trial** — today

The first is worth more than everything else in this document combined.
