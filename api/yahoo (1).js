// api/yahoo.js — Vercel Serverless Function
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { type, symbol, range, interval } = req.query;
  let url = '';

  try {
    if (type === 'chart') {
      const sym = symbol.endsWith('.NS') ? symbol : symbol + '.NS';
      url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=${range||'1mo'}&interval=${interval||'1d'}`;
    } else if (type === 'quote') {
      const sym = symbol.endsWith('.NS') ? symbol : symbol + '.NS';
      url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=price,summaryDetail,financialData,defaultKeyStatistics,recommendationTrend`;
    } else if (type === 'equitylist') {
      url = `https://archives.nseindia.com/content/equities/EQUITY_L.csv`;
    } else {
      return res.status(400).json({ error: 'Invalid type' });
    }

    // Step 1: Get crumb and cookies from Yahoo Finance
    const cookieRes = await fetch('https://finance.yahoo.com', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    });
    const cookies = cookieRes.headers.get('set-cookie') || '';
    const cookieStr = cookies.split(',').map(c => c.split(';')[0]).join('; ');

    // Step 2: Get crumb
    let crumb = '';
    try {
      const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cookie': cookieStr,
        }
      });
      crumb = await crumbRes.text();
    } catch(e) {}

    // Step 3: Fetch actual data
    const finalUrl = crumb && type !== 'equitylist' ? `${url}&crumb=${encodeURIComponent(crumb)}` : url;

    const upstream = await fetch(finalUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://finance.yahoo.com',
        'Cookie': cookieStr,
      }
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Yahoo returned ${upstream.status}` });
    }

    if (type === 'equitylist') {
      const text = await upstream.text();
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(text);
    }

    const data = await upstream.json();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=60');
    return res.status(200).json(data);

  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
