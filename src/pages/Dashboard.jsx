import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell
} from 'recharts';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { TrendingUp, TrendingDown, DollarSign, Activity, ArrowRight } from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);

function SummaryCard({ title, value, icon: Icon, color, sub }) {
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</span>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon size={20} className="text-white" />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

const COLORS = ['#22c55e', '#ef4444'];

export default function Dashboard() {
  const { user } = useAuth();
  const { transactions, summary } = useData();
  const stats = summary();

  const dailyData = useMemo(() => {
    const map = {};
    transactions.forEach(t => {
      const d = t.date;
      if (!map[d]) map[d] = 0;
      map[d] += parseFloat(t.pl) || 0;
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30)
      .map(([date, pl]) => ({ date: format(parseISO(date), 'MMM d'), pl: parseFloat(pl.toFixed(2)) }));
  }, [transactions]);

  const monthlyData = useMemo(() => {
    const map = {};
    transactions.forEach(t => {
      const m = t.date.slice(0, 7);
      if (!map[m]) map[m] = 0;
      map[m] += parseFloat(t.pl) || 0;
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, pl]) => ({ month: format(parseISO(month + '-01'), 'MMM yy'), pl: parseFloat(pl.toFixed(2)) }));
  }, [transactions]);

  const pieData = useMemo(() => {
    const profit = transactions.filter(t => (parseFloat(t.pl) || 0) > 0).reduce((s, t) => s + parseFloat(t.pl), 0);
    const loss = Math.abs(transactions.filter(t => (parseFloat(t.pl) || 0) < 0).reduce((s, t) => s + parseFloat(t.pl), 0));
    return [
      { name: 'Profit', value: parseFloat(profit.toFixed(2)) },
      { name: 'Loss', value: parseFloat(loss.toFixed(2)) },
    ];
  }, [transactions]);

  const recent = transactions.slice(0, 5);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const val = payload[0].value;
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 shadow-lg text-sm">
        <p className="font-medium text-gray-900 dark:text-white">{label}</p>
        <p className={val >= 0 ? 'text-green-600' : 'text-red-500'}>{fmt(val)}</p>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Good {getGreeting()}, {user?.name?.split(' ')[0]}!</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard title="Total Trades" value={stats.count} icon={Activity} color="bg-blue-500" sub="All time" />
        <SummaryCard title="Total P/L" value={fmt(stats.totalPL)} icon={stats.totalPL >= 0 ? TrendingUp : TrendingDown} color={stats.totalPL >= 0 ? 'bg-green-500' : 'bg-red-500'} sub="Profit / Loss" />
        <SummaryCard title="Total Buy" value={fmt(stats.totalBuy)} icon={DollarSign} color="bg-purple-500" sub="Total invested" />
        <SummaryCard title="Total Sell" value={fmt(stats.totalSell)} icon={DollarSign} color="bg-orange-500" sub="Total received" />
      </div>

      {transactions.length === 0 ? (
        <div className="card p-12 text-center">
          <Activity size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No trades yet</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Start adding your transactions to see analytics.</p>
          <Link to="/add" className="btn-primary inline-flex items-center gap-2">Add First Trade</Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="card p-6 xl:col-span-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Daily P/L (Last 30 days)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={dailyData}>
                  <defs>
                    <linearGradient id="plGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={v => `$${v}`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="pl" stroke="#3b82f6" fill="url(#plGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="card p-6">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Profit vs Loss</h3>
              {pieData[0].value === 0 && pieData[1].value === 0 ? (
                <p className="text-center text-gray-400 text-sm mt-10">No data</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmt(v)} />
                    <Legend formatter={(v) => <span className="text-sm text-gray-600 dark:text-gray-400">{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="card p-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Monthly P/L</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={v => `$${v}`} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="pl" radius={[4, 4, 0, 0]}>
                  {monthlyData.map((entry, i) => <Cell key={i} fill={entry.pl >= 0 ? '#22c55e' : '#ef4444'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Recent Transactions</h3>
              <Link to="/transactions" className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
                View all <ArrowRight size={14} />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/50">
                    {['Date', 'Symbol', 'Account', 'Buy Amt', 'Sell Amt', 'P/L'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {recent.map(t => {
                    const pl = parseFloat(t.pl) || 0;
                    return (
                      <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{t.date}</td>
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{t.symbol}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{t.account || '—'}</td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{fmt(t.buyAmount || 0)}</td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{fmt(t.sellAmount || 0)}</td>
                        <td className={`px-4 py-3 font-semibold ${pl >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmt(pl)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
