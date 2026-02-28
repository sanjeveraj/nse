// ============================================================
// FILE: api/proxy.js
// PURPOSE: Serverless proxy — fetches Yahoo Finance & NSE data
//          from Vercel's server. No CORS issues ever.
// DEPLOY:  Push to GitHub → Import in vercel.com → Done!
// ============================================================

export default async function handler(req, res) {
  // ── CORS headers ──────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' });

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing ?url= parameter' });

  // ── Security: only allow these domains ───────────────────
  const ALLOWED = [
    'query1.finance.yahoo.com',
    'query2.finance.yahoo.com',
    'archives.nseindia.com',
    'nsearchives.nseindia.com',
  ];
  const decoded = decodeURIComponent(url);
  const allowed = ALLOWED.some(d => decoded.includes(d));
  if (!allowed) return res.status(403).json({ error: 'Domain not allowed' });

  // ── Fetch from Yahoo Finance (server-side = no CORS) ─────
  try {
    const upstream = await fetch(decoded, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept':          'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer':         'https://finance.yahoo.com/',
        'Origin':          'https://finance.yahoo.com',
        'Cache-Control':   'no-cache',
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: `Yahoo Finance returned ${upstream.status}`
      });
    }

    const ct = upstream.headers.get('content-type') || '';

    if (ct.includes('json')) {
      const json = await upstream.json();
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      return res.status(200).json(json);
    } else {
      const text = await upstream.text();
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 's-maxage=3600');
      return res.status(200).send(text);
    }

  } catch (err) {
    console.error('[proxy] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
