import { createContext, useContext, useState } from 'react';

const STORAGE_KEY = 'trade-book-v1';

const TradeContext = createContext(null);

export function TradeProvider({ children }) {
  const [trades, setTrades] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  });

  const persist = (next) => {
    setTrades(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const openTrade  = (data)        => persist([{ ...data, id: crypto.randomUUID(), createdAt: Date.now(), status: 'open'   }, ...trades]);
  const closeTrade = (id, sellData) => persist(trades.map(t => t.id === id ? { ...t, ...sellData, status: 'closed' } : t));
  const updateTrade = (id, data)   => persist(trades.map(t => t.id === id ? { ...t, ...data } : t));
  const deleteTrade = (id)         => persist(trades.filter(t => t.id !== id));

  return (
    <TradeContext.Provider value={{ trades, openTrade, closeTrade, updateTrade, deleteTrade }}>
      {children}
    </TradeContext.Provider>
  );
}

export const useTrades = () => useContext(TradeContext);
