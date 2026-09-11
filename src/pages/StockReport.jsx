import { useState, useRef, useEffect } from 'react';
import { format, subMonths } from 'date-fns';
import { Search, Download, TrendingUp, TrendingDown, BarChart2, Calendar, ChevronDown, ChevronUp, Building2, Star, Users, ExternalLink, Lightbulb, DollarSign } from 'lucide-react';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmt(n, d = 2) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function GapCell({ gap, gapPct }) {
  if (gap === null) return <span className="text-gray-400">—</span>;
  const up = gap >= 0;
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${up ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
      <span className={`inline-block w-2 h-2 rounded-full ${up ? 'bg-green-500' : 'bg-red-500'}`} />
      {up ? '+' : ''}{fmt(gap)} &nbsp;
      <span className="text-xs font-normal opacity-75">({up ? '+' : ''}{fmt(gapPct)}%)</span>
    </span>
  );
}

function SummaryCard({ label, value, sub, color }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-xl font-bold ${color ?? 'text-gray-900 dark:text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Earnings Section ──────────────────────────────────────────────────────────

function EarningsSection({ symbol }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (!symbol) return;
    setData(null); setError('');
    setLoading(true);
    fetch(`/api/earnings?symbol=${encodeURIComponent(symbol)}`)
      .then(r => r.json())
      .then(j => { if (j.error) throw new Error(j.error); setData(j); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [symbol]);

  const fmtEps = n => n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(2);
  const fmtSurp = n => n == null ? '—' : (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%';

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <DollarSign size={17} className="text-purple-500" />
          <span className="font-semibold text-gray-800 dark:text-gray-200">Earnings History — {symbol}</span>
          {loading && <span className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin ml-1" />}
        </div>
        {data?.nextDate && (
          <span className="flex items-center gap-1.5 text-xs font-medium bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700 px-2.5 py-1 rounded-full">
            <Calendar size={11} />
            Next: {data.nextDate}
          </span>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-500 dark:text-red-400 px-5 py-4">{error}</p>
      )}

      {!loading && !error && !data && (
        <p className="text-sm text-gray-400 px-5 py-4">Loading earnings data…</p>
      )}

      {data?.history?.length > 0 && (
        <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
          {data.history.map((q, i) => {
            const beat = q.surprisePct != null && q.surprisePct > 0;
            const miss = q.surprisePct != null && q.surprisePct < 0;
            const isLatest = i === 0;

            const rowBg = beat
              ? isLatest
                ? 'bg-green-50/70 dark:bg-green-900/20'
                : 'bg-green-50/30 dark:bg-green-900/10'
              : miss
                ? isLatest
                  ? 'bg-red-50/70 dark:bg-red-900/20'
                  : 'bg-red-50/30 dark:bg-red-900/10'
                : '';

            const borderColor = beat ? 'border-l-green-500' : miss ? 'border-l-red-500' : 'border-l-gray-300 dark:border-l-gray-600';

            return (
              <div key={q.period ?? i}
                className={`flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5 border-l-4 ${borderColor} ${rowBg} transition-colors`}
              >
                {/* Quarter + date */}
                <div className="min-w-[90px]">
                  <p className={`text-sm font-bold ${isLatest ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                    {q.period ?? '—'}
                    {isLatest && <span className="ml-2 text-[10px] font-semibold bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded-full align-middle">Latest</span>}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{q.date ?? '—'}</p>
                </div>

                {/* EPS Estimate */}
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-0.5">EPS Est.</p>
                  <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">{q.epsEstimate != null ? q.epsEstimate.toFixed(2) : '—'}</p>
                </div>

                {/* EPS Actual */}
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-0.5">EPS Actual</p>
                  <p className={`text-sm font-bold ${beat ? 'text-green-600 dark:text-green-400' : miss ? 'text-red-500 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>
                    {q.epsActual != null ? q.epsActual.toFixed(2) : '—'}
                  </p>
                </div>

                {/* Surprise */}
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-0.5">Surprise</p>
                  <p className={`text-sm font-bold ${beat ? 'text-green-600 dark:text-green-400' : miss ? 'text-red-500 dark:text-red-400' : 'text-gray-500'}`}>
                    {fmtSurp(q.surprisePct)}
                  </p>
                </div>

                {/* Beat/Miss badge */}
                <div className="ml-auto">
                  {beat && (
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${isLatest ? 'bg-green-500 text-white' : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'}`}>
                      ✓ Beat
                    </span>
                  )}
                  {miss && (
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${isLatest ? 'bg-red-500 text-white' : 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'}`}>
                      ✗ Miss
                    </span>
                  )}
                  {!beat && !miss && q.surprisePct === 0 && (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                      ≈ In-line
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data?.history?.length === 0 && !loading && (
        <p className="text-sm text-gray-400 px-5 py-4">No earnings history available for {symbol}.</p>
      )}
    </div>
  );
}

// ── Stock Insight Panel ───────────────────────────────────────────────────────

function fmtLargeNum(n) {
  if (n == null) return '—';
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

function fmtPct(n) {
  if (n == null) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

function fmtNum(n, d = 2) {
  if (n == null) return '—';
  return n.toFixed(d);
}

const REC_COLOR = {
  'strong buy': 'text-green-600 dark:text-green-400',
  buy:          'text-green-500 dark:text-green-300',
  hold:         'text-yellow-600 dark:text-yellow-400',
  sell:         'text-red-500 dark:text-red-400',
  'strong sell':'text-red-700 dark:text-red-600',
};

function SentimentBar({ sentiment }) {
  const { strongBuy = 0, buy = 0, hold = 0, sell = 0, strongSell = 0 } = sentiment;
  const total = strongBuy + buy + hold + sell + strongSell || 1;
  const bars = [
    { key: 'strongBuy',  val: strongBuy,  label: 'Strong Buy',  color: 'bg-green-600' },
    { key: 'buy',        val: buy,        label: 'Buy',          color: 'bg-green-400' },
    { key: 'hold',       val: hold,       label: 'Hold',         color: 'bg-yellow-400' },
    { key: 'sell',       val: sell,       label: 'Sell',         color: 'bg-red-400' },
    { key: 'strongSell', val: strongSell, label: 'Strong Sell',  color: 'bg-red-600' },
  ];
  return (
    <div className="space-y-2">
      <div className="flex h-4 rounded-full overflow-hidden gap-0.5">
        {bars.map(b => b.val > 0 && (
          <div key={b.key} title={`${b.label}: ${b.val}`}
            className={`${b.color} transition-all`}
            style={{ width: `${(b.val / total) * 100}%` }} />
        ))}
      </div>
      <div className="flex gap-4 flex-wrap text-xs text-gray-600 dark:text-gray-400">
        {bars.map(b => (
          <span key={b.key} className="flex items-center gap-1">
            <span className={`inline-block w-2.5 h-2.5 rounded-sm ${b.color}`} />
            {b.label}: <strong>{b.val}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function InsightSection({ title, icon: Icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-100 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
          <Icon size={15} />
          {title}
        </span>
        {open ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
      </button>
      {open && <div className="px-4 py-4">{children}</div>}
    </div>
  );
}

function StockInsightPanel({ symbol }) {
  const [open,    setOpen]    = useState(false);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const fetchedFor = useRef(null);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const res  = await fetch(`/api/stock-info?symbol=${encodeURIComponent(symbol)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch');
      setData(json);
      fetchedFor.current = symbol;
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggle = async () => {
    if (!open && fetchedFor.current !== symbol) await fetchData();
    setOpen(o => !o);
  };

  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <span className="flex items-center gap-2 font-semibold text-gray-800 dark:text-gray-200">
          <Building2 size={17} />
          Stock Insight — {symbol}
        </span>
        <span className="flex items-center gap-2 text-sm text-gray-500">
          {loading && <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
          {open ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-100 dark:border-gray-700 px-5 py-5 space-y-4">
          {error && (
            <div className="flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <p className="text-sm text-red-600 dark:text-red-400 flex-1">{error}</p>
              <button
                onClick={fetchData}
                className="text-xs text-red-600 dark:text-red-400 font-semibold border border-red-300 dark:border-red-700 rounded px-2 py-1 hover:bg-red-100 dark:hover:bg-red-900/40 shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {data && (
            <>
              {/* Company Overview */}
              <InsightSection title="Company Overview" icon={Building2}>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                  {[
                    ['Sector',   data.company.sector],
                    ['Industry', data.company.industry],
                    ['Country',  data.company.country],
                    ['Employees', data.company.employees?.toLocaleString()],
                  ].map(([k, v]) => v && (
                    <div key={k}>
                      <p className="text-xs text-gray-400 uppercase tracking-wide">{k}</p>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{v}</p>
                    </div>
                  ))}
                  {data.company.website && (
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide">Website</p>
                      <a href={data.company.website} target="_blank" rel="noreferrer"
                        className="text-sm text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:underline">
                        {data.company.website.replace(/^https?:\/\//, '')}
                        <ExternalLink size={11} />
                      </a>
                    </div>
                  )}
                </div>
                {data.company.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-5">
                    {data.company.description}
                  </p>
                )}
              </InsightSection>

              {/* Key Statistics */}
              <InsightSection title="Key Statistics" icon={TrendingUp} defaultOpen={false}>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {[
                    ['Market Cap',      fmtLargeNum(data.stats.marketCap)],
                    ['Trailing P/E',    fmtNum(data.stats.trailingPE)],
                    ['Forward P/E',     fmtNum(data.stats.forwardPE)],
                    ['Beta',            fmtNum(data.stats.beta)],
                    ['52W Change',      fmtPct(data.stats.weekChange52)],
                    ['Price/Book',      fmtNum(data.stats.priceToBook)],
                    ['Last Dividend',   data.stats.dividend != null ? `$${fmtNum(data.stats.dividend)}` : '—'],
                  ].map(([k, v]) => (
                    <div key={k} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                      <p className="text-xs text-gray-400 mb-0.5">{k}</p>
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{v}</p>
                    </div>
                  ))}
                </div>
              </InsightSection>

              {/* Growth & Financials */}
              <InsightSection title="Growth & Analyst Targets" icon={TrendingUp} defaultOpen={false}>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                  {[
                    ['Revenue Growth',  fmtPct(data.analysts.revenueGrowth)],
                    ['Earnings Growth', fmtPct(data.analysts.earningsGrowth)],
                    ['Target Low',      data.analysts.targetLow  != null ? `$${fmtNum(data.analysts.targetLow)}` : '—'],
                    ['Target Mean',     data.analysts.targetMean != null ? `$${fmtNum(data.analysts.targetMean)}` : '—'],
                    ['Target High',     data.analysts.targetHigh != null ? `$${fmtNum(data.analysts.targetHigh)}` : '—'],
                    ['Analyst Count',   data.analysts.count ?? '—'],
                  ].map(([k, v]) => (
                    <div key={k} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                      <p className="text-xs text-gray-400 mb-0.5">{k}</p>
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{v}</p>
                    </div>
                  ))}
                </div>
              </InsightSection>

              {/* Analyst Ratings */}
              <InsightSection title="Analyst Ratings & Sentiment" icon={Star} defaultOpen={true}>
                <div className="flex items-center gap-4 mb-4">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Consensus</p>
                    <span className={`text-lg font-bold uppercase ${REC_COLOR[data.analysts.recommendation] ?? 'text-gray-700 dark:text-gray-300'}`}>
                      {data.analysts.recommendation ?? '—'}
                    </span>
                  </div>
                  {data.analysts.score != null && (
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Score (1=Buy, 5=Sell)</p>
                      <p className="text-lg font-bold text-gray-800 dark:text-gray-200">{fmtNum(data.analysts.score)}</p>
                    </div>
                  )}
                </div>
                <SentimentBar sentiment={data.sentiment} />
              </InsightSection>

              {/* AI Insights */}
              {data.aiInsight && (
                <InsightSection title="AI Insights (Claude)" icon={Lightbulb} defaultOpen={true}>
                  <ul className="space-y-2">
                    {data.aiInsight.map((bullet, i) => (
                      <li key={i} className="flex gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <span className="mt-0.5 text-blue-500 font-bold shrink-0">•</span>
                        {bullet}
                      </li>
                    ))}
                  </ul>
                </InsightSection>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function StockReport() {
  const today    = format(new Date(), 'yyyy-MM-dd');
  const monthAgo = format(subMonths(new Date(), 1), 'yyyy-MM-dd');

  const [symbol, setSymbol] = useState('');
  const [from,   setFrom]   = useState(monthAgo);
  const [to,     setTo]     = useState(today);
  const [rows,   setRows]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [fetched, setFetched] = useState('');

  const generate = async () => {
    const sym = symbol.trim().toUpperCase();
    if (!sym) { setError('Please enter a stock symbol.'); return; }
    if (!from || !to)  { setError('Please select a date range.'); return; }
    if (from > to)     { setError('Start date must be before end date.'); return; }

    setLoading(true);
    setError('');
    setRows([]);

    try {
      const res  = await fetch(`/api/history?symbol=${encodeURIComponent(sym)}&from=${from}&to=${to}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch data');
      if (!json.data?.length) throw new Error('No trading data found for this range.');
      setRows(json.data);
      setFetched(sym);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Summary stats ────────────────────────────────────────────────────────────
  const withGap   = rows.filter(r => r.gap !== null);
  const gapUps    = withGap.filter(r => r.gap > 0);
  const gapDowns  = withGap.filter(r => r.gap < 0);
  const biggestUp   = gapUps.length   ? gapUps.reduce((a, b)   => a.gapPct > b.gapPct ? a : b)   : null;
  const biggestDown = gapDowns.length ? gapDowns.reduce((a, b) => a.gapPct < b.gapPct ? a : b) : null;
  const avgGap    = withGap.length ? withGap.reduce((s, r) => s + r.gap, 0) / withGap.length : null;

  const highestHigh = rows.length ? rows.reduce((a, b) => a.high > b.high ? a : b) : null;
  const lowestLow   = rows.length ? rows.reduce((a, b) => a.low  < b.low  ? a : b) : null;

  // ── Export to CSV ────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const headers = ['Date', 'Day', 'Open', 'High', 'Low', 'Close', 'Prev Close', 'Gap', 'Gap %', 'Volume'];
    const lines = [
      headers.join(','),
      ...rows.map(r => {
        const day = DAY_NAMES[new Date(r.date + 'T12:00:00').getDay()];
        return [
          r.date, day,
          r.open, r.high, r.low, r.close,
          r.prevClose ?? '',
          r.gap ?? '',
          r.gapPct ?? '',
          r.volume,
        ].join(',');
      }),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${fetched}_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Stock Price Report</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          OHLC history with daily open-vs-previous-close gap analysis
        </p>
      </div>

      {/* Controls */}
      <div className="card p-5">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="label">Stock Symbol</label>
            <input
              className="input uppercase"
              placeholder="e.g. AAPL"
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && generate()}
            />
          </div>
          <div>
            <label className="label">Start Date</label>
            <input className="input" type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">End Date</label>
            <input className="input" type="date" value={to} min={from} max={today} onChange={e => setTo(e.target.value)} />
          </div>
          <button
            className="btn-primary flex items-center justify-center gap-2"
            onClick={generate}
            disabled={loading}
          >
            {loading
              ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Search size={16} />
            }
            {loading ? 'Loading…' : 'Generate Report'}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-500 dark:text-red-400">{error}</p>}
      </div>

      {/* Earnings History */}
      {fetched && <EarningsSection symbol={fetched} />}

      {/* Stock Insight Panel */}
      {fetched && <StockInsightPanel symbol={fetched} />}

      {/* Summary */}
      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <SummaryCard
              label="Trading Days"
              value={rows.length}
              sub={`${from} → ${to}`}
              icon={Calendar}
            />
            <SummaryCard
              label="Period High"
              value={highestHigh ? `$${fmt(highestHigh.high)}` : '—'}
              sub={highestHigh ? highestHigh.date : undefined}
              color="text-green-600 dark:text-green-400"
            />
            <SummaryCard
              label="Period Low"
              value={lowestLow ? `$${fmt(lowestLow.low)}` : '—'}
              sub={lowestLow ? lowestLow.date : undefined}
              color="text-red-500 dark:text-red-400"
            />
            <SummaryCard
              label="Avg Daily Gap"
              value={avgGap !== null ? `${avgGap >= 0 ? '+' : ''}$${fmt(Math.abs(avgGap))}` : '—'}
              color={avgGap >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}
              sub={`${gapUps.length} gaps up / ${gapDowns.length} gaps down`}
            />
            <SummaryCard
              label="Biggest Gap Up"
              value={biggestUp ? `+${fmt(biggestUp.gapPct)}%` : '—'}
              sub={biggestUp ? `${biggestUp.date} · +$${fmt(biggestUp.gap)}` : undefined}
              color="text-green-600 dark:text-green-400"
            />
            <SummaryCard
              label="Biggest Gap Down"
              value={biggestDown ? `${fmt(biggestDown.gapPct)}%` : '—'}
              sub={biggestDown ? `${biggestDown.date} · -$${fmt(Math.abs(biggestDown.gap))}` : undefined}
              color="text-red-500 dark:text-red-400"
            />
          </div>

          {/* Table */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide flex items-center gap-2">
                <BarChart2 size={15} />
                {fetched} — {rows.length} days
              </h3>
              <button
                onClick={exportCSV}
                className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-3"
              >
                <Download size={13} /> Export CSV
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    <th className="text-left px-4 py-3">Date</th>
                    <th className="text-left px-3 py-3">Day</th>
                    <th className="text-right px-3 py-3">Open</th>
                    <th className="text-right px-3 py-3">High</th>
                    <th className="text-right px-3 py-3">Low</th>
                    <th className="text-right px-3 py-3">Close</th>
                    <th className="text-right px-3 py-3">Prev Close</th>
                    <th className="text-left px-4 py-3">Gap (Open − Prev Close)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {rows.map((r) => {
                    const day        = DAY_NAMES[new Date(r.date + 'T12:00:00').getDay()];
                    const dayOpen    = r.close >= r.open;
                    const isPeriodHigh = highestHigh && r.date === highestHigh.date;
                    const isPeriodLow  = lowestLow   && r.date === lowestLow.date;
                    return (
                      <tr
                        key={r.date}
                        className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                      >
                        <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                          {r.date}
                        </td>
                        <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400">{day}</td>
                        <td className="px-3 py-2.5 text-right text-gray-700 dark:text-gray-300">${fmt(r.open)}</td>
                        <td className={`px-3 py-2.5 text-right font-medium ${isPeriodHigh ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 font-bold' : 'text-green-600 dark:text-green-400'}`}>
                          ${fmt(r.high)}{isPeriodHigh && <span className="ml-1 text-[10px] align-top">▲HI</span>}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-medium ${isPeriodLow ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 font-bold' : 'text-red-500 dark:text-red-400'}`}>
                          ${fmt(r.low)}{isPeriodLow && <span className="ml-1 text-[10px] align-top">▼LO</span>}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-semibold ${dayOpen ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                          ${fmt(r.close)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-500 dark:text-gray-400">
                          {r.prevClose !== null ? `$${fmt(r.prevClose)}` : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <GapCell gap={r.gap} gapPct={r.gapPct} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!rows.length && !loading && !error && (
        <div className="card p-12 text-center text-gray-400 dark:text-gray-500">
          <BarChart2 size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Enter a symbol and date range, then click Generate Report</p>
        </div>
      )}
    </div>
  );
}
