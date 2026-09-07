import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';

// ─── Usage tracking ────────────────────────────────────────────────────────────

const USAGE_FILE = path.join(process.cwd(), 'usage-log.json');
const MAX_ENTRIES = 2000;

// { claudeCalls: [...], requestCounts: { market, history, news } }
let usageStore = { claudeCalls: [], requestCounts: { market: 0, history: 0, news: 0 } };

try {
  if (fs.existsSync(USAGE_FILE)) {
    usageStore = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
    usageStore.requestCounts ??= { market: 0, history: 0, news: 0 };
  }
} catch (_) {}

function saveUsage() {
  try { fs.writeFileSync(USAGE_FILE, JSON.stringify(usageStore)); } catch (_) {}
}

function logClaudeCall({ symbol, model, inputTokens, outputTokens }) {
  const INPUT_PER_M  = 0.80;
  const OUTPUT_PER_M = 4.00;
  const costUSD = (inputTokens * INPUT_PER_M + outputTokens * OUTPUT_PER_M) / 1_000_000;
  usageStore.claudeCalls.push({
    ts: Date.now(),
    date: new Date().toISOString().slice(0, 10),
    symbol, model, inputTokens, outputTokens, costUSD,
  });
  if (usageStore.claudeCalls.length > MAX_ENTRIES)
    usageStore.claudeCalls = usageStore.claudeCalls.slice(-MAX_ENTRIES);
  saveUsage();
}

function incRequest(type) {
  usageStore.requestCounts[type] = (usageStore.requestCounts[type] || 0) + 1;
}

// ─── Shared utilities (used by all plugins) ────────────────────────────────────

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

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
    if (options.body) req.write(options.body);
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

// ─── Shared Yahoo Finance session (one session, all plugins) ───────────────────

const SESSION_FILE = path.join(process.cwd(), '.yf-session.json');

let yfSession = null;
let yfUnavailable = false;
let yfRetryAfter = 0;

// Load cached session from disk (survives server restarts)
try {
  if (fs.existsSync(SESSION_FILE)) {
    const cached = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    if (cached && cached.expiresAt && cached.expiresAt > Date.now() + 60_000) {
      yfSession = cached;
      console.log('[market] ✓ Loaded Yahoo Finance session from cache');
    }
  }
} catch (_) {}

async function initYFSession() {
  console.log('[market] Initialising Yahoo Finance session…');
  let cookies = '';

  try {
    const r = await nodeRequest('https://fc.yahoo.com', { headers: { Accept: 'text/html' } });
    cookies = mergeCookies(cookies, r.setCookies);
  } catch (_) { /* optional */ }

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
      if (r.status === 200 && crumb && crumb !== 'Too Many Requests' && crumb.length < 30) {
        const sess = { cookies, crumb, expiresAt: Date.now() + 55 * 60 * 1000 };
        console.log(`[market] ✓ Yahoo Finance session ready (crumb from ${host})`);
        try { fs.writeFileSync(SESSION_FILE, JSON.stringify(sess)); } catch (_) {}
        return sess;
      }
      console.warn(`[market] Crumb ${host} → HTTP ${r.status}: "${crumb.slice(0, 60)}"`);
    } catch (e) {
      console.warn(`[market] Crumb ${host} failed:`, e.message);
    }
  }

  throw new Error('Yahoo Finance crumb unavailable (rate limited or blocked)');
}

async function getYFSession() {
  if (yfSession && Date.now() < yfSession.expiresAt) return yfSession;
  if (yfUnavailable && Date.now() < yfRetryAfter) return null;
  try {
    yfSession = await initYFSession();
    yfUnavailable = false;
    return yfSession;
  } catch (e) {
    console.warn('[market] Yahoo Finance session failed, falling back to stooq:', e.message);
    yfUnavailable = true;
    yfRetryAfter = Date.now() + 10 * 60 * 1000;
    yfSession = null;
    return null;
  }
}

// ─── Yahoo Finance proxy plugin ────────────────────────────────────────────────
//
// Primary:  Yahoo Finance v7 quote API with cookie+crumb auth
// Fallback: stooq.com when Yahoo Finance returns 429 / auth errors
//
// Endpoints exposed to the React app:
//   GET /api/quotes?symbols=AAPL,MSFT,...   → { quoteResponse: { result: [...] } }
//   GET /api/health                          → { ok: true }

