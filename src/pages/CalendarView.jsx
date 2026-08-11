import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, endOfWeek, isSameMonth, isToday, parseISO
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const fmt = (n) => {
  const abs = Math.abs(n);
  return (n < 0 ? '-$' : '$') + (abs >= 1000 ? (abs / 1000).toFixed(1) + 'k' : abs.toFixed(0));
};

// ── US market holiday calculation ─────────────────────────────────────────────

function observed(year, month, day) {
  const d = new Date(year, month - 1, day);
  const dow = d.getDay();
  if (dow === 6) return new Date(year, month - 1, day - 1); // Sat → Fri
  if (dow === 0) return new Date(year, month - 1, day + 1); // Sun → Mon
  return d;
}

function nthWeekday(year, month, nth, weekday) {
  if (nth > 0) {
    const d = new Date(year, month - 1, 1);
    let count = 0;
    while (count < nth) {
      if (d.getDay() === weekday) count++;
      if (count < nth) d.setDate(d.getDate() + 1);
    }
    return d;
  }
  // nth < 0 → last occurrence
  const d = new Date(year, month, 0);
  while (d.getDay() !== weekday) d.setDate(d.getDate() - 1);
  return d;
}

function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day   = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function toYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const holidayCache = {};
function getHolidays(year) {
  if (holidayCache[year]) return holidayCache[year];
  const easter = easterSunday(year);
  const goodFriday = new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() - 2);
  const holidays = {
    [toYMD(observed(year, 1, 1))]:  "New Year's Day",
    [toYMD(nthWeekday(year, 1, 3, 1))]: 'MLK Day',
    [toYMD(nthWeekday(year, 2, 3, 1))]: "Presidents' Day",
    [toYMD(goodFriday)]:            'Good Friday',
    [toYMD(nthWeekday(year, 5, -1, 1))]: 'Memorial Day',
    [toYMD(observed(year, 6, 19))]: 'Juneteenth',
    [toYMD(observed(year, 7, 4))]:  'Independence Day',
    [toYMD(nthWeekday(year, 9, 1, 1))]: 'Labor Day',
    [toYMD(nthWeekday(year, 11, 4, 4))]: 'Thanksgiving',
    [toYMD(observed(year, 12, 25))]: 'Christmas',
  };
  holidayCache[year] = holidays;
  return holidays;
}

export default function CalendarView() {
  const { transactions } = useData();
  const navigate = useNavigate();
  const [current, setCurrent] = useState(new Date());

  const dayMap = useMemo(() => {
    const map = {};
    transactions.forEach(t => {
      if (!map[t.date]) map[t.date] = { pl: 0, count: 0 };
      map[t.date].pl += parseFloat(t.pl) || 0;
      map[t.date].count++;
    });
    return map;
  }, [transactions]);

  const monthStart = startOfMonth(current);
  const monthEnd = endOfMonth(current);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const prev = () => setCurrent(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const next = () => setCurrent(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  const goToday = () => setCurrent(new Date());

  const handleDayClick = (day) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    if (dayMap[dateStr]?.count > 0) {
      navigate('/daily', { state: { date: dateStr } });
    }
  };

  const monthPL = useMemo(() => {
    return Object.entries(dayMap)
      .filter(([d]) => d.startsWith(format(current, 'yyyy-MM')))
      .reduce((s, [, v]) => s + v.pl, 0);
  }, [dayMap, current]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Calendar View</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Click a day with trades to view details</p>
        </div>
        <div className={`text-sm font-semibold px-3 py-1.5 rounded-lg ${monthPL >= 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
          {format(current, 'MMMM')}: {monthPL >= 0 ? '+' : ''}{fmt(monthPL)}
        </div>
      </div>

      <div className="card p-4 sm:p-6">
        <div className="flex items-center justify-between mb-6">
          <button onClick={prev} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"><ChevronLeft size={20} /></button>
          <div className="text-center">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">{format(current, 'MMMM yyyy')}</h3>
            <button onClick={goToday} className="text-xs text-blue-600 hover:text-blue-700">Today</button>
          </div>
          <button onClick={next} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"><ChevronRight size={20} /></button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="text-center text-xs font-semibold text-gray-400 dark:text-gray-500 py-2">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {days.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const data     = dayMap[dateStr];
            const inMonth  = isSameMonth(day, current);
            const today    = isToday(day);
            const hasTrades = data?.count > 0;
            const pl        = data?.pl || 0;
            const dow       = day.getDay();
            const isWeekend = dow === 0 || dow === 6;
            const holidays  = getHolidays(day.getFullYear());
            const holiday   = holidays[dateStr];
            const isClosed  = isWeekend || !!holiday;

            let bgClass = 'border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30';
            if (hasTrades && pl >= 0)
              bgClass = 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/30';
            else if (hasTrades && pl < 0)
              bgClass = 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30';
            else if (holiday)
              bgClass = 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
            else if (isWeekend)
              bgClass = 'bg-slate-50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-700';

            return (
              <div
                key={dateStr}
                onClick={() => hasTrades && handleDayClick(day)}
                className={`
                  min-h-[70px] sm:min-h-[80px] p-1 sm:p-2 rounded-lg border transition-all
                  ${!inMonth ? 'opacity-30' : ''}
                  ${today ? 'ring-2 ring-blue-500 ring-offset-1' : ''}
                  ${bgClass}
                `}
              >
                <div className={`text-right text-xs font-semibold mb-1 ${today ? 'text-blue-600 dark:text-blue-400' : isClosed && !hasTrades ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
                  {format(day, 'd')}
                </div>
                {holiday && !hasTrades && (
                  <p className="text-[9px] leading-tight text-amber-600 dark:text-amber-400 font-medium truncate">
                    {holiday}
                  </p>
                )}
                {hasTrades && (
                  <div className="space-y-0.5">
                    <p className={`text-xs font-bold ${pl >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {pl >= 0 ? '+' : ''}{fmt(pl)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{data.count}T</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-green-200 dark:bg-green-800" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Profit day</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-red-200 dark:bg-red-800" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Loss day</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-amber-200 dark:bg-amber-800" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Market holiday</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-slate-200 dark:bg-slate-700" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Weekend</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm ring-2 ring-blue-500" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Today</span>
          </div>
        </div>
      </div>
    </div>
  );
}
