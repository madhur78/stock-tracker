import { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Newspaper, Upload, X, Trash2, TrendingUp, TrendingDown, Minus,
  CheckCircle, Clock, SkipForward, ChevronDown, ChevronUp,
  AlertTriangle, ExternalLink, Filter, BarChart2, BookOpen, Eye,
  Target, Shield, Lightbulb, RefreshCw, FileText,
} from 'lucide-react';

// ── persistence ──────────────────────────────────────────────────────────────
const STORE = 'news-analyzer-v1';
const load  = () => { try { return JSON.parse(localStorage.getItem(STORE)) ?? []; } catch { return []; } };
const save  = h  => { try { localStorage.setItem(STORE, JSON.stringify(h)); } catch {} };

// ── helpers ───────────────────────────────────────────────────────────────────
const fmtDate = ts =>
  new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const SENTIMENT_CFG = {
  Bullish: { color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20', bar: '#22c55e', Icon: TrendingUp  },
  Bearish: { color: 'text-red-500 dark:text-red-400',     bg: 'bg-red-50 dark:bg-red-900/20',     bar: '#ef4444', Icon: TrendingDown },
  Neutral: { color: 'text-gray-500 dark:text-gray-400',   bg: 'bg-gray-50 dark:bg-gray-800',       bar: '#9ca3af', Icon: Minus        },
  Mixed:   { color: 'text-amber-500 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20',  bar: '#f59e0b', Icon: BarChart2    },
};

const RISK_CLS = {
  Low:     'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  Medium:  'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  High:    'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  Extreme: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
};

const ACTION_CLS = {
  'Buy Call': 'bg-green-600',  'Buy':     'bg-green-600',
  'Sell Call':'bg-red-500',    'Sell':    'bg-red-500',
  'Buy Put':  'bg-orange-500', 'Short':   'bg-red-700',
  'Sell Put': 'bg-green-800',  'Hold':    'bg-gray-500',
  'Straddle': 'bg-purple-600', 'Watch':   'bg-blue-500',
  'Strangle': 'bg-purple-500',
};

const TIME_CLS = {
  'Same Day (0DTE)':       'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  'Short-term (1-5 days)': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  'Weekly':                'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300',
  'Monthly':               'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300',
  'Long-term':             'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
};

const STATUS_CFG = {
  watching: { label: 'Watching', Icon: Clock,        cls: 'text-blue-600 dark:text-blue-400',  bg: 'bg-blue-50 dark:bg-blue-900/20' },
  acted:    { label: 'Acted',    Icon: CheckCircle,  cls: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20' },
  skipped:  { label: 'Skipped', Icon: SkipForward,  cls: 'text-gray-500',                      bg: 'bg-gray-50 dark:bg-gray-800' },
};

const STATUSES = ['watching', 'acted', 'skipped'];

// ── sub-components ────────────────────────────────────────────────────────────

function SentimentGauge({ score, label }) {
  const cfg  = SENTIMENT_CFG[label] ?? SENTIMENT_CFG.Neutral;
  const Icon = cfg.Icon;
  const pct  = Math.max(0, Math.min(100, score ?? 50));
  return (
    <div className={`rounded-xl p-4 ${cfg.bg} flex items-center gap-4`}>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className={`text-sm font-semibold flex items-center gap-1.5 ${cfg.color}`}>
            <Icon size={15} /> {label}
          </span>
          <span className={`text-xl font-bold ${cfg.color}`}>{pct}</span>
        </div>
        <div className="relative h-2.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: cfg.bar }}
          />
        </div>
        <div className="flex justify-between mt-0.5 text-[10px] text-gray-400">
          <span>Bearish 0</span><span>Neutral 50</span><span>100 Bullish</span>
        </div>
      </div>
    </div>
  );
}

function TickerChip({ ticker }) {
  return (
    <Link
      to={`/stock-report?symbol=${ticker}`}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/40 transition-colors"
    >
      ${ticker}
      <ExternalLink size={10} />
    </Link>
  );
}

function RecCard({ rec, type, onStatusChange }) {
  const actionBg = ACTION_CLS[rec.action] ?? 'bg-gray-600';
  const s        = STATUS_CFG[rec.status ?? 'watching'];
  const SIcon    = s.Icon;
  const nextStatus = () => {
    const i = STATUSES.indexOf(rec.status ?? 'watching');
    onStatusChange(STATUSES[(i + 1) % STATUSES.length]);
  };
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-gray-800 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold text-white px-2 py-0.5 rounded ${actionBg}`}>{rec.action}</span>
          {rec.ticker && (
            <Link to={`/stock-report?symbol=${rec.ticker}`} className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline">
              ${rec.ticker}
            </Link>
          )}
          {type === 'option' && rec.targetExpiry && (
            <span className="text-xs text-gray-500 dark:text-gray-400">{rec.targetExpiry} · {rec.targetStrike}</span>
          )}
          {type === 'stock' && rec.targetPrice && (
            <span className="text-xs text-gray-500 dark:text-gray-400">Target: {rec.targetPrice}</span>
          )}
        </div>
        <button
          onClick={nextStatus}
          title="Click to cycle status"
          className={`flex-shrink-0 flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${s.cls} ${s.bg} cursor-pointer`}
        >
          <SIcon size={11} /> {s.label}
        </button>
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">{rec.reasoning}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${RISK_CLS[rec.risk] ?? RISK_CLS.Medium}`}>
          <Shield size={9} className="inline mr-0.5" />{rec.risk} Risk
        </span>
        <span className="text-[11px] text-gray-500 dark:text-gray-400">
          <Target size={9} className="inline mr-0.5" />Confidence: {rec.confidence ?? '—'}%
        </span>
        {type === 'stock' && rec.stopLoss && (
          <span className="text-[11px] text-gray-500 dark:text-gray-400">Stop: {rec.stopLoss}</span>
        )}
      </div>
    </div>
  );
}

