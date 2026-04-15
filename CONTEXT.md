# The Yard Gym — Business Dashboard

## Project Overview
A Next.js business dashboard for **The Yard Gym (Edensor Park)** that consolidates all gym operations into one view. Deployed on Vercel at https://yard-gym-dashboard.vercel.app/

## Tech Stack
- **Framework:** Next.js 16.2.2 (App Router)
- **React:** 19.2.4
- **Styling:** Tailwind CSS v4 (uses `@tailwindcss/postcss`, NOT v3 config — no `tailwind.config.js`)
- **Database:** Supabase (auth + data)
- **Icons:** lucide-react
- **Font:** Inter (Google Fonts)
- **Deployment:** Vercel

## ⚠️ IMPORTANT: Tailwind v4
This project uses **Tailwind v4** — there is NO `tailwind.config.js`. Custom theme tokens (colors, etc.) are defined in `src/app/globals.css` using `@theme`. Custom color tokens use the `gym-` prefix (e.g. `bg-gym-surface`, `text-gym-text`, `border-gym-border`, `text-gym-muted`).

## ⚠️ IMPORTANT: Next.js 16
Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. APIs and conventions may differ from older versions.

## Current File Structure
```
src/
├── app/
│   ├── layout.tsx          # Root layout with RootLayoutClient wrapper
│   ├── page.tsx            # Main dashboard (placeholder stats + integration cards)
│   ├── globals.css         # Tailwind v4 theme + global styles
│   ├── api/
│   │   ├── gohighlevel/    # GHL API routes
│   │   ├── mindbody/       # MindBody API routes
│   │   └── timesheets/     # Timesheet API routes
│   ├── gohighlevel/        # GHL page
│   ├── mindbody/           # MindBody page
│   ├── xero/               # Xero page
│   ├── meta-ads/           # Meta Ads page
│   ├── timesheets/         # Staff timesheets
│   ├── login/              # Auth login page
│   └── auth/               # Auth callback
├── components/
│   ├── RootLayoutClient.tsx # Client wrapper (sidebar + auth)
│   └── Sidebar.tsx          # Navigation sidebar
```

## Integrations & API Status

### 1. MindBody (Members, Classes, Attendance)
- **Site ID:** 5741283
- **API Key:** `dbcac5c89f1c4ba6b9d476247cbad135`
- **Status:** API key created & active. Activation link has been generated — needs to be clicked/confirmed by studio owner to authorize the key for site 5741283. Once activated, use the `/public/v6` REST API with `SiteId` and `API-Key` headers.
- **Auth flow:** POST to `/usertoken/issue` with owner credentials to get a bearer token, then use that token for subsequent requests.
- **Useful endpoints:** `/client/clients` (members), `/class/classes` (schedule), `/sale/sales` (revenue), `/enrollment/enrollments`

### 2. GoHighLevel (CRM / Leads)
- **Location ID:** UPb0nTBqWNVa1YodUaPh
- **API routes already built** at `/api/gohighlevel/`
- **Status:** Connected and working. Has both a location API key and a Private Integration Token (PIT).
- **Useful endpoints:** Contacts, opportunities, pipelines, conversations

### 3. Xero (Financials / Invoicing)
- **Status:** Page exists at `/xero` but NO API keys configured yet. Xero uses OAuth 2.0 — requires app registration at developer.xero.com and an OAuth flow.
- **Needs:** Client ID, Client Secret, OAuth redirect URI, tenant connection

### 4. Meta Ads (Ad Spend / Performance)
- **Status:** Page exists at `/meta-ads` but NO API keys configured yet. Uses Meta Marketing API with a long-lived access token.
- **Needs:** Facebook App ID, App Secret, long-lived access token, Ad Account ID

## Supabase
- **URL:** https://bszqvpioguvtwkiwxfgx.supabase.co
- **Used for:** Auth (login/signup), timesheets data storage
- **Tables:** Timesheets-related tables exist; may need new tables for cached integration data

## Current Dashboard State
The main `page.tsx` shows:
- 4 stat cards (Active Members, Monthly Revenue, Ad Spend, Open Leads) — all placeholder "—" values
- Integration status grid showing all 4 as "Not Connected"

## What Needs to Be Done
1. **MindBody:** Once activation is confirmed, wire up live data — pull active members count, class schedule, attendance stats
2. **GoHighLevel:** Already connected — wire contact/lead counts into the dashboard
3. **Xero:** Set up OAuth 2.0 flow, connect, pull revenue/invoice data
4. **Meta Ads:** Get access token, connect, pull ad spend and ROAS data
5. **Dashboard page:** Replace placeholder stats with real API data from all integrations
6. **Delete the RIG section** — previously had a strength tracking feature that needs to be removed

## Design System
- Dark theme with custom `gym-*` color tokens
- Rounded cards (`rounded-xl`) with borders (`border-gym-border`)
- Clean, minimal UI — no unnecessary elements
- Mobile responsive grid layouts

## GitHub
- Repo: Check `git remote -v` for the remote URL
- Branch: main

## User Preferences
- Don't add UI elements or features beyond what was explicitly requested
- Show current CSS values and propose changes before making bulk visual edits
- Confirm Vercel project target and run pre-flight checks before deploying
- Use Chrome MCP to verify UI changes visually after making them
