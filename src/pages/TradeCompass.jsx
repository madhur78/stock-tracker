import { useState, useRef } from 'react';
import {
  Search, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp,
  Target, Shield, BarChart2, AlertCircle, BookOpen, Zap, CheckCircle,
  XCircle, Clock, Activity, ArrowUp, ArrowDown,
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt  = (n, d=2) => n==null ? '—' : n.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const fmtV = (n) => n==null ? '—' : n>=1e9 ? (n/1e9).toFixed(2)+'B' : n>=1e6 ? (n/1e6).toFixed(2)+'M' : n>=1e3 ? (n/1e3).toFixed(1)+'K' : n.toLocaleString();

const trendColor = (t) => t==='bullish'?'text-green-600 dark:text-green-400':t==='bearish'?'text-red-500 dark:text-red-400':'text-yellow-500 dark:text-yellow-400';
const trendBg    = (t) => t==='bullish'?'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800':t==='bearish'?'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800':'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
const trendBadge = (t) => t==='bullish'?'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300':t==='bearish'?'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300':'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300';

function TrendIcon({ t, size=18 }) {
  if (t==='bullish') return <TrendingUp size={size} className="text-green-500" />;
  if (t==='bearish') return <TrendingDown size={size} className="text-red-500" />;
  return <Minus size={size} className="text-yellow-500" />;
}

// ── Analyst Call banner ────────────────────────────────────────────────────────

function AnalystCallBanner({ call }) {
  if (!call) return null;
  const { verdict, points, watchAbove, watchBelow } = call;

  const cfg = {
    BUY:      { bg:'bg-green-50 dark:bg-green-900/25 border-green-300 dark:border-green-700', badge:'bg-green-500', icon: CheckCircle, label:'BUY / Consider Entry', textCol:'text-green-800 dark:text-green-200' },
    WAIT:     { bg:'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700', badge:'bg-yellow-500', icon: Clock, label:'WAIT — No clear edge yet', textCol:'text-yellow-800 dark:text-yellow-200' },
    NO_TRADE: { bg:'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700', badge:'bg-red-500', icon: XCircle, label:'NO TRADE — Stay out', textCol:'text-red-800 dark:text-red-200' },
  }[verdict] ?? { bg:'bg-gray-50 dark:bg-gray-700', badge:'bg-gray-500', icon: Minus, label: verdict, textCol:'text-gray-700 dark:text-gray-300' };

  const Icon = cfg.icon;

  return (
    <div className={`card border-2 ${cfg.bg} p-5`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`flex items-center justify-center w-9 h-9 rounded-xl ${cfg.badge}`}>
          <Icon size={20} className="text-white" />
        </div>
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-semibold">Today's Analyst Call</div>
          <div className={`text-lg font-bold ${cfg.textCol}`}>{cfg.label}</div>
        </div>
      </div>
      <ul className="space-y-1.5 mb-3">
        {points.map((p, i) => (
          <li key={i} className="flex gap-2 text-sm text-gray-700 dark:text-gray-300">
            <span className={`${cfg.textCol} font-bold flex-shrink-0`}>→</span>
            {p}
          </li>
        ))}
      </ul>
      {(watchAbove || watchBelow) && (
        <div className="flex flex-wrap gap-3 mt-2 pt-3 border-t border-black/10 dark:border-white/10">
          {watchAbove && (
            <div className="flex items-center gap-1.5 text-sm">
              <ArrowUp size={14} className="text-green-500" />
              <span className="text-gray-500 dark:text-gray-400">Break above:</span>
              <span className="font-bold font-mono text-green-600 dark:text-green-400">${fmt(watchAbove)}</span>
              <span className="text-xs text-gray-400">(bullish confirmation)</span>
            </div>
          )}
          {watchBelow && (
            <div className="flex items-center gap-1.5 text-sm">
              <ArrowDown size={14} className="text-red-500" />
              <span className="text-gray-500 dark:text-gray-400">Break below:</span>
              <span className="font-bold font-mono text-red-500">${fmt(watchBelow)}</span>
              <span className="text-xs text-gray-400">(stop / stay out)</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Today's Picture ────────────────────────────────────────────────────────────

function TodaysPicture({ today, price, market }) {
  const rangeBar = today.dayRange > 0 ? Math.round(((price.current - today.low) / today.dayRange) * 100) : 50;

  return (
    <div className="card p-5 space-y-4">
      <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
        <Activity size={16} className="text-indigo-500" /> Today's Picture
      </h3>

      {/* OHLC Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label:'Open (prev close)', val: `$${fmt(today.prevClose)}` },
          { label:'Day High', val: `$${fmt(today.high)}`, color:'text-green-600 dark:text-green-400' },
          { label:'Day Low',  val: `$${fmt(today.low)}`,  color:'text-red-500 dark:text-red-400' },
          { label:'Day Range', val: `$${fmt(today.dayRange)}` },
        ].map(({ label, val, color }) => (
          <div key={label} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{label}</div>
            <div className={`text-sm font-bold font-mono ${color ?? 'text-gray-800 dark:text-gray-100'}`}>{val}</div>
          </div>
        ))}
      </div>

      {/* Range bar: where did price close within the day? */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
          <span>Low ${fmt(today.low)}</span>
          <span className={`font-semibold ${today.closePosition==='upper'?'text-green-600':today.closePosition==='lower'?'text-red-500':'text-yellow-500'}`}>
            Closed in the {today.closePosition} 1/3 — {today.closePosition==='upper'?'buyers won':'today.closePosition'==='lower'?'sellers won':'neither won'}
          </span>
          <span>High ${fmt(today.high)}</span>
        </div>
        <div className="relative h-4 bg-gradient-to-r from-red-200 via-yellow-200 to-green-200 dark:from-red-900/40 dark:via-yellow-900/30 dark:to-green-900/40 rounded-full overflow-hidden">
          <div className="absolute inset-y-0 left-1/3 w-px bg-yellow-400 opacity-50" />
          <div className="absolute inset-y-0 left-2/3 w-px bg-yellow-400 opacity-50" />
          <div
            className="absolute top-1 w-2.5 h-2.5 rounded-full bg-blue-600 border-2 border-white shadow -translate-x-1/2"
            style={{ left: `${Math.min(97, Math.max(3, rangeBar))}%` }}
          />
        </div>
        <div className="text-center text-xs text-gray-500 dark:text-gray-400 mt-1">
          Bounced ${fmt(today.bounceAmt)} off the low ({fmt(today.bounceFromLowPct, 0)}% recovery)
        </div>
      </div>

      {/* Candle signals + HL vs yesterday */}
      <div className="flex flex-wrap gap-2">
        {today.isHammer && <Chip green>🔨 Hammer — buyers at the low</Chip>}
        {today.hasLongLowerWick && !today.isHammer && <Chip green>↑ Long lower wick</Chip>}
        {today.hasLongUpperWick && <Chip red>↓ Long upper wick</Chip>}
        {today.isDoji && <Chip yellow>⊖ Doji — indecision</Chip>}
        {today.isHigherHigh && today.isHigherLow && <Chip green>↑↑ Higher high + higher low</Chip>}
        {today.isLowerHigh && today.isLowerLow  && <Chip red>↓↓ Lower high + lower low</Chip>}
        {today.isHigherLow && !today.isHigherHigh && <Chip green>↑ Higher low (defending)</Chip>}
        {today.vwap && (
          <Chip green={today.isAboveVWAP} red={!today.isAboveVWAP}>
            VWAP ${fmt(today.vwap)} — {today.isAboveVWAP ? 'Price above ✓' : 'Price below ✗'}
          </Chip>
        )}
      </div>

      {/* Market context */}
      {market && (
        <div className={`flex flex-wrap items-center gap-3 p-3 rounded-xl border ${
          market.marketFalling ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' :
          market.marketRallying ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' :
          'bg-gray-50 dark:bg-gray-700/40 border-gray-200 dark:border-gray-700'
        }`}>
          <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Market Context:</div>
          {market.spxChangePct != null && (
            <span className={`text-sm font-mono font-semibold ${market.spxChangePct>=0?'text-green-600':'text-red-500'}`}>
              SPX {market.spxChangePct>=0?'+':''}{fmt(market.spxChangePct)}%
            </span>
          )}
          {market.qqqChangePct != null && (
            <span className={`text-sm font-mono font-semibold ${market.qqqChangePct>=0?'text-green-600':'text-red-500'}`}>
              QQQ {market.qqqChangePct>=0?'+':''}{fmt(market.qqqChangePct)}%
            </span>
          )}
          {market.relativeStrength && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
              market.relativeStrength==='stronger' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' :
              market.relativeStrength==='weaker'   ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' :
              'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}>
              {market.relativeStrength === 'stronger' ? '↑ Outperforming market' :
               market.relativeStrength === 'weaker'   ? '↓ Underperforming market' :
               '~ Inline with market'}
            </span>
          )}
          {market.marketFalling && (
            <span className="text-xs text-red-600 dark:text-red-400 font-semibold">⚠ Market falling hard — avoid new longs</span>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ children, green, red, yellow }) {
  const cls = green ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700'
            : red   ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700'
            : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-700';
  return <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${cls}`}>{children}</span>;
}

// ── Dip-Bought Verdict ─────────────────────────────────────────────────────────

function DipVerdict({ dip }) {
  if (!dip) return null;
  const { verdict, for: forList, against: againstList } = dip;
  const vcfg = {
    YES:     { label: 'YES — Dip is being bought', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700' },
    PARTLY:  { label: 'PARTLY — Partial recovery', color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700' },
    NO:      { label: 'NO — This is a real breakdown', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700' },
    UNCLEAR: { label: 'UNCLEAR — Need more data', color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600' },
  }[verdict] ?? { label: verdict, color: 'text-gray-600', bg: 'bg-gray-50' };

  return (
    <div className={`rounded-2xl border p-4 ${vcfg.bg}`}>
      <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wide mb-1">Dip Bought?</div>
      <div className={`text-base font-bold mb-3 ${vcfg.color}`}>{vcfg.label}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {forList?.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-green-600 dark:text-green-400 mb-1">Signs buyers showed up:</div>
            <ul className="space-y-1">
              {forList.map((s,i) => <li key={i} className="text-xs text-gray-700 dark:text-gray-300 flex gap-1.5"><span className="text-green-500 font-bold">✓</span>{s}</li>)}
            </ul>
          </div>
        )}
        {againstList?.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-red-500 mb-1">Signs sellers are winning:</div>
            <ul className="space-y-1">
              {againstList.map((s,i) => <li key={i} className="text-xs text-gray-700 dark:text-gray-300 flex gap-1.5"><span className="text-red-400 font-bold">✗</span>{s}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ── SMA row ────────────────────────────────────────────────────────────────────

function SMARow({ label, value, price }) {
  const above = price!=null && value!=null && price>value;
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-mono font-medium text-gray-800 dark:text-gray-200">${fmt(value)}</span>
        {value!=null && (
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${above?'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300':'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'}`}>
            {above ? '▲ Above' : '▼ Below'}
          </span>
        )}
      </div>
    </div>
  );
}

// ── RSI Gauge ─────────────────────────────────────────────────────────────────

function RSIGauge({ rsi, signal }) {
  if (rsi==null) return <span className="text-sm text-gray-500">—</span>;
  const pct = Math.min(100, Math.max(0, rsi));
  const color = signal==='oversold'?'bg-red-500':signal==='overbought'?'bg-orange-500':'bg-blue-500';
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
        <span>Oversold (30)</span>
        <span className={`font-bold ${signal==='oversold'?'text-red-500':signal==='overbought'?'text-orange-500':'text-blue-600 dark:text-blue-400'}`}>RSI {fmt(rsi,1)}</span>
        <span>Overbought (70)</span>
      </div>
      <div className="relative h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className="absolute left-0 top-0 h-full bg-red-100 dark:bg-red-900/30" style={{width:'30%'}} />
        <div className="absolute right-0 top-0 h-full bg-orange-100 dark:bg-orange-900/30" style={{width:'30%'}} />
        <div className={`absolute top-0.5 h-2 w-2 rounded-full ${color} -translate-x-1/2`} style={{left:`${pct}%`}} />
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        {signal==='oversold'?'Oversold — historically bounces from here':signal==='overbought'?'Overbought — may stall or pull back':'Neutral — room to move in either direction'}
      </p>
    </div>
  );
}

// ── Confidence bar ─────────────────────────────────────────────────────────────

function ConfBar({ conf, trend }) {
  const fill = trend==='bullish'?'bg-green-500':trend==='bearish'?'bg-red-500':'bg-yellow-500';
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500 dark:text-gray-400">Signal Confidence</span>
        <span className={`font-bold ${trendColor(trend)}`}>{conf}%</span>
      </div>
      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${fill}`} style={{width:`${conf}%`}} />
      </div>
    </div>
  );
}

// ── Price Ladder ─────────────────────────────────────────────────────────────────

function PriceLadder({ price, supports, resistances }) {
  const all = [
    ...resistances.map(v=>({v,type:'resistance'})),
    {v:price,type:'current'},
    ...supports.map(v=>({v,type:'support'})),
  ].sort((a,b)=>b.v-a.v);

  return (
    <div className="space-y-1.5">
      {all.map(({v,type},i) => (
        <div key={i} className={`flex items-center gap-3 px-3 py-1.5 rounded-lg ${
          type==='current'    ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 font-semibold'
          :type==='resistance'? 'bg-red-50 dark:bg-red-900/10'
          : 'bg-green-50 dark:bg-green-900/10'
        }`}>
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${type==='current'?'bg-blue-500':type==='resistance'?'bg-red-400':'bg-green-500'}`} />
          <span className={`flex-1 text-sm font-mono ${type==='current'?'text-blue-700 dark:text-blue-300':type==='resistance'?'text-red-600 dark:text-red-400':'text-green-700 dark:text-green-400'}`}>
            ${fmt(v)}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {type==='current'?'← Price now'
            :type==='resistance'?`+${fmt((v-price)/price*100,1)}% Resistance`
            :`${fmt((v-price)/price*100,1)}% Support`}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Option Card ─────────────────────────────────────────────────────────────────

function OptionCard({ opt, currentPrice }) {
  const badge = opt.type==='call'
    ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
    : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300';
  const border = opt.type==='call' ? 'border-green-200 dark:border-green-800' : 'border-red-200 dark:border-red-800';

  // Intrinsic / extrinsic breakdown
  const intrinsic = opt.type==='call' ? Math.max(0, currentPrice - opt.strike) : Math.max(0, opt.strike - currentPrice);
  const midPrice  = opt.bid && opt.ask ? (opt.bid+opt.ask)/2 : opt.ask;
  const extrinsic = midPrice ? Math.max(0, midPrice - intrinsic) : null;
  const breakeven = opt.type==='call' ? opt.strike + (opt.ask??0) : opt.strike - (opt.ask??0);
  const beDistPct = currentPrice ? ((breakeven - currentPrice)/currentPrice*100) : null;

  return (
    <div className={`border ${border} rounded-xl p-4 space-y-3 bg-white dark:bg-gray-800`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase ${badge}`}>{opt.type}</span>
          <span className="font-bold text-gray-900 dark:text-white">${fmt(opt.strike)}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{opt.label}</span>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">Expires</div>
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300">{opt.expiry??'—'} <span className="text-gray-400">({opt.dte??'?'} DTE)</span></div>
        </div>
      </div>

      {/* Pricing row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 text-center">
          <div className="text-xs text-gray-500 dark:text-gray-400">Bid / Ask</div>
          <div className="text-sm font-mono font-semibold text-gray-800 dark:text-gray-100">${fmt(opt.bid)} / ${fmt(opt.ask)}</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 text-center">
          <div className="text-xs text-gray-500 dark:text-gray-400">Cost (1 contract)</div>
          <div className="text-sm font-mono font-semibold text-gray-800 dark:text-gray-100">{opt.ask ? `~$${fmt(opt.ask*100,0)}` : '—'}</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 text-center">
          <div className="text-xs text-gray-500 dark:text-gray-400">IV</div>
          <div className="text-sm font-mono font-semibold text-gray-800 dark:text-gray-100">{opt.iv!=null?`${Math.round(opt.iv*100)}%`:'—'}</div>
        </div>
      </div>

      {/* Breakeven check — the most important thing */}
      {breakeven!=null && (
        <div className={`flex items-start gap-2 p-2.5 rounded-lg ${Math.abs(beDistPct??99)>10?'bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800':'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'}`}>
          <Target size={14} className={Math.abs(beDistPct??99)>10?'text-orange-500 mt-0.5 flex-shrink-0':'text-blue-500 mt-0.5 flex-shrink-0'} />
          <div className="text-xs">
            <span className="font-semibold text-gray-700 dark:text-gray-300">Breakeven: ${fmt(breakeven)}</span>
            {beDistPct!=null && <span className={`ml-1 ${Math.abs(beDistPct)>10?'text-orange-600 dark:text-orange-400':'text-blue-600 dark:text-blue-400'}`}>
              ({beDistPct>0?'+':''}{fmt(beDistPct,1)}% from current)
            </span>}
            <span className="block text-gray-500 dark:text-gray-400 mt-0.5">
              Stock must reach ${fmt(breakeven)} before expiry to break even.
              {intrinsic>0 ? ` Intrinsic: $${fmt(intrinsic)} · Extrinsic (time): $${fmt(extrinsic??0)}` : ` All time value ($${fmt(extrinsic??0)}) — goes to $0 if stock doesn't move.`}
            </span>
          </div>
        </div>
      )}

      {/* Greeks */}
      <div className="grid grid-cols-4 gap-1.5 text-center">
        {[
          { label:'Delta', val:opt.delta, tip:'$1 stock move → option moves ~$'+(opt.delta??0) },
          { label:'Theta', val:opt.theta, tip:'Lose ~$'+Math.abs(Math.round((opt.theta??0)*100))+'/day per contract (time decay)' },
          { label:'Gamma', val:opt.gamma, tip:'Delta acceleration — highest near ATM' },
        ].map(({label,val,tip}) => (
          <div key={label} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-1.5" title={tip}>
            <div className="text-xs text-gray-400">{label}</div>
            <div className={`text-xs font-mono font-semibold ${label==='Theta'&&val!=null?'text-red-500':'text-gray-800 dark:text-gray-200'}`}>
              {val!=null?fmt(val,3):'—'}
            </div>
          </div>
        ))}
        {opt.bsPrice!=null && (
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-1.5" title="Black-Scholes theoretical fair value">
            <div className="text-xs text-blue-500">BS Fair</div>
            <div className="text-xs font-mono font-semibold text-blue-700 dark:text-blue-300">${fmt(opt.bsPrice)}</div>
          </div>
        )}
      </div>
      {opt.theta && <p className="text-xs text-gray-400 dark:text-gray-500">Daily theta decay: ~${fmt(Math.abs(opt.theta)*100,0)}/contract/day — in {opt.dte??'?'} days you'll pay ~${fmt(Math.abs(opt.theta)*100*(opt.dte??0),0)} in time cost even if price doesn't move.</p>}
    </div>
  );
}

// ── Collapsible section ─────────────────────────────────────────────────────────

function Section({ icon: Icon, title, children, defaultOpen=true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card overflow-hidden">
      <button onClick={()=>setOpen(o=>!o)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
        <div className="flex items-center gap-2">
          <Icon size={17} className="text-indigo-500" />
          <span className="font-semibold text-gray-900 dark:text-white">{title}</span>
        </div>
        {open?<ChevronUp size={16} className="text-gray-400"/>:<ChevronDown size={16} className="text-gray-400"/>}
      </button>
      {open && <div className="px-5 pb-5 pt-1">{children}</div>}
    </div>
  );
}

// ── Learn items ─────────────────────────────────────────────────────────────────

const LEARN = [
  { q:'How do I know if a dip is worth buying?', a:'Three things together: (1) The stock is in an uptrend (price above SMA 50 and 200), (2) the dip brings RSI below 40 or price to a known support level, and (3) on the bounce day you see a long lower wick, close near the top of the range, and above-average volume. All three = strong dip-buy signal. Buy the bounce, not the fall.' },
  { q:'What is VWAP and why does it matter?', a:'VWAP (Volume Weighted Average Price) is the average price weighted by volume for the day. When price is above VWAP, buyers are winning. Below VWAP = sellers in control. If a stock dips to VWAP and bounces, that\'s a strong support signal. Institutions buy near VWAP — it\'s the "fair price" of the day.' },
  { q:'What do higher highs / higher lows mean?', a:'Higher high + higher low vs yesterday = uptrend intensifying (each wave goes higher). Lower high + lower low = downtrend (each wave goes lower). A "higher low" alone — where today\'s dip holds above yesterday\'s low — means buyers are defending higher levels. That\'s the most important setup: an uptrend dip where higher lows confirm buyers are still in control.' },
  { q:'What are Moving Averages (SMA 20 / 50 / 200)?', a:'SMA 20 = average of last 20 days (short-term momentum). SMA 50 = medium-term trend. SMA 200 = long-term trend. When price is above all three, the stock is in a healthy uptrend. The "Golden Cross" (SMA 50 crossing above SMA 200) is a major bullish signal. SMA crossovers are slower signals — use them to confirm direction, not time exact entries.' },
  { q:'Which option strike and expiry should I choose?', a:'Strike — use Delta: 0.60-0.70 (slightly ITM) = safer, moves like the stock, expensive. 0.50 (ATM) = balanced risk/reward. 0.25-0.35 (OTM) = cheap lottery, but expires worthless most of the time. Expiry — give yourself 2× the time you think you need. For a 2-week swing trade, buy 30-45 DTE options. Time decay (theta) accelerates in the final 2 weeks, so don\'t hold options too close to expiry.' },
  { q:'What is Breakeven and why does it matter?', a:'Breakeven = your strike + premium paid. For a $185 call you bought for $3.50, breakeven = $188.50. The stock must reach $188.50 before expiry just for you to break even. The further OTM, the more the stock must move. Always ask: "Is my target far enough above breakeven to make this worth the risk?" If the target barely clears breakeven, the trade has bad odds.' },
  { q:'What is Theta (time decay)?', a:'Theta is how much your option loses each day just from time passing — even if the stock price doesn\'t move. A theta of -$0.05 means you lose $5 per contract per day. For 30-day options it\'s manageable; for weekly options it\'s brutal — you can be right about direction but still lose because the stock moved too slowly. Never buy a weekly option for a thesis that takes 2 weeks to play out.' },
  { q:'What is IV crush and when does it happen?', a:'IV (Implied Volatility) is the market\'s expectation of future movement. High IV = expensive options. After earnings, IV usually collapses (IV crush) — even if the stock moves in your direction, your option can lose value because the uncertainty premium disappears. Rule: before earnings, IV is high, so it\'s often better to sell premium than buy it. After earnings, IV is low — better for buying.' },
];

function LearnCard({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <button onClick={()=>setOpen(o=>!o)} className="w-full text-left px-4 py-3 flex items-start justify-between gap-2 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{q}</span>
        {open?<ChevronUp size={15} className="text-gray-400 flex-shrink-0 mt-0.5"/>:<ChevronDown size={15} className="text-gray-400 flex-shrink-0 mt-0.5"/>}
      </button>
      {open && <div className="px-4 pb-3"><p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{a}</p></div>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TradeCompass() {
  const [symbol,  setSymbol]  = useState('');
  const [loading, setLoading] = useState(false);
  const [data,    setData]    = useState(null);
  const [error,   setError]   = useState('');
  const [optTab,  setOptTab]  = useState('shortTerm');
  const inputRef              = useRef(null);

  async function analyze(sym) {
    const s = (sym ?? symbol).trim().toUpperCase();
    if (!s) return;
    setLoading(true); setError(''); setData(null);
    try {
      const res  = await fetch(`/api/trade-compass?symbol=${encodeURIComponent(s)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Analysis failed');
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const d = data;

  return (
    <div className="max-w-4xl space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-900/40">
          <Zap size={22} className="text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Trade Compass</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Analyst-style briefing · Is the dip bought? · Options guidance</p>
        </div>
      </div>

      {/* Search */}
      <div className="card p-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={inputRef} type="text" value={symbol}
              onChange={e=>setSymbol(e.target.value.toUpperCase())}
              onKeyDown={e=>e.key==='Enter'&&analyze()}
              placeholder="Enter stock symbol (e.g. AAPL, TSLA, SPY…)"
              className="input pl-9 uppercase font-mono text-sm w-full" maxLength={12}
            />
          </div>
          <button onClick={()=>analyze()} disabled={loading||!symbol.trim()}
            className="btn-primary px-6 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                     : <BarChart2 size={16} />}
            {loading ? 'Analyzing…' : 'Analyze'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {['AAPL','TSLA','SPY','NVDA','QQQ','MSFT','AMZN','META','AMD','GOOGL'].map(s=>(
            <button key={s} onClick={()=>{setSymbol(s);analyze(s);}}
              className="text-xs px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 hover:text-indigo-700 dark:hover:text-indigo-300 font-mono transition-colors">
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <AlertCircle size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {loading && (
        <div className="space-y-4 animate-pulse">
          {[80,80,120,80].map((h,i)=>(
            <div key={i} className="card p-5" style={{height:`${h}px`}}>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-2"/>
              <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-2/3"/>
            </div>
          ))}
        </div>
      )}

      {d && (
        <>
          {/* ── Step 1: Price overview ───────────────────────────────────────── */}
          <div className={`card p-4 border-2 ${trendBg(d.technicals.trend)}`}>
            <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wide mb-2">Step 1 — The Facts</div>
            <div className="flex flex-wrap items-start gap-4 justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <TrendIcon t={d.technicals.trend} size={20} />
                  <span className="text-2xl font-bold text-gray-900 dark:text-white font-mono">${fmt(d.price.current)}</span>
                  <span className={`text-sm font-semibold ${d.price.change>=0?'text-green-600':'text-red-500'}`}>
                    {d.price.change>=0?'+':''}{fmt(d.price.change)} ({fmt(d.price.changePct,2)}%)
                  </span>
                </div>
                <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {d.price.name&&d.price.name!==d.symbol?`${d.price.name} · `:''}{d.symbol}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className={`text-sm font-bold px-3 py-1 rounded-full ${trendBadge(d.technicals.trend)}`}>
                    {d.technicals.trend.toUpperCase()} · {d.technicals.trendStrength}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Day Range</div>
                  <div className="font-mono text-gray-800 dark:text-gray-200">${fmt(d.today.low)} – ${fmt(d.today.high)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Prev Close</div>
                  <div className="font-mono text-gray-800 dark:text-gray-200">${fmt(d.today.prevClose)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400">52-Week</div>
                  <div className="font-mono text-gray-800 dark:text-gray-200">${fmt(d.price.week52Low)} – ${fmt(d.price.week52High)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Volume</div>
                  <div className="font-mono text-gray-800 dark:text-gray-200">
                    {fmtV(d.price.volume)}
                    {d.price.volumeRatio!=null&&<span className={`ml-1 text-xs ${d.price.volumeRatio>=1.5?'text-orange-500':'text-gray-400'}`}>({fmt(d.price.volumeRatio,1)}×avg)</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Step 2: Today's picture + dip analysis ─────────────────────── */}
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wide mb-2 ml-1">Step 2 — Today's Picture & Dip Analysis</div>
            <div className="space-y-4">
              <TodaysPicture today={d.today} price={d.price} market={d.market} />
              <DipVerdict dip={d.dipAnalysis} />
            </div>
          </div>

          {/* ── Step 3: Analyst's Call ────────────────────────────────────── */}
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wide mb-2 ml-1">Step 3 — Trader's Call</div>
            <AnalystCallBanner call={d.analystCall} />
          </div>

          {/* ── Technical signals + Key levels (supporting details) ──────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Section icon={BarChart2} title="Technical Signals (Daily Chart)">
              <div className="space-y-4">
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  <SMARow label="SMA 20 (short-term)" value={d.technicals.sma20}  price={d.price.current}/>
                  <SMARow label="SMA 50 (mid-term)"   value={d.technicals.sma50}  price={d.price.current}/>
                  <SMARow label="SMA 200 (long-term)" value={d.technicals.sma200} price={d.price.current}/>
                </div>
                <RSIGauge rsi={d.technicals.rsi} signal={d.technicals.rsiSignal}/>
                {d.technicals.bollinger && (
                  <div className="pt-1">
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                      <span>Bollinger Bands (20-period)</span>
                      <span className={d.technicals.bollingerPosition==='upper'?'text-orange-500':d.technicals.bollingerPosition==='lower'?'text-blue-500':'text-gray-500'}>
                        {d.technicals.bollingerPosition==='upper'?'Near upper (overbought)':d.technicals.bollingerPosition==='lower'?'Near lower (mean-revert)':'Near middle (neutral)'}
                      </span>
                    </div>
                    <div className="flex gap-2 text-xs font-mono text-gray-600 dark:text-gray-400">
                      <span className="text-red-400">↑ ${fmt(d.technicals.bollinger.upper)}</span>
                      <span className="text-gray-400">— ${fmt(d.technicals.bollinger.middle)}</span>
                      <span className="text-green-500">↓ ${fmt(d.technicals.bollinger.lower)}</span>
                    </div>
                  </div>
                )}
                {d.technicals.atr!=null && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-700">
                    <span className="font-medium text-gray-700 dark:text-gray-300">ATR (14-day)</span> ${fmt(d.technicals.atr)} average daily range.
                    Stop placement = current price − 2×ATR = ${fmt(d.tradeSetup.stopLoss)}.
                  </div>
                )}
              </div>
            </Section>

            <Section icon={Target} title="Key Levels — Support & Resistance">
              <div className="space-y-4">
                <PriceLadder price={d.price.current} supports={d.levels.supports} resistances={d.levels.resistances}/>
                <div className="pt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                  <p><span className="font-medium text-green-600 dark:text-green-400">Support</span> = floor where buyers stepped in before. Buy bounces here, set stop just below.</p>
                  <p><span className="font-medium text-red-500">Resistance</span> = ceiling where sellers pushed back before. Take profits near here, or wait for a confirmed break above.</p>
                </div>
              </div>
            </Section>

            {/* Trade Setup */}
            <Section icon={Shield} title="Trade Setup (Entry · Target · Stop)">
              <div className="space-y-4">
                <ConfBar conf={d.tradeSetup.confidence} trend={d.tradeSetup.bias}/>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    {label:'Entry Zone', val:d.tradeSetup.entryZone?`$${fmt(d.tradeSetup.entryZone[0])} – $${fmt(d.tradeSetup.entryZone[1])}`:'—', color:'text-blue-600 dark:text-blue-400'},
                    {label:'Target',     val:`$${fmt(d.tradeSetup.targetPrice)}`, color:'text-green-600 dark:text-green-400'},
                    {label:'Stop Loss',  val:d.tradeSetup.stopLoss?`$${fmt(d.tradeSetup.stopLoss)}`:'—', color:'text-red-500'},
                    {label:'Risk / Reward', val:d.tradeSetup.riskReward?`1 : ${fmt(d.tradeSetup.riskReward,1)}`:'—', color:'text-purple-600 dark:text-purple-400'},
                  ].map(({label,val,color})=>(
                    <div key={label} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{label}</div>
                      <div className={`text-sm font-bold font-mono ${color}`}>{val}</div>
                    </div>
                  ))}
                </div>
                {d.tradeSetup.rationale.length>0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Why this setup:</p>
                    <ul className="space-y-1">
                      {d.tradeSetup.rationale.map((r,i)=>(
                        <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex gap-1.5">
                          <span className={`${trendColor(d.tradeSetup.bias)} font-bold flex-shrink-0`}>→</span>{r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Section>

            {/* Options — Step 4 */}
            <Section icon={TrendingUp} title="Step 4 — Options Strategy">
              {d.options ? (
                <div className="space-y-4">
                  {/* IV bar + strategy */}
                  <div className="flex flex-wrap gap-3">
                    <div className={`flex items-center justify-between flex-1 min-w-[180px] p-3 rounded-xl ${
                      d.options.ivSignal==='high'?'bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800':
                      d.options.ivSignal==='low' ?'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800':
                      'bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-700'}`}>
                      <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">Implied Volatility (IV)</span>
                        <div className="text-lg font-bold font-mono text-gray-900 dark:text-white">{d.options.ivPct!=null?`${d.options.ivPct}%`:'—'}</div>
                      </div>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                        d.options.ivSignal==='high'?'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300':
                        d.options.ivSignal==='low' ?'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300':
                        'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
                        {d.options.ivSignal==='high'?'High IV — sell premium':d.options.ivSignal==='low'?'Low IV — buy options':'Normal IV'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-[180px] p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl">
                      <div className="text-xs text-indigo-500 dark:text-indigo-400 font-semibold mb-0.5">Recommended Strategy</div>
                      <div className="text-sm font-bold text-indigo-700 dark:text-indigo-300">{d.options.suggestion.strategy}</div>
                      <p className="text-xs text-indigo-600/80 dark:text-indigo-400/80 mt-0.5">{d.options.suggestion.rationale}</p>
                    </div>
                  </div>

                  {/* Tabs */}
                  {d.options.chains && (
                    <div>
                      {/* Tab headers */}
                      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-3">
                        {[
                          { key:'zeroDTE',   label:'⚡ 0DTE',      risk:'extreme',     riskColor:'text-red-500' },
                          { key:'shortTerm', label:'✓ Short Term', risk:'moderate',    riskColor:'text-yellow-500' },
                          { key:'leap',      label:'🔵 LEAP',       risk:'conservative',riskColor:'text-blue-500' },
                        ].map(({ key, label, risk, riskColor }) => {
                          const chain = d.options.chains[key];
                          const isActive = optTab === key;
                          return (
                            <button
                              key={key}
                              onClick={() => setOptTab(key)}
                              className={`flex-1 py-2 px-1 text-sm font-semibold transition-colors border-b-2 ${
                                isActive
                                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                              }`}
                            >
                              <div>{label}</div>
                              {chain
                                ? <div className={`text-[10px] font-normal ${riskColor}`}>{chain.expiry} · {chain.dte}d</div>
                                : <div className="text-[10px] font-normal text-gray-400">N/A</div>
                              }
                            </button>
                          );
                        })}
                      </div>

                      {/* Tab content */}
                      {(() => {
                        const chain = d.options.chains[optTab];
                        if (!chain) return (
                          <p className="text-xs text-gray-500 dark:text-gray-400 italic py-3 text-center">
                            No {optTab === 'zeroDTE' ? '0DTE' : optTab === 'shortTerm' ? 'short-term (25-55 day)' : 'LEAP (180+ day)'} expiry found for {d.symbol}.
                          </p>
                        );
                        return (
                          <div className="space-y-3">
                            {/* Risk note */}
                            <div className={`p-3 rounded-xl text-xs text-gray-700 dark:text-gray-300 ${
                              chain.risk==='extreme'      ? 'bg-red-50 dark:bg-red-900/15 border border-red-200 dark:border-red-800' :
                              chain.risk==='conservative' ? 'bg-blue-50 dark:bg-blue-900/15 border border-blue-200 dark:border-blue-800' :
                              'bg-yellow-50 dark:bg-yellow-900/15 border border-yellow-200 dark:border-yellow-800'
                            }`}>
                              {chain.note}
                            </div>
                            {/* Strike cards */}
                            {chain.strikes && chain.strikes.length > 0 ? (
                              <div className="space-y-3">
                                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                                  Suggested contracts — expires {chain.expiry} ({chain.dte}d):
                                </p>
                                {chain.strikes.map((opt, i) => (
                                  <OptionCard key={i} opt={opt} currentPrice={d.price.current} />
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                                No suitable strikes found for this expiry.
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400 italic py-4 text-center">
                  Options data unavailable for {d.symbol}. This may be a non-optionable or index symbol.
                </div>
              )}
            </Section>
          </div>

          {/* ── Learn ──────────────────────────────────────────────────────── */}
          <Section icon={BookOpen} title="Learn the Signals" defaultOpen={false}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {LEARN.map(({q,a})=><LearnCard key={q} q={q} a={a}/>)}
            </div>
          </Section>
        </>
      )}

      {/* Empty state */}
      {!d&&!loading&&!error&&(
        <div className="card p-10 text-center text-gray-400 dark:text-gray-500">
          <Zap size={40} className="mx-auto mb-3 opacity-30"/>
          <p className="text-base font-medium">Enter a stock symbol to get a full analyst briefing</p>
          <p className="text-sm mt-1">Today's facts · Is the dip bought? · Trader's call · Options strategy</p>
        </div>
      )}
    </div>
  );
}
