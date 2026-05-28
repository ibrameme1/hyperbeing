import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  Users, FileText, MessageSquare, Zap, Activity,
  TrendingUp, TrendingDown, Clock, Eye, Star,
  ChevronRight, Circle, BarChart2, RefreshCw,
} from 'lucide-react';
import api from '../api/client';

// ── Colour palette ────────────────────────────────────────────────────────────
const COLORS = {
  purple: '#a855f7',
  blue:   '#3b82f6',
  cyan:   '#06b6d4',
  green:  '#22c55e',
  orange: '#f97316',
  pink:   '#ec4899',
  yellow: '#eab308',
  red:    '#ef4444',
};
const PIE_COLORS = [COLORS.purple, COLORS.blue, COLORS.cyan, COLORS.green, COLORS.orange];
const CHART_BG   = 'transparent';

// ── Helpers ───────────────────────────────────────────────────────────────────
function trendPct(today, yesterday) {
  if (yesterday === 0) return today > 0 ? 100 : 0;
  return Math.round(((today - yesterday) / yesterday) * 100);
}

function fmt(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n ?? 0);
}

function relTime(iso) {
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return d.toLocaleDateString();
}

const EVENT_LABELS = {
  page_view:           '👁 Page view',
  page_exit:           '🚪 Page exit',
  presentation_created:'✨ Deck created',
  slide_edited:        '🎨 Slide edited',
  pdf_exported:        '📄 PDF exported',
  chat_message_sent:   '💬 Message sent',
  image_generated:     '🖼 Image generated',
  login:               '🔑 Login',
  signup:              '🎉 Signup',
  pricing_viewed:      '💳 Pricing viewed',
  out_of_credits:      '⚠️ Out of credits',
};

const EVENT_COLORS = {
  presentation_created: COLORS.purple,
  signup:               COLORS.green,
  pdf_exported:         COLORS.orange,
  image_generated:      COLORS.cyan,
  out_of_credits:       COLORS.red,
  chat_message_sent:    COLORS.blue,
  slide_edited:         COLORS.pink,
  login:                COLORS.yellow,
  page_view:            '#6b7280',
  page_exit:            '#6b7280',
};

// ── Sub-components ────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, today, yesterday, color, delay = 0 }) {
  const pct = trendPct(today, yesterday);
  const up  = pct >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm"
    >
      {/* glow accent */}
      <div
        className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-20 blur-2xl"
        style={{ background: color }}
      />
      <div className="flex items-start justify-between">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: `${color}22`, border: `1px solid ${color}44` }}
        >
          <Icon size={18} style={{ color }} />
        </div>
        <span
          className={`flex items-center gap-1 text-xs font-medium ${up ? 'text-green-400' : 'text-red-400'}`}
        >
          {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {Math.abs(pct)}% today
        </span>
      </div>
      <div className="mt-4">
        <AnimatedCounter target={value} />
        <p className="mt-1 text-sm text-gray-400">{label}</p>
      </div>
    </motion.div>
  );
}

function AnimatedCounter({ target }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const end = target ?? 0;
    if (end === 0) { setDisplay(0); return; }
    const duration = 800;
    const start = performance.now();
    const raf = (t) => {
      const progress = Math.min((t - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.floor(eased * end));
      if (progress < 1) requestAnimationFrame(raf);
      else setDisplay(end);
    };
    requestAnimationFrame(raf);
  }, [target]);
  return <p className="text-3xl font-bold text-white">{fmt(display)}</p>;
}

