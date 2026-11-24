# TNSI Compass — live demo

**A placement-desk operating console for [The Next Step International](https://www.tnsintl.com).**

This repository is the **serverless, public demo** of TNSI Compass. The full prototype uses an
Electron desktop agent plus an Express/SQLite API; this version keeps the console and replaces the
API with a small in-browser mock, so the whole product can be previewed from GitHub Pages with no
server, no database and no sign-up.

> **Live demo:** https://sushantadhkr.github.io/tnsintl-tracker/
>
> **Demo password:** `demo1234` — pick any account from the list below.

---

## What you can try

- **Overview** — who is on the clock, applications filed today, interviews booked, leads waiting,
  SLA performance and job-board activity across the desk.
- **Clients & applications** — 14 fictional job seekers, packages, target markets, weekly pace,
  per-client SLA, application ledger and an add-client flow.
- **Team** — consultant roster, live status, applications, leads and interview counts; open a
  consultant to see their activity record.
- **Live desk** — job-board visits, application events and policy blocks.
- **Reports** — a daily operating report with per-consultant breakdowns; the last 14 days are
  available from the date picker.
- **Browsing policy** — the approved job-board allowlist and desk hours, editable in the demo.
- **Devices** — registered desktop installations; revoke/restore works in the demo.
- **Audit log** — create a client or change a policy and the action appears here.

Everything you create is written to **`localStorage` in your browser** and survives a refresh.
It never leaves your device. Use **Reset demo data** in the sidebar to return to the seeded dataset.

## Demo accounts

| Account | Role | See |
|---|---|---|
| `aashika@tnsintl.com` | Super Admin · Operations Director | Everything |
| `suman@tnsintl.com` | Admin · Placement Manager | Desk operations, clients, policy |
| `prakriti@tnsintl.com` | Team Lead · Senior Consultant | Team + assigned clients |
| `nabin@tnsintl.com` | Employee · Career Consultant | Own desk view |
| `rojina@tnsintl.com` | Employee · Client Success Lead | Own desk view |
| `bibek@tnsintl.com` | Employee · Applications Specialist | Own desk view |
| `sabina@tnsintl.com` | Employee · Resume Strategist | Own desk view |
| `anish@tnsintl.com` | Employee · Quality Assurance | Own desk view |

All accounts use the password **`demo1234`**.

## How the serverless demo works

```
GitHub Pages (static files)
├── React console build          the same UI as the real prototype
├── public/demo-data.json        a snapshot exported from the seeded API
└── src/demo.ts                  fetch() → in-browser API → localStorage
```

- Vite is built with `VITE_DEMO=1`; that flag installs the adapter before React mounts.
- Every `/api/*` request is intercepted and answered from a snapshot seeded into localStorage.
- On first load the snapshot is shifted to the visitor's current day, so the desk always looks live.
- The demo reseeds automatically on a new calendar day; edits are local to that browser.
- GETs (overview, clients, applications, reports, live, policies, devices, audit) read the snapshot.
- POST/PATCH/DELETE calls (add client, file an application, add a policy, revoke a device) update the
  same in-browser store and the visible counts, then persist.
- Server-sent events (the live stream in the full product) are skipped in demo mode.

No API keys, no backend, no analytics. The static host only serves HTML, JS, CSS and the JSON snapshot.

## Install it as an app

The demo is a **PWA**, so it can be installed without an app store:

- **Chrome / Edge (desktop):** open the live URL, then use the install icon in the address bar or
  **Install demo app** in the sidebar. It opens in its own window and works offline after the first load.
- **Android:** Chrome menu → **Add to Home screen**.
- **iPhone / iPad:** Safari → Share → **Add to Home Screen**.

This gives you the console as an installable app. The **desktop tracking agent** (Electron) is part of
the full prototype and is not distributed from this public demo; a web page cannot observe or enforce
job-board browsing on a device.

## Run locally

```bash
npm install
npm run dev          # http://localhost:5173, demo adapter on
npm run build:demo   # static build under /tnsintl-tracker/
```

To build for a different base path, set `VITE_BASE`:

```bash
VITE_DEMO=1 VITE_BASE=/ npx vite build
```

## Deploy

The workflow at `.github/workflows/deploy.yml` runs on every push to `main`:

1. `npm ci`
2. `npm run build:demo` (`VITE_DEMO=1`, `VITE_BASE=/tnsintl-tracker/`)
3. upload `dist/` as a Pages artifact
4. deploy with `actions/deploy-pages`

In **Settings → Pages**, set **Source** to **GitHub Actions**. No secrets are required.

## Repository map

| Path | Purpose |
|---|---|
| `src/` | React 19 + TypeScript console, rebranded for TNSI |
| `src/demo.ts` | Static API, date shifting, localStorage persistence, install helpers |
| `public/demo-data.json` | Seeded snapshot: 14 clients, 8 staff, 5 devices, ~300 applications |
| `public/manifest.webmanifest` + `public/sw.js` | PWA install and offline shell |
| `.github/workflows/deploy.yml` | GitHub Pages build and deploy |

## Data, privacy and disclaimer

- **All client and employee records in this demo are fictional.** Names, emails, employers and
  activity are generated seed data. They do not represent real TNSI clients or staff.
- The demo stores data only in your browser's localStorage. Clearing site data resets it.
- This is an independent product prototype prepared for The Next Step International. It is not an
  official TNSI production system and is not affiliated with or endorsed by the company.
- Company facts used in the copy (Kathmandu headquarters, markets, contact details, package names)
  come from TNSI's public website, [tnsintl.com](https://www.tnsintl.com).
- The full prototype records only work-session and approved-domain activity; it does not capture
  keystrokes, screenshots, passwords or page contents. This static demo captures nothing at all.

## License

MIT — see [LICENSE](LICENSE).
