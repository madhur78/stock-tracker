import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import https from 'https';
import http from 'http';

// ─── Yahoo Finance proxy plugin ────────────────────────────────────────────────
//
// Primary:  Yahoo Finance v7 quote API with cookie+crumb auth
// Fallback: stooq.com when Yahoo Finance returns 429 / auth errors
//
// Endpoints exposed to the React app:
//   GET /api/quotes?symbols=AAPL,MSFT,...   → { quoteResponse: { result: [...] } }
//   GET /api/health                          → { ok: true }

function yahooFinancePlugin() {
  const UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

  // Yahoo Finance session state (shared, refreshed when stale)
  let yfSession = null; // { cookies, crumb, expiresAt }
  let yfUnavailable = false; // true after confirmed failures, retry after 5 min
  let yfRetryAfter = 0;

  // ── Low-level HTTPS request with redirect following
  function nodeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const lib = parsedUrl.protocol === 'https:' ? https : http;
      const reqOptions = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers: {
          'User-Agent': UA,
          'Accept-Language': 'en-US,en;q=0.9',
          ...options.headers,
        },
      };

      const req = lib.request(reqOptions, (res) => {
        if (
          [301, 302, 303, 307, 308].includes(res.statusCode) &&
          res.headers.location &&
          (options.redirects ?? 0) < 5
        ) {
          const nextUrl = new URL(res.headers.location, url).toString();
          const newCookies = mergeCookies(options.cookieJar || '', res.headers['set-cookie'] || []);
          resolve(nodeRequest(nextUrl, { ...options, redirects: (options.redirects ?? 0) + 1, cookieJar: newCookies }));
          res.resume();
          return;
        }
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({
          status: res.statusCode,
          headers: res.headers,
          body,
          setCookies: res.headers['set-cookie'] || [],
        }));
      });

      req.on('error', reject);
      req.setTimeout(15_000, () => { req.destroy(); reject(new Error('Request timed out')); });
      req.end();
    });
  }

  function mergeCookies(existing, setCookieHeaders) {
    const jar = {};
    for (const part of existing.split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k) jar[k.trim()] = v.join('=').trim();
    }
    const SKIP = new Set(['path', 'domain', 'expires', 'max-age', 'samesite', 'secure', 'httponly']);
    for (const header of setCookieHeaders) {
      const [k, ...v] = header.split(';')[0].split('=');
      const name = k.trim();
      if (!SKIP.has(name.toLowerCase())) jar[name] = v.join('=').trim();
    }
    return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  // ── Establish Yahoo Finance session (cookies + crumb)
  async function initYFSession() {
    console.log('[market] Initialising Yahoo Finance session…');
    let cookies = '';

    try {
      const r = await nodeRequest('https://fc.yahoo.com', { headers: { Accept: 'text/html' } });
      cookies = mergeCookies(cookies, r.setCookies);
    } catch (_) { /* optional */ }

    try {
      const r = await nodeRequest('https://finance.yahoo.com/', {
        headers: { Accept: 'text/html,application/xhtml+xml', Cookie: cookies },
        cookieJar: cookies,
      });
      cookies = mergeCookies(cookies, r.setCookies);
    } catch (e) {
      console.warn('[market] finance.yahoo.com page fetch failed:', e.message);
    }

    for (const host of ['query2.finance.yahoo.com', 'query1.finance.yahoo.com']) {
      try {
        const r = await nodeRequest(`https://${host}/v1/test/getcrumb`, {
          headers: {
            Accept: 'text/plain, */*',
            Cookie: cookies,
            Referer: 'https://finance.yahoo.com/',
          },
        });
        cookies = mergeCookies(cookies, r.setCookies);
        const crumb = r.body.trim();
        if (r.status === 200 && crumb && crumb !== 'Too Many Requests') {
          console.log(`[market] ✓ Yahoo Finance session ready (crumb from ${host})`);
          return { cookies, crumb, expiresAt: Date.now() + 55 * 60 * 1000 };
        }
        console.warn(`[market] Crumb ${host} → HTTP ${r.status}: "${crumb.slice(0, 60)}"`);
      } catch (e) {
        console.warn(`[market] Crumb ${host} failed:`, e.message);
      }
    }

    throw new Error('Yahoo Finance crumb unavailable (rate limited or blocked)');
  }

  async function getYFSession() {
    if (yfUnavailable && Date.now() < yfRetryAfter) return null;
    if (yfSession && Date.now() < yfSession.expiresAt) return yfSession;
    try {
      yfSession = await initYFSession();
      yfUnavailable = false;
      return yfSession;
    } catch (e) {
      console.warn('[market] Yahoo Finance session failed, falling back to stooq:', e.message);
      yfUnavailable = true;
      yfRetryAfter = Date.now() + 5 * 60 * 1000; // retry in 5 min
      yfSession = null;
      return null;
    }
  }

  // ── Fetch a batch via Yahoo Finance v7 quote API
  async function fetchYFBatch(symbols, sess) {
    const url =
      'https://query1.finance.yahoo.com/v7/finance/quote' +
      `?symbols=${encodeURIComponent(symbols.join(','))}` +
      `&crumb=${encodeURIComponent(sess.crumb)}` +
      '&lang=en-US&region=US&corsDomain=finance.yahoo.com';

    const r = await nodeRequest(url, {
      headers: {
        Accept: 'application/json',
        Cookie: sess.cookies,
        Referer: 'https://finance.yahoo.com/',
      },
    });

    if (r.status === 401 || r.status === 403) {
      yfSession = null; // force session refresh next time
      return null; // signal fallback
    }
    if (r.status === 429) {
      yfUnavailable = true;
      yfRetryAfter = Date.now() + 5 * 60 * 1000;
      return null; // signal fallback
    }
    if (r.status !== 200) return null;

    const json = JSON.parse(r.body);
    return json?.quoteResponse?.result ?? [];
  }

  // ── stooq.com fallback ─────────────────────────────────────────────────────

  // Symbol mapping: Yahoo Finance format → stooq format
  const STOOQ_SYMBOL = {
    '^GSPC': '^spx', '^NDX': '^ndx', '^DJI': '^dji', '^VIX': null, '^RUT': null,
  };
  function toStooqSymbol(sym) {
    if (sym in STOOQ_SYMBOL) return STOOQ_SYMBOL[sym];
    return sym.replace('^', '').toLowerCase() + (sym.startsWith('^') ? '' : '.us');
  }

  async function fetchStooqOne(symbol) {
    const stooqSym = toStooqSymbol(symbol);
    if (!stooqSym) return null;

    try {
      const r = await nodeRequest(
        `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSym)}&f=sd2t2ohlcv&h&e=json`,
        { headers: { Accept: 'application/json' } },
      );
      if (r.status !== 200) return null;

      const json = JSON.parse(r.body);
      const q = json?.symbols?.[0];
      if (!q || !q.close) return null;

      const price = q.close;
      const open  = q.open ?? price;
      // stooq doesn't give previous close; use open as a proxy for intraday change
      const change    = price - open;
      const changePct = open ? (change / open) * 100 : 0;

      return {
        symbol,
        shortName: null, // filled by FALLBACK_NAMES in UI
        regularMarketPrice:           price,
        regularMarketChange:          change,
        regularMarketChangePercent:   changePct,
        regularMarketOpen:            q.open,
        regularMarketDayHigh:         q.high,
        regularMarketDayLow:          q.low,
        regularMarketPreviousClose:   null,
        regularMarketVolume:          q.volume,
        marketCap:                    null,
        fiftyTwoWeekHigh:             null,
        fiftyTwoWeekLow:              null,
        _source: 'stooq',
      };
    } catch (e) {
      console.warn(`[market] stooq ${symbol}:`, e.message);
      return null;
    }
  }

  // Global stooq semaphore — only 3 concurrent connections across all requests
  let stooqActive = 0;
  const stooqQueue = [];
  function stooqAcquire() {
    if (stooqActive < 3) { stooqActive++; return Promise.resolve(); }
    return new Promise(resolve => stooqQueue.push(resolve));
  }
  function stooqRelease() {
    if (stooqQueue.length) { stooqQueue.shift()(); }
    else { stooqActive--; }
  }

  async function fetchStooqOneLimited(symbol) {
    await stooqAcquire();
    try { return await fetchStooqOne(symbol); }
    finally { stooqRelease(); }
  }

  async function fetchStooqBatch(symbols) {
    const results = await Promise.all(symbols.map(fetchStooqOneLimited));
    return results.filter(Boolean);
  }

  // ── Main quotes handler ────────────────────────────────────────────────────

  async function fetchAllQuotes(symbols) {
    const BATCH = 20;

    // Try Yahoo Finance first
    const sess = await getYFSession();
    if (sess) {
      const results = [];
      let yfFailed = false;
      for (let i = 0; i < symbols.length; i += BATCH) {
        const slice = symbols.slice(i, i + BATCH);
        const batch = await fetchYFBatch(slice, sess);
        if (batch === null) { yfFailed = true; break; }
        results.push(...batch);
      }
      if (!yfFailed && results.length > 0) {
        console.log(`[market] Yahoo Finance: ${results.length}/${symbols.length} symbols`);
        return results;
      }
    }

    // Fallback to stooq
    console.log('[market] Falling back to stooq.com…');
    const results = await fetchStooqBatch(symbols);
    console.log(`[market] stooq: ${results.length}/${symbols.length} symbols`);

    if (results.length === 0) {
      throw new Error(
        'All data sources failed. Yahoo Finance is rate-limited and stooq returned no data. ' +
        'Please wait a minute and refresh.',
      );
    }

    return results;
  }

  // ── HTTP handlers for the middleware ──────────────────────────────────────

  async function quotesHandler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    try {
      const parsed  = new URL(req.url, 'http://localhost');
      const rawSyms = parsed.searchParams.get('symbols') || '';
      const symbols = rawSyms.split(',').map((s) => s.trim()).filter(Boolean);

      if (!symbols.length) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'symbols parameter is required' }));
        return;
      }

      const result = await fetchAllQuotes(symbols);
      res.writeHead(200);
      res.end(JSON.stringify({ quoteResponse: { result, error: null } }));
    } catch (err) {
      console.error('[market] Handler error:', err.message);
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  function healthHandler(_req, res) {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, source: 'yahoo-finance-v7+stooq-fallback' }));
  }

  function addMiddleware(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url?.startsWith('/api/quotes')) return quotesHandler(req, res);
      if (req.url?.startsWith('/api/health')) return healthHandler(req, res);
      next();
    });

    server.httpServer?.once('listening', () => {
      console.log('[market] ✓ Yahoo Finance plugin ready (Yahoo Finance v7 + stooq fallback)\n');
      getYFSession().catch(() => {});
    });
  }

  return {
    name: 'yahoo-finance-proxy',
    configureServer(server)        { addMiddleware(server); },
    configurePreviewServer(server) { addMiddleware(server); },
  };
}

