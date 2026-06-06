import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  RefreshCw, Search, TrendingUp, TrendingDown, Wifi, WifiOff,
  ChevronUp, ChevronDown, ChevronsUpDown, Clock, AlertCircle,
} from 'lucide-react';

// ─── Stock Universe ────────────────────────────────────────────────────────────

// ^ prefix = Yahoo Finance index symbol; displayed without ^ in the UI
const DISPLAY_SYMBOL = { '^GSPC': 'SPX', '^NDX': 'NDX' };

const FALLBACK_NAMES = {
  '^GSPC': 'S&P 500 Index',
  '^NDX':  'Nasdaq 100 Index',
  QQQ:     'Invesco QQQ Trust',
  MU:      'Micron Technology',
  CEVA:    'CEVA Inc.',
  NOW:     'ServiceNow',
};

// SPX → ^GSPC, NDX → ^NDX (Yahoo Finance internal symbols)
const ALL_UNIQUE_SYMBOLS = ['^GSPC', '^NDX', 'QQQ', 'MU', 'CEVA', 'NOW'];

// ─── Formatting helpers ────────────────────────────────────────────────────────

const fmtPrice = (n) => (n != null ? `$${n.toFixed(2)}` : '—');
const fmtChange = (n) => (n != null ? `${n >= 0 ? '+' : ''}${n.toFixed(2)}` : '—');
const fmtPct = (n) => (n != null ? `${n >= 0 ? '+' : ''}${n.toFixed(2)}%` : '—');
const fmtVol = (n) => {
  if (!n) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
};
const fmtCap = (n) => {
  if (!n) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toFixed(0)}`;
};
const fmtTime = (d) =>
  d ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

// ─── Market hours (US Eastern) ─────────────────────────────────────────────────

function marketStatus() {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  if (day === 0 || day === 6) return 'closed';
  const t = et.getHours() * 60 + et.getMinutes();
  if (t >= 9 * 60 + 30 && t < 16 * 60) return 'open';
  if (t >= 4 * 60 && t < 9 * 60 + 30) return 'pre';
  if (t >= 16 * 60 && t < 20 * 60) return 'after';
  return 'closed';
}

// ─── Fetch quotes via local Vite plugin proxy ──────────────────────────────────
// The Vite plugin in vite.config.js handles the Yahoo Finance crumb/cookie
// authentication server-side and exposes a clean /api/quotes endpoint.

const REFRESH_SEC = 30;

async function fetchAllQuotes() {
  const url = `/api/quotes?symbols=${ALL_UNIQUE_SYMBOLS.join(',')}`;
  const r = await fetch(url);
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error || `Server returned HTTP ${r.status}`);
  }
  const json = await r.json();
  const map = {};
  (json?.quoteResponse?.result ?? []).forEach((q) => { map[q.symbol] = q; });
  return map;
}

// ─── Column definitions ────────────────────────────────────────────────────────

const COLS = [
  { key: 'displaySymbol', label: 'Symbol',     sortKey: 'displaySymbol', align: 'left',  sticky: true },
  { key: 'shortName',     label: 'Company',    sortKey: 'shortName',     align: 'left'  },
  { key: 'price',         label: 'Price',      sortKey: 'price',         align: 'right' },
  { key: 'change',        label: 'Change',     sortKey: 'change',        align: 'right' },
  { key: 'changePct',     label: '% Change',   sortKey: 'changePct',     align: 'right' },
  { key: 'open',          label: 'Open',       sortKey: 'open',          align: 'right' },
  { key: 'high',          label: 'High',       sortKey: 'high',          align: 'right' },
  { key: 'low',           label: 'Low',        sortKey: 'low',           align: 'right' },
  { key: 'prevClose',     label: 'Prev Close', sortKey: 'prevClose',     align: 'right' },
  { key: 'volume',        label: 'Volume',     sortKey: 'volume',        align: 'right' },
  { key: 'marketCap',     label: 'Mkt Cap',    sortKey: 'marketCap',     align: 'right' },
  { key: 'week52',        label: '52W Range',  sortKey: 'week52Low',     align: 'right' },
];

// ─── 52-Week range mini-bar ────────────────────────────────────────────────────

function Week52Bar({ low, high, price }) {
  if (!low || !high || !price) return <span className="text-gray-400">—</span>;
  const pct = Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100));
  return (
    <div className="flex items-center gap-1 min-w-[120px]">
      <span className="text-xs text-gray-400 w-12 text-right">${low.toFixed(0)}</span>
      <div className="relative flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full">
        <div className="absolute top-0 left-0 h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
        <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-blue-600 rounded-full border border-white dark:border-gray-900 shadow-sm" style={{ left: `calc(${pct}% - 4px)` }} />
      </div>
      <span className="text-xs text-gray-400 w-12">${high.toFixed(0)}</span>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function MarketWatch() {
  const [quotes, setQuotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: 'changePct', dir: 'desc' });
  const [countdown, setCountdown] = useState(REFRESH_SEC);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [status, setStatus] = useState(marketStatus());
  const timerRef = useRef(null);
  const cdRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const map = await fetchAllQuotes();
      setQuotes(map);
      setLastUpdated(new Date());
      setCountdown(REFRESH_SEC);
      setStatus(marketStatus());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, REFRESH_SEC * 1000);
    cdRef.current = setInterval(
      () => setCountdown((c) => (c <= 1 ? REFRESH_SEC : c - 1)),
      1000,
    );
    return () => { clearInterval(timerRef.current); clearInterval(cdRef.current); };
  }, [load]);

  // Build display rows from raw quotes
  const rows = useMemo(() => {
    return ALL_UNIQUE_SYMBOLS.map((sym) => {
      const q = quotes[sym];
      const displaySymbol = DISPLAY_SYMBOL[sym] ?? sym;
      if (!q) {
        return {
          symbol: sym, displaySymbol,
          shortName: FALLBACK_NAMES[sym] ?? sym,
          price: null, change: null, changePct: null,
          open: null, high: null, low: null, prevClose: null,
          volume: null, marketCap: null, week52Low: null, week52High: null,
          loaded: false,
        };
      }
      return {
        symbol: sym, displaySymbol,
        shortName: q.shortName ?? FALLBACK_NAMES[sym] ?? sym,
        price:    q.regularMarketPrice,
        change:   q.regularMarketChange,
        changePct: q.regularMarketChangePercent,
        open:     q.regularMarketOpen,
        high:     q.regularMarketDayHigh,
        low:      q.regularMarketDayLow,
        prevClose: q.regularMarketPreviousClose,
        volume:   q.regularMarketVolume,
        marketCap: q.marketCap,
        week52Low:  q.fiftyTwoWeekLow,
        week52High: q.fiftyTwoWeekHigh,
        loaded: true,
      };
    });
  }, [quotes]);

  // Search filter
  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) => r.displaySymbol.toLowerCase().includes(q) || r.shortName.toLowerCase().includes(q),
    );
  }, [rows, search]);

  // Sort
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sort.key] ?? (sort.dir === 'asc' ? Infinity : -Infinity);
      const bv = b[sort.key] ?? (sort.dir === 'asc' ? Infinity : -Infinity);
      if (typeof av === 'string') return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sort.dir === 'asc' ? av - bv : bv - av;
    });
  }, [filtered, sort]);

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));

  const SortIcon = ({ k }) => {
    if (sort.key !== k) return <ChevronsUpDown size={11} className="opacity-30 shrink-0" />;
    return sort.dir === 'asc' ? <ChevronUp size={11} className="shrink-0" /> : <ChevronDown size={11} className="shrink-0" />;
  };

  // Market status UI
  const statusConfig = {
    open:   { label: 'LIVE',        dot: 'bg-green-500 animate-pulse', text: 'text-green-600 dark:text-green-400' },
    pre:    { label: 'PRE-MARKET',  dot: 'bg-yellow-500',              text: 'text-yellow-600 dark:text-yellow-400' },
    after:  { label: 'AFTER HOURS', dot: 'bg-orange-500',             text: 'text-orange-600 dark:text-orange-400' },
    closed: { label: 'CLOSED',      dot: 'bg-gray-400',               text: 'text-gray-500 dark:text-gray-400' },
  };
  const sc = statusConfig[status] ?? statusConfig.closed;

  // Summary stats for active view
  const summary = useMemo(() => {
    const loaded = sorted.filter((r) => r.loaded);
    const gainers = loaded.filter((r) => (r.changePct ?? 0) > 0).length;
    const losers  = loaded.filter((r) => (r.changePct ?? 0) < 0).length;
    const top    = loaded.length ? loaded.reduce((a, b) => (a.changePct ?? -Infinity) > (b.changePct ?? -Infinity) ? a : b, loaded[0]) : null;
    const bottom = loaded.length ? loaded.reduce((a, b) => (a.changePct ?? Infinity) < (b.changePct ?? Infinity) ? a : b, loaded[0]) : null;
    return { gainers, losers, top, bottom, total: loaded.length };
  }, [sorted]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Market Watch</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Real-time quotes · SPX · NDX · QQQ · MU · CEVA · NOW
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Market status */}
          <div className={`flex items-center gap-2 text-xs font-semibold ${sc.text}`}>
            <span className={`w-2 h-2 rounded-full ${sc.dot}`} />
            {sc.label}
          </div>
          {/* Last updated */}
          {lastUpdated && (
            <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
              <Clock size={12} />
              {fmtTime(lastUpdated)}
            </div>
          )}
          {/* Refresh button + countdown */}
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Loading…' : `Refresh (${countdown}s)`}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium">Unable to load market data</p>
            <p className="text-xs opacity-80 font-mono bg-red-100 dark:bg-red-900/40 px-2 py-1 rounded">{error}</p>
            <p className="text-xs opacity-80">
              The market data plugin runs inside the Vite dev server. Make sure you started the app with{' '}
              <code className="bg-red-100 dark:bg-red-900/40 px-1 rounded font-mono">npm run dev</code> and
              check the terminal for <code className="font-mono">[market]</code> log lines.
              If the session failed, it usually means Yahoo Finance is temporarily unavailable — click Refresh to retry.
            </p>
          </div>
        </div>
      )}

      {/* Summary strip */}
      {!error && summary.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
              <TrendingUp size={16} className="text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Gainers</p>
              <p className="text-lg font-bold text-green-600">{summary.gainers}</p>
            </div>
          </div>
          <div className="card p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
              <TrendingDown size={16} className="text-red-500 dark:text-red-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Losers</p>
              <p className="text-lg font-bold text-red-500">{summary.losers}</p>
            </div>
          </div>
          {summary.top && (
            <div className="card p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">Top Gainer</p>
              <p className="text-sm font-bold text-gray-900 dark:text-white">{summary.top.displaySymbol}</p>
              <p className="text-xs font-semibold text-green-600">{fmtPct(summary.top.changePct)}</p>
            </div>
          )}
          {summary.bottom && (
            <div className="card p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">Top Loser</p>
              <p className="text-sm font-bold text-gray-900 dark:text-white">{summary.bottom.displaySymbol}</p>
              <p className="text-xs font-semibold text-red-500">{fmtPct(summary.bottom.changePct)}</p>
            </div>
          )}
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="input pl-9 text-sm"
          placeholder="Search symbol or company…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/70 border-b border-gray-200 dark:border-gray-700">
                {COLS.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => col.sortKey && toggleSort(col.sortKey)}
                    className={`px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide select-none ${
                      col.sortKey ? 'cursor-pointer hover:text-gray-700 dark:hover:text-gray-200' : ''
                    } ${col.align === 'right' ? 'text-right' : 'text-left'} ${col.sticky ? 'sticky left-0 bg-gray-50 dark:bg-gray-800/70 z-10' : ''}`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.align === 'right' && col.sortKey && <SortIcon k={col.sortKey} />}
                      {col.label}
                      {col.align === 'left' && col.sortKey && <SortIcon k={col.sortKey} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
              {sorted.length === 0 && !loading && (
                <tr>
                  <td colSpan={COLS.length} className="px-4 py-10 text-center text-sm text-gray-400">
                    No symbols found
                  </td>
                </tr>
              )}
              {sorted.map((row) => {
                const up   = (row.changePct ?? 0) > 0;
                const down = (row.changePct ?? 0) < 0;
                const bigMove = Math.abs(row.changePct ?? 0) >= 3;

                return (
                  <tr
                    key={row.symbol}
                    className={`transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40 ${
                      !row.loaded ? 'opacity-50' : ''
                    } ${bigMove && up ? 'bg-green-50/40 dark:bg-green-950/20' : ''} ${bigMove && down ? 'bg-red-50/40 dark:bg-red-950/20' : ''}`}
                  >
                    {/* Symbol */}
                    <td className="px-3 py-2.5 sticky left-0 bg-white dark:bg-gray-900 z-10 border-r border-gray-100 dark:border-gray-800">
                      <span className="font-bold text-gray-900 dark:text-white text-sm">{row.displaySymbol}</span>
                    </td>
                    {/* Company */}
                    <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400 max-w-[160px] truncate">{row.shortName}</td>
                    {/* Price */}
                    <td className="px-3 py-2.5 text-right font-semibold text-gray-900 dark:text-white">
                      {row.loaded ? fmtPrice(row.price) : <Skeleton />}
                    </td>
                    {/* Change $ */}
                    <td className={`px-3 py-2.5 text-right font-medium ${up ? 'text-green-600' : down ? 'text-red-500' : 'text-gray-500'}`}>
                      {row.loaded ? fmtChange(row.change) : <Skeleton />}
                    </td>
                    {/* Change % */}
                    <td className={`px-3 py-2.5 text-right font-bold ${up ? 'text-green-600' : down ? 'text-red-500' : 'text-gray-500'}`}>
                      {row.loaded ? (
                        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs ${
                          up ? 'bg-green-100 dark:bg-green-900/30' : down ? 'bg-red-100 dark:bg-red-900/30' : 'bg-gray-100 dark:bg-gray-800'
                        }`}>
                          {up ? <ChevronUp size={10} /> : down ? <ChevronDown size={10} /> : null}
                          {fmtPct(row.changePct)}
                        </span>
                      ) : <Skeleton />}
                    </td>
                    {/* Open */}
                    <td className="px-3 py-2.5 text-right text-gray-600 dark:text-gray-400">
                      {row.loaded ? fmtPrice(row.open) : <Skeleton />}
                    </td>
                    {/* High */}
                    <td className="px-3 py-2.5 text-right text-green-600 dark:text-green-500">
                      {row.loaded ? fmtPrice(row.high) : <Skeleton />}
                    </td>
                    {/* Low */}
                    <td className="px-3 py-2.5 text-right text-red-500 dark:text-red-400">
                      {row.loaded ? fmtPrice(row.low) : <Skeleton />}
                    </td>
                    {/* Prev Close */}
                    <td className="px-3 py-2.5 text-right text-gray-600 dark:text-gray-400">
                      {row.loaded ? fmtPrice(row.prevClose) : <Skeleton />}
                    </td>
                    {/* Volume */}
                    <td className="px-3 py-2.5 text-right text-gray-600 dark:text-gray-400">
                      {row.loaded ? fmtVol(row.volume) : <Skeleton />}
                    </td>
                    {/* Market Cap */}
                    <td className="px-3 py-2.5 text-right text-gray-600 dark:text-gray-400">
                      {row.loaded ? fmtCap(row.marketCap) : <Skeleton />}
                    </td>
                    {/* 52W Range */}
                    <td className="px-3 py-2.5 text-right">
                      {row.loaded ? (
                        <Week52Bar low={row.week52Low} high={row.week52High} price={row.price} />
                      ) : <Skeleton wide />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {sorted.length} symbols · Refreshes every {REFRESH_SEC}s
          </p>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            {error ? <WifiOff size={12} /> : <Wifi size={12} />}
            {error ? 'Offline' : `Next refresh in ${countdown}s`}
          </div>
        </div>
      </div>
    </div>
  );
}

function Skeleton({ wide = false }) {
  return (
    <div className={`h-3.5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse inline-block ${wide ? 'w-28' : 'w-14'}`} />
  );
}
