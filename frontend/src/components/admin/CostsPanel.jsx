import { useCallback, useEffect, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { Download, Loader2, RefreshCw, X } from 'lucide-react';
import api from '../../api/client';

// ─── Admin › Costs ─────────────────────────────────────────────────────────
// Actual AI spend from the ai_costs table (one row per Claude / image call):
// totals, per-slide distribution, per-call breakdown, prompt-cache health,
// most expensive decks with a per-slide drill-down, and a CSV export.

// Validated categorical pair (dataviz reference palette, dark mode).
const CLAUDE = '#3987e5';
const IMAGES = '#d95926';

const RANGES = [
  { id: 7, label: '7 days' },
  { id: 30, label: '30 days' },
  { id: 90, label: '90 days' },
];

const usd = (v, d = 4) => `$${(v || 0).toFixed(d)}`;
const num = (v) => Math.round(v || 0).toLocaleString('en-US');
const day = (offset) => new Date(Date.now() + offset * 86400e3).toISOString().slice(0, 10);

function Card({ title, children, right }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function Tile({ label, value, sub }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">{label}</div>
      <div className="mt-1 text-2xl font-bold text-white tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

function DailyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div className="rounded-lg border border-white/10 bg-gray-950 px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 font-semibold text-white">{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center gap-2 text-gray-300">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="ml-auto pl-3 text-white tabular-nums">{usd(p.value, 2)}</span>
        </div>
      ))}
      <div className="mt-1 border-t border-white/10 pt-1 text-gray-300">Total <span className="float-right pl-3 text-white tabular-nums">{usd(total, 2)}</span></div>
    </div>
  );
}

const th = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400';
const td = 'px-3 py-2 text-gray-200 tabular-nums';

