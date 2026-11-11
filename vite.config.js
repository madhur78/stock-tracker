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

  // ── Yahoo Finance v8 chart fallback (no crumb needed, works from cloud IPs) ──

  async function fetchChartQuote(symbol) {
    try {
      const r = await nodeRequest(
        `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`,
        { headers: { Accept: 'application/json' } },
      );
      if (r.status !== 200) return null;

      const m = JSON.parse(r.body)?.chart?.result?.[0]?.meta;
      if (!m?.regularMarketPrice) return null;

      const price     = m.regularMarketPrice;
      const prevClose = m.chartPreviousClose ?? m.previousClose ?? null;
      const change    = prevClose ? price - prevClose : 0;

      return {
        symbol,
        shortName: m.shortName ?? m.longName ?? null,
        regularMarketPrice:           price,
        regularMarketChange:          change,
        regularMarketChangePercent:   prevClose ? (change / prevClose) * 100 : 0,
        regularMarketOpen:            null,
        regularMarketDayHigh:         m.regularMarketDayHigh ?? null,
        regularMarketDayLow:          m.regularMarketDayLow ?? null,
        regularMarketPreviousClose:   prevClose,
        regularMarketVolume:          m.regularMarketVolume ?? null,
        marketCap:                    null,
        fiftyTwoWeekHigh:             m.fiftyTwoWeekHigh ?? null,
        fiftyTwoWeekLow:              m.fiftyTwoWeekLow ?? null,
        _source: 'yahoo-chart',
      };
    } catch (e) {
      console.warn(`[market] chart ${symbol}:`, e.message);
      return null;
    }
  }

  async function fetchChartBatch(symbols) {
    const results = [];
    for (let i = 0; i < symbols.length; i += 5) {
      results.push(...await Promise.all(symbols.slice(i, i + 5).map(fetchChartQuote)));
    }
    return results.filter(Boolean);
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

    // Fallback to the crumb-less chart API
    const chartResults = await fetchChartBatch(symbols);
    if (chartResults.length > 0) {
      console.log(`[market] Yahoo chart fallback: ${chartResults.length}/${symbols.length} symbols`);
      return chartResults;
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

  async function earningsHandler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const p      = new URL(req.url, 'http://localhost');
    const symbol = p.searchParams.get('symbol')?.trim().toUpperCase();
    if (!symbol) { res.writeHead(400); res.end(JSON.stringify({ error: 'symbol required' })); return; }

    // earningsTrend provides forward revenue/EPS estimates; may cover the most-recently-reported quarter
    const modules = 'earningsHistory,calendarEvents,earnings,earningsTrend';
    const WIN_UA  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

    async function fetchSummary(host, crumb = null, cookies = null) {
      const crumbParam = crumb ? `&crumb=${encodeURIComponent(crumb)}` : '';
      const r = await nodeRequest(
        `https://${host}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}${crumbParam}&lang=en-US&region=US`,
        { headers: { 'User-Agent': WIN_UA, Accept: 'application/json', Referer: 'https://finance.yahoo.com/', ...(cookies ? { Cookie: cookies } : {}) } },
      );
      if (r.status === 404) throw new Error(`Symbol "${symbol}" not found.`);
      if (r.status !== 200) throw new Error(`Yahoo Finance returned HTTP ${r.status}`);
      const json   = JSON.parse(r.body);
      const result = json?.quoteSummary?.result?.[0];
      if (!result) throw new Error('No earnings data returned.');
      return result;
    }

    // Chart API returns actual earnings announcement dates in events.earnings[ts].dateFmt
    async function fetchChartEvents(host, crumb = null, cookies = null) {
      const crumbParam = crumb ? `&crumb=${encodeURIComponent(crumb)}` : '';
      try {
        const r = await nodeRequest(
          `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=3mo&events=earnings${crumbParam}`,
          { headers: { 'User-Agent': WIN_UA, Accept: 'application/json', Referer: 'https://finance.yahoo.com/', ...(cookies ? { Cookie: cookies } : {}) } },
        );
        if (r.status !== 200) return null;
        const json = JSON.parse(r.body);
        return json?.chart?.result?.[0]?.events?.earnings ?? null;
      } catch { return null; }
    }

    try {
      let result, chartEvents;
      try {
        [result, chartEvents] = await Promise.all([
          fetchSummary('query2.finance.yahoo.com'),
          fetchChartEvents('query2.finance.yahoo.com'),
        ]);
      } catch (_) {
        const sess = await getYFSession();
        if (!sess) throw new Error('Yahoo Finance session unavailable.');
        [result, chartEvents] = await Promise.all([
          fetchSummary('query1.finance.yahoo.com', sess.crumb, sess.cookies),
          fetchChartEvents('query1.finance.yahoo.com', sess.crumb, sess.cookies),
        ]);
      }

      const raw = v => (v && typeof v === 'object' ? v.raw : v) ?? null;

      // Revenue actuals: earnings.financialsChart.quarterly keyed by period label (e.g. "4Q2023")
      const revenueActualMap = {};
      (result.earnings?.financialsChart?.quarterly ?? []).forEach(q => {
        if (q.date) revenueActualMap[q.date] = raw(q.revenue);
      });

      // Revenue + EPS estimates from earningsTrend, keyed by quarter-end date string (endDate)
      // earningsTrend has periods like "0q", "+1q", "-1q" with endDate = quarter end date
      const trendByEndDate = {};
      (result.earningsTrend?.trend ?? []).forEach(t => {
        if (t.endDate) {
          trendByEndDate[t.endDate] = {
            revenueEstimate: raw(t.revenueEstimate?.avg),
            epsEstimate:     raw(t.earningsEstimate?.avg),
          };
        }
      });

      // EPS estimates from earnings.earningsChart.quarterly (historical EPS estimates stored)
      const epsEstChartMap = {};
      (result.earnings?.earningsChart?.quarterly ?? []).forEach(q => {
        if (q.date) epsEstChartMap[q.date] = raw(q.estimate);
      });

      // Chart events keyed by timestamp — use dateFmt for actual announcement date
      const chartEventsList = chartEvents ? Object.values(chartEvents) : [];

      const history = (result.earningsHistory?.history ?? [])
        .slice(-4)
        .map(h => {
          const quarterTs = raw(h.quarter); // fiscal quarter end Unix timestamp
          const quarterDate = quarterTs ? new Date(quarterTs * 1000).toISOString().slice(0, 10) : null;

          // Find the chart earnings event closest in time to this quarter end (within 90 days)
          let bestEv = null;
          if (quarterTs && chartEventsList.length) {
            const quarterMs = quarterTs * 1000;
            let minDiff = Infinity;
            chartEventsList.forEach(ev => {
              const diff = Math.abs(ev.date * 1000 - quarterMs);
              if (diff < minDiff && diff < 90 * 24 * 3600 * 1000) {
                minDiff = diff;
                bestEv = ev;
              }
            });
          }

          const period      = bestEv?.period ?? h.period ?? null;
          const reportDate  = bestEv?.dateFmt ?? null;
          const revenueActual  = period ? (revenueActualMap[period] ?? null) : null;

          // Try to find revenue estimate: match trend by quarter endDate
          const trendEntry     = quarterDate ? trendByEndDate[quarterDate] : null;
          const revenueEstimate = trendEntry?.revenueEstimate ?? null;

          // EPS estimate: prefer earningsHistory (analyst consensus before report),
          // then earningsChart stored estimate, then trend
          const epsEstimate = raw(h.epsEstimate)
            ?? (period ? epsEstChartMap[period] : null)
            ?? trendEntry?.epsEstimate
            ?? null;

          return {
            period,
            reportDate,
            epsEstimate,
            epsActual:       raw(h.epsActual),
            epsDifference:   raw(h.epsDifference),
            surprisePct:     raw(h.surprisePercent),
            revenueEstimate,
            revenueActual,
          };
        })
        .reverse(); // most recent first

      const nextTs = result.calendarEvents?.earnings?.earningsDate?.[0];
      const nextDate = nextTs ? new Date(raw(nextTs) * 1000).toISOString().slice(0, 10) : null;

      console.log(`[earnings] ${symbol} — ${history.length} quarters, next: ${nextDate ?? 'unknown'}`);
      res.writeHead(200);
      res.end(JSON.stringify({ symbol, history, nextDate }));
    } catch (err) {
      console.error('[earnings]', err.message);
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
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

  // ── Normal CDF / PDF for Black-Scholes ────────────────────────────────────
  function normalCDF(x) {
    const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    const t = 1 / (1 + p * x);
    const y = 1 - (((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
    return 0.5 * (1 + sign * y);
  }
  function normalPDF(x) { return Math.exp(-0.5*x*x) / Math.sqrt(2*Math.PI); }
  function bsGreeks(S, K, T, r, sigma, type) {
    if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return null;
    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S/K) + (r + sigma*sigma/2)*T) / (sigma*sqrtT);
    const d2 = d1 - sigma*sqrtT;
    const Nd1=normalCDF(d1), Nd2=normalCDF(d2), nPd1=normalPDF(d1);
    const price = type==='call' ? S*Nd1 - K*Math.exp(-r*T)*Nd2 : K*Math.exp(-r*T)*normalCDF(-d2) - S*normalCDF(-d1);
    const delta = type==='call' ? Nd1 : Nd1-1;
    const gamma = nPd1/(S*sigma*sqrtT);
    const theta = ((-S*nPd1*sigma/(2*sqrtT)) - r*K*Math.exp(-r*T)*(type==='call'?Nd2:normalCDF(-d2)))/365;
    const vega  = S*sqrtT*nPd1/100;
    const round = (v,d) => Math.round(v*Math.pow(10,d))/Math.pow(10,d);
    return { price:round(price,2), delta:round(delta,3), gamma:round(gamma,4), theta:round(theta,3), vega:round(vega,3) };
  }

  async function tradeCompassHandler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const p      = new URL(req.url, 'http://localhost');
    const symbol = p.searchParams.get('symbol')?.trim().toUpperCase();
    if (!symbol) { res.writeHead(400); res.end(JSON.stringify({ error: 'symbol required' })); return; }

    try {
      // 1. Fetch 1-year daily price history
      // ── Fetch all data in parallel ──────────────────────────────────────────
      const hdr = { Accept: 'application/json' };
      const [chartRes, intradayRes, spxRes, qqqRes] = await Promise.allSettled([
        nodeRequest(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`, { headers: hdr }),
        nodeRequest(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m`, { headers: hdr }),
        nodeRequest(`https://query2.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=1d&interval=1d`, { headers: hdr }),
        nodeRequest(`https://query2.finance.yahoo.com/v8/finance/chart/QQQ?range=1d&interval=1d`, { headers: hdr }),
      ]);

      const dailyRes = chartRes.status === 'fulfilled' ? chartRes.value : null;
      if (!dailyRes || dailyRes.status !== 200) throw new Error(`Chart API returned ${dailyRes?.status ?? 'error'}`);

      const chartJson   = JSON.parse(dailyRes.body);
      const chartResult = chartJson?.chart?.result?.[0];
      if (!chartResult) throw new Error('No chart data returned');

      const meta       = chartResult.meta ?? {};
      const q          = chartResult.indicators?.quote?.[0] ?? {};
      const rawCloses  = q.close   ?? [];
      const rawHighs   = q.high    ?? [];
      const rawLows    = q.low     ?? [];
      const rawVolumes = q.volume  ?? [];

      // Strip null entries (non-trading days in the series)
      const closes  = rawCloses.filter(v => v != null);
      const highs   = rawHighs.filter(v => v != null);
      const lows    = rawLows.filter(v => v != null);
      const volumes = rawVolumes.filter(v => v != null);

      if (closes.length < 20) throw new Error('Insufficient price history');

      const currentPrice = meta.regularMarketPrice ?? closes.at(-1);
      const prevClose    = meta.chartPreviousClose  ?? closes.at(-2) ?? currentPrice;
      const change       = currentPrice - prevClose;
      const changePct    = (change / prevClose) * 100;

      // ── Technical helpers ──────────────────────────────────────────────────
      const sma = (arr, n) => arr.length < n ? null : arr.slice(-n).reduce((a,b)=>a+b,0)/n;

      function calcRSI(arr, n=14) {
        if (arr.length < n+1) return null;
        const slice = arr.slice(-(n*2+1));
        let g=0, l=0;
        for (let i=1; i<=n; i++) { const d=slice[i]-slice[i-1]; d>0?g+=d/n:l-=d/n; }
        for (let i=n+1; i<slice.length; i++) {
          const d=slice[i]-slice[i-1];
          g=(g*(n-1)+(d>0?d:0))/n; l=(l*(n-1)+(d<0?-d:0))/n;
        }
        return l===0 ? 100 : 100-(100/(1+g/l));
      }

      function calcBB(arr, n=20) {
        if (arr.length < n) return null;
        const sl=arr.slice(-n), mid=sl.reduce((a,b)=>a+b,0)/n;
        const std=Math.sqrt(sl.reduce((s,v)=>s+Math.pow(v-mid,2),0)/n);
        return { upper:mid+2*std, middle:mid, lower:mid-2*std };
      }

      function calcATR(h, l, c, n=14) {
        const trs=[];
        for (let i=1; i<Math.min(h.length,l.length,c.length); i++)
          trs.push(Math.max(h[i]-l[i], Math.abs(h[i]-c[i-1]), Math.abs(l[i]-c[i-1])));
        return trs.length < n ? null : trs.slice(-n).reduce((a,b)=>a+b,0)/n;
      }

      const sma20  = sma(closes, 20);
      const sma50  = sma(closes, 50);
      const sma200 = sma(closes, 200);
      const rsi    = calcRSI(closes);
      const bb     = calcBB(closes);
      const atr    = calcATR(highs, lows, closes);

      const r2 = (v) => Math.round(v*100)/100;

      // Trend: score how many signals are bullish
      let bull=0, bear=0;
      if (sma20  && currentPrice > sma20)  bull++; else bear++;
      if (sma50  && currentPrice > sma50)  bull++; else bear++;
      if (sma200 && currentPrice > sma200) bull++; else bear++;
      if (sma20  && sma50 && sma20 > sma50) bull++; else bear++;

      const trend  = bull >= 3 ? 'bullish' : bear >= 3 ? 'bearish' : 'neutral';
      const trendStrength = (bull===4||bear===4) ? 'strong' : (bull===3||bear===3) ? 'moderate' : 'weak';
      const rsiSignal = !rsi ? 'neutral' : rsi < 30 ? 'oversold' : rsi > 70 ? 'overbought' : 'neutral';

      let bbPos = 'middle';
      if (bb) {
        if (currentPrice >= bb.upper*0.98) bbPos = 'upper';
        else if (currentPrice <= bb.lower*1.02) bbPos = 'lower';
      }

      // ── Support & Resistance from pivot highs/lows ─────────────────────────
      const lookback = Math.min(closes.length, 63); // ~3 months
      const rH = highs.slice(-lookback), rL = lows.slice(-lookback);

      function pivots(arr, fn, w=5) {
        const out=[];
        for (let i=w; i<arr.length-w; i++) {
          const sl=arr.slice(i-w, i+w+1);
          if (arr[i]===fn(...sl)) out.push(arr[i]);
        }
        return out;
      }

      function cluster(levels, pct=0.015) {
        const sorted=[...new Set(levels.map(v=>Math.round(v*100)/100))].sort((a,b)=>a-b);
        const out=[];
        for (const v of sorted) {
          const ex=out.find(c=>Math.abs(c-v)/c<pct);
          ex!==undefined ? out[out.indexOf(ex)]=(ex+v)/2 : out.push(v);
        }
        return out;
      }

      const pLows  = pivots(rL, Math.min);
      const pHighs = pivots(rH, Math.max);

      const supports = cluster(pLows)
        .filter(s=>s<currentPrice).sort((a,b)=>b-a).slice(0,3).map(r2);
      const resistances = cluster(pHighs)
        .filter(r=>r>currentPrice).sort((a,b)=>a-b).slice(0,3).map(r2);

      // Add 52-week extremes if not already represented
      const w52H = r2(meta.fiftyTwoWeekHigh ?? Math.max(...highs));
      const w52L = r2(meta.fiftyTwoWeekLow  ?? Math.min(...lows));
      if (w52H > currentPrice && !resistances.some(r=>Math.abs(r-w52H)/w52H<0.02)) resistances.push(w52H);
      if (w52L < currentPrice && !supports.some(s=>Math.abs(s-w52L)/w52L<0.02))    supports.push(w52L);
      resistances.sort((a,b)=>a-b); supports.sort((a,b)=>b-a);

      // ── Volume ────────────────────────────────────────────────────────────
      const recentVols = volumes.slice(-20);
      const avgVol     = recentVols.reduce((a,b)=>a+b,0)/recentVols.length;
      const curVol     = meta.regularMarketVolume ?? volumes.at(-1) ?? 0;
      const volRatio   = avgVol ? curVol/avgVol : 1;

      // ── Yesterday's OHLC (second-to-last daily bar) ────────────────────────
      const yH = r2(highs.at(-2)  ?? currentPrice);
      const yL = r2(lows.at(-2)   ?? currentPrice);
      const yC = r2(closes.at(-2) ?? currentPrice);

      // ── Today's candle analysis ────────────────────────────────────────────
      const todayH    = r2(meta.regularMarketDayHigh ?? currentPrice);
      const todayL    = r2(meta.regularMarketDayLow  ?? currentPrice);
      const dayRange  = r2(todayH - todayL);
      const bodyHigh  = Math.max(currentPrice, prevClose);
      const bodyLow   = Math.min(currentPrice, prevClose);
      const bodySize  = r2(bodyHigh - bodyLow);
      const upperWick = r2(todayH - bodyHigh);
      const lowerWick = r2(bodyLow - todayL);
      const bounceAmt = r2(currentPrice - todayL);
      const bounceFromLowPct = dayRange > 0 ? r2((currentPrice - todayL) / dayRange * 100) : 50;
      // close position: upper (> 66%), middle (33–66%), lower (< 33%)
      const closePosition = bounceFromLowPct > 66 ? 'upper' : bounceFromLowPct < 33 ? 'lower' : 'middle';
      // Candle patterns
      const hasLongLowerWick = lowerWick > bodySize * 1.5 && lowerWick > dayRange * 0.25;
      const hasLongUpperWick = upperWick > bodySize * 1.5 && upperWick > dayRange * 0.25;
      const isHammer         = hasLongLowerWick && bodySize < dayRange * 0.35 && currentPrice >= bodyLow;
      const isDoji           = bodySize < dayRange * 0.1;
      const isGreenCandle    = currentPrice > prevClose;
      // Higher high / higher low vs yesterday
      const isHigherHigh = todayH > yH;
      const isHigherLow  = todayL > yL;
      const isLowerHigh  = todayH < yH;
      const isLowerLow   = todayL < yL;

      // ── VWAP from intraday 5-min data ──────────────────────────────────────
      let vwap = null;
      let isAboveVWAP = null;
      try {
        const intraRes = intradayRes.status === 'fulfilled' ? intradayRes.value : null;
        if (intraRes?.status === 200) {
          const intraJson = JSON.parse(intraRes.body);
          const intraQ    = intraJson?.chart?.result?.[0]?.indicators?.quote?.[0] ?? {};
          const iH = intraQ.high   ?? [], iL = intraQ.low ?? [], iC = intraQ.close ?? [], iV = intraQ.volume ?? [];
          let sumPV = 0, sumV = 0;
          for (let i = 0; i < iC.length; i++) {
            if (iC[i]!=null && iV[i]!=null && iV[i]>0) {
              const tp = (((iH[i]??iC[i]) + (iL[i]??iC[i]) + iC[i]) / 3);
              sumPV += tp * iV[i]; sumV += iV[i];
            }
          }
          if (sumV > 0) { vwap = r2(sumPV / sumV); isAboveVWAP = currentPrice >= vwap; }
        }
      } catch(_) {}

      // ── SPX / QQQ market context ──────────────────────────────────────────
      let marketCtx = null;
      try {
        const spxVal = spxRes.status === 'fulfilled' ? spxRes.value : null;
        const qqqVal = qqqRes.status === 'fulfilled' ? qqqRes.value : null;
        const spxMeta = spxVal?.status===200 ? JSON.parse(spxVal.body)?.chart?.result?.[0]?.meta : null;
        const qqqMeta = qqqVal?.status===200 ? JSON.parse(qqqVal.body)?.chart?.result?.[0]?.meta : null;
        const spxChg = spxMeta ? r2((spxMeta.regularMarketPrice - (spxMeta.chartPreviousClose??spxMeta.regularMarketPrice)) / (spxMeta.chartPreviousClose??spxMeta.regularMarketPrice) * 100) : null;
        const qqqChg = qqqMeta ? r2((qqqMeta.regularMarketPrice - (qqqMeta.chartPreviousClose??qqqMeta.regularMarketPrice)) / (qqqMeta.chartPreviousClose??qqqMeta.regularMarketPrice) * 100) : null;
        const mktAvg = (spxChg!=null && qqqChg!=null) ? (spxChg+qqqChg)/2 : (spxChg??qqqChg);
        const relStr = mktAvg!=null ? (changePct > mktAvg+0.3 ? 'stronger' : changePct < mktAvg-0.3 ? 'weaker' : 'inline') : null;
        const mktTrend = mktAvg==null ? 'unknown' : mktAvg > 0.3 ? 'up' : mktAvg < -0.3 ? 'down' : 'flat';
        marketCtx = {
          spxChangePct: spxChg, qqqChangePct: qqqChg, mktAvgPct: mktAvg!=null?r2(mktAvg):null,
          relativeStrength: relStr, marketTrend: mktTrend,
          marketFalling: mktAvg!=null && mktAvg < -1.0,
          marketRallying: mktAvg!=null && mktAvg > 0.5,
        };
      } catch(_) {}

      // ── Dip-buying verdict ────────────────────────────────────────────────
      const dipFor = []; const dipAgainst = [];

      // Close position
      if (closePosition==='upper') dipFor.push("Closed in upper 1/3 of day's range — buyers won the session");
      else if (closePosition==='lower') dipAgainst.push("Closed in lower 1/3 of day's range — sellers in control");
      else { dipFor.push('Closed in middle of range — partial recovery'); dipAgainst.push('No clear winner yet — neither bulls nor bears committed'); }

      // Candle shape
      if (isHammer)          dipFor.push('Hammer candle — long lower wick shows buyers stepped in at the low');
      else if (hasLongLowerWick) dipFor.push('Long lower shadow — price tested lower, buyers pushed it back');
      if (hasLongUpperWick && !isHammer) dipAgainst.push('Long upper wick — sellers rejected the rally at the top');
      if (isDoji && closePosition!=='upper') dipAgainst.push('Doji candle — indecision, neither side committed');

      // VWAP
      if (isAboveVWAP===true)  dipFor.push('Price above VWAP — buyers are winning the intraday average');
      else if (isAboveVWAP===false) dipAgainst.push('Price below VWAP — sellers have the intraday edge');

      // Higher high / higher low
      if (isHigherHigh && isHigherLow) dipFor.push(`Higher high ($${todayH} > $${yH}) and higher low ($${todayL} > $${yL}) vs yesterday — uptrend continues`);
      else if (isLowerHigh && isLowerLow) dipAgainst.push(`Lower high ($${todayH} < $${yH}) and lower low ($${todayL} < $${yL}) — downtrend intensifying`);
      else if (isHigherLow && isLowerHigh) dipFor.push(`Higher low ($${todayL} > $${yL}) — buyers defending higher levels`);
      else if (isLowerLow && isHigherHigh) dipAgainst.push(`Lower low ($${todayL} < $${yL}) tested despite new high — unstable`);

      // Market relative strength
      if (marketCtx?.relativeStrength==='stronger') dipFor.push(`Outperforming market (${changePct>0?'+':''}${r2(changePct)}% vs market ${marketCtx.mktAvgPct>0?'+':''}${marketCtx.mktAvgPct}%) — institutional buying`);
      else if (marketCtx?.relativeStrength==='weaker') dipAgainst.push(`Underperforming market (${r2(changePct)}% vs market ${r2(marketCtx.mktAvgPct)}%) — relative weakness`);

      // Volume
      if (volRatio > 1.3 && isGreenCandle)       dipFor.push(`${r2(volRatio)}× average volume on a bullish day — conviction buying`);
      else if (volRatio > 1.3 && !isGreenCandle)  dipAgainst.push(`${r2(volRatio)}× average volume on a red day — conviction selling`);
      else if (volRatio < 0.7 && !isGreenCandle)  dipFor.push('Low volume on down day — no panic selling, dip may hold');

      // RSI / Bollinger
      if (rsiSignal==='oversold')   dipFor.push(`RSI ${r2(rsi)} — deeply oversold, historically bounces from here`);
      if (bbPos==='lower')          dipFor.push('Price at lower Bollinger Band — mean-reversion likely');
      if (rsiSignal==='overbought') dipAgainst.push(`RSI ${r2(rsi)} — overbought, momentum may stall`);

      // Support proximity
      const nearestSupport = supports[0];
      const distFromSup = nearestSupport ? r2((currentPrice-nearestSupport)/nearestSupport*100) : null;
      if (distFromSup!==null && distFromSup < 2) dipFor.push(`Price within ${distFromSup}% of key support $${nearestSupport} — classic dip-buy zone`);

      // Verdict
      const fCount = dipFor.length, aCount = dipAgainst.length;
      const dipVerdict = fCount >= 3 && aCount <= 1 ? 'YES'
                       : fCount >= 2 && aCount <= 2 ? 'PARTLY'
                       : aCount >= 3 ? 'NO' : 'UNCLEAR';
      const isDip = dipVerdict === 'YES' || (dipVerdict === 'PARTLY' && trend === 'bullish');

      // ── Trade setup ───────────────────────────────────────────────────────
      let conf = 50;
      if (trend==='bullish') conf += 15*(bull-2);
      else if (trend==='bearish') conf += 15*(bear-2);
      if (rsiSignal==='oversold'  && trend==='bullish') conf += 10;
      if (rsiSignal==='overbought'&& trend==='bearish') conf += 10;
      if (dipVerdict==='YES'      && trend==='bullish') conf += 8;
      if (marketCtx?.relativeStrength==='stronger')     conf += 5;
      if (marketCtx?.marketFalling)                     conf -= 15; // market headwind
      conf = Math.max(25, Math.min(90, conf));

      const entryZone = atr ? [r2(currentPrice-atr*0.5), r2(currentPrice)] : null;
      const targetPrice = r2(resistances[0] ?? currentPrice*1.05);
      const stopLoss = atr ? r2(currentPrice-atr*2) : (supports[0] ? r2(supports[0]*0.98) : null);
      const riskReward = (targetPrice&&stopLoss&&entryZone) ?
        r2((targetPrice-entryZone[1]) / (entryZone[1]-stopLoss)) : null;

      const rationale = [];
      if (sma20  && currentPrice>sma20)  rationale.push(`Price above SMA 20 ($${r2(sma20)})`);
      if (sma50  && currentPrice>sma50)  rationale.push(`Price above SMA 50 ($${r2(sma50)})`);
      if (sma200 && currentPrice>sma200) rationale.push(`Price above SMA 200 ($${r2(sma200)})`);
      if (sma20  && currentPrice<sma20)  rationale.push(`Price below SMA 20 ($${r2(sma20)}) — bearish pressure`);
      if (sma50  && currentPrice<sma50)  rationale.push(`Price below SMA 50 ($${r2(sma50)}) — bearish pressure`);
      if (rsi) rationale.push(rsiSignal==='oversold'?`RSI ${r2(rsi)} — oversold, watch for bounce`:rsiSignal==='overbought'?`RSI ${r2(rsi)} — overbought, watch for pullback`:`RSI ${r2(rsi)} — neutral momentum`);
      if (dipFor.length) rationale.push(dipFor[0]);

      // ── Analyst's Call ────────────────────────────────────────────────────
      // Use nearest near-term levels: prefer today's high/low (most actionable)
      const nearWatchAbove = (() => {
        const cands = [todayH, yH, ...resistances].filter(v=>v>currentPrice).sort((a,b)=>a-b);
        return cands[0] ?? null;
      })();
      const nearWatchBelow = (() => {
        const cands = [todayL, yL, vwap, ...supports].filter(v=>v!=null&&v<currentPrice).sort((a,b)=>b-a);
        return cands[0] ?? null;
      })();
      let traderVerdict, traderPoints = [], watchAbove = nearWatchAbove, watchBelow = nearWatchBelow;

      if (marketCtx?.marketFalling) {
        traderVerdict = 'NO_TRADE';
        traderPoints.push(`Market (SPX) is falling hard (${marketCtx.spxChangePct}%) — most stocks follow, avoid new longs`);
        if (trend==='bullish') traderPoints.push('Even in an uptrend, fighting a falling market costs you money');
        traderPoints.push(`Wait: re-evaluate if SPX stabilizes or this stock holds above $${watchBelow}`);
      } else if (trend==='bullish' && dipVerdict==='YES' && rsiSignal!=='overbought') {
        traderVerdict = 'BUY';
        traderPoints.push(`Uptrend intact (above SMA 50/200) and dip is clearly being bought`);
        if (vwap && isAboveVWAP) traderPoints.push(`Price is above VWAP ($${vwap}) — intraday buyers in control`);
        if (isHammer) traderPoints.push('Hammer candle confirms buyers stepped in at the low');
        traderPoints.push(`Entry zone $${entryZone?entryZone[0]:currentPrice}–$${entryZone?entryZone[1]:currentPrice}, target $${targetPrice}, stop $${stopLoss}`);
        if (riskReward) traderPoints.push(`Risk/reward = 1:${riskReward} — worth taking if thesis holds`);
      } else if (trend==='bearish' && dipVerdict==='NO') {
        traderVerdict = 'NO_TRADE';
        traderPoints.push('Downtrend + dip is a real breakdown, not a buying opportunity');
        traderPoints.push(`No long trades. Watch if sellers hold below $${watchAbove} (bearish) or price recovers above $${watchBelow} (potential reversal)`);
      } else if (rsiSignal==='overbought' && closePosition==='upper') {
        traderVerdict = 'WAIT';
        traderPoints.push(`RSI ${r2(rsi)} is overbought and price closed near the highs — chasing here is dangerous`);
        traderPoints.push(`Wait for a pullback to $${watchBelow ?? r2(currentPrice*0.97)} before entering`);
      } else {
        traderVerdict = 'WAIT';
        // Give Muse-style context based on the specific situation
        if (dipVerdict==='PARTLY') {
          traderPoints.push(`Price closed in the middle of its range — buyers and sellers are equal, no clear winner today`);
          traderPoints.push(`Partial dip recovery: bounced $${bounceAmt} off the low but couldn't hold near the high`);
        } else {
          traderPoints.push('Signals are mixed — no clear entry edge right now');
        }
        if (watchAbove) traderPoints.push(`Watch $${watchAbove} above: a close above it = first sign buyers are winning`);
        if (watchBelow) traderPoints.push(`Watch $${watchBelow} below: a close below = sellers in control, stay out or cut losses`);
        const biggerTrend = trend==='bullish' ? `Bigger picture: uptrend intact (SMA 50/200)` : trend==='bearish' ? `Bigger picture: downtrend — dips are sells, not buys` : `Bigger picture: range-bound — buy support, sell resistance`;
        traderPoints.push(biggerTrend);
      }

      const dipSignals = dipFor.slice(0, 3);

      // ── Options chain (3 tabs: 0DTE · Short Term · LEAP) ─────────────────────
      let optionsData = null;
      try {
        async function fetchOptions(url, sess=null) {
          const crumbParam = sess?.crumb ? `${url.includes('?')?'&':'?'}crumb=${encodeURIComponent(sess.crumb)}` : '';
          return nodeRequest(url + crumbParam, {
            headers: { Accept: 'application/json', Referer: 'https://finance.yahoo.com/',
              ...(sess?.cookies ? { Cookie: sess.cookies } : {}) }
          });
        }

        let optRes = await fetchOptions(`https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`);
        if (optRes.status !== 200) {
          const sess = await getYFSession();
          if (sess) optRes = await fetchOptions(`https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`, sess);
        }

        if (optRes.status === 200) {
          const optJson  = JSON.parse(optRes.body);
          const optResult = optJson?.optionChain?.result?.[0];
          if (optResult) {
            const expDates = optResult.expirationDates ?? [];
            const nearest  = optResult.options?.[0] ?? {};
            const expTs0   = nearest.expirationDate;
            const calls0   = nearest.calls ?? [];
            const puts0    = nearest.puts  ?? [];

            // IV from nearest ATM call
            const atmC0 = calls0.reduce((b,c)=>!b||Math.abs(c.strike-currentPrice)<Math.abs(b.strike-currentPrice)?c:b, null);
            const rawIV  = atmC0?.impliedVolatility ?? null;
            const ivSignal = !rawIV ? 'unknown' : rawIV<0.2?'low':rawIV>0.4?'high':'normal';

            // ── Find the 3 target expiry timestamps ───────────────────────
            const dteFn = ts => Math.round((ts*1000-Date.now())/(864e5));
            // 0DTE: nearest (≤2 days)
            const zeroDTEts = expDates.find(ts=>dteFn(ts)<=2) ?? expDates[0] ?? expTs0;
            // Short term: first within 25-55 DTE, fallback to 14-90
            const shortTs = expDates.find(ts=>{const d=dteFn(ts);return d>=25&&d<=55;})
                         ?? expDates.find(ts=>{const d=dteFn(ts);return d>=14&&d<=90;});
            // LEAP: first ≥180 DTE, fallback ≥120 DTE
            const leapTs  = expDates.find(ts=>dteFn(ts)>=180)
                         ?? expDates.find(ts=>dteFn(ts)>=120);

            // ── Fetch the unique expiries we don't already have ───────────
            const needFetch = [...new Set([zeroDTEts, shortTs, leapTs]
              .filter(ts=>ts!=null&&ts!==expTs0))];
            const fetchedChains = { [expTs0]: { calls: calls0, puts: puts0 } };

            await Promise.allSettled(needFetch.map(async ts => {
              try {
                const rr = await fetchOptions(`https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}?date=${ts}`);
                if (rr.status===200) {
                  const jj  = JSON.parse(rr.body);
                  const opt = jj?.optionChain?.result?.[0]?.options?.[0] ?? {};
                  fetchedChains[ts] = { calls: opt.calls??[], puts: opt.puts??[] };
                }
              } catch(_) {}
            }));

            // ── Build strike list for a given expiry + type ───────────────
            const RF = 0.045;
            function strikeFor(ts, type, targets) {
              if (!ts || !fetchedChains[ts]) return [];
              const arr = type==='call' ? fetchedChains[ts].calls : fetchedChains[ts].puts;
              if (!arr.length) return [];
              const dte = Math.max(dteFn(ts), 1);
              const T   = dte / 365;
              const seen = new Set();
              return targets
                .map(tgt => arr.slice().sort((a,b)=>Math.abs(a.strike-tgt)-Math.abs(b.strike-tgt))[0])
                .filter(o => { if(!o||seen.has(o.strike)) return false; seen.add(o.strike); return true; })
                .map(opt => {
                  const bs   = rawIV ? bsGreeks(currentPrice, opt.strike, dte/365, RF, rawIV, type) : null;
                  const dist = (opt.strike - currentPrice) / currentPrice * 100;
                  const absD = Math.abs(dist);
                  const label = absD < 1.5 ? 'ATM'
                    : type==='call' ? (dist>0 ? `+${dist.toFixed(0)}% OTM` : `${absD.toFixed(0)}% ITM`)
                    : (dist<0 ? `${absD.toFixed(0)}% OTM` : `${dist.toFixed(0)}% ITM`);
                  return {
                    type, strike: opt.strike,
                    expiry: new Date(ts*1000).toISOString().slice(0,10), dte,
                    bid: opt.bid??0, ask: opt.ask??0,
                    iv:    opt.impliedVolatility ? r2(opt.impliedVolatility) : (rawIV ? r2(rawIV) : null),
                    delta: opt.delta ? r2(opt.delta) : (bs?.delta ?? null),
                    theta: opt.theta ? r2(opt.theta) : (bs?.theta ?? null),
                    gamma: opt.gamma ? r2(opt.gamma) : (bs?.gamma ?? null),
                    bsPrice: bs?.price ?? null,
                    volume: opt.volume??0, openInterest: opt.openInterest??0,
                    inTheMoney: opt.inTheMoney??false, label,
                  };
                });
            }

            const optType = trend==='bearish' ? 'put' : 'call';

            // 0DTE: ATM only (OTM 0DTE is pure lottery)
            const zStrikes = strikeFor(zeroDTEts, optType, [currentPrice]);
            // Short term: ATM + 5% OTM
            const sOTM = optType==='call' ? currentPrice*1.05 : currentPrice*0.95;
            const sStrikes = strikeFor(shortTs, optType, [currentPrice, sOTM]);
            // LEAP: 5% ITM + ATM (stock replacement range)
            const lITM = optType==='call' ? currentPrice*0.95 : currentPrice*1.05;
            const lStrikes = strikeFor(leapTs, optType, [lITM, currentPrice]);

            // ── Overall strategy recommendation ───────────────────────────
            let strategy, stratRationale;
            if (trend==='bullish') {
              strategy      = ivSignal==='high' ? 'Sell Cash-Secured Put' : 'Buy Call';
              stratRationale= ivSignal==='high'
                ? 'Bullish trend + elevated IV → sell a put at support to collect premium while waiting for a dip entry'
                : 'Bullish trend + normal IV → buy a call to participate in upside with defined risk';
            } else if (trend==='bearish') {
              strategy      = ivSignal==='high' ? 'Buy Put Debit Spread' : 'Buy Put';
              stratRationale= ivSignal==='high'
                ? 'Bearish trend + elevated IV → spread reduces cost and IV-crush risk on a put'
                : 'Bearish trend + normal IV → buy a put to profit from downside with defined risk';
            } else {
              strategy      = ivSignal==='high' ? 'Sell Iron Condor' : 'Wait for Clearer Trend';
              stratRationale= ivSignal==='high'
                ? 'Neutral range + high IV → sell both sides of the range to harvest time decay'
                : 'No clear trend yet — wait for a support/resistance break before committing';
            }

            // ── Assemble output ────────────────────────────────────────────
            const makeChain = (ts, strikes, tabLabel, risk, note) => ts ? {
              label: tabLabel, risk,
              expiry: new Date(ts*1000).toISOString().slice(0,10),
              dte: dteFn(ts), note, strikes,
            } : null;

            optionsData = {
              iv: rawIV ? r2(rawIV) : null,
              ivPct: rawIV ? Math.round(rawIV*100) : null,
              ivSignal,
              suggestion: { strategy, rationale: stratRationale },
              chains: {
                zeroDTE: makeChain(zeroDTEts, zStrikes, '0DTE', 'extreme',
                  '⚡ Day trade only. Theta is brutal — option loses most value in final hours. Only for confirmed momentum breakouts. Cut losses by 2pm if the trade hasn\'t worked.'),
                shortTerm: makeChain(shortTs, sStrikes, 'Short Term', 'moderate',
                  '✓ Sweet spot for swing trades. Enough time for the thesis to play out, theta manageable. Sell at 50% profit — don\'t hold to expiry.'),
                leap: makeChain(leapTs, lStrikes, 'LEAP', 'conservative',
                  '🔵 Moves like the stock (Delta 0.65+). Low daily decay. Use as stock replacement — control 100 shares for far less capital. Needs a sustained move over weeks/months.'),
              },
            };
          }
        }
      } catch(optErr) {
        console.warn(`[trade-compass] options fetch failed:`, optErr.message);
      }

      const data = {
        symbol,
        price: {
          current: r2(currentPrice), change: r2(change), changePct: r2(changePct),
          dayHigh: todayH, dayLow: todayL,
          week52High: r2(meta.fiftyTwoWeekHigh??Math.max(...highs)),
          week52Low:  r2(meta.fiftyTwoWeekLow ??Math.min(...lows)),
          volume: curVol, avgVolume: Math.round(avgVol), volumeRatio: r2(volRatio),
          name: meta.shortName??meta.longName??symbol,
        },
        today: {
          open: r2(prevClose), // best proxy; actual open from first bar if intraday data available
          high: todayH, low: todayL, close: r2(currentPrice), prevClose: r2(prevClose),
          dayRange, bounceAmt, bounceFromLowPct,
          closePosition, // 'upper' | 'middle' | 'lower'
          bodySize, upperWick, lowerWick,
          isHammer, hasLongLowerWick, hasLongUpperWick, isDoji, isGreenCandle,
          isHigherHigh, isHigherLow, isLowerHigh, isLowerLow,
          yesterday: { high: yH, low: yL, close: yC },
          vwap, isAboveVWAP,
        },
        market: marketCtx,
        technicals: {
          trend, trendStrength,
          sma20: sma20?r2(sma20):null, sma50: sma50?r2(sma50):null, sma200: sma200?r2(sma200):null,
          rsi: rsi?r2(rsi):null, rsiSignal,
          bollinger: bb?{ upper:r2(bb.upper), middle:r2(bb.middle), lower:r2(bb.lower) }:null,
          bollingerPosition: bbPos, atr: atr?r2(atr):null,
        },
        levels: { supports, resistances },
        dipAnalysis: {
          isDipOpportunity: isDip,
          verdict: dipVerdict,  // 'YES' | 'PARTLY' | 'NO' | 'UNCLEAR'
          distanceFromSupport: distFromSup,
          signals: dipSignals,
          for: dipFor, against: dipAgainst,
        },
        analystCall: {
          verdict: traderVerdict,  // 'BUY' | 'WAIT' | 'NO_TRADE'
          points: traderPoints,
          watchAbove, watchBelow,
        },
        tradeSetup: { bias: trend, confidence: conf, entryZone, targetPrice, stopLoss, riskReward, rationale: rationale.slice(0,5) },
        options: optionsData,
      };

      console.log(`[trade-compass] ${symbol} → ${trend} ${trendStrength} (${conf}%), RSI ${rsi?.toFixed(1)??'n/a'}, dip=${dipVerdict}, call=${traderVerdict}`);
      res.writeHead(200);
      res.end(JSON.stringify(data));
    } catch (err) {
      console.error('[trade-compass]', err.message);
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  function addMiddleware(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url?.startsWith('/api/quotes'))         return quotesHandler(req, res);
      if (req.url?.startsWith('/api/health'))         return healthHandler(req, res);
      if (req.url?.startsWith('/api/earnings'))       return earningsHandler(req, res);
      if (req.url?.startsWith('/api/stock-info'))     return stockInfoHandler(req, res);
      if (req.url?.startsWith('/api/trade-compass'))  return tradeCompassHandler(req, res);
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
  // Assigning undefined to process.env stores the string "undefined", so only copy real values
  for (const key of ['ANTHROPIC_API_KEY', 'TWITTER_BEARER_TOKEN']) {
    if (!process.env[key] && env[key]) process.env[key] = env[key];
  }

  return {
    plugins: [react(), yahooFinancePlugin(), newsPlugin(), historyPlugin(), usagePlugin(), xFeedPlugin(), newsAnalyzerPlugin()],
    // Hosting platforms (Render, Azure App Service, Cloud Run) supply PORT
    // allowedHosts: true lets the platform's domain (e.g. *.onrender.com) through Vite's host check
    preview: { host: true, port: Number(process.env.PORT) || 4173, strictPort: true, allowedHosts: true },
  };
});
