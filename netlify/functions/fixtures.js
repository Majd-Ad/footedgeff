// ══════════════════════════════════════════════════════════════
//  FootEdge PRO — Netlify Function: /fixtures
//  Returns today's allowed fixtures with SofaScore odds
//  GET /.netlify/functions/fixtures
// ══════════════════════════════════════════════════════════════

const {
  sofaGet, isAllowed, isFinished, normComp, flagComp,
  fixTeam, parseOdd, buildSlug,
  jsonResp, optionsResp, todayStr,
} = require('./_shared');

exports.handler = async (event) => {
  const origin = event.headers?.origin || '';
  if (event.httpMethod === 'OPTIONS') return optionsResp(origin);
  if (event.httpMethod !== 'GET') return jsonResp({ error: 'Method not allowed' }, 405, origin);

  const today = todayStr();

  try {
    // ── 1. Fetch today's schedule ──
    const schedRes = await sofaGet(`/sport/football/scheduled-events/${today}`);
    if (!schedRes) {
      return jsonResp({ error: 'SofaScore unreachable', fixtures: [], total: 0, date: today }, 503, origin);
    }

    const allEvents = (await schedRes.json()).events || [];
    const allowed   = allEvents.filter(ev => isAllowed(ev) && !isFinished(ev));

    // ── 2. Fetch odds for each fixture (with concurrency limit) ──
    const fixtures = [];
    const CONCURRENCY = 4;

    for (let i = 0; i < allowed.length; i += CONCURRENCY) {
      const batch = allowed.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map(ev => fetchFixture(ev, today)));
      fixtures.push(...results.filter(Boolean));
    }

    return jsonResp({
      fixtures,
      date:       today,
      total:      fixtures.length,
      withOdds:   fixtures.filter(f => f.oH > 0).length,
      fetched_at: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      source:     'sofascore',
    }, 200, origin);

  } catch (err) {
    console.error('[fixtures] error:', err.message);
    return jsonResp({ error: err.message, fixtures: [], total: 0, date: today }, 500, origin);
  }
};

// ── Build a single fixture object with odds ──
async function fetchFixture(ev, today) {
  try {
    const eid  = ev.id;
    const comp = normComp(ev.tournament?.name || '');
    const home = fixTeam(ev.homeTeam?.name || '');
    const away = fixTeam(ev.awayTeam?.name || '');
    const ts   = ev.startTimestamp || 0;
    const time = ts
      ? new Date(ts * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
      : '--:--';
    const stat = ev.status?.type || 'notstarted';

    let oH = 0, oD = 0, oA = 0;

    // Try primary odds endpoint
    const oddsRes = await sofaGet(`/event/${eid}/odds/1/all/0/x`);
    if (oddsRes) {
      const oddsData = await oddsRes.json();
      ({ oH, oD, oA } = extractOdds(oddsData));
    }

    // Fallback odds endpoint
    if (oH === 0) {
      const odds2 = await sofaGet(`/event/${eid}/odds/1`);
      if (odds2) {
        const data2 = await odds2.json();
        ({ oH, oD, oA } = extractOdds(data2));
      }
    }

    return {
      id:       eid,
      comp,
      flag:     flagComp(comp),
      time,
      home,
      away,
      status:   stat,
      score:    '',
      oH,
      oD,
      oA,
      sofaSlug: buildSlug(home, away, today),
    };
  } catch { return null; }
}

// ── Extract 1X2 odds from SofaScore response ──
function extractOdds(data) {
  // Format A: { markets: [ { marketName, choices } ] }
  for (const mkt of data.markets || []) {
    const name = mkt.marketName || mkt.name || '';
    const choices = mkt.choices || [];
    if (choices.length === 3 && (name.includes('1X2') || name.includes('Match Winner'))) {
      const vals = choices.slice(0, 3).map(c =>
        parseOdd(c.fractionalValue || c.initialFractionalValue || c.decimalValue)
      );
      if (vals.every(v => v > 1)) return { oH: vals[0], oD: vals[1], oA: vals[2] };
    }
  }
  // Format B: { odds: [ { odds: [h, d, a] } ] }
  for (const blk of data.odds || []) {
    const raw = blk.odds || [];
    if (raw.length === 3) {
      const vals = raw.map(parseOdd);
      if (vals.every(v => v > 1)) return { oH: vals[0], oD: vals[1], oA: vals[2] };
    }
  }
  return { oH: 0, oD: 0, oA: 0 };
}
