// ══════════════════════════════════════════════════════════════
//  FootEdge PRO — Shared utilities for all Netlify Functions
// ══════════════════════════════════════════════════════════════

const BASE_URL = 'https://api.sofascore.com/api/v1';

const SOFA_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': 'https://www.sofascore.com/',
  'Origin': 'https://www.sofascore.com',
  'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site',
  'Cache-Control': 'no-cache',
};

// ── Fetch from SofaScore with retry ──
async function sofaGet(path, retries = 2) {
  const url = BASE_URL + path;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: SOFA_HEADERS,
        signal: AbortSignal.timeout(9000),
      });
      if (res.ok) return res;
      if (res.status === 429) {
        // Rate limited — wait before retry
        await sleep(1500 * (attempt + 1));
        continue;
      }
    } catch (e) {
      if (attempt === retries) throw e;
      await sleep(600 * (attempt + 1));
    }
  }
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Allowed competitions ──
const ALLOWED_DOMESTIC = new Set([
  'Premier League|England',
  'La Liga|Spain',
  'LaLiga|Spain',
  'Serie A|Italy',
  'Bundesliga|Germany',
  'Ligue 1|France',
  'Ligue 1 - Uber Eats|France',
]);

const UEFA_PREFIXES = [
  'UEFA Champions League',
  'UEFA Europa League',
  'UEFA Europa Conference League',
];

const FINISHED_STATUSES = new Set([
  'finished', 'ended', 'afterextratime', 'afterpenalties',
]);

function isAllowed(ev) {
  const t    = ev.tournament || {};
  const name = (t.name || '').trim();
  const cat  = (t.category?.name || '').trim();
  if (UEFA_PREFIXES.some(p => name.startsWith(p))) return true;
  return ALLOWED_DOMESTIC.has(`${name}|${cat}`);
}

function isFinished(ev) {
  return FINISHED_STATUSES.has(ev.status?.type || '');
}

function normComp(name) {
  if (!name) return name;
  if (name.startsWith('UEFA Champions League'))     return 'Champions League';
  if (name.startsWith('UEFA Europa Conference'))    return 'Conference League';
  if (name.startsWith('UEFA Europa League'))        return 'Europa League';
  if (name === 'LaLiga')                            return 'La Liga';
  if (name === 'Ligue 1 - Uber Eats')              return 'Ligue 1';
  return name;
}

const COMP_FLAGS = {
  'Premier League':   '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'La Liga':          '🇪🇸',
  'Serie A':          '🇮🇹',
  'Bundesliga':       '🇩🇪',
  'Ligue 1':          '🇫🇷',
  'Champions League': '🇪🇺',
  'Europa League':    '🇪🇺',
  'Conference League':'🇪🇺',
};

function flagComp(comp) { return COMP_FLAGS[comp] || '⚽'; }

