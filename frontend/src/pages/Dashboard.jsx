import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import {
  Sparkles, Paperclip, Send, LogOut, Plus, X,
  FileImage, Clock, Trash2, ChevronRight, Loader2
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';

function greeting(name) {
  const h = new Date().getHours();
  const time = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  return `Good ${time}, ${name.split(' ')[0]}`;
}

function PresentationCard({ pres, onDelete }) {
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e) {
    e.stopPropagation();
    setDeleting(true);
    try {
      await api.delete(`/presentations/${pres.id}`);
      onDelete(pres.id);
    } catch { setDeleting(false); }
  }

  const statusColors = {
    chat: 'bg-blue-100 text-blue-600',
    ready: 'bg-purple-100 text-purple-600',
    generating: 'bg-orange-100 text-orange-600',
    completed: 'bg-green-100 text-green-600',
  };

  const statusLabels = {
    chat: 'Draft',
    ready: 'Ready',
    generating: 'Generating',
    completed: 'Complete',
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => navigate(`/presentations/${pres.id}`)}
      className="bg-white rounded-3xl p-5 shadow-ios cursor-pointer group relative"
    >
      {/* Thumbnail placeholder */}
      <div className="aspect-[16/9] rounded-2xl mb-4 overflow-hidden flex items-center justify-center"
           style={{ background: 'linear-gradient(135deg, #667eea22 0%, #764ba222 100%)' }}>
        <Sparkles className="w-8 h-8 text-ios-indigo opacity-40" />
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 text-sm truncate">{pres.title}</h3>
          <p className="text-xs text-ios-gray1 mt-0.5 flex items-center gap-1">
            <Clock size={11} />
            {new Date(pres.updated_at).toLocaleDateString()}
          </p>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg flex-shrink-0 ${statusColors[pres.status] || 'bg-gray-100 text-gray-600'}`}>
          {statusLabels[pres.status] || pres.status}
        </span>
      </div>

      <button
        onClick={handleDelete}
        disabled={deleting}
        className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 rounded-xl bg-ios-gray5 flex items-center justify-center hover:bg-red-50 hover:text-red-500"
      >
        {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
      </button>
    </motion.div>
  );
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [presentations, setPresentations] = useState([]);
  const [presLoading, setPresLoading] = useState(true);
  const textareaRef = useRef(null);

  useEffect(() => {
    api.get('/presentations')
      .then(r => setPresentations(r.data.presentations || []))
      .finally(() => setPresLoading(false));
  }, []);

  const onDrop = useCallback(acceptedFiles => {
    acceptedFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        setAttachments(prev => [...prev, {
          id: Math.random().toString(36).slice(2),
          name: file.name,
          type: file.type.startsWith('image/') ? 'image' : 'file',
          mimeType: file.type,
          data: e.target.result,
        }]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    noClick: true,
    accept: { 'image/*': [] },
  });

  function removeAttachment(id) {
    setAttachments(prev => prev.filter(a => a.id !== id));
  }

  async function handleSubmit() {
    if (!input.trim() && attachments.length === 0) return;
    setLoading(true);
    try {
      const { data } = await api.post('/presentations', {
        message: input.trim(),
        attachments: attachments.map(a => ({ type: a.type, name: a.name, data: a.data, mimeType: a.mimeType })),
      });
      navigate(`/presentations/${data.presentation.id}`);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
  }

  function handleDeletePresentation(id) {
    setPresentations(prev => prev.filter(p => p.id !== id));
  }

  return (
    <div className="min-h-screen" style={{ background: '#F2F2F7' }}>
      {/* Navbar */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-4"
           style={{ background: 'rgba(242,242,247,0.85)', backdropFilter: 'blur(20px)' }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            <Sparkles size={16} className="text-white" />
          </div>
          <span className="font-bold text-gray-900 text-lg tracking-tight">HyperBeing</span>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 text-ios-gray1 hover:text-gray-900 transition-colors text-sm font-medium"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </nav>

      <main className="max-w-2xl mx-auto px-4 py-10">
        {/* Greeting */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mb-8"
        >
          <p className="text-xs font-semibold tracking-widest text-ios-gray1 uppercase mb-1">
            {greeting(user?.name || 'there')}
          </p>
          <h1 className="text-4xl font-bold text-gray-900 leading-tight tracking-tight">
            What would you<br />like to create?
          </h1>
        </motion.div>

        {/* Composer */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        >
          <div
            {...getRootProps()}
            className={`bg-white rounded-3xl shadow-ios-md transition-all duration-200 ${
              isDragActive ? 'ring-2 ring-ios-blue shadow-ios-lg' : ''
            }`}
          >
            <input {...getInputProps()} />

            {/* Attachment strip */}
            <AnimatePresence>
              {attachments.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-4 pt-4 flex gap-2 flex-wrap"
                >
                  {attachments.map(att => (
                    <motion.div
                      key={att.id}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="relative group"
                    >
                      {att.type === 'image' ? (
                        <img
                          src={att.data}
                          alt={att.name}
                          className="h-16 w-16 rounded-xl object-cover border border-ios-gray5"
                        />
                      ) : (
                        <div className="h-16 w-16 rounded-xl bg-ios-gray5 flex flex-col items-center justify-center gap-1">
                          <FileImage size={20} className="text-ios-gray1" />
                          <span className="text-[10px] text-ios-gray1 truncate w-full text-center px-1">{att.name}</span>
                        </div>
                      )}
                      <button
                        onClick={() => removeAttachment(att.id)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-800 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={10} />
                      </button>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="p-4">
              {isDragActive ? (
                <div className="flex flex-col items-center justify-center py-8 text-ios-blue">
                  <FileImage size={32} className="mb-2 opacity-60" />
                  <p className="text-sm font-medium">Drop images here</p>
                </div>
              ) : (
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe your presentation, drop in a brief, paste your content, share a logo — tell me everything…"
                  rows={4}
                  className="w-full resize-none border-none outline-none text-gray-800 placeholder:text-ios-gray2 text-base bg-transparent leading-relaxed"
                />
              )}
            </div>

            {/* Bottom bar */}
            <div className="flex items-center justify-between px-4 pb-4 pt-2 border-t border-ios-gray5">
              <button
                onClick={open}
                className="flex items-center gap-1.5 text-ios-gray1 hover:text-ios-blue transition-colors text-sm font-medium"
              >
                <Paperclip size={16} />
                Attach
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading || (!input.trim() && attachments.length === 0)}
                className="ios-btn py-2 px-5 text-sm"
              >
                {loading ? (
                  <><Loader2 size={15} className="animate-spin" /> Starting…</>
                ) : (
                  <><Send size={15} /> Create</>
                )}
              </button>
            </div>
          </div>

          <p className="text-center text-xs text-ios-gray2 mt-3">
            ⌘ + Enter to submit · Drop images to attach
          </p>
        </motion.div>

        {/* Recent presentations */}
        {(presLoading || presentations.length > 0) && (
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-12"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900 text-lg">Recent</h2>
              <button
                onClick={() => setInput('')}
                className="flex items-center gap-1 text-ios-blue text-sm font-medium"
              >
                <Plus size={16} />
                New
              </button>
            </div>

            {presLoading ? (
              <div className="grid grid-cols-2 gap-4">
                {[0,1,2,3].map(i => (
                  <div key={i} className="bg-white rounded-3xl p-5 shadow-ios">
                    <div className="aspect-[16/9] rounded-2xl skeleton mb-4" />
                    <div className="h-4 rounded-lg skeleton mb-2 w-3/4" />
                    <div className="h-3 rounded-lg skeleton w-1/2" />
                  </div>
                ))}
              </div>
            ) : (
              <motion.div layout className="grid grid-cols-2 gap-4">
                <AnimatePresence>
                  {presentations.map(p => (
                    <PresentationCard key={p.id} pres={p} onDelete={handleDeletePresentation} />
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </motion.section>
        )}
      </main>
    </div>
  );
}
