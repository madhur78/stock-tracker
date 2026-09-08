import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
  Plus, X, ChevronDown, ChevronUp, Trash2, Edit2,
  TrendingUp, TrendingDown, DollarSign, BookOpen, CheckCircle2,
  Save, ArrowRight, AlertCircle,
} from 'lucide-react';
import { useTrades } from '../contexts/TradeContext';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS        = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const ACCOUNTS    = ['Sakshi Account', 'Madhur Account'];
const PROVIDERS   = ['Elite - Brando','Elite - Shoof','Banana','SniperAlert','Cole','SmartIRT','Lexington','GenZTrade','Stock PlayMaker (X)','Sam Parikh','Self'];
const TRADE_TYPES = ['Option', 'Stock'];
const TAGS        = ['0DTE','Auto Expired','Stop Loss Hit','Take Profit Hit','Rolled Out','Early Exit','Earnings Play','Paper Trade','Closed at Open'];

const today = () => format(new Date(), 'yyyy-MM-dd');
const dayOf = (d) => d ? DAYS[new Date(d + 'T12:00:00').getDay()] : '';
const curr  = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const mult  = (type) => type === 'Stock' ? 1 : 100;
const days  = (buy, sell) => {
  if (!buy || !sell) return null;
  return Math.round((new Date(sell + 'T12:00:00') - new Date(buy + 'T12:00:00')) / 86_400_000);
};

// ─── Shared form primitives ───────────────────────────────────────────────────

function Label({ children }) {
  return <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">{children}</label>;
}

function Input({ label, type = 'text', value, onChange, placeholder, readOnly, className = '' }) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <input
        type={type}
        value={value ?? ''}
        onChange={onChange}
        placeholder={placeholder}
        readOnly={readOnly}
        className={`input text-sm ${readOnly ? 'bg-gray-50 dark:bg-gray-800 cursor-default' : ''} ${className}`}
      />
    </div>
  );
}

