import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

const DataContext = createContext(null);

const getStorageKey = (userId) => `stocktracker_transactions_${userId}`;

export function DataProvider({ children }) {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    if (user) {
      const key = getStorageKey(user.id);
      try {
        const saved = localStorage.getItem(key);
        setTransactions(saved ? JSON.parse(saved) : []);
      } catch {
        setTransactions([]);
      }
    } else {
      setTransactions([]);
    }
  }, [user]);

  const save = useCallback((data) => {
    if (!user) return;
    localStorage.setItem(getStorageKey(user.id), JSON.stringify(data));
    setTransactions(data);
  }, [user]);

  const addTransaction = useCallback((tx) => {
    // Use a random suffix so rapid closes (same ms) never collide on ID
    const newTx = {
      ...tx,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
    };
    // Functional update: `prev` is always the latest state, even when multiple
    // addTransaction calls are batched in the same render (e.g. migration loop,
    // or closing several trades quickly). Without this, each call reads the same
    // stale snapshot of `transactions` and only the last write survives.
    setTransactions(prev => {
      const updated = [newTx, ...prev];
      if (user) localStorage.setItem(getStorageKey(user.id), JSON.stringify(updated));
      return updated;
    });
    return newTx;
  }, [user]);

  const updateTransaction = useCallback((id, tx) => {
    setTransactions(prev => {
      const updated = prev.map(t => t.id === id ? { ...t, ...tx, updatedAt: new Date().toISOString() } : t);
      if (user) localStorage.setItem(getStorageKey(user.id), JSON.stringify(updated));
      return updated;
    });
  }, [user]);

  const deleteTransaction = useCallback((id) => {
    setTransactions(prev => {
      const updated = prev.filter(t => t.id !== id);
      if (user) localStorage.setItem(getStorageKey(user.id), JSON.stringify(updated));
      return updated;
    });
  }, [user]);

  const getByDate = useCallback((date) => {
    return transactions.filter(t => t.date === date);
  }, [transactions]);

  const summary = useCallback(() => {
    const totalPL = transactions.reduce((sum, t) => sum + (parseFloat(t.pl) || 0), 0);
    const totalBuy = transactions.reduce((sum, t) => sum + (parseFloat(t.buyAmount) || 0), 0);
    const totalSell = transactions.reduce((sum, t) => sum + (parseFloat(t.sellAmount) || 0), 0);
    return { count: transactions.length, totalPL, totalBuy, totalSell };
  }, [transactions]);

  const bulkImport = useCallback((txList, mode = 'append') => {
    const now = new Date().toISOString();
    const newTxs = txList.map((tx, i) => ({
      ...tx,
      id: `${Date.now() + i}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: now,
    }));
    setTransactions(prev => {
      const updated = mode === 'replace' ? newTxs : [...newTxs, ...prev];
      if (user) localStorage.setItem(getStorageKey(user.id), JSON.stringify(updated));
      return updated;
    });
    return newTxs.length;
  }, [user]);

  return (
    <DataContext.Provider value={{ transactions, addTransaction, updateTransaction, deleteTransaction, getByDate, summary, bulkImport }}>
      {children}
    </DataContext.Provider>
  );
}

export const useData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
};
