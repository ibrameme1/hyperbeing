import { Router } from 'express';
import { tracer } from '../services/tracer.js';
import { getDb } from '../database.js';
import { metrics } from '../services/metrics.js';

const router = Router();

function requireAdminToken(req, res, next) {
  const token = req.query.token || req.headers['x-admin-token'];
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).send(`<!DOCTYPE html><html><body style="font-family:monospace;background:#0a0a0a;color:#ff4444;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><h1>401 — Unauthorized</h1><p style="margin-left:16px">Set ADMIN_TOKEN env var and pass ?token= in the URL</p></body></html>`);
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
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (trace) => {
    try { res.write(`data: ${JSON.stringify(trace)}\n\n`); } catch {}
  };

  // Catch-up: send last 5 requests
  const recent = tracer.getRequests().slice(0, 5).reverse();
  for (const t of recent) send(t);

  const unsub = tracer.subscribe(send);
  const heartbeat = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 25000);

  req.on('close', () => { unsub(); clearInterval(heartbeat); });
});

// ─── Dashboard HTML ─────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  const token = req.query.token || req.headers['x-admin-token'] || '';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getDashboardHTML(token));
});

function escAttr(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function getDashboardHTML(token) {
  const t = escAttr(token);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>HyperBeing Monitor</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0a0a0f;--bg2:#111118;--bg3:#1a1a24;--border:#2a2a3a;
  --text:#e2e2f0;--muted:#6b6b8a;--accent:#7c6fff;
  --green:#22c55e;--yellow:#eab308;--red:#ef4444;--blue:#3b82f6;
  --purple:#a855f7;--teal:#14b8a6;--orange:#f97316;--amber:#f59e0b;
}
body{background:var(--bg);color:var(--text);font-family:system-ui,sans-serif;font-size:13px;height:100vh;display:flex;flex-direction:column;overflow:hidden}
header{background:var(--bg2);border-bottom:1px solid var(--border);padding:10px 18px;display:flex;align-items:center;gap:12px;flex-shrink:0;z-index:100}
.logo{font-weight:800;font-size:15px;background:linear-gradient(135deg,#7c6fff,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.badge{background:var(--bg3);border:1px solid var(--border);border-radius:5px;padding:2px 7px;font-size:11px;color:var(--muted)}
#status-dot{width:8px;height:8px;border-radius:50%;background:var(--yellow);flex-shrink:0;transition:background .3s}
#status-dot.live{background:var(--green);animation:pulse 2s infinite}
#status-dot.error{background:var(--red)}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
#last-update{color:var(--muted);font-size:11px;margin-left:2px}
.tabs{display:flex;gap:2px;background:var(--bg3);border-radius:7px;padding:3px;margin-left:auto}
.tab{padding:5px 13px;border-radius:5px;cursor:pointer;font-weight:500;font-size:12px;color:var(--muted);border:none;background:none;transition:all .15s}
.tab.active{background:var(--accent);color:#fff}
.tab:hover:not(.active){color:var(--text)}

/* panels */
.panel{display:none;flex:1;overflow:hidden;flex-direction:column;gap:10px;padding:14px 18px}
.panel.active{display:flex}

/* Architecture */
#arch-panel{flex-direction:row;gap:0;padding:0}
#arch-main{flex:1;overflow-x:auto;overflow-y:auto;padding:14px}
.arch-grid{display:flex;gap:12px;align-items:flex-start;min-width:fit-content}
.arch-col{display:flex;flex-direction:column;gap:6px;min-width:140px}
.arch-col-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:4px 8px;border-radius:4px;text-align:center;margin-bottom:2px}
.node-card{border:1px solid;border-radius:7px;padding:7px 10px;cursor:pointer;transition:all .15s;position:relative;font-size:11px;line-height:1.4}
.node-card:hover{filter:brightness(1.2);transform:translateY(-1px)}
.node-card.selected{box-shadow:0 0 0 2px var(--accent)}
.node-name{font-weight:600;font-size:11px}
.node-sub{font-size:10px;opacity:.7;margin-top:1px}
.node-stats{font-size:10px;margin-top:4px;display:flex;gap:6px;flex-wrap:wrap}
.node-stat{background:rgba(0,0,0,.3);padding:1px 5px;border-radius:3px}
.node-stat.err{color:var(--red)}
.node-stat.ok{color:var(--green)}
.node-stat.slow{color:var(--yellow)}

#arch-sidebar{width:260px;background:var(--bg2);border-left:1px solid var(--border);padding:14px;overflow-y:auto;flex-shrink:0}
.legend{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}
.legend-item{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--muted)}
.legend-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
.detail-box{background:var(--bg3);border:1px solid var(--border);border-radius:7px;padding:11px;margin-top:10px}
.detail-box h3{font-size:12px;font-weight:600;margin-bottom:8px}
.drow{display:flex;justify-content:space-between;font-size:11px;padding:3px 0;border-bottom:1px solid var(--border)}
.drow:last-child{border-bottom:none}
.dval{font-weight:500}
.derr{color:var(--red)}

/* Feed */
.feed-top{display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
.filter-bar{display:flex;gap:6px;align-items:center}
.fbtn{padding:3px 9px;border-radius:5px;border:1px solid var(--border);background:none;color:var(--muted);cursor:pointer;font-size:11px;transition:all .15s}
.fbtn.active{border-color:var(--accent);color:var(--accent)}
select{background:var(--bg3);border:1px solid var(--border);color:var(--text);border-radius:5px;padding:3px 7px;font-size:11px}
.table-wrap{overflow-y:auto;flex:1;border:1px solid var(--border);border-radius:7px}
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:7px 9px;color:var(--muted);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--bg2);z-index:5}
td{padding:6px 9px;border-bottom:1px solid var(--border);vertical-align:top;font-size:11px}
tr.clickable{cursor:pointer}
tr.clickable:hover td{background:var(--bg3)}
.sbadge{display:inline-flex;align-items:center;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:700;text-transform:uppercase}
.sbadge.in-progress{background:rgba(59,130,246,.15);color:var(--blue)}
.sbadge.completed{background:rgba(34,197,94,.1);color:var(--green)}
.sbadge.failed{background:rgba(239,68,68,.12);color:var(--red)}
.pills{display:flex;flex-wrap:wrap;gap:2px}
.pill{padding:1px 5px;border-radius:3px;font-size:10px;background:var(--bg3);border:1px solid var(--border);color:var(--muted)}
.pill.completed{border-color:#22c55e40;color:var(--green)}
.pill.failed{border-color:#ef444440;color:var(--red)}
.pill.started{border-color:#eab30840;color:var(--yellow)}
.trace-detail{background:var(--bg3);border-radius:5px;padding:8px;margin-top:4px;display:flex;flex-direction:column;gap:4px}
.tstep{display:flex;align-items:flex-start;gap:6px;padding:4px 0;border-bottom:1px solid var(--border)}
.tstep:last-child{border-bottom:none}
.tico{width:14px;height:14px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:8px;flex-shrink:0;margin-top:1px}
.tico.completed{background:rgba(34,197,94,.2);color:var(--green)}
.tico.failed{background:rgba(239,68,68,.2);color:var(--red)}
.tico.started{background:rgba(234,179,8,.2);color:var(--yellow)}
.tname{font-weight:500;font-size:11px}
.tmeta{font-size:10px;color:var(--muted)}
.terr{font-size:10px;color:var(--red);font-family:monospace;background:rgba(239,68,68,.06);padding:3px 5px;border-radius:3px;margin-top:2px;word-break:break-all}
.empty{color:var(--muted);padding:20px;text-align:center;font-size:12px}

/* Errors */
.errors-list{overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:8px}
.egroup{background:var(--bg2);border:1px solid var(--border);border-radius:7px;padding:12px}
.egroup h3{font-size:12px;font-weight:600;display:flex;align-items:center;gap:7px;margin-bottom:7px}
.ecnt{background:rgba(239,68,68,.15);color:var(--red);border-radius:3px;padding:1px 5px;font-size:10px}
.eentry{font-size:11px;padding:4px 7px;background:var(--bg3);border-radius:4px;border-left:2px solid var(--red);margin-bottom:4px}
.emsg{color:var(--text);font-family:monospace;word-break:break-all}
.emeta{color:var(--muted);font-size:10px;margin-top:2px}

/* DB / Metrics */
.db-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
.dcard{background:var(--bg2);border:1px solid var(--border);border-radius:7px;padding:10px;text-align:center}
.dcard .n{font-size:20px;font-weight:700;color:var(--accent)}
.dcard .lbl{font-size:10px;color:var(--muted);margin-top:2px}
h2{font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px}
.section-title{font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;flex-shrink:0}
@keyframes fadeIn{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}
.new-row{animation:fadeIn .3s ease}
</style>
</head>
<body>
<header>
  <span class="logo">HyperBeing</span>
  <span class="badge">System Monitor</span>
  <div id="status-dot"></div>
  <span id="last-update">connecting…</span>
  <div class="tabs">
    <button class="tab active" data-tab="arch">Architecture</button>
    <button class="tab" data-tab="feed">Live Feed</button>
    <button class="tab" data-tab="errors">Errors</button>
    <button class="tab" data-tab="db">Database</button>
  </div>
</header>

<!-- ARCHITECTURE -->
<div id="arch-panel" class="panel active">
  <div id="arch-main">
    <div class="arch-grid" id="arch-grid"></div>
  </div>
  <div id="arch-sidebar">
    <div class="legend">
      <div class="legend-item"><div class="legend-dot" style="background:#a855f7"></div>Frontend Pages</div>
      <div class="legend-item"><div class="legend-dot" style="background:#3b82f6"></div>Backend Routes</div>
      <div class="legend-item"><div class="legend-dot" style="background:#6b7280"></div>Middleware</div>
      <div class="legend-item"><div class="legend-dot" style="background:#14b8a6"></div>Services</div>
      <div class="legend-item"><div class="legend-dot" style="background:#f59e0b"></div>Database Tables</div>
      <div class="legend-item"><div class="legend-dot" style="background:#f97316"></div>External Services</div>
    </div>
    <hr style="border-color:var(--border);margin-bottom:10px">
    <div class="legend">
      <div class="legend-item"><div class="legend-dot" style="background:#22c55e"></div>Healthy (no errors 5min)</div>
      <div class="legend-item"><div class="legend-dot" style="background:#eab308"></div>Slow (avg &gt;5s)</div>
      <div class="legend-item"><div class="legend-dot" style="background:#ef4444"></div>Has errors (5min)</div>
      <div class="legend-item"><div class="legend-dot" style="background:#374151"></div>No activity yet</div>
    </div>
    <div id="node-detail"></div>
  </div>
</div>

<!-- LIVE FEED -->
<div id="feed-panel" class="panel">
  <div class="feed-top">
    <span class="section-title">Live Request Feed</span>
    <div class="filter-bar">
      <button class="fbtn active" data-filter="all">All</button>
      <button class="fbtn" data-filter="in-progress">In Progress</button>
      <button class="fbtn" data-filter="failed">Failed</button>
      <select id="node-filter"><option value="">All nodes</option></select>
    </div>
  </div>
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th>Time</th><th>User</th><th>Path</th><th>Steps</th><th>Status</th><th>Duration</th>
      </tr></thead>
      <tbody id="feed-tbody"><tr><td colspan="6" class="empty">Waiting for requests…</td></tr></tbody>
    </table>
  </div>
</div>

<!-- ERRORS -->
<div id="errors-panel" class="panel">
  <span class="section-title">Error Inspector — last hour</span>
  <div class="errors-list" id="errors-list">
    <div class="empty">No errors in the last hour ✓</div>
  </div>
</div>

<!-- DATABASE -->
<div id="db-panel" class="panel">
  <span class="section-title">Database — Row Counts</span>
  <div class="db-grid" id="db-grid"></div>
  <br>
  <span class="section-title">Service Metrics (since restart)</span>
  <div class="db-grid" id="metrics-grid" style="margin-top:8px"></div>
  <br>
  <span class="section-title">AI Function Stats</span>
  <div class="table-wrap" style="max-height:300px;margin-top:8px">
    <table>
      <thead><tr><th>Function</th><th>Calls</th><th>Errors</th><th>Avg ms</th><th>Avg Tokens</th></tr></thead>
      <tbody id="ai-tbody"></tbody>
    </table>
  </div>
</div>

<script>
const TOKEN = '${t}';
const api = p => '/admin' + p + (p.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(TOKEN);

// ── System node definitions ──────────────────────────────────────────────────
const LAYERS = [
  {
    id: 'frontend', label: 'Frontend Pages', color: '#a855f7',
    nodes: [
      {id:'fe_home',     name:'Homepage',         sub:'/'},
      {id:'fe_login',    name:'Login',            sub:'/login'},
      {id:'fe_dashboard',name:'Dashboard',        sub:'/dashboard'},
      {id:'fe_pres',     name:'Presentation',     sub:'/presentations/:id'},
      {id:'fe_prompt',   name:'Prompt Generator', sub:'/prompt-generator'},
      {id:'fe_onboard',  name:'Onboarding',       sub:'/onboarding'},
      {id:'fe_pricing',  name:'Pricing',          sub:'/pricing'},
      {id:'fe_profile',  name:'Profile',          sub:'/profile'},
      {id:'fe_billing',  name:'Billing Success',  sub:'/billing/success'},
      {id:'fe_callback', name:'Auth Callback',    sub:'/auth/callback'},
      {id:'fe_analytics',name:'Analytics',        sub:'/analytics (admin)'},
    ]
  },
  {
    id: 'routes', label: 'Backend Routes', color: '#3b82f6',
    nodes: [
      {id:'rt_auth',     name:'/api/auth',          sub:'login · register · OAuth · profile', step:'route_auth'},
      {id:'rt_pres',     name:'/api/presentations', sub:'create · analyze · chat · generate', step:'route_presentations'},
      {id:'rt_billing',  name:'/api/billing',       sub:'subscription · checkout · webhook',  step:'route_billing'},
      {id:'rt_analytics',name:'/api/analytics',     sub:'overview · events · live SSE',       step:'route_analytics'},
      {id:'rt_admin',    name:'/api/admin',         sub:'logs · metrics · grants',             step:'route_admin'},
      {id:'rt_prompt',   name:'/api/prompt-chat',   sub:'chat session · reset',               step:'route_prompt_chat'},
    ]
  },
  {
    id: 'middleware', label: 'Middleware', color: '#6b7280',
    nodes: [
      {id:'mw_logger',   name:'requestLogger',   sub:'trace ID · metrics · timing'},
      {id:'mw_auth',     name:'authenticateToken',sub:'JWT verify · user lookup'},
      {id:'mw_rate',     name:'rateLimits',       sub:'per-route limits · backoff'},
      {id:'mw_validate', name:'validate',         sub:'schema validation'},
    ]
  },
  {
    id: 'services', label: 'Services', color: '#14b8a6',
    nodes: [
      {id:'svc_claude',  name:'claudeAgent',      sub:'chat · plan · prompts · regen',      steps:['claude_chat','claude_plan_gen','claude_prompt_gen','claude_question_gen','claude_regen_slide','claude_suggest_title','claude_new_slides']},
      {id:'svc_img',     name:'imageGeneration',  sub:'Gemini Flash slide images',          steps:['nanobanana_slide_']},
      {id:'svc_prompt',  name:'promptGenerator',  sub:'multi-turn prompt refinement',       steps:['prompt_generator']},
      {id:'svc_stripe',  name:'stripeService',    sub:'credits · subscriptions · billing'},
      {id:'svc_logger',  name:'logger',           sub:'structured logs → SQLite'},
      {id:'svc_metrics', name:'metrics',          sub:'HTTP + AI call stats'},
      {id:'svc_posthog', name:'posthogClient',    sub:'error tracking'},
    ]
  },
  {
    id: 'database', label: 'Database', color: '#f59e0b',
    nodes: [
      {id:'db_users',     name:'users',              sub:'id · email · oauth_ids · avatar'},
      {id:'db_pres',      name:'presentations',      sub:'id · user_id · slides · status'},
      {id:'db_messages',  name:'messages',           sub:'presentation_id · role · content'},
      {id:'db_sessions',  name:'prompt_sessions',    sub:'user_id · history'},
      {id:'db_subs',      name:'subscriptions',      sub:'plan · credits · stripe_ids'},
      {id:'db_credits',   name:'credit_transactions',sub:'user_id · amount · type'},
      {id:'db_logs',      name:'app_logs',           sub:'level · message · context'},
      {id:'db_analytics', name:'analytics_events',   sub:'event_type · user_id · metadata'},
    ]
  },
  {
    id: 'external', label: 'External Services', color: '#f97316',
    nodes: [
      {id:'ext_anthropic',name:'Anthropic API',  sub:'claude-sonnet-4-6 · messages.create'},
      {id:'ext_gemini',   name:'Google Gemini',  sub:'gemini-3.1-flash-image-preview'},
      {id:'ext_stripe',   name:'Stripe API',     sub:'subscriptions · checkout · webhooks'},
      {id:'ext_posthog',  name:'PostHog',        sub:'event capture · error tracking'},
      {id:'ext_goauth',   name:'Google OAuth',   sub:'passport · profile · email'},
      {id:'ext_metaauth', name:'Meta OAuth',     sub:'passport · facebook strategy'},
      {id:'ext_tiktok',   name:'TikTok OAuth',   sub:'custom · open.tiktokapis.com'},
    ]
  },
];

// ── State ────────────────────────────────────────────────────────────────────
let allRequests = [];
let nodeStatsMap = {};
let activeFilter = 'all';
let nodeFilterId = '';
let expandedTraces = new Set();
let selectedNodeId = null;

// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById(tab + '-panel').classList.add('active');
    btn.classList.add('active');
  });
});

// ── Architecture grid ─────────────────────────────────────────────────────────
function buildArchGrid() {
  const grid = document.getElementById('arch-grid');
  grid.innerHTML = LAYERS.map(layer => {
    const colLabel = \`<div class="arch-col-label" style="background:\${layer.color}22;color:\${layer.color};border:1px solid \${layer.color}44">\${layer.label}</div>\`;
    const cards = layer.nodes.map(n => \`<div class="node-card" id="nc_\${n.id}"
      style="background:\${layer.color}11;border-color:\${layer.color}44;color:\${layer.color}"
      data-node="\${n.id}" onclick="selectNode('\${n.id}')">
      <div class="node-name">\${esc(n.name)}</div>
      <div class="node-sub" style="color:\${layer.color}99">\${esc(n.sub)}</div>
      <div class="node-stats" id="ns_\${n.id}"></div>
    </div>\`).join('');
    return \`<div class="arch-col">\${colLabel}\${cards}</div>\`;
  }).join('');

  // Populate node filter select
  const sel = document.getElementById('node-filter');
  sel.innerHTML = '<option value="">All nodes</option>';
  LAYERS.forEach(layer => {
    if (['services','routes','external'].includes(layer.id)) {
      layer.nodes.forEach(n => {
        const opt = document.createElement('option');
        opt.value = n.id; opt.textContent = n.name;
        sel.appendChild(opt);
      });
    }
  });
  sel.onchange = () => { nodeFilterId = sel.value; renderFeed(); };
}

function getNodeSteps(node) {
  if (node.steps) return node.steps;
  if (node.step) return [node.step];
  return [];
}

function matchNodeStats(nodeSteps, statsMap) {
  let count = 0, totalMs = 0, errors = 0, lastError = null;
  Object.entries(statsMap).forEach(([step, s]) => {
    const match = nodeSteps.some(ns => step.startsWith(ns));
    if (!match) return;
    count += s.count;
    if (s.avgMs && s.count) totalMs += s.avgMs * s.count;
    errors += s.errors;
    if (s.lastError && !lastError) lastError = s.lastError;
  });
  const avgMs = count > 0 ? Math.round(totalMs / count) : 0;
  return {count, avgMs, errors, lastError};
}

function updateNodeColors() {
  LAYERS.forEach(layer => {
    layer.nodes.forEach(n => {
      const card = document.getElementById('nc_' + n.id);
      const statsEl = document.getElementById('ns_' + n.id);
      if (!card) return;
      const steps = getNodeSteps(n);
      if (steps.length === 0) { statsEl.innerHTML = ''; return; }
      const {count, avgMs, errors, lastError} = matchNodeStats(steps, nodeStatsMap);
      let healthColor = layer.color; // default = no activity
      let statsHtml = '';
      if (count > 0) {
        if (errors > 0) healthColor = '#ef4444';
        else if (avgMs > 5000) healthColor = '#eab308';
        else healthColor = '#22c55e';
        statsHtml = \`<span class="node-stat \${errors>0?'err':avgMs>5000?'slow':'ok'}">\${count} req</span><span class="node-stat">\${avgMs}ms avg</span>\`;
        if (errors > 0) statsHtml += \`<span class="node-stat err">\${errors} err</span>\`;
      }
      card.style.borderColor = healthColor + '80';
      card.style.boxShadow = count > 0 ? \`0 0 10px \${healthColor}20\` : '';
      statsEl.innerHTML = statsHtml;

      if (selectedNodeId === n.id) showNodeDetail(n.id);
    });
  });
}

function selectNode(nodeId) {
  if (selectedNodeId === nodeId) {
    selectedNodeId = null;
    nodeFilterId = '';
    document.getElementById('node-filter').value = '';
    document.querySelectorAll('.node-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('node-detail').innerHTML = '';
    renderFeed();
    return;
  }
  selectedNodeId = nodeId;
  document.querySelectorAll('.node-card').forEach(c => c.classList.remove('selected'));
  const card = document.getElementById('nc_' + nodeId);
  if (card) card.classList.add('selected');
  nodeFilterId = nodeId;
  document.getElementById('node-filter').value = nodeId;
  showNodeDetail(nodeId);
  renderFeed();
  // Switch to feed tab
  document.querySelectorAll('.tab').forEach(t => { if(t.dataset.tab==='feed') t.click(); });
}

function findNode(id) {
  for (const layer of LAYERS) {
    const n = layer.nodes.find(n => n.id === id);
    if (n) return {node:n, layer};
  }
  return null;
}

function showNodeDetail(nodeId) {
  const found = findNode(nodeId);
  if (!found) return;
  const {node, layer} = found;
  const steps = getNodeSteps(node);
  const {count, avgMs, errors, lastError} = steps.length ? matchNodeStats(steps, nodeStatsMap) : {};

  let html = \`<div class="detail-box">
    <h3 style="color:\${layer.color}">\${esc(node.name)}</h3>
    <div class="drow"><span>Layer</span><span class="dval" style="color:\${layer.color}">\${layer.label}</span></div>\`;
  if (steps.length > 0 && count !== undefined) {
    html += \`<div class="drow"><span>Requests (5min)</span><span class="dval">\${count}</span></div>\`;
    html += \`<div class="drow"><span>Avg latency</span><span class="dval">\${avgMs}ms</span></div>\`;
    html += \`<div class="drow"><span>Errors</span><span class="dval \${errors>0?'derr':''}">\${errors}</span></div>\`;
    if (lastError) html += \`<div class="drow" style="flex-direction:column;gap:3px"><span>Last error</span><span class="dval derr" style="font-size:10px;font-family:monospace;word-break:break-all">\${esc(lastError.slice(0,150))}</span></div>\`;
  } else {
    html += '<div style="color:var(--muted);font-size:11px;margin-top:6px">No traced activity yet</div>';
  }
  html += '</div>';
  document.getElementById('node-detail').innerHTML = html;
}

// ── Feed ─────────────────────────────────────────────────────────────────────
document.querySelectorAll('.fbtn').forEach(btn => {
  btn.addEventListener('click', () => {
    activeFilter = btn.dataset.filter;
    document.querySelectorAll('.fbtn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderFeed();
  });
});

function nodeMatchesRequest(nodeId, req) {
  const found = findNode(nodeId);
  if (!found) return true;
  const {node} = found;
  const steps = getNodeSteps(node);
  if (steps.length === 0) return false;
  return req.steps.some(s => steps.some(ns => s.step.startsWith(ns)));
}

function renderFeed() {
  let rows = [...allRequests];
  if (activeFilter !== 'all') rows = rows.filter(r => r.status === activeFilter);
  if (nodeFilterId) rows = rows.filter(r => nodeMatchesRequest(nodeFilterId, r));

  const tbody = document.getElementById('feed-tbody');
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">No matching requests</td></tr>';
    return;
  }
  tbody.innerHTML = rows.slice(0,20).map(r => renderRow(r)).join('');
}

function renderRow(r) {
  const pills = r.steps.map(s =>
    \`<span class="pill \${s.status}">\${esc(shortStep(s.step))}</span>\`
  ).join('');
  const expanded = expandedTraces.has(r.traceId);
  const detail = expanded ? renderDetail(r) : '';
  const dur = r.totalDuration != null ? r.totalDuration+'ms' : r.status==='in-progress' ? '<span style="color:var(--yellow)">…</span>' : '—';
  const ts = new Date(r.startTime).toLocaleTimeString();
  const userId = r.userId ? r.userId.slice(0,12) : '—';
  const path = (r.method||'') + ' ' + (r.path||'');
  return \`<tr class="clickable" onclick="toggleTrace('\${r.traceId}')">
    <td>\${ts}</td>
    <td style="max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:monospace">\${esc(userId)}</td>
    <td style="max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted)">\${esc(path)}</td>
    <td><div class="pills">\${pills||'<span class="pill">—</span>'}</div>\${detail}</td>
    <td><span class="sbadge \${r.status}">\${r.status.replace('-',' ')}</span></td>
    <td>\${dur}</td>
  </tr>\`;
}

function renderDetail(r) {
  const steps = r.steps.map(s => {
    const icon = s.status==='completed'?'✓':s.status==='failed'?'✗':'●';
    return \`<div class="tstep">
      <div class="tico \${s.status}">\${icon}</div>
      <div style="flex:1">
        <div class="tname">\${esc(s.step)}</div>
        <div class="tmeta">\${s.duration_ms>0?s.duration_ms+'ms':''}</div>
        \${s.error?\`<div class="terr">\${esc(s.error.slice(0,200))}</div>\`:''}
      </div>
    </div>\`;
  }).join('');
  return \`<div class="trace-detail">\${steps||'<div class="tmeta">No steps recorded</div>'}</div>\`;
}

function toggleTrace(id) {
  if (expandedTraces.has(id)) expandedTraces.delete(id);
  else expandedTraces.add(id);
  renderFeed();
}

function shortStep(step) {
  const m = {claude_question_gen:'Q-Gen',claude_plan_gen:'Plan',claude_prompt_gen:'Prompt',
    claude_chat:'Chat',claude_regen_slide:'Regen',claude_suggest_title:'Title',
    claude_new_slides:'NewSlides',prompt_generator:'PromptGen',full_flow:'FullFlow'};
  if (m[step]) return m[step];
  if (step.startsWith('nanobanana_slide_')) return 'Slide'+step.split('_').pop();
  return step.slice(0,10);
}

// ── Errors ────────────────────────────────────────────────────────────────────
function renderErrors(errors) {
  const el = document.getElementById('errors-list');
  if (!errors || !errors.length) {
    el.innerHTML = '<div class="empty">No errors in the last hour ✓</div>'; return;
  }
  el.innerHTML = errors.map(g => {
    const failures = g.failures.slice(0,5).map(f =>
      \`<div class="eentry">
        <div class="emsg">\${esc(f.error||'Unknown error')}</div>
        <div class="emeta">\${new Date(f.timestamp).toLocaleTimeString()} · \${esc(f.path||'')} \${f.userId?'· '+esc(f.userId.slice(0,10)):''}</div>
      </div>\`
    ).join('');
    return \`<div class="egroup">
      <h3>\${esc(g.step)} <span class="ecnt">\${g.count} failures</span></h3>
      \${failures}
    </div>\`;
  }).join('');
}

// ── DB / Metrics ───────────────────────────────────────────────────────────────
function renderDB(dbStats, snap) {
  const grid = document.getElementById('db-grid');
  grid.innerHTML = Object.entries(dbStats||{}).map(([t,n]) =>
    \`<div class="dcard"><div class="n">\${Number(n).toLocaleString()}</div><div class="lbl">\${t}</div></div>\`
  ).join('');

  const mg = document.getElementById('metrics-grid');
  if (snap) {
    mg.innerHTML = [
      ['Uptime', snap.uptimeHuman||'—'],
      ['Total Requests', (snap.http?.totalRequests||0).toLocaleString()],
      ['HTTP Errors', (snap.http?.totalErrors||0).toLocaleString()],
      ['AI Calls', (snap.ai?.totalCalls||0).toLocaleString()],
      ['Input Tokens', (snap.ai?.totalInputTokens||0).toLocaleString()],
      ['Output Tokens', (snap.ai?.totalOutputTokens||0).toLocaleString()],
      ['Avg AI Latency', (snap.ai?.avgLatencyMs||0)+'ms'],
    ].map(([l,v]) => \`<div class="dcard"><div class="n" style="font-size:16px">\${v}</div><div class="lbl">\${l}</div></div>\`).join('');

    const ai = snap.ai?.byFunction||[];
    const atbody = document.getElementById('ai-tbody');
    atbody.innerHTML = ai.length ? ai.map(f =>
      \`<tr><td>\${esc(f.fn)}</td><td>\${f.calls}</td><td>\${f.errors}</td><td>\${f.avgMs||0}ms</td><td>\${f.avgTokens||0}</td></tr>\`
    ).join('') : '<tr><td colspan="5" class="empty">No AI calls yet</td></tr>';
  }
}

// ── Data fetch ─────────────────────────────────────────────────────────────────
async function fetchData() {
  try {
    const r = await fetch(api('/api/data'), {signal: AbortSignal.timeout(8000)});
    if (!r.ok) {
      setStatus('error', 'HTTP ' + r.status);
      return;
    }
    const data = await r.json();
    allRequests = data.requests || [];
    nodeStatsMap = {};
    for (const s of (data.nodeStats||[])) nodeStatsMap[s.step] = s;
    renderFeed();
    renderErrors(data.errors);
    renderDB(data.dbStats||{}, data.metrics);
    updateNodeColors();
    setStatus('live', 'Updated ' + new Date().toLocaleTimeString());
  } catch(e) {
    setStatus('error', 'Fetch error: ' + e.message.slice(0,40));
  }
}

function setStatus(state, text) {
  const dot = document.getElementById('status-dot');
  dot.className = state==='live' ? 'live' : state==='error' ? 'error' : '';
  document.getElementById('last-update').textContent = text;
}

// ── SSE ────────────────────────────────────────────────────────────────────────
function connectSSE() {
  let es;
  try {
    es = new EventSource(api('/api/events'));
  } catch(e) { return; }

  es.onopen = () => setStatus('live', 'Live · ' + new Date().toLocaleTimeString());
  es.onerror = () => {
    setStatus('error', 'SSE disconnected — retrying…');
    es.close();
    setTimeout(connectSSE, 5000);
  };
  es.onmessage = (e) => {
    try {
      const trace = JSON.parse(e.data);
      const idx = allRequests.findIndex(r => r.traceId === trace.traceId);
      if (idx >= 0) allRequests[idx] = trace;
      else allRequests.unshift(trace);
      if (allRequests.length > 100) allRequests.length = 100;
      renderFeed();
      setStatus('live', 'Live · ' + new Date().toLocaleTimeString());
    } catch {}
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init ───────────────────────────────────────────────────────────────────────
buildArchGrid();
fetchData();
connectSSE();
setInterval(fetchData, 10000);
</script>
</body>
</html>`;
}

export default router;
