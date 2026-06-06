import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useNotification } from '../components/Notification';
import { useData } from '../contexts/DataContext';
import { Sun, Moon, Download, Trash2, User, Shield } from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Settings() {
  const { user } = useAuth();
  const { dark, toggle } = useTheme();
  const { show } = useNotification();
  const { transactions } = useData();
  const [clearConfirm, setClearConfirm] = useState(false);

  const exportBackup = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      user: user?.email,
      transactions,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stocktracker_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    show('Backup downloaded');
  };

  const clearData = () => {
    if (!user) return;
    localStorage.removeItem(`stocktracker_transactions_${user.id}`);
    window.location.reload();
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">Manage your account and preferences</p>
      </div>

      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <User size={18} className="text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Account</h3>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">Name</p>
            <p className="font-medium text-gray-900 dark:text-white">{user?.name}</p>
          </div>
          <div>
            <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">Email</p>
            <p className="font-medium text-gray-900 dark:text-white">{user?.email}</p>
          </div>
        </div>
      </div>

      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Sun size={18} className="text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Appearance</h3>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Dark Mode</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Switch between light and dark theme</p>
          </div>
          <button
            onClick={toggle}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${dark ? 'bg-blue-600' : 'bg-gray-200'}`}
          >
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${dark ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <Shield size={18} className="text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Data Management</h3>
        </div>
        <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Export Backup</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Download all your data as a JSON backup file</p>
          </div>
          <button onClick={exportBackup} className="btn-secondary text-sm flex items-center gap-2">
            <Download size={15} />Export
          </button>
        </div>
        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm font-medium text-red-600">Clear All Data</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Permanently delete all transactions for this account</p>
          </div>
          <button onClick={() => setClearConfirm(true)} className="btn-danger text-sm flex items-center gap-2">
            <Trash2 size={15} />Clear
          </button>
        </div>
      </div>

      <div className="card p-6 text-sm text-gray-500 dark:text-gray-400">
        <p className="font-semibold text-gray-700 dark:text-gray-300 mb-2">About</p>
        <p>Stock & Options Transaction Tracker v1.0</p>
        <p className="mt-1">All data is stored locally in your browser. No data is sent to any server.</p>
        <p className="mt-1">Transactions stored: <strong className="text-gray-900 dark:text-white">{transactions.length}</strong></p>
      </div>

      <ConfirmDialog
        open={clearConfirm}
        title="Clear All Data"
        message="This will permanently delete all your transactions. This action cannot be undone."
        onConfirm={clearData}
        onCancel={() => setClearConfirm(false)}
      />
    </div>
  );
}