function AnalysisResult({ result, onUpdateStatus, onSave, saved }) {
  const [expanded, setExpanded] = useState({ takeaways: true, option: true, stock: true });
  const tog = k => setExpanded(p => ({ ...p, [k]: !p[k] }));

  const Section = ({ id, title, count, children }) => (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <button
        onClick={() => tog(id)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {title} {count != null && <span className="text-xs font-normal text-gray-400">({count})</span>}
        </span>
        {expanded[id] ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>
      {expanded[id] && <div className="p-4">{children}</div>}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* header row */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-gray-900 dark:text-white">Analysis Result</h3>
        {!saved && (
          <button
            onClick={onSave}
            className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            Save to History
          </button>
        )}
        {saved && <span className="text-xs text-green-600 dark:text-green-400 font-medium">✓ Saved</span>}
      </div>

      {/* sentiment + meta */}
      <SentimentGauge score={result.sentiment?.score} label={result.sentiment?.label ?? 'Neutral'} />

      <div className="flex flex-wrap gap-2">
        {result.category && (
          <span className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-medium">
            {result.category}
          </span>
        )}
        {result.timeHorizon && (
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${TIME_CLS[result.timeHorizon] ?? TIME_CLS['Long-term']}`}>
            {result.timeHorizon}
          </span>
        )}
        {(result.tickers ?? []).map(t => <TickerChip key={t} ticker={t} />)}
      </div>

      {result.sentiment?.reasoning && (
        <p className="text-xs text-gray-500 dark:text-gray-400 italic">{result.sentiment.reasoning}</p>
      )}

      {/* summary */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{result.summary}</p>
      </div>

      {/* takeaways */}
      <Section id="takeaways" title="Key Takeaways" count={(result.takeaways ?? []).length}>
        <ul className="space-y-2">
          {(result.takeaways ?? []).map((t, i) => (
            <li key={i} className="flex gap-2 text-sm text-gray-700 dark:text-gray-300">
              <span className="mt-1 flex-shrink-0 w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] flex items-center justify-center font-bold">{i + 1}</span>
              {t}
            </li>
          ))}
        </ul>
      </Section>

      {/* option recs */}
      {(result.optionRecommendations ?? []).length > 0 && (
        <Section id="option" title="Option Recommendations" count={result.optionRecommendations.length}>
          <div className="space-y-3">
            {result.optionRecommendations.map((rec, i) => (
              <RecCard
                key={rec.id ?? i}
                rec={rec}
                type="option"
                onStatusChange={status => onUpdateStatus('option', rec.id ?? i, status)}
              />
            ))}
          </div>
        </Section>
      )}

      {/* stock recs */}
      {(result.stockRecommendations ?? []).length > 0 && (
        <Section id="stock" title="Stock Recommendations" count={result.stockRecommendations.length}>
          <div className="space-y-3">
            {result.stockRecommendations.map((rec, i) => (
              <RecCard
                key={rec.id ?? i}
                rec={rec}
                type="stock"
                onStatusChange={status => onUpdateStatus('stock', rec.id ?? i, status)}
              />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function HistoryEntry({ entry, onDelete, onView }) {
  const cfg  = SENTIMENT_CFG[entry.sentiment?.label] ?? SENTIMENT_CFG.Neutral;
  const Icon = cfg.Icon;
  const optC = (entry.optionRecommendations ?? []).length;
  const stkC = (entry.stockRecommendations  ?? []).length;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold flex items-center gap-1 ${cfg.color}`}>
              <Icon size={12} /> {entry.sentiment?.label ?? '—'}
            </span>
            {entry.category && (
              <span className="text-xs text-gray-500 dark:text-gray-400">{entry.category}</span>
            )}
            {(entry.tickers ?? []).slice(0, 4).map(t => (
              <span key={t} className="text-xs font-bold text-blue-600 dark:text-blue-400">${t}</span>
            ))}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{fmtDate(entry.createdAt)}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => onView(entry)}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors flex items-center gap-1"
          >
            <Eye size={12} /> View
          </button>
          <button
            onClick={() => onDelete(entry.id)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2 leading-relaxed">{entry.summary}</p>
      {(optC > 0 || stkC > 0) && (
        <div className="flex gap-3 text-[11px] text-gray-400">
          {optC > 0 && <span>📊 {optC} option rec{optC > 1 ? 's' : ''}</span>}
          {stkC > 0 && <span>📈 {stkC} stock rec{stkC > 1 ? 's' : ''}</span>}
        </div>
      )}
    </div>
  );
}

function AllRecsView({ history, onUpdateStatus }) {
  const [filterType,   setFilterType]   = useState('all');   // all / option / stock
  const [filterStatus, setFilterStatus] = useState('all');   // all / watching / acted / skipped
  const [filterTicker, setFilterTicker] = useState('');

  const allRecs = history.flatMap(entry => [
    ...(entry.optionRecommendations ?? []).map((r, i) => ({ ...r, _entryId: entry.id, _type: 'option', _idx: i, _date: entry.createdAt })),
    ...(entry.stockRecommendations  ?? []).map((r, i) => ({ ...r, _entryId: entry.id, _type: 'stock',  _idx: i, _date: entry.createdAt })),
  ]).sort((a, b) => b._date - a._date);

  const filtered = allRecs.filter(r => {
    if (filterType   !== 'all' && r._type !== filterType)               return false;
    if (filterStatus !== 'all' && (r.status ?? 'watching') !== filterStatus) return false;
    if (filterTicker && !r.ticker?.includes(filterTicker.toUpperCase())) return false;
    return true;
  });

  const tickers = [...new Set(allRecs.map(r => r.ticker).filter(Boolean))].sort();

  if (allRecs.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 dark:text-gray-600">
        <Target size={36} className="mx-auto mb-3 opacity-40" />
        <p className="text-sm">No recommendations yet. Analyze some news first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Filter size={14} className="text-gray-400" />
        {['all','option','stock'].map(v => (
          <button key={v} onClick={() => setFilterType(v)}
            className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${filterType === v ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
            {v === 'all' ? 'All Types' : v === 'option' ? 'Options' : 'Stocks'}
          </button>
        ))}
        <span className="text-gray-300 dark:text-gray-600">|</span>
        {STATUSES.map(v => {
          const s = STATUS_CFG[v];
          return (
            <button key={v} onClick={() => setFilterStatus(filterStatus === v ? 'all' : v)}
              className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${filterStatus === v ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
              {s.label}
            </button>
          );
        })}
        {tickers.length > 0 && (
          <>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <select
              value={filterTicker}
              onChange={e => setFilterTicker(e.target.value)}
              className="text-xs px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            >
              <option value="">All Tickers</option>
              {tickers.map(t => <option key={t} value={t}>${t}</option>)}
            </select>
          </>
        )}
        <span className="ml-auto text-xs text-gray-400">{filtered.length} rec{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* recs table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              {['Date','Type','Action','Ticker','Confidence','Risk','Rationale','Status'].map(h => (
                <th key={h} className="text-left py-2 px-3 text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {filtered.map((r, idx) => {
              const s    = STATUS_CFG[r.status ?? 'watching'];
              const SIco = s.Icon;
              return (
                <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="py-2.5 px-3 text-gray-400 whitespace-nowrap">{fmtDate(r._date)}</td>
                  <td className="py-2.5 px-3">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${r._type === 'option' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'}`}>
                      {r._type === 'option' ? 'Option' : 'Stock'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`text-white text-[10px] font-bold px-1.5 py-0.5 rounded ${ACTION_CLS[r.action] ?? 'bg-gray-500'}`}>{r.action}</span>
                  </td>
                  <td className="py-2.5 px-3 font-bold text-blue-600 dark:text-blue-400">{r.ticker ? `$${r.ticker}` : '—'}</td>
                  <td className="py-2.5 px-3 text-gray-600 dark:text-gray-400">{r.confidence ?? '—'}%</td>
                  <td className="py-2.5 px-3">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${RISK_CLS[r.risk] ?? ''}`}>{r.risk}</span>
                  </td>
                  <td className="py-2.5 px-3 text-gray-600 dark:text-gray-300 max-w-xs truncate">{r.reasoning}</td>
                  <td className="py-2.5 px-3">
                    <button
                      onClick={() => onUpdateStatus(r._entryId, r._type, r._idx)}
                      className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${s.cls} ${s.bg}`}
                    >
                      <SIco size={10} /> {s.label}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function NewsAnalyzer() {
  const [tab,       setTab]       = useState('analyze');  // analyze / history / recs
  const [text,      setText]      = useState('');
  const [image,     setImage]     = useState(null);       // { base64, mediaType, name, preview }
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [result,    setResult]    = useState(null);       // live analysis (unsaved or saved copy)
  const [saved,     setSaved]     = useState(false);
  const [history,   setHistory]   = useState(load);
  const [viewEntry, setViewEntry] = useState(null);       // entry opened from history
  const fileRef = useRef();

  const persistHistory = useCallback(next => { setHistory(next); save(next); }, []);

  // ── file upload ─────────────────────────────────────────────────────────────
  const onFile = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
      const reader = new FileReader();
      reader.onload = ev => setText(t => t + (t ? '\n\n' : '') + ev.target.result);
      reader.readAsText(file);
    } else if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = ev => {
        const dataUrl = ev.target.result;
        const base64  = dataUrl.split(',')[1];
        setImage({ base64, mediaType: file.type, name: file.name, preview: dataUrl });
      };
      reader.readAsDataURL(file);
    } else {
      setError('Only images and text files are supported. For PDFs, copy-paste the text.');
    }
    e.target.value = '';
  };

  // ── analyze ─────────────────────────────────────────────────────────────────
  const analyze = async () => {
    if (!text.trim() && !image) return;
    setLoading(true); setError(''); setResult(null); setSaved(false);
    try {
      const body = { text: text.trim() };
      if (image) { body.imageBase64 = image.base64; body.imageMediaType = image.mediaType; }

      const res  = await fetch('/api/analyze-news', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();

      if (data.needsKey) { setError('ANTHROPIC_API_KEY is not set. Add it to your .env file and restart the server.'); return; }
      if (data.error)    { setError(data.error); return; }

      // attach ids and default status to recs
      const stamp = r => ({ ...r, id: crypto.randomUUID(), status: 'watching' });
      const withIds = {
        ...data,
        optionRecommendations: (data.optionRecommendations ?? []).map(stamp),
        stockRecommendations:  (data.stockRecommendations  ?? []).map(stamp),
      };
      setResult(withIds);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── save to history ──────────────────────────────────────────────────────────
  const saveToHistory = useCallback(() => {
    if (!result || saved) return;
    const entry = {
      id:        crypto.randomUUID(),
      createdAt: Date.now(),
      inputPreview: text.slice(0, 300) || (image ? `[Image: ${image.name}]` : ''),
      hasImage:  !!image,
      ...result,
    };
    persistHistory([entry, ...history]);
    setSaved(true);
  }, [result, saved, text, image, history, persistHistory]);

  // ── update rec status (live result) ──────────────────────────────────────────
  const updateResultStatus = useCallback((type, recIdOrIdx, status) => {
    setResult(prev => {
      if (!prev) return prev;
      const key = type === 'option' ? 'optionRecommendations' : 'stockRecommendations';
      return {
        ...prev,
        [key]: prev[key].map(r => (r.id === recIdOrIdx || r === prev[key][recIdOrIdx]) ? { ...r, status } : r),
      };
    });
  }, []);

  // ── update rec status (history) ──────────────────────────────────────────────
  const updateHistoryStatus = useCallback((entryId, type, recIdx) => {
    setHistory(prev => {
      const key = type === 'option' ? 'optionRecommendations' : 'stockRecommendations';
      const next = prev.map(entry => {
        if (entry.id !== entryId) return entry;
        const recs = entry[key].map((r, i) => {
          if (i !== recIdx) return r;
          const cur  = r.status ?? 'watching';
          const nextS = STATUSES[(STATUSES.indexOf(cur) + 1) % STATUSES.length];
          return { ...r, status: nextS };
        });
        return { ...entry, [key]: recs };
      });
      save(next);
      return next;
    });
  }, []);

  const deleteEntry = useCallback(id => {
    if (viewEntry?.id === id) setViewEntry(null);
    persistHistory(history.filter(e => e.id !== id));
  }, [history, viewEntry, persistHistory]);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Newspaper size={24} /> Summarize News
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">AI-powered news analysis with trade recommendations</p>
        </div>
        <div className="flex items-center gap-2">
          {['analyze','history','recs'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
              {t === 'analyze' ? 'Analyze' : t === 'history' ? `History (${history.length})` : 'All Recs'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Analyze tab ── */}
      {tab === 'analyze' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* input */}
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <FileText size={16} /> Input
              </h2>

              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Paste news article, earnings report, analyst note, tweet thread, or any financial text here…"
                rows={12}
                className="w-full text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700 dark:text-gray-300 placeholder-gray-400"
              />

              {/* image preview */}
              {image && (
                <div className="relative inline-block">
                  <img src={image.preview} alt={image.name} className="h-24 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
                  <button
                    onClick={() => setImage(null)}
                    className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600"
                  >
                    <X size={11} />
                  </button>
                  <p className="text-[10px] text-gray-400 mt-0.5 truncate max-w-xs">{image.name}</p>
                </div>
              )}

              <div className="flex items-center gap-2">
                <input ref={fileRef} type="file" accept="image/*,.txt,.md" onChange={onFile} className="hidden" />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <Upload size={14} /> Upload Image / Text File
                </button>
                {(text || image) && (
                  <button
                    onClick={() => { setText(''); setImage(null); setResult(null); setError(''); setSaved(false); }}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>

              {error && (
                <div className="flex gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
                  <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <button
                onClick={analyze}
                disabled={loading || (!text.trim() && !image)}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <><RefreshCw size={16} className="animate-spin" /> Analyzing…</>
                ) : (
                  <><Lightbulb size={16} /> Analyze</>
                )}
              </button>

              <div className="text-[11px] text-gray-400 space-y-1">
                <p className="font-medium text-gray-500 dark:text-gray-400">Ideas for input:</p>
                {['Earnings call transcript or PR', 'Fed statement / FOMC minutes', 'Analyst upgrade/downgrade note', 'Sector news or M&A announcement', 'Screenshot of a chart or article'].map(tip => (
                  <p key={tip} className="pl-2 before:content-['•'] before:mr-1.5">{tip}</p>
                ))}
              </div>
            </div>
          </div>

          {/* result */}
          <div>
            {!result && !loading && (
              <div className="h-full min-h-64 flex flex-col items-center justify-center text-center text-gray-400 dark:text-gray-600 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-8">
                <BarChart2 size={40} className="mb-3 opacity-40" />
                <p className="text-sm font-medium">Paste news text or upload an image, then click Analyze</p>
                <p className="text-xs mt-1">AI will provide sentiment, key takeaways, and trade recommendations</p>
              </div>
            )}
            {loading && (
              <div className="h-full min-h-64 flex flex-col items-center justify-center gap-3 text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                <RefreshCw size={32} className="animate-spin opacity-60" />
                <p className="text-sm">Analyzing with Claude AI…</p>
              </div>
            )}
            {result && (
              <AnalysisResult
                result={result}
                saved={saved}
                onSave={saveToHistory}
                onUpdateStatus={updateResultStatus}
              />
            )}
          </div>
        </div>
      )}

      {/* ── History tab ── */}
      {tab === 'history' && (
        <div className="space-y-4">
          {history.length === 0 ? (
            <div className="text-center py-16 text-gray-400 dark:text-gray-600">
              <BookOpen size={36} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">No history yet. Analyze and save some news first.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500 dark:text-gray-400">{history.length} saved analys{history.length === 1 ? 'is' : 'es'}</p>
                <button
                  onClick={() => { if (confirm('Clear all history?')) { persistHistory([]); setViewEntry(null); } }}
                  className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
                >
                  <Trash2 size={12} /> Clear All
                </button>
              </div>

              {viewEntry ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <button onClick={() => setViewEntry(null)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                      ← Back to list
                    </button>
                    <span className="text-xs text-gray-400">{fmtDate(viewEntry.createdAt)}</span>
                  </div>
                  <AnalysisResult
                    result={viewEntry}
                    saved={true}
                    onSave={() => {}}
                    onUpdateStatus={(type, recId, status) => {
                      const key  = type === 'option' ? 'optionRecommendations' : 'stockRecommendations';
                      const next = { ...viewEntry, [key]: viewEntry[key].map(r => r.id === recId ? { ...r, status } : r) };
                      setViewEntry(next);
                      persistHistory(history.map(e => e.id === viewEntry.id ? next : e));
                    }}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {history.map(entry => (
                    <HistoryEntry
                      key={entry.id}
                      entry={entry}
                      onDelete={deleteEntry}
                      onView={setViewEntry}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── All Recs tab ── */}
      {tab === 'recs' && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
            <Target size={16} /> All Recommendations
            <span className="text-xs font-normal text-gray-400 ml-1">— aggregated from all history. Click status to cycle.</span>
          </h2>
          <AllRecsView history={history} onUpdateStatus={updateHistoryStatus} />
        </div>
      )}
    </div>
  );
}
