import { useState, useCallback, useRef } from 'react';
import {
  Search, RefreshCw, TrendingUp, TrendingDown, Minus,
  ExternalLink, Clock, User, Sparkles, AlertCircle,
  ChevronRight, Tag, BarChart2, Newspaper,
} from 'lucide-react';

// ─── Sector symbol groups ──────────────────────────────────────────────────────

const SECTORS = [
  {
    id: 'watchlist',
    label: 'My Watchlist',
    badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    symbols: [
      { sym: '^GSPC', label: 'SPX' },
      { sym: '^NDX',  label: 'NDX' },
      { sym: 'QQQ',   label: 'QQQ' },
      { sym: 'MU',    label: 'MU' },
      { sym: 'CEVA',  label: 'CEVA' },
      { sym: 'NOW',   label: 'NOW' },
    ],
  },
  {
    id: 'mag7',
    label: 'MAG7',
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    symbols: [
      { sym: 'AAPL',  label: 'AAPL' },
      { sym: 'MSFT',  label: 'MSFT' },
      { sym: 'AMZN',  label: 'AMZN' },
      { sym: 'GOOGL', label: 'GOOGL' },
      { sym: 'META',  label: 'META' },
      { sym: 'NVDA',  label: 'NVDA' },
      { sym: 'TSLA',  label: 'TSLA' },
    ],
  },
  {
    id: 'semis',
    label: 'Semiconductors',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    symbols: [
      { sym: 'NVDA',  label: 'NVDA' },
      { sym: 'AMD',   label: 'AMD' },
      { sym: 'INTC',  label: 'INTC' },
      { sym: 'MU',    label: 'MU' },
      { sym: 'AVGO',  label: 'AVGO' },
      { sym: 'QCOM',  label: 'QCOM' },
      { sym: 'TSM',   label: 'TSM' },
      { sym: 'AMAT',  label: 'AMAT' },
      { sym: 'LRCX',  label: 'LRCX' },
      { sym: 'KLAC',  label: 'KLAC' },
      { sym: 'MRVL',  label: 'MRVL' },
      { sym: 'TXN',   label: 'TXN' },
      { sym: 'ASML',  label: 'ASML' },
      { sym: 'ADI',   label: 'ADI' },
      { sym: 'WDC',   label: 'WDC' },
      { sym: 'SNDK',  label: 'SNDK' },
      { sym: 'CEVA',  label: 'CEVA' },
    ],
  },
  {
    id: 'ai',
    label: 'AI Infrastructure',
    badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    symbols: [
      { sym: 'NVDA',  label: 'NVDA' },
      { sym: 'AMD',   label: 'AMD' },
      { sym: 'SMCI',  label: 'SMCI' },
      { sym: 'DELL',  label: 'DELL' },
      { sym: 'HPE',   label: 'HPE' },
      { sym: 'ANET',  label: 'ANET' },
      { sym: 'VRT',   label: 'VRT' },
      { sym: 'EQIX',  label: 'EQIX' },
      { sym: 'ARM',   label: 'ARM' },
      { sym: 'MRVL',  label: 'MRVL' },
      { sym: 'CRDO',  label: 'CRDO' },
    ],
  },
  {
    id: 'etf',
    label: 'ETFs & Indices',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    symbols: [
      { sym: '^GSPC', label: 'SPX' },
      { sym: '^NDX',  label: 'NDX' },
      { sym: '^DJI',  label: 'DJIA' },
      { sym: '^VIX',  label: 'VIX' },
      { sym: 'SPY',   label: 'SPY' },
      { sym: 'QQQ',   label: 'QQQ' },
      { sym: 'IWM',   label: 'IWM' },
      { sym: 'DIA',   label: 'DIA' },
      { sym: 'TQQQ',  label: 'TQQQ' },
      { sym: 'SQQQ',  label: 'SQQQ' },
    ],
  },
  {
    id: 'cloud',
    label: 'Cloud & SaaS',
    badge: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
    symbols: [
      { sym: 'CRM',   label: 'CRM' },
      { sym: 'NOW',   label: 'NOW' },
      { sym: 'SNOW',  label: 'SNOW' },
      { sym: 'DDOG',  label: 'DDOG' },
      { sym: 'NET',   label: 'NET' },
      { sym: 'MDB',   label: 'MDB' },
      { sym: 'ZS',    label: 'ZS' },
      { sym: 'OKTA',  label: 'OKTA' },
      { sym: 'HUBS',  label: 'HUBS' },
      { sym: 'GTLB',  label: 'GTLB' },
    ],
  },
  {
    id: 'defense',
    label: 'Defense',
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    symbols: [
      { sym: 'LMT',   label: 'LMT' },
      { sym: 'RTX',   label: 'RTX' },
      { sym: 'NOC',   label: 'NOC' },
      { sym: 'GD',    label: 'GD' },
      { sym: 'BA',    label: 'BA' },
      { sym: 'PLTR',  label: 'PLTR' },
      { sym: 'AXON',  label: 'AXON' },
      { sym: 'KTOS',  label: 'KTOS' },
    ],
  },
  {
    id: 'fintech',
    label: 'Fintech & Finance',
    badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
    symbols: [
      { sym: 'JPM',   label: 'JPM' },
      { sym: 'GS',    label: 'GS' },
      { sym: 'V',     label: 'V' },
      { sym: 'MA',    label: 'MA' },
      { sym: 'PYPL',  label: 'PYPL' },
      { sym: 'COIN',  label: 'COIN' },
      { sym: 'HOOD',  label: 'HOOD' },
      { sym: 'SOFI',  label: 'SOFI' },
    ],
  },
  {
    id: 'energy',
    label: 'Energy',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    symbols: [
      { sym: 'XOM',   label: 'XOM' },
      { sym: 'CVX',   label: 'CVX' },
      { sym: 'NEE',   label: 'NEE' },
      { sym: 'ENPH',  label: 'ENPH' },
      { sym: 'FSLR',  label: 'FSLR' },
      { sym: 'CEG',   label: 'CEG' },
      { sym: 'VST',   label: 'VST' },
    ],
  },
  {
    id: 'quantum',
    label: 'Quantum',
    badge: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
    symbols: [
      { sym: 'IONQ',  label: 'IONQ' },
      { sym: 'RGTI',  label: 'RGTI' },
      { sym: 'QBTS',  label: 'QBTS' },
      { sym: 'QUBT',  label: 'QUBT' },
      { sym: 'IBM',   label: 'IBM' },
    ],
  },
  {
    id: 'space',
    label: 'Space',
    badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    symbols: [
      { sym: 'RKLB',  label: 'RKLB' },
      { sym: 'ASTS',  label: 'ASTS' },
      { sym: 'RDW',   label: 'RDW' },
      { sym: 'PL',    label: 'PL' },
    ],
  },
  {
    id: 'neocloud',
    label: 'Neo-Cloud',
    badge: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
    symbols: [
      { sym: 'IREN',  label: 'IREN' },
      { sym: 'NBIS',  label: 'NBIS' },
      { sym: 'APLD',  label: 'APLD' },
      { sym: 'CIFR',  label: 'CIFR' },
    ],
  },
  {
    id: 'rareearths',
    label: 'Rare Earths',
    badge: 'bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300',
    symbols: [
      { sym: 'USAR',  label: 'USAR' },
      { sym: 'UUUU',  label: 'UUUU' },
      { sym: 'MP',    label: 'MP' },
    ],
  },
  {
    id: 'nuclear',
    label: 'Energy/Nuclear',
    badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    symbols: [
      { sym: 'TE',    label: 'TE' },
      { sym: 'EOSE',  label: 'EOSE' },
      { sym: 'OKLO',  label: 'OKLO' },
      { sym: 'OSS',   label: 'OSS' },
    ],
  },
  {
    id: 'drones',
    label: 'Drones/Robotics',
    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    symbols: [
      { sym: 'ONDS',  label: 'ONDS' },
      { sym: 'TSLA',  label: 'TSLA' },
      { sym: 'NOK',   label: 'NOK' },
      { sym: 'AVAV',  label: 'AVAV' },
    ],
  },
];

