// ══════════════════════════════════════════════════════════════
//  FootEdge PRO — Netlify Function: /status
//  Health check + SofaScore connectivity probe
//  GET /.netlify/functions/status
// ══════════════════════════════════════════════════════════════

const { sofaGet, jsonResp, optionsResp, todayStr } = require('./_shared');

exports.handler = async (event) => {
  const origin = event.headers?.origin || '';
  if (event.httpMethod === 'OPTIONS') return optionsResp(origin);
  if (event.httpMethod !== 'GET') return jsonResp({ error: 'Method not allowed' }, 405, origin);

  const t0    = Date.now();
  const today = todayStr();

  // Quick probe to SofaScore — just fetch the date header, no body needed
  let sofaOk      = false;
  let sofaLatency = null;

  try {
    const t1  = Date.now();
    const res = await sofaGet(`/sport/football/scheduled-events/${today}`);
    sofaLatency = Date.now() - t1;
    sofaOk = !!res;
  } catch { /* probe failed */ }

  return jsonResp({
    ok:          true,
    version:     '2.0.0',
    runtime:     'Netlify Functions (Node.js)',
    region:      process.env.AWS_REGION || 'unknown',
    sofa_ok:     sofaOk,
    sofa_ms:     sofaLatency,
    date:        today,
    uptime_ms:   Date.now() - t0,
    ts:          new Date().toISOString(),
  }, 200, origin);
};
