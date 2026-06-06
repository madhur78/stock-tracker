import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import { useNotification } from '../components/Notification';
import ConfirmDialog from '../components/ConfirmDialog';
import { Search, Plus, Edit2, Trash2, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const PAGE_SIZE = 15;

export default function Transactions() {
  const { transactions, deleteTransaction } = useData();
  const { show } = useNotification();
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState(null);

  const filtered = useMemo(() => {
    let result = [...transactions];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(t =>
        t.symbol?.toLowerCase().includes(q) ||
        t.account?.toLowerCase().includes(q) ||
        t.serviceProvider?.toLowerCase().includes(q) ||
        t.comments?.toLowerCase().includes(q)
      );
    }
    if (dateFrom) result = result.filter(t => t.date >= dateFrom);
    if (dateTo) result = result.filter(t => t.date <= dateTo);
    result.sort((a, b) => {
      let av = a[sort.key] ?? '';
      let bv = b[sort.key] ?? '';
      if (['buyAmount', 'sellAmount', 'pl', 'buyPrice', 'sellPrice', 'optionCount'].includes(sort.key)) {
        av = parseFloat(av) || 0; bv = parseFloat(bv) || 0;
      }
      if (av < bv) return sort.dir === 'asc' ? -1 : 1;
      if (av > bv) return sort.dir === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [transactions, search, dateFrom, dateTo, sort]);

  const pages = Math.ceil(filtered.length / PAGE_SIZE);
  const current = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const setSort2 = (key) => {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
    setPage(1);
  };

  const SortIcon = ({ k }) => {
    if (sort.key !== k) return <ChevronsUpDown size={13} className="opacity-30" />;
    return sort.dir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />;
  };

  const handleDelete = () => {
    deleteTransaction(deleteId);
    show('Transaction deleted');
    setDeleteId(null);
  };

  const cols = [
    { key: 'date', label: 'Date' },
    { key: 'symbol', label: 'Symbol' },
    { key: 'optionCount', label: 'Contracts' },
    { key: 'buyAmount', label: 'Buy Amt' },
    { key: 'sellAmount', label: 'Sell Amt' },
    { key: 'pl', label: 'P/L' },
    { key: 'account', label: 'Account' },
    { key: 'serviceProvider', label: 'Provider' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Transactions</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{filtered.length} records</p>
        </div>
        <Link to="/add" className="btn-primary flex items-center gap-2 text-sm"><Plus size={16} />Add Trade</Link>
      </div>

      <div className="card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9 text-sm" placeholder="Search symbol, account..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <input type="date" className="input text-sm w-40" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} title="From date" />
        <input type="date" className="input text-sm w-40" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} title="To date" />
        {(search || dateFrom || dateTo) && (
          <button onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); setPage(1); }} className="btn-secondary text-sm">Clear</button>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                {cols.map(c => (
                  <th key={c.key} className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide cursor-pointer select-none whitespace-nowrap" onClick={() => setSort2(c.key)}>
                    <span className="flex items-center gap-1">{c.label} <SortIcon k={c.key} /></span>
                  </th>
                ))}
                <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {current.length === 0 ? (
                <tr><td colSpan={cols.length + 1} className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">No transactions found</td></tr>
              ) : current.map(t => {
                const pl = parseFloat(t.pl) || 0;
                return (
                  <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{t.date}<span className="ml-1 text-xs text-gray-400">{t.day?.slice(0,3)}</span></td>
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{t.symbol}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{t.optionCount || '—'}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{fmt(t.buyAmount)}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{fmt(t.sellAmount)}</td>
                    <td className={`px-4 py-3 font-semibold ${pl >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmt(pl)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{t.account || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{t.serviceProvider || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Link to={`/edit/${t.id}`} className="p-1.5 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 transition-colors"><Edit2 size={15} /></Link>
                        <button onClick={() => setDeleteId(t.id)} className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 transition-colors"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Page {page} of {pages}</p>
            <div className="flex gap-1">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 text-xs rounded-md border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800">Prev</button>
              {Array.from({ length: Math.min(5, pages) }, (_, i) => {
                const pg = Math.max(1, Math.min(page - 2, pages - 4)) + i;
                return (
                  <button key={pg} onClick={() => setPage(pg)} className={`px-3 py-1.5 text-xs rounded-md border ${pg === page ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>{pg}</button>
                );
              })}
              <button disabled={page === pages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 text-xs rounded-md border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800">Next</button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete Transaction"
        message="Are you sure you want to delete this transaction? This action cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
