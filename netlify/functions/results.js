// ══════════════════════════════════════════════════════════════
//  FootEdge PRO — Netlify Function: /results
//  Returns finished matches for self-learning result settling
//  GET /.netlify/functions/results?days=7
// ══════════════════════════════════════════════════════════════

const {
  sofaGet, isAllowed, isFinished, normComp,
  fixTeam, jsonResp, optionsResp,
  todayStr, dateStr, FINISHED_STATUSES,
} = require('./_shared');

exports.handler = async (event) => {
  const origin = event.headers?.origin || '';
  if (event.httpMethod === 'OPTIONS') return optionsResp(origin);
  if (event.httpMethod !== 'GET') return jsonResp({ error: 'Method not allowed' }, 405, origin);

  const days    = Math.min(30, Math.max(1, parseInt(event.queryStringParameters?.days || '7', 10)));
  const today   = todayStr();
  const results = [];

  try {
    // Fetch each day in parallel (max 8 concurrent to avoid rate limiting)
    const BATCH = 8;
    const offsets = Array.from({ length: days + 1 }, (_, i) => i); // 0 = today

    for (let i = 0; i < offsets.length; i += BATCH) {
      const batch = offsets.slice(i, i + BATCH);
      const dayResults = await Promise.all(batch.map(offset => fetchDay(offset)));
      dayResults.forEach(r => results.push(...r));
    }

    // Sort by date descending (most recent first)
    results.sort((a, b) => b.date.localeCompare(a.date));

    return jsonResp({
      results,
      total:      results.length,
      days,
      fetched_at: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      source:     'sofascore',
    }, 200, origin);

  } catch (err) {
    console.error('[results] error:', err.message);
    return jsonResp({ error: err.message, results: [], total: 0 }, 500, origin);
  }
};

async function fetchDay(daysAgo) {
  try {
    const date = dateStr(daysAgo);
    const res  = await sofaGet(`/sport/football/scheduled-events/${date}`);
    if (!res) return [];

    const events = (await res.json()).events || [];
    const out = [];

    for (const ev of events) {
      if (!isAllowed(ev)) continue;
      const stat = ev.status?.type || '';
      if (!FINISHED_STATUSES.has(stat)) continue;

      const hg = ev.homeScore?.current;
      const ag = ev.awayScore?.current;
      if (hg == null || ag == null) continue;

      const home = fixTeam(ev.homeTeam?.name || '');
      const away = fixTeam(ev.awayTeam?.name || '');
      const comp = normComp(ev.tournament?.name || '');
      const hgN  = parseInt(hg, 10);
      const agN  = parseInt(ag, 10);

      out.push({
        date,
        comp,
        home,
        away,
        hg:     hgN,
        ag:     agN,
        result: hgN > agN ? 'H' : agN > hgN ? 'A' : 'D',
        status: 'FINISHED',
      });
    }

    return out;
  } catch { return []; }
}
