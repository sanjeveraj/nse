// api/yahoo.js — Vercel Serverless Function (CommonJS format)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { type, symbol, range, interval } = req.query;

  let url = '';

  if (type === 'chart') {
    const yfSymbol = symbol.endsWith('.NS') ? symbol : symbol + '.NS';
    url = `https://query1.finance.yahoo.com/v8/finance/chart/${yfSymbol}?range=${range || '1mo'}&interval=${interval || '1d'}&includePrePost=false`;
  } else if (type === 'quote') {
    const yfSymbol = symbol.endsWith('.NS') ? symbol : symbol + '.NS';
    url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${yfSymbol}?modules=price,summaryDetail,financialData,defaultKeyStatistics,recommendationTrend`;
  } else if (type === 'equitylist') {
    url = `https://archives.nseindia.com/content/equities/EQUITY_L.csv`;
  } else {
    return res.status(400).json({ error: 'Invalid type' });
  }

  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://finance.yahoo.com',
        'Origin': 'https://finance.yahoo.com',
        'Cache-Control': 'no-cache',
      },
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Upstream error: ${upstream.status}` });
    }

    if (type === 'equitylist') {
      const text = await upstream.text();
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(200).send(text);
    }

    const data = await upstream.json();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=30');
    return res.status(200).json(data);

  } catch (err) {
    console.error('Proxy error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
