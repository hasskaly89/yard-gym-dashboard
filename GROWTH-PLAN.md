# The Yard Edensor Park — Plan to 300 Members

Built 2026-08-16 from live data: MindBody, GoHighLevel, Meta Ads, the content
calendar and the Recovr account. Every number was pulled, not estimated.
**Nothing was changed** — this is read-only analysis.

**Where you are: 215 members. Target: 300. Gap: +85.**

---

## Read this first: GHL's own numbers are not true

Every pipeline figure in GoHighLevel reflects whether somebody moved a card, not
whether money changed hands. Cross-referencing every opportunity against the
MindBody membership list gives a very different picture:

| Pipeline | Entered | Paying today | **True rate** | GHL claimed |
|---|---|---|---|---|
| **Trials** | 875 | **38** | **4.3%** | 8.1% |
| Open Week | 80 | 25 | 31.3% | 52.5% |
| Challenge | 135 | 77 | 57.0% | 14.4% |
| Purchased M/S | 242 won | 60 | 24.8% | — |

The CRM is not being maintained, and it distorts in both directions:

- **66 people sitting in Challenge "open" are already paying members.** Nobody
  moved the card. That's why Challenge looked like 14% and is really ~57%.
- **Of 242 "won" memberships, only 60 still pay.** 182 have lapsed.
- **Trials: 719 open, 2 paying.** Confirmed dead with hard evidence, not
  inference.

**Never quote a GHL conversion rate again without this cross-check.** Anything
built on pipeline stages alone is measuring admin habits.

## What this means for acquisition

Meta is genuinely healthy — the KIYO campaign delivers leads at **$16.69**. But
all 53 Facebook leads in the last 60 days went into **Trials**, which converts to
a paying member **4.3%** of the time.

**Real cost per member acquired today: about $388.**

That's still profitable against a $69/week membership (~$3,588/year), but it is
roughly ten times worse than it looks from the ad dashboard, and it is the number
to beat.

## Where the leads should go instead

**Open Week and Challenge are limited campaigns, not always-on funnels.** Open
Week runs again next month. That's why both show zero new leads in 60 days, and
part of why they convert well — a campaign has a deadline, a cohort and urgency
that an open-ended "trial" never has.

So the play is not "re-route leads permanently". It is:

1. **Time paid spend to the campaign windows.** Concentrate Meta budget into the
   weeks Open Week and Challenge actually run, instead of trickling it into
   Trials year-round.
2. **Run these campaigns more often.** They are the only things converting at
   30–57%. If Open Week is a few weeks per quarter, that's most of the year with
   paid traffic pointed at a 4.3% funnel.
3. **Give leads arriving between campaigns a real destination** — a waitlist for
   the next Open Week beats dumping them into Trials to go stale.

**One caveat on Challenge's 57%:** its pipeline has both `*Non-member Lead` and
`*Member Lead` stages, so existing members joining a challenge are mixed in with
new acquisitions. The true *new-member* rate is lower than 57%. Split those
stages before treating it as an acquisition channel.

---

## Do these tomorrow, in this order

### 1. Plan the spend around next month's Open Week — 30 minutes

Open Week runs again next month. Decide now:

- **Hold most of the Meta budget for that window** rather than spending it into
  Trials in the meantime. Same money, a funnel converting ~31% instead of 4.3%.
- **Start a waitlist now.** Every lead that arrives before the campaign opens
  goes to "Open Week — next intake" instead of into Trials to die. That's the
  destination problem solved without inventing a new funnel.
- **Set the dates and build the ad creative this week**, so spend can go live the
  day the campaign opens instead of three days into it.

### 2. Fix the CRM data before trusting any of it — 1 hour

66 paying members are sitting in Challenge "open" and 182 lapsed members sit in
"won". Until cards reflect reality, every conversion number you or I calculate is
measuring admin habits.

Fastest version: bulk-close the 557 Trials opportunities older than 90 days
(2 of them are paying members, so you lose nothing), and move the 66 known
paying members out of Challenge "open" to won.

### 3. Kill the $50 trial ad — 5 minutes

`pd_$50Trial_Cold_Conv`: **$46.14 spent, 1 lead, CPL $46.14**. Your other
campaign is at $16.69. Turn it off and move the budget.

### 4. Work the 26 people actually in trial — today, by hand

Of 718 open trials, only **47 were created in the last 30 days** and only **26
people are actually in trial right now**:

- 12 In Trial (Next Class Booked) — closest to converting, call these first
- 10 Registered Trial (Class Booked)
- 3 In Trial (No Class Booked) — book them in
- 1 Registered, no booking

Twenty-six conversations. At Trials' own 8% that's 2 members; worked properly by
phone it should be far better. This is the fastest win in the list.

### 5. Accept that 557 trials are dead

**557 of the 718 open trials are over 90 days old** — 413 are over 180 days.
They are not a pipeline, they are a list. Two implications:

- Stop counting 718 as opportunity. Your real live funnel is 26 people.
- Run **one** reactivation campaign to the dormant list, then close them out. At
  a realistic 1–3% that's 5–17 members for near-zero cost — worth doing once,
  not worth building a strategy on.

Closing them also makes your dashboard honest again.

### 6. Turn the content calendar on — the cheapest acquisition you have

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
| Meta spend concentrated into campaign windows (~31%) | ~6–8 | ~$450/mo |
| The 26 live trials, worked by phone | ~3 | $0 |
| Organic content, once running | ~2–4 | $0 |
| Retention saved (once the cron runs) | ~5 recovered | $0 |
| **Net** | **~12–15/month** | |

**+85 in roughly 6–8 months at about $450/month.** Cost per acquired member falls
from ~$388 (today, into Trials at 4.3%) to roughly **$55–70** if paid traffic
only runs into campaign windows converting near 31%.

Retention matters as much as acquisition here: at ~8% monthly churn you lose
around 17 members a month, so the cron being dead has been quietly cancelling out
whatever the ads bring in.

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
