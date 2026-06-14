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
  ChevronRight, ChevronDown, ChevronUp, Circle, BarChart2, RefreshCw,
  Terminal, Cpu, Search, AlertCircle, Info, AlertTriangle, Bug,
  Pencil, Check, X, ArrowLeft, Trash2, Database, Save, ExternalLink,
  TableProperties, ChevronLeft, HardDrive, Folder, File, Download,
  ArrowUp, ChevronsUpDown,
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

function fmtBytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
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
  const [logsData, setLogsData] = useState(null);
  const [logsSummary, setLogsSummary] = useState(null);
  const [logsFilter, setLogsFilter] = useState({ level: '', search: '', limit: 100 });
  const [logsLoading, setLogsLoading] = useState(false);
  const [metricsData, setMetricsData] = useState(null);
  const [liveEvents, setLiveEvents] = useState([]);
  const [liveConnected, setLiveConnected] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const sseRef = useRef(null);
  const refreshTimer = useRef(null);

  // ── Per-section error states ───────────────────────────────────────────────
  const [logsError,       setLogsError]       = useState(false);
  const [metricsError,    setMetricsError]    = useState(false);
  const [allUsersError,   setAllUsersError]   = useState(false);
  const [allPresError,    setAllPresError]    = useState(false);
  const [presDetailError, setPresDetailError] = useState(false);
  const [dbError,         setDbError]         = useState(false);

  const [editingUserId, setEditingUserId] = useState(null);
  const [editCreditsValue, setEditCreditsValue] = useState('');
  const [creditSaving, setCreditSaving] = useState(false);
  const [creditSaveError, setCreditSaveError] = useState(null);
  const [deletingUserId, setDeletingUserId] = useState(null);

  // ── All Users section ──────────────────────────────────────────────────────
  const [allUsers, setAllUsers] = useState(null);
  const [allUsersLoading, setAllUsersLoading] = useState(false);
  const [allUsersSearch, setAllUsersSearch] = useState('');
  const [allUsersOffset, setAllUsersOffset] = useState(0);
  const [allUsersTotal, setAllUsersTotal] = useState(0);
  const [editUserId, setEditUserId] = useState(null);
  const [editUserForm, setEditUserForm] = useState({});
  const [editUserSaving, setEditUserSaving] = useState(false);

  // ── All Presentations section ──────────────────────────────────────────────
  const [allPresList, setAllPresList] = useState(null);
  const [allPresLoading, setAllPresLoading] = useState(false);
  const [allPresSearch, setAllPresSearch] = useState('');
  const [allPresOffset, setAllPresOffset] = useState(0);
  const [allPresTotal, setAllPresTotal] = useState(0);
  const [selectedPresId, setSelectedPresId] = useState(null);
  const [selectedPresDetail, setSelectedPresDetail] = useState(null);
  const [selectedPresLoading, setSelectedPresLoading] = useState(false);
  const [editPresId, setEditPresId] = useState(null);
  const [editPresTitle, setEditPresTitle] = useState('');
  const [presDeleting, setPresDeleting] = useState(null);

  // ── Storage / disk usage ────────────────────────────────────────────────────
  const [storageData, setStorageData] = useState(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [vacuumLoading, setVacuumLoading] = useState(false);
  const [checkpointLoading, setCheckpointLoading] = useState(false);

  // ── File explorer (data directory) ─────────────────────────────────────────
  const [fsDir, setFsDir] = useState('');
  const [fsEntries, setFsEntries] = useState(null);
  const [fsLoading, setFsLoading] = useState(false);
  const [fsError, setFsError] = useState(false);
  const [fsSortCol, setFsSortCol] = useState('name');
  const [fsSortDir, setFsSortDir] = useState('asc');
  const [fsDeleting, setFsDeleting] = useState(null);

  // ── Database browser ───────────────────────────────────────────────────────
  const [dbTables, setDbTables] = useState(null);
  const [dbActiveTable, setDbActiveTable] = useState('users');
  const [dbData, setDbData] = useState(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbSearch, setDbSearch] = useState('');
  const [dbOffset, setDbOffset] = useState(0);
  const [dbOrderCol, setDbOrderCol] = useState('');
  const [dbOrderDir, setDbOrderDir] = useState('desc');
  const [dbEditRow, setDbEditRow] = useState(null);
  const [dbEditForm, setDbEditForm] = useState({});
  const [dbEditSaving, setDbEditSaving] = useState(false);

  async function handleDeleteUser(userId) {
    if (!window.confirm('Permanently delete this user and all their data? This cannot be undone.')) return;
    setDeletingUserId(userId);
    try {
      await api.delete(`/analytics/users/${userId}`);
      setUsers(prev => ({
        ...prev,
        topUsers: prev.topUsers.filter(u => u.id !== userId),
        recentSignups: prev.recentSignups.filter(u => u.id !== userId),
      }));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete user');
    } finally {
      setDeletingUserId(null);
    }
  }

  async function handleSaveCredits(userId) {
    const val = parseInt(editCreditsValue, 10);
    if (isNaN(val) || val < 0) { setCreditSaveError('Enter a valid number'); return; }
    setCreditSaving(true);
    setCreditSaveError(null);
    try {
      const { data } = await api.patch(`/analytics/users/${userId}/credits`, { credits: val });
      setUsers(prev => ({
        ...prev,
        topUsers: prev.topUsers.map(u =>
          u.id === userId ? { ...u, credits_remaining: data.credits_remaining } : u
        ),
      }));
      setEditingUserId(null);
    } catch (err) {
      setCreditSaveError(err.response?.data?.error || 'Failed to update');
    } finally {
      setCreditSaving(false);
    }
  }

  const fetchLogs = useCallback(async (filter = logsFilter) => {
    setLogsLoading(true);
    setLogsError(false);
    try {
      const params = new URLSearchParams({ limit: filter.limit });
      if (filter.level) params.set('level', filter.level);
      if (filter.search) params.set('search', filter.search);
      const [logsRes, summaryRes] = await Promise.all([
        api.get(`/admin/logs?${params}`),
        api.get('/admin/log-summary'),
      ]);
      setLogsData(logsRes.data);
      setLogsSummary(summaryRes.data);
    } catch { setLogsError(true); } finally {
      setLogsLoading(false);
    }
  }, [logsFilter]);

  const fetchMetrics = useCallback(async () => {
    setMetricsError(false);
    try {
      const res = await api.get('/admin/metrics');
      setMetricsData(res.data);
    } catch { setMetricsError(true); }
  }, []);

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
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAllUsers = useCallback(async (search, offset) => {
    const s = search ?? allUsersSearch;
    const o = offset ?? allUsersOffset;
    setAllUsersLoading(true);
    setAllUsersError(false);
    try {
      const p = new URLSearchParams({ limit: 50, offset: o, search: s });
      const { data } = await api.get(`/admin/users/all?${p}`);
      setAllUsers(data.users);
      setAllUsersTotal(data.total);
      setAllUsersOffset(o);
    } catch { setAllUsersError(true); } finally { setAllUsersLoading(false); }
  }, [allUsersSearch, allUsersOffset]);

  const fetchAllPres = useCallback(async (search, offset) => {
    const s = search ?? allPresSearch;
    const o = offset ?? allPresOffset;
    setAllPresLoading(true);
    setAllPresError(false);
    try {
      const p = new URLSearchParams({ limit: 50, offset: o, search: s });
      const { data } = await api.get(`/admin/presentations/all?${p}`);
      setAllPresList(data.presentations);
      setAllPresTotal(data.total);
      setAllPresOffset(o);
    } catch { setAllPresError(true); } finally { setAllPresLoading(false); }
  }, [allPresSearch, allPresOffset]);

  const fetchPresDetail = async (id) => {
    setSelectedPresId(id);
    setSelectedPresDetail(null);
    setSelectedPresLoading(true);
    setPresDetailError(false);
    try {
      const { data } = await api.get(`/admin/presentations/${id}/detail`);
      setSelectedPresDetail(data);
    } catch { setPresDetailError(true); } finally { setSelectedPresLoading(false); }
  };

  const fetchStorage = useCallback(async () => {
    setStorageLoading(true);
    setStorageError(false);
    try {
      const { data } = await api.get('/admin/storage');
      setStorageData(data);
    } catch { setStorageError(true); } finally { setStorageLoading(false); }
  }, []);

  const handleVacuum = async () => {
    if (!window.confirm('Run VACUUM to reclaim disk space? This may take a while on a large database.')) return;
    setVacuumLoading(true);
    try {
      await api.post('/admin/storage/vacuum');
      await fetchStorage();
    } catch (err) {
      alert(err.response?.data?.error || 'Vacuum failed');
    } finally { setVacuumLoading(false); }
  };

  const handleCheckpoint = async () => {
    setCheckpointLoading(true);
    try {
      await api.post('/admin/storage/checkpoint');
      await fetchStorage();
    } catch (err) {
      alert(err.response?.data?.error || 'Checkpoint failed');
    } finally { setCheckpointLoading(false); }
  };

  const fetchFsBrowse = useCallback(async (dir = '') => {
    setFsLoading(true);
    setFsError(false);
    try {
      const { data } = await api.get('/admin/storage/browse', { params: { dir } });
      setFsDir(data.dir);
      setFsEntries(data.entries);
    } catch {
      setFsError(true);
    } finally {
      setFsLoading(false);
    }
  }, []);

  function fsSortBy(col) {
    if (fsSortCol === col) {
      setFsSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setFsSortCol(col);
      setFsSortDir('asc');
    }
  }

  function fsFileUrl(entry, download) {
    const token = localStorage.getItem('hb_token');
    const apiBase = import.meta.env.VITE_API_URL || '';
    const filePath = fsDir ? `${fsDir}/${entry.name}` : entry.name;
    const params = new URLSearchParams({ path: filePath, token: token || '' });
    if (download) params.set('download', '1');
    return `${apiBase}/api/admin/storage/file?${params.toString()}`;
  }

  async function handleFsDelete(entry) {
    if (!window.confirm(`Permanently delete "${entry.name}"? This cannot be undone.`)) return;
    setFsDeleting(entry.name);
    try {
      const filePath = fsDir ? `${fsDir}/${entry.name}` : entry.name;
      await api.delete('/admin/storage/file', { params: { path: filePath } });
      await fetchFsBrowse(fsDir);
      fetchStorage();
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    } finally {
      setFsDeleting(null);
    }
  }

  const fsSortedEntries = (() => {
    if (!fsEntries) return [];
    const dirMul = fsSortDir === 'asc' ? 1 : -1;
    return fsEntries.slice().sort((a, b) => {
      // Folders always sort before files, regardless of sort direction
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      let cmp = 0;
      if (fsSortCol === 'size') cmp = a.bytes - b.bytes;
      else if (fsSortCol === 'modified') cmp = new Date(a.modified_at) - new Date(b.modified_at);
      else cmp = a.name.localeCompare(b.name);
      return cmp * dirMul;
    });
  })();

  const fetchDbTables = async () => {
    try {
      const { data } = await api.get('/admin/db/tables');
      setDbTables(data.tables);
    } catch {}
  };

  const fetchDbData = useCallback(async (table, search, offset, orderCol, orderDir) => {
    const t  = table    ?? dbActiveTable;
    const s  = search   ?? dbSearch;
    const o  = offset   ?? dbOffset;
    const oc = orderCol ?? dbOrderCol;
    const od = orderDir ?? dbOrderDir;
    setDbLoading(true);
    setDbError(false);
    try {
      const p = new URLSearchParams({ limit: 50, offset: o, search: s, orderBy: oc, orderDir: od });
      const { data } = await api.get(`/admin/db/${t}?${p}`);
      setDbData(data);
      setDbOffset(o);
    } catch { setDbError(true); } finally { setDbLoading(false); }
  }, [dbActiveTable, dbSearch, dbOffset, dbOrderCol, dbOrderDir]);

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

  // Auto-fetch on tab switch
  useEffect(() => {
    if (activeTab === 'logs') fetchLogs();
    if (activeTab === 'metrics') fetchMetrics();
    if (activeTab === 'users' && !allUsers) fetchAllUsers();
    if (activeTab === 'presentations' && !allPresList) fetchAllPres();
    if (activeTab === 'database') {
      if (!dbTables) fetchDbTables();
      fetchDbData();
    }
    if (activeTab === 'storage' && !storageData) fetchStorage();
    if (activeTab === 'storage' && !fsEntries) fetchFsBrowse('');
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

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
    { id: 'logs',          label: 'Logs',            icon: Terminal },
    { id: 'metrics',       label: 'Metrics',         icon: Cpu },
    { id: 'database',      label: 'Database',        icon: Database },
    { id: 'storage',       label: 'Storage',         icon: HardDrive },
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
              <button
                onClick={() => navigate('/dashboard')}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/10 transition"
              >
                <ArrowLeft size={12} />
                Dashboard
              </button>
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
                      <th className="pb-2 pr-4">Credits left</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.topUsers.map((u, i) => (
                      <tr key={u.id} className="border-b border-white/5 hover:bg-white/5 transition group">
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
                        <td className="pr-4 text-gray-300 font-mono">
                          {editingUserId === u.id ? (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  min="0"
                                  value={editCreditsValue}
                                  onChange={e => setEditCreditsValue(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleSaveCredits(u.id);
                                    if (e.key === 'Escape') setEditingUserId(null);
                                  }}
                                  className="w-20 bg-gray-800 border border-purple-500 rounded px-1.5 py-0.5 text-xs text-white font-mono focus:outline-none focus:border-purple-400"
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleSaveCredits(u.id)}
                                  disabled={creditSaving}
                                  className="text-green-400 hover:text-green-300 disabled:opacity-40"
                                  title="Save"
                                >
                                  <Check size={13} />
                                </button>
                                <button
                                  onClick={() => { setEditingUserId(null); setCreditSaveError(null); }}
                                  className="text-gray-500 hover:text-gray-300"
                                  title="Cancel"
                                >
                                  <X size={13} />
                                </button>
                              </div>
                              {creditSaveError && (
                                <p className="text-red-400 text-[10px]">{creditSaveError}</p>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 group/cell">
                              <span>{u.credits_remaining}</span>
                              <button
                                onClick={() => {
                                  setEditingUserId(u.id);
                                  setEditCreditsValue(String(u.credits_remaining));
                                  setCreditSaveError(null);
                                }}
                                className="opacity-0 group-hover/cell:opacity-100 text-gray-600 hover:text-purple-400 transition-opacity"
                                title="Edit credits"
                              >
                                <Pencil size={11} />
                              </button>
                            </div>
                          )}
                        </td>
                        <td>
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            disabled={deletingUserId === u.id}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-700 hover:text-red-400 disabled:opacity-40"
                            title="Delete user"
                          >
                            {deletingUserId === u.id
                              ? <RefreshCw size={13} className="animate-spin" />
                              : <Trash2 size={13} />}
                          </button>
                        </td>
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

            {/* ── Full User Database ── */}
            <ChartCard title={`All Users${allUsersTotal ? ` (${allUsersTotal})` : ''}`}>
              <div className="mb-3 flex items-center gap-2">
                <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <Search size={13} className="text-gray-500 flex-shrink-0" />
                  <input
                    type="text"
                    placeholder="Search name or email…"
                    value={allUsersSearch}
                    onChange={e => setAllUsersSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { setAllUsersOffset(0); fetchAllUsers(allUsersSearch, 0); } }}
                    className="w-full bg-transparent text-xs text-gray-200 placeholder-gray-600 outline-none"
                  />
                </div>
                <button
                  onClick={() => { setAllUsersOffset(0); fetchAllUsers(allUsersSearch, 0); }}
                  disabled={allUsersLoading}
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-300 hover:bg-white/10 transition disabled:opacity-50"
                >
                  <RefreshCw size={12} className={allUsersLoading ? 'animate-spin' : ''} />
                  {allUsersLoading ? 'Loading…' : 'Search'}
                </button>
              </div>

              {allUsersError && <SectionError onRetry={() => fetchAllUsers(allUsersSearch, allUsersOffset)} />}

              {allUsers && (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-gray-500 text-left">
                          <th className="pb-2 pr-3">User</th>
                          <th className="pb-2 pr-3">Plan</th>
                          <th className="pb-2 pr-3">Credits</th>
                          <th className="pb-2 pr-3">Decks</th>
                          <th className="pb-2 pr-3">Tokens used</th>
                          <th className="pb-2 pr-3">Joined</th>
                          <th className="pb-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {allUsers.map((u, i) => (
                          editUserId === u.id ? (
                            <tr key={u.id} className="border-b border-purple-500/30 bg-purple-900/10">
                              <td colSpan={7} className="py-3 px-2">
                                <div className="flex flex-wrap gap-3 items-end">
                                  <div>
                                    <p className="text-[10px] text-gray-500 mb-1">Name</p>
                                    <input
                                      value={editUserForm.name ?? ''}
                                      onChange={e => setEditUserForm(f => ({ ...f, name: e.target.value }))}
                                      className="bg-gray-800 border border-white/20 rounded px-2 py-1 text-xs text-white w-36 outline-none focus:border-purple-500"
                                    />
                                  </div>
                                  <div>
                                    <p className="text-[10px] text-gray-500 mb-1">Email</p>
                                    <input
                                      value={editUserForm.email ?? ''}
                                      onChange={e => setEditUserForm(f => ({ ...f, email: e.target.value }))}
                                      className="bg-gray-800 border border-white/20 rounded px-2 py-1 text-xs text-white w-48 outline-none focus:border-purple-500"
                                    />
                                  </div>
                                  <div>
                                    <p className="text-[10px] text-gray-500 mb-1">Plan</p>
                                    <select
                                      value={editUserForm.plan ?? 'free'}
                                      onChange={e => setEditUserForm(f => ({ ...f, plan: e.target.value }))}
                                      className="bg-gray-800 border border-white/20 rounded px-2 py-1 text-xs text-white outline-none focus:border-purple-500"
                                    >
                                      <option value="free">free</option>
                                      <option value="starter">starter</option>
                                      <option value="pro">pro</option>
                                      <option value="unlimited">unlimited</option>
                                    </select>
                                  </div>
                                  <div>
                                    <p className="text-[10px] text-gray-500 mb-1">Credits</p>
                                    <input
                                      type="number" min="0"
                                      value={editUserForm.credits_remaining ?? ''}
                                      onChange={e => setEditUserForm(f => ({ ...f, credits_remaining: e.target.value }))}
                                      className="bg-gray-800 border border-white/20 rounded px-2 py-1 text-xs text-white w-20 outline-none focus:border-purple-500"
                                    />
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      disabled={editUserSaving}
                                      onClick={async () => {
                                        setEditUserSaving(true);
                                        try {
                                          await api.patch(`/admin/users/${u.id}`, editUserForm);
                                          setAllUsers(prev => prev.map(x => x.id === u.id ? { ...x, ...editUserForm } : x));
                                          setEditUserId(null);
                                        } catch (err) {
                                          alert(err.response?.data?.error || 'Save failed');
                                        } finally { setEditUserSaving(false); }
                                      }}
                                      className="flex items-center gap-1 rounded-lg bg-green-700 hover:bg-green-600 px-3 py-1.5 text-xs text-white transition disabled:opacity-50"
                                    >
                                      <Save size={11} />
                                      {editUserSaving ? 'Saving…' : 'Save'}
                                    </button>
                                    <button
                                      onClick={() => setEditUserId(null)}
                                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/10 transition"
                                    >Cancel</button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            <tr key={u.id} className="border-b border-white/5 hover:bg-white/5 transition group">
                              <td className="py-2 pr-3">
                                <div className="flex items-center gap-2">
                                  <span className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold flex-shrink-0"
                                    style={{ background: PIE_COLORS[i % PIE_COLORS.length] + '33', color: PIE_COLORS[i % PIE_COLORS.length] }}>
                                    {u.name?.[0]?.toUpperCase() ?? '?'}
                                  </span>
                                  <div className="min-w-0">
                                    <p className="font-medium text-gray-200 truncate max-w-[140px]">{u.name}</p>
                                    <p className="text-gray-600 truncate max-w-[140px]">{u.email}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="pr-3">
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${u.plan === 'free' ? 'bg-gray-800 text-gray-400' : 'bg-purple-900/50 text-purple-300'}`}>
                                  {u.plan}
                                </span>
                              </td>
                              <td className="pr-3 font-mono text-gray-300">{u.credits_remaining}</td>
                              <td className="pr-3 font-mono text-gray-300">{u.presentation_count}</td>
                              <td className="pr-3 font-mono text-gray-500">{fmt(u.tokens_used)}</td>
                              <td className="pr-3 text-gray-500">{relTime(u.created_at)}</td>
                              <td>
                                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => { setEditUserId(u.id); setEditUserForm({ name: u.name, email: u.email, plan: u.plan, credits_remaining: u.credits_remaining }); }}
                                    className="text-gray-600 hover:text-purple-400"
                                    title="Edit user"
                                  >
                                    <Pencil size={12} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteUser(u.id)}
                                    className="text-gray-600 hover:text-red-400"
                                    title="Delete user"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Pagination */}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-gray-600">
                      {allUsersOffset + 1}–{Math.min(allUsersOffset + 50, allUsersTotal)} of {allUsersTotal}
                    </span>
                    <div className="flex gap-2">
                      <button
                        disabled={allUsersOffset === 0 || allUsersLoading}
                        onClick={() => fetchAllUsers(allUsersSearch, Math.max(0, allUsersOffset - 50))}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-300 disabled:opacity-30 hover:bg-white/10 transition"
                      >
                        <ChevronLeft size={12} />
                      </button>
                      <button
                        disabled={allUsersOffset + 50 >= allUsersTotal || allUsersLoading}
                        onClick={() => fetchAllUsers(allUsersSearch, allUsersOffset + 50)}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-300 disabled:opacity-30 hover:bg-white/10 transition"
                      >
                        <ChevronRight size={12} />
                      </button>
                    </div>
                  </div>
                </>
              )}

              {!allUsers && !allUsersLoading && (
                <button
                  onClick={() => fetchAllUsers('', 0)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-4 text-xs text-gray-400 hover:bg-white/10 transition"
                >
                  Load all users
                </button>
              )}
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

            {/* ── All Presentations with full edit ── */}
            <ChartCard title={`All Presentations${allPresTotal ? ` (${allPresTotal})` : ''}`}>
              <div className="mb-3 flex items-center gap-2">
                <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <Search size={13} className="text-gray-500 flex-shrink-0" />
                  <input
                    type="text"
                    placeholder="Search title, user name or email…"
                    value={allPresSearch}
                    onChange={e => setAllPresSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { setAllPresOffset(0); fetchAllPres(allPresSearch, 0); } }}
                    className="w-full bg-transparent text-xs text-gray-200 placeholder-gray-600 outline-none"
                  />
                </div>
                <button
                  onClick={() => { setAllPresOffset(0); fetchAllPres(allPresSearch, 0); }}
                  disabled={allPresLoading}
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-300 hover:bg-white/10 transition disabled:opacity-50"
                >
                  <RefreshCw size={12} className={allPresLoading ? 'animate-spin' : ''} />
                  {allPresLoading ? 'Loading…' : 'Search'}
                </button>
              </div>

              {allPresError && <SectionError onRetry={() => fetchAllPres(allPresSearch, allPresOffset)} />}

              {allPresList && (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-gray-500 text-left">
                          <th className="pb-2 pr-3">Title</th>
                          <th className="pb-2 pr-3">User</th>
                          <th className="pb-2 pr-3">Status</th>
                          <th className="pb-2 pr-3">Slides</th>
                          <th className="pb-2 pr-3">Updated</th>
                          <th className="pb-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {allPresList.map(p => (
                          <>
                            <tr key={p.id} className="border-b border-white/5 hover:bg-white/5 transition group">
                              <td className="py-2 pr-3">
                                {editPresId === p.id ? (
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      value={editPresTitle}
                                      onChange={e => setEditPresTitle(e.target.value)}
                                      onKeyDown={async e => {
                                        if (e.key === 'Enter') {
                                          await api.patch(`/admin/presentations/${p.id}`, { title: editPresTitle });
                                          setAllPresList(prev => prev.map(x => x.id === p.id ? { ...x, title: editPresTitle } : x));
                                          setEditPresId(null);
                                        }
                                        if (e.key === 'Escape') setEditPresId(null);
                                      }}
                                      autoFocus
                                      className="bg-gray-800 border border-purple-500 rounded px-2 py-0.5 text-xs text-white w-44 outline-none"
                                    />
                                    <button onClick={async () => {
                                      await api.patch(`/admin/presentations/${p.id}`, { title: editPresTitle });
                                      setAllPresList(prev => prev.map(x => x.id === p.id ? { ...x, title: editPresTitle } : x));
                                      setEditPresId(null);
                                    }} className="text-green-400 hover:text-green-300"><Check size={12} /></button>
                                    <button onClick={() => setEditPresId(null)} className="text-gray-500 hover:text-gray-300"><X size={12} /></button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 group/title">
                                    <span className="font-medium text-gray-200 max-w-[180px] truncate block">{p.title}</span>
                                    <button
                                      onClick={() => { setEditPresId(p.id); setEditPresTitle(p.title); }}
                                      className="opacity-0 group-hover/title:opacity-100 text-gray-600 hover:text-purple-400 transition-opacity flex-shrink-0"
                                    ><Pencil size={11} /></button>
                                  </div>
                                )}
                              </td>
                              <td className="pr-3">
                                <div>
                                  <p className="text-gray-300">{p.user_name}</p>
                                  <p className="text-gray-600 text-[10px]">{p.user_email}</p>
                                </div>
                              </td>
                              <td className="pr-3"><StatusBadge status={p.status} /></td>
                              <td className="pr-3 font-mono text-gray-300">{p.slide_count}</td>
                              <td className="pr-3 text-gray-500">{relTime(p.updated_at)}</td>
                              <td>
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => selectedPresId === p.id ? setSelectedPresId(null) : fetchPresDetail(p.id)}
                                    className="text-gray-600 hover:text-blue-400"
                                    title="View slides"
                                  ><Eye size={13} /></button>
                                  <button
                                    onClick={() => window.open(`/presentations/${p.id}`, '_blank', 'noopener,noreferrer')}
                                    className="text-gray-600 hover:text-purple-400"
                                    title="Open in presentation viewer"
                                  ><ExternalLink size={13} /></button>
                                  <button
                                    onClick={async () => {
                                      if (!window.confirm('Delete this presentation?')) return;
                                      setPresDeleting(p.id);
                                      try {
                                        await api.delete(`/admin/presentations/${p.id}`);
                                        setAllPresList(prev => prev.filter(x => x.id !== p.id));
                                        setAllPresTotal(t => t - 1);
                                        if (selectedPresId === p.id) setSelectedPresId(null);
                                      } catch (err) {
                                        alert(err.response?.data?.error || 'Delete failed');
                                      } finally { setPresDeleting(null); }
                                    }}
                                    disabled={presDeleting === p.id}
                                    className="text-gray-600 hover:text-red-400 disabled:opacity-40"
                                    title="Delete"
                                  >{presDeleting === p.id ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}</button>
                                </div>
                              </td>
                            </tr>
                            {/* Slide detail panel */}
                            {selectedPresId === p.id && (
                              <tr key={`${p.id}-detail`}>
                                <td colSpan={6} className="bg-gray-900/60 border-b border-white/10">
                                  <div className="px-4 py-3">
                                    {selectedPresLoading ? (
                                      <div className="flex items-center gap-2 py-4 text-xs text-gray-500">
                                        <RefreshCw size={12} className="animate-spin" />
                                        Loading slides…
                                      </div>
                                    ) : presDetailError ? (
                                      <SectionError onRetry={() => fetchPresDetail(p.id)} />
                                    ) : selectedPresDetail && (
                                      <div className="space-y-2">
                                        <div className="flex items-center gap-3 mb-2">
                                          <p className="text-xs font-semibold text-gray-300">
                                            {selectedPresDetail.slides_data?.length ?? 0} slides
                                          </p>
                                          <span className="text-xs text-gray-600">Theme: {selectedPresDetail.slide_plan?.theme ?? '—'}</span>
                                          <span className="text-xs text-gray-600">
                                            Palette: {JSON.stringify(selectedPresDetail.slide_plan?.color_palette ?? {})}
                                          </span>
                                        </div>
                                        {(selectedPresDetail.slides_data ?? []).map((slide, si) => (
                                          <div key={si} className="rounded-lg border border-white/10 bg-white/5 p-3">
                                            <div className="flex items-center gap-3 mb-1">
                                              <span className="font-mono text-[10px] text-gray-600">#{si}</span>
                                              <span className="text-[10px] rounded-full px-2 py-0.5 bg-blue-900/40 text-blue-400">{slide.type}</span>
                                              <p className="text-xs font-semibold text-gray-200 truncate">{slide.title}</p>
                                            </div>
                                            {slide.subtitle && <p className="text-[10px] text-gray-500 mb-1">{slide.subtitle}</p>}
                                            {(slide.key_points ?? []).length > 0 && (
                                              <ul className="list-disc list-inside space-y-0.5 text-[10px] text-gray-500 mb-1">
                                                {slide.key_points.map((kp, ki) => <li key={ki}>{kp}</li>)}
                                              </ul>
                                            )}
                                            {slide.nano_banana_prompt && (
                                              <p className="text-[10px] text-gray-600 line-clamp-2 mt-1 italic">
                                                {slide.nano_banana_prompt.slice(0, 200)}…
                                              </p>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-gray-600">
                      {allPresOffset + 1}–{Math.min(allPresOffset + 50, allPresTotal)} of {allPresTotal}
                    </span>
                    <div className="flex gap-2">
                      <button
                        disabled={allPresOffset === 0 || allPresLoading}
                        onClick={() => fetchAllPres(allPresSearch, Math.max(0, allPresOffset - 50))}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-300 disabled:opacity-30 hover:bg-white/10 transition"
                      ><ChevronLeft size={12} /></button>
                      <button
                        disabled={allPresOffset + 50 >= allPresTotal || allPresLoading}
                        onClick={() => fetchAllPres(allPresSearch, allPresOffset + 50)}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-300 disabled:opacity-30 hover:bg-white/10 transition"
                      ><ChevronRight size={12} /></button>
                    </div>
                  </div>
                </>
              )}

              {!allPresList && !allPresLoading && (
                <button
                  onClick={() => fetchAllPres('', 0)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-4 text-xs text-gray-400 hover:bg-white/10 transition"
                >
                  Load all presentations
                </button>
              )}
            </ChartCard>
          </motion.div>
        )}

        {/* ── LOGS TAB ── */}
        {activeTab === 'logs' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <SectionTitle>Application Logs</SectionTitle>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <Search size={13} className="text-gray-500" />
                <input
                  type="text"
                  placeholder="Search messages…"
                  value={logsFilter.search}
                  onChange={e => setLogsFilter(f => ({ ...f, search: e.target.value }))}
                  className="bg-transparent text-xs text-gray-200 placeholder-gray-600 outline-none w-44"
                />
              </div>
              <select
                value={logsFilter.level}
                onChange={e => setLogsFilter(f => ({ ...f, level: e.target.value }))}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-300 outline-none"
              >
                <option value="">All levels</option>
                <option value="debug">Debug</option>
                <option value="info">Info</option>
                <option value="warn">Warn</option>
                <option value="error">Error</option>
              </select>
              <select
                value={logsFilter.limit}
                onChange={e => setLogsFilter(f => ({ ...f, limit: Number(e.target.value) }))}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-300 outline-none"
              >
                <option value={50}>50 rows</option>
                <option value={100}>100 rows</option>
                <option value={250}>250 rows</option>
                <option value={500}>500 rows</option>
              </select>
              <button
                onClick={() => fetchLogs(logsFilter)}
                disabled={logsLoading}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-300 hover:bg-white/10 transition disabled:opacity-50"
              >
                <RefreshCw size={12} className={logsLoading ? 'animate-spin' : ''} />
                {logsLoading ? 'Loading…' : 'Apply'}
              </button>
              {logsData && (
                <span className="text-xs text-gray-600 ml-auto">{logsData.total} logs stored</span>
              )}
            </div>

            {/* Log summary chips */}
            {logsSummary && (
              <div className="flex flex-wrap gap-2">
                {(logsSummary.bySeverity ?? []).map(({ level, count }) => (
                  <button
                    key={level}
                    onClick={() => { const f = { ...logsFilter, level }; setLogsFilter(f); fetchLogs(f); }}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition ${
                      LOG_LEVEL_STYLES[level]?.chip ?? 'border-white/10 bg-white/5 text-gray-400'
                    }`}
                  >
                    <LogLevelIcon level={level} />
                    {level}: {count}
                  </button>
                ))}
              </div>
            )}

            {logsError && <SectionError onRetry={() => fetchLogs(logsFilter)} />}

            {/* Recent errors callout */}
            {logsSummary?.recentErrors?.length > 0 && (
              <div className="rounded-xl border border-red-900/40 bg-red-900/10 p-4">
                <p className="mb-2 text-xs font-semibold text-red-400 flex items-center gap-1.5">
                  <AlertCircle size={13} /> Recent Errors
                </p>
                <div className="space-y-1">
                  {logsSummary.recentErrors.map(e => (
                    <div key={e.id} className="flex items-start gap-3 text-xs">
                      <span className="text-gray-600 flex-shrink-0">{relTime(e.ts)}</span>
                      <span className="text-red-300">{e.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Log table */}
            <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-gray-500 text-left bg-white/5">
                      <th className="px-4 py-3 w-28">Time</th>
                      <th className="px-4 py-3 w-16">Level</th>
                      <th className="px-4 py-3">Message</th>
                      <th className="px-4 py-3 w-28">Request</th>
                      <th className="px-4 py-3 w-24">User</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logsData?.logs?.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-gray-600">No logs found</td>
                      </tr>
                    )}
                    {logsData?.logs?.map(log => (
                      <tr key={log.id} className="border-b border-white/5 hover:bg-white/5 transition">
                        <td className="px-4 py-2 text-gray-600 font-mono whitespace-nowrap">
                          {relTime(log.ts)}
                        </td>
                        <td className="px-4 py-2">
                          <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-medium w-fit ${LOG_LEVEL_STYLES[log.level]?.badge ?? 'bg-gray-800 text-gray-400'}`}>
                            <LogLevelIcon level={log.level} />
                            {log.level}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-gray-200 max-w-sm">
                          <p className="truncate">{log.message}</p>
                          {log.context?.errorMessage && (
                            <p className="text-red-400 text-[10px] mt-0.5 truncate">{log.context.errorMessage}</p>
                          )}
                        </td>
                        <td className="px-4 py-2 font-mono text-gray-600 text-[10px]">
                          {log.context?.requestId?.slice(0, 8) ?? '—'}
                        </td>
                        <td className="px-4 py-2 text-gray-500 text-[10px]">
                          {log.context?.userId?.slice(0, 8) ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── METRICS TAB ── */}
        {activeTab === 'metrics' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
            <div className="flex items-center justify-between">
              <SectionTitle>Server Metrics</SectionTitle>
              <button
                onClick={fetchMetrics}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/10 transition"
              >
                <RefreshCw size={12} />
                Refresh
              </button>
            </div>

            {metricsError && <SectionError onRetry={fetchMetrics} />}

            {metricsData && (
              <>
                {/* Uptime */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-2xl font-bold text-white font-mono">{metricsData.uptimeHuman}</p>
                    <p className="mt-1 text-xs text-gray-500">Server uptime</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-2xl font-bold text-white font-mono">
                      {fmt(metricsData.http?.totalRequests ?? 0)}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">Total requests</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-2xl font-bold text-white font-mono">
                      {fmt(metricsData.ai?.totalCalls ?? 0)}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">AI calls made</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-2xl font-bold text-white font-mono">
                      {fmt((metricsData.ai?.totalInputTokens ?? 0) + (metricsData.ai?.totalOutputTokens ?? 0))}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">Total tokens used</p>
                  </div>
                </div>

                {/* HTTP Route Performance */}
                <ChartCard title="HTTP Route Performance">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-gray-500 text-left">
                          <th className="pb-2 pr-4">Route</th>
                          <th className="pb-2 pr-4 text-right">Requests</th>
                          <th className="pb-2 pr-4 text-right">Avg ms</th>
                          <th className="pb-2 pr-4 text-right">p95 ms</th>
                          <th className="pb-2 pr-4 text-right">p99 ms</th>
                          <th className="pb-2 text-right">Error %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(metricsData.http?.routes ?? []).map(r => (
                          <tr key={r.route} className="border-b border-white/5 hover:bg-white/5 transition">
                            <td className="py-2 pr-4 font-mono text-gray-300 max-w-xs truncate">
                              <span className="text-purple-400 mr-1.5">{r.route.split(' ')[0]}</span>
                              {r.route.split(' ').slice(1).join(' ')}
                            </td>
                            <td className="pr-4 text-right font-mono text-gray-300">{r.requests}</td>
                            <td className="pr-4 text-right font-mono text-gray-300">{r.avgMs}</td>
                            <td className="pr-4 text-right font-mono text-gray-300">{r.p95Ms}</td>
                            <td className="pr-4 text-right font-mono text-gray-300">{r.p99Ms}</td>
                            <td className="text-right">
                              <span className={`font-mono ${r.errorRatePct > 10 ? 'text-red-400' : r.errorRatePct > 1 ? 'text-yellow-400' : 'text-green-400'}`}>
                                {r.errorRatePct}%
                              </span>
                            </td>
                          </tr>
                        ))}
                        {(metricsData.http?.routes ?? []).length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-gray-600">No request data yet</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </ChartCard>

                {/* AI Call Stats */}
                <ChartCard title="AI Function Performance">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-gray-500 text-left">
                          <th className="pb-2 pr-4">Function</th>
                          <th className="pb-2 pr-4 text-right">Calls</th>
                          <th className="pb-2 pr-4 text-right">Errors</th>
                          <th className="pb-2 pr-4 text-right">Avg ms</th>
                          <th className="pb-2 text-right">Avg tokens</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(metricsData.ai?.byFunction ?? []).map(f => (
                          <tr key={f.fn} className="border-b border-white/5 hover:bg-white/5 transition">
                            <td className="py-2 pr-4 font-mono text-purple-300">{f.fn}</td>
                            <td className="pr-4 text-right font-mono text-gray-300">{f.calls}</td>
                            <td className="pr-4 text-right">
                              <span className={`font-mono ${f.errors > 0 ? 'text-red-400' : 'text-green-400'}`}>{f.errors}</span>
                            </td>
                            <td className="pr-4 text-right font-mono text-gray-300">{f.avgMs}ms</td>
                            <td className="text-right font-mono text-gray-400">{fmt(f.avgTokens ?? 0)}</td>
                          </tr>
                        ))}
                        {(metricsData.ai?.byFunction ?? []).length === 0 && (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-gray-600">No AI calls recorded yet</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </ChartCard>
              </>
            )}

            {!metricsData && (
              <div className="flex items-center justify-center py-20 text-gray-600">
                <RefreshCw size={16} className="animate-spin mr-2" />
                Loading metrics…
              </div>
            )}
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

        {/* ── DATABASE TAB ── */}
        {activeTab === 'database' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="flex items-center justify-between">
              <SectionTitle>Live Database</SectionTitle>
            </div>

            {/* Table picker + stats */}
            {dbTables && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
                {dbTables.map(t => (
                  <button
                    key={t.name}
                    onClick={() => {
                      setDbActiveTable(t.name);
                      setDbSearch('');
                      setDbOffset(0);
                      setDbOrderCol('');
                      setDbData(null);
                      setDbEditRow(null);
                      fetchDbData(t.name, '', 0, '', 'desc');
                    }}
                    className={`rounded-xl border p-3 text-left transition ${
                      dbActiveTable === t.name
                        ? 'border-purple-500 bg-purple-900/20 text-purple-300'
                        : 'border-white/10 bg-white/5 text-gray-400 hover:bg-white/10'
                    }`}
                  >
                    <p className="text-xs font-semibold truncate">{t.name}</p>
                    <p className="mt-1 font-mono text-lg font-bold text-white">{fmt(t.count)}</p>
                    <p className="text-[10px] text-gray-600">{t.columns.length} cols</p>
                  </button>
                ))}
              </div>
            )}

            {/* Data table */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 flex-1 min-w-0">
                  <Search size={13} className="text-gray-500 flex-shrink-0" />
                  <input
                    type="text"
                    placeholder={`Search ${dbActiveTable}…`}
                    value={dbSearch}
                    onChange={e => setDbSearch(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        setDbOffset(0);
                        fetchDbData(dbActiveTable, dbSearch, 0, dbOrderCol, dbOrderDir);
                      }
                    }}
                    className="w-full bg-transparent text-xs text-gray-200 placeholder-gray-600 outline-none"
                  />
                </div>
                <button
                  onClick={() => { setDbOffset(0); fetchDbData(dbActiveTable, dbSearch, 0, dbOrderCol, dbOrderDir); }}
                  disabled={dbLoading}
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-300 hover:bg-white/10 transition disabled:opacity-50"
                >
                  <RefreshCw size={12} className={dbLoading ? 'animate-spin' : ''} />
                  {dbLoading ? 'Loading…' : 'Reload'}
                </button>
                {dbData && (
                  <span className="text-xs text-gray-600 ml-auto">
                    {dbOffset + 1}–{Math.min(dbOffset + 50, dbData.total)} of {dbData.total} rows
                  </span>
                )}
              </div>

              {dbError && <SectionError onRetry={() => fetchDbData(dbActiveTable, dbSearch, dbOffset, dbOrderCol, dbOrderDir)} />}

              {dbData && (
                <>
                  {/* Edit row panel */}
                  {dbEditRow && (
                    <div className="mb-4 rounded-xl border border-purple-500/40 bg-purple-900/10 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold text-purple-300">Editing row</p>
                        <button onClick={() => setDbEditRow(null)} className="text-gray-500 hover:text-gray-300"><X size={14} /></button>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {dbData.columns.filter(c => !c.pk).map(col => (
                          <div key={col.name}>
                            <p className="text-[10px] text-gray-500 mb-1 font-mono">{col.name} <span className="text-gray-700">{col.type}</span></p>
                            {String(dbEditForm[col.name] ?? '').length > 60 ? (
                              <textarea
                                value={dbEditForm[col.name] ?? ''}
                                onChange={e => setDbEditForm(f => ({ ...f, [col.name]: e.target.value }))}
                                rows={3}
                                className="w-full bg-gray-800 border border-white/20 rounded px-2 py-1 text-xs text-white font-mono outline-none focus:border-purple-500 resize-y"
                              />
                            ) : (
                              <input
                                value={dbEditForm[col.name] ?? ''}
                                onChange={e => setDbEditForm(f => ({ ...f, [col.name]: e.target.value }))}
                                className="w-full bg-gray-800 border border-white/20 rounded px-2 py-1 text-xs text-white font-mono outline-none focus:border-purple-500"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          disabled={dbEditSaving}
                          onClick={async () => {
                            setDbEditSaving(true);
                            const pkCol = dbData.columns.find(c => c.pk);
                            const pkVal = dbEditRow[pkCol?.name ?? 'id'];
                            try {
                              await api.patch(`/admin/db/${dbActiveTable}/${pkVal}`, dbEditForm);
                              setDbData(prev => ({
                                ...prev,
                                rows: prev.rows.map(r => r[pkCol?.name ?? 'id'] === pkVal ? { ...r, ...dbEditForm } : r),
                              }));
                              setDbEditRow(null);
                            } catch (err) {
                              alert(err.response?.data?.error || 'Save failed');
                            } finally { setDbEditSaving(false); }
                          }}
                          className="flex items-center gap-1.5 rounded-lg bg-green-700 hover:bg-green-600 px-4 py-1.5 text-xs text-white transition disabled:opacity-50"
                        >
                          <Save size={12} />
                          {dbEditSaving ? 'Saving…' : 'Save changes'}
                        </button>
                        <button
                          onClick={() => setDbEditRow(null)}
                          className="rounded-lg border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-gray-300 hover:bg-white/10 transition"
                        >Cancel</button>
                      </div>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-gray-500 text-left">
                          {dbData.columns.map(col => (
                            <th
                              key={col.name}
                              className="pb-2 pr-3 whitespace-nowrap cursor-pointer hover:text-gray-300 transition select-none"
                              onClick={() => {
                                const newDir = dbOrderCol === col.name && dbOrderDir === 'desc' ? 'asc' : 'desc';
                                setDbOrderCol(col.name);
                                setDbOrderDir(newDir);
                                fetchDbData(dbActiveTable, dbSearch, dbOffset, col.name, newDir);
                              }}
                            >
                              <span className="flex items-center gap-1">
                                {col.name}
                                {col.pk && <span className="text-purple-500 text-[9px]">PK</span>}
                                {dbOrderCol === col.name && (
                                  dbOrderDir === 'desc' ? <ChevronDown size={10} /> : <ChevronUp size={10} />
                                )}
                              </span>
                            </th>
                          ))}
                          <th className="pb-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {dbData.rows.map((row, ri) => {
                          const pkCol = dbData.columns.find(c => c.pk);
                          const pkVal = row[pkCol?.name ?? 'id'];
                          return (
                            <tr key={ri} className="border-b border-white/5 hover:bg-white/5 transition group">
                              {dbData.columns.map(col => (
                                <td key={col.name} className="py-2 pr-3 align-top font-mono max-w-[200px]">
                                  <div className="truncate text-gray-300" title={String(row[col.name] ?? '')}>
                                    {row[col.name] === null
                                      ? <span className="text-gray-700 italic">null</span>
                                      : String(row[col.name]).length > 60
                                        ? String(row[col.name]).slice(0, 60) + '…'
                                        : String(row[col.name])
                                    }
                                  </div>
                                </td>
                              ))}
                              <td className="py-2 align-top">
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => {
                                      const form = {};
                                      dbData.columns.filter(c => !c.pk).forEach(c => { form[c.name] = row[c.name] ?? ''; });
                                      setDbEditForm(form);
                                      setDbEditRow(row);
                                    }}
                                    className="text-gray-600 hover:text-purple-400"
                                    title="Edit row"
                                  ><Pencil size={12} /></button>
                                  <button
                                    onClick={async () => {
                                      if (!window.confirm(`Delete row where ${pkCol?.name}=${pkVal}?`)) return;
                                      try {
                                        await api.delete(`/admin/db/${dbActiveTable}/${pkVal}`);
                                        setDbData(prev => ({ ...prev, rows: prev.rows.filter((_, i) => i !== ri), total: prev.total - 1 }));
                                      } catch (err) {
                                        alert(err.response?.data?.error || 'Delete failed');
                                      }
                                    }}
                                    className="text-gray-600 hover:text-red-400"
                                    title="Delete row"
                                  ><Trash2 size={12} /></button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xs text-gray-600">
                      {dbData.total === 0 ? 'No rows' : `${dbOffset + 1}–${Math.min(dbOffset + 50, dbData.total)} of ${dbData.total}`}
                    </span>
                    <div className="flex gap-2">
                      <button
                        disabled={dbOffset === 0 || dbLoading}
                        onClick={() => fetchDbData(dbActiveTable, dbSearch, Math.max(0, dbOffset - 50), dbOrderCol, dbOrderDir)}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-300 disabled:opacity-30 hover:bg-white/10 transition"
                      ><ChevronLeft size={12} /></button>
                      <button
                        disabled={dbOffset + 50 >= dbData.total || dbLoading}
                        onClick={() => fetchDbData(dbActiveTable, dbSearch, dbOffset + 50, dbOrderCol, dbOrderDir)}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-300 disabled:opacity-30 hover:bg-white/10 transition"
                      ><ChevronRight size={12} /></button>
                    </div>
                  </div>
                </>
              )}

              {!dbData && !dbLoading && (
                <div className="py-8 text-center text-xs text-gray-600">
                  Select a table above to browse data
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === 'storage' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="flex items-center justify-between">
              <SectionTitle>Disk &amp; Storage</SectionTitle>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchStorage}
                  disabled={storageLoading}
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-300 hover:bg-white/10 transition disabled:opacity-50"
                >
                  <RefreshCw size={12} className={storageLoading ? 'animate-spin' : ''} />
                  {storageLoading ? 'Loading…' : 'Refresh'}
                </button>
                <button
                  onClick={handleCheckpoint}
                  disabled={checkpointLoading}
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-300 hover:bg-white/10 transition disabled:opacity-50"
                  title="Fold the -wal file back into the database and shrink it to 0 bytes"
                >
                  <Database size={12} className={checkpointLoading ? 'animate-pulse' : ''} />
                  {checkpointLoading ? 'Checkpointing…' : 'Checkpoint WAL'}
                </button>
                <button
                  onClick={handleVacuum}
                  disabled={vacuumLoading}
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-300 hover:bg-white/10 transition disabled:opacity-50"
                  title="Reclaim disk space from deleted rows"
                >
                  <HardDrive size={12} className={vacuumLoading ? 'animate-pulse' : ''} />
                  {vacuumLoading ? 'Vacuuming…' : 'Run VACUUM'}
                </button>
              </div>
            </div>

            {storageError && <SectionError onRetry={fetchStorage} />}

            {storageData && (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-2xl font-bold text-white">{fmtBytes(storageData.totalDiskBytes)}</p>
                    <p className="mt-1 text-xs text-gray-500">Data directory size</p>
                    <p className="mt-2 truncate font-mono text-[10px] text-gray-700" title={storageData.dataDir}>{storageData.dataDir}</p>
                  </div>
                  {storageData.volume && (
                    <>
                      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                        <p className="text-2xl font-bold text-white">{fmtBytes(storageData.volume.totalBytes - storageData.volume.availableBytes)}</p>
                        <p className="mt-1 text-xs text-gray-500">Volume used (of {fmtBytes(storageData.volume.totalBytes)})</p>
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-purple-500"
                            style={{
                              width: `${Math.min(100, ((storageData.volume.totalBytes - storageData.volume.availableBytes) / storageData.volume.totalBytes) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                        <p className="text-2xl font-bold text-white">{fmtBytes(storageData.volume.availableBytes)}</p>
                        <p className="mt-1 text-xs text-gray-500">Volume free</p>
                      </div>
                    </>
                  )}
                </div>

                {/* File explorer */}
                <ChartCard title="Files on disk">
                  {/* Breadcrumb / path nav */}
                  <div className="mb-3 flex items-center gap-2">
                    <button
                      onClick={() => fetchFsBrowse(fsDir.split('/').slice(0, -1).join('/'))}
                      disabled={!fsDir || fsLoading}
                      className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-300 disabled:opacity-30 hover:bg-white/10 transition"
                      title="Up one level"
                    ><ArrowUp size={12} /></button>
                    <div className="flex items-center gap-1 overflow-x-auto font-mono text-[11px] text-gray-400">
                      <button
                        onClick={() => fetchFsBrowse('')}
                        className="hover:text-purple-400 transition whitespace-nowrap"
                      >data</button>
                      {fsDir && fsDir.split('/').map((seg, i, arr) => {
                        const target = arr.slice(0, i + 1).join('/');
                        return (
                          <span key={target} className="flex items-center gap-1 whitespace-nowrap">
                            <span className="text-gray-600">/</span>
                            <button onClick={() => fetchFsBrowse(target)} className="hover:text-purple-400 transition">
                              {seg}
                            </button>
                          </span>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => fetchFsBrowse(fsDir)}
                      disabled={fsLoading}
                      className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-300 disabled:opacity-50 hover:bg-white/10 transition"
                    >
                      <RefreshCw size={11} className={fsLoading ? 'animate-spin' : ''} />
                      Refresh
                    </button>
                  </div>

                  {fsError && <SectionError onRetry={() => fetchFsBrowse(fsDir)} />}

                  {fsEntries && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-white/10 text-gray-500 text-left">
                            {[
                              { key: 'name', label: 'Name' },
                              { key: 'size', label: 'Size' },
                              { key: 'modified', label: 'Modified' },
                            ].map(col => (
                              <th
                                key={col.key}
                                className="pb-2 pr-3 whitespace-nowrap cursor-pointer hover:text-gray-300 transition select-none"
                                onClick={() => fsSortBy(col.key)}
                              >
                                <span className="flex items-center gap-1">
                                  {col.label}
                                  {fsSortCol === col.key
                                    ? (fsSortDir === 'desc' ? <ChevronDown size={10} /> : <ChevronUp size={10} />)
                                    : <ChevronsUpDown size={10} className="opacity-30" />}
                                </span>
                              </th>
                            ))}
                            <th className="pb-2 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fsSortedEntries.length === 0 && (
                            <tr><td colSpan={4} className="py-6 text-center text-gray-600">Empty directory</td></tr>
                          )}
                          {fsSortedEntries.map(entry => (
                            <tr key={entry.name} className="group border-b border-white/5">
                              <td className="py-2 pr-3 font-mono text-gray-300">
                                {entry.isDirectory ? (
                                  <button
                                    onClick={() => fetchFsBrowse(fsDir ? `${fsDir}/${entry.name}` : entry.name)}
                                    className="flex items-center gap-1.5 hover:text-purple-400 transition"
                                  >
                                    <Folder size={12} className="text-gray-500" />
                                    {entry.name}
                                  </button>
                                ) : (
                                  <span className="flex items-center gap-1.5">
                                    <File size={12} className="text-gray-600" />
                                    {entry.name}
                                  </span>
                                )}
                              </td>
                              <td className="py-2 pr-3 font-mono text-gray-300">{entry.isFile ? fmtBytes(entry.bytes) : '—'}</td>
                              <td className="py-2 text-gray-500">{relTime(entry.modified_at)}</td>
                              <td className="py-2">
                                {entry.isFile && (
                                  <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <a
                                      href={fsFileUrl(entry, false)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-gray-600 hover:text-blue-400"
                                      title="View"
                                    ><Eye size={13} /></a>
                                    <a
                                      href={fsFileUrl(entry, true)}
                                      className="text-gray-600 hover:text-green-400"
                                      title="Download"
                                    ><Download size={13} /></a>
                                    <button
                                      onClick={() => handleFsDelete(entry)}
                                      disabled={fsDeleting === entry.name}
                                      className="text-gray-600 hover:text-red-400 disabled:opacity-50"
                                      title="Delete"
                                    ><Trash2 size={13} /></button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </ChartCard>

                {/* Per-table breakdown */}
                <ChartCard title="Table storage breakdown">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-gray-500 text-left">
                          <th className="pb-2 pr-3">Table</th>
                          <th className="pb-2 pr-3">Rows</th>
                          <th className="pb-2 pr-3">Est. content size</th>
                          <th className="pb-2">Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const maxBytes = Math.max(1, ...storageData.tables.map(t => t.bytes));
                          return storageData.tables
                            .slice()
                            .sort((a, b) => b.bytes - a.bytes)
                            .map(t => (
                              <tr key={t.name} className="border-b border-white/5">
                                <td className="py-2 pr-3 font-mono text-gray-300">{t.name}</td>
                                <td className="py-2 pr-3 font-mono text-gray-300">{fmt(t.count)}</td>
                                <td className="py-2 pr-3 font-mono text-gray-300">{fmtBytes(t.bytes)}</td>
                                <td className="py-2">
                                  <div className="h-1.5 w-32 overflow-hidden rounded-full bg-white/10">
                                    <div
                                      className="h-full rounded-full bg-blue-500"
                                      style={{ width: `${(t.bytes / maxBytes) * 100}%` }}
                                    />
                                  </div>
                                </td>
                              </tr>
                            ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                </ChartCard>
              </>
            )}
          </motion.div>
        )}

      </div>
    </div>
  );
}

// ── Minor sub-components ──────────────────────────────────────────────────────
function SectionError({ onRetry }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#ef4444' }}>
        Failed to load.
      </span>
      <button
        onClick={onRetry}
        style={{
          background: 'rgba(239,68,68,0.1)',
          color: '#ef4444',
          border: '0.5px solid rgba(239,68,68,0.3)',
          borderRadius: 6,
          padding: '4px 10px',
          fontSize: 12,
          fontFamily: 'Inter, sans-serif',
          cursor: 'pointer',
        }}
      >
        Retry
      </button>
    </div>
  );
}

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

const LOG_LEVEL_STYLES = {
  debug: { badge: 'bg-gray-800 text-gray-400',   chip: 'border-gray-700 bg-gray-800/50 text-gray-400' },
  info:  { badge: 'bg-blue-900/40 text-blue-400',   chip: 'border-blue-900/40 bg-blue-900/20 text-blue-400' },
  warn:  { badge: 'bg-yellow-900/40 text-yellow-400', chip: 'border-yellow-900/40 bg-yellow-900/20 text-yellow-400' },
  error: { badge: 'bg-red-900/40 text-red-400',   chip: 'border-red-900/40 bg-red-900/20 text-red-400' },
};

function LogLevelIcon({ level }) {
  const sz = 10;
  if (level === 'error') return <AlertCircle size={sz} />;
  if (level === 'warn')  return <AlertTriangle size={sz} />;
  if (level === 'debug') return <Bug size={sz} />;
  return <Info size={sz} />;
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
