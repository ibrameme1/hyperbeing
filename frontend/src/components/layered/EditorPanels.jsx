import { useEffect, useState } from 'react';
import {
  AlignLeft, AlignCenter, AlignRight, Bold, Italic, CaseUpper, Copy, Trash2, Eye, EyeOff,
  BringToFront, SendToBack, ArrowUp, ArrowDown, FlipHorizontal, Type, Square, Image as ImageIcon,
  BarChart3, Shapes, Sparkles, Plus, Minus, Smartphone,
} from 'lucide-react';
import { FONT_NAMES } from './fonts';

// ─── Small controls ────────────────────────────────────────────────────────
const label = 'text-[11px] font-semibold uppercase tracking-wide text-zinc-500';
const inputCls = 'w-full bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1.5 text-[13px] text-zinc-100 outline-none focus:border-zinc-500';

function Row({ title, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      {title && <span className={label}>{title}</span>}
      {children}
    </div>
  );
}

// Number input that commits on blur/Enter (not every keystroke → clean undo).
export function NumberField({ value, onChange, step = 1, min, max, suffix, title }) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => { setDraft(value ?? ''); }, [value]);
  const commit = () => {
    const n = parseFloat(draft);
    if (!Number.isFinite(n)) { setDraft(value ?? ''); return; }
    const v = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
    if (v !== value) onChange(v);
  };
  return (
    <label className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1 focus-within:border-zinc-500" title={title}>
      {suffix && <span className="text-[11px] text-zinc-500 w-3 shrink-0">{suffix}</span>}
      <input
        type="number" step={step} value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { commit(); e.currentTarget.blur(); } }}
        className="w-full bg-transparent text-[13px] text-zinc-100 outline-none tabular-nums"
      />
    </label>
  );
}

const toHex = (c) => {
  if (!c) return '#000000';
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return `#${c.slice(1).split('').map(x => x + x).join('')}`;
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(c);
  if (m) return `#${[m[1], m[2], m[3]].map(v => (+v).toString(16).padStart(2, '0')).join('')}`;
  return '#000000';
};

export function ColorField({ value, onChange, swatches = [] }) {
  const [draft, setDraft] = useState(value || '');
  useEffect(() => { setDraft(value || ''); }, [value]);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <input type="color" value={toHex(value)} onChange={e => onChange(e.target.value.toUpperCase())}
          className="w-8 h-8 rounded-md border border-zinc-700 bg-transparent cursor-pointer shrink-0 p-0" aria-label="Pick colour" />
        <input value={draft} onChange={e => setDraft(e.target.value)}
          onBlur={() => { if (draft !== value) onChange(draft); }}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          className={inputCls} aria-label="Colour value" />
      </div>
      {swatches.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {swatches.map(c => (
            <button key={c} onClick={() => onChange(c)} title={c}
              className="w-5 h-5 rounded-full border border-zinc-700 hover:scale-110 transition-transform"
              style={{ background: c }} aria-label={`Use ${c}`} />
          ))}
        </div>
      )}
    </div>
  );
}

function IconButton({ onClick, title, active, children, danger }) {
  return (
    <button onClick={onClick} title={title} aria-label={title}
      className={`h-8 min-w-8 px-2 rounded-md flex items-center justify-center gap-1 text-[12px] transition-colors border ${
        active ? 'bg-zinc-100 text-zinc-900 border-zinc-100' : danger ? 'border-zinc-800 text-red-400 hover:bg-red-500/10' : 'border-zinc-800 text-zinc-300 hover:bg-zinc-800'
      }`}>
      {children}
    </button>
  );
}

