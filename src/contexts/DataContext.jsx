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
    const newTx = {
      ...tx,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
    };
    const updated = [newTx, ...transactions];
    save(updated);
    return newTx;
  }, [transactions, save]);

  const updateTransaction = useCallback((id, tx) => {
    const updated = transactions.map(t => t.id === id ? { ...t, ...tx, updatedAt: new Date().toISOString() } : t);
    save(updated);
  }, [transactions, save]);

  const deleteTransaction = useCallback((id) => {
    const updated = transactions.filter(t => t.id !== id);
    save(updated);
  }, [transactions, save]);

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
      id: (Date.now() + i).toString(),
      createdAt: now,
    }));
    const updated = mode === 'replace' ? newTxs : [...newTxs, ...transactions];
    save(updated);
    return newTxs.length;
  }, [transactions, save]);

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
