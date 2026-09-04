import { useState, useCallback } from 'react';
import { Search, ExternalLink, Heart, Repeat2, MessageCircle, Users, BadgeCheck } from 'lucide-react';

// ── X logo SVG (inline, no external dependency) ──────────────────────────────
function XLogo({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.906-5.63Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

// ── Quick-link search configurations ─────────────────────────────────────────
function buildXUrl(symbol, variant) {
  const tag   = encodeURIComponent(`$${symbol}`);
  const base  = 'https://x.com/search?q=';
  switch (variant) {
    case 'top':       return `${base}${tag}&f=top`;
    case 'latest':    return `${base}${tag}&f=live`;
    case 'following': return `${base}${tag}+filter%3Afollows&f=live`;
    case 'news':      return `${base}${tag}+filter%3Anews&f=live`;
    case 'cashtag':   return `https://x.com/search?q=cashtag%3A${encodeURIComponent(symbol)}&src=cashtag_click`;
    default:          return `${base}${tag}&f=live`;
  }
}

const QUICK_LINKS = [
  { id: 'following', label: 'From People You Follow', desc: 'Only accounts you follow', color: 'bg-blue-600 hover:bg-blue-700', primary: true },
  { id: 'top',       label: 'Top Posts',               desc: 'Most engaging posts',       color: 'bg-gray-800 hover:bg-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600' },
  { id: 'latest',    label: 'Latest Posts',             desc: 'Real-time feed',            color: 'bg-gray-800 hover:bg-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600' },
  { id: 'news',      label: 'News Articles',            desc: 'Links to articles',         color: 'bg-gray-800 hover:bg-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600' },
];

// ── Individual tweet card ─────────────────────────────────────────────────────
function TweetCard({ tweet }) {
  const ago = (() => {
    const diff = Date.now() - new Date(tweet.createdAt).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  })();

  const text = tweet.text.replace(/https:\/\/t\.co\/\S+/g, '').trim();

  return (
    <div className="card p-4 hover:shadow-md transition-shadow">
      <div className="flex gap-3">
        {/* Avatar */}
        {tweet.author?.avatar ? (
          <img
            src={tweet.author.avatar}
            alt={tweet.author.name}
            className="w-10 h-10 rounded-full shrink-0 object-cover"
            onError={e => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0 flex items-center justify-center">
            <XLogo size={16} className="text-gray-500 dark:text-gray-400" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* Author line */}
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {tweet.author ? (
              <>
                <a href={tweet.author.profileUrl} target="_blank" rel="noreferrer"
                  className="font-semibold text-sm text-gray-900 dark:text-white hover:underline truncate">
                  {tweet.author.name}
                </a>
                {tweet.author.verified && (
                  <BadgeCheck size={14} className="text-blue-500 shrink-0" />
                )}
                <span className="text-xs text-gray-400">@{tweet.author.username}</span>
                {tweet.author.followers >= 10_000 && (
                  <span className="text-xs text-gray-400 flex items-center gap-0.5">
                    <Users size={10} />
                    {tweet.author.followers >= 1_000_000
                      ? `${(tweet.author.followers / 1_000_000).toFixed(1)}M`
                      : `${(tweet.author.followers / 1000).toFixed(0)}K`}
                  </span>
                )}
              </>
            ) : (
              <span className="text-sm text-gray-500">Unknown author</span>
            )}
            <span className="text-xs text-gray-400 ml-auto shrink-0">{ago}</span>
          </div>

          {/* Tweet text */}
          <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap break-words">
            {text}
          </p>

          {/* Engagement + link */}
          <div className="flex items-center gap-4 mt-2">
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Heart size={12} /> {tweet.likes.toLocaleString()}
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Repeat2 size={12} /> {tweet.retweets.toLocaleString()}
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <MessageCircle size={12} /> {tweet.replies.toLocaleString()}
            </span>
            <a href={tweet.url} target="_blank" rel="noreferrer"
              className="ml-auto text-xs text-blue-500 hover:text-blue-600 flex items-center gap-0.5">
              View <ExternalLink size={10} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function XFeed() {
  const [symbol,  setSymbol]  = useState('');
  const [input,   setInput]   = useState('');
  const [tweets,  setTweets]  = useState([]);
  const [hasToken, setHasToken] = useState(null); // null = unknown
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [fetched, setFetched] = useState('');

  const search = useCallback(async (sym) => {
    const s = (sym ?? input).trim().toUpperCase();
    if (!s) return;

    setLoading(true);
    setError('');
    setTweets([]);
    setSymbol(s);

    try {
      const res  = await fetch(`/api/xfeed?symbol=${encodeURIComponent(s)}&max=30`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Request failed');
      setHasToken(json.hasToken);
      setTweets(json.tweets ?? []);
      setFetched(s);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [input]);

  const openX = (variant) => {
    if (!symbol && !input) return;
    const s = symbol || input.trim().toUpperCase();
    window.open(buildXUrl(s, variant), '_blank', 'noopener,noreferrer');
  };

  const sym = symbol || input.trim().toUpperCase();

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-black dark:bg-white rounded-lg flex items-center justify-center shrink-0">
          <XLogo size={18} className="text-white dark:text-black" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">X Feed</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Latest posts about any stock from X — including from people you follow
          </p>
        </div>
      </div>

      {/* Search bar */}
      <div className="card p-5">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="label">Stock Symbol</label>
            <input
              className="input uppercase"
              placeholder="e.g. AAPL, NVDA, TSLA"
              value={input}
              onChange={e => setInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && search()}
            />
          </div>
          <div className="flex items-end">
            <button
              className="btn-primary flex items-center gap-2"
              onClick={() => search()}
              disabled={loading || !input.trim()}
            >
              {loading
                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Search size={16} />}
              {loading ? 'Loading…' : 'Search'}
            </button>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-500 dark:text-red-400">{error}</p>}
      </div>

      {/* Quick-open buttons — always shown when a symbol is entered */}
      {sym && (
        <div className="card p-5">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Open on X — <span className="text-blue-600 dark:text-blue-400 font-bold">${sym}</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {QUICK_LINKS.map(({ id, label, desc, color, primary }) => (
              <button
                key={id}
                onClick={() => openX(id)}
                className={`${color} text-white rounded-lg px-4 py-3 text-left transition-colors ${primary ? 'sm:col-span-2' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold flex items-center gap-2">
                      <XLogo size={13} />
                      {label}
                    </p>
                    <p className="text-xs opacity-75 mt-0.5">{desc}</p>
                  </div>
                  <ExternalLink size={14} className="opacity-60 shrink-0" />
                </div>
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            💡 <strong>Tip:</strong> "From People You Follow" opens X in your browser where you're already logged in — so you'll see posts only from accounts you follow.
          </p>
        </div>
      )}

      {/* Tweet list (requires TWITTER_BEARER_TOKEN) */}
      {fetched && (
        <>
          {hasToken === false && (
            <div className="card p-5 border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
              <div className="flex items-start gap-3">
                <XLogo size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
                    In-app tweet feed is not configured
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    To display tweets directly here, add your X API Bearer Token to a <code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded text-xs">.env</code> file:
                  </p>
                  <pre className="mt-2 text-xs bg-amber-100 dark:bg-amber-900/50 rounded p-2 font-mono text-amber-900 dark:text-amber-200">
TWITTER_BEARER_TOKEN=your_bearer_token_here
                  </pre>
                  <p className="text-xs text-amber-600 dark:text-amber-500 mt-2">
                    Get a free token at <a href="https://developer.x.com" target="_blank" rel="noreferrer" className="underline">developer.x.com</a> → create a project → "Bearer Token"
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                    Meanwhile, use the "Open on X" buttons above to view your following feed in X.
                  </p>
                </div>
              </div>
            </div>
          )}

          {hasToken && tweets.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide flex items-center gap-2">
                  <XLogo size={14} />
                  Recent posts about <span className="text-blue-600 dark:text-blue-400">${fetched}</span>
                  <span className="text-gray-400 font-normal normal-case">({tweets.length})</span>
                </h3>
              </div>
              <div className="space-y-3">
                {tweets.map(t => <TweetCard key={t.id} tweet={t} />)}
              </div>
            </div>
          )}

          {hasToken && tweets.length === 0 && !loading && !error && (
            <div className="card p-10 text-center text-gray-400 dark:text-gray-500">
              <XLogo size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No recent tweets found for ${fetched}</p>
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!sym && (
        <div className="card p-12 text-center text-gray-400 dark:text-gray-500">
          <XLogo size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">Enter a stock symbol to see what people on X are saying</p>
          <p className="text-xs mt-1 opacity-70">Open your X following feed directly or display tweets in-app with a Bearer Token</p>
        </div>
      )}
    </div>
  );
}