function yahooFinancePlugin() {

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
      incRequest('market');
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

  async function stockInfoHandler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const p      = new URL(req.url, 'http://localhost');
    const symbol = p.searchParams.get('symbol')?.trim().toUpperCase();
    if (!symbol) { res.writeHead(400); res.end(JSON.stringify({ error: 'symbol required' })); return; }

    const modules = 'assetProfile,financialData,recommendationTrend,defaultKeyStatistics';
    const WIN_UA  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

    async function fetchSummary(host, crumb = null, cookies = null) {
      const crumbParam = crumb ? `&crumb=${encodeURIComponent(crumb)}` : '';
      const r = await nodeRequest(
        `https://${host}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}${crumbParam}&lang=en-US&region=US&corsDomain=finance.yahoo.com`,
        { headers: { 'User-Agent': WIN_UA, Accept: 'application/json', Referer: 'https://finance.yahoo.com/', ...(cookies ? { Cookie: cookies } : {}) } },
      );
      if (r.status === 404) throw new Error(`Symbol "${symbol}" not found on Yahoo Finance.`);
      if (r.status !== 200) throw new Error(`Yahoo Finance returned HTTP ${r.status}`);
      const json   = JSON.parse(r.body);
      const result = json?.quoteSummary?.result?.[0];
      if (!result) throw new Error('No summary data returned.');
      return result;
    }

    try {
      let result;
      // Try query2 without auth first (works for some endpoints)
      try {
        result = await fetchSummary('query2.finance.yahoo.com');
      } catch (_) {
        // Fall back to authenticated query1
        const sess = await getYFSession();
        if (!sess) throw new Error('Yahoo Finance session unavailable — please wait a moment and try again.');
        result = await fetchSummary('query1.finance.yahoo.com', sess.crumb, sess.cookies);
      }

      const profile   = result.assetProfile         ?? {};
      const financial = result.financialData         ?? {};
      const stats     = result.defaultKeyStatistics  ?? {};
      const trend     = result.recommendationTrend?.trend?.[0] ?? {};

      const raw = v => (v && typeof v === 'object' ? v.raw : v) ?? null;

      const data = {
        symbol,
        company: {
          sector:      profile.sector              ?? null,
          industry:    profile.industry            ?? null,
          description: profile.longBusinessSummary ?? null,
          employees:   profile.fullTimeEmployees   ?? null,
          country:     profile.country             ?? null,
          website:     profile.website             ?? null,
        },
        analysts: {
          count:          raw(financial.numberOfAnalystOpinions),
          recommendation: financial.recommendationKey ?? null,
          score:          raw(financial.recommendationMean),
          targetLow:      raw(financial.targetLowPrice),
          targetHigh:     raw(financial.targetHighPrice),
          targetMean:     raw(financial.targetMeanPrice),
          targetMedian:   raw(financial.targetMedianPrice),
          revenueGrowth:  raw(financial.revenueGrowth),
          earningsGrowth: raw(financial.earningsGrowth),
        },
        sentiment: {
          strongBuy:  trend.strongBuy  ?? 0,
          buy:        trend.buy        ?? 0,
          hold:       trend.hold       ?? 0,
          sell:       trend.sell       ?? 0,
          strongSell: trend.strongSell ?? 0,
        },
        stats: {
          marketCap:    raw(stats.marketCap),
          trailingPE:   raw(stats.trailingPE),
          forwardPE:    raw(stats.forwardPE),
          beta:         raw(stats.beta),
          weekChange52: raw(stats['52WeekChange']),
          priceToBook:  raw(stats.priceToBook),
          dividend:     raw(stats.lastDividendValue),
        },
        aiInsight: null,
      };

      // Optional Claude AI insight
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (apiKey && data.company.description) {
        try {
          const prompt =
            `You are a concise financial analyst. Based on the following data for ${symbol}, write a brief investment insight (4-6 bullet points, plain English, no markdown headers).\n\n` +
            `Sector: ${data.company.sector} | Industry: ${data.company.industry}\n` +
            `Analyst consensus: ${data.analysts.recommendation ?? 'N/A'} (score ${data.analysts.score ?? '—'}/5, ${data.analysts.count ?? '?'} analysts)\n` +
            `Price target: $${data.analysts.targetLow ?? '?'} – $${data.analysts.targetHigh ?? '?'} (mean $${data.analysts.targetMean ?? '?'})\n` +
            `Revenue growth: ${data.analysts.revenueGrowth != null ? (data.analysts.revenueGrowth * 100).toFixed(1) + '%' : 'N/A'} | Earnings growth: ${data.analysts.earningsGrowth != null ? (data.analysts.earningsGrowth * 100).toFixed(1) + '%' : 'N/A'}\n` +
            `Beta: ${data.stats.beta ?? 'N/A'} | P/E: ${data.stats.trailingPE ?? 'N/A'} | Forward P/E: ${data.stats.forwardPE ?? 'N/A'}\n\n` +
            `Company: ${data.company.description?.slice(0, 400)}\n\n` +
            `Respond with ONLY a JSON array of 4-6 strings, each a concise insight bullet. No other text.`;

          const aiResp = await nodeRequest('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 600,
              messages: [{ role: 'user', content: prompt }],
            }),
          });

          if (aiResp.status === 200) {
            const parsed = JSON.parse(aiResp.body);
            const usage  = parsed.usage;
            if (usage) logClaudeCall({ symbol, model: 'claude-haiku-4-5-20251001', inputTokens: usage.input_tokens, outputTokens: usage.output_tokens });
            const text  = parsed.content?.[0]?.text ?? '';
            const match = text.match(/\[[\s\S]*\]/);
            if (match) data.aiInsight = JSON.parse(match[0]);
          }
        } catch (e) {
          console.warn('[stock-info] AI insight failed:', e.message);
        }
      }

      console.log(`[stock-info] ${symbol} — ${data.company.sector ?? 'unknown sector'}`);
      res.writeHead(200);
      res.end(JSON.stringify(data));
    } catch (err) {
      console.error('[stock-info]', err.message);
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  function addMiddleware(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url?.startsWith('/api/quotes'))     return quotesHandler(req, res);
      if (req.url?.startsWith('/api/health'))     return healthHandler(req, res);
      if (req.url?.startsWith('/api/stock-info')) return stockInfoHandler(req, res);
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

      const parsed = JSON.parse(resp.body);
      const usage  = parsed.usage;
      if (usage) logClaudeCall({ symbol, model: 'claude-haiku-4-5-20251001', inputTokens: usage.input_tokens, outputTokens: usage.output_tokens });

      const text = parsed.content?.[0]?.text ?? '';
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
      incRequest('news');

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

// ─── Historical OHLC plugin ────────────────────────────────────────────────────
//
// Endpoint:
//   GET /api/history?symbol=AAPL&from=2024-01-01&to=2024-12-31
//   → { symbol, from, to, data: [{ date, open, high, low, close, volume,
//                                   prevClose, gap, gapPct }] }
//
// Uses the shared Yahoo Finance session (cookies + crumb) established by
// yahooFinancePlugin so we don't create a second competing session.

function historyPlugin() {
  async function fetchHistory(symbol, from, to) {
    const p1 = Math.floor(new Date(from + 'T00:00:00Z').getTime() / 1000);
    const p2 = Math.floor(new Date(to   + 'T23:59:59Z').getTime() / 1000);

    // Try query2 first (no crumb needed), then fall back to authenticated query1
    const attempts = [
      {
        url: `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
             `?interval=1d&period1=${p1}&period2=${p2}&events=history`,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: 'https://finance.yahoo.com/',
          Origin: 'https://finance.yahoo.com',
        },
      },
    ];

    // Add authenticated attempt if session is available
    const sess = await getYFSession();
    if (sess) {
      attempts.push({
        url: `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
             `?interval=1d&period1=${p1}&period2=${p2}&crumb=${encodeURIComponent(sess.crumb)}&events=history`,
        headers: {
          Accept: 'application/json',
          Cookie: sess.cookies,
          Referer: 'https://finance.yahoo.com/',
        },
      });
    }

    let lastError = 'All data sources failed.';
    for (const attempt of attempts) {
      try {
        const r = await nodeRequest(attempt.url, { headers: attempt.headers });
        if (r.status === 404) throw new Error(`Symbol "${symbol}" not found.`);
        if (r.status !== 200) { lastError = `Yahoo Finance returned HTTP ${r.status}`; continue; }

        const json   = JSON.parse(r.body);
        const result = json?.chart?.result?.[0];
        if (!result) { lastError = 'No chart data returned — check symbol and date range.'; continue; }

        const timestamps = result.timestamp ?? [];
        const q          = result.indicators?.quote?.[0] ?? {};
        const rows = timestamps
          .map((ts, i) => {
            const open  = q.open?.[i];
            const close = q.close?.[i];
            if (open == null || close == null) return null;
            return {
              date:   new Date(ts * 1000).toISOString().slice(0, 10),
              open:   Math.round(open                * 100) / 100,
              high:   Math.round((q.high?.[i] ?? 0)  * 100) / 100,
              low:    Math.round((q.low?.[i]  ?? 0)  * 100) / 100,
              close:  Math.round(close               * 100) / 100,
              volume: q.volume?.[i] || 0,
            };
          })
          .filter(Boolean)
          .sort((a, b) => a.date.localeCompare(b.date));

        if (!rows.length) throw new Error('No trading data found for this symbol and date range.');

        const enriched = rows.map((r, i) => {
          const prevClose = i > 0 ? rows[i - 1].close : null;
          const gap       = prevClose !== null ? +(r.open - prevClose).toFixed(4) : null;
          const gapPct    = prevClose !== null ? +((r.open - prevClose) / prevClose * 100).toFixed(4) : null;
          return { ...r, prevClose, gap, gapPct };
        });

        console.log(`[history] Yahoo Finance: ${enriched.length} rows for ${symbol}`);
        return enriched.reverse();
      } catch (e) {
        if (e.message.includes('not found')) throw e;
        lastError = e.message;
      }
    }
    throw new Error(lastError);
  }

  async function historyHandler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const p      = new URL(req.url, 'http://localhost');
    const symbol = p.searchParams.get('symbol')?.trim().toUpperCase();
    const from   = p.searchParams.get('from');
    const to     = p.searchParams.get('to');

    if (!symbol || !from || !to) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'symbol, from, and to parameters are required' }));
      return;
    }

    try {
      const data = await fetchHistory(symbol, from, to);
      incRequest('history');
      res.writeHead(200);
      res.end(JSON.stringify({ symbol, from, to, data }));
    } catch (err) {
      console.error('[history]', err.message);
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  function addMiddleware(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url?.startsWith('/api/history')) return historyHandler(req, res);
      next();
    });
    server.httpServer?.once('listening', () => {
      console.log('[history] ✓ Stock history plugin ready (Yahoo Finance v8 chart)\n');
    });
  }

  return {
    name: 'history-proxy',
    configureServer(server)        { addMiddleware(server); },
    configurePreviewServer(server) { addMiddleware(server); },
  };
}

