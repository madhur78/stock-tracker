import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { RefreshCw, Trash2, Zap, TrendingUp, Database, DollarSign, Activity } from 'lucide-react';

// ── Pricing constants (per 1M tokens) ────────────────────────────────────────
const MODEL_LABEL = {
  'claude-haiku-4-5-20251001': 'Haiku 4.5',
  'claude-haiku-4-5': 'Haiku 4.5',
  'claude-sonnet-4-5': 'Sonnet 4.5',
  'claude-opus-4-8': 'Opus 4.8',
};

function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtK(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}
function fmtCost(n) {
  if (n == null) return '—';
  if (n < 0.01) return '<$0.01';
  return '$' + fmt(n);
}
function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function StatCard({ label, value, sub, icon: Icon, color = 'text-gray-900 dark:text-white' }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
        {Icon && <Icon size={16} className="text-gray-400 dark:text-gray-500" />}
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

// ── Build daily chart data from claudeCalls ───────────────────────────────────
function buildDailyData(calls) {
  const byDate = {};
  calls.forEach(c => {
    if (!byDate[c.date]) byDate[c.date] = { date: c.date, input: 0, output: 0, cost: 0, calls: 0 };
    byDate[c.date].input  += c.inputTokens;
    byDate[c.date].output += c.outputTokens;
    byDate[c.date].cost   += c.costUSD;
    byDate[c.date].calls  += 1;
  });
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
}

export default function TokenDashboard() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/usage');
      if (!r.ok) throw new Error('Failed to fetch usage data');
      setData(await r.json());
      setLastRefresh(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const clearData = async () => {
    if (!confirm('Reset all usage data? This cannot be undone.')) return;
    setClearing(true);
    await fetch('/api/usage/clear', { method: 'POST' });
    await load();
    setClearing(false);
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const calls     = data?.claudeCalls ?? [];
  const reqCounts = data?.requestCounts ?? { market: 0, history: 0, news: 0 };
  const hasKey    = !!import.meta.env.VITE_HAS_ANTHROPIC_KEY; // optional env flag

  // Aggregates
  const totalCalls  = calls.length;
  const totalInput  = calls.reduce((s, c) => s + c.inputTokens, 0);
  const totalOutput = calls.reduce((s, c) => s + c.outputTokens, 0);
  const totalCost   = calls.reduce((s, c) => s + c.costUSD, 0);
  const recentCalls = [...calls].reverse().slice(0, 50);
  const dailyData   = buildDailyData(calls);

  const customTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-xs shadow-lg">
        <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">{label}</p>
        {payload.map(p => (
          <p key={p.name} style={{ color: p.color }}>
            {p.name}: {fmtK(p.value)}
          </p>
        ))}
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Cost: {fmtCost(dailyData.find(d => d.date === label)?.cost)}
        </p>
      </div>
    );
  };

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Token Usage Dashboard</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Claude API usage · Haiku 4.5 @ $0.80 / $4.00 per 1M tokens (input / output)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-xs text-gray-400">
              Updated {lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button onClick={load} disabled={loading}
            className="btn-secondary flex items-center gap-1.5 text-sm py-1.5 px-3">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button onClick={clearData} disabled={clearing}
            className="flex items-center gap-1.5 text-sm py-1.5 px-3 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
            <Trash2 size={13} /> Clear
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="AI Calls" value={totalCalls} sub="Claude API requests" icon={Zap}
          color={totalCalls > 0 ? 'text-purple-600 dark:text-purple-400' : 'text-gray-900 dark:text-white'} />
        <StatCard label="Input Tokens" value={fmtK(totalInput)} sub="sent to Claude" icon={TrendingUp} />
        <StatCard label="Output Tokens" value={fmtK(totalOutput)} sub="returned by Claude" icon={Activity} />
        <StatCard label="Est. Cost" value={fmtCost(totalCost)} sub="USD based on list pricing" icon={DollarSign}
          color={totalCost > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-white'} />
      </div>

      {/* API Request Counts */}
      <div className="card p-5">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4 flex items-center gap-2">
          <Database size={13} /> API Request Counts (this session + all-time)
        </h3>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Market Quotes', count: reqCounts.market,  color: 'bg-blue-500' },
            { label: 'Stock History', count: reqCounts.history, color: 'bg-indigo-500' },
            { label: 'News Fetches',  count: reqCounts.news,    color: 'bg-violet-500' },
          ].map(({ label, count, color }) => (
            <div key={label} className="flex items-center gap-3">
              <div className={`w-2 h-8 rounded-full ${color} opacity-70`} />
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{count.toLocaleString()}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Daily Token Usage Chart */}
      {dailyData.length > 0 ? (
        <div className="card p-5">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
            Daily Token Usage (last 30 days)
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailyData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.06} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip content={customTooltip} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="input"  name="Input tokens"  fill="#818cf8" radius={[2, 2, 0, 0]} stackId="a" />
              <Bar dataKey="output" name="Output tokens" fill="#a78bfa" radius={[2, 2, 0, 0]} stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="card p-10 text-center">
          <Zap size={36} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No Claude API calls recorded yet</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Set <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">ANTHROPIC_API_KEY</code> and use News &amp; Research to generate AI summaries
          </p>
        </div>
      )}

      {/* Recent Calls Table */}
      {recentCalls.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Recent AI Calls (last 50)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Time</th>
                  <th className="text-left px-3 py-3">Symbol</th>
                  <th className="text-left px-3 py-3">Model</th>
                  <th className="text-right px-3 py-3">Input</th>
                  <th className="text-right px-3 py-3">Output</th>
                  <th className="text-right px-3 py-3">Total</th>
                  <th className="text-right px-4 py-3">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {recentCalls.map((c, i) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 whitespace-nowrap text-xs">
                      {fmtTime(c.ts)}
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-gray-900 dark:text-white">{c.symbol}</td>
                    <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 text-xs">
                      {MODEL_LABEL[c.model] ?? c.model}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700 dark:text-gray-300">{fmtK(c.inputTokens)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700 dark:text-gray-300">{fmtK(c.outputTokens)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700 dark:text-gray-300">
                      {fmtK(c.inputTokens + c.outputTokens)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-green-600 dark:text-green-400">
                      {fmtCost(c.costUSD)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 dark:bg-gray-800 text-xs font-semibold text-gray-600 dark:text-gray-300">
                  <td className="px-4 py-2.5 text-gray-400 dark:text-gray-500" colSpan={3}>Totals</td>
                  <td className="px-3 py-2.5 text-right">{fmtK(totalInput)}</td>
                  <td className="px-3 py-2.5 text-right">{fmtK(totalOutput)}</td>
                  <td className="px-3 py-2.5 text-right">{fmtK(totalInput + totalOutput)}</td>
                  <td className="px-4 py-2.5 text-right text-green-600 dark:text-green-400">{fmtCost(totalCost)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
