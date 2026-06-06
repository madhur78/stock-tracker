import { useState, useRef } from 'react';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../components/Notification';
import { FileSpreadsheet, FileText, Download, Filter, Upload, X, CheckCircle, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';

const fmt = (n) => `$${parseFloat(n || 0).toFixed(2)}`;

// Flexible header → transaction field mapping
const HEADER_ALIASES = {
  date:            ['date', 'trade date', 'tradedate', 'trade_date'],
  day:             ['day'],
  symbol:          ['symbol', 'stock symbol', 'ticker', 'stock'],
  optionCount:     ['contracts', 'option count', 'optioncount', 'qty', 'quantity', 'count', 'options'],
  buyPrice:        ['buy price', 'buyprice', 'purchase price', 'buy_price'],
  buyAmount:       ['buy amount', 'buyamount', 'buy total', 'total buy', 'buy_amount'],
  sellPrice:       ['sell price', 'sellprice', 'sale price', 'sell_price'],
  sellAmount:      ['sell amount', 'sellamount', 'sell total', 'total sell', 'sell_amount'],
  pl:              ['p/l', 'pl', 'profit/loss', 'profit loss', 'pnl', 'p&l', 'gain/loss', 'net', 'realized p&l'],
  account:         ['account', 'account name'],
  serviceProvider: ['service provider', 'serviceprovider', 'broker', 'provider', 'platform'],
  comments:        ['comments', 'notes', 'comment', 'note', 'remarks'],
};

function buildHeaderMap(headers) {
  const map = {}; // colIndex → fieldName
  headers.forEach((h, i) => {
    const lower = h.toLowerCase().trim();
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(lower)) { map[i] = field; break; }
    }
  });
  return map;
}

function excelDateToString(val) {
  if (val instanceof Date) return format(val, 'yyyy-MM-dd');
  if (typeof val === 'number' && val > 1) {
    // Excel serial date: days since 1900-01-01 (with Lotus bug offset)
    const ms = (val - 25569) * 86400 * 1000;
    return format(new Date(ms), 'yyyy-MM-dd');
  }
  if (typeof val === 'string') {
    // Normalise common date formats to yyyy-MM-dd
    const d = new Date(val);
    if (!isNaN(d)) return format(d, 'yyyy-MM-dd');
  }
  return String(val ?? '');
}

function parseNumeric(val) {
  if (val === null || val === undefined || val === '') return '';
  const str = String(val).replace(/[$,\s]/g, '');
  const n = parseFloat(str);
  return isNaN(n) ? '' : String(n);
}

function resolveCell(cell) {
  if (cell === null || cell === undefined) return '';
  // ExcelJS formula cell
  if (typeof cell === 'object' && 'result' in cell) return cell.result ?? '';
  // ExcelJS rich text
  if (typeof cell === 'object' && 'richText' in cell) return cell.richText.map(r => r.text).join('');
  if (typeof cell === 'object' && 'text' in cell) return cell.text;
  return cell;
}

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function autoDay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return isNaN(d) ? '' : DAYS[d.getDay()];
}

async function parseExcelFile(file) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await wb.xlsx.load(buffer);

  // Prefer a sheet named "Transactions", fall back to first sheet
  const ws = wb.getWorksheet('Transactions') || wb.worksheets[0];
  if (!ws) throw new Error('No worksheet found in the file.');

  const headers = [];
  const firstRow = ws.getRow(1);
  firstRow.eachCell({ includeEmpty: false }, (cell) => {
    headers.push(String(resolveCell(cell.value) ?? '').trim());
  });
  if (headers.length === 0) throw new Error('The first row appears to be empty — expected column headers.');

  const headerMap = buildHeaderMap(headers);
  const mappedFields = Object.values(headerMap);
  if (!mappedFields.includes('symbol') && !mappedFields.includes('date')) {
    throw new Error('Could not find required columns (Symbol or Date). Check the header row.');
  }

  const rows = [];
  const errors = [];

  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum === 1) return;

    const tx = {};
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      const field = headerMap[colNum - 1];
      if (!field) return;
      const raw = resolveCell(cell.value);
      if (field === 'date') tx[field] = excelDateToString(raw);
      else if (['buyPrice','buyAmount','sellPrice','sellAmount','pl','optionCount'].includes(field))
        tx[field] = parseNumeric(raw);
      else tx[field] = String(raw ?? '').trim();
    });

    // Skip completely blank rows
    if (!tx.symbol && !tx.date) return;

    // Validate
    const rowErrors = [];
    if (!tx.date) rowErrors.push('missing date');
    if (!tx.symbol) rowErrors.push('missing symbol');
    if (tx.date && !/^\d{4}-\d{2}-\d{2}$/.test(tx.date)) rowErrors.push(`unrecognised date "${tx.date}"`);

    // Auto-fill day if absent
    if (!tx.day && tx.date) tx.day = autoDay(tx.date);

    if (rowErrors.length) errors.push({ rowNum, errors: rowErrors, tx });
    else rows.push(tx);
  });

  return { rows, errors, headers, headerMap };
}

