import { useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import { format, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight, Edit2 } from 'lucide-react';

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

export default function DailyView() {
  const { transactions } = useData();
  const location = useLocation();
  const initDate = location.state?.date || format(new Date(), 'yyyy-MM-dd');
  const [selectedDate, setSelectedDate] = useState(initDate);

  const days = useMemo(() => {
    const map = {};
    transactions.forEach(t => {
      if (!map[t.date]) map[t.date] = { count: 0, pl: 0 };
      map[t.date].count++;
      map[t.date].pl += parseFloat(t.pl) || 0;
    });
    return map;
  }, [transactions]);

  const sortedDays = useMemo(() => Object.keys(days).sort((a, b) => b.localeCompare(a)), [days]);

  const dayTx = useMemo(() => transactions.filter(t => t.date === selectedDate), [transactions, selectedDate]);

  const dayStats = useMemo(() => ({
    count: dayTx.length,
    pl: dayTx.reduce((s, t) => s + (parseFloat(t.pl) || 0), 0),
    buy: dayTx.reduce((s, t) => s + (parseFloat(t.buyAmount) || 0), 0),
    sell: dayTx.reduce((s, t) => s + (parseFloat(t.sellAmount) || 0), 0),
  }), [dayTx]);

  const navDate = (dir) => {
    const idx = sortedDays.indexOf(selectedDate);
    const next = idx + dir;
    if (next >= 0 && next < sortedDays.length) setSelectedDate(sortedDays[next]);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Daily View</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">Browse transactions by day</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Trading Days</h3>
          </div>
          <div className="overflow-y-auto max-h-[500px] divide-y divide-gray-100 dark:divide-gray-700">
            {sortedDays.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-8">No trading days yet</p>
            )}
            {sortedDays.map(d => {
              const info = days[d];
              const active = d === selectedDate;
              return (
                <button
                  key={d}
                  onClick={() => setSelectedDate(d)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${active ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800/30'}`}
                >
                  <div>
                    <p className={`text-sm font-medium ${active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-white'}`}>
                      {format(parseISO(d), 'MMM d, yyyy')}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{format(parseISO(d), 'EEEE')} · {info.count} trade{info.count !== 1 ? 's' : ''}</p>
                  </div>
                  <span className={`text-sm font-semibold ${info.pl >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmt(info.pl)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="card p-4 flex items-center justify-between">
            <button onClick={() => navDate(1)} disabled={sortedDays.indexOf(selectedDate) >= sortedDays.length - 1} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30">
              <ChevronLeft size={18} />
            </button>
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900 dark:text-white">{format(parseISO(selectedDate), 'MMMM d, yyyy')}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{format(parseISO(selectedDate), 'EEEE')}</p>
            </div>
            <button onClick={() => navDate(-1)} disabled={sortedDays.indexOf(selectedDate) <= 0} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30">
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Trades', value: dayStats.count },
              { label: 'P/L', value: fmt(dayStats.pl), color: dayStats.pl >= 0 ? 'text-green-600' : 'text-red-500' },
              { label: 'Buy Total', value: fmt(dayStats.buy) },
              { label: 'Sell Total', value: fmt(dayStats.sell) },
            ].map(s => (
              <div key={s.label} className="card p-4 text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{s.label}</p>
                <p className={`text-lg font-bold ${s.color || 'text-gray-900 dark:text-white'}`}>{s.value}</p>
              </div>
            ))}
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Transactions</h3>
            </div>
            {dayTx.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-8">No transactions for this day</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50">
                      {['Symbol', 'Contracts', 'Buy Amt', 'Sell Amt', 'P/L', 'Account', ''].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {dayTx.map(t => {
                      const pl = parseFloat(t.pl) || 0;
                      return (
                        <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                          <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{t.symbol}</td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{t.optionCount || '—'}</td>
                          <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{fmt(t.buyAmount)}</td>
                          <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{fmt(t.sellAmount)}</td>
                          <td className={`px-4 py-3 font-semibold ${pl >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmt(pl)}</td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{t.account || '—'}</td>
                          <td className="px-4 py-3">
                            <Link to={`/edit/${t.id}`} className="p-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 inline-flex"><Edit2 size={14} /></Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