// ── Team name normalisation — SofaScore → dataset names ──
const TEAM_FIX = {
  'FC Bayern München':         'Bayern Munich',
  'Bayern München':            'Bayern Munich',
  'FC Barcelona':              'Barcelona',
  'Atlético Madrid':           'Atletico Madrid',
  'Atlético de Madrid':        'Atletico Madrid',
  'FC Internazionale Milano':  'Internazionale',
  'Inter Milan':               'Internazionale',
  'Tottenham Hotspur FC':      'Tottenham Hotspur',
  'Manchester City FC':        'Manchester City',
  'Manchester United FC':      'Manchester United',
  'Arsenal FC':                'Arsenal',
  'Liverpool FC':              'Liverpool',
  'Chelsea FC':                'Chelsea',
  'Newcastle United FC':       'Newcastle United',
  'Nottingham Forest FC':      'Nottingham Forest',
  'West Ham United FC':        'West Ham United',
  'Wolverhampton Wanderers FC':'Wolverhampton Wanderers',
  'Paris Saint-Germain FC':    'Paris Saint-Germain',
  'Olympique de Marseille':    'Olympique Marseille',
  'FC Porto':                  'Porto',
  'SL Benfica':                'Benfica',
  'AFC Ajax':                  'Ajax',
  'Club Brugge KV':            'Club Brugge',
  'Celtic FC':                 'Celtic',
  'Rangers FC':                'Rangers',
  'Galatasaray SK':            'Galatasaray',
  'Fenerbahçe SK':             'Fenerbahce',
  'Beşiktaş JK':              'Besiktas',
  'FC Red Bull Salzburg':      'Red Bull Salzburg',
  'BSC Young Boys':            'Young Boys',
  'Crvena zvezda':             'Crvena Zvezda',
  'Red Star Belgrade':         'Crvena Zvezda',
  'Sporting Braga':            'SC Braga',
  'SC Freiburg':               'Freiburg',
  'VfL Wolfsburg':             'Wolfsburg',
  'VfB Stuttgart':             'Stuttgart',
  '1. FSV Mainz 05':           'Mainz',
  '1. FC Union Berlin':        'Union Berlin',
  'Bayer 04 Leverkusen':       'Bayer Leverkusen',
  'TSG 1899 Hoffenheim':       'Hoffenheim',
  'Holstein Kiel':             'Kiel',
  'FC St. Pauli':              'St. Pauli',
  'Girona FC':                 'Girona',
  'RC Celta de Vigo':          'Celta Vigo',
  'CA Osasuna':                'Osasuna',
  'RCD Mallorca':              'Mallorca',
  'Stade Brestois 29':         'Brest',
  'RC Lens':                   'Lens',
  'Stade Rennais FC':          'Rennes',
  'OGC Nice':                  'Nice',
  'RC Strasbourg Alsace':      'Strasbourg',
  'Stade de Reims':            'Reims',
  'FC Nantes':                 'Nantes',
  'AJ Auxerre':                'Auxerre',
  'Toulouse FC':               'Toulouse',
  'Hellas Verona':             'Verona',
  'Venezia FC':                'Venezia',
  'AC Monza':                  'Monza',
  'Como 1907':                 'Como',
  'Udinese Calcio':            'Udinese',
  'US Lecce':                  'Lecce',
  'Empoli FC':                 'Empoli',
  'Cagliari Calcio':           'Cagliari',
  'Bologna FC 1909':           'Bologna',
  'Torino FC':                 'Torino',
  'Genoa CFC':                 'Genoa',
  'ACF Fiorentina':            'Fiorentina',
  'Atalanta BC':               'Atalanta',
  'SS Lazio':                  'Lazio',
  'AS Roma':                   'Roma',
  'SSC Napoli':                'Napoli',
  'Juventus FC':               'Juventus',
  'Panathinaikos FC':          'Panathinaikos FC',
  'FC Midtjylland':            'FC Midtjylland',
  'KRC Genk':                  'KRC Genk',
};

function fixTeam(name) { return TEAM_FIX[name] || name; }

// ── Odds parser — handles decimal and fractional ──
function parseOdd(v) {
  try {
    const s = String(v);
    if (s.includes('/')) {
      const [a, b] = s.split('/');
      return Math.round((parseFloat(a) / parseFloat(b) + 1) * 100) / 100;
    }
    return Math.round(parseFloat(s) * 100) / 100;
  } catch { return 0; }
}

// ── SofaScore match page slug ──
function buildSlug(home, away, date) {
  const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `https://www.sofascore.com/${slug(home)}-${slug(away)}/${date}`;
}

// ── CORS headers — allow football-edge-pro.netlify.app + localhost ──
function corsHeaders(origin) {
  const allowed = [
    'https://football-edge-pro.netlify.app',
    'http://localhost:8000',
    'http://localhost:3000',
    'http://127.0.0.1:8000',
  ];
  const o = allowed.includes(origin) ? origin : 'https://football-edge-pro.netlify.app';
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function jsonResp(body, status = 200, origin = '*') {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(origin),
      'Cache-Control': status === 200 ? 'public, max-age=60, stale-while-revalidate=30' : 'no-store',
    },
    body: JSON.stringify(body),
  };
}

function optionsResp(origin) {
  return {
    statusCode: 204,
    headers: { ...corsHeaders(origin), 'Content-Length': '0' },
    body: '',
  };
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function dateStr(daysAgo) {
  return new Date(Date.now() - daysAgo * 864e5).toISOString().split('T')[0];
}

module.exports = {
  sofaGet, isAllowed, isFinished, normComp, flagComp,
  fixTeam, parseOdd, buildSlug,
  corsHeaders, jsonResp, optionsResp,
  todayStr, dateStr, FINISHED_STATUSES,
};
