# VacancyIQ Demo — Hosting & Deployment

## 🔗 Live URL

**https://berto931.github.io/vacancyiq-demo/**

Share this link directly — it opens instantly on desktop and mobile. No download, login,
or password required.

---

## How it was deployed

The demo is a single, self-contained `index.html` file (≈146 KB) with all HTML, CSS, JavaScript,
and icons inline. It was deployed to **GitHub Pages** using the steps below.

### Deployment steps used

```bash
# 1. Create a deploy directory and copy the demo file
mkdir -p vacancyiq-site
cp VacancyIQ_Demo_2.html vacancyiq-site/index.html

# 2. Initialize a Git repo and commit
cd vacancyiq-site
git init
git add index.html
git commit -m "VacancyIQ Demo 2 — single-file static site"

# 3. Create a public GitHub repo and push
gh repo create vacancyiq-demo --public --source=. --push \
  --description "VacancyIQ product demo — interactive static site with synthetic data"

# 4. Enable GitHub Pages (legacy deploy from branch)
gh api repos/<YOUR_USERNAME>/vacancyiq-demo/pages -X POST --input - <<'EOF'
{"source":{"branch":"main","path":"/"},"build_type":"legacy"}
EOF

# 5. Wait ~60 seconds for the build, then verify
gh api repos/<YOUR_USERNAME>/vacancyiq-demo/pages/builds --jq '.[0].status'
# Should print: "built"

# 6. Verify the live site
curl -s -o /dev/null -w "%{http_code}" https://<YOUR_USERNAME>.github.io/vacancyiq-demo/
# Should print: 200
```

### What's hosted

