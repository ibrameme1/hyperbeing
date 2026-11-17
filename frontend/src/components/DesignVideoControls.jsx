import { Volume2, VolumeX, Film } from 'lucide-react';
import { VIDEO_IMAGE_ROLE_LABELS } from '../utils/designMode';

// Defined at module level (not inside the component) so buttons keep focus
// across re-renders.
function Segmented({ isDark, value, items, onPick, ariaLabel }) {
  return (
    <div role="group" aria-label={ariaLabel} style={{ display: 'flex', gap: 2, background: isDark ? '#050D12' : '#f0f0f0', borderRadius: 10, padding: 3, flexShrink: 0 }}>
      {items.map(({ key, text, disabled }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => onPick(key)}
            aria-pressed={active}
            style={{
              padding: '4px 9px', borderRadius: 7, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
              fontSize: 12, fontWeight: 600, fontFamily: 'Inter,sans-serif', opacity: disabled ? 0.35 : 1,
              background: active ? (isDark ? '#0F1F28' : '#fff') : 'transparent',
              boxShadow: active && !isDark ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
              color: active ? '#0297DE' : (isDark ? '#999' : '#555'),
            }}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

// ─── Video settings row for the Design composer ────────────────────────────
// Model, resolution, aspect ratio, duration, sound, and (when images are
// attached) how those images are used. Every limit comes from
// GET /api/design/video/options so the UI can't offer what the backend refuses.
export default function DesignVideoControls({ isDark, options, settings, onChange, attachmentCount }) {
  if (!options) {
    return <div className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>Loading video options…</div>;
  }
  const model = options.models.find(m => m.key === settings.model) || options.models[0];
  const set = (patch) => onChange({ ...settings, ...patch });

  const pill = {
    display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
    background: isDark ? '#050D12' : '#f0f0f0', borderRadius: 10, padding: '6px 10px',
  };
  const label = { fontSize: 12, fontWeight: 600, fontFamily: 'Inter,sans-serif', color: isDark ? '#999' : '#555', whiteSpace: 'nowrap' };
  const select = {
    fontSize: 12, fontWeight: 600, fontFamily: 'Inter,sans-serif', background: 'transparent', border: 'none',
    outline: 'none', color: isDark ? '#f0f0ee' : '#02070A', cursor: 'pointer',
  };

  return (
    <div className="flex items-center gap-2 py-2 flex-wrap">
      {/* Model */}
      <label style={pill} title={model.description}>
        <Film size={13} style={{ color: '#4CB8F0' }} />
        <select
          aria-label="Video model"
          value={model.key}
          onChange={e => set({ model: e.target.value })}
          style={select}
        >
          {options.models.map(m => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
      </label>

      {/* Resolution: all three shown, unsupported ones disabled so the limit is visible */}
      <Segmented
          isDark={isDark}
        ariaLabel="Resolution"
        value={settings.resolution}
        onPick={(resolution) => set({ resolution })}
        items={['480p', '720p', '1080p'].map(r => ({ key: r, text: r, disabled: !model.resolutions.includes(r) }))}
      />

      {/* Aspect ratio */}
      <label style={pill}>
        <span style={label}>Ratio</span>
        <select aria-label="Aspect ratio" value={settings.ratio} onChange={e => set({ ratio: e.target.value })} style={select}>
          {options.ratios.map(r => (
            <option key={r} value={r} disabled={r === 'adaptive' && attachmentCount === 0}>
              {r === 'adaptive' ? 'Match image' : r}
            </option>
          ))}
        </select>
      </label>

      {/* Duration */}
      <div style={pill}>
        <span style={{ ...label, minWidth: 28 }}>{settings.duration}s</span>
        <input
          type="range"
          min={model.minDuration}
          max={model.maxDuration}
          step={1}
          value={settings.duration}
          onChange={e => set({ duration: parseInt(e.target.value, 10) })}
          aria-label={`Duration in seconds (${model.minDuration} to ${model.maxDuration})`}
          style={{ width: 96, accentColor: '#0297DE' }}
        />
      </div>

      {/* Sound */}
      <button
        type="button"
        onClick={() => set({ audio: !settings.audio })}
        aria-pressed={settings.audio}
        title={settings.audio ? 'Sound on: dialogue, effects and music are generated with the clip' : 'Sound off: silent clip'}
        style={{ ...pill, border: 'none', cursor: 'pointer', color: settings.audio ? '#0297DE' : (isDark ? '#999' : '#555') }}
      >
        {settings.audio ? <Volume2 size={14} /> : <VolumeX size={14} />}
        <span style={{ ...label, color: 'inherit' }}>{settings.audio ? 'Sound on' : 'Sound off'}</span>
      </button>

      {/* How attached images are used */}
      {attachmentCount > 0 && (
        <Segmented
          isDark={isDark}
          ariaLabel="Use attached images as"
          value={settings.imageRole}
          onPick={(imageRole) => set({ imageRole })}
          items={options.imageRoles.map(r => ({
            key: r,
            text: VIDEO_IMAGE_ROLE_LABELS[r] || r,
            disabled: (r === 'first_frame' && attachmentCount !== 1) || (r === 'first_last' && attachmentCount !== 2),
          }))}
        />
      )}
    </div>
  );
}
