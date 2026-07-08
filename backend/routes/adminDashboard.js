import { Router } from 'express';
import { timingSafeEqual } from 'crypto';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { tracer } from '../services/tracer.js';
import { getDb } from '../database.js';
import { metrics } from '../services/metrics.js';

const router = Router();

// Constant-time comparison so token guesses can't be timed character by character.
function tokenMatches(supplied) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || typeof supplied !== 'string') return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Brute-force guard on the token check (30 attempts / 15 min per IP).
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req),
});

function requireAdminToken(req, res, next) {
  // Prefer the x-admin-token header; the ?token= query param is only kept for
  // the initial page load, and the dashboard immediately strips it from the
  // URL (history.replaceState) so it doesn't linger in history/referrers.
  const token = req.headers['x-admin-token'] || req.query.token;
  if (!tokenMatches(token)) {
    return res.status(401).send(`<!DOCTYPE html><html><body style="font-family:monospace;background:#0a0a0a;color:#ff4444;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><h1>401 — Unauthorized</h1></body></html>`);
  }
  next();
}

router.use(adminLimiter);
router.use(requireAdminToken);

router.get('/api/data', (req, res) => {
  const requests = tracer.getRequests().slice(0, 50);
  const nodeStats = tracer.getNodeStats(300_000);
  const errors = tracer.getRecentErrors(3_600_000);
  const snap = metrics.snapshot();
  let dbStats = {};
  try {
    const db = getDb();
    const tables = ['users','presentations','messages','prompt_sessions','subscriptions','credit_transactions','app_logs','analytics_events'];
    for (const t of tables) {
      try { dbStats[t] = db.prepare(`SELECT COUNT(*) as n FROM ${t}`).get()?.n ?? 0; } catch { dbStats[t] = 0; }
    }
  } catch {}
  res.json({ requests, nodeStats, errors, dbStats, metrics: snap });
});

router.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const send = (trace) => { try { res.write(`data: ${JSON.stringify(trace)}\n\n`); } catch {} };
  const recent = tracer.getRequests().slice(0, 5).reverse();
  for (const r of recent) send(r);
  const unsub = tracer.subscribe(send);
  const hb = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 25000);
  req.on('close', () => { unsub(); clearInterval(hb); });
});

router.get('/', (req, res) => {
  const token = req.query.token || req.headers['x-admin-token'] || '';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getDashboardHTML(token));
});

