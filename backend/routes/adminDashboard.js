import { Router } from 'express';
import { tracer } from '../services/tracer.js';
import { getDb } from '../database.js';
import { metrics } from '../services/metrics.js';

const router = Router();

function requireAdminToken(req, res, next) {
  const token = req.query.token || req.headers['x-admin-token'];
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).send(`<!DOCTYPE html><html><body style="font-family:monospace;background:#0a0a0a;color:#ff4444;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><h1>401 — Unauthorized</h1></body></html>`);
  }
  next();
}

router.use(requireAdminToken);

// ─── JSON data API ─────────────────────────────────────────────────────────

router.get('/api/data', (req, res) => {
  const requests = tracer.getRequests().slice(0, 50);
  const nodeStats = tracer.getNodeStats(300_000);
  const errors = tracer.getRecentErrors(3_600_000);
  const snap = metrics.snapshot();

  let dbStats = {};
  try {
    const db = getDb();
    const tables = ['users', 'presentations', 'messages', 'prompt_sessions', 'subscriptions', 'credit_transactions', 'app_logs', 'analytics_events'];
    for (const t of tables) {
      try { dbStats[t] = db.prepare(`SELECT COUNT(*) as n FROM ${t}`).get()?.n ?? 0; } catch { dbStats[t] = 0; }
    }
  } catch {}

  res.json({ requests, nodeStats, errors, dbStats, metrics: snap });
});

// ─── SSE stream for real-time push ─────────────────────────────────────────

router.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (trace) => {
    try { res.write(`data: ${JSON.stringify(trace)}\n\n`); } catch {}
  };

  // Send last 5 requests immediately for catch-up
  const recent = tracer.getRequests().slice(0, 5).reverse();
  for (const t of recent) send(t);

  const unsub = tracer.subscribe(send);
  const heartbeat = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 25000);

  req.on('close', () => {
    unsub();
    clearInterval(heartbeat);
  });
});

// ─── Dashboard HTML ─────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  const token = req.query.token || req.headers['x-admin-token'];
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getDashboardHTML(token));
});

