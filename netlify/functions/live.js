// ══════════════════════════════════════════════════════════════
//  FootEdge PRO — Netlify Function: /live
//  Returns live + today's scores from SofaScore
//  GET /.netlify/functions/live
// ══════════════════════════════════════════════════════════════

const {
  sofaGet, isAllowed, normComp, flagComp,
  fixTeam, jsonResp, optionsResp, todayStr,
} = require('./_shared');

// Live statuses — matches actively in play
const LIVE_STATUSES = new Set([
  'inprogress', '1st half', '2nd half', 'halftime',
  'extra time', 'penalties',
]);

exports.handler = async (event) => {
  const origin = event.headers?.origin || '';
  if (event.httpMethod === 'OPTIONS') return optionsResp(origin);
  if (event.httpMethod !== 'GET') return jsonResp({ error: 'Method not allowed' }, 405, origin);

  const today = todayStr();

  try {
    const res = await sofaGet(`/sport/football/scheduled-events/${today}`);
    if (!res) {
      return jsonResp({
        matches: [],
        liveCount: 0,
        fetched_at: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        source: 'sofascore',
      }, 503, origin);
    }

    const events  = (await res.json()).events || [];
    const matches = [];

    for (const ev of events) {
      if (!isAllowed(ev)) continue;

      const stat   = ev.status?.type || 'notstarted';
      const comp   = normComp(ev.tournament?.name || '');
      const home   = fixTeam(ev.homeTeam?.name || '');
      const away   = fixTeam(ev.awayTeam?.name || '');
      const ts     = ev.startTimestamp || 0;
      const time   = ts
        ? new Date(ts * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
        : '--:--';

      // Minute — prefer played time, fall back to status description
      const minute = ev.time?.played
        || ev.time?.periodLength
        || ev.status?.description
        || null;

      const hScore = ev.homeScore?.current ?? null;
      const aScore = ev.awayScore?.current ?? null;

      matches.push({
        id:       ev.id,
        comp,
        flag:     flagComp(comp),
        home,
        away,
        status:   stat,
        minute,
        hScore,
        aScore,
        score:    hScore != null ? `${hScore}–${aScore}` : '',
        time,
        ts,
      });
    }

    // Sort: live first, then by kick-off time
    matches.sort((a, b) => {
      const aLive = LIVE_STATUSES.has(a.status) ? 0 : 1;
      const bLive = LIVE_STATUSES.has(b.status) ? 0 : 1;
      if (aLive !== bLive) return aLive - bLive;
      return a.ts - b.ts;
    });

    const liveCount = matches.filter(m => LIVE_STATUSES.has(m.status)).length;

    return jsonResp({
      matches,
      liveCount,
      total:      matches.length,
      fetched_at: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      source:     'sofascore',
    }, 200, origin);

  } catch (err) {
    console.error('[live] error:', err.message);
    return jsonResp({ error: err.message, matches: [], liveCount: 0 }, 500, origin);
  }
};