function e(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function getDashboardHTML(token) {
  const tok = e(token);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HyperBeing Monitor</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#0a0a0f;--bg2:#111118;--bg3:#1a1a24;--border:#2a2a3a;--text:#e2e2f0;--muted:#6b6b8a;--accent:#7c6fff;--green:#22c55e;--yellow:#eab308;--red:#ef4444;--blue:#3b82f6}
body{background:var(--bg);color:var(--text);font-family:system-ui,sans-serif;font-size:13px;height:100vh;display:flex;flex-direction:column;overflow:hidden}
header{background:var(--bg2);border-bottom:1px solid var(--border);padding:10px 18px;display:flex;align-items:center;gap:10px;flex-shrink:0}
.logo{font-weight:800;font-size:15px;background:linear-gradient(135deg,#7c6fff,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.badge{background:var(--bg3);border:1px solid var(--border);border-radius:5px;padding:2px 7px;font-size:11px;color:var(--muted)}
#sdot{width:8px;height:8px;border-radius:50%;background:var(--yellow);flex-shrink:0;transition:background .3s}
#sdot.live{background:var(--green);animation:pulse 2s infinite}
#sdot.err{background:var(--red)}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
#sup{color:var(--muted);font-size:11px}
.tabs{display:flex;gap:2px;background:var(--bg3);border-radius:7px;padding:3px;margin-left:auto}
.tab{padding:5px 13px;border-radius:5px;cursor:pointer;font-weight:500;font-size:12px;color:var(--muted);border:none;background:none;transition:all .15s}
.tab.active{background:var(--accent);color:#fff}
.tab:hover:not(.active){color:var(--text)}
.panel{display:none;flex:1;overflow:hidden}
.panel.active{display:flex;flex-direction:column}
#flow-panel{flex-direction:row}
#flow-canvas{flex:1;position:relative;overflow:hidden}
#flow-svg{width:100%;height:100%;display:block;background:var(--bg)}
#flow-sidebar{width:290px;border-left:1px solid var(--border);background:var(--bg2);overflow-y:auto;flex-shrink:0;padding:14px}
.legend{display:flex;flex-direction:column;gap:5px;margin-bottom:12px}
.li{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--muted)}
.ld{width:9px;height:9px;border-radius:50%;flex-shrink:0}
.detail-box{background:var(--bg3);border:1px solid var(--border);border-radius:7px;padding:11px;margin-top:10px}
.drow{display:flex;justify-content:space-between;font-size:11px;padding:3px 0;border-bottom:1px solid var(--border)}
.drow:last-child{border-bottom:none}
.dval{font-weight:500}
.derr{color:var(--red)}
.stitle{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin:10px 0 5px}
.tag{display:inline-block;border-radius:3px;padding:1px 5px;font-size:10px;margin:2px 2px 0 0}
#journeys-panel{overflow-y:auto}
.jcontent{padding:14px;max-width:1400px}
.jcard{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:13px;margin-bottom:10px}
.jlabel{font-weight:700;font-size:12px;margin-bottom:10px}
.jsteps{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.jstep{border-radius:6px;padding:5px 9px;min-width:80px;text-align:center;position:relative;cursor:default}
.jstep-name{font-size:10px;font-weight:600}
.jstep-grp{font-size:9px;opacity:.6}
.jarrow{color:var(--muted);font-size:14px;align-self:center;padding:0 2px}
.hring{width:8px;height:8px;border-radius:50%;position:absolute;top:-3px;right:-3px}
#traces-panel,.tfilters{flex-direction:column}
.tfilters{display:flex;flex-direction:row;justify-content:space-between;align-items:center;padding:10px 16px;flex-shrink:0}
.fbtn{padding:3px 9px;border-radius:5px;border:1px solid var(--border);background:none;color:var(--muted);cursor:pointer;font-size:11px}
.fbtn.active{border-color:var(--accent);color:var(--accent)}
.twrap{overflow-y:auto;flex:1;margin:0 16px 14px;border:1px solid var(--border);border-radius:7px}
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:7px 9px;color:var(--muted);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--bg2);z-index:5}
td{padding:6px 9px;border-bottom:1px solid var(--border);vertical-align:top;font-size:11px}
tr.cr{cursor:pointer}
tr.cr:hover td{background:var(--bg3)}
.sbadge{display:inline-flex;align-items:center;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:700;text-transform:uppercase}
.sbadge.in-progress{background:rgba(59,130,246,.15);color:var(--blue)}
.sbadge.completed{background:rgba(34,197,94,.1);color:var(--green)}
.sbadge.failed{background:rgba(239,68,68,.12);color:var(--red)}
.wfall{padding:8px 10px;background:var(--bg3)}
.wrow{display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--border)}
.wrow:last-child{border-bottom:none}
.wico{width:14px;height:14px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:8px;flex-shrink:0}
.wname{min-width:155px;font-size:11px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wbar{height:14px;border-radius:2px;min-width:2px;transition:width .3s}
.wms{font-size:10px;color:var(--muted);min-width:45px}
.werr{font-size:10px;color:var(--red);font-family:monospace;background:rgba(239,68,68,.07);padding:2px 5px;border-radius:3px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#errors-panel{flex-direction:column;padding:14px;overflow-y:auto;gap:8px}
.stitle2{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);flex-shrink:0}
.egroup{background:var(--bg2);border:1px solid var(--border);border-radius:7px;padding:12px}
.egroup h3{font-size:12px;font-weight:600;display:flex;align-items:center;gap:7px;margin-bottom:7px}
.ecnt{background:rgba(239,68,68,.15);color:var(--red);border-radius:3px;padding:1px 5px;font-size:10px}
.eentry{font-size:11px;padding:4px 7px;background:var(--bg3);border-radius:4px;border-left:2px solid var(--red);margin-bottom:4px}
#db-panel{flex-direction:column;padding:14px;overflow-y:auto;gap:14px}
.dgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px}
.dcard{background:var(--bg2);border:1px solid var(--border);border-radius:7px;padding:10px;text-align:center}
.dcard .n{font-size:20px;font-weight:700;color:var(--accent)}
.dcard .lbl{font-size:10px;color:var(--muted);margin-top:2px}
.empty{color:var(--muted);padding:20px;text-align:center;font-size:12px}
@keyframes fadeIn{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}
.nr{animation:fadeIn .25s ease}
</style>
</head>
<body>
<header>
  <span class="logo">HyperBeing</span>
  <span class="badge">Live Monitor</span>
  <div id="sdot"></div>
  <span id="sup">connecting…</span>
  <div class="tabs">
    <button class="tab active" data-tab="flow">Flow</button>
    <button class="tab" data-tab="journeys">Journeys</button>
    <button class="tab" data-tab="traces">Traces</button>
    <button class="tab" data-tab="errors">Errors</button>
    <button class="tab" data-tab="db">Database</button>
  </div>
</header>

<div id="flow-panel" class="panel active">
  <div id="flow-canvas">
    <svg id="flow-svg"></svg>
    <div id="flow-legend" style="position:absolute;bottom:12px;left:12px;background:rgba(10,10,15,.85);border:1px solid var(--border);border-radius:7px;padding:9px 12px;font-size:10px">
      <div style="font-weight:700;color:var(--muted);margin-bottom:5px;text-transform:uppercase;letter-spacing:.8px">Layers</div>
      <div class="legend">
        <div class="li"><div class="ld" style="background:#a855f7"></div>Frontend (11)</div>
        <div class="li"><div class="ld" style="background:#3b82f6"></div>Routes (6)</div>
        <div class="li"><div class="ld" style="background:#6b7280"></div>Middleware (4)</div>
        <div class="li"><div class="ld" style="background:#14b8a6"></div>Services (7)</div>
        <div class="li"><div class="ld" style="background:#f59e0b"></div>Database (8)</div>
        <div class="li"><div class="ld" style="background:#f97316"></div>External (7)</div>
      </div>
      <div style="font-weight:700;color:var(--muted);margin:7px 0 5px;text-transform:uppercase;letter-spacing:.8px">Health</div>
      <div class="legend">
        <div class="li"><div class="ld" style="background:#22c55e"></div>Healthy</div>
        <div class="li"><div class="ld" style="background:#eab308"></div>Slow (&gt;5s avg)</div>
        <div class="li"><div class="ld" style="background:#ef4444"></div>Errors</div>
        <div class="li"><div class="ld" style="background:#374151"></div>No activity</div>
      </div>
      <div style="color:var(--muted);margin-top:6px;font-style:italic">Scroll to zoom · Drag to pan · Click node</div>
    </div>
  </div>
  <div id="flow-sidebar">
    <div id="node-detail"><div class="empty" style="padding:30px 10px;font-size:11px;text-align:center;color:var(--muted)">Click any node<br>to inspect it</div></div>
  </div>
</div>

<div id="journeys-panel" class="panel">
  <div class="jcontent">
    <div class="stitle2" style="margin-bottom:12px">User Journey Map — 5 key flows</div>
    <div id="journeys-content"></div>
  </div>
</div>

<div id="traces-panel" class="panel">
  <div class="tfilters">
    <span class="stitle2">Live Trace Feed</span>
    <div style="display:flex;gap:5px">
      <button class="fbtn active" data-filter="all">All</button>
      <button class="fbtn" data-filter="in-progress">In Progress</button>
      <button class="fbtn" data-filter="failed">Failed</button>
    </div>
  </div>
  <div class="twrap">
    <table>
      <thead><tr><th>Time</th><th>User</th><th>Path</th><th>Steps</th><th>Status / ms</th></tr></thead>
      <tbody id="traces-tbody"><tr><td colspan="5" class="empty">Waiting for requests…</td></tr></tbody>
    </table>
  </div>
</div>

<div id="errors-panel" class="panel">
  <div class="stitle2">Error Inspector — last hour</div>
  <div id="errors-content"><div class="empty">No errors in the last hour ✓</div></div>
</div>

<div id="db-panel" class="panel">
  <div class="stitle2">Database Row Counts</div>
  <div class="dgrid" id="db-grid"></div>
  <div class="stitle2">Service Metrics (since restart)</div>
  <div class="dgrid" id="metrics-grid"></div>
  <div class="stitle2">AI Function Breakdown</div>
  <div style="border:1px solid var(--border);border-radius:7px;overflow:hidden;max-height:300px;overflow-y:auto">
    <table><thead><tr><th>Function</th><th>Calls</th><th>Errors</th><th>Avg ms</th><th>Avg Tokens</th></tr></thead>
    <tbody id="ai-tbody"></tbody></table>
  </div>
</div>

<script>
const TOKEN = '${tok}';
// Strip ?token= from the address bar immediately — it was only needed for the
// initial page load and shouldn't linger in history or get copy-pasted.
try { history.replaceState(null, '', location.pathname); } catch {}
// EventSource can't send headers, so /api/events keeps the query param;
// regular fetches send the token via the x-admin-token header instead.
const api = p => '/admin' + p + (p.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(TOKEN);
const authedFetch = (p, opts = {}) => fetch('/admin' + p, { ...opts, headers: { ...(opts.headers || {}), 'x-admin-token': TOKEN } });

// ── Node definitions ─────────────────────────────────────────────────────────
const GN = [
  {id:'fe_home',g:'frontend',l:'Homepage',s:'/',steps:[]},
  {id:'fe_login',g:'frontend',l:'Login',s:'/login',steps:[]},
  {id:'fe_dashboard',g:'frontend',l:'Dashboard',s:'/dashboard',steps:[]},
  {id:'fe_pres',g:'frontend',l:'Presentation',s:'/presentations/:id',steps:[]},
  {id:'fe_prompt',g:'frontend',l:'Prompt Generator',s:'/prompt-generator',steps:[]},
  {id:'fe_onboard',g:'frontend',l:'Onboarding',s:'/onboarding',steps:[]},
  {id:'fe_pricing',g:'frontend',l:'Pricing',s:'/pricing',steps:[]},
  {id:'fe_profile',g:'frontend',l:'Profile',s:'/profile',steps:[]},
  {id:'fe_billing',g:'frontend',l:'Billing Success',s:'/billing/success',steps:[]},
  {id:'fe_callback',g:'frontend',l:'Auth Callback',s:'/auth/callback',steps:[]},
  {id:'fe_analytics',g:'frontend',l:'Analytics',s:'/analytics (admin)',steps:[]},
  {id:'rt_auth',g:'routes',l:'/api/auth',s:'login · register · OAuth',steps:['route_auth']},
  {id:'rt_pres',g:'routes',l:'/api/presentations',s:'create · analyze · chat · SSE',steps:['full_flow']},
  {id:'rt_billing',g:'routes',l:'/api/billing',s:'subscription · checkout · webhook',steps:['route_billing']},
  {id:'rt_analytics',g:'routes',l:'/api/analytics',s:'overview · events · live',steps:['route_analytics']},
  {id:'rt_admin',g:'routes',l:'/api/admin',s:'logs · metrics · grants',steps:['route_admin']},
  {id:'rt_prompt',g:'routes',l:'/api/prompt-chat',s:'session · chat · reset',steps:['route_prompt_chat']},
  {id:'mw_logger',g:'middleware',l:'requestLogger',s:'trace ID · timing · metrics',steps:[]},
  {id:'mw_auth',g:'middleware',l:'authenticateToken',s:'JWT verify · user lookup',steps:[]},
  {id:'mw_rate',g:'middleware',l:'rateLimits',s:'per-route IP limits',steps:[]},
  {id:'mw_validate',g:'middleware',l:'validate',s:'Zod schema checks',steps:[]},
  {id:'svc_claude',g:'services',l:'claudeAgent',s:'chat · plan · prompts · regen',steps:['claude_chat','claude_plan_gen','claude_prompt_gen','claude_question_gen','claude_regen_slide','claude_suggest_title','claude_new_slides']},
  {id:'svc_img',g:'services',l:'imageGeneration',s:'Gemini Flash slides',steps:['nanobanana_slide_']},
  {id:'svc_prompt',g:'services',l:'promptGenerator',s:'multi-turn refinement',steps:['prompt_generator']},
  {id:'svc_stripe',g:'services',l:'stripeService',s:'credits · subscriptions',steps:[]},
  {id:'svc_logger',g:'services',l:'logger',s:'structured logs → SQLite',steps:[]},
  {id:'svc_metrics',g:'services',l:'metrics',s:'HTTP + AI stats',steps:[]},
  {id:'svc_posthog',g:'services',l:'posthogClient',s:'event tracking',steps:[]},
  {id:'db_users',g:'database',l:'users',s:'id · email · oauth_ids',steps:[]},
  {id:'db_pres',g:'database',l:'presentations',s:'slides · status · user_id',steps:[]},
  {id:'db_messages',g:'database',l:'messages',s:'role · content · pres_id',steps:[]},
  {id:'db_sessions',g:'database',l:'prompt_sessions',s:'user_id · history',steps:[]},
  {id:'db_subs',g:'database',l:'subscriptions',s:'plan · credits · stripe_ids',steps:[]},
  {id:'db_credits',g:'database',l:'credit_transactions',s:'amount · type · user_id',steps:[]},
  {id:'db_logs',g:'database',l:'app_logs',s:'level · message · context',steps:[]},
  {id:'db_analytics',g:'database',l:'analytics_events',s:'event_type · user_id',steps:[]},
  {id:'ext_anthropic',g:'external',l:'Anthropic API',s:'claude-sonnet-4-6',steps:[]},
  {id:'ext_gemini',g:'external',l:'Google Gemini',s:'gemini-3.1-flash-image-preview',steps:[]},
  {id:'ext_stripe',g:'external',l:'Stripe API',s:'subscriptions · checkout',steps:[]},
  {id:'ext_posthog',g:'external',l:'PostHog',s:'event capture · analytics',steps:[]},
  {id:'ext_goauth',g:'external',l:'Google OAuth',s:'passport · profile · email',steps:[]},
  {id:'ext_metaauth',g:'external',l:'Meta OAuth',s:'facebook passport strategy',steps:[]},
  {id:'ext_tiktok',g:'external',l:'TikTok OAuth',s:'open.tiktokapis.com',steps:[]},
];

// ── Edge definitions (source → target, label, optional steps for activity) ──
const GE = [
  {s:'fe_login',t:'rt_auth',lb:'POST /login · /register'},
  {s:'fe_dashboard',t:'rt_pres',lb:'GET · POST /presentations'},
  {s:'fe_dashboard',t:'rt_billing',lb:'GET /subscription'},
  {s:'fe_pres',t:'rt_pres',lb:'chat · regen · SSE'},
  {s:'fe_prompt',t:'rt_prompt',lb:'POST /:sessionId'},
  {s:'fe_onboard',t:'rt_auth',lb:'POST /onboarding'},
  {s:'fe_pricing',t:'rt_billing',lb:'POST /checkout'},
  {s:'fe_profile',t:'rt_auth',lb:'GET/PUT /profile'},
  {s:'fe_billing',t:'rt_billing',lb:'GET /subscription'},
  {s:'fe_callback',t:'rt_auth',lb:'GET /me'},
  {s:'fe_analytics',t:'rt_analytics',lb:'GET /analytics/*'},
  {s:'fe_analytics',t:'rt_admin',lb:'GET /logs · /metrics'},
  {s:'mw_logger',t:'rt_auth',lb:'passes through'},
  {s:'mw_logger',t:'rt_pres',lb:'passes through'},
  {s:'mw_logger',t:'rt_billing',lb:'passes through'},
  {s:'mw_logger',t:'rt_prompt',lb:'passes through'},
  {s:'mw_rate',t:'rt_pres',lb:'rate limited'},
  {s:'mw_rate',t:'rt_prompt',lb:'rate limited'},
  {s:'mw_auth',t:'rt_pres',lb:'JWT verified'},
  {s:'mw_auth',t:'rt_analytics',lb:'JWT verified'},
  {s:'mw_auth',t:'rt_admin',lb:'JWT verified'},
  {s:'mw_auth',t:'rt_prompt',lb:'JWT verified'},
  {s:'mw_validate',t:'rt_auth',lb:'validates schema'},
  {s:'mw_validate',t:'rt_pres',lb:'validates body'},
  {s:'rt_pres',t:'svc_claude',lb:'analyzePresentation · chat · regen',steps:['claude_chat','claude_plan_gen','claude_prompt_gen','claude_question_gen','claude_regen_slide','claude_suggest_title','claude_new_slides']},
  {s:'rt_pres',t:'svc_img',lb:'generateSlideImage',steps:['nanobanana_slide_']},
  {s:'rt_pres',t:'svc_stripe',lb:'deductCredits · checkBudget'},
  {s:'rt_pres',t:'db_pres',lb:'SELECT · INSERT · UPDATE'},
  {s:'rt_pres',t:'db_messages',lb:'store chat messages'},
  {s:'rt_prompt',t:'svc_prompt',lb:'generatePromptResponse',steps:['prompt_generator']},
  {s:'rt_prompt',t:'db_sessions',lb:'store sessions'},
  {s:'rt_auth',t:'svc_stripe',lb:'getOrCreateSubscription'},
  {s:'rt_auth',t:'db_users',lb:'lookup · create · update'},
  {s:'rt_auth',t:'ext_goauth',lb:'passport strategy'},
  {s:'rt_auth',t:'ext_metaauth',lb:'passport strategy'},
  {s:'rt_auth',t:'ext_tiktok',lb:'custom OAuth flow'},
  {s:'rt_billing',t:'svc_stripe',lb:'checkout · portal · webhook'},
  {s:'rt_billing',t:'db_subs',lb:'subscription data'},
  {s:'rt_billing',t:'db_credits',lb:'credit transactions'},
  {s:'rt_analytics',t:'db_analytics',lb:'query events'},
  {s:'rt_admin',t:'db_logs',lb:'query logs'},
  {s:'rt_admin',t:'svc_metrics',lb:'snapshot()'},
  {s:'mw_logger',t:'svc_logger',lb:'structured log write'},
  {s:'mw_logger',t:'svc_metrics',lb:'HTTP metrics record'},
  {s:'svc_claude',t:'ext_anthropic',lb:'messages.create',steps:['claude_chat','claude_plan_gen','claude_prompt_gen','claude_question_gen','claude_regen_slide','claude_suggest_title','claude_new_slides']},
  {s:'svc_prompt',t:'ext_anthropic',lb:'messages.create',steps:['prompt_generator']},
  {s:'svc_img',t:'ext_gemini',lb:'generateContent',steps:['nanobanana_slide_']},
  {s:'svc_stripe',t:'ext_stripe',lb:'API calls'},
  {s:'svc_posthog',t:'ext_posthog',lb:'capture()'},
  {s:'svc_logger',t:'db_logs',lb:'write log rows'},
];

// ── Journey data ─────────────────────────────────────────────────────────────
const JOURNEYS = [
  {id:'signup',label:'New User Signup',color:'#a855f7',steps:[
    {l:'Homepage',n:'fe_home'},{l:'Click Sign Up',n:'fe_login'},{l:'POST /auth/register',n:'rt_auth'},
    {l:'requestLogger',n:'mw_logger'},{l:'validate schema',n:'mw_validate'},{l:'DB users.create',n:'db_users'},
    {l:'stripeService',n:'svc_stripe'},{l:'DB subscriptions',n:'db_subs'},{l:'JWT returned',n:'rt_auth'},
    {l:'Onboarding',n:'fe_onboard'},{l:'POST /onboarding',n:'rt_auth'},{l:'DB users.update',n:'db_users'},
    {l:'Dashboard',n:'fe_dashboard'},
  ]},
  {id:'login',label:'Returning User Login',color:'#3b82f6',steps:[
    {l:'Login page',n:'fe_login'},{l:'POST /auth/login',n:'rt_auth'},{l:'requestLogger',n:'mw_logger'},
    {l:'validate schema',n:'mw_validate'},{l:'DB users lookup',n:'db_users'},{l:'bcrypt verify',n:'rt_auth'},
    {l:'JWT issued',n:'rt_auth'},{l:'Dashboard',n:'fe_dashboard'},{l:'GET /presentations',n:'rt_pres'},
    {l:'DB presentations',n:'db_pres'},
  ]},
  {id:'create',label:'Create Presentation (Full Flow)',color:'#14b8a6',steps:[
    {l:'Dashboard',n:'fe_dashboard'},{l:'POST /analyze',n:'rt_pres'},{l:'authenticateToken',n:'mw_auth'},
    {l:'claude_question_gen',n:'svc_claude'},{l:'Anthropic API',n:'ext_anthropic'},{l:'POST /presentations',n:'rt_pres'},
    {l:'claude_plan_gen',n:'svc_claude'},{l:'claude_prompt_gen',n:'svc_claude'},{l:'nanobanana_slide_*',n:'svc_img'},
    {l:'Google Gemini',n:'ext_gemini'},{l:'DB presentations',n:'db_pres'},{l:'SSE → Presentation page',n:'fe_pres'},
  ]},
  {id:'oauth',label:'OAuth Login (Google/Meta)',color:'#f97316',steps:[
    {l:'Login page',n:'fe_login'},{l:'GET /auth/google',n:'rt_auth'},{l:'Redirect to Google',n:'ext_goauth'},
    {l:'OAuth callback',n:'rt_auth'},{l:'DB users upsert',n:'db_users'},{l:'stripeService',n:'svc_stripe'},
    {l:'JWT issued',n:'rt_auth'},{l:'Auth Callback page',n:'fe_callback'},{l:'Dashboard',n:'fe_dashboard'},
  ]},
  {id:'credits',label:'Credit Limit Reached',color:'#ef4444',steps:[
    {l:'Dashboard',n:'fe_dashboard'},{l:'POST /analyze',n:'rt_pres'},{l:'authenticateToken',n:'mw_auth'},
    {l:'checkTokenBudget',n:'svc_stripe'},{l:'DB subscriptions',n:'db_subs'},{l:'DB credit_transactions',n:'db_credits'},
    {l:'403 response',n:'rt_pres'},{l:'Pricing page',n:'fe_pricing'},{l:'POST /checkout',n:'rt_billing'},
    {l:'Stripe API',n:'ext_stripe'},{l:'DB subscriptions updated',n:'db_subs'},
  ]},
];

// ── State ────────────────────────────────────────────────────────────────────
let allRequests = [], nodeStatsMap = {}, activeFilter = 'all', expandedSet = new Set();
let d3Ready = false, sim = null, graphInit = false, nodeEls, linkEls, dotG;
const GC = {frontend:'#a855f7',routes:'#3b82f6',middleware:'#6b7280',services:'#14b8a6',database:'#f59e0b',external:'#f97316'};
const HC = {healthy:'#22c55e',slow:'#eab308',error:'#ef4444',none:'#374151'};

// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => {
  const tab = btn.dataset.tab;
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById(tab + '-panel').classList.add('active');
  btn.classList.add('active');
  if (tab === 'journeys') renderJourneys();
  if (tab === 'traces') renderTraces();
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function nodeHealth(node) {
  if (!node.steps || !node.steps.length) return 'none';
  let count=0, errors=0, totalMs=0;
  for (const [step,s] of Object.entries(nodeStatsMap)) {
    if (node.steps.some(ns => step.startsWith(ns))) {
      count+=s.count; errors+=s.errors; totalMs+=(s.avgMs||0)*s.count;
    }
  }
  if (count===0) return 'none';
  if (errors>0) return 'error';
  if (count>0 && (totalMs/count)>5000) return 'slow';
  return 'healthy';
}

function edgeActive(edge) {
  if (!edge.steps || !edge.steps.length) return false;
  const cutoff = Date.now() - 12000;
  for (const r of allRequests) {
    if (r.startTime < cutoff || r.status !== 'in-progress') continue;
    for (const s of r.steps) {
      if (s.status === 'started' && edge.steps.some(ns => s.step.startsWith(ns))) return true;
    }
  }
  return false;
}

function shortStep(step) {
  const m = {claude_question_gen:'Q-Gen',claude_plan_gen:'Plan',claude_prompt_gen:'Prompts',
    claude_chat:'Chat',claude_regen_slide:'Regen',claude_suggest_title:'Title',
    claude_new_slides:'NewSlides',prompt_generator:'PromptGen',full_flow:'FullFlow'};
  if (m[step]) return m[step];
  if (step.startsWith('nanobanana_slide_')) return 'Slide'+(step.split('_').pop()||'');
  return step.slice(0,10);
}

// ── D3 Graph ─────────────────────────────────────────────────────────────────
function loadD3() {
  if (typeof d3 !== 'undefined') { d3Ready=true; return Promise.resolve(); }
  return new Promise((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js';
    sc.onload = () => { d3Ready=true; resolve(); };
    sc.onerror = reject;
    document.head.appendChild(sc);
  });
}

function initGraph() {
  if (graphInit || !d3Ready) return;
  graphInit = true;

  const svg = d3.select('#flow-svg');
  const el = document.getElementById('flow-canvas');
  const W = el.clientWidth || 1000;
  const H = el.clientHeight || 700;

  const GX = {
    frontend: W*0.07, routes: W*0.24, middleware: W*0.41,
    services: W*0.58, database: W*0.76, external: W*0.93
  };

  // Edge count for node sizing
  const ec = {};
  GE.forEach(e => { ec[e.s]=(ec[e.s]||0)+1; ec[e.t]=(ec[e.t]||0)+1; });

  // Build node objects
  const nodes = GN.map(n => ({
    ...n, r: Math.min(22, 11 + Math.floor((ec[n.id]||0)/2)),
    x: GX[n.g] + (Math.random()-0.5)*30,
    y: H/2 + (Math.random()-0.5)*50,
  }));
  const nmap = Object.fromEntries(nodes.map(n => [n.id,n]));

  const links = GE.map(e => ({...e, source:nmap[e.s], target:nmap[e.t]})).filter(e=>e.source&&e.target);

  // Zoom
  const zoom = d3.zoom().scaleExtent([0.2,4]).on('zoom', ev => g.attr('transform', ev.transform));
  svg.call(zoom);

  // Defs: arrow markers
  const defs = svg.append('defs');
  ['dim','active'].forEach(type => {
    defs.append('marker').attr('id','arr-'+type)
      .attr('viewBox','0 -4 9 8').attr('refX',9).attr('refY',0)
      .attr('markerWidth',7).attr('markerHeight',7).attr('orient','auto')
      .append('path').attr('d','M0,-4L9,0L0,4').attr('fill', type==='active'?'#22c55e':'#3a3a5a');
  });

  const g = svg.append('g');

  // Links
  linkEls = g.append('g').selectAll('line').data(links).join('line')
    .attr('stroke','#2a2a4a').attr('stroke-width',1.2)
    .attr('marker-end','url(#arr-dim)').attr('opacity',0.5);

  // Dot group for animations
  dotG = g.append('g');

  // Node groups
  const ng = g.append('g').selectAll('g').data(nodes).join('g')
    .attr('cursor','pointer')
    .on('click', (ev, d) => showNodeDetail(d))
    .call(d3.drag()
      .on('start', (ev,d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx=d.x; d.fy=d.y; })
      .on('drag',  (ev,d) => { d.fx=ev.x; d.fy=ev.y; })
      .on('end',   (ev,d) => { if (!ev.active) sim.alphaTarget(0); d.fx=null; d.fy=null; }));

  ng.append('circle').attr('class','hring').attr('fill','none').attr('stroke-width',3);
  ng.append('circle').attr('class','ncircle')
    .attr('fill', d => GC[d.g]+'1a').attr('stroke', d => GC[d.g]).attr('stroke-width',1.5);
  ng.append('text').attr('text-anchor','middle').attr('fill','#e2e2f0').attr('font-size',9)
    .attr('dy','0.32em').attr('pointer-events','none')
    .text(d => d.l.length>15 ? d.l.slice(0,14)+'…' : d.l);

  nodeEls = ng;

  // Simulation
  sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d=>d.id).distance(110).strength(0.4))
    .force('charge', d3.forceManyBody().strength(-180))
    .force('x', d3.forceX(d => GX[d.g]).strength(0.9))
    .force('y', d3.forceY(H/2).strength(0.04))
    .force('collide', d3.forceCollide(d => d.r+22))
    .on('tick', () => {
      const ax = (a,b) => { const dx=b.x-a.x,dy=b.y-a.y,dl=Math.sqrt(dx*dx+dy*dy)||1; return a.x+(dx/dl)*(a.r+3); };
      const ay = (a,b) => { const dx=b.x-a.x,dy=b.y-a.y,dl=Math.sqrt(dx*dx+dy*dy)||1; return a.y+(dy/dl)*(a.r+3); };
      const bx = (a,b) => { const dx=b.x-a.x,dy=b.y-a.y,dl=Math.sqrt(dx*dx+dy*dy)||1; return b.x-(dx/dl)*(b.r+10); };
      const by = (a,b) => { const dx=b.x-a.x,dy=b.y-a.y,dl=Math.sqrt(dx*dx+dy*dy)||1; return b.y-(dy/dl)*(b.r+10); };
      linkEls.attr('x1',d=>ax(d.source,d.target)).attr('y1',d=>ay(d.source,d.target))
             .attr('x2',d=>bx(d.source,d.target)).attr('y2',d=>by(d.source,d.target));
      ng.attr('transform', d => \`translate(\${d.x},\${d.y})\`);
      ng.select('.ncircle').attr('r', d => d.r);
      ng.select('.hring').attr('r', d => d.r+5);
    });

  updateGraphStyles();
  scheduleDots();
}

function updateGraphStyles() {
  if (!nodeEls) return;
  nodeEls.select('.hring')
    .attr('stroke', d => HC[nodeHealth(d)])
    .attr('stroke-opacity', d => nodeHealth(d)==='none' ? 0.2 : 0.85);
}

function scheduleDots() {
  updateDots();
  setInterval(updateDots, 2500);
}

function updateDots() {
  if (!dotG) return;
  dotG.selectAll('*').remove();
  if (!sim) return;
  const simNodes = sim.nodes ? sim.nodes() : [];
  const nmap2 = Object.fromEntries(simNodes.map(n=>[n.id,n]));
  GE.forEach(edge => {
    if (!edgeActive(edge)) return;
    const src = nmap2[edge.s], tgt = nmap2[edge.t];
    if (!src || !tgt) return;
    const dot = dotG.append('circle').attr('r',4).attr('fill','#22c55e')
      .attr('cx',src.x).attr('cy',src.y).attr('opacity',0.9);
    const go = () => {
      dot.attr('cx',src.x).attr('cy',src.y).attr('opacity',0.9);
      dot.transition().duration(1400).ease(d3.easeLinear)
        .attr('cx',tgt.x).attr('cy',tgt.y).attr('opacity',0)
        .on('end', go);
    };
    go();
  });
}

function showNodeDetail(d) {
  // Compute stats for this node
  let count=0, errors=0, totalMs=0, lastError=null;
  if (d.steps && d.steps.length) {
    for (const [step,s] of Object.entries(nodeStatsMap)) {
      if (d.steps.some(ns => step.startsWith(ns))) {
        count+=s.count; errors+=s.errors; totalMs+=(s.avgMs||0)*s.count;
        if (s.lastError) lastError=s.lastError;
      }
    }
  }
  const avgMs = count>0 ? Math.round(totalMs/count) : 0;
  const health = nodeHealth(d);
  const gc = GC[d.g]||'#888';

  const incoming = GE.filter(e=>e.t===d.id);
  const outgoing = GE.filter(e=>e.s===d.id);
  const nodeTraces = allRequests.filter(r => d.steps && d.steps.length &&
    r.steps.some(s => d.steps.some(ns => s.step.startsWith(ns)))).slice(0,5);

  const tagHtml = (id) => {
    const n = GN.find(x=>x.id===id);
    if (!n) return '';
    const c = GC[n.g]||'#888';
    return \`<span class="tag" style="background:\${c}18;border:1px solid \${c}44;color:\${c}">\${esc(n.l)}</span>\`;
  };

  let html = \`<div style="color:\${gc};font-weight:700;font-size:13px;margin-bottom:4px">\${esc(d.l)}</div>
    <div style="color:var(--muted);font-size:10px;margin-bottom:10px">\${esc(d.s)}</div>\`;

  if (count > 0) {
    html += \`<div class="drow"><span>Health</span><span style="color:\${HC[health]}">\${health}</span></div>
    <div class="drow"><span>Calls (5min)</span><span class="dval">\${count}</span></div>
    <div class="drow"><span>Avg latency</span><span class="dval">\${avgMs}ms</span></div>
    <div class="drow" style="border-bottom:none"><span>Errors</span><span class="dval \${errors>0?'derr':''}">\${errors}</span></div>\`;
    if (lastError) html += \`<div style="margin-top:6px;font-size:10px;color:var(--red);font-family:monospace;word-break:break-all;background:rgba(239,68,68,.06);padding:5px;border-radius:4px">\${esc(lastError.slice(0,130))}</div>\`;
  } else {
    html += \`<div style="color:var(--muted);font-size:11px">No traced activity yet</div>\`;
  }

  if (incoming.length) {
    html += \`<div class="stitle">Called by</div><div>\${incoming.map(e=>tagHtml(e.s)).join('')}</div>\`;
  }
  if (outgoing.length) {
    html += \`<div class="stitle">Calls to</div><div>\${outgoing.map(e=>tagHtml(e.t)).join('')}</div>\`;
  }
  if (nodeTraces.length) {
    html += \`<div class="stitle">Recent traces</div>\` +
      nodeTraces.map(r => \`<div style="padding:4px 6px;background:var(--bg3);border-radius:4px;margin-bottom:3px;font-size:10px;cursor:pointer"
        onclick="jumpTrace('\${r.traceId}')">
        <span class="sbadge \${r.status}">\${r.status.replace('-',' ')}</span>
        <span style="color:var(--muted);margin-left:5px">\${new Date(r.startTime).toLocaleTimeString()} · \${r.totalDuration||'…'}ms</span>
      </div>\`).join('');
  }

  document.getElementById('node-detail').innerHTML = \`<div class="detail-box" style="margin-top:0">\${html}</div>\`;
}

function jumpTrace(id) {
  expandedSet.add(id);
  document.querySelectorAll('.tab').forEach(t => { if (t.dataset.tab==='traces') t.click(); });
  setTimeout(() => {
    const el = document.getElementById('tr-'+id);
    if (el) el.scrollIntoView({behavior:'smooth',block:'center'});
  }, 80);
}

// ── Journeys ─────────────────────────────────────────────────────────────────
function renderJourneys() {
  const cont = document.getElementById('journeys-content');
  cont.innerHTML = JOURNEYS.map(j => {
    const steps = j.steps.map((step,i) => {
      const node = GN.find(n=>n.id===step.n);
      const health = node ? nodeHealth(node) : 'none';
      const hc = HC[health];
      const gc = node ? (GC[node.g]||'#888') : '#6b7280';
      const grpLabel = node ? node.g : '';
      const arrow = i < j.steps.length-1 ? \`<div class="jarrow">›</div>\` : '';
      return \`<div style="display:flex;align-items:center">
        <div class="jstep" style="background:\${gc}15;border:1px solid \${gc}40">
          <div class="hring" style="background:\${hc}"></div>
          <div class="jstep-name" style="color:\${gc}">\${esc(step.l)}</div>
          <div class="jstep-grp">\${esc(grpLabel)}</div>
        </div>\${arrow}
      </div>\`;
    }).join('');
    return \`<div class="jcard">
      <div class="jlabel" style="color:\${j.color}">\${esc(j.label)}</div>
      <div class="jsteps">\${steps}</div>
    </div>\`;
  }).join('');
}

// ── Trace feed with waterfall ─────────────────────────────────────────────────
document.querySelectorAll('.fbtn').forEach(btn => btn.addEventListener('click', () => {
  activeFilter = btn.dataset.filter;
  document.querySelectorAll('.fbtn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderTraces();
}));

function renderTraces() {
  let rows = [...allRequests];
  if (activeFilter !== 'all') rows = rows.filter(r => r.status === activeFilter);
  const tbody = document.getElementById('traces-tbody');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">No matching requests</td></tr>';
    return;
  }
  tbody.innerHTML = rows.slice(0,30).map(r => traceRow(r)).join('');
  setTimeout(() => {
    document.querySelectorAll('[data-w]').forEach(el => { el.style.width = el.dataset.w+'px'; });
  }, 20);
}

function traceRow(r) {
  const exp = expandedSet.has(r.traceId);
  const totalMs = r.totalDuration != null ? r.totalDuration : (Date.now()-r.startTime);
  const maxMs = Math.max(...r.steps.map(s=>s.duration_ms||0), 1);
  const sc = {completed:'#22c55e',failed:'#ef4444','in-progress':'#3b82f6'};
  const pills = r.steps.slice(0,6).map(s => {
    const c = sc[s.status]||'#6b7280';
    return \`<span style="background:\${c}15;border:1px solid \${c}40;border-radius:3px;padding:1px 5px;font-size:9px;color:\${c}">\${esc(shortStep(s.step))}</span>\`;
  }).join('');
  const more = r.steps.length>6 ? \`<span style="font-size:9px;color:var(--muted)">+\${r.steps.length-6}</span>\` : '';

  let wfall = '';
  if (exp) {
    const wrows = r.steps.length ? r.steps.map(s => {
      const c = sc[s.status]||'#6b7280';
      const ico = s.status==='completed'?'✓':s.status==='failed'?'✗':'●';
      const bw = Math.max(2, Math.round((s.duration_ms / Math.max(totalMs, maxMs)) * 200));
      return \`<div class="wrow">
        <div class="wico" style="background:\${c}22;color:\${c}">\${ico}</div>
        <div class="wname">\${esc(s.step)}</div>
        <div class="wbar" style="background:\${c}" data-w="\${bw}"></div>
        <div class="wms">\${s.duration_ms>0?s.duration_ms+'ms':'—'}</div>
        \${s.error?\`<div class="werr">\${esc(s.error.slice(0,90))}</div>\`:''}
      </div>\`;
    }).join('') : '<div style="color:var(--muted);font-size:11px;padding:6px">No steps recorded</div>';
    wfall = \`<tr><td colspan="5" style="padding:0;background:var(--bg3)"><div class="wfall">\${wrows}</div></td></tr>\`;
  }

  return \`<tr id="tr-\${r.traceId}" class="cr" onclick="toggleTrace('\${r.traceId}')">
    <td style="color:var(--muted)">\${new Date(r.startTime).toLocaleTimeString()}</td>
    <td style="font-family:monospace;max-width:80px;overflow:hidden;text-overflow:ellipsis">\${esc(r.userId?r.userId.slice(0,10):'—')}</td>
    <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted)">\${esc((r.method||'')+' '+(r.path||''))}</td>
    <td><div style="display:flex;gap:2px;flex-wrap:wrap">\${pills}\${more}</div></td>
    <td><span class="sbadge \${r.status}">\${r.status.replace('-',' ')}</span> <span style="color:var(--muted);font-size:10px">\${totalMs}ms</span></td>
  </tr>\${wfall}\`;
}

function toggleTrace(id) {
  if (expandedSet.has(id)) expandedSet.delete(id); else expandedSet.add(id);
  renderTraces();
}

// ── Error rendering ───────────────────────────────────────────────────────────
function renderErrors(errors) {
  const el = document.getElementById('errors-content');
  if (!errors || !errors.length) {
    el.innerHTML = '<div class="empty">No errors in the last hour ✓</div>'; return;
  }
  el.innerHTML = errors.map(g => {
    const entries = g.failures.slice(0,5).map(f =>
      \`<div class="eentry">
        <div style="font-family:monospace;word-break:break-all">\${esc(f.error||'Unknown')}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px">\${new Date(f.timestamp).toLocaleTimeString()} · \${esc(f.path||'')} \${f.userId?'· '+esc(f.userId.slice(0,10)):''}</div>
      </div>\`
    ).join('');
    return \`<div class="egroup"><h3>\${esc(g.step)} <span class="ecnt">\${g.count} failures</span></h3>\${entries}</div>\`;
  }).join('');
}

// ── DB / Metrics ──────────────────────────────────────────────────────────────
function renderDB(dbStats, snap) {
  document.getElementById('db-grid').innerHTML = Object.entries(dbStats||{}).map(([t,n]) =>
    \`<div class="dcard"><div class="n">\${Number(n).toLocaleString()}</div><div class="lbl">\${t}</div></div>\`
  ).join('');

  if (snap) {
    document.getElementById('metrics-grid').innerHTML = [
      ['Uptime',snap.uptimeHuman||'—'],['Total Reqs',(snap.http?.totalRequests||0).toLocaleString()],
      ['HTTP Errors',(snap.http?.totalErrors||0).toLocaleString()],['AI Calls',(snap.ai?.totalCalls||0).toLocaleString()],
      ['Input Tokens',(snap.ai?.totalInputTokens||0).toLocaleString()],['Output Tokens',(snap.ai?.totalOutputTokens||0).toLocaleString()],
      ['Avg AI ms',(snap.ai?.avgLatencyMs||0)+'ms'],
    ].map(([l,v]) => \`<div class="dcard"><div class="n" style="font-size:15px">\${v}</div><div class="lbl">\${l}</div></div>\`).join('');

    const ai = snap.ai?.byFunction||[];
    document.getElementById('ai-tbody').innerHTML = ai.length
      ? ai.map(f => \`<tr><td>\${esc(f.fn)}</td><td>\${f.calls}</td><td>\${f.errors}</td><td>\${f.avgMs||0}ms</td><td>\${f.avgTokens||0}</td></tr>\`).join('')
      : '<tr><td colspan="5" class="empty">No AI calls yet</td></tr>';
  }
}

// ── Data fetch ────────────────────────────────────────────────────────────────
async function fetchData() {
  try {
    const r = await authedFetch('/api/data', {signal: AbortSignal.timeout(8000)});
    if (!r.ok) { setStatus('err','HTTP '+r.status); return; }
    const data = await r.json();
    allRequests = data.requests||[];
    nodeStatsMap = {};
    for (const s of (data.nodeStats||[])) nodeStatsMap[s.step] = s;
    if (document.getElementById('traces-panel').classList.contains('active')) renderTraces();
    if (document.getElementById('journeys-panel').classList.contains('active')) renderJourneys();
    renderErrors(data.errors);
    renderDB(data.dbStats||{}, data.metrics);
    updateGraphStyles();
    setStatus('live','Updated '+new Date().toLocaleTimeString());
  } catch(e) {
    setStatus('err','Fetch: '+e.message.slice(0,30));
  }
}

function setStatus(state, text) {
  document.getElementById('sdot').className = state==='live'?'live':state==='err'?'err':'';
  document.getElementById('sup').textContent = text;
}

// ── SSE ───────────────────────────────────────────────────────────────────────
function connectSSE() {
  let es;
  try { es = new EventSource(api('/api/events')); } catch { return; }
  es.onopen = () => setStatus('live','Live · '+new Date().toLocaleTimeString());
  es.onerror = () => { setStatus('err','SSE disconnected…'); es.close(); setTimeout(connectSSE,5000); };
  es.onmessage = ev => {
    try {
      const trace = JSON.parse(ev.data);
      const idx = allRequests.findIndex(r=>r.traceId===trace.traceId);
      if (idx>=0) allRequests[idx]=trace; else allRequests.unshift(trace);
      if (allRequests.length>100) allRequests.length=100;
      if (document.getElementById('traces-panel').classList.contains('active')) renderTraces();
      updateGraphStyles();
      setStatus('live','Live · '+new Date().toLocaleTimeString());
    } catch {}
  };
}

// ── Init sequence ─────────────────────────────────────────────────────────────
fetchData();
connectSSE();
setInterval(fetchData, 12000);

// Load D3 asynchronously — graph renders after it loads
loadD3().then(() => {
  if (document.getElementById('flow-panel').classList.contains('active')) initGraph();
}).catch(() => {
  document.getElementById('flow-canvas').innerHTML =
    '<div style="padding:40px;text-align:center;color:var(--muted)">D3 failed to load from CDN — check network connection.<br><br>Traces, Journeys, Errors and Database tabs still work.</div>';
});

// Also init graph when switching to flow tab (in case D3 loaded after tab switch)
document.querySelectorAll('.tab').forEach(btn => {
  if (btn.dataset.tab === 'flow') {
    btn.addEventListener('click', () => { if (d3Ready) initGraph(); });
  }
});
</script>
</body>
</html>`;
}

export default router;