function LiveDot({ active }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      {active && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
      )}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${active ? 'bg-green-400' : 'bg-gray-500'}`} />
    </span>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-gray-400">
      <span className="h-px flex-1 bg-white/10" />
      {children}
      <span className="h-px flex-1 bg-white/10" />
    </h2>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-gray-900/95 p-3 text-xs shadow-xl">
      <p className="mb-1.5 font-medium text-gray-300">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="flex gap-2">
          <span>{p.name}:</span>
          <span className="font-bold">{fmt(p.value)}</span>
        </p>
      ))}
    </div>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AnalyticsDashboard() {
  const navigate = useNavigate();
  const [overview,  setOverview]  = useState(null);
  const [timeseries, setTimeseries] = useState([]);
  const [users,     setUsers]     = useState(null);
  const [pres,      setPres]      = useState(null);
  const [credits,   setCredits]   = useState(null);
  const [eventsData, setEventsData] = useState(null);
  const [liveEvents, setLiveEvents] = useState([]);
  const [liveConnected, setLiveConnected] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const sseRef = useRef(null);
  const refreshTimer = useRef(null);

  const fetchAll = useCallback(async () => {
    try {
      const [ov, ts, us, pr, cr, ev] = await Promise.all([
        api.get('/analytics/overview'),
        api.get('/analytics/timeseries?days=30'),
        api.get('/analytics/users'),
        api.get('/analytics/presentations'),
        api.get('/analytics/credits'),
        api.get('/analytics/events?limit=50'),
      ]);
      setOverview(ov.data);
      setTimeseries(ts.data);
      setUsers(us.data);
      setPres(pr.data);
      setCredits(cr.data);
      setEventsData(ev.data);
      setLastRefresh(new Date());
    } catch (e) {
      if (e.response?.status === 403 || e.response?.status === 401) {
        setAccessDenied(true);
      }
      console.error('Analytics fetch failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // SSE live feed
  useEffect(() => {
    const base = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';
    const token = localStorage.getItem('hb_token');
    const url = `${base}/analytics/live${token ? `?token=${encodeURIComponent(token)}` : ''}`;

    const es = new EventSource(url);
    sseRef.current = es;

    es.onopen = () => setLiveConnected(true);
    es.onerror = () => setLiveConnected(false);
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        setLiveEvents(prev => [ev, ...prev].slice(0, 30));
      } catch { /* skip malformed */ }
    };

    return () => { es.close(); setLiveConnected(false); };
  }, []);

  // Initial + auto-refresh
  useEffect(() => {
    fetchAll();
    refreshTimer.current = setInterval(fetchAll, 30_000);
    return () => clearInterval(refreshTimer.current);
  }, [fetchAll]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950 text-white">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
        >
          <RefreshCw size={24} className="text-purple-400" />
        </motion.div>
        <span className="ml-3 text-gray-400">Loading analytics…</span>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-gray-950 text-white gap-4">
        <div className="text-5xl">🔒</div>
        <h1 className="text-2xl font-bold">Admin access required</h1>
        <p className="text-gray-500 text-sm">This dashboard is restricted to administrators.</p>
        <button
          onClick={() => navigate('/dashboard')}
          className="mt-2 rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-semibold hover:bg-purple-500 transition"
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  const kpis = overview ? [
    {
      icon: Users,
      label: 'Total Users',
      value: overview.totalUsers,
      today: overview.today.users,
      yesterday: overview.yesterday.users,
      color: COLORS.purple,
    },
    {
      icon: FileText,
      label: 'Presentations Created',
      value: overview.totalPresentations,
      today: overview.today.presentations,
      yesterday: overview.yesterday.presentations,
      color: COLORS.blue,
    },
    {
      icon: MessageSquare,
      label: 'Messages Sent',
      value: overview.totalMessages,
      today: 0,
      yesterday: 0,
      color: COLORS.cyan,
    },
    {
      icon: Zap,
      label: 'Credits Consumed',
      value: overview.totalCreditsUsed,
      today: 0,
      yesterday: 0,
      color: COLORS.orange,
    },
  ] : [];

  const tabs = [
    { id: 'overview',      label: 'Overview',      icon: BarChart2 },
    { id: 'users',         label: 'Users',          icon: Users },
    { id: 'presentations', label: 'Presentations',  icon: FileText },
    { id: 'events',        label: 'Events',          icon: Activity },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* ── Header ── */}
      <div className="border-b border-white/10 bg-gray-950/80 backdrop-blur-md sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                <span className="text-purple-400">Hyper</span>Being Analytics
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Real-time intelligence dashboard
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs">
                <LiveDot active={liveConnected} />
                <span className={liveConnected ? 'text-green-400' : 'text-gray-500'}>
                  {liveConnected ? 'Live' : 'Connecting…'}
                </span>
              </div>
              {lastRefresh && (
                <p className="text-xs text-gray-600">
                  Refreshed {relTime(lastRefresh)}
                </p>
              )}
              <button
                onClick={fetchAll}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/10 transition"
              >
                <RefreshCw size={12} />
                Refresh
              </button>
            </div>
          </div>

          {/* Live ticker */}
          {liveEvents.length > 0 && (
            <div className="mt-3 overflow-hidden h-6">
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={liveEvents[0]?.id}
                  initial={{ y: -24, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 24, opacity: 0 }}
                  className="flex items-center gap-2 text-xs text-gray-400"
                >
                  <Circle size={6} className="text-purple-400 fill-purple-400 flex-shrink-0" />
                  <span style={{ color: EVENT_COLORS[liveEvents[0].event_type] ?? '#9ca3af' }}>
                    {EVENT_LABELS[liveEvents[0].event_type] ?? liveEvents[0].event_type}
                  </span>
                  {liveEvents[0].page && (
                    <span className="text-gray-600">on {liveEvents[0].page}</span>
                  )}
                  <span className="text-gray-600">{relTime(liveEvents[0].created_at)}</span>
                </motion.div>
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex gap-1 border-b border-transparent">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === t.id
                    ? 'border-purple-500 text-purple-400'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                <t.icon size={14} />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8 space-y-10">

        {/* ── KPI cards (always visible) ── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {kpis.map((k, i) => (
            <KpiCard key={k.label} {...k} delay={i * 0.08} />
          ))}
        </div>

        {/* ── Live feed panel (always visible) ── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 h-full">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-sm text-white flex items-center gap-2">
                  <LiveDot active={liveConnected} />
                  Live Activity Feed
                </h3>
                <span className="text-xs text-gray-500">{liveEvents.length} events</span>
              </div>
              <div className="space-y-2 overflow-y-auto max-h-72 pr-1">
                <AnimatePresence initial={false}>
                  {liveEvents.length === 0 ? (
                    <p className="text-xs text-gray-600 text-center py-8">Waiting for activity…</p>
                  ) : liveEvents.map((ev, i) => (
                    <motion.div
                      key={ev.id ?? i}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25 }}
                      className="flex items-start gap-2 rounded-lg bg-white/5 p-2 text-xs"
                    >
                      <span
                        className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full"
                        style={{ background: EVENT_COLORS[ev.event_type] ?? '#6b7280' }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-200 truncate">
                          {EVENT_LABELS[ev.event_type] ?? ev.event_type}
                        </p>
                        {ev.user_name && (
                          <p className="text-gray-500 truncate">{ev.user_name}</p>
                        )}
                        {ev.page && (
                          <p className="text-gray-600 truncate">{ev.page}</p>
                        )}
                      </div>
                      <span className="flex-shrink-0 text-gray-600">{relTime(ev.created_at)}</span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Quick stats column */}
          <div className="lg:col-span-2 grid grid-cols-2 gap-4 content-start">
            {overview && (
              <>
                <StatPill label="Active presentations" value={overview.activePresentations} color={COLORS.green} />
                <StatPill label="Tracked events" value={overview.totalEvents} color={COLORS.purple} />
                {users && (
                  <>
                    <StatPill label="Active today" value={users.activeToday} color={COLORS.cyan} />
                    <StatPill label="Active this week" value={users.activeThisWeek} color={COLORS.blue} />
                  </>
                )}
                {pres && (
                  <StatPill label="Avg slides/deck" value={Math.round(pres.avgSlides * 10) / 10} color={COLORS.orange} />
                )}
                {credits && (
                  <StatPill label="Credits remaining" value={credits.totalRemaining} color={COLORS.yellow} />
                )}
              </>
            )}
          </div>
        </div>

        {/* ── OVERVIEW TAB ── */}
        {activeTab === 'overview' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-8"
          >
            <SectionTitle>Growth — last 30 days</SectionTitle>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ChartCard title="Signups & Presentations">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={timeseries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0d" />
                    <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }}
                      tickFormatter={d => d.slice(5)} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
                    <Line type="monotone" dataKey="signups" name="Signups"
                      stroke={COLORS.purple} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey="presentations" name="Decks"
                      stroke={COLORS.blue} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Credits Consumed">
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={timeseries}>
                    <defs>
                      <linearGradient id="credGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={COLORS.orange} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={COLORS.orange} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0d" />
                    <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }}
                      tickFormatter={d => d.slice(5)} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="credits" name="Credits"
                      stroke={COLORS.orange} fill="url(#credGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Messages per Day">
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={timeseries}>
                    <defs>
                      <linearGradient id="msgGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={COLORS.cyan} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={COLORS.cyan} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0d" />
                    <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }}
                      tickFormatter={d => d.slice(5)} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="messages" name="Messages"
                      stroke={COLORS.cyan} fill="url(#msgGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              {users && (
                <ChartCard title="Auth Provider Breakdown">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={users.oauthBreakdown}
                        dataKey="count"
                        nameKey="provider"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={3}
                      >
                        {users.oauthBreakdown.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v, n) => [v, n]} />
                      <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
            </div>
          </motion.div>
        )}

        {/* ── USERS TAB ── */}
        {activeTab === 'users' && users && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
            <SectionTitle>User Analysis</SectionTitle>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ChartCard title="Auth Provider Distribution">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={users.oauthBreakdown}
                      dataKey="count"
                      nameKey="provider"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={3}
                    >
                      {users.oauthBreakdown.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Plan Distribution">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={users.planDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0d" />
                    <XAxis dataKey="plan" tick={{ fill: '#6b7280', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name="Users" radius={[4,4,0,0]}>
                      {users.planDistribution.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <ChartCard title="Top Power Users">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-gray-500 text-left">
                      <th className="pb-2 pr-4">User</th>
                      <th className="pb-2 pr-4">Plan</th>
                      <th className="pb-2 pr-4">Decks</th>
                      <th className="pb-2">Credits left</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.topUsers.map((u, i) => (
                      <tr key={u.id} className="border-b border-white/5 hover:bg-white/5 transition">
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-2">
                            <span
                              className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold"
                              style={{ background: PIE_COLORS[i % PIE_COLORS.length] + '33',
                                       color: PIE_COLORS[i % PIE_COLORS.length] }}
                            >
                              {u.name?.[0]?.toUpperCase() ?? '?'}
                            </span>
                            <div>
                              <p className="font-medium text-gray-200">{u.name}</p>
                              <p className="text-gray-600">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="pr-4">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            u.plan === 'free'
                              ? 'bg-gray-800 text-gray-400'
                              : 'bg-purple-900/50 text-purple-300'
                          }`}>
                            {u.plan}
                          </span>
                        </td>
                        <td className="pr-4 text-gray-300 font-mono">{u.presentation_count}</td>
                        <td className="text-gray-300 font-mono">{u.credits_remaining}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ChartCard>

            <ChartCard title="Recent Signups">
              <div className="space-y-2">
                {users.recentSignups.map(u => (
                  <div key={u.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-900/50 text-xs font-bold text-purple-300">
                        {u.name?.[0]?.toUpperCase() ?? '?'}
                      </span>
                      <div>
                        <p className="text-xs font-medium text-gray-200">{u.name}</p>
                        <p className="text-[10px] text-gray-500">{u.email}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">{u.provider}</p>
                      <p className="text-[10px] text-gray-600">{relTime(u.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ChartCard>
          </motion.div>
        )}

        {/* ── PRESENTATIONS TAB ── */}
        {activeTab === 'presentations' && pres && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
            <SectionTitle>Presentation Intelligence</SectionTitle>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ChartCard title="By Day of Week">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={pres.byDow}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0d" />
                    <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name="Presentations" fill={COLORS.purple} radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="By Hour of Day">
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={pres.byHour}>
                    <defs>
                      <linearGradient id="hourGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={COLORS.blue} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={COLORS.blue} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0d" />
                    <XAxis dataKey="hour" tick={{ fill: '#6b7280', fontSize: 9 }}
                      interval={3} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="count" name="Presentations"
                      stroke={COLORS.blue} fill="url(#hourGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Status Breakdown">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={pres.statusBreakdown}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {pres.statusBreakdown.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <h3 className="mb-4 text-sm font-semibold text-white">Creative Stats</h3>
                <div className="space-y-4">
                  <StatRow label="Avg slides per deck" value={`${(pres.avgSlides || 0).toFixed(1)} slides`} color={COLORS.purple} />
                  <StatRow label="Peak creation hour" value={
                    (() => {
                      const peak = pres.byHour.reduce((a, b) => b.count > a.count ? b : a, pres.byHour[0]);
                      return peak?.hour ?? '—';
                    })()
                  } color={COLORS.blue} />
                  <StatRow label="Most active day" value={
                    (() => {
                      const peak = pres.byDow.reduce((a, b) => b.count > a.count ? b : a, pres.byDow[0]);
                      return peak?.day ?? '—';
                    })()
                  } color={COLORS.cyan} />
                  <StatRow label="Total decks" value={fmt(pres.recentPresentations.length > 14 ? '15+' : pres.recentPresentations.length)} color={COLORS.orange} />
                </div>
              </div>
            </div>

            <ChartCard title="Recent Presentations">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-gray-500 text-left">
                      <th className="pb-2 pr-4">Title</th>
                      <th className="pb-2 pr-4">User</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2 pr-4">Slides</th>
                      <th className="pb-2">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pres.recentPresentations.map(p => (
                      <tr key={p.id} className="border-b border-white/5 hover:bg-white/5 transition">
                        <td className="py-2 pr-4 font-medium text-gray-200 max-w-[200px] truncate">{p.title}</td>
                        <td className="pr-4 text-gray-400">{p.user_name}</td>
                        <td className="pr-4">
                          <StatusBadge status={p.status} />
                        </td>
                        <td className="pr-4 font-mono text-gray-300">{p.slide_count ?? '—'}</td>
                        <td className="text-gray-500">{relTime(p.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          </motion.div>
        )}

        {/* ── EVENTS TAB ── */}
        {activeTab === 'events' && eventsData && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
            <SectionTitle>Event Tracking</SectionTitle>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ChartCard title="Event Type Distribution">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={eventsData.byType} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0d" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} allowDecimals={false} />
                    <YAxis dataKey="event_type" type="category" tick={{ fill: '#9ca3af', fontSize: 10 }}
                      width={120} tickFormatter={k => EVENT_LABELS[k]?.replace(/^[^ ]+ /, '') ?? k} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name="Count" radius={[0,4,4,0]}>
                      {eventsData.byType.map((e, i) => (
                        <Cell key={i} fill={EVENT_COLORS[e.event_type] ?? PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <h3 className="mb-4 text-sm font-semibold text-white">Event Summary</h3>
                <div className="space-y-2">
                  {eventsData.byType.map((et, i) => (
                    <div key={et.event_type} className="flex items-center gap-3">
                      <span
                        className="h-2 w-2 flex-shrink-0 rounded-full"
                        style={{ background: EVENT_COLORS[et.event_type] ?? PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      <span className="flex-1 text-xs text-gray-300">
                        {EVENT_LABELS[et.event_type] ?? et.event_type}
                      </span>
                      <span className="font-mono text-xs font-bold text-white">{fmt(et.count)}</span>
                    </div>
                  ))}
                  {eventsData.byType.length === 0 && (
                    <p className="text-xs text-gray-600 py-4 text-center">
                      No events tracked yet. Events appear here once users interact with the app.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <ChartCard title={`Recent Events (${fmt(eventsData.total)} total)`}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-gray-500 text-left">
                      <th className="pb-2 pr-4">Event</th>
                      <th className="pb-2 pr-4">User</th>
                      <th className="pb-2 pr-4">Page</th>
                      <th className="pb-2 pr-4">Meta</th>
                      <th className="pb-2">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventsData.events.map(ev => (
                      <tr key={ev.id} className="border-b border-white/5 hover:bg-white/5 transition">
                        <td className="py-2 pr-4">
                          <span className="flex items-center gap-1.5">
                            <span
                              className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                              style={{ background: EVENT_COLORS[ev.event_type] ?? '#6b7280' }}
                            />
                            <span className="text-gray-300">
                              {EVENT_LABELS[ev.event_type] ?? ev.event_type}
                            </span>
                          </span>
                        </td>
                        <td className="pr-4 text-gray-500">{ev.user_name ?? 'anon'}</td>
                        <td className="pr-4 text-gray-600 max-w-[120px] truncate">{ev.page ?? '—'}</td>
                        <td className="pr-4 text-gray-600 max-w-[150px] truncate font-mono">
                          {Object.keys(ev.metadata).length > 0
                            ? JSON.stringify(ev.metadata).slice(0, 60)
                            : '—'}
                        </td>
                        <td className="text-gray-600">{relTime(ev.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          </motion.div>
        )}

      </div>
    </div>
  );
}

// ── Minor sub-components ──────────────────────────────────────────────────────
function ChartCard({ title, children }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <h3 className="mb-4 text-sm font-semibold text-white">{title}</h3>
      {children}
    </div>
  );
}

function StatPill({ label, value, color }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="text-2xl font-bold text-white">{fmt(value)}</p>
      <p className="mt-1 text-xs text-gray-500">{label}</p>
      <div className="mt-2 h-0.5 w-8 rounded-full" style={{ background: color }} />
    </div>
  );
}

function StatRow({ label, value, color }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="flex items-center gap-2 text-xs font-semibold text-white">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
        {value}
      </span>
    </div>
  );
}

const STATUS_STYLES = {
  done:       'bg-green-900/40 text-green-400',
  generating: 'bg-yellow-900/40 text-yellow-400',
  chat:       'bg-blue-900/40 text-blue-400',
  error:      'bg-red-900/40 text-red-400',
};

function StatusBadge({ status }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[status] ?? 'bg-gray-800 text-gray-400'}`}>
      {status}
    </span>
  );
}