// ─── Category config ───────────────────────────────────────────────────────────

const CAT = {
  all:      { label: 'All',      color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  analyst:  { label: 'Analyst',  color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  earnings: { label: 'Earnings', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  bullish:  { label: 'Bullish',  color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  bearish:  { label: 'Bearish',  color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  news:     { label: 'News',     color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

const SENTIMENT_CONFIG = {
  Bullish:  { icon: TrendingUp,   ring: 'border-green-400 dark:border-green-600',  bg: 'bg-green-50 dark:bg-green-950/30',  badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  Bearish:  { icon: TrendingDown, ring: 'border-red-400 dark:border-red-600',    bg: 'bg-red-50 dark:bg-red-950/30',    badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  Neutral:  { icon: Minus,        ring: 'border-gray-300 dark:border-gray-600',  bg: 'bg-gray-50 dark:bg-gray-800/50',  badge: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  Mixed:    { icon: BarChart2,    ring: 'border-amber-400 dark:border-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
};

// ─── Sub-components ────────────────────────────────────────────────────────────

function AISummaryCard({ summary, symbol }) {
  const cfg = SENTIMENT_CONFIG[summary.sentiment] ?? SENTIMENT_CONFIG.Neutral;
  const SentIcon = cfg.icon;

  return (
    <div className={`card border-2 ${cfg.ring} ${cfg.bg} p-5 space-y-4`}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-indigo-500" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">AI Analysis · {symbol}</span>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${cfg.badge}`}>
          <SentIcon size={12} />
          {summary.sentiment}
        </span>
      </div>

      {/* Sentiment reason */}
      <p className="text-sm text-gray-600 dark:text-gray-400 italic">{summary.sentimentReason}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Key Points */}
        {summary.keyPoints?.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Key Points</h4>
            <ul className="space-y-1.5">
              {summary.keyPoints.map((pt, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <ChevronRight size={14} className="mt-0.5 text-indigo-400 shrink-0" />
                  {pt}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Analyst Activity */}
        {summary.analystActivity?.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Analyst Activity</h4>
            <ul className="space-y-1.5">
              {summary.analystActivity.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <ChevronRight size={14} className="mt-0.5 text-blue-400 shrink-0" />
                  {a}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Outlook */}
      {summary.outlook && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Outlook</h4>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{summary.outlook}</p>
        </div>
      )}

      {/* Key Themes */}
      {summary.keyThemes?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {summary.keyThemes.map((theme, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
              <Tag size={10} />
              {theme}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ArticleCard({ article }) {
  const cat = CAT[article.category] ?? CAT.news;
  return (
    <a
      href={article.link}
      target="_blank"
      rel="noopener noreferrer"
      className="card p-4 flex flex-col gap-3 hover:shadow-md transition-shadow group cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0 ${cat.color}`}>
          {cat.label}
        </span>
        <ExternalLink size={13} className="text-gray-300 dark:text-gray-600 group-hover:text-gray-500 dark:group-hover:text-gray-400 shrink-0 mt-0.5 transition-colors" />
      </div>
      <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-3">
        {article.title}
      </p>
      <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500 mt-auto">
        {article.author && (
          <span className="flex items-center gap-1 truncate">
            <User size={11} />
            {article.author}
          </span>
        )}
        {article.pubDate && (
          <span className="flex items-center gap-1 shrink-0">
            <Clock size={11} />
            {relativeTime(article.pubDate)}
          </span>
        )}
      </div>
    </a>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function NewsResearch() {
  const [inputVal, setInputVal]     = useState('');
  const [symbol, setSymbol]         = useState('');
  const [data, setData]             = useState(null);   // { articles, summary, lastUpdated }
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [activeFilter, setFilter]   = useState('all');
  const [activeSector, setActiveSector] = useState('watchlist');
  const inputRef = useRef(null);

  const load = useCallback(async (sym) => {
    if (!sym) return;
    setLoading(true);
    setError(null);
    setData(null);
    setFilter('all');
    try {
      const r = await fetch(`/api/news?symbol=${encodeURIComponent(sym)}`);
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`);
      setData(json);
      setSymbol(json.symbol);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    const val = inputVal.trim().toUpperCase();
    if (val) load(val);
  };

  const handleQuick = (sym) => {
    setInputVal(sym.replace(/^\^/, ''));
    load(sym);
  };

  // Count articles per category
  const counts = {};
  if (data?.articles) {
    data.articles.forEach(a => {
      counts[a.category] = (counts[a.category] ?? 0) + 1;
    });
  }

  const visibleArticles = activeFilter === 'all'
    ? (data?.articles ?? [])
    : (data?.articles ?? []).filter(a => a.category === activeFilter);

  // Display symbol label (strip ^ for indices)
  const displaySym = symbol.replace(/^\^/, '') || '';

  const fmtTime = (iso) => iso
    ? new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '';

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Newspaper size={20} className="text-indigo-500" />
            News &amp; Research
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Latest news, analyst updates &amp; AI-powered insights
          </p>
        </div>
        {data?.lastUpdated && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
            <Clock size={12} />
            Updated {fmtTime(data.lastUpdated)}
          </div>
        )}
      </div>

      {/* ── Search bar ── */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={inputRef}
            className="input pl-9 text-sm w-full"
            placeholder="Enter symbol, e.g. NVDA"
            value={inputVal}
            onChange={e => setInputVal(e.target.value.toUpperCase())}
          />
        </div>
        <button
          type="submit"
          disabled={loading || !inputVal.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Loading…' : 'Search'}
        </button>
      </form>

      {/* ── Sector browser ── */}
      <div className="card p-3 space-y-2.5">
        {/* Row 1: sector tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {SECTORS.map((sector) => (
            <button
              key={sector.id}
              onClick={() => setActiveSector(sector.id)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                activeSector === sector.id
                  ? sector.badge + ' ring-2 ring-current ring-offset-1'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {sector.label}
            </button>
          ))}
        </div>

        {/* Row 2: symbol chips for active sector */}
        <div className="flex flex-wrap gap-1.5">
          {(SECTORS.find(s => s.id === activeSector)?.symbols ?? []).map(({ sym, label }) => (
            <button
              key={sym}
              onClick={() => handleQuick(sym)}
              disabled={loading}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                symbol === sym
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Failed to load news</p>
            <p className="text-xs opacity-80 mt-1 font-mono">{error}</p>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && !error && !data && (
        <div className="card p-12 flex flex-col items-center text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
            <Newspaper size={28} className="text-indigo-400" />
          </div>
          <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300">Select a symbol to load news</h3>
          <p className="text-sm text-gray-400 max-w-xs">
            Type a ticker above or pick one of the quick-access buttons to see the latest headlines and AI analysis.
          </p>
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="space-y-4">
          <div className="card p-5 space-y-3 animate-pulse">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card p-4 space-y-2 animate-pulse">
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-4/5" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mt-2" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {!loading && data && (
        <div className="space-y-5">

          {/* AI summary (if returned) */}
          {data.summary ? (
            <AISummaryCard summary={data.summary} symbol={displaySym} />
          ) : (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 text-xs text-indigo-600 dark:text-indigo-400">
              <Sparkles size={13} />
              <span>
                Set the <code className="font-mono bg-indigo-100 dark:bg-indigo-900/40 px-1 rounded">ANTHROPIC_API_KEY</code> environment variable to enable AI-powered summaries with key points, outlook &amp; analyst highlights.
              </span>
            </div>
          )}

          {/* Category filter tabs */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {Object.entries(CAT).map(([key, { label, color }]) => {
              const count = key === 'all' ? (data.articles?.length ?? 0) : (counts[key] ?? 0);
              if (key !== 'all' && count === 0) return null;
              return (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    activeFilter === key
                      ? color + ' ring-2 ring-current ring-offset-1'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {label} <span className="opacity-70">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Article grid */}
          {visibleArticles.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No articles in this category.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {visibleArticles.map((article, i) => (
                <ArticleCard key={i} article={article} />
              ))}
            </div>
          )}

          {/* Footer */}
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
            {data.articles.length} articles · Source: Seeking Alpha · {displaySym}
          </p>
        </div>
      )}
    </div>
  );
}
