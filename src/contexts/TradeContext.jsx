import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useData } from './DataContext';
import { useAuth } from './AuthContext';

const STORAGE_KEY = 'trade-book-v1';
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const dayOf = d => d ? DAYS[new Date(d + 'T12:00:00').getDay()] : '';

const TradeContext = createContext(null);

// Map a closed Trade Book entry → DataContext transaction shape.
// All existing screens (Transactions, Daily, Calendar, Reports) read from DataContext
// and key on these field names.
function toDataTx(trade) {
  return {
    symbol:          trade.symbol          ?? '',
    tradeType:       trade.tradeType       ?? 'Option',
    optionCount:     trade.optionCount     ?? '',
    buyDate:         trade.buyDate         ?? '',
    buyDay:          trade.buyDay          || dayOf(trade.buyDate),
    buyPrice:        String(trade.buyPrice  ?? ''),
    buyAmount:       String(trade.buyAmount ?? ''),
    date:            trade.sellDate        ?? '',   // screens use 'date' for sell date
    day:             dayOf(trade.sellDate),
    sellPrice:       String(trade.sellPrice  ?? ''),
    sellAmount:      String(trade.sellAmount ?? ''),
    pl:              String(trade.pl         ?? ''),
    account:         trade.account         ?? '',
    serviceProvider: trade.serviceProvider ?? '',
    comments:        trade.comments        ?? '',
    source:          'trade-book',    // lets screens optionally badge Trade Book rows
    tradeBookId:     trade.id,        // used by migration to detect existing synced entries
  };
}

export function TradeProvider({ children }) {
  const { user } = useAuth();
  const { addTransaction, updateTransaction, deleteTransaction, transactions, loaded } = useData();
  const migrated = useRef(false);

  const [trades, setTrades] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  });

  const persist = next => {
    setTrades(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  // Sync any closed trades missing from DataContext.
  // Runs after DataContext loads (depends on `transactions`).
  // Catches two cases:
  //   1. Trade has no dataTxId (pre-dates the bridge feature)
  //   2. Trade has a dataTxId but it's gone from DataContext (lost to the
  //      stale-closure bug that existed before the functional-update fix)
  // Reset migration guard whenever user changes so it runs once per login
  useEffect(() => { migrated.current = false; }, [user]);

  useEffect(() => {
    if (!user || !loaded || migrated.current) return;
    const txIds = new Set(transactions.map(tx => tx.id));
    const unsynced = trades.filter(t =>
      t.status === 'closed' && (!t.dataTxId || !txIds.has(t.dataTxId))
    );
    if (!unsynced.length) { migrated.current = true; return; }
    migrated.current = true;

    let next = [...trades];
    for (const trade of unsynced) {
      // Check if DataContext already has this trade (by tradeBookId) to avoid duplication
      const existing = transactions.find(tx => tx.tradeBookId === trade.id);
      if (existing) {
        next = next.map(t => t.id === trade.id ? { ...t, dataTxId: existing.id } : t);
      } else {
        const dataTx = addTransaction(toDataTx(trade));
        // dataTx.id is set synchronously; addTransaction uses functional state
        // update so all loop iterations stack correctly without stale closure.
        next = next.map(t => t.id === trade.id ? { ...t, dataTxId: dataTx.id } : t);
      }
    }
    setTrades(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, [user, loaded, transactions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open a new position — stays only in Trade Book until closed
  const openTrade = data =>
    persist([{ ...data, id: crypto.randomUUID(), createdAt: Date.now(), status: 'open' }, ...trades]);

  // Close a position → write a full transaction to DataContext so it appears everywhere
  const closeTrade = (id, sellData) => {
    const trade = trades.find(t => t.id === id);
    if (!trade) return;
    const closed = { ...trade, ...sellData, status: 'closed', sellDay: dayOf(sellData.sellDate) };
    const dataTx = addTransaction(toDataTx(closed));
    persist(trades.map(t => t.id === id ? { ...closed, dataTxId: dataTx.id } : t));
  };

  // Edit a trade — if already closed, keep DataContext in sync
  const updateTrade = (id, data) => {
    const next = trades.map(t => {
      if (t.id !== id) return t;
      const updated = { ...t, ...data };
      if (t.dataTxId) updateTransaction(t.dataTxId, toDataTx(updated));
      return updated;
    });
    persist(next);
  };

  // Delete — also remove from DataContext if it was synced
  const deleteTrade = id => {
    const trade = trades.find(t => t.id === id);
    if (trade?.dataTxId) deleteTransaction(trade.dataTxId);
    persist(trades.filter(t => t.id !== id));
  };

  return (
    <TradeContext.Provider value={{ trades, openTrade, closeTrade, updateTrade, deleteTrade }}>
      {children}
    </TradeContext.Provider>
  );
}

export const useTrades = () => useContext(TradeContext);
