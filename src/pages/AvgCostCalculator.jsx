import { useState, useMemo } from 'react';
import { Plus, Trash2, Calculator, TrendingUp, TrendingDown, Target, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

const MULTIPLIER = { 'Stock Option': 100, Stock: 1 };

let nextId = 1;
const emptyRow = () => ({ id: nextId++, qty: '', price: '' });

function fmt(n, decimals = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtUSD(n) {
  return '$' + fmt(Math.abs(n));
}

// ── Stat card ──────────────────────────────────────────────────────────────────
function Stat({ label, value, sub, highlight }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${highlight ?? 'text-gray-900 dark:text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          <Icon size={15} />
          {title}
        </div>
        {open ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function AvgCostCalculator() {
  const [symbol, setSymbol]       = useState('');
  const [tradeType, setTradeType] = useState('Stock Option');
  const [expiry, setExpiry]       = useState('');
  const [strike, setStrike]       = useState('');
  const [rows, setRows]           = useState([emptyRow(), emptyRow()]);
  const [sellPrice, setSellPrice] = useState('');
  const [dcaAtPrice, setDcaAtPrice] = useState('');
  const [dcaQty, setDcaQty]       = useState('');
  const [stopLossAmt, setStopLossAmt] = useState('');

  const mult = MULTIPLIER[tradeType];

  // ── Core calculations ──────────────────────────────────────────────────────
  const calc = useMemo(() => {
    const valid = rows.filter(r => parseFloat(r.qty) > 0 && parseFloat(r.price) > 0);
    if (!valid.length) return null;

    const totalQty  = valid.reduce((s, r) => s + parseFloat(r.qty), 0);
    const totalCost = valid.reduce((s, r) => s + parseFloat(r.qty) * parseFloat(r.price), 0);
    const avgCost   = totalCost / totalQty;
    const totalInvestment = totalCost * mult;

    return { valid, totalQty, totalCost, avgCost, totalInvestment };
  }, [rows, mult]);

  // ── Sell P/L ───────────────────────────────────────────────────────────────
  const sellCalc = useMemo(() => {
    if (!calc || !sellPrice) return null;
    const sp  = parseFloat(sellPrice);
    if (isNaN(sp) || sp <= 0) return null;
    const pl     = (sp - calc.avgCost) * calc.totalQty * mult;
    const plPct  = ((sp - calc.avgCost) / calc.avgCost) * 100;
    const revenue = sp * calc.totalQty * mult;
    return { sp, pl, plPct, revenue };
  }, [calc, sellPrice, mult]);

  // ── Profit targets ─────────────────────────────────────────────────────────
  const targets = useMemo(() => {
    if (!calc) return [];
    return [25, 50, 100, 200].map(pct => ({
      pct,
      price: calc.avgCost * (1 + pct / 100),
      pl:    calc.avgCost * (pct / 100) * calc.totalQty * mult,
    }));
  }, [calc, mult]);

  // ── DCA simulation ─────────────────────────────────────────────────────────
  const dcaCalc = useMemo(() => {
    if (!calc) return null;
    const ap = parseFloat(dcaAtPrice);
    const aq = parseFloat(dcaQty);
    if (isNaN(ap) || ap <= 0 || isNaN(aq) || aq <= 0) return null;
    const newTotalQty  = calc.totalQty + aq;
    const newTotalCost = calc.totalCost + aq * ap;
    const newAvg       = newTotalCost / newTotalQty;
    const newInvestment = newTotalCost * mult;
    const avgDiff      = newAvg - calc.avgCost;
    return { newAvg, newTotalQty, newInvestment, avgDiff };
  }, [calc, dcaAtPrice, dcaQty, mult]);

  // ── How many to reach target avg ───────────────────────────────────────────
  const dcaNeeded = useMemo(() => {
    if (!calc || !dcaAtPrice) return null;
    const ap = parseFloat(dcaAtPrice);
    if (isNaN(ap) || ap <= 0 || ap >= calc.avgCost) return null;
    // n = (totalCost - targetAvg * totalQty) / (targetAvg - ap)
    // for a 10% reduction in avg:
    const targetAvg = calc.avgCost * 0.9;
    const n = (calc.totalCost - targetAvg * calc.totalQty) / (targetAvg - ap);
    return { targetAvg, n: Math.ceil(n) };
  }, [calc, dcaAtPrice]);

  // ── Stop loss ──────────────────────────────────────────────────────────────
  const stopCalc = useMemo(() => {
    if (!calc || !stopLossAmt) return null;
    const maxLoss = parseFloat(stopLossAmt);
    if (isNaN(maxLoss) || maxLoss <= 0) return null;
    // (stopPrice - avgCost) * totalQty * mult = -maxLoss
    const stopPrice = calc.avgCost - maxLoss / (calc.totalQty * mult);
    const stopPct   = ((stopPrice - calc.avgCost) / calc.avgCost) * 100;
    return { stopPrice, stopPct, maxLoss };
  }, [calc, stopLossAmt, mult]);

  // ── Row helpers ────────────────────────────────────────────────────────────
  const addRow    = () => setRows(r => [...r, emptyRow()]);
  const removeRow = (id) => setRows(r => r.filter(x => x.id !== id));
  const setField  = (id, field, val) => setRows(r => r.map(x => x.id === id ? { ...x, [field]: val } : x));
  const reset     = () => {
    setSymbol(''); setTradeType('Stock Option'); setExpiry(''); setStrike('');
    setRows([emptyRow(), emptyRow()]);
    setSellPrice(''); setDcaAtPrice(''); setDcaQty(''); setStopLossAmt('');
  };

  const plColor = (n) => n >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400';
  const plSign  = (n) => n >= 0 ? '+' : '-';

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Avg Cost Calculator</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Calculate weighted average, P/L, DCA, and profit targets</p>
        </div>
        <button onClick={reset} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw size={14} /> Reset
        </button>
      </div>

      {/* Trade Info */}
      <div className="card p-5 space-y-4">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Trade Info (optional)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="label">Symbol</label>
            <input className="input" placeholder="MU" value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className="label">Trade Type</label>
            <select className="input bg-white dark:bg-gray-700" value={tradeType} onChange={e => setTradeType(e.target.value)}>
              <option>Stock Option</option>
              <option>Stock</option>
            </select>
          </div>
          {tradeType === 'Stock Option' && (
            <>
              <div>
                <label className="label">Expiry Date</label>
                <input className="input" type="date" value={expiry} onChange={e => setExpiry(e.target.value)} />
              </div>
              <div>
                <label className="label">Strike Price</label>
                <input className="input" type="number" placeholder="100" value={strike} onChange={e => setStrike(e.target.value)} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Buy Entries */}
      <Section title="Buy Entries" icon={Calculator} defaultOpen>
        <div className="space-y-2 mb-3">
          {/* Header row */}
          <div className="grid grid-cols-12 gap-2 px-1">
            <span className="col-span-1 text-xs text-gray-400">#</span>
            <span className="col-span-5 text-xs font-medium text-gray-500 dark:text-gray-400">
              {tradeType === 'Stock' ? 'Share Count' : 'Option Count'} (qty)
            </span>
            <span className="col-span-5 text-xs font-medium text-gray-500 dark:text-gray-400">Buy Price / contract</span>
            <span className="col-span-1" />
          </div>
          {rows.map((row, i) => (
            <div key={row.id} className="grid grid-cols-12 gap-2 items-center">
              <span className="col-span-1 text-xs text-gray-400 text-center">{i + 1}</span>
              <input
                className="col-span-5 input"
                type="number"
                min="0"
                placeholder="1"
                value={row.qty}
                onChange={e => setField(row.id, 'qty', e.target.value)}
              />
              <input
                className="col-span-5 input"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={row.price}
                onChange={e => setField(row.id, 'price', e.target.value)}
              />
              <button
                className="col-span-1 flex justify-center text-gray-300 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                onClick={() => removeRow(row.id)}
                disabled={rows.length === 1}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        <button onClick={addRow} className="flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium">
          <Plus size={14} /> Add another buy
        </button>

        {/* Per-row subtotals */}
        {calc && (
          <div className="mt-4 border-t border-gray-100 dark:border-gray-700 pt-4 space-y-1">
            {calc.valid.map((r, i) => {
              const sub = parseFloat(r.qty) * parseFloat(r.price) * mult;
              const wt  = (parseFloat(r.qty) / calc.totalQty * 100).toFixed(0);
              return (
                <div key={r.id} className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>Leg {i + 1}: {r.qty} × ${r.price} × {mult}</span>
                  <span>{fmtUSD(sub)} &nbsp;<span className="text-gray-400">({wt}% weight)</span></span>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Summary stats */}
      {calc ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Avg Cost" value={`$${fmt(calc.avgCost)}`} sub="per contract" />
          <Stat
            label={tradeType === 'Stock' ? 'Total Shares' : 'Total Contracts'}
            value={fmt(calc.totalQty, 0)}
            sub={tradeType === 'Stock Option' ? `× ${mult} shares each` : 'shares'}
          />
          <Stat label="Total Invested" value={fmtUSD(calc.totalInvestment)} sub="all legs combined" />
          <Stat label="Break-even" value={`$${fmt(calc.avgCost)}`} sub="sell price to break even" />
        </div>
      ) : (
        <div className="card p-6 text-center text-gray-400 dark:text-gray-500 text-sm">
          Enter at least one buy entry above to see calculations
        </div>
      )}

      {calc && (
        <>
          {/* P/L Calculator */}
          <Section title="Sell P/L Calculator" icon={TrendingUp} defaultOpen>
            <div className="flex items-end gap-4">
              <div className="flex-1 max-w-xs">
                <label className="label">Sell Price / contract</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={sellPrice}
                  onChange={e => setSellPrice(e.target.value)}
                />
              </div>
              {sellCalc && (
                <div className="flex-1 space-y-1">
                  <p className={`text-3xl font-bold ${plColor(sellCalc.pl)}`}>
                    {plSign(sellCalc.pl)}{fmtUSD(sellCalc.pl)}
                  </p>
                  <p className={`text-sm font-medium ${plColor(sellCalc.plPct)}`}>
                    {plSign(sellCalc.plPct)}{fmt(Math.abs(sellCalc.plPct))}% &nbsp;
                    <span className="text-gray-400 font-normal">Revenue: {fmtUSD(sellCalc.revenue)}</span>
                  </p>
                </div>
              )}
            </div>
          </Section>

          {/* Profit Targets */}
          <Section title="Profit Targets" icon={Target} defaultOpen>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {targets.map(t => (
                <div key={t.pct} className="rounded-lg border border-gray-100 dark:border-gray-700 p-3 text-center cursor-pointer hover:border-green-300 dark:hover:border-green-600 transition-colors"
                  onClick={() => setSellPrice(fmt(t.price))}>
                  <p className="text-xs font-semibold text-green-600 dark:text-green-400 mb-1">+{t.pct}%</p>
                  <p className="text-base font-bold text-gray-900 dark:text-white">${fmt(t.price)}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">+{fmtUSD(t.pl)}</p>
                  <p className="text-xs text-gray-400 mt-1">tap to use</p>
                </div>
              ))}
            </div>
          </Section>

          {/* DCA Calculator */}
          <Section title="DCA — Lower Your Average" icon={TrendingDown} defaultOpen={false}>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Simulate buying more contracts to lower your average cost.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="label">Buy more at price ($)</label>
                <input className="input" type="number" min="0" step="0.01" placeholder="e.g. 2.00"
                  value={dcaAtPrice} onChange={e => setDcaAtPrice(e.target.value)} />
              </div>
              <div>
                <label className="label">Additional qty</label>
                <input className="input" type="number" min="0" placeholder="e.g. 3"
                  value={dcaQty} onChange={e => setDcaQty(e.target.value)} />
              </div>
            </div>

            {dcaCalc && (
              <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-300">New average cost</span>
                  <span className="font-bold text-blue-700 dark:text-blue-300">${fmt(dcaCalc.newAvg)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-300">Change in avg</span>
                  <span className={`font-medium ${plColor(dcaCalc.avgDiff)}`}>
                    {dcaCalc.avgDiff < 0 ? '▼' : '▲'} ${fmt(Math.abs(dcaCalc.avgDiff))}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-300">New total {tradeType === 'Stock' ? 'shares' : 'contracts'}</span>
                  <span className="font-medium text-gray-900 dark:text-white">{fmt(dcaCalc.newTotalQty, 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-300">New total invested</span>
                  <span className="font-medium text-gray-900 dark:text-white">{fmtUSD(dcaCalc.newInvestment)}</span>
                </div>
              </div>
            )}

            {dcaNeeded && dcaAtPrice && !dcaQty && (
              <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-3 text-sm text-amber-800 dark:text-amber-300">
                To bring avg down by 10% (to ${fmt(dcaNeeded.targetAvg)}),
                buy <strong>{dcaNeeded.n}</strong> more contracts at ${parseFloat(dcaAtPrice).toFixed(2)}.
              </div>
            )}
          </Section>

          {/* Stop Loss */}
          <Section title="Stop Loss Calculator" icon={TrendingDown} defaultOpen={false}>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Enter the maximum dollar loss you can accept — see the exit price.
            </p>
            <div className="flex items-end gap-4">
              <div className="flex-1 max-w-xs">
                <label className="label">Max loss ($)</label>
                <input className="input" type="number" min="0" placeholder="e.g. 200"
                  value={stopLossAmt} onChange={e => setStopLossAmt(e.target.value)} />
              </div>
              {stopCalc && (
                <div className="flex-1 space-y-1">
                  {stopCalc.stopPrice > 0 ? (
                    <>
                      <p className="text-2xl font-bold text-red-500 dark:text-red-400">${fmt(stopCalc.stopPrice)}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Stop at {fmt(stopCalc.stopPct)}% &nbsp;·&nbsp; Max loss: {fmtUSD(stopCalc.maxLoss)}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-red-500">Max loss exceeds total investment — position would be worthless.</p>
                  )}
                </div>
              )}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
