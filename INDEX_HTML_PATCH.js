// ══════════════════════════════════════════════════════════════
//  FootEdge PRO — index.html patch for Netlify deployment
//  Apply these two changes to index.html before uploading
// ══════════════════════════════════════════════════════════════

// ── CHANGE 1: SERVER_URL (around line 1307) ──────────────────
// FIND:
const SERVER_URL='http://localhost:8000';

// REPLACE WITH:
const SERVER_URL = (() => {
  // Local dev with python server.py
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    return 'http://localhost:8000';
  // Netlify production — use same origin (no cross-origin needed)
  return '';
})();


// ── CHANGE 2: detail endpoint URL in fetchMatchDetail() ──────
// FIND (in fetchMatchDetail function):
const r = await fetch(SERVER_URL + '/detail/' + eventId, ...

// REPLACE WITH:
const detailUrl = SERVER_URL
  ? SERVER_URL + '/detail/' + eventId
  : '/.netlify/functions/detail?id=' + eventId;
const r = await fetch(detailUrl, ...


// ── CHANGE 3: all fetch calls use relative paths on Netlify ──
// The existing fetchFixtures(), syncLiveResults() already try SERVER_URL first.
// On Netlify, SERVER_URL='' so they skip the server block and use:
//   - SofaScore CORS proxies (for fixtures)
//   - football-data.org fallback
//
// BUT: to get SofaScore data reliably ON Netlify (no TLS bypass needed —
// Netlify's egress IPs are not blocked), add this at the top of fetchFixtures():

// FIND the "Try server if configured" block:
if(SERVER_URL){
  try{
    const r=await fetch(SERVER_URL+'/fixtures', ...

// ADD BEFORE that block:
// ── Try Netlify function first (same-origin, no CORS issues) ──
try {
  const r = await fetch('/.netlify/functions/fixtures', { signal: AbortSignal.timeout(6000) });
  if (r.ok) {
    const d = await r.json();
    const list = (d.fixtures || []).filter(m => m.home && m.away &&
      !['finished','ended'].includes(m.status || ''));
    if (list.length > 0) {
      list.forEach(m => { if (m.oH && m.oD && m.oA) oddsCache[m.home+'|'+m.away] = {h:m.oH,d:m.oD,a:m.oA}; });
      window._src = 'SofaScore (Netlify)';
      return list;
    }
  }
} catch(e) {}


// ── CHANGE 4: syncLiveResults — add Netlify function path ──
// FIND:
if(SERVER_URL){
  try{
    const r=await fetch(SERVER_URL+'/results?days=7', ...

// ADD BEFORE (same pattern as above):
try {
  const r = await fetch('/.netlify/functions/results?days=7', { signal: AbortSignal.timeout(8000) });
  if (r.ok) { const d = await r.json(); results = d.results || []; }
} catch(e) {}
if (!results.length) {  // continue to existing SERVER_URL block


// ── CHANGE 5: fetchLiveScores — add Netlify function path ──
// FIND (in fetchLiveScores):
if(SERVER_URL){
  try{
    const r=await fetch(SERVER_URL+'/live', ...

// ADD BEFORE:
try {
  const r = await fetch('/.netlify/functions/live', { signal: AbortSignal.timeout(6000) });
  if (r.ok) { const d = await r.json(); /* use d.matches */ }
} catch(e) {}
