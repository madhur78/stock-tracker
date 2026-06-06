import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import { useNotification } from '../components/Notification';
import { format } from 'date-fns';
import { ArrowLeft, Save } from 'lucide-react';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const ACCOUNTS = ['Sakshi Account', 'Madhur Account'];

const SERVICE_PROVIDERS = [
  'Elite - Brando',
  'Elite - Shoof',
  'Banana',
  'SniperAlert',
  'Cole',
  'SmartIRT',
  'Self',
];

const defaultForm = {
  date: format(new Date(), 'yyyy-MM-dd'),
  day: '',
  symbol: '',
  optionCount: '',
  buyPrice: '',
  buyAmount: '',
  sellPrice: '',
  sellAmount: '',
  pl: '',
  account: '',
  comments: '',
  serviceProvider: '',
};

function calcDerived(form) {
  const optCount = parseFloat(form.optionCount) || 1;
  let buyAmount = form.buyAmount;
  let sellAmount = form.sellAmount;
  let pl = form.pl;

  if (form.buyPrice && !form.buyAmount) buyAmount = (parseFloat(form.buyPrice) * optCount * 100).toFixed(2);
  if (form.sellPrice && !form.sellAmount) sellAmount = (parseFloat(form.sellPrice) * optCount * 100).toFixed(2);
  if (buyAmount && sellAmount && !form.pl) pl = (parseFloat(sellAmount) - parseFloat(buyAmount)).toFixed(2);

  const day = form.date ? DAYS[new Date(form.date + 'T12:00:00').getDay()] : '';
  return { ...form, buyAmount, sellAmount, pl, day };
}

// ─── Reusable field components (defined OUTSIDE the page component so React
//     never remounts them on re-render, which would kill input focus) ──────────

function Field({ label, type = 'text', placeholder, readOnly, value, onChange }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type={type}
        className={`input ${readOnly ? 'bg-gray-50 dark:bg-gray-800 cursor-default' : ''}`}
        placeholder={placeholder}
        value={value ?? ''}
        onChange={onChange}
        readOnly={readOnly}
      />
    </div>
  );
}

function SelectField({ label, options, value, onChange, placeholder = 'Select…' }) {
  return (
    <div>
      <label className="label">{label}</label>
      <select
        className="input bg-white dark:bg-gray-700"
        value={value ?? ''}
        onChange={onChange}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function TransactionForm() {
  const { id } = useParams();
  const { transactions, addTransaction, updateTransaction } = useData();
  const { show } = useNotification();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState(defaultForm);

  useEffect(() => {
    if (isEdit) {
      const tx = transactions.find((t) => t.id === id);
      if (tx) setForm(tx);
      else { show('Transaction not found', 'error'); navigate('/transactions'); }
    }
  }, [id]);

  const set = (k) => (e) => {
    const updated = { ...form, [k]: e.target.value };
    if (k === 'date') updated.day = DAYS[new Date(e.target.value + 'T12:00:00').getDay()];
    setForm(updated);
  };

  const autoCalc = () => setForm((f) => calcDerived(f));

  const submit = (e) => {
    e.preventDefault();
    if (!form.symbol.trim()) { show('Stock symbol is required', 'error'); return; }
    if (!form.date) { show('Date is required', 'error'); return; }
    const finalForm = calcDerived(form);
    if (isEdit) {
      updateTransaction(id, finalForm);
      show('Transaction updated');
    } else {
      addTransaction(finalForm);
      show('Transaction added');
    }
    navigate('/transactions');
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {isEdit ? 'Edit Transaction' : 'Add Transaction'}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Fill in the trade details below</p>
        </div>
      </div>

      <form onSubmit={submit} className="card p-6 space-y-6">
        {/* ── Trade Info ── */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 uppercase tracking-wide">
            Trade Info
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <Field
              label="Date *" name="date" type="date"
              value={form.date} onChange={set('date')}
            />
            <Field
              label="Day" name="day" readOnly placeholder="Auto"
              value={form.day} onChange={set('day')}
            />
            <Field
              label="Stock Symbol *" name="symbol" placeholder="AAPL"
              value={form.symbol} onChange={set('symbol')}
            />
            <Field
              label="Option Count" name="optionCount" type="number" placeholder="1"
              value={form.optionCount} onChange={set('optionCount')}
            />
            <SelectField
              label="Account" name="account"
              options={ACCOUNTS}
              placeholder="Select account…"
              value={form.account} onChange={set('account')}
            />
            <SelectField
              label="Service Provider" name="serviceProvider"
              options={SERVICE_PROVIDERS}
              placeholder="Select provider…"
              value={form.serviceProvider} onChange={set('serviceProvider')}
            />
          </div>
        </div>

        {/* ── Pricing ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
              Pricing
            </h3>
            <button
              type="button"
              onClick={autoCalc}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Auto Calculate
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Buy Price (per share)" name="buyPrice" type="number" placeholder="0.00"
              value={form.buyPrice} onChange={set('buyPrice')}
            />
            <Field
              label="Buy Amount (total)" name="buyAmount" type="number" placeholder="0.00"
              value={form.buyAmount} onChange={set('buyAmount')}
            />
            <Field
              label="Sell Price (per share)" name="sellPrice" type="number" placeholder="0.00"
              value={form.sellPrice} onChange={set('sellPrice')}
            />
            <Field
              label="Sell Amount (total)" name="sellAmount" type="number" placeholder="0.00"
              value={form.sellAmount} onChange={set('sellAmount')}
            />
            <div className="sm:col-span-2">
              <label className="label">P/L</label>
              <input
                type="number"
                className={`input font-semibold ${parseFloat(form.pl) >= 0 ? 'text-green-600' : 'text-red-500'}`}
                placeholder="0.00"
                value={form.pl ?? ''}
                onChange={set('pl')}
              />
            </div>
          </div>
        </div>

        {/* ── Notes ── */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 uppercase tracking-wide">
            Notes
          </h3>
          <label className="label">Comments</label>
          <textarea
            className="input min-h-[80px] resize-y"
            placeholder="Optional notes about this trade…"
            value={form.comments ?? ''}
            onChange={set('comments')}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" className="btn-primary flex items-center gap-2">
            <Save size={16} />
            {isEdit ? 'Update Transaction' : 'Add Transaction'}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