export default function Export() {
  const { transactions, summary, bulkImport } = useData();
  const { user } = useAuth();
  const { show } = useNotification();

  // Export state
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [exporting, setExporting] = useState('');

  // Import state
  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [importData, setImportData] = useState(null); // { rows, errors, fileName }
  const [importMode, setImportMode] = useState('append'); // 'append' | 'replace'
  const [showErrors, setShowErrors] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const filtered = transactions.filter(t => {
    if (dateFrom && t.date < dateFrom) return false;
    if (dateTo && t.date > dateTo) return false;
    return true;
  });

  // ─── Excel Import ───────────────────────────────────────────────────────────

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!e.target.files?.length) return;
    e.target.value = '';
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      show('Please select an Excel file (.xlsx or .xls)', 'error');
      return;
    }
    setImporting(true);
    setImportData(null);
    try {
      const { rows, errors } = await parseExcelFile(file);
      setImportData({ rows, errors, fileName: file.name });
      setShowErrors(errors.length > 0);
      setShowPreview(false);
      if (rows.length === 0 && errors.length === 0)
        show('No valid transactions found in the file.', 'error');
    } catch (err) {
      show('Failed to parse file: ' + err.message, 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const fakeEvent = { target: { files: [file], value: '' }, preventDefault: () => {} };
      handleFileChange(fakeEvent);
    }
  };

  const confirmImport = () => {
    if (!importData?.rows?.length) return;
    const count = bulkImport(importData.rows, importMode);
    show(`Successfully imported ${count} transaction${count !== 1 ? 's' : ''}`);
    setImportData(null);
  };

  const cancelImport = () => setImportData(null);

  // ─── Excel Export ────────────────────────────────────────────────────────────

  const exportExcel = async () => {
    setExporting('excel');
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = user?.name || 'Stock Tracker';
      wb.created = new Date();

      const ws = wb.addWorksheet('Transactions');
      ws.columns = [
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Day', key: 'day', width: 12 },
        { header: 'Symbol', key: 'symbol', width: 10 },
        { header: 'Contracts', key: 'optionCount', width: 12 },
        { header: 'Buy Price', key: 'buyPrice', width: 12 },
        { header: 'Buy Amount', key: 'buyAmount', width: 14 },
        { header: 'Sell Price', key: 'sellPrice', width: 12 },
        { header: 'Sell Amount', key: 'sellAmount', width: 14 },
        { header: 'P/L', key: 'pl', width: 14 },
        { header: 'Account', key: 'account', width: 16 },
        { header: 'Service Provider', key: 'serviceProvider', width: 18 },
        { header: 'Comments', key: 'comments', width: 30 },
      ];
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

      filtered.forEach(t => {
        const pl = parseFloat(t.pl) || 0;
        const row = ws.addRow({
          date: t.date, day: t.day, symbol: t.symbol,
          optionCount: parseFloat(t.optionCount) || null,
          buyPrice: parseFloat(t.buyPrice) || null,
          buyAmount: parseFloat(t.buyAmount) || null,
          sellPrice: parseFloat(t.sellPrice) || null,
          sellAmount: parseFloat(t.sellAmount) || null,
          pl, account: t.account || '', serviceProvider: t.serviceProvider || '', comments: t.comments || '',
        });
        ['buyPrice','buyAmount','sellPrice','sellAmount','pl'].forEach(k => {
          row.getCell(k).numFmt = '$#,##0.00';
        });
        const plCell = row.getCell('pl');
        plCell.font = { color: { argb: pl >= 0 ? 'FF16A34A' : 'FFDC2626' }, bold: true };
      });
      ws.autoFilter = { from: 'A1', to: 'L1' };

      const stats = summary();
      const sw = wb.addWorksheet('Summary');
      sw.addRow(['Metric', 'Value']);
      sw.getRow(1).font = { bold: true };
      sw.addRow(['Total Transactions', stats.count]);
      sw.addRow(['Total P/L', stats.totalPL]);
      sw.addRow(['Total Buy Amount', stats.totalBuy]);
      sw.addRow(['Total Sell Amount', stats.totalSell]);
      sw.addRow(['Exported On', format(new Date(), 'yyyy-MM-dd HH:mm')]);
      sw.addRow(['Exported By', user?.name || '']);
      sw.columns = [{ width: 22 }, { width: 18 }];

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trades_${format(new Date(), 'yyyyMMdd')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      show(`Exported ${filtered.length} transactions to Excel`);
    } catch (err) {
      show('Export failed: ' + err.message, 'error');
    } finally {
      setExporting('');
    }
  };

  // ─── PDF Export ──────────────────────────────────────────────────────────────

  const exportPDF = async () => {
    setExporting('pdf');
    try {
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF({ orientation: 'landscape' });
      const stats = summary();

      doc.setFontSize(18); doc.setTextColor(30, 64, 175);
      doc.text('Stock & Options Transaction Report', 14, 18);
      doc.setFontSize(10); doc.setTextColor(100);
      doc.text(`Generated: ${format(new Date(), 'MMMM d, yyyy')} | User: ${user?.name || ''}`, 14, 26);

      const summaryY = 34;
      [['Total Trades', stats.count.toString()], ['Total P/L', fmt(stats.totalPL)], ['Total Buy', fmt(stats.totalBuy)], ['Total Sell', fmt(stats.totalSell)]].forEach(([label, val], i) => {
        const x = 14 + i * 70;
        doc.setFillColor(243, 244, 246);
        doc.roundedRect(x, summaryY, 64, 18, 2, 2, 'F');
        doc.setFontSize(8); doc.setTextColor(100); doc.text(label, x + 4, summaryY + 7);
        doc.setFontSize(11); doc.setTextColor(0); doc.text(val, x + 4, summaryY + 15);
      });

      autoTable(doc, {
        startY: summaryY + 26,
        head: [['Date','Symbol','Contracts','Buy Price','Buy Amt','Sell Price','Sell Amt','P/L','Account','Provider','Comments']],
        body: filtered.map(t => [t.date, t.symbol, t.optionCount||'', fmt(t.buyPrice), fmt(t.buyAmount), fmt(t.sellPrice), fmt(t.sellAmount), fmt(t.pl), t.account||'', t.serviceProvider||'', t.comments||'']),
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 7 },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 7) {
            const val = parseFloat(String(data.cell.raw).replace('$','') || 0);
            data.cell.styles.textColor = val >= 0 ? [22,163,74] : [220,38,38];
            data.cell.styles.fontStyle = 'bold';
          }
        },
      });

      const pages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i); doc.setFontSize(7); doc.setTextColor(150);
        doc.text(`Page ${i} of ${pages}`, doc.internal.pageSize.width - 20, doc.internal.pageSize.height - 8);
      }
      doc.save(`trades_${format(new Date(), 'yyyyMMdd')}.pdf`);
      show(`Exported ${filtered.length} transactions to PDF`);
    } catch (err) {
      show('Export failed: ' + err.message, 'error');
    } finally {
      setExporting('');
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  const previewRows = importData?.rows?.slice(0, 5) || [];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Import / Export</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">Import transactions from Excel or export your data</p>
      </div>

      {/* ── IMPORT SECTION ─────────────────────────────────────────────────── */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-5">
          <Upload size={18} className="text-blue-600" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Import from Excel</h3>
        </div>

        {!importData ? (
          <>
            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mx-auto mb-3">
                <FileSpreadsheet size={24} className="text-blue-600 dark:text-blue-400" />
              </div>
              {importing ? (
                <p className="text-sm text-gray-600 dark:text-gray-400">Parsing file<span className="animate-pulse">…</span></p>
              ) : (
                <>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Drop an Excel file here, or click to browse</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Supports .xlsx files exported from this app or with matching column headers</p>
                </>
              )}
            </div>

            {/* Column hint */}
            <details className="mt-4">
              <summary className="text-xs text-blue-600 hover:text-blue-700 cursor-pointer select-none font-medium">Supported column headers</summary>
              <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-500 dark:text-gray-400 pl-2">
                {Object.entries(HEADER_ALIASES).map(([field, aliases]) => (
                  <div key={field}><span className="font-medium text-gray-700 dark:text-gray-300">{field}:</span> {aliases.join(', ')}</div>
                ))}
              </div>
            </details>
          </>
        ) : (
          /* ── Import preview & confirmation ─────────────────────────────── */
          <div className="space-y-4">
            {/* File summary */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileSpreadsheet size={20} className="text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{importData.fileName}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {importData.rows.length} valid row{importData.rows.length !== 1 ? 's' : ''} ready to import
                    {importData.errors.length > 0 && ` · ${importData.errors.length} row${importData.errors.length !== 1 ? 's' : ''} with issues`}
                  </p>
                </div>
              </div>
              <button onClick={cancelImport} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 flex-shrink-0">
                <X size={16} />
              </button>
            </div>

            {/* Error rows */}
            {importData.errors.length > 0 && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 overflow-hidden">
                <button
                  onClick={() => setShowErrors(s => !s)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left"
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400" />
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                      {importData.errors.length} row{importData.errors.length !== 1 ? 's' : ''} will be skipped
                    </span>
                  </div>
                  {showErrors ? <ChevronUp size={14} className="text-amber-500" /> : <ChevronDown size={14} className="text-amber-500" />}
                </button>
                {showErrors && (
                  <ul className="px-4 pb-3 space-y-1">
                    {importData.errors.map(({ rowNum, errors: errs }) => (
                      <li key={rowNum} className="text-xs text-amber-700 dark:text-amber-400">
                        Row {rowNum}: {errs.join(', ')}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Preview table */}
            {importData.rows.length > 0 && (
              <div>
                <button onClick={() => setShowPreview(s => !s)} className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium mb-2">
                  {showPreview ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  {showPreview ? 'Hide' : 'Show'} preview (first {Math.min(5, importData.rows.length)} rows)
                </button>
                {showPreview && (
                  <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-800">
                          {['Date', 'Symbol', 'Contracts', 'Buy Amt', 'Sell Amt', 'P/L', 'Account'].map(h => (
                            <th key={h} className="text-left px-3 py-2 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {previewRows.map((row, i) => {
                          const pl = parseFloat(row.pl) || 0;
                          return (
                            <tr key={i} className="bg-white dark:bg-gray-900">
                              <td className="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">{row.date}</td>
                              <td className="px-3 py-2 font-semibold text-gray-900 dark:text-white">{row.symbol}</td>
                              <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{row.optionCount || '—'}</td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{fmt(row.buyAmount)}</td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{fmt(row.sellAmount)}</td>
                              <td className={`px-3 py-2 font-semibold ${pl >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmt(pl)}</td>
                              <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{row.account || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {importData.rows.length > 5 && (
                      <p className="text-center text-xs text-gray-400 py-2 border-t border-gray-100 dark:border-gray-700">
                        +{importData.rows.length - 5} more rows
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Import mode */}
            <div className="flex gap-4">
              {[
                { value: 'append', label: 'Append', desc: 'Add to existing transactions' },
                { value: 'replace', label: 'Replace all', desc: 'Delete existing & import fresh' },
              ].map(opt => (
                <label key={opt.value} className={`flex-1 flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${importMode === opt.value ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                  <input type="radio" name="importMode" value={opt.value} checked={importMode === opt.value} onChange={() => setImportMode(opt.value)} className="mt-0.5 accent-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{opt.label}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{opt.desc}</p>
                    {opt.value === 'replace' && importMode === 'replace' && (
                      <p className="text-xs text-red-500 font-medium mt-0.5">Will permanently delete {transactions.length} existing transaction{transactions.length !== 1 ? 's' : ''}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>

            {/* Confirm */}
            <div className="flex gap-3">
              <button
                onClick={confirmImport}
                disabled={importData.rows.length === 0}
                className="btn-primary flex items-center gap-2"
              >
                <CheckCircle size={16} />
                Import {importData.rows.length} Transaction{importData.rows.length !== 1 ? 's' : ''}
              </button>
              <button onClick={cancelImport} className="btn-secondary">Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* ── EXPORT SECTION ─────────────────────────────────────────────────── */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={16} className="text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Filter Export by Date Range</h3>
        </div>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="label">From</label>
            <input type="date" className="input text-sm w-44" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" className="input text-sm w-44" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="btn-secondary text-sm">Clear</button>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          {filtered.length} of {transactions.length} transactions will be exported
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card p-6">
          <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center mb-4">
            <FileSpreadsheet size={24} className="text-green-600 dark:text-green-400" />
          </div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Excel (.xlsx)</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Export transactions with formatting, filters, and summary sheet.</p>
          <button onClick={exportExcel} disabled={!!exporting || filtered.length === 0} className="btn-primary flex items-center gap-2 w-full justify-center">
            <Download size={16} />
            {exporting === 'excel' ? 'Exporting…' : 'Download Excel'}
          </button>
        </div>

        <div className="card p-6">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center mb-4">
            <FileText size={24} className="text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">PDF Report</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Export a formatted PDF report with summary and transaction table.</p>
          <button onClick={exportPDF} disabled={!!exporting || filtered.length === 0} className="btn-danger flex items-center gap-2 w-full justify-center">
            <Download size={16} />
            {exporting === 'pdf' ? 'Exporting…' : 'Download PDF'}
          </button>
        </div>
      </div>

      {filtered.length === 0 && !importData && (
        <div className="card p-6 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">No transactions match the selected date range.</p>
        </div>
      )}
    </div>
  );
}