function Select({ label, options, value, onChange, placeholder = 'Select…' }) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <select className="input text-sm bg-white dark:bg-gray-700" value={value ?? ''} onChange={onChange}>
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function TagChips({ value, onChange }) {
  const append = (tag) => {
    const cur = (value ?? '').trim();
    onChange(cur ? `${cur}, ${tag}` : tag);
  };
  return (
    <div>
      <Label>Comments</Label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {TAGS.map(t => (
          <button key={t} type="button" onClick={() => append(t)}
            className="px-2 py-0.5 text-xs rounded-full border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:border-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors">
            {t}
          </button>
        ))}
      </div>
      <textarea
        className="input text-sm min-h-[60px] resize-y"
        placeholder="Add notes or pick a tag above…"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

// ─── Overlay modal wrapper ────────────────────────────────────────────────────

function Modal({ title, subtitle, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] flex flex-col`}>
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">{title}</h3>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 ml-4">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5 space-y-5 flex-1">{children}</div>
      </div>
    </div>
  );
}

// ─── Open Trade form ──────────────────────────────────────────────────────────

function calcBuyAmount(price, count, type) {
  if (!price || !count) return '';
  return (parseFloat(price) * parseFloat(count) * mult(type)).toFixed(2);
}

function OpenTradeModal({ initial, onSubmit, onClose }) {
  const [f, setF] = useState({
    symbol: '', tradeType: 'Option', optionCount: '1',
    buyDate: today(), buyDay: dayOf(today()),
    buyPrice: '', buyAmount: '',
    account: '', serviceProvider: '', comments: '',
    ...initial,
  });

  const set = (k) => (e) => {
    const v = typeof e === 'string' ? e : e.target.value;
    setF(prev => {
      const next = { ...prev, [k]: v };
      if (k === 'buyDate') next.buyDay = dayOf(v);
      if (['buyPrice','optionCount','tradeType'].includes(k)) {
        const price = k === 'buyPrice' ? v : next.buyPrice;
        const count = k === 'optionCount' ? v : next.optionCount;
        const type  = k === 'tradeType'  ? v : next.tradeType;
        next.buyAmount = calcBuyAmount(price, count, type);
      }
      return next;
    });
  };

  const valid = f.symbol.trim() && f.buyDate && f.buyPrice;

  const submit = () => {
    if (!valid) return;
    onSubmit({
      symbol:          f.symbol.trim().toUpperCase(),
      tradeType:       f.tradeType,
      optionCount:     f.optionCount,
      buyDate:         f.buyDate,
      buyDay:          dayOf(f.buyDate),
      buyPrice:        parseFloat(f.buyPrice) || 0,
      buyAmount:       parseFloat(f.buyAmount) || 0,
      account:         f.account,
      serviceProvider: f.serviceProvider,
      comments:        f.comments,
    });
    onClose();
  };

  return (
    <Modal title={initial ? 'Edit Open Trade' : 'Open New Trade'} subtitle="Record a new buy position" onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Symbol *</Label>
          <input className="input text-sm uppercase" placeholder="AAPL" value={f.symbol}
            onChange={e => set('symbol')({ target: { value: e.target.value.toUpperCase() } })} />
        </div>
        <Select label="Trade Type" options={TRADE_TYPES} value={f.tradeType} onChange={set('tradeType')} />
        <Input label={f.tradeType === 'Stock' ? 'Share Count' : 'Contracts'} type="number" placeholder="1"
          value={f.optionCount} onChange={set('optionCount')} />
        <Select label="Account" options={ACCOUNTS} value={f.account} onChange={set('account')} />
        <div>
          <Label>Buy Date *</Label>
          <input type="date" className="input text-sm" value={f.buyDate} onChange={set('buyDate')} />
        </div>
        <Input label="Buy Day" value={dayOf(f.buyDate)} readOnly />
        <Input label="Buy Price (per unit)" type="number" placeholder="0.00"
          value={f.buyPrice} onChange={set('buyPrice')} />
        <Input label={`Buy Amount (total${f.tradeType === 'Option' ? ' × 100' : ''})`} type="number"
          placeholder="Auto" value={f.buyAmount} onChange={set('buyAmount')} />
        <div className="col-span-2">
          <Select label="Service Provider" options={PROVIDERS} value={f.serviceProvider} onChange={set('serviceProvider')} />
        </div>
        <div className="col-span-2">
          <TagChips value={f.comments} onChange={v => setF(p => ({ ...p, comments: v }))} />
        </div>
      </div>

      <div className="flex gap-3 pt-1">
        <button onClick={submit} disabled={!valid}
          className="btn-primary flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
          <BookOpen size={15} />
          {initial ? 'Save Changes' : 'Open Trade'}
        </button>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
      </div>
    </Modal>
  );
}

// ─── Close Trade form ─────────────────────────────────────────────────────────

function CloseTradeModal({ trade, onSubmit, onClose }) {
  const [f, setF] = useState({
    sellDate: today(), sellPrice: '', sellAmount: '', comments: trade.comments || '',
  });

  const set = (k) => (e) => {
    const v = typeof e === 'string' ? e : e.target.value;
    setF(prev => {
      const next = { ...prev, [k]: v };
      if (['sellPrice'].includes(k)) {
        const price = k === 'sellPrice' ? v : next.sellPrice;
        next.sellAmount = calcBuyAmount(price, trade.optionCount, trade.tradeType);
      }
      return next;
    });
  };

  const sellAmt  = parseFloat(f.sellAmount) || 0;
  const buyAmt   = trade.buyAmount || 0;
  const pl       = sellAmt - buyAmt;
  const plPct    = buyAmt ? (pl / buyAmt) * 100 : 0;
  const holdDays = days(trade.buyDate, f.sellDate);
  const valid    = f.sellDate && (f.sellPrice || f.sellAmount);

  const submit = () => {
    if (!valid) return;
    onSubmit({
      sellDate:   f.sellDate,
      sellDay:    dayOf(f.sellDate),
      sellPrice:  parseFloat(f.sellPrice) || 0,
      sellAmount: sellAmt,
      pl:         parseFloat(pl.toFixed(2)),
      plPct:      parseFloat(plPct.toFixed(2)),
      holdDays:   holdDays,
      comments:   f.comments,
    });
    onClose();
  };

  return (
    <Modal title={`Close Trade — ${trade.symbol}`}
      subtitle={`${trade.tradeType} · ${trade.optionCount} ${trade.tradeType === 'Stock' ? 'shares' : 'contracts'} · Bought ${trade.buyDate}`}
      onClose={onClose} wide>

      {/* Buy summary banner */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Buy Date</p>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{trade.buyDate}</p>
          <p className="text-xs text-gray-400">{trade.buyDay}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Buy Price</p>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{curr(trade.buyPrice)}</p>
          <p className="text-xs text-gray-400">{trade.optionCount} × {mult(trade.tradeType)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Buy Amount</p>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{curr(buyAmt)}</p>
        </div>
      </div>

      {/* Sell details */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Sell Date *</Label>
          <input type="date" className="input text-sm" value={f.sellDate}
            min={trade.buyDate} onChange={set('sellDate')} />
        </div>
        <Input label="Sell Day" value={dayOf(f.sellDate)} readOnly />
        <Input label="Sell Price (per unit)" type="number" placeholder="0.00"
          value={f.sellPrice} onChange={set('sellPrice')} />
        <Input label={`Sell Amount (total${trade.tradeType === 'Option' ? ' × 100' : ''})`} type="number"
          placeholder="Auto" value={f.sellAmount} onChange={set('sellAmount')} />
      </div>

      {/* P/L preview */}
      {(f.sellPrice || f.sellAmount) && (
        <div className={`rounded-xl p-4 border-2 ${pl >= 0 ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {pl >= 0 ? <TrendingUp size={18} className="text-green-600" /> : <TrendingDown size={18} className="text-red-500" />}
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Estimated P/L</span>
            </div>
            <div className="text-right">
              <p className={`text-2xl font-bold ${pl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                {pl >= 0 ? '+' : ''}{curr(pl)}
              </p>
              <p className={`text-xs ${pl >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                {pl >= 0 ? '+' : ''}{plPct.toFixed(1)}%
                {holdDays !== null && ` · ${holdDays === 0 ? '0DTE' : `${holdDays}d`}`}
              </p>
            </div>
          </div>
        </div>
      )}

      <TagChips value={f.comments} onChange={v => setF(p => ({ ...p, comments: v }))} />

      <div className="flex gap-3 pt-1">
        <button onClick={submit} disabled={!valid}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${pl >= 0 ? 'bg-green-600 hover:bg-green-700' : 'bg-red-500 hover:bg-red-600'}`}>
          <CheckCircle2 size={15} />
          Close Trade {pl >= 0 && valid ? `(+${curr(pl)})` : valid ? `(${curr(pl)})` : ''}
        </button>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
      </div>
    </Modal>
  );
}

// ─── Open position card ───────────────────────────────────────────────────────

function OpenCard({ trade, onClose, onEdit, onDelete }) {
  const held  = days(trade.buyDate, today());
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="card p-5 border-l-4 border-blue-500">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg font-bold text-gray-900 dark:text-white">{trade.symbol}</span>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                {trade.tradeType}
              </span>
              <span className="text-xs text-gray-400">
                {trade.optionCount} {trade.tradeType === 'Stock' ? 'shares' : 'contracts'}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap text-sm text-gray-500 dark:text-gray-400">
              <span>Bought {trade.buyDate} <span className="text-xs opacity-70">{trade.buyDay?.slice(0,3)}</span></span>
              <span>@{curr(trade.buyPrice)}</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">= {curr(trade.buyAmount)}</span>
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-gray-400">
              {trade.account && <span>{trade.account}</span>}
              {trade.serviceProvider && <span>· {trade.serviceProvider}</span>}
              {held !== null && (
                <span className={`font-semibold px-1.5 py-0.5 rounded ${
                  held === 0 ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                  : held <= 5 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                }`}>
                  {held === 0 ? '0DTE' : `${held}d open`}
                </span>
              )}
              {trade.comments && <span className="truncate max-w-[200px]" title={trade.comments}>💬 {trade.comments}</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => onEdit(trade)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <Edit2 size={15} />
          </button>
          {confirm ? (
            <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-900/30 px-2 py-1.5 rounded-lg border border-red-200 dark:border-red-800">
              <span className="text-xs text-red-600 dark:text-red-400 font-medium">Delete?</span>
              <button onClick={() => onDelete(trade.id)} className="text-xs font-semibold text-red-600 hover:text-red-700 px-1">Yes</button>
              <button onClick={() => setConfirm(false)} className="text-xs text-gray-500 hover:text-gray-700 px-1">No</button>
            </div>
          ) : (
            <button onClick={() => setConfirm(true)}
              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors">
              <Trash2 size={15} />
            </button>
          )}
          <button onClick={() => onClose(trade)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors">
            Close Trade <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Closed Trade form ───────────────────────────────────────────────────

function EditClosedTradeModal({ trade, onSubmit, onClose }) {
  const [f, setF] = useState({
    symbol:          trade.symbol          || '',
    tradeType:       trade.tradeType       || 'Option',
    optionCount:     String(trade.optionCount || '1'),
    buyDate:         trade.buyDate         || today(),
    buyPrice:        String(trade.buyPrice  || ''),
    buyAmount:       String(trade.buyAmount || ''),
    sellDate:        trade.sellDate        || today(),
    sellPrice:       String(trade.sellPrice || ''),
    sellAmount:      String(trade.sellAmount|| ''),
    account:         trade.account         || '',
    serviceProvider: trade.serviceProvider || '',
    comments:        trade.comments        || '',
  });

  const set = (k) => (e) => {
    const v = typeof e === 'string' ? e : e.target.value;
    setF(prev => {
      const next = { ...prev, [k]: v };
      if (['buyPrice','optionCount','tradeType'].includes(k)) {
        const p = k === 'buyPrice'    ? v : next.buyPrice;
        const c = k === 'optionCount' ? v : next.optionCount;
        const t = k === 'tradeType'   ? v : next.tradeType;
        next.buyAmount = calcBuyAmount(p, c, t);
      }
      if (k === 'sellPrice') next.sellAmount = calcBuyAmount(v, next.optionCount, next.tradeType);
      return next;
    });
  };

  const buyAmt  = parseFloat(f.buyAmount)  || 0;
  const sellAmt = parseFloat(f.sellAmount) || 0;
  const pl      = sellAmt - buyAmt;
  const plPct   = buyAmt ? (pl / buyAmt) * 100 : 0;
  const hd      = days(f.buyDate, f.sellDate);
  const valid   = f.symbol.trim() && f.buyDate && f.sellDate;

  const submit = () => {
    if (!valid) return;
    onSubmit({
      symbol:          f.symbol.trim().toUpperCase(),
      tradeType:       f.tradeType,
      optionCount:     f.optionCount,
      buyDate:         f.buyDate,
      buyDay:          dayOf(f.buyDate),
      buyPrice:        parseFloat(f.buyPrice)  || 0,
      buyAmount:       parseFloat(f.buyAmount) || 0,
      sellDate:        f.sellDate,
      sellDay:         dayOf(f.sellDate),
      sellPrice:       parseFloat(f.sellPrice)  || 0,
      sellAmount:      sellAmt,
      pl:              parseFloat(pl.toFixed(2)),
      plPct:           parseFloat(plPct.toFixed(2)),
      holdDays:        hd,
      account:         f.account,
      serviceProvider: f.serviceProvider,
      comments:        f.comments,
    });
    onClose();
  };

  return (
    <Modal title={`Edit Closed Trade — ${trade.symbol}`}
      subtitle={`${trade.tradeType} · ${trade.optionCount} ${trade.tradeType === 'Stock' ? 'shares' : 'contracts'}`}
      onClose={onClose} wide>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Symbol *</Label>
          <input className="input text-sm uppercase" placeholder="AAPL" value={f.symbol}
            onChange={e => set('symbol')({ target: { value: e.target.value.toUpperCase() } })} />
        </div>
        <Select label="Trade Type" options={TRADE_TYPES} value={f.tradeType} onChange={set('tradeType')} />
        <Input label={f.tradeType === 'Stock' ? 'Share Count' : 'Contracts'} type="number" placeholder="1"
          value={f.optionCount} onChange={set('optionCount')} />
        <Select label="Account" options={ACCOUNTS} value={f.account} onChange={set('account')} />

        <div className="col-span-2 border-t border-gray-100 dark:border-gray-700 pt-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Buy Details</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Buy Date *</Label>
              <input type="date" className="input text-sm" value={f.buyDate} onChange={set('buyDate')} />
            </div>
            <Input label="Buy Day" value={dayOf(f.buyDate)} readOnly />
            <Input label="Buy Price (per unit)" type="number" placeholder="0.00"
              value={f.buyPrice} onChange={set('buyPrice')} />
            <Input label={`Buy Amount (total${f.tradeType === 'Option' ? ' × 100' : ''})`} type="number"
              placeholder="Auto" value={f.buyAmount} onChange={set('buyAmount')} />
          </div>
        </div>

        <div className="col-span-2 border-t border-gray-100 dark:border-gray-700 pt-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Sell Details</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Sell Date *</Label>
              <input type="date" className="input text-sm" value={f.sellDate} onChange={set('sellDate')} />
            </div>
            <Input label="Sell Day" value={dayOf(f.sellDate)} readOnly />
            <Input label="Sell Price (per unit)" type="number" placeholder="0.00"
              value={f.sellPrice} onChange={set('sellPrice')} />
            <Input label={`Sell Amount (total${f.tradeType === 'Option' ? ' × 100' : ''})`} type="number"
              placeholder="Auto" value={f.sellAmount} onChange={set('sellAmount')} />
          </div>
        </div>

        <div className="col-span-2">
          <Select label="Service Provider" options={PROVIDERS} value={f.serviceProvider} onChange={set('serviceProvider')} />
        </div>
      </div>

      {(buyAmt > 0 || sellAmt > 0) && (
        <div className={`rounded-xl p-4 border-2 ${pl >= 0 ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {pl >= 0 ? <TrendingUp size={16} className="text-green-600" /> : <TrendingDown size={16} className="text-red-500" />}
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">P/L Preview</span>
            </div>
            <div className="text-right">
              <p className={`text-xl font-bold ${pl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                {pl >= 0 ? '+' : ''}{curr(pl)}
              </p>
              <p className={`text-xs ${pl >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                {pl >= 0 ? '+' : ''}{plPct.toFixed(1)}%
                {hd !== null && ` · ${hd === 0 ? '0DTE' : `${hd}d`}`}
              </p>
            </div>
          </div>
        </div>
      )}

      <TagChips value={f.comments} onChange={v => setF(p => ({ ...p, comments: v }))} />

      <div className="flex gap-3 pt-1">
        <button onClick={submit} disabled={!valid}
          className="btn-primary flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
          <Save size={15} /> Save Changes
        </button>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
      </div>
    </Modal>
  );
}

// ─── Closed trades table ──────────────────────────────────────────────────────

function DaysBadge({ d }) {
  if (d === null || d === undefined) return <span className="text-gray-300 dark:text-gray-600">—</span>;
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
      d === 0 ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
      : d <= 5 ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
    }`}>
      {d === 0 ? '0DTE' : `${d}d`}
    </span>
  );
}

function ClosedTable({ trades, onEdit, onDelete }) {
  const [sort,      setSort]      = useState({ key: 'sellDate', dir: 'desc' });
  const [confirmId, setConfirmId] = useState(null);

  const sorted = useMemo(() => [...trades].sort((a, b) => {
    let av = a[sort.key] ?? 0, bv = b[sort.key] ?? 0;
    return sort.dir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  }), [trades, sort]);

  const toggle = (key) => setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  const SortIcon = ({ k }) => sort.key !== k ? null : sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;

  const cols = [
    { key: 'symbol',     label: 'Symbol'   },
    { key: 'buyDate',    label: 'Buy Date' },
    { key: 'sellDate',   label: 'Sell Date'},
    { key: 'holdDays',   label: 'Days'     },
    { key: 'optionCount',label: 'Qty'      },
    { key: 'buyAmount',  label: 'Buy Amt'  },
    { key: 'sellAmount', label: 'Sell Amt' },
    { key: 'pl',         label: 'P/L'      },
    { key: 'plPct',      label: 'P/L %'    },
  ];

  if (!trades.length) return (
    <div className="card p-10 text-center text-gray-400 dark:text-gray-500">
      <CheckCircle2 size={36} className="mx-auto mb-3 opacity-20" />
      <p className="text-sm">No closed trades yet</p>
    </div>
  );

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
              {cols.map(c => (
                <th key={c.key} onClick={() => toggle(c.key)}
                  className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide cursor-pointer select-none whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">{c.label} <SortIcon k={c.key} /></span>
                </th>
              ))}
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Notes</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {sorted.map(t => {
              const pl = t.pl || 0;
              return (
                <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-bold text-gray-900 dark:text-white">{t.symbol}</div>
                    <div className="text-xs text-gray-400">{t.tradeType}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {t.buyDate}<span className="ml-1 text-xs opacity-60">{t.buyDay?.slice(0,3)}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {t.sellDate}<span className="ml-1 text-xs opacity-60">{t.sellDay?.slice(0,3)}</span>
                  </td>
                  <td className="px-4 py-3"><DaysBadge d={t.holdDays} /></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{t.optionCount}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{curr(t.buyAmount)}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{curr(t.sellAmount)}</td>
                  <td className={`px-4 py-3 font-bold ${pl >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {pl >= 0 ? '+' : ''}{curr(pl)}
                  </td>
                  <td className={`px-4 py-3 text-sm font-semibold ${pl >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                    {pl >= 0 ? '+' : ''}{(t.plPct || 0).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 max-w-[160px] truncate" title={t.comments}>
                    {t.comments || '—'}
                  </td>
                  <td className="px-4 py-3">
                    {confirmId === t.id ? (
                      <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-900/30 px-2 py-1.5 rounded-lg border border-red-200 dark:border-red-800 whitespace-nowrap">
                        <span className="text-xs text-red-600 dark:text-red-400 font-medium">Delete?</span>
                        <button onClick={() => { onDelete(t.id); setConfirmId(null); }}
                          className="text-xs font-semibold text-red-600 hover:text-red-700 dark:text-red-400 px-1">Yes</button>
                        <button onClick={() => setConfirmId(null)}
                          className="text-xs text-gray-500 hover:text-gray-700 px-1">No</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button onClick={() => onEdit(t)} title="Edit"
                          className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => setConfirmId(t.id)} title="Delete"
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Stats bar ────────────────────────────────────────────────────────────────

function StatsBar({ trades }) {
  const open   = trades.filter(t => t.status === 'open');
  const closed = trades.filter(t => t.status === 'closed');
  const invested = open.reduce((s, t) => s + (t.buyAmount || 0), 0);
  const totalPL  = closed.reduce((s, t) => s + (t.pl || 0), 0);
  const wins     = closed.filter(t => (t.pl || 0) > 0).length;
  const winRate  = closed.length ? (wins / closed.length) * 100 : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: 'Open Positions', value: open.length, icon: BookOpen, color: 'bg-blue-500', sub: `${curr(invested)} invested` },
        { label: 'Closed Trades',  value: closed.length, icon: CheckCircle2, color: 'bg-gray-500', sub: `${wins} wins` },
        { label: 'Total P/L',      value: curr(totalPL), icon: totalPL >= 0 ? TrendingUp : TrendingDown,
          color: totalPL >= 0 ? 'bg-green-500' : 'bg-red-500',
          valueColor: totalPL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400' },
        { label: 'Win Rate',       value: closed.length ? `${winRate.toFixed(0)}%` : '—', icon: DollarSign,
          color: winRate >= 50 ? 'bg-green-500' : 'bg-orange-500', sub: closed.length ? `${closed.length} trades` : 'no closed trades' },
      ].map(({ label, value, icon: Icon, color, sub, valueColor }) => (
        <div key={label} className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
            <div className={`w-7 h-7 rounded-md flex items-center justify-center ${color}`}>
              <Icon size={14} className="text-white" />
            </div>
          </div>
          <p className={`text-xl font-bold ${valueColor ?? 'text-gray-900 dark:text-white'}`}>{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TradeBook() {
  const { trades, openTrade, closeTrade, updateTrade, deleteTrade } = useTrades();

  const [showOpen,          setShowOpen]          = useState(false);
  const [closingTrade,      setClosingTrade]      = useState(null);
  const [editingTrade,      setEditingTrade]      = useState(null);   // open trade edit
  const [editingClosedTrade,setEditingClosedTrade]= useState(null);   // closed trade edit
  const [tab, setTab] = useState('open');

  const openTrades   = useMemo(() => trades.filter(t => t.status === 'open'),   [trades]);
  const closedTrades = useMemo(() => trades.filter(t => t.status === 'closed'), [trades]);

  const handleEdit = (trade) => setEditingTrade(trade);

  const handleEditSave = (data) => {
    updateTrade(editingTrade.id, {
      symbol:          data.symbol,
      tradeType:       data.tradeType,
      optionCount:     data.optionCount,
      buyDate:         data.buyDate,
      buyDay:          data.buyDay,
      buyPrice:        data.buyPrice,
      buyAmount:       data.buyAmount,
      account:         data.account,
      serviceProvider: data.serviceProvider,
      comments:        data.comments,
    });
    setEditingTrade(null);
  };

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Trade Book</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Track open positions and close them when you sell
          </p>
        </div>
        <button onClick={() => setShowOpen(true)}
          className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Open New Trade
        </button>
      </div>

      {/* Stats */}
      <StatsBar trades={trades} />

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
        {[
          { id: 'open',   label: `Open (${openTrades.length})` },
          { id: 'closed', label: `Closed (${closedTrades.length})` },
        ].map(({ id, label }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              tab === id
                ? 'bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Open positions */}
      {tab === 'open' && (
        <div className="space-y-3">
          {openTrades.length === 0 ? (
            <div className="card p-12 text-center text-gray-400 dark:text-gray-500">
              <BookOpen size={40} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">No open positions</p>
              <p className="text-xs mt-1 opacity-70">Click "Open New Trade" to record your first buy</p>
              <button onClick={() => setShowOpen(true)}
                className="mt-4 btn-primary inline-flex items-center gap-2 text-sm">
                <Plus size={15} /> Open New Trade
              </button>
            </div>
          ) : (
            openTrades.map(t => (
              <OpenCard key={t.id} trade={t}
                onClose={setClosingTrade}
                onEdit={handleEdit}
                onDelete={deleteTrade}
              />
            ))
          )}
        </div>
      )}

      {/* Closed trades */}
      {tab === 'closed' && (
        <ClosedTable
          trades={closedTrades}
          onEdit={setEditingClosedTrade}
          onDelete={deleteTrade}
        />
      )}

      {/* Modals */}
      {showOpen && (
        <OpenTradeModal onSubmit={openTrade} onClose={() => setShowOpen(false)} />
      )}
      {editingTrade && (
        <OpenTradeModal initial={editingTrade} onSubmit={handleEditSave} onClose={() => setEditingTrade(null)} />
      )}
      {closingTrade && (
        <CloseTradeModal
          trade={closingTrade}
          onSubmit={(data) => { closeTrade(closingTrade.id, data); setClosingTrade(null); }}
          onClose={() => setClosingTrade(null)}
        />
      )}
      {editingClosedTrade && (
        <EditClosedTradeModal
          trade={editingClosedTrade}
          onSubmit={(data) => { updateTrade(editingClosedTrade.id, data); setEditingClosedTrade(null); }}
          onClose={() => setEditingClosedTrade(null)}
        />
      )}
    </div>
  );
}
