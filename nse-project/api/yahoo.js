// api/yahoo.js  — Vercel Serverless Function
// Runs on SERVER — no CORS issues. Proxies Yahoo Finance to browser.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { type, symbol, range, interval } = req.query;
  if (!symbol && type !== 'equitylist') {
    return res.status(400).json({ error: 'symbol is required' });
  }

  const yfSymbol = symbol ? (symbol.endsWith('.NS') ? symbol : symbol + '.NS') : '';
  let url = '';

  if (type === 'chart') {
    url = `https://query1.finance.yahoo.com/v8/finance/chart/${yfSymbol}?range=${range||'1mo'}&interval=${interval||'1d'}&includePrePost=false`;
  } else if (type === 'quote') {
    url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${yfSymbol}?modules=price,summaryDetail,financialData,defaultKeyStatistics,recommendationTrend`;
  } else if (type === 'equitylist') {
    url = `https://archives.nseindia.com/content/equities/EQUITY_L.csv`;
  } else {
    return res.status(400).json({ error: 'type must be: chart | quote | equitylist' });
  }

  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://finance.yahoo.com',
        'Cache-Control': 'no-cache',
      },
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Upstream: ${upstream.status}` });
    }

    if (type === 'equitylist') {
      const text = await upstream.text();
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(text);
    }

    const data = await upstream.json();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=60'); // cache 60s on Vercel edge
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
