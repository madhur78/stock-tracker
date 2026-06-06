import { useState, useMemo } from 'react';
import { useData } from '../contexts/DataContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Award, Target, ChevronDown, ChevronUp,
  Calendar, Tag, Briefcase, Cpu, MessageSquare, Filter, Search, X,
} from 'lucide-react';
import {
  format, parseISO, startOfWeek, endOfWeek, addDays,
} from 'date-fns';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const curr = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n || 0);

const pct = (n) => `${n.toFixed(1)}%`;

function weekKey(dateStr) {
  const d = parseISO(dateStr);
  const start = startOfWeek(d, { weekStartsOn: 1 });
  return format(start, 'yyyy-MM-dd');
}

function weekLabel(key) {
  const start = parseISO(key);
  const end = endOfWeek(start, { weekStartsOn: 1 });
  return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
}

function stopWords() {
  return new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','was',
    'is','it','this','that','be','are','as','by','from','have','i','my','we','not',
    'no','so','up','do','if','all','can','had','has','its','he','she','they','were',
    'been','will','would','could','should','may','might','more','their','then','than',
    'very','just','get','got','out','about','into','after','before','over','when','how',
    'am','an','at','me','his','her','our','us','them','what','which','who','your']);
}

function topKeywords(transactions, n = 15) {
  const freq = {};
  const stop = stopWords();
  transactions.forEach(t => {
    if (!t.comments?.trim()) return;
    t.comments
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stop.has(w))
      .forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  });
  return Object.entries(freq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([word, count]) => ({ word, count }));
}

function groupStats(txList) {
  const count = txList.length;
  const pl    = txList.reduce((s, t) => s + (parseFloat(t.pl) || 0), 0);
  const buy   = txList.reduce((s, t) => s + (parseFloat(t.buyAmount) || 0), 0);
  const sell  = txList.reduce((s, t) => s + (parseFloat(t.sellAmount) || 0), 0);
  const wins  = txList.filter(t => (parseFloat(t.pl) || 0) > 0).length;
  const winRate = count > 0 ? (wins / count) * 100 : 0;
  const plValues = txList.map(t => parseFloat(t.pl) || 0);
  const bestTrade  = plValues.length ? Math.max(...plValues) : 0;
  const worstTrade = plValues.length ? Math.min(...plValues) : 0;
  return { count, pl, buy, sell, wins, winRate, bestTrade, worstTrade };
}

function buildGroups(transactions, keyFn) {
  const map = {};
  transactions.forEach(t => {
    const k = keyFn(t) || '(None)';
    if (!map[k]) map[k] = [];
    map[k].push(t);
  });
  return Object.entries(map).map(([key, txList]) => ({
    key,
    txList,
    ...groupStats(txList),
  }));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCards({ groups }) {
  const totalPL   = groups.reduce((s, g) => s + g.pl, 0);
  const totalTx   = groups.reduce((s, g) => s + g.count, 0);
  const best  = groups.length ? groups.reduce((a, b) => a.pl > b.pl ? a : b) : null;
  const worst = groups.length ? groups.reduce((a, b) => a.pl < b.pl ? a : b) : null;
  const winRate = totalTx > 0
    ? (groups.reduce((s, g) => s + g.wins, 0) / totalTx) * 100
    : 0;

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      {[
        { label: 'Groups', value: groups.length, icon: Target, color: 'bg-blue-500' },
        { label: 'Total P/L', value: curr(totalPL), icon: totalPL >= 0 ? TrendingUp : TrendingDown, color: totalPL >= 0 ? 'bg-green-500' : 'bg-red-500' },
        { label: 'Best Group', value: best ? curr(best.pl) : '—', sub: best?.key, icon: Award, color: 'bg-purple-500' },
        { label: 'Win Rate', value: pct(winRate), sub: `${groups.reduce((s, g) => s + g.wins, 0)} of ${totalTx} trades`, icon: Target, color: 'bg-orange-500' },
      ].map(({ label, value, sub, icon: Icon, color }) => (
        <div key={label} className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
            <div className={`w-7 h-7 rounded-md flex items-center justify-center ${color}`}>
              <Icon size={14} className="text-white" />
            </div>
          </div>
          <p className="text-lg font-bold text-gray-900 dark:text-white truncate">{value}</p>
          {sub && <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{sub}</p>}
        </div>
      ))}
    </div>
  );
}