// ─── Usage API plugin ──────────────────────────────────────────────────────────
//
// Endpoints:
//   GET /api/usage        → full usage store
//   POST /api/usage/clear → reset all data

function usagePlugin() {
  function addMiddleware(server) {
    server.middlewares.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json');

      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

      if (req.url === '/api/usage' && req.method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify(usageStore));
        return;
      }
      if (req.url === '/api/usage/clear' && req.method === 'POST') {
        usageStore.claudeCalls = [];
        usageStore.requestCounts = { market: 0, history: 0, news: 0 };
        saveUsage();
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      next();
    });
  }
  return {
    name: 'usage-api',
    configureServer(server)        { addMiddleware(server); },
    configurePreviewServer(server) { addMiddleware(server); },
  };
}

// ─── X (Twitter) Feed plugin ──────────────────────────────────────────────────
//
// Endpoint:
//   GET /api/xfeed?symbol=AAPL&max=20
//   → { symbol, tweets: [...], hasToken: bool }
//
// Requires TWITTER_BEARER_TOKEN in environment.
// Without it the endpoint returns { hasToken: false, tweets: [] } so the
// frontend can still render the "Open on X" quick-link buttons.

function xFeedPlugin() {
  const BEARER = process.env.TWITTER_BEARER_TOKEN ?? '';

  async function xGet(path) {
    const r = await nodeRequest(`https://api.twitter.com${path}`, {
      headers: {
        Authorization: `Bearer ${BEARER}`,
        Accept: 'application/json',
      },
    });
    if (r.status !== 200) {
      const msg = (() => { try { return JSON.parse(r.body)?.detail ?? r.body.slice(0, 120); } catch { return r.body.slice(0, 120); } })();
      throw new Error(`Twitter API ${r.status}: ${msg}`);
    }
    return JSON.parse(r.body);
  }

  async function xFeedHandler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const p      = new URL(req.url, 'http://localhost');
    const symbol = p.searchParams.get('symbol')?.trim().toUpperCase() ?? '';
    const max    = Math.min(parseInt(p.searchParams.get('max') ?? '20', 10), 50);

    if (!symbol) { res.writeHead(400); res.end(JSON.stringify({ error: 'symbol required' })); return; }

    if (!BEARER) {
      res.writeHead(200);
      res.end(JSON.stringify({ symbol, hasToken: false, tweets: [] }));
      return;
    }

    try {
      const query  = encodeURIComponent(`$${symbol} -is:retweet lang:en`);
      const fields = 'created_at,text,public_metrics,author_id,entities';
      const expan  = 'author_id';
      const ufield = 'name,username,profile_image_url,verified,public_metrics';

      const data = await xGet(
        `/2/tweets/search/recent?query=${query}&max_results=${max}` +
        `&tweet.fields=${fields}&expansions=${expan}&user.fields=${ufield}`,
      );

      const usersById = {};
      for (const u of (data.includes?.users ?? [])) usersById[u.id] = u;

      const tweets = (data.data ?? []).map(t => ({
        id:        t.id,
        text:      t.text,
        createdAt: t.created_at,
        likes:     t.public_metrics?.like_count    ?? 0,
        retweets:  t.public_metrics?.retweet_count ?? 0,
        replies:   t.public_metrics?.reply_count   ?? 0,
        url:       `https://x.com/i/web/status/${t.id}`,
        author:    usersById[t.author_id] ? {
          name:     usersById[t.author_id].name,
          username: usersById[t.author_id].username,
          avatar:   usersById[t.author_id].profile_image_url,
          verified: usersById[t.author_id].verified ?? false,
          followers: usersById[t.author_id].public_metrics?.followers_count ?? 0,
          profileUrl: `https://x.com/${usersById[t.author_id].username}`,
        } : null,
      }));

      console.log(`[xfeed] ${symbol} — ${tweets.length} tweets`);
      res.writeHead(200);
      res.end(JSON.stringify({ symbol, hasToken: true, tweets }));
    } catch (err) {
      console.error('[xfeed]', err.message);
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  function addMiddleware(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url?.startsWith('/api/xfeed')) return xFeedHandler(req, res);
      next();
    });
    server.httpServer?.once('listening', () => {
      console.log(`[xfeed]  ✓ X Feed plugin ready (API: ${BEARER ? 'enabled' : 'disabled — set TWITTER_BEARER_TOKEN to enable'})\n`);
    });
  }

  return {
    name: 'xfeed-proxy',
    configureServer(server)        { addMiddleware(server); },
    configurePreviewServer(server) { addMiddleware(server); },
  };
}