function getDashboardHTML(token) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>HyperBeing — System Monitor</title>
<script src="https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js"></script>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  :root{
    --bg:#0a0a0f;--bg2:#111118;--bg3:#1a1a24;--border:#2a2a3a;
    --text:#e2e2f0;--muted:#6b6b8a;--accent:#7c6fff;--green:#22c55e;
    --yellow:#eab308;--red:#ef4444;--blue:#3b82f6;--teal:#14b8a6;
    --orange:#f97316;--purple:#a855f7;--amber:#f59e0b;
  }
  body{background:var(--bg);color:var(--text);font-family:'Inter',system-ui,sans-serif;font-size:13px;min-height:100vh}
  h1{font-size:18px;font-weight:700;letter-spacing:-0.3px}
  h2{font-size:14px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:1px}
  header{background:var(--bg2);border-bottom:1px solid var(--border);padding:12px 20px;display:flex;align-items:center;gap:16px;position:sticky;top:0;z-index:100}
  .logo{font-weight:800;font-size:16px;background:linear-gradient(135deg,var(--accent),#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
  .badge{background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:2px 8px;font-size:11px;color:var(--muted)}
  .live-dot{width:8px;height:8px;border-radius:50%;background:var(--green);animation:pulse 2s infinite;flex-shrink:0}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  .tabs{display:flex;gap:2px;background:var(--bg3);border-radius:8px;padding:3px;margin-left:auto}
  .tab{padding:5px 14px;border-radius:6px;cursor:pointer;font-weight:500;transition:all .15s;color:var(--muted);border:none;background:none;font-size:12px}
  .tab.active{background:var(--accent);color:#fff}
  .tab:hover:not(.active){color:var(--text)}
  .panel{display:none;padding:16px 20px;height:calc(100vh - 55px);overflow:hidden}
  .panel.active{display:flex;flex-direction:column;gap:12px}
  /* Architecture tab */
  #arch-panel{flex-direction:row;gap:0;padding:0}
  #network-container{flex:1;background:var(--bg);position:relative}
  #arch-sidebar{width:280px;background:var(--bg2);border-left:1px solid var(--border);padding:16px;overflow-y:auto;display:flex;flex-direction:column;gap:12px}
  .legend-item{display:flex;align-items:center;gap:8px;font-size:12px}
  .legend-dot{width:10px;height:10px;border-radius:50%}
  .node-detail{background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:6px}
  .node-detail h3{font-size:13px;font-weight:600}
  .stat-row{display:flex;justify-content:space-between;font-size:12px;color:var(--muted)}
  .stat-val{color:var(--text);font-weight:500}
  /* Feed tab */
  .feed-header{display:flex;justify-content:space-between;align-items:center}
  .filter-bar{display:flex;gap:8px;align-items:center}
  .filter-btn{padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:none;color:var(--muted);cursor:pointer;font-size:11px;transition:all .15s}
  .filter-btn.active{border-color:var(--accent);color:var(--accent)}
  table{width:100%;border-collapse:collapse}
  th{text-align:left;padding:8px 10px;color:var(--muted);font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--bg2);z-index:10}
  td{padding:7px 10px;border-bottom:1px solid var(--border);vertical-align:top;font-size:12px}
  tr.clickable{cursor:pointer}
  tr.clickable:hover td{background:var(--bg3)}
  .status-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600;text-transform:uppercase}
  .status-badge.in-progress{background:rgba(59,130,246,.15);color:var(--blue)}
  .status-badge.completed{background:rgba(34,197,94,.1);color:var(--green)}
  .status-badge.failed{background:rgba(239,68,68,.12);color:var(--red)}
  .step-pills{display:flex;flex-wrap:wrap;gap:3px;max-width:300px}
  .step-pill{padding:1px 6px;border-radius:3px;font-size:10px;background:var(--bg3);border:1px solid var(--border);color:var(--muted)}
  .step-pill.completed{border-color:#22c55e40;color:var(--green)}
  .step-pill.failed{border-color:#ef444440;color:var(--red)}
  .step-pill.started{border-color:#eab30840;color:var(--yellow)}
  .trace-detail{background:var(--bg3);padding:10px;border-radius:6px;margin-top:4px}
  .trace-step{display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)}
  .trace-step:last-child{border-bottom:none}
  .step-icon{width:16px;height:16px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;flex-shrink:0;margin-top:1px}
  .step-icon.completed{background:rgba(34,197,94,.2);color:var(--green)}
  .step-icon.failed{background:rgba(239,68,68,.2);color:var(--red)}
  .step-icon.started{background:rgba(234,179,8,.2);color:var(--yellow)}
  .step-info{flex:1}
  .step-name{font-weight:500;font-size:12px}
  .step-meta{font-size:11px;color:var(--muted);margin-top:2px}
  .step-error{font-size:11px;color:var(--red);margin-top:3px;font-family:monospace;background:rgba(239,68,68,.06);padding:4px 6px;border-radius:4px}
  .table-wrap{overflow-y:auto;flex:1;border:1px solid var(--border);border-radius:8px}
  /* Error panel */
  .error-group{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px;display:flex;flex-direction:column;gap:8px}
  .error-group h3{font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px}
  .count-badge{background:rgba(239,68,68,.15);color:var(--red);border-radius:4px;padding:1px 6px;font-size:11px}
  .error-entry{font-size:11px;color:var(--muted);padding:4px 8px;background:var(--bg3);border-radius:4px;border-left:2px solid var(--red)}
  .error-entry .err-msg{color:var(--text);font-family:monospace;word-break:break-all}
  .error-entry .err-meta{color:var(--muted);margin-top:2px}
  .errors-scroll{overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:10px}
  /* DB stats */
  .db-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}
  .db-card{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center}
  .db-card .n{font-size:22px;font-weight:700;color:var(--accent)}
  .db-card .label{font-size:11px;color:var(--muted);margin-top:2px}
  .new-row{animation:fadeIn .4s ease}
  @keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
  .scrollable{overflow-y:auto}
  .empty{color:var(--muted);font-size:13px;padding:24px;text-align:center}
  select,input{background:var(--bg3);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:4px 8px;font-size:12px}
</style>
</head>
<body>
<header>
  <span class="logo">HyperBeing</span>
  <span class="badge">System Monitor</span>
  <div class="live-dot" id="live-dot"></div>
  <span id="last-update" style="color:var(--muted);font-size:11px">connecting…</span>
  <div class="tabs">
    <button class="tab active" onclick="switchTab('arch')">Architecture</button>
    <button class="tab" onclick="switchTab('feed')">Live Feed</button>
    <button class="tab" onclick="switchTab('errors')">Errors</button>
    <button class="tab" onclick="switchTab('db')">Database</button>
  </div>
</header>

<!-- ARCHITECTURE TAB -->
<div id="arch-panel" class="panel active">
  <div id="network-container">
    <div id="network" style="width:100%;height:100%"></div>
  </div>
  <div id="arch-sidebar">
    <h2>Legend</h2>
    <div class="legend-item"><div class="legend-dot" style="background:#a855f7"></div> Frontend Pages</div>
    <div class="legend-item"><div class="legend-dot" style="background:#3b82f6"></div> Backend Routes</div>
    <div class="legend-item"><div class="legend-dot" style="background:#6b7280"></div> Middleware</div>
    <div class="legend-item"><div class="legend-dot" style="background:#14b8a6"></div> Services</div>
    <div class="legend-item"><div class="legend-dot" style="background:#f59e0b"></div> Database Tables</div>
    <div class="legend-item"><div class="legend-dot" style="background:#f97316"></div> External Services</div>
    <hr style="border-color:var(--border)">
    <div class="legend-item"><div class="legend-dot" style="background:#22c55e"></div> Healthy (no errors)</div>
    <div class="legend-item"><div class="legend-dot" style="background:#eab308"></div> Slow (avg >5s)</div>
    <div class="legend-item"><div class="legend-dot" style="background:#ef4444"></div> Errors in last 5min</div>
    <div class="legend-item"><div class="legend-dot" style="background:#374151"></div> No activity yet</div>
    <hr style="border-color:var(--border)">
    <div id="node-detail-panel">
      <p style="color:var(--muted);font-size:12px">Click a node to see details</p>
    </div>
  </div>
</div>

<!-- LIVE FEED TAB -->
<div id="feed-panel" class="panel">
  <div class="feed-header">
    <h2>Live Request Feed</h2>
    <div class="filter-bar">
      <button class="filter-btn active" onclick="setFilter('all')">All</button>
      <button class="filter-btn" onclick="setFilter('in-progress')">In Progress</button>
      <button class="filter-btn" onclick="setFilter('failed')">Failed</button>
      <select id="node-filter" onchange="applyFilters()"><option value="">All nodes</option></select>
    </div>
  </div>
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th>Time</th><th>User</th><th>Path</th><th>Steps</th><th>Status</th><th>Duration</th>
      </tr></thead>
      <tbody id="feed-tbody"></tbody>
    </table>
  </div>
</div>

<!-- ERRORS TAB -->
<div id="errors-panel" class="panel">
  <h2>Error Inspector — last hour</h2>
  <div class="errors-scroll" id="errors-container">
    <div class="empty">No errors in the last hour</div>
  </div>
</div>

<!-- DATABASE TAB -->
<div id="db-panel" class="panel">
  <h2>Database — Row Counts</h2>
  <div class="db-grid" id="db-grid"></div>
  <hr style="border-color:var(--border);margin-top:12px">
  <h2 style="margin-top:4px">Service Metrics (since last restart)</h2>
  <div id="metrics-section" style="margin-top:8px"></div>
</div>

<script>
const TOKEN = '${token}';
const API = (path) => '/admin' + path + '?token=' + TOKEN;

// ─── Tab switching ──────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById(name + '-panel').classList.add('active');
  event.target.classList.add('active');
  if (name === 'arch') setTimeout(() => network && network.fit({ animation: true }), 50);
}

// ─── State ──────────────────────────────────────────────────────────────────
let allRequests = [];
let nodeStatsMap = {};
let activeFilter = 'all';
let nodeFilter = '';
let selectedNode = null;
let expandedTraces = new Set();
let network = null;
let networkNodes = null;
let networkEdges = null;

// ─── Architecture Graph ─────────────────────────────────────────────────────
const LAYER_COLORS = {
  frontend: '#a855f7',
  route: '#3b82f6',
  middleware: '#6b7280',
  service: '#14b8a6',
  database: '#f59e0b',
  external: '#f97316',
};

const NODE_DEFS = [
  // Frontend pages
  {id:'fe_home',      label:'Homepage\\n/',                    group:'frontend', step:null},
  {id:'fe_login',     label:'Login\\n/login',                  group:'frontend', step:null},
  {id:'fe_dashboard', label:'Dashboard\\n/dashboard',          group:'frontend', step:null},
  {id:'fe_pres',      label:'Presentation\\n/presentations/:id',group:'frontend',step:null},
  {id:'fe_prompt',    label:'Prompt Gen\\n/prompt-generator',  group:'frontend', step:null},
  {id:'fe_onboard',   label:'Onboarding\\n/onboarding',        group:'frontend', step:null},
  {id:'fe_pricing',   label:'Pricing\\n/pricing',              group:'frontend', step:null},
  {id:'fe_profile',   label:'Profile\\n/profile',              group:'frontend', step:null},
  {id:'fe_billing',   label:'Billing Success\\n/billing/success',group:'frontend',step:null},
  {id:'fe_callback',  label:'Auth Callback\\n/auth/callback',  group:'frontend', step:null},
  {id:'fe_analytics', label:'Analytics\\n/analytics',          group:'frontend', step:null},
  // Backend routes
  {id:'rt_auth',      label:'/api/auth',         group:'route', step:'route_auth'},
  {id:'rt_pres',      label:'/api/presentations',group:'route', step:'route_presentations'},
  {id:'rt_billing',   label:'/api/billing',      group:'route', step:'route_billing'},
  {id:'rt_analytics', label:'/api/analytics',    group:'route', step:'route_analytics'},
  {id:'rt_admin',     label:'/api/admin',        group:'route', step:'route_admin'},
  {id:'rt_prompt',    label:'/api/prompt-chat',  group:'route', step:'route_prompt_chat'},
  // Middleware
  {id:'mw_auth',      label:'authenticateToken', group:'middleware', step:null},
  {id:'mw_logger',    label:'requestLogger',     group:'middleware', step:null},
  {id:'mw_rate',      label:'rateLimits',        group:'middleware', step:null},
  {id:'mw_validate',  label:'validate',          group:'middleware', step:null},
  // Services
  {id:'svc_claude',   label:'claudeAgent',       group:'service', step:'claude_question_gen'},
  {id:'svc_img',      label:'imageGeneration',   group:'service', step:'nanobanana_slide_0'},
  {id:'svc_stripe',   label:'stripeService',     group:'service', step:null},
  {id:'svc_logger',   label:'logger',            group:'service', step:null},
  {id:'svc_metrics',  label:'metrics',           group:'service', step:null},
  {id:'svc_posthog',  label:'posthogClient',     group:'service', step:null},
  {id:'svc_prompt',   label:'promptGenerator',   group:'service', step:'prompt_generator'},
  // Database tables
  {id:'db_users',     label:'users',             group:'database', step:null},
  {id:'db_pres',      label:'presentations',     group:'database', step:null},
  {id:'db_messages',  label:'messages',          group:'database', step:null},
  {id:'db_sessions',  label:'prompt_sessions',   group:'database', step:null},
  {id:'db_subs',      label:'subscriptions',     group:'database', step:null},
  {id:'db_credits',   label:'credit_transactions',group:'database',step:null},
  {id:'db_logs',      label:'app_logs',          group:'database', step:null},
  {id:'db_analytics', label:'analytics_events',  group:'database', step:null},
  // External services
  {id:'ext_anthropic',label:'Anthropic API',     group:'external', step:'claude_question_gen'},
  {id:'ext_gemini',   label:'Google Gemini',     group:'external', step:'nanobanana_slide_0'},
  {id:'ext_stripe',   label:'Stripe API',        group:'external', step:null},
  {id:'ext_posthog',  label:'PostHog',           group:'external', step:null},
  {id:'ext_goauth',   label:'Google OAuth',      group:'external', step:null},
  {id:'ext_metaauth', label:'Meta OAuth',        group:'external', step:null},
  {id:'ext_tiktok',   label:'TikTok OAuth',      group:'external', step:null},
];

const EDGE_DEFS = [
  // Frontend → Routes (user flows)
  ['fe_login','rt_auth'],['fe_dashboard','rt_pres'],['fe_dashboard','rt_auth'],
  ['fe_pres','rt_pres'],['fe_prompt','rt_prompt'],['fe_onboard','rt_auth'],
  ['fe_pricing','rt_billing'],['fe_profile','rt_auth'],['fe_billing','rt_billing'],
  ['fe_callback','rt_auth'],['fe_analytics','rt_analytics'],['fe_analytics','rt_admin'],
  // All routes go through middleware
  ['mw_logger','rt_auth'],['mw_logger','rt_pres'],['mw_logger','rt_billing'],
  ['mw_logger','rt_analytics'],['mw_logger','rt_admin'],['mw_logger','rt_prompt'],
  ['mw_auth','rt_pres'],['mw_auth','rt_billing'],['mw_auth','rt_analytics'],
  ['mw_auth','rt_admin'],['mw_auth','rt_prompt'],['mw_auth','rt_auth'],
  ['mw_rate','rt_pres'],['mw_rate','rt_auth'],['mw_rate','rt_billing'],
  ['mw_validate','rt_pres'],['mw_validate','rt_auth'],
  // Routes → Services
  ['rt_pres','svc_claude'],['rt_pres','svc_img'],['rt_pres','svc_stripe'],
  ['rt_prompt','svc_prompt'],['rt_auth','svc_stripe'],['rt_billing','svc_stripe'],
  ['rt_analytics','svc_logger'],['rt_admin','svc_logger'],['rt_admin','svc_metrics'],
  ['svc_claude','svc_stripe'],['svc_prompt','svc_stripe'],
  // Services → External
  ['svc_claude','ext_anthropic'],['svc_prompt','ext_anthropic'],
  ['svc_img','ext_gemini'],['svc_stripe','ext_stripe'],['svc_posthog','ext_posthog'],
  ['rt_auth','ext_goauth'],['rt_auth','ext_metaauth'],['rt_auth','ext_tiktok'],
  // Routes → DB
  ['rt_pres','db_pres'],['rt_pres','db_messages'],['rt_pres','db_users'],
  ['rt_auth','db_users'],['rt_billing','db_subs'],['rt_billing','db_credits'],
  ['rt_analytics','db_analytics'],['rt_admin','db_logs'],
  ['svc_stripe','db_subs'],['svc_stripe','db_credits'],
  ['svc_logger','db_logs'],
  // Services → DB
  ['rt_prompt','db_sessions'],
];

function getNodeBaseColor(group) {
  return LAYER_COLORS[group] || '#6b7280';
}

function getNodeHealthColor(nodeId, stats) {
  const nodeDef = NODE_DEFS.find(n => n.id === nodeId);
  if (!nodeDef || !nodeDef.step) return null; // no trace step = no health data

  // For service nodes, aggregate matching steps
  const matchingSteps = Object.entries(stats).filter(([step]) => {
    if (nodeDef.id.startsWith('svc_claude') || nodeDef.id === 'ext_anthropic') {
      return step.startsWith('claude_') || step === 'prompt_generator';
    }
    if (nodeDef.id === 'svc_img' || nodeDef.id === 'ext_gemini') {
      return step.startsWith('nanobanana_');
    }
    if (nodeDef.id === 'svc_prompt') return step === 'prompt_generator';
    return step === nodeDef.step;
  });

  if (matchingSteps.length === 0) return null;

  let totalErrors = 0, totalCount = 0, maxAvgMs = 0;
  for (const [, s] of matchingSteps) {
    totalErrors += s.errors;
    totalCount += s.count;
    if (s.avgMs > maxAvgMs) maxAvgMs = s.avgMs;
  }

  if (totalErrors > 0) return '#ef4444';
  if (maxAvgMs > 5000) return '#eab308';
  if (totalCount > 0) return '#22c55e';
  return null;
}

function initNetwork() {
  const container = document.getElementById('network');

  const layerPositions = {
    frontend: { level: 0 }, route: { level: 1 }, middleware: { level: 2 },
    service: { level: 3 }, database: { level: 4 }, external: { level: 5 },
  };

  const groupCounts = {};
  for (const n of NODE_DEFS) {
    if (!groupCounts[n.group]) groupCounts[n.group] = 0;
    groupCounts[n.group]++;
  }
  const groupIdx = {};
  for (const n of NODE_DEFS) {
    if (!groupIdx[n.group]) groupIdx[n.group] = 0;
    n._idx = groupIdx[n.group]++;
    n._total = groupCounts[n.group];
  }

  const nodes = new vis.DataSet(NODE_DEFS.map(n => {
    const base = getNodeBaseColor(n.group);
    return {
      id: n.id,
      label: n.label,
      color: { background: base + '33', border: base, highlight: { background: base + '55', border: base } },
      font: { color: '#e2e2f0', size: 11 },
      shape: n.group === 'database' ? 'cylinder' : n.group === 'external' ? 'diamond' : 'box',
      borderWidth: 1.5,
      shadow: { enabled: true, color: base + '44', size: 8 },
    };
  }));

  const edges = new vis.DataSet(EDGE_DEFS.map(([from, to], i) => ({
    id: i, from, to,
    arrows: { to: { enabled: true, scaleFactor: 0.5 } },
    color: { color: '#2a2a3a', highlight: '#7c6fff' },
    width: 1,
    smooth: { type: 'curvedCW', roundness: 0.1 },
  })));

  networkNodes = nodes;
  networkEdges = edges;

  const options = {
    layout: {
      hierarchical: {
        direction: 'LR',
        sortMethod: 'directed',
        levelSeparation: 220,
        nodeSpacing: 60,
        blockShifting: true,
        edgeMinimization: true,
      },
    },
    physics: { enabled: false },
    interaction: { hover: true, tooltipDelay: 100, navigationButtons: true, keyboard: true },
    nodes: { margin: { top: 8, bottom: 8, left: 10, right: 10 } },
    edges: { length: 200 },
  };

  network = new vis.Network(container, { nodes, edges }, options);

  network.on('click', (params) => {
    if (params.nodes.length > 0) {
      selectedNode = params.nodes[0];
      showNodeDetail(selectedNode);
      nodeFilter = selectedNode;
      document.getElementById('node-filter').value = selectedNode;
      applyFilters();
    } else {
      selectedNode = null;
      document.getElementById('node-detail-panel').innerHTML = '<p style="color:var(--muted);font-size:12px">Click a node to see details</p>';
      nodeFilter = '';
      document.getElementById('node-filter').value = '';
      applyFilters();
    }
  });

  network.on('hoverNode', (params) => {
    const def = NODE_DEFS.find(n => n.id === params.node);
    if (!def) return;
    const stats = nodeStatsMap;
    const stepData = def.step ? stats[def.step] : null;
    let tooltip = def.label.replace(/\\n/g, ' ');
    if (stepData) {
      tooltip += '\\nRequests (5min): ' + stepData.count;
      tooltip += '\\nAvg latency: ' + stepData.avgMs + 'ms';
      if (stepData.lastError) tooltip += '\\nLast error: ' + stepData.lastError.slice(0, 60);
    }
    // vis.js shows title as tooltip
    networkNodes.update({ id: params.node, title: tooltip });
  });

  setTimeout(() => network.fit({ animation: true }), 100);
}

function showNodeDetail(nodeId) {
  const def = NODE_DEFS.find(n => n.id === nodeId);
  if (!def) return;

  const matchingSteps = Object.entries(nodeStatsMap).filter(([step]) => {
    if (def.id === 'svc_claude' || def.id === 'ext_anthropic') return step.startsWith('claude_') || step === 'prompt_generator';
    if (def.id === 'svc_img' || def.id === 'ext_gemini') return step.startsWith('nanobanana_');
    if (def.id === 'svc_prompt') return step === 'prompt_generator';
    return step === def.step;
  });

  let html = '<div class="node-detail">';
  html += '<h3>' + def.label.replace(/\\n/g, ' · ') + '</h3>';
  html += '<div class="stat-row"><span>Group</span><span class="stat-val" style="color:' + getNodeBaseColor(def.group) + '">' + def.group + '</span></div>';

  if (matchingSteps.length > 0) {
    let totalCount = 0, totalErrors = 0, totalMs = 0;
    for (const [step, s] of matchingSteps) {
      totalCount += s.count; totalErrors += s.errors;
      if (s.avgMs && s.count) totalMs += s.avgMs * s.count;
    }
    const avgMs = totalCount > 0 ? Math.round(totalMs / totalCount) : 0;
    html += '<div class="stat-row"><span>Requests (5min)</span><span class="stat-val">' + totalCount + '</span></div>';
    html += '<div class="stat-row"><span>Avg latency</span><span class="stat-val">' + avgMs + 'ms</span></div>';
    html += '<div class="stat-row"><span>Errors</span><span class="stat-val" style="color:' + (totalErrors > 0 ? 'var(--red)' : 'var(--green)') + '">' + totalErrors + '</span></div>';
    for (const [step, s] of matchingSteps) {
      if (s.lastError) {
        html += '<div class="step-error">' + escHtml(s.lastError.slice(0, 120)) + '</div>';
        break;
      }
    }
  } else {
    html += '<div style="color:var(--muted);font-size:12px;margin-top:4px">No activity yet</div>';
  }
  html += '</div>';
  document.getElementById('node-detail-panel').innerHTML = html;
}

function updateNodeColors() {
  if (!networkNodes) return;
  const updates = [];
  for (const n of NODE_DEFS) {
    const base = getNodeBaseColor(n.group);
    const health = getNodeHealthColor(n.id, nodeStatsMap);
    const color = health || base;
    updates.push({
      id: n.id,
      color: {
        background: color + '33',
        border: color,
        highlight: { background: color + '55', border: color },
      },
      shadow: { enabled: true, color: color + '44', size: health ? 12 : 8 },
    });
  }
  networkNodes.update(updates);
}

// ─── Live Feed ──────────────────────────────────────────────────────────────
function setFilter(f) {
  activeFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  applyFilters();
}

function applyFilters() {
  nodeFilter = document.getElementById('node-filter').value;
  renderFeed();
}

function renderFeed() {
  let rows = [...allRequests];
  if (activeFilter !== 'all') rows = rows.filter(r => r.status === activeFilter);
  if (nodeFilter) {
    const def = NODE_DEFS.find(n => n.id === nodeFilter);
    if (def && def.step) {
      rows = rows.filter(r => {
        if (def.id === 'svc_claude' || def.id === 'ext_anthropic') {
          return r.steps.some(s => s.step.startsWith('claude_') || s.step === 'prompt_generator');
        }
        if (def.id === 'svc_img' || def.id === 'ext_gemini') {
          return r.steps.some(s => s.step.startsWith('nanobanana_'));
        }
        return r.steps.some(s => s.step === def.step);
      });
    }
  }

  const tbody = document.getElementById('feed-tbody');
  tbody.innerHTML = rows.slice(0, 20).map(r => renderRow(r)).join('');
}

function renderRow(r) {
  const stepPills = r.steps.map(s =>
    '<span class="step-pill ' + s.status + '">' + escHtml(shortStep(s.step)) + '</span>'
  ).join('');
  const expanded = expandedTraces.has(r.traceId);
  const detail = expanded ? renderTraceDetail(r) : '';
  const dur = r.totalDuration != null ? r.totalDuration + 'ms' : r.status === 'in-progress' ? '<span style="color:var(--yellow)">…</span>' : '—';
  const ts = new Date(r.startTime).toLocaleTimeString();
  return '<tr class="clickable" onclick="toggleTrace(\'' + r.traceId + '\')">'
    + '<td>' + ts + '</td>'
    + '<td style="max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(r.userId || '—') + '</td>'
    + '<td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(r.method + ' ' + r.path) + '</td>'
    + '<td><div class="step-pills">' + (stepPills || '<span style="color:var(--muted)">—</span>') + '</div>'
    + (detail ? '<div class="trace-detail">' + detail + '</div>' : '') + '</td>'
    + '<td><span class="status-badge ' + r.status + '">' + r.status.replace('-',' ') + '</span></td>'
    + '<td>' + dur + '</td>'
    + '</tr>';
}

function renderTraceDetail(r) {
  return r.steps.map(s => {
    const icon = s.status === 'completed' ? '✓' : s.status === 'failed' ? '✗' : '●';
    return '<div class="trace-step">'
      + '<div class="step-icon ' + s.status + '">' + icon + '</div>'
      + '<div class="step-info">'
      + '<div class="step-name">' + escHtml(s.step) + '</div>'
      + '<div class="step-meta">' + (s.duration_ms > 0 ? s.duration_ms + 'ms' : '') + '</div>'
      + (s.error ? '<div class="step-error">' + escHtml(s.error.slice(0, 200)) + '</div>' : '')
      + '</div></div>';
  }).join('');
}

function toggleTrace(traceId) {
  if (expandedTraces.has(traceId)) expandedTraces.delete(traceId);
  else expandedTraces.add(traceId);
  renderFeed();
}

function shortStep(step) {
  const map = {
    claude_question_gen: 'Q-Gen', claude_plan_gen: 'Plan', claude_prompt_gen: 'Prompt',
    claude_chat: 'Chat', claude_regen_slide: 'Regen', claude_suggest_title: 'Title',
    claude_new_slides: 'NewSlides', prompt_generator: 'PromptGen', full_flow: 'FullFlow',
  };
  if (step in map) return map[step];
  if (step.startsWith('nanobanana_slide_')) return 'Slide ' + step.split('_').pop();
  return step.slice(0, 10);
}

// ─── Errors ─────────────────────────────────────────────────────────────────
function renderErrors(errors) {
  const container = document.getElementById('errors-container');
  if (!errors || errors.length === 0) {
    container.innerHTML = '<div class="empty">No errors in the last hour ✓</div>';
    return;
  }
  container.innerHTML = errors.map(g => {
    const failures = g.failures.slice(0, 5).map(f =>
      '<div class="error-entry">'
      + '<div class="err-msg">' + escHtml(f.error || 'Unknown error') + '</div>'
      + '<div class="err-meta">' + new Date(f.timestamp).toLocaleTimeString() + ' · ' + escHtml(f.path || '') + (f.userId ? ' · ' + escHtml(f.userId) : '') + '</div>'
      + '</div>'
    ).join('');
    return '<div class="error-group">'
      + '<h3>' + escHtml(g.step) + ' <span class="count-badge">' + g.count + ' failures</span></h3>'
      + failures
      + '</div>';
  }).join('');
}

// ─── DB Stats ───────────────────────────────────────────────────────────────
function renderDB(dbStats, snap) {
  const grid = document.getElementById('db-grid');
  grid.innerHTML = Object.entries(dbStats).map(([t, n]) =>
    '<div class="db-card"><div class="n">' + n.toLocaleString() + '</div><div class="label">' + t + '</div></div>'
  ).join('');

  const sec = document.getElementById('metrics-section');
  if (!snap) { sec.innerHTML = ''; return; }
  sec.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px">'
    + metricCard('Uptime', snap.uptimeHuman || '—')
    + metricCard('Total Requests', (snap.http?.totalRequests || 0).toLocaleString())
    + metricCard('HTTP Errors', (snap.http?.totalErrors || 0).toLocaleString())
    + metricCard('AI Calls', (snap.ai?.totalCalls || 0).toLocaleString())
    + metricCard('Input Tokens', (snap.ai?.totalInputTokens || 0).toLocaleString())
    + metricCard('Output Tokens', (snap.ai?.totalOutputTokens || 0).toLocaleString())
    + '</div>';
}

function metricCard(label, value) {
  return '<div class="db-card"><div class="n" style="font-size:18px">' + value + '</div><div class="label">' + label + '</div></div>';
}

// ─── Node filter select population ─────────────────────────────────────────
function populateNodeFilter() {
  const sel = document.getElementById('node-filter');
  const groups = ['service', 'route', 'external'];
  sel.innerHTML = '<option value="">All nodes</option>'
    + NODE_DEFS.filter(n => groups.includes(n.group)).map(n =>
      '<option value="' + n.id + '">' + n.label.replace(/\\n/g, ' ') + '</option>'
    ).join('');
}

// ─── Data refresh ────────────────────────────────────────────────────────────
async function fetchData() {
  try {
    const r = await fetch(API('/api/data'));
    if (!r.ok) return;
    const data = await r.json();

    allRequests = data.requests || [];
    nodeStatsMap = {};
    for (const s of (data.nodeStats || [])) nodeStatsMap[s.step] = s;

    renderFeed();
    renderErrors(data.errors);
    renderDB(data.dbStats || {}, data.metrics);
    updateNodeColors();
    if (selectedNode) showNodeDetail(selectedNode);

    document.getElementById('last-update').textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    document.getElementById('last-update').textContent = 'Connection error';
  }
}

// ─── SSE for real-time feed ──────────────────────────────────────────────────
function connectSSE() {
  const es = new EventSource(API('/api/events'));
  es.onmessage = (e) => {
    try {
      const trace = JSON.parse(e.data);
      const idx = allRequests.findIndex(r => r.traceId === trace.traceId);
      if (idx >= 0) allRequests[idx] = trace;
      else allRequests.unshift(trace);
      if (allRequests.length > 100) allRequests = allRequests.slice(0, 100);
      // Update node stats from tracer push (partial, just re-fetch on interval for full stats)
      renderFeed();
      document.getElementById('last-update').textContent = 'Live · ' + new Date().toLocaleTimeString();
    } catch {}
  };
  es.onerror = () => {
    document.getElementById('live-dot').style.background = 'var(--red)';
    setTimeout(connectSSE, 5000);
    es.close();
  };
  es.onopen = () => { document.getElementById('live-dot').style.background = 'var(--green)'; };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Init ─────────────────────────────────────────────────────────────────────
initNetwork();
populateNodeFilter();
fetchData();
connectSSE();
setInterval(fetchData, 10000); // full refresh every 10s for stats
</script>
</body>
</html>`;
}

export default router;