| Item | Detail |
|---|---|
| **Host** | GitHub Pages (free, HTTPS, global CDN) |
| **Repo** | [berto931/vacancyiq-demo](https://github.com/berto931/vacancyiq-demo) |
| **File** | `index.html` — the primary deployed file (146 KB) |
| **URL** | https://berto931.github.io/vacancyiq-demo/ |
| **Build type** | Legacy (deploy from branch `main`, root `/`) |
| **HTTPS** | Enforced |

---

## AI Backend Deployment (Optional — for real API calls)

The `server/` directory contains a Node.js/Express backend that powers the AI Discovery,
Enrichment, Gmail, and Offer Generator features. When the backend is not running, the
frontend automatically falls back to inline simulations — the demo never renders blank.

### Deploy to Vercel

```bash
cd server

# Install Vercel CLI (if not already installed)
npm i -g vercel

# Create vercel.json
cat > vercel.json << 'EOF'
{
  "version": 2,
  "builds": [{ "src": "index.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "/index.js" }]
}
EOF

# Deploy
vercel --prod
```

### Deploy to Render

1. Push the `server/` directory to a separate GitHub repo (or use a monorepo path)
2. Create a new **Web Service** on render.com
3. Set **Build Command**: `npm install`
4. Set **Start Command**: `node index.js`
5. Set environment variable: `JWT_SECRET=<strong-random-secret>`

### Required Environment Variables

| Variable | Description | Default (demo only) |
|---|---|---|
| `JWT_SECRET` | JWT signing secret — **change in production** | `vacancyiq-demo-jwt-secret-not-for-production` |
| `PORT` | Server port | `3001` |

### Connecting the frontend

After deploying the backend, update `AI_BASE` in `index.html`:

```js
// Line ~973 in index.html — change null to your backend URL:
var AI_BASE = 'https://your-backend.vercel.app';
```

Then commit and push to re-deploy GitHub Pages.

### Available backend API routes

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/demo-token` | Issue demo JWT |
| GET | `/api/properties` | List discovered properties |
| DELETE | `/api/properties/stale` | Remove sold/stale listings |
| GET | `/api/discover?count=N` | Run simulated discovery |
| POST | `/api/enrich` | Contact enrichment (consent required) |
| POST | `/api/gmail/connect` | Simulate Gmail OAuth |
| POST | `/api/gmail/draft` | AI-draft outreach email |
| POST | `/api/gmail/send-approved` | Buyer-approved send |
| POST | `/api/generate-offer` | AI-generate offer letter |
| POST | `/api/approve-offer` | Buyer-approved offer |
| POST | `/api/jobs/run-daily` | Trigger daily discovery job |
| POST | `/api/jobs/run-weekly` | Trigger weekly cleanup job |
| GET | `/api/audit` | View redacted audit log |

### Backend tests

```bash
cd server
npm test
# Expected: 30/30 tests pass
```

---

## How to update the site

To publish a new version of the demo:

```bash
# 1. Replace index.html in the repo
cp /path/to/new/VacancyIQ_Demo.html index.html

# 2. Commit and push
git add index.html server/
git commit -m "Update demo"
git push origin main

# GitHub Pages rebuilds automatically — the new version is live in ~60 seconds.
```

Or upload directly on GitHub:
1. Go to https://github.com/berto931/vacancyiq-demo
2. Click `index.html` → pencil icon (Edit) or **Add file → Upload files**
3. Replace the file and commit — Pages rebuilds automatically.

---

## Verification results

All tests passed on the deployed site (2026-08-07, re-verified 2026-08-08):

| Test | Result |
|---|---|
| HTTP status | ✅ 200 |
| Content size | ✅ 146,208 bytes (full file served) |
| Content-Type | ✅ `text/html; charset=utf-8` |
| Demo disclosures | ✅ "DEMO · SIMULATED DATA" badge present |
| Mobile viewport | ✅ `<meta name="viewport">` tag present |
| Noscript fallback | ✅ Fallback message for JS-blocked environments |
| Mobile bottom tabs | ✅ `.apptabs` present (includes Discover tab) |
| FCRA/TCPA compliance | ✅ Compliance notices in the HTML |
| Responsive breakpoints | ✅ 960px and 620px media queries present |
| Hash routes | ✅ All return HTTP 200 |
| Backend unit tests | ✅ 30/30 pass |
| AI Discovery page | ✅ Renders with job controls, stats, property table |
| Outreach Center page | ✅ Renders with enrichment, Gmail, offer generator |
| Consent modals | ✅ Present before all sensitive actions |
| Approval gates | ✅ Required before email send or offer transmit |
| Redacted audit log | ✅ No credentials/PII written to log |

### Routes verified

- `#/` — Overview
- `#/spotter` — Spotter dashboard
- `#/spotter/capture` — New capture / deep search
- `#/spotter/submissions` — My submissions
- `#/spotter/earnings` — Earnings
- `#/buyer` — Buyer dashboard
- `#/buyer/leads` — Leads table (with filters, sorting, search)
- `#/buyer/leads/:id` — Lead detail (tabs, score, owner, comps, map)
- `#/buyer/automation` — Automation & data health
- `#/buyer/account` — Plans & pricing
- `#/buyer/discovery` — **AI Discovery** (new)
- `#/buyer/outreach` — **Outreach Center** (new)
- `#/account` — Account profile

---

## Why it works on any static host

- **One self-contained file** — all HTML, CSS, JavaScript, and the icon are inline. No external
  scripts, fonts, images, or network calls required for the frontend.
- **HTTPS-safe** — no `http://` resources, so no mixed-content warnings.
- **Mobile-ready** — has the viewport meta tag, so it fits phones correctly on first open.
- **Deep links work anywhere** — navigation uses URL hashes (`…/#/buyer/leads`), which are handled
  in the browser. No redirect/rewrite rules needed.
- **Named `index.html`** — hosts serve it automatically at the clean root URL.
- **Backend optional** — all AI features fall back to inline simulations when backend is offline.

---

## Alternative hosts (if you want to move it)

### Netlify Drop (fastest for one-off)
1. Go to **app.netlify.com/drop**
2. Drag `index.html` onto the page
3. Get a live `https://random-name.netlify.app/` URL in seconds

### Cloudflare Pages
1. Sign in at **pages.cloudflare.com** → *Create a project* → *Direct Upload*
2. Upload `index.html`
3. Get a `https://your-project.pages.dev/` URL

### Vercel
1. At **vercel.com**, create a project and upload the file (static, no framework)
2. Get a `https://your-project.vercel.app/` URL

**Custom domain:** every host above lets you attach your own domain (e.g. `demo.vacancyiq.com`).

---

## Reminder

This is a **demo with synthetic, simulated data** — the Google sign-in, Apple Pay, Gmail OAuth,
AI discovery, enrichment, and offer generator flows are all simulated. No real API calls are made,
no emails are sent, and pricing/payment/auth/data/legal items are labeled as assumptions or pending
validation. Hosting it does not make any integration real.


### Deployment steps used

```bash
# 1. Create a deploy directory and copy the demo file
mkdir -p vacancyiq-site
cp VacancyIQ_Demo_2.html vacancyiq-site/index.html

# 2. Initialize a Git repo and commit
cd vacancyiq-site
git init
git add index.html
git commit -m "VacancyIQ Demo 2 — single-file static site"

# 3. Create a public GitHub repo and push
gh repo create vacancyiq-demo --public --source=. --push \
  --description "VacancyIQ product demo — interactive static site with synthetic data"

# 4. Enable GitHub Pages (legacy deploy from branch)
gh api repos/<YOUR_USERNAME>/vacancyiq-demo/pages -X POST --input - <<'EOF'
{"source":{"branch":"main","path":"/"},"build_type":"legacy"}
EOF

# 5. Wait ~60 seconds for the build, then verify
gh api repos/<YOUR_USERNAME>/vacancyiq-demo/pages/builds --jq '.[0].status'
# Should print: "built"

# 6. Verify the live site
curl -s -o /dev/null -w "%{http_code}" https://<YOUR_USERNAME>.github.io/vacancyiq-demo/
# Should print: 200
```

### What's hosted

| Item | Detail |
|---|---|
| **Host** | GitHub Pages (free, HTTPS, global CDN) |
| **Repo** | [berto931/vacancyiq-demo](https://github.com/berto931/vacancyiq-demo) |
| **File** | `index.html` — the only file deployed |
| **URL** | https://berto931.github.io/vacancyiq-demo/ |
| **Build type** | Legacy (deploy from branch `main`, root `/`) |
| **HTTPS** | Enforced |

---

## How to update the site

To publish a new version of the demo:

```bash
# 1. Replace index.html in the repo
cp /path/to/new/VacancyIQ_Demo.html index.html

# 2. Commit and push
git add index.html
git commit -m "Update demo"
git push origin main

# GitHub Pages rebuilds automatically — the new version is live in ~60 seconds.
```

Or upload directly on GitHub:
1. Go to https://github.com/berto931/vacancyiq-demo
2. Click `index.html` → pencil icon (Edit) or **Add file → Upload files**
3. Replace the file and commit — Pages rebuilds automatically.

---

## Verification results

All tests passed on the deployed site (2026-08-07):

| Test | Result |
|---|---|
| HTTP status | ✅ 200 |
| Content size | ✅ 119,971 bytes (full file served) |
| Content-Type | ✅ `text/html; charset=utf-8` |
| Demo disclosures | ✅ "DEMO · SIMULATED DATA" badge present |
| Mobile viewport | ✅ `<meta name="viewport">` tag present |
| Noscript fallback | ✅ Fallback message for JS-blocked environments |
| Mobile bottom tabs | ✅ `.apptabs` present (7 references) |
| FCRA/TCPA compliance | ✅ 5 compliance notices in the HTML |
| Responsive breakpoints | ✅ 960px and 620px media queries present |
| Hash routes (10) | ✅ All return HTTP 200 |
| Deep links | ✅ `#/buyer/leads`, `#/spotter/capture`, `#/account` all work |

### Routes verified

- `#/` — Overview
- `#/spotter` — Spotter dashboard
- `#/spotter/capture` — New capture / deep search
- `#/spotter/submissions` — My submissions
- `#/spotter/earnings` — Earnings
- `#/buyer` — Buyer dashboard
- `#/buyer/leads` — Leads table (with filters, sorting, search)
- `#/buyer/leads/:id` — Lead detail (tabs, score, owner, comps, map)
- `#/buyer/automation` — Automation & data health
- `#/buyer/account` — Plans & pricing
- `#/account` — Account profile

---

## Why it works on any static host

- **One self-contained file** — all HTML, CSS, JavaScript, and the icon are inline. No external
  scripts, fonts, images, or network calls.
- **HTTPS-safe** — no `http://` resources, so no mixed-content warnings.
- **Mobile-ready** — has the viewport meta tag, so it fits phones correctly on first open.
- **Deep links work anywhere** — navigation uses URL hashes (`…/#/buyer/leads`), which are handled
  in the browser. No redirect/rewrite rules needed.
- **Named `index.html`** — hosts serve it automatically at the clean root URL.

---

## Alternative hosts (if you want to move it)

### Netlify Drop (fastest for one-off)
1. Go to **app.netlify.com/drop**
2. Drag `index.html` onto the page
3. Get a live `https://random-name.netlify.app/` URL in seconds

### Cloudflare Pages
1. Sign in at **pages.cloudflare.com** → *Create a project* → *Direct Upload*
2. Upload `index.html`
3. Get a `https://your-project.pages.dev/` URL

### Vercel
1. At **vercel.com**, create a project and upload the file (static, no framework)
2. Get a `https://your-project.vercel.app/` URL

**Custom domain:** every host above lets you attach your own domain (e.g. `demo.vacancyiq.com`).

---

## Reminder

This is a **demo with synthetic, simulated data** — the Google sign-in and Apple Pay flows are
simulated, and pricing/payment/auth/data/legal are labeled as assumptions. Hosting it does not make
any integration real.