// ─── News & Research plugin ────────────────────────────────────────────────────
//
// Endpoints exposed to the React app:
//   GET /api/news?symbol=AAPL   → { symbol, articles:[...], summary, lastUpdated }
//
// If ANTHROPIC_API_KEY env var is set the endpoint also returns an AI summary
// (key points, sentiment, analyst activity, outlook) via claude-haiku-4-5.

function newsPlugin() {
  const UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

  // ── Generic HTTPS GET (reused from quotes plugin pattern)
  function get(url, headers = {}) {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const req = https.request(
        { hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
          headers: { 'User-Agent': UA, ...headers } },
        (res) => {
          // follow one redirect
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
            res.resume();
            resolve(get(new URL(res.headers.location, url).toString(), headers));
            return;
          }
          let body = '';
          res.on('data', c => { body += c; });
          res.on('end', () => resolve({ status: res.statusCode, body }));
        },
      );
      req.on('error', reject);
      req.setTimeout(15_000, () => { req.destroy(); reject(new Error('timeout')); });
      req.end();
    });
  }

  // ── HTTPS POST (for Claude API)
  function post(url, body, headers = {}) {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const buf = Buffer.from(body, 'utf8');
      const req = https.request(
        { hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
          headers: { 'User-Agent': UA, 'Content-Length': buf.length, ...headers } },
        (res) => {
          let data = '';
          res.on('data', c => { data += c; });
          res.on('end', () => resolve({ status: res.statusCode, body: data }));
        },
      );
      req.on('error', reject);
      req.setTimeout(30_000, () => { req.destroy(); reject(new Error('timeout')); });
      req.write(buf);
      req.end();
    });
  }

  // ── Parse Seeking Alpha RSS (no external XML lib needed)
  function parseRSS(xml) {
    const items = [];
    const itemRx = /<item[^>]*>([\s\S]*?)<\/item>/g;
    let m;
    const txt = (block, tag) => {
      const r = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return r ? r[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
    };
    while ((m = itemRx.exec(xml)) !== null) {
      const b = m[1];
      const title   = txt(b, 'title');
      const link    = txt(b, 'link') || txt(b, 'guid');
      const pubDate = txt(b, 'pubDate');
      const author  = txt(b, 'sa:author_name') || txt(b, 'author') || txt(b, 'dc:creator');
      if (title) items.push({ title, link, pubDate, author });
    }
    return items;
  }

  // ── Tag an article based on its headline keywords
  function categorize(title) {
    const t = title.toLowerCase();
    if (/upgrade|downgrade|price target|raises pt|lowers pt|initiates|reiterates|overweight|underweight|outperform|underperform|buy rating|sell rating|hold rating|neutral|analyst/.test(t))
      return 'analyst';
    if (/earnings|revenue|eps|guidance|beat|miss|quarter|q[1-4]\s|results/.test(t))
      return 'earnings';
    if (/\bbullish\b|surge|soar|rally|jump|record high|all.time|strong buy|skyrocket/.test(t))
      return 'bullish';
    if (/\bbearish\b|\bfall\b|\bdrop\b|plunge|decline|warning|concern|\brisk\b|downside|sell-off/.test(t))
      return 'bearish';
    return 'news';
  }

  // ── Call Claude Haiku to summarise the headlines
  async function getAISummary(symbol, articles) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;

    const lines = articles.slice(0, 15)
      .map(a => `• ${a.title}`)
      .join('\n');

    const prompt =
      `You are a financial analyst. Analyse these recent news headlines for ${symbol} and respond ` +
      `ONLY with a JSON object — no markdown, no explanation, just raw JSON.\n\n` +
      `Headlines:\n${lines}\n\n` +
      `JSON schema:\n` +
      `{\n` +
      `  "sentiment": "Bullish|Bearish|Neutral|Mixed",\n` +
      `  "sentimentReason": "<one sentence>",\n` +
      `  "keyPoints": ["<3-4 plain-English bullet points>"],\n` +
      `  "analystActivity": ["<analyst upgrades/downgrades/targets mentioned, or empty array>"],\n` +
      `  "outlook": "<2-3 sentences on near-term outlook, plain English>",\n` +
      `  "keyThemes": ["<2-4 short theme labels>"\n` +
      `]\n` +
      `}`;

    try {
      const resp = await post(
        'https://api.anthropic.com/v1/messages',
        JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 900,
          messages: [{ role: 'user', content: prompt }],
        }),
        {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      );

      if (resp.status !== 200) {
        console.warn('[news] Claude API error:', resp.status, resp.body.slice(0, 120));
        return null;
      }

      const text = JSON.parse(resp.body).content?.[0]?.text ?? '';
      // Extract JSON object from the response (handles any stray markdown)
      const match = text.match(/\{[\s\S]*\}/);
      return match ? JSON.parse(match[0]) : null;
    } catch (e) {
      console.warn('[news] AI summary failed:', e.message);
      return null;
    }
  }

  // ── Seeking Alpha uses plain tickers; normalise ^ index symbols
  function toSASymbol(sym) {
    const map = { '^GSPC': 'SPX', '^NDX': 'NDX', '^DJI': 'DJI', '^VIX': 'VIX', '^RUT': 'RUT' };
    return map[sym] ?? sym.replace(/^\^/, '');
  }

  // ── Main news handler
  async function newsHandler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const parsed = new URL(req.url, 'http://localhost');
    const rawSym = parsed.searchParams.get('symbol') ?? '';
    const symbol = rawSym.trim().toUpperCase();

    if (!symbol) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'symbol parameter is required' }));
      return;
    }

    try {
      const saSym = toSASymbol(symbol);
      const rss = await get(
        `https://seekingalpha.com/api/sa/combined/${encodeURIComponent(saSym)}.xml`,
        { Accept: 'application/xml, text/xml' },
      );

      if (rss.status !== 200) throw new Error(`Seeking Alpha returned HTTP ${rss.status}`);

      const rawItems = parseRSS(rss.body);
      if (rawItems.length === 0) throw new Error(`No news found for ${symbol}`);

      const articles = rawItems.slice(0, 25).map(a => ({ ...a, category: categorize(a.title) }));
      const summary  = await getAISummary(symbol, articles);

      res.writeHead(200);
      res.end(JSON.stringify({ symbol, articles, summary, lastUpdated: new Date().toISOString() }));
    } catch (err) {
      console.error('[news]', err.message);
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  function addMiddleware(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url?.startsWith('/api/news')) return newsHandler(req, res);
      next();
    });
    server.httpServer?.once('listening', () => {
      const hasKey = !!process.env.ANTHROPIC_API_KEY;
      console.log(`[news]  ✓ News plugin ready (AI summaries: ${hasKey ? 'enabled' : 'disabled — set ANTHROPIC_API_KEY to enable'})\n`);
    });
  }

  return {
    name: 'news-proxy',
    configureServer(server)        { addMiddleware(server); },
    configurePreviewServer(server) { addMiddleware(server); },
  };
}

// ─── Vite config ───────────────────────────────────────────────────────────────

export default defineConfig({
  plugins: [react(), yahooFinancePlugin(), newsPlugin()],
});
