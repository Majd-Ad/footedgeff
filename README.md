# ⚽ FootEdge PRO — Netlify Deployment

> Full SofaScore data pipeline running serverless on Netlify.  
> No Python. No local server. No Railway. Zero cold-start cost.

---

## What's in this package

```
footedge-netlify/
├── netlify.toml                    ← Build config + URL routing
├── netlify/
│   └── functions/
│       ├── _shared.js              ← Shared utilities (team names, odds parser, CORS)
│       ├── fixtures.js             ← GET /api/fixtures — today's matches + odds
│       ├── results.js              ← GET /api/results  — finished results (last N days)
│       ├── live.js                 ← GET /api/live     — live scores + minute
│       ├── detail.js               ← GET /api/detail?id=X — lineups, stats, weather
│       └── status.js               ← GET /api/status   — health check
└── INDEX_HTML_PATCH.js             ← Exact changes needed in index.html
```

---

## Deploy in 3 steps

### 1. Add the functions folder to your project root

Copy the `netlify/` folder and `netlify.toml` into the same folder as `index.html`:

```
your-project/
├── index.html          ← your existing app
├── netlify.toml        ← NEW
└── netlify/
    └── functions/
        ├── _shared.js  ← NEW
        ├── fixtures.js ← NEW
        ├── results.js  ← NEW
        ├── live.js     ← NEW
        ├── detail.js   ← NEW
        └── status.js   ← NEW
```

### 2. Patch index.html

Apply the 5 changes in `INDEX_HTML_PATCH.js`.  
The key change is adding Netlify function calls **before** the existing server/proxy fallbacks:

```js
// At the top of fetchFixtures():
try {
  const r = await fetch('/.netlify/functions/fixtures', { signal: AbortSignal.timeout(6000) });
  if (r.ok) {
    const d = await r.json();
    const list = (d.fixtures||[]).filter(m => m.home && m.away && !['finished','ended'].includes(m.status||''));
    if (list.length > 0) {
      list.forEach(m => { if (m.oH&&m.oD&&m.oA) oddsCache[m.home+'|'+m.away]={h:m.oH,d:m.oD,a:m.oA}; });
      window._src = 'SofaScore (Netlify)';
      return list;
    }
  }
} catch(e) {}
// ... existing SERVER_URL block continues below
```

Do the same pattern for `syncLiveResults` (→ `/results`) and `fetchLiveScores` (→ `/live`).

### 3. Push to GitHub → connect Netlify

1. Push everything to a GitHub repo
2. Go to [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import from Git**
3. Build settings are auto-detected from `netlify.toml` (publish: `.`, functions: `netlify/functions`)
4. Deploy — done ✅

---

## API endpoints

All endpoints support `GET` and return JSON with CORS headers.

| Endpoint | Description | Cache |
|----------|-------------|-------|
| `/api/fixtures` | Today's fixtures with 1X2 odds from SofaScore | 60s |
| `/api/results?days=7` | Finished matches (1–30 days) | 60s |
| `/api/live` | All of today's matches with live scores | 60s |
| `/api/detail?id=12345678` | Lineups, stats, incidents, weather | 60s |
| `/api/status` | Health check + SofaScore latency probe | — |

Legacy paths (`/fixtures`, `/results`, `/live`, `/detail/:id`, `/status`) also work — they redirect to the functions. This means your existing `SERVER_URL='http://localhost:8000'` flow just works on Netlify if you set `SERVER_URL` to your Netlify URL.

---

## How it compares to server.py

| Feature | `server.py` | Netlify Functions |
|---------|-------------|-------------------|
| Requires Python | ✅ Yes | ❌ No |
| Runs locally only | ✅ By default | ❌ Runs globally |
| tls_client bypass | ✅ Yes | ❌ Not needed (Netlify IPs unblocked) |
| In-memory cache | ✅ 60-min fixture cache | ⚡ 60s HTTP cache (CDN) |
| Background refresh | ✅ Every 60s thread | ⚡ On-demand per request |
| Cost | Free (your PC) | Free (Netlify generous tier: 125k req/month) |
| Parallel detail fetching | ❌ Sequential | ✅ All 5 calls in parallel |

---

## Local development

Use [Netlify CLI](https://docs.netlify.com/cli/get-started/) to run functions locally:

```bash
npm install -g netlify-cli
netlify dev
# Functions available at http://localhost:8888/.netlify/functions/
```

Or keep using `python server.py` for local dev — the patch detects `localhost` and falls back.

---

## SofaScore note

SofaScore's API is public but unofficial. Netlify's egress IPs are **not** on SofaScore's block list (unlike Vercel/Railway shared IP pools), so requests work without TLS fingerprint spoofing. If requests start failing, the existing CORS proxy fallbacks in `index.html` kick in automatically.

---

## Troubleshooting

**Functions return 503 "SofaScore unreachable"**  
→ SofaScore may be temporarily blocking Netlify's region. The browser will fall back to CORS proxies.

**No odds on fixtures**  
→ Odds are fetched per-match — SofaScore sometimes shows odds 30–60min before kick-off only.

**`detail?id=` returns empty lineups**  
→ Lineups are typically published 1h before kick-off by SofaScore.

**CORS errors in browser console**  
→ Make sure your Netlify site URL matches one of the allowed origins in `_shared.js`.  
Add your URL to the `allowed` array in `corsHeaders()`.