const CHART_TICK_STYLE = { fontSize: 11, fill: '#9ca3af' };

function PLBarChart({ groups, labelKey = 'key', maxBars = 20 }) {
  const data = [...groups]
    .sort((a, b) => Math.abs(b.pl) - Math.abs(a.pl))
    .slice(0, maxBars)
    .map(g => ({ name: g[labelKey] ?? g.key, pl: parseFloat(g.pl.toFixed(2)) }));

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const val = payload[0].value;
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 shadow-lg text-xs">
        <p className="font-semibold text-gray-800 dark:text-white mb-0.5">{label}</p>
        <p className={val >= 0 ? 'text-green-600' : 'text-red-500'}>{curr(val)}</p>
      </div>
    );
  };

  if (!data.length) return null;
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">P/L by Group</h3>
      <ResponsiveContainer width="100%" height={Math.max(200, data.length * 28)}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
          <XAxis type="number" tick={CHART_TICK_STYLE} tickFormatter={v => `$${v}`} stroke="#9ca3af" />
          <YAxis type="category" dataKey="name" width={110} tick={{ ...CHART_TICK_STYLE, textAnchor: 'end' }} stroke="none" />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine x={0} stroke="#9ca3af" strokeWidth={1} />
          <Bar dataKey="pl" radius={[0, 4, 4, 0]} maxBarSize={20}>
            {data.map((d, i) => <Cell key={i} fill={d.pl >= 0 ? '#22c55e' : '#ef4444'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const SORT_COLS = [
  { key: 'key',      label: 'Group' },
  { key: 'count',    label: 'Trades' },
  { key: 'winRate',  label: 'Win %' },
  { key: 'buy',      label: 'Buy Total' },
  { key: 'sell',     label: 'Sell Total' },
  { key: 'pl',       label: 'P/L' },
  { key: 'bestTrade',  label: 'Best Trade' },
  { key: 'worstTrade', label: 'Worst Trade' },
];

function GroupTable({ groups, labelFn }) {
  const [sort, setSort] = useState({ key: 'pl', dir: 'desc' });
  const [expanded, setExpanded] = useState(null);
  const [txSort, setTxSort] = useState({ key: 'date', dir: 'desc' });

  const sorted = useMemo(() => {
    return [...groups].sort((a, b) => {
      const av = a[sort.key] ?? ''; const bv = b[sort.key] ?? '';
      if (av < bv) return sort.dir === 'asc' ? -1 : 1;
      if (av > bv) return sort.dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [groups, sort]);

  const toggleSort = (key) =>
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });

  const SortIcon = ({ k }) => {
    if (sort.key !== k) return <span className="opacity-20">↕</span>;
    return sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  };

  const sortedTx = (txList) =>
    [...txList].sort((a, b) => {
      let av = a[txSort.key] ?? ''; let bv = b[txSort.key] ?? '';
      if (['buyAmount','sellAmount','pl'].includes(txSort.key)) { av = parseFloat(av)||0; bv = parseFloat(bv)||0; }
      if (av < bv) return txSort.dir === 'asc' ? -1 : 1;
      if (av > bv) return txSort.dir === 'asc' ? 1 : -1;
      return 0;
    });

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
              <th className="px-4 py-3 w-6" />
              {SORT_COLS.map(c => (
                <th
                  key={c.key}
                  onClick={() => toggleSort(c.key)}
                  className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide cursor-pointer select-none whitespace-nowrap"
                >
                  <span className="inline-flex items-center gap-1">{c.label} <SortIcon k={c.key} /></span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {sorted.map(g => {
              const isOpen = expanded === g.key;
              const pl = g.pl;
              const label = labelFn ? labelFn(g.key) : g.key;
              return [
                <tr
                  key={g.key}
                  onClick={() => setExpanded(isOpen ? null : g.key)}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer transition-colors"
                >
                  <td className="px-3 py-3 text-gray-400">
                    {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white whitespace-nowrap">{label}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{g.count}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${g.winRate >= 50 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                      {pct(g.winRate)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{curr(g.buy)}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{curr(g.sell)}</td>
                  <td className={`px-4 py-3 font-bold ${pl >= 0 ? 'text-green-600' : 'text-red-500'}`}>{curr(pl)}</td>
                  <td className="px-4 py-3 text-green-600 font-medium">{curr(g.bestTrade)}</td>
                  <td className="px-4 py-3 text-red-500 font-medium">{curr(g.worstTrade)}</td>
                </tr>,
                isOpen && (
                  <tr key={`${g.key}-exp`} className="bg-blue-50/40 dark:bg-blue-950/20">
                    <td colSpan={9} className="px-4 py-0">
                      <div className="py-3">
                        <div className="flex gap-3 mb-2">
                          {['date','symbol','buyAmount','sellAmount','pl'].map(k => (
                            <button
                              key={k}
                              onClick={e => { e.stopPropagation(); setTxSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'desc' }); }}
                              className={`text-xs px-2 py-1 rounded border transition-colors ${txSort.key === k ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                            >
                              {k} {txSort.key === k ? (txSort.dir === 'asc' ? '↑' : '↓') : ''}
                            </button>
                          ))}
                        </div>
                        <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-gray-100 dark:bg-gray-800">
                                {['Date','Symbol','Contracts','Buy Amt','Sell Amt','P/L','Account','Provider','Comments'].map(h => (
                                  <th key={h} className="text-left px-3 py-2 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-900">
                              {sortedTx(g.txList).map(t => {
                                const tpl = parseFloat(t.pl) || 0;
                                return (
                                  <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">{t.date}</td>
                                    <td className="px-3 py-2 font-semibold text-gray-900 dark:text-white">{t.symbol}</td>
                                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{t.optionCount || '—'}</td>
                                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{curr(t.buyAmount)}</td>
                                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{curr(t.sellAmount)}</td>
                                    <td className={`px-3 py-2 font-bold ${tpl >= 0 ? 'text-green-600' : 'text-red-500'}`}>{curr(tpl)}</td>
                                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{t.account || '—'}</td>
                                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{t.serviceProvider || '—'}</td>
                                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400 max-w-[180px] truncate" title={t.comments}>{t.comments || '—'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </td>
                  </tr>
                ),
              ];
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-400">No data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CommentsReport({ transactions }) {
  const [search, setSearch] = useState('');

  const withComments = useMemo(
    () => transactions.filter(t => t.comments?.trim()),
    [transactions],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return withComments;
    const q = search.toLowerCase();
    return withComments.filter(t => t.comments.toLowerCase().includes(q));
  }, [withComments, search]);

  const keywords = useMemo(() => topKeywords(withComments), [withComments]);

  function highlight(text, query) {
    if (!query.trim()) return text;
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((p, i) =>
      p.toLowerCase() === query.toLowerCase()
        ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-700 rounded px-0.5">{p}</mark>
        : p
    );
  }

  const totalPL = filtered.reduce((s, t) => s + (parseFloat(t.pl) || 0), 0);

  return (
    <div className="space-y-5">
      {/* Keyword frequency */}
      {keywords.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Top Keywords in Comments</h3>
          <div className="flex flex-wrap gap-2">
            {keywords.map(({ word, count }) => (
              <button
                key={word}
                onClick={() => setSearch(s => s === word ? '' : word)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  search === word
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600'
                }`}
              >
                {word} <span className="opacity-60">×{count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9 text-sm"
            placeholder="Search comments…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {search && (
          <button onClick={() => setSearch('')} className="btn-secondary text-sm flex items-center gap-1.5">
            <X size={13} /> Clear
          </button>
        )}
        <p className="text-sm text-gray-500 dark:text-gray-400 ml-auto">
          {filtered.length} trade{filtered.length !== 1 ? 's' : ''} · {curr(totalPL)} P/L
        </p>
      </div>

      {/* Transaction list */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
                {['Date','Symbol','Account','P/L','Comment'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">
                  {withComments.length === 0 ? 'No transactions have comments yet.' : 'No matches found.'}
                </td></tr>
              )}
              {filtered.map(t => {
                const pl = parseFloat(t.pl) || 0;
                return (
                  <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 align-top">
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{t.date}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{t.symbol}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{t.account || '—'}</td>
                    <td className={`px-4 py-3 font-bold whitespace-nowrap ${pl >= 0 ? 'text-green-600' : 'text-red-500'}`}>{curr(pl)}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 max-w-xs">
                      <span className="text-xs leading-relaxed">{highlight(t.comments, search)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'weekly',   label: 'Weekly',         icon: Calendar },
  { id: 'symbol',   label: 'By Symbol',       icon: Tag },
  { id: 'account',  label: 'By Account',      icon: Briefcase },
  { id: 'provider', label: 'By Provider',     icon: Cpu },
  { id: 'comments', label: 'By Comments',     icon: MessageSquare },
];

const GROUP_KEY_FN = {
  weekly:   t => weekKey(t.date),
  symbol:   t => (t.symbol || '').toUpperCase().trim() || '(No Symbol)',
  account:  t => t.account?.trim()          || '(No Account)',
  provider: t => t.serviceProvider?.trim()  || '(No Provider)',
};

export default function Reports() {
  const { transactions } = useData();
  const [activeTab, setActiveTab] = useState('weekly');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [filterOpen, setFilterOpen] = useState(false);

  const filtered = useMemo(() => {
    let r = transactions;
    if (dateFrom) r = r.filter(t => t.date >= dateFrom);
    if (dateTo)   r = r.filter(t => t.date <= dateTo);
    return r;
  }, [transactions, dateFrom, dateTo]);

  const groups = useMemo(() => {
    if (activeTab === 'comments') return [];
    const gfn = GROUP_KEY_FN[activeTab];
    return buildGroups(filtered, gfn);
  }, [filtered, activeTab]);

  const labelFn = activeTab === 'weekly' ? weekLabel : null;

  // For weekly tab keep chronological order by default
  const displayGroups = useMemo(() => {
    if (activeTab !== 'weekly') return groups;
    return [...groups].sort((a, b) => a.key.localeCompare(b.key));
  }, [groups, activeTab]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Reports</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Analyse performance by week, symbol, account, provider and comments
          </p>
        </div>

        {/* Date filter toggle */}
        <button
          onClick={() => setFilterOpen(o => !o)}
          className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border transition-colors ${
            (dateFrom || dateTo)
              ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400'
              : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <Filter size={15} />
          {dateFrom || dateTo ? 'Filter active' : 'Date filter'}
          {filterOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Date range filter */}
      {filterOpen && (
        <div className="card p-4 flex flex-wrap gap-4 items-end">
          <div>
            <label className="label">From</label>
            <input type="date" className="input text-sm w-44" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" className="input text-sm w-44" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="btn-secondary text-sm">Clear</button>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400 self-end pb-1">
            {filtered.length} of {transactions.length} transactions
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit flex-wrap">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === id
                ? 'bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="card p-12 text-center">
          <TrendingUp size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">No transactions found for the selected period.</p>
        </div>
      )}

      {/* Tab content */}
      {filtered.length > 0 && activeTab !== 'comments' && (
        <>
          <SummaryCards groups={displayGroups} />
          <PLBarChart groups={displayGroups} labelKey={activeTab === 'weekly' ? 'label' : 'key'} />
          <GroupTable
            groups={displayGroups.map(g => ({
              ...g,
              label: activeTab === 'weekly' ? weekLabel(g.key) : g.key,
            }))}
            labelFn={activeTab === 'weekly' ? weekLabel : null}
          />
        </>
      )}

      {filtered.length > 0 && activeTab === 'comments' && (
        <CommentsReport transactions={filtered} />
      )}
    </div>
  );
}
