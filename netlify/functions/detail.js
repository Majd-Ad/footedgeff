// ══════════════════════════════════════════════════════════════
//  FootEdge PRO — Netlify Function: /detail
//  Returns lineups, stats, incidents, missing players + weather
//  GET /.netlify/functions/detail?id=12345678
// ══════════════════════════════════════════════════════════════

const { sofaGet, jsonResp, optionsResp } = require('./_shared');

exports.handler = async (event) => {
  const origin = event.headers?.origin || '';
  if (event.httpMethod === 'OPTIONS') return optionsResp(origin);
  if (event.httpMethod !== 'GET') return jsonResp({ error: 'Method not allowed' }, 405, origin);

  const eventId = event.queryStringParameters?.id || event.path?.split('/').pop();
  if (!eventId || !/^\d+$/.test(String(eventId))) {
    return jsonResp({ error: 'Invalid or missing event id' }, 400, origin);
  }

  const id = parseInt(eventId, 10);

  try {
    // ── Fetch all detail endpoints in parallel ──
    const [lineupsRes, statsRes, incidentsRes, missingRes, eventRes] = await Promise.all([
      sofaGet(`/event/${id}/lineups`),
      sofaGet(`/event/${id}/statistics`),
      sofaGet(`/event/${id}/incidents`),
      sofaGet(`/event/${id}/missing-players`),
      sofaGet(`/event/${id}`),
    ]);

    const detail = { event_id: id };

    // ── Lineups ──
    if (lineupsRes) {
      const ld = await lineupsRes.json();
      const hp = ld.home?.players || [];
      const ap = ld.away?.players || [];
      detail.home_lineup    = parsePlayers(hp);
      detail.away_lineup    = parsePlayers(ap);
      detail.home_formation = ld.home?.formation || '';
      detail.away_formation = ld.away?.formation || '';
      detail.has_lineup     = !!(hp.length || ap.length);
    }

    // ── Match stats ──
    if (statsRes) {
      const sd = await statsRes.json();
      detail.match_stats = parseStats(sd.statistics || []);
    }

    // ── Incidents (goals, cards, subs) ──
    if (incidentsRes) {
      const ind = await incidentsRes.json();
      detail.incidents = parseIncidents(ind.incidents || []);
    }

    // ── Missing players ──
    if (missingRes) {
      const md = await missingRes.json();
      detail.missing_home = parseMissing(md.home || []);
      detail.missing_away = parseMissing(md.away || []);
    }

    // ── Event detail (venue + weather) ──
    if (eventRes) {
      const ed    = await eventRes.json();
      const ev    = ed.event || {};
      const venue = ev.venue || {};
      detail.venue    = venue.name || '';
      detail.city     = venue.city?.name || '';
      detail.capacity = venue.capacity || null;
      detail.pitch    = venue.pitchCondition || 'Unknown';

      // Try to get coordinates for weather
      const lat = venue.city?.lat || venue.lat || null;
      const lon = venue.city?.lon || venue.lon || null;

      if (lat && lon) {
        detail.weather = await fetchWeather(lat, lon);
      }
    }

    return jsonResp(detail, 200, origin);

  } catch (err) {
    console.error('[detail] error:', err.message);
    return jsonResp({ error: err.message, event_id: id }, 500, origin);
  }
};

// ── Weather from open-meteo (free, no key needed) ──
async function fetchWeather(lat, lon) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast`
      + `?latitude=${lat}&longitude=${lon}`
      + `&current=temperature_2m,weathercode,windspeed_10m,precipitation`
      + `&timezone=auto`;

    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;

    const data = await res.json();
    const cur  = data.current || {};
    const temp = cur.temperature_2m;
    const wind = cur.windspeed_10m;
    const rain = cur.precipitation;
    const code = cur.weathercode || 0;

    const issues = [];
    if (temp != null) {
      if (temp < 2)   issues.push('❄️ Freezing — expect slow play');
      else if (temp < 8)  issues.push('🥶 Cold — may affect passing');
      else if (temp > 30) issues.push('🥵 Hot — fatigue in 2nd half');
    }
    if (rain && rain > 2)  issues.push('🌧️ Rain — wet pitch, more errors');
    if (wind && wind > 30) issues.push('💨 Strong wind — affects long balls');

    const ICONS = {
      0:'☀️',1:'⛅',2:'⛅',3:'☁️',45:'🌫️',
      61:'🌧️',63:'🌧️',65:'🌧️',71:'❄️',80:'🌦️',95:'⛈️',
    };
    const DESCS = ['Clear', 'Mostly clear', 'Partly cloudy', 'Overcast'];

    return {
      temp,
      wind,
      rain,
      code,
      icon:   ICONS[code] || '🌤️',
      impact: issues.length ? issues.join(' · ') : '✅ Good conditions',
      desc:   code <= 3 ? DESCS[Math.min(code, 3)] : 'Cloudy',
    };
  } catch { return null; }
}

// ── Parsers ──
function parsePlayers(players) {
  return players.map(p => ({
    name:       p.player?.shortName || p.player?.name || '',
    number:     p.shirtNumber || '',
    pos:        p.position || '',
    rating:     p.statistics?.rating || null,
    substitute: p.substitute || false,
  }));
}

function parseStats(periods) {
  const out = {};
  for (const period of periods) {
    for (const group of period.groups || []) {
      for (const item of group.statisticsItems || []) {
        const k = item.key || (item.name || '').toLowerCase().replace(/\s+/g, '_');
        out[k] = { home: item.home, away: item.away, label: item.name || k };
      }
    }
  }
  return out;
}

function parseIncidents(incidents) {
  const ALLOWED = new Set(['goal', 'card', 'substitution']);
  return incidents
    .filter(inc => ALLOWED.has(inc.incidentType))
    .map(inc => ({
      type:   inc.incidentType,
      minute: inc.time || '',
      team:   inc.isHome ? 'home' : 'away',
      player: inc.player?.shortName || '',
      detail: inc.incidentClass || inc.goalType || '',
    }));
}

function parseMissing(players) {
  return players.map(p => ({
    name:   p.player?.shortName || p.player?.name || '',
    reason: p.type || '',
  }));
}
