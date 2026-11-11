import { useEffect, useRef, useState } from 'react';
import { FileText, FileSpreadsheet, FileJson, Presentation, Plus, Loader2, Trash2, Download, Check } from 'lucide-react';
import api from '../api/client';
import { uploadAsset, assetMetaLabel, checkFile, ACCEPT_DOCUMENTS } from '../utils/fileAttachment';

// ─── Deck asset library ────────────────────────────────────────────────────
// The files attached to this deck (its brief, or added later). When adding
// slides or editing one, the user ticks which files Nova should read again for
// THIS request — no re-uploading. Nova always knows the deck's files through
// the summary it made when the deck was created; ticking a file makes it read
// the file in full with the new request in mind. New files can be added here
// (uploaded once, straight into the library).

const ICONS = { pdf: FileText, pptx: Presentation, xlsx: FileSpreadsheet, csv: FileSpreadsheet, tsv: FileSpreadsheet, docx: FileText, txt: FileText, md: FileText, json: FileJson };
const ACCEPT_ATTR = Object.values(ACCEPT_DOCUMENTS).flat().join(',');

export default function AssetLibrary({ presentationId, selected, onChange, defaultSelectAll = false, dark = false, title = 'Files Nova can use' }) {
  const [assets, setAssets] = useState(null);
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState([]);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const selectedSet = new Set(selected);

  useEffect(() => {
    let alive = true;
    api.get('/assets', { params: { presentationId } })
      .then(({ data }) => {
        if (!alive) return;
        setAssets(data.assets || []);
        setImages(data.images || []);
        if (defaultSelectAll) onChange((data.assets || []).map(a => a.id));
      })
      .catch(() => alive && setAssets([]));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentationId]);

  function toggle(id) {
    onChange(selectedSet.has(id) ? selected.filter(x => x !== id) : [...selected, id]);
  }

  function addFiles(fileList) {
    setError('');
    Array.from(fileList || []).forEach(async file => {
      const err = checkFile(file, { allowImages: false });
      if (err) { setError(err); return; }
      setUploading(prev => [...prev, file.name]);
      try {
        const asset = await uploadAsset(api, file, { presentationId });
        setAssets(prev => [...(prev || []), asset]);
        onChange(prevSel => [...(Array.isArray(prevSel) ? prevSel : selected), asset.id]);
      } catch (e) {
        setError(e.message);
      } finally {
        setUploading(prev => prev.filter(n => n !== file.name));
      }
    });
  }

  async function remove(asset) {
    if (!window.confirm(`Remove "${asset.name}" from this deck's files?`)) return;
    try {
      await api.delete(`/assets/${asset.id}`);
      setAssets(prev => prev.filter(a => a.id !== asset.id));
      onChange(selected.filter(x => x !== asset.id));
    } catch {
      setError('Couldn\'t remove that file. Please try again.');
    }
  }

  async function download(asset) {
    try {
      const { data } = await api.get(`/assets/${asset.id}/file`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url; a.download = asset.name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      setError('Couldn\'t download that file.');
    }
  }

  const text = dark ? 'text-white/85' : 'text-gray-800 dark:text-zinc-100';
  const muted = dark ? 'text-white/45' : 'text-gray-500 dark:text-zinc-400';
  const rowBg = dark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700';

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className={`text-sm font-semibold ${text}`}>{title}</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={`flex items-center gap-1 text-xs ${muted} hover:text-[#8B80FF] transition-colors`}
        >
          <Plus size={12} /> Add file
        </button>
        <input ref={inputRef} type="file" multiple accept={ACCEPT_ATTR} className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
      </div>

      {assets === null ? (
        <p className={`text-xs ${muted} flex items-center gap-1.5`}><Loader2 size={12} className="animate-spin" /> Loading files…</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {assets.length === 0 && uploading.length === 0 && (
            <p className={`text-xs ${muted}`}>No files yet. Add a PDF, PowerPoint, Excel, Word or CSV file and Nova will read it for these slides.</p>
          )}
          {assets.map(a => {
            const Icon = ICONS[a.kind] || FileText;
            const on = selectedSet.has(a.id);
            return (
              <div key={a.id} className={`flex items-center gap-2.5 rounded-xl px-3 py-2 transition-colors ${rowBg}`}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-label={`Let Nova read ${a.name}`}
                  onClick={() => toggle(a.id)}
                  className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border transition-colors"
                  style={{ background: on ? '#5B50FF' : 'transparent', borderColor: on ? '#5B50FF' : (dark ? 'rgba(255,255,255,0.3)' : '#c4c4c4') }}
                >
                  {on && <Check size={12} className="text-white" />}
                </button>
                <Icon size={16} className="flex-shrink-0" style={{ color: '#0F9D58' }} />
                <button type="button" onClick={() => toggle(a.id)} className="min-w-0 flex-1 text-left">
                  <p className={`text-xs font-medium truncate ${text}`} title={a.name}>{a.name}</p>
                  <p className={`text-[11px] ${muted}`}>{assetMetaLabel(a)}</p>
                </button>
                <button type="button" onClick={() => download(a)} aria-label={`Download ${a.name}`} className={`p-1 rounded-md ${muted} hover:text-[#8B80FF]`}><Download size={13} /></button>
                <button type="button" onClick={() => remove(a)} aria-label={`Remove ${a.name}`} className={`p-1 rounded-md ${muted} hover:text-red-500`}><Trash2 size={13} /></button>
              </div>
            );
          })}
          {uploading.map(n => (
            <div key={n} className={`flex items-center gap-2 rounded-xl px-3 py-2 ${rowBg}`}>
              <Loader2 size={14} className="animate-spin text-[#8B80FF]" />
              <p className={`text-xs truncate ${muted}`}>Checking {n}…</p>
            </div>
          ))}
          {images.length > 0 && (
            <div className="flex items-center gap-1.5 mt-1" title="Images from your brief: Nova always has these">
              {images.slice(0, 8).map((im, i) => (
                <img key={i} src={im.data} alt={im.name} className="h-8 w-8 rounded-lg object-cover border border-black/10" />
              ))}
              <span className={`text-[11px] ${muted} ml-1`}>Brief images, always available</span>
            </div>
          )}
          {selected.length > 0 && (
            <p className={`text-[11px] ${muted}`}>Nova will re-read {selected.length === 1 ? 'this file' : `these ${selected.length} files`} for this request. Untick to rely on its summary of the deck's files (faster).</p>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-xs text-red-500 mt-2">{error}</p>}
    </div>
  );
}