// ─── Inspector ─────────────────────────────────────────────────────────────
export function Inspector({ layer, layout, swatches, onPatch, onBox, onArrange, onDuplicate, onDelete, onAskAI }) {
  if (!layer) {
    return (
      <div className="p-4 text-[13px] text-zinc-500 leading-relaxed">
        Click any element on the slide to edit it. Double-click text to retype it.
        <div className="mt-3 text-zinc-600 text-[12px]">
          Shortcuts: arrows nudge (Shift = 10px) · Delete removes · ⌘D duplicates · ⌘Z / ⇧⌘Z undo / redo · [ ] layer order
        </div>
      </div>
    );
  }
  const isDeviceChild = !!layer.screen_of;
  return (
    <div className="p-4 flex flex-col gap-4 text-zinc-200">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold truncate">{layer.name || layer.id}</span>
        <span className="text-[11px] text-zinc-500">{layer.kind}{layer.screen ? ' · device' : ''}{isDeviceChild ? ' · on screen' : ''}</span>
      </div>

      <Row title="Position & size">
        <div className="grid grid-cols-2 gap-1.5">
          <NumberField suffix="X" value={Math.round(layer.x)} onChange={v => onBox({ ...layer, x: v })} />
          <NumberField suffix="Y" value={Math.round(layer.y)} onChange={v => onBox({ ...layer, y: v })} />
          <NumberField suffix="W" min={4} value={Math.round(layer.w)} onChange={v => onBox({ ...layer, w: v })} />
          <NumberField suffix="H" min={4} value={Math.round(layer.h)} onChange={v => onBox({ ...layer, h: v })} />
          <NumberField suffix="°" min={-360} max={360} value={Math.round(layer.rotation || 0)} onChange={v => onPatch({ rotation: v })} title="Rotation" />
          <NumberField suffix="%" min={0} max={100} value={Math.round((layer.opacity ?? 1) * 100)} onChange={v => onPatch({ opacity: v / 100 })} title="Opacity" />
        </div>
      </Row>

      {layer.kind === 'text' && <TextControls layer={layer} swatches={swatches} onPatch={onPatch} />}
      {layer.kind === 'shape' && <ShapeControls layer={layer} swatches={swatches} onPatch={onPatch} />}
      {layer.kind === 'chart' && <ChartControls layer={layer} swatches={swatches} onPatch={onPatch} />}
      {layer.kind === 'icon' && !layer.src && (
        <Row title="Icon colour"><ColorField value={layer.color} swatches={swatches} onChange={c => onPatch({ color: c })} /></Row>
      )}
      {(layer.kind === 'image' || layer.kind === 'logo') && (
        <Row title="Image">
          <div className="flex gap-1.5">
            <IconButton title="Flip horizontally" active={!!layer.flip} onClick={() => onPatch({ flip: !layer.flip })}><FlipHorizontal size={14} /> Flip</IconButton>
          </div>
        </Row>
      )}
      {layer.kind === 'image' && onAskAI && (
        <button onClick={() => onAskAI(layer)}
          className="flex items-center justify-center gap-2 h-9 rounded-md text-[13px] font-semibold text-white bg-[#5B50FF] hover:bg-[#4b41f0] transition-colors">
          <Sparkles size={14} /> Change this element with AI
        </button>
      )}

      <Row title="Arrange">
        <div className="flex flex-wrap gap-1.5">
          <IconButton title="Bring to front" onClick={() => onArrange('front')}><BringToFront size={14} /></IconButton>
          <IconButton title="Forward" onClick={() => onArrange('forward')}><ArrowUp size={14} /></IconButton>
          <IconButton title="Backward" onClick={() => onArrange('backward')}><ArrowDown size={14} /></IconButton>
          <IconButton title="Send to back" onClick={() => onArrange('back')}><SendToBack size={14} /></IconButton>
          <IconButton title="Duplicate (⌘D)" onClick={onDuplicate}><Copy size={14} /></IconButton>
          <IconButton title="Delete (Del)" onClick={onDelete} danger><Trash2 size={14} /></IconButton>
        </div>
      </Row>
    </div>
  );
}