export default function CostsPanel() {
  const [range, setRange] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deck, setDeck] = useState(null); // drill-down

  const params = { from: day(-range), to: day(1) };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: d } = await api.get('/admin/costs', { params: { from: day(-range), to: day(1) } });
      setData(d);
    } catch (err) {
      setError(err.response?.data?.error || 'Couldn\'t load costs.');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  async function openDeck(id, title) {
    try {
      const { data: d } = await api.get(`/admin/costs/deck/${id}`);
      setDeck({ ...d, title });
    } catch {
      setError('Couldn\'t load that deck\'s costs.');
    }
  }

  async function exportCsv(presentationId = null) {
    const { data: csv } = await api.get('/admin/costs/export.csv', {
      params: presentationId ? { presentation_id: presentationId } : params,
      responseType: 'blob',
    });
    const url = URL.createObjectURL(csv);
    const a = document.createElement('a');
    a.href = url;
    a.download = presentationId ? `ai-costs-${presentationId}.csv` : `ai-costs-${params.from}-to-${params.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const t = data?.totals;
  const s = data?.perSlide;
  return (
    <div className="space-y-6">
      {/* Controls: one row above the charts */}
      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map(r => (
          <button key={r.id} onClick={() => setRange(r.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${range === r.id ? 'bg-white text-gray-900' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}>
            {r.label}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={load} className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-gray-300 hover:bg-white/10">
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Refresh
        </button>
        <button onClick={() => exportCsv()} className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-gray-300 hover:bg-white/10">
          <Download size={13} /> Export CSV
        </button>
      </div>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
      {!data && !error && <div className="py-16 text-center text-sm text-gray-400">Loading…</div>}

      {data && (
        <>
          {t.calls === 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-300">
              No AI calls recorded in this range yet. Every Claude and image call is recorded from now on (mock mode records nothing).
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Tile label="Total spend" value={usd(t.cost, 2)} sub={`Claude ${usd(t.claude, 2)} · images ${usd(t.images, 2)}`} />
            <Tile label="Per slide (median)" value={usd(s.total.p50, 3)} sub={`p90 ${usd(s.total.p90, 3)} · range ${usd(s.total.min, 3)}–${usd(s.total.max, 3)} · n=${s.total.n}`} />
            <Tile label="Per AI edit (avg)" value={usd(data.aiEdits.avg, 3)} sub={`n=${data.aiEdits.n} edits`} />
            <Tile label="Layout cache hit rate" value={`${Math.round(data.cache.hit_rate * 100)}%`} sub={`${num(data.cache.read)} tokens read · ${num(data.cache.write)} written`} />
          </div>
          {t.estimated > 0 && (
            <p className="text-xs text-gray-400">
              {usd(t.estimated, 2)} of this uses estimated prices (image models without a published price; set the PRICE_* env vars to correct it).
            </p>
          )}

          <Card title="Spend per day">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.daily} barCategoryGap="20%">
                <CartesianGrid vertical={false} stroke="#ffffff12" />
                <XAxis dataKey="day" tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={d => d.slice(5)} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={v => `$${v.toFixed(2)}`} axisLine={false} tickLine={false} width={56} />
                <Tooltip content={<DailyTooltip />} cursor={{ fill: '#ffffff0a' }} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#d1d5db' }} />
                <Bar dataKey="claude" name="Claude" stackId="a" fill={CLAUDE} stroke="#111318" strokeWidth={2} />
                <Bar dataKey="images" name="Images" stackId="a" fill={IMAGES} stroke="#111318" strokeWidth={2} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card title="Per generated slide">
              <table className="w-full text-sm">
                <thead><tr><th className={th} /><th className={th}>avg</th><th className={th}>median</th><th className={th}>p90</th><th className={th}>min</th><th className={th}>max</th></tr></thead>
                <tbody>
                  {[['Total', s.total], ['Claude', s.claude], ['Images', s.images]].map(([label, d]) => (
                    <tr key={label} className="border-t border-white/5">
                      <td className="px-3 py-2 text-gray-300">{label}</td>
                      {['avg', 'p50', 'p90', 'min', 'max'].map(k => <td key={k} className={td}>{usd(d[k], 3)}</td>)}
                    </tr>
                  ))}
                  <tr className="border-t border-white/5">
                    <td className="px-3 py-2 text-gray-300">Images / slide</td>
                    {['avg', 'p50', 'p90', 'min', 'max'].map(k => <td key={k} className={td}>{(s.imagesPerSlide[k] || 0).toFixed(k === 'avg' ? 1 : 0)}</td>)}
                  </tr>
                  <tr className="border-t border-white/5">
                    <td className="px-3 py-2 text-gray-300">Layout output tokens</td>
                    {['avg', 'p50', 'p90', 'min', 'max'].map(k => <td key={k} className={td}>{num(s.layoutOutputTokens[k])}</td>)}
                  </tr>
                </tbody>
              </table>
              <p className="mt-3 text-xs text-gray-400">
                Plus deck overhead (outline, deck design, cache warm-up): avg {usd(data.deckOverhead.avg, 3)} per deck (n={data.deckOverhead.n}).
              </p>
            </Card>

            <Card title="By operation">
              <table className="w-full text-sm">
                <thead><tr><th className={th}>Operation</th><th className={th}>Calls</th><th className={th}>Decks</th><th className={th}>Spend</th></tr></thead>
                <tbody>
                  {data.byOperation.map(o => (
                    <tr key={o.operation} className="border-t border-white/5">
                      <td className="px-3 py-2 text-gray-300">{o.operation}</td>
                      <td className={td}>{num(o.calls)}</td><td className={td}>{num(o.decks)}</td><td className={td}>{usd(o.cost, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>

          <Card title="By call type — what one call costs and why">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className={th}>Call</th><th className={th}>Calls</th><th className={th}>Avg cost</th><th className={th}>Total</th>
                    <th className={th}>Avg input</th><th className={th}>Cache write</th><th className={th}>Cache read</th><th className={th}>Output</th><th className={th}>Avg time</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byCall.map(c => (
                    <tr key={`${c.provider}-${c.model}-${c.call}`} className="border-t border-white/5">
                      <td className="px-3 py-2 text-gray-300">
                        <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: c.provider === 'anthropic' ? CLAUDE : IMAGES }} />
                        {c.call} <span className="text-gray-500">· {c.model}</span>{c.estimated ? <span className="ml-1 text-amber-300/80">est.</span> : null}
                      </td>
                      <td className={td}>{num(c.calls)}</td><td className={td}>{usd(c.avg_cost)}</td><td className={td}>{usd(c.cost, 2)}</td>
                      <td className={td}>{num(c.avg_input + c.avg_image_input)}</td><td className={td}>{num(c.avg_cache_write)}</td>
                      <td className={td}>{num(c.avg_cache_read)}</td><td className={td}>{num(c.avg_output)}</td>
                      <td className={td}>{c.avg_ms ? `${(c.avg_ms / 1000).toFixed(1)} s` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card title="Most expensive decks">
              <table className="w-full text-sm">
                <thead><tr><th className={th}>Deck</th><th className={th}>Slides</th><th className={th}>Spend</th><th className={th}>Per slide</th></tr></thead>
                <tbody>
                  {data.topDecks.map(d => (
                    <tr key={d.presentation_id} className="cursor-pointer border-t border-white/5 hover:bg-white/5" onClick={() => openDeck(d.presentation_id, d.title)}>
                      <td className="px-3 py-2 text-gray-200"><div className="max-w-[260px] truncate">{d.title || d.presentation_id}</div><div className="text-xs text-gray-500">{d.email || ''}</div></td>
                      <td className={td}>{d.slides}</td><td className={td}>{usd(d.cost, 3)}</td><td className={td}>{d.slides ? usd(d.cost / d.slides, 3) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card title="Top users">
              <table className="w-full text-sm">
                <thead><tr><th className={th}>User</th><th className={th}>Decks</th><th className={th}>Calls</th><th className={th}>Spend</th></tr></thead>
                <tbody>
                  {data.topUsers.map(u => (
                    <tr key={u.user_id} className="border-t border-white/5">
                      <td className="px-3 py-2 text-gray-200"><div className="max-w-[260px] truncate">{u.email || u.user_id}</div></td>
                      <td className={td}>{num(u.decks)}</td><td className={td}>{num(u.calls)}</td><td className={td}>{usd(u.cost, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </>
      )}

      {/* Deck drill-down: every call, grouped by slide */}
      {deck && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-6" onClick={e => { if (e.target === e.currentTarget) setDeck(null); }}>
          <div className="w-full max-w-4xl rounded-2xl border border-white/10 bg-gray-950 p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-semibold text-white">{deck.title || deck.presentationId}</h3>
                <div className="text-sm text-gray-400">Total {usd(deck.total, 4)}</div>
              </div>
              <button onClick={() => exportCsv(deck.presentationId)} className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-gray-300 hover:bg-white/10"><Download size={13} /> CSV</button>
              <button onClick={() => setDeck(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10" aria-label="Close"><X size={16} /></button>
            </div>
            {deck.groups.map(g => (
              <div key={String(g.slide)} className="mb-4">
                <div className="mb-1 flex justify-between text-sm font-semibold text-gray-200">
                  <span>{g.slide === null ? 'Deck-level (outline, design, warm-up)' : `Slide ${g.slide + 1}`}</span>
                  <span className="tabular-nums">{usd(g.cost, 4)}</span>
                </div>
                <table className="w-full text-xs">
                  <tbody>
                    {g.calls.map(c => (
                      <tr key={c.id} className="border-t border-white/5">
                        <td className="px-2 py-1 text-gray-400">{c.created_at.slice(11, 19)}</td>
                        <td className="px-2 py-1 text-gray-300">{c.operation}</td>
                        <td className="px-2 py-1 text-gray-200">{c.call}</td>
                        <td className="px-2 py-1 text-gray-400 tabular-nums">in {num(c.input_tokens + c.image_input_tokens)} · cache w {num(c.cache_write_tokens)} r {num(c.cache_read_tokens)} · out {num(c.output_tokens)}</td>
                        <td className="px-2 py-1 text-right text-gray-200 tabular-nums">{usd(c.cost_usd)}{c.estimated ? ' est.' : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
