# The Yard Gym Dashboard — Design Rules

These rules are **locked**. They exist to stop the interface drifting into the
generic AI-generated look: the layer of decoration that gets added on top of an
otherwise fine UI, usually when a new "AI-flavoured" feature lands.

Any new UI must comply. If a rule genuinely needs to change, change it *here
first*, in its own commit, with the reason written down — don't quietly break it
in a feature commit.

---

## The risk being defended against

Models converge on the same visual fingerprint: flat-hierarchy Inter, purple-to-
blue gradients, glassmorphism, glowing borders on dark surfaces, floating
gradient orbs, three-card rows, emoji as icons. Dark mode is not the tell — the
decorative layer bolted on top is.

The highest-risk moment is adding an AI feature (a chat panel, an "insights"
card). That is exactly where this pattern creeps in.

## Reference set

Study these, not generic dashboard-inspiration galleries:

**Vercel** — near-monochrome; colour is reserved for status meaning (deploy
success/fail), never decoration. This is the single most copyable principle
here. **Linear, Attio, Stripe, Mercury, PostHog, Retool** — quiet chrome, high
information density, tables over charts for operational data.

**Attio's "Ask Attio"** is the model for AI surfaces: the AI sits *inline in the
record* and proposes the next action there. A floating chat bubble you have to
re-explain context to is the bolted-on version of the same idea.

---

## Rules

### Colour
One accent, `--color-gym-accent` (`#e11d48`). It means **urgency / status /
action-required** — never visual interest. Everything else is grayscale.

No second accent for "AI" features. An AI-generated insight is styled like any
other content.

Status colours (amber for at-risk, emerald for healthy, rose for high-risk) are
allowed *as data encoding only* — they must map to a real state, never to
decoration.

### Forbidden outright
- Gradients as decoration
- Glassmorphism / backdrop blur
- Glowing or luminous borders
- Floating decorative shapes, orbs, blobs
- A second accent hue introduced for a single feature

### Icons
`lucide-react` exclusively, one stroke width. **No emoji as icons, anywhere.**

Emoji in *user-facing prose* (a brief's summary text) is not an icon and is out
of scope for this rule.

### Radius and spacing
One radius scale. Cards are `rounded-xl`; controls and small tiles are
`rounded-lg`. A new feature does not get to introduce a third radius.

### Density over decoration
Operational data — members, contacts, tasks, leads — defaults to **tables and
lists**, not chart-first layouts.

Charts are *earned*, and only by genuinely time-series data. The Meta Ads spend
trend qualifies. A count does not become a chart because a chart looks richer.

### Motion
Restrained. No fade-in-everything, no hover animation for its own sake.
Transitions are for state changes that need explaining (a drawer opening), not
for making a static card feel alive.

---

## Current tokens

Defined in `src/app/globals.css` via Tailwind v4 `@theme inline` — there is no
`tailwind.config.js`.

| Token | Value | Use |
|---|---|---|
| `--color-gym-bg` | `#ffffff` | Page background |
| `--color-gym-surface` | `#ffffff` | Card surface |
| `--color-gym-border` | `#e5e7eb` | All borders/dividers |
| `--color-gym-accent` | `#e11d48` | Urgency / status / action only |
| `--color-gym-accent-hover` | `#be123c` | Accent hover |
| `--color-gym-muted` | `#9ca3af` | Labels, meta text |
| `--color-gym-text` | `#111827` | Primary text |
| `--color-gym-text-secondary` | `#4b5563` | Secondary text |

Note the app shell is **light**; the login screen is dark. That inconsistency
predates this document — it is recorded here, not endorsed.

---

## Known violations

Recorded so they get fixed deliberately rather than discovered later. **None of
these should be bulk-fixed without sign-off** — an icon swap across nine pages
is a visual change, not a cleanup.

1. **`lucide-react` is installed (`^1.7.0`) but never imported.** Navigation
   uses unicode glyphs in `src/lib/access.ts` (`⊞ ◈ ♥ ▤ ₿ ◉ ▲ 🏆 ◷`), which are
   both emoji-as-icon and inconsistent in weight, since a font renders them, not
   an icon set.
2. **Emoji used as icons in page bodies** — `📥` in `src/app/page.tsx`, `⏳`/`ℹ️`
   in `src/app/gohighlevel/page.tsx`, `ℹ️`/`✅` in `src/app/meta-ads/page.tsx`.
3. **The floating chat bubble** (`src/components/dashboard/FloatingChat.tsx`) is
   the bolted-on AI pattern. Per the handoff order, do not restyle it until the
   data it surfaces is trustworthy — a prettier box around untrustworthy
   priorities is not an improvement.