function TextControls({ layer, swatches, onPatch }) {
  return (
    <>
      <Row title="Text">
        <textarea value={layer.text} rows={Math.min(6, String(layer.text).split('\n').length + 1)}
          onChange={e => onPatch({ text: e.target.value }, { coalesce: `text-${layer.id}` })}
          className={`${inputCls} resize-y leading-snug`} />
      </Row>
      <Row title="Font">
        <select value={layer.font} onChange={e => onPatch({ font: e.target.value })} className={inputCls}>
          {FONT_NAMES.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-1.5">
          <NumberField suffix="pt" min={6} max={400} value={Math.round(layer.size)} onChange={v => onPatch({ size: v })} title="Font size (canvas px)" />
          <NumberField suffix="↕" step={0.05} min={0.7} max={3} value={layer.line_height} onChange={v => onPatch({ line_height: v })} title="Line height" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <IconButton title="Bold" active={layer.weight >= 600} onClick={() => onPatch({ weight: layer.weight >= 600 ? 400 : 700 })}><Bold size={14} /></IconButton>
          <IconButton title="Italic" active={!!layer.italic} onClick={() => onPatch({ italic: !layer.italic })}><Italic size={14} /></IconButton>
          <IconButton title="All caps" active={!!layer.uppercase} onClick={() => onPatch({ uppercase: !layer.uppercase })}><CaseUpper size={14} /></IconButton>
          <span className="w-px bg-zinc-800 mx-0.5" />
          <IconButton title="Align left" active={layer.align === 'left'} onClick={() => onPatch({ align: 'left' })}><AlignLeft size={14} /></IconButton>
          <IconButton title="Align centre" active={layer.align === 'center'} onClick={() => onPatch({ align: 'center' })}><AlignCenter size={14} /></IconButton>
          <IconButton title="Align right" active={layer.align === 'right'} onClick={() => onPatch({ align: 'right' })}><AlignRight size={14} /></IconButton>
        </div>
      </Row>
      <Row title="Colour">
        {/* Choosing a solid colour replaces a gradient fill. */}
        <ColorField value={layer.color} swatches={swatches} onChange={c => onPatch({ color: c, gradient: null, runs: (layer.runs || []).map(r => ({ ...r, color: undefined, gradient: undefined })) })} />
        {layer.gradient && <span className="text-[11px] text-zinc-500">Gradient fill — pick a colour to make it solid.</span>}
      </Row>
    </>
  );
}

function ShapeControls({ layer, swatches, onPatch }) {
  return (
    <>
      <Row title="Fill">
        <ColorField value={layer.fill} swatches={swatches} onChange={c => onPatch({ fill: c, gradient: null })} />
      </Row>
      {layer.shape === 'rect' && (
        <Row title="Corner radius">
          <NumberField min={0} max={1000} value={Math.round(layer.radius || 0)} onChange={v => onPatch({ radius: v })} />
        </Row>
      )}
      <Row title="Border">
        <div className="grid grid-cols-[1fr_72px] gap-1.5 items-start">
          <ColorField value={layer.border?.color || 'rgba(255,255,255,0.2)'} onChange={c => onPatch({ border: { ...(layer.border || { width: 1 }), color: c, gradient: undefined } })} />
          <NumberField suffix="px" min={0} max={40} value={layer.border?.width || 0} onChange={v => onPatch({ border: v ? { color: layer.border?.color || 'rgba(255,255,255,0.2)', ...(layer.border || {}), width: v } : null })} />
        </div>
      </Row>
    </>
  );
}

function ChartControls({ layer, swatches, onPatch }) {
  const cats = layer.categories || [];
  const series = layer.series || [];
  const setCell = (si, i, v) => onPatch({ series: series.map((s, k) => (k === si ? { ...s, values: s.values.map((x, j) => (j === i ? v : x)) } : s)) });
  const setCat = (i, v) => onPatch({ categories: cats.map((c, j) => (j === i ? v : c)) });
  const addRow = () => onPatch({ categories: [...cats, `Item ${cats.length + 1}`], series: series.map(s => ({ ...s, values: [...s.values, 0] })) });
  const delRow = () => cats.length > 1 && onPatch({ categories: cats.slice(0, -1), series: series.map(s => ({ ...s, values: s.values.slice(0, -1) })) });
  return (
    <>
      <Row title="Chart type">
        <select value={layer.chart_type} onChange={e => onPatch({ chart_type: e.target.value })} className={inputCls}>
          {['column', 'bar', 'line', 'area', 'pie', 'donut'].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </Row>
      <Row title="Data">
        <div className="rounded-md border border-zinc-800 overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-zinc-900 text-zinc-500">
                <th className="text-left font-medium px-2 py-1">Label</th>
                {series.map((s, si) => <th key={si} className="text-right font-medium px-2 py-1 truncate">{s.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {cats.map((c, i) => (
                <tr key={i} className="border-t border-zinc-800">
                  <td className="px-1"><CellInput value={c} onCommit={v => setCat(i, v)} /></td>
                  {series.map((s, si) => (
                    <td key={si} className="px-1">
                      <CellInput numeric value={s.values[i] ?? ''} onCommit={v => setCell(si, i, v === '' ? null : Number(v))} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-1.5">
          <IconButton title="Add row" onClick={addRow}><Plus size={13} /> Row</IconButton>
          <IconButton title="Remove last row" onClick={delRow}><Minus size={13} /> Row</IconButton>
          <IconButton title="Show values" active={!!layer.options?.show_values} onClick={() => onPatch({ options: { ...layer.options, show_values: !layer.options?.show_values } })}>123</IconButton>
        </div>
      </Row>
      {series[0] && (
        <Row title="Series colour">
          <ColorField value={series[0].color || '#FF2E74'} swatches={swatches}
            onChange={c => onPatch({ series: series.map((s, k) => (k === 0 ? { ...s, color: c } : s)), options: { ...layer.options, point_colors: undefined } })} />
        </Row>
      )}
    </>
  );
}

function CellInput({ value, onCommit, numeric }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return (
    <input value={draft} inputMode={numeric ? 'decimal' : undefined}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { if (String(draft) !== String(value) && (!numeric || draft === '' || Number.isFinite(Number(draft)))) onCommit(draft); else setDraft(value); }}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      className={`w-full bg-transparent px-1 py-1 outline-none text-zinc-100 ${numeric ? 'text-right tabular-nums' : ''}`} />
  );
}

// ─── Layers list (top of the stack first) ──────────────────────────────────
const KIND_ICON = { text: Type, shape: Square, image: ImageIcon, chart: BarChart3, icon: Shapes, logo: ImageIcon };

export function LayersPanel({ layout, selectedId, onSelect, onToggleHidden }) {
  const items = [...layout.layers].reverse();
  return (
    <div className="flex flex-col py-1">
      {items.map(l => {
        const Icon = l.screen ? Smartphone : (KIND_ICON[l.kind] || Square);
        const name = l.kind === 'text' ? String(l.text).replace(/\s+/g, ' ').slice(0, 40) : (l.name || l.id);
        return (
          <div key={l.id}
            className={`group flex items-center gap-2 px-3 py-1.5 cursor-pointer text-[12px] ${selectedId === l.id ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-400 hover:bg-zinc-900'} ${l.screen_of ? 'pl-7' : ''}`}
            onClick={() => onSelect(l.id)}>
            <Icon size={13} className="shrink-0" />
            <span className={`truncate flex-1 ${l.hidden ? 'opacity-40' : ''}`}>{name}</span>
            <button onClick={e => { e.stopPropagation(); onToggleHidden(l.id); }}
              className={`shrink-0 ${l.hidden ? 'text-zinc-500' : 'text-zinc-600 opacity-0 group-hover:opacity-100'}`}
              title={l.hidden ? 'Show' : 'Hide'} aria-label={l.hidden ? 'Show layer' : 'Hide layer'}>
              {l.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
        );
      })}
    </div>
  );
}