// ─── News Analyzer plugin ─────────────────────────────────────────────────────
//
// Endpoint:
//   POST /api/analyze-news
//   Body JSON: { text?, imageBase64?, imageMediaType? }
//   → structured financial analysis JSON
//
// Requires ANTHROPIC_API_KEY. Without it returns { needsKey: true }.

function newsAnalyzerPlugin() {
  const SYSTEM_PROMPT = `You are an expert financial analyst specializing in stocks and options trading. Analyze the provided news/content and return a comprehensive JSON analysis.

Return ONLY a valid JSON object with this exact structure (no other text, no markdown):
{
  "summary": "2-3 sentence executive summary",
  "takeaways": ["takeaway 1", "takeaway 2", "takeaway 3"],
  "sentiment": {
    "label": "Bullish",
    "score": 72,
    "reasoning": "one sentence explaining the score"
  },
  "tickers": ["AAPL","NVDA"],
  "category": "Earnings",
  "timeHorizon": "Short-term (1-5 days)",
  "optionRecommendations": [
    {
      "action": "Buy Call",
      "ticker": "AAPL",
      "reasoning": "concise trade rationale",
      "risk": "Medium",
      "confidence": 65,
      "targetExpiry": "This Week",
      "targetStrike": "Slight OTM"
    }
  ],
  "stockRecommendations": [
    {
      "action": "Buy",
      "ticker": "AAPL",
      "reasoning": "concise rationale",
      "risk": "Low",
      "confidence": 70,
      "targetPrice": "above current levels",
      "stopLoss": "5% below entry"
    }
  ]
}

Rules:
- sentiment.label: "Bullish" | "Bearish" | "Neutral" | "Mixed"
- sentiment.score: 0 (very bearish) to 100 (very bullish), 50 = neutral
- category: "Earnings" | "Fed/Macro" | "Sector News" | "Technical" | "M&A" | "Political" | "Geopolitical" | "Product Launch" | "Analyst Note" | "Other"
- timeHorizon: "Same Day (0DTE)" | "Short-term (1-5 days)" | "Weekly" | "Monthly" | "Long-term"
- action (options): "Buy Call" | "Buy Put" | "Sell Call" | "Sell Put" | "Straddle" | "Strangle"
- action (stocks): "Buy" | "Sell" | "Short" | "Hold" | "Watch"
- risk: "Low" | "Medium" | "High" | "Extreme"
- targetExpiry: "Same Day" | "This Week" | "Next Week" | "Monthly"
- targetStrike: "ATM" | "Slight OTM" | "Deep OTM" | "ITM"
- takeaways: 3-5 items; optionRecommendations/stockRecommendations: 0-3 each (empty array if unclear)
- confidence: 0-100 (your confidence in THIS specific recommendation)`;

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  async function analyzeHandler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (req.method !== 'POST') { res.writeHead(405); res.end(JSON.stringify({ error: 'POST required' })); return; }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) { res.writeHead(200); res.end(JSON.stringify({ needsKey: true })); return; }

    try {
      const raw = await readBody(req);
      const payload = JSON.parse(raw);
      // Accept both new { images: [{base64, mediaType}] } and old single-image format for compat
      const text   = payload.text ?? '';
      const images = payload.images?.length
        ? payload.images
        : payload.imageBase64
          ? [{ base64: payload.imageBase64, mediaType: payload.imageMediaType ?? 'image/jpeg' }]
          : [];

      if (!text.trim() && !images.length) { res.writeHead(400); res.end(JSON.stringify({ error: 'text or images required' })); return; }

      const userContent = [];
      for (const img of images) {
        userContent.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType || 'image/jpeg', data: img.base64 } });
      }
      userContent.push({ type: 'text', text: (text || 'Analyze the image(s) above for financial implications.').slice(0, 10000) });

      const model = images.length ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';
      const aiResp = await nodeRequest('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 2000, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: userContent }] }),
      });

      if (aiResp.status !== 200) {
        const err = (() => { try { return JSON.parse(aiResp.body); } catch { return {}; } })();
        res.writeHead(aiResp.status);
        res.end(JSON.stringify({ error: err.error?.message ?? `API error ${aiResp.status}` }));
        return;
      }

      const parsed = JSON.parse(aiResp.body);
      if (parsed.usage) logClaudeCall({ symbol: 'news-analyzer', model, inputTokens: parsed.usage.input_tokens, outputTokens: parsed.usage.output_tokens });

      const txt = parsed.content?.[0]?.text ?? '';
      const match = txt.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Claude did not return valid JSON');
      const analysis = JSON.parse(match[0]);

      console.log(`[news-analyzer] analyzed — ${analysis.sentiment?.label} (${analysis.sentiment?.score}) tickers=${(analysis.tickers||[]).join(',') || 'none'}`);
      res.writeHead(200);
      res.end(JSON.stringify(analysis));
    } catch (err) {
      console.error('[news-analyzer]', err.message);
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  function addMiddleware(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url?.startsWith('/api/analyze-news')) return analyzeHandler(req, res);
      next();
    });
    server.httpServer?.once('listening', () => {
      console.log(`[news-analyzer] ✓ News Analyzer plugin ready (AI: ${process.env.ANTHROPIC_API_KEY ? 'enabled' : 'disabled — set ANTHROPIC_API_KEY to enable'})\n`);
    });
  }

  return {
    name: 'news-analyzer-proxy',
    configureServer(server)        { addMiddleware(server); },
    configurePreviewServer(server) { addMiddleware(server); },
  };
}

// ─── Vite config ───────────────────────────────────────────────────────────────

export default defineConfig(({ mode }) => {
  // Vite's loadEnv reads .env files but doesn't populate process.env for server
  // plugin code. Explicitly bridge the gap so all API keys are available in
  // configureServer middleware at request time.
  const env = loadEnv(mode, process.cwd(), '');
  process.env.ANTHROPIC_API_KEY    ??= env.ANTHROPIC_API_KEY;
  process.env.TWITTER_BEARER_TOKEN ??= env.TWITTER_BEARER_TOKEN;

  return {
    plugins: [react(), yahooFinancePlugin(), newsPlugin(), historyPlugin(), usagePlugin(), xFeedPlugin(), newsAnalyzerPlugin()],
  };
});
