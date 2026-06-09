import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Briefcase, Zap, Building2, ArrowLeft, CheckCircle2, Loader2, Crown, CreditCard, Calendar, Trash2, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';

const CM = 10;

const INDUSTRIES = ['Technology', 'Finance', 'Healthcare', 'Education', 'Marketing', 'Design', 'Consulting', 'Real Estate', 'Media', 'Other'];
const USE_CASES = ['Investor pitches', 'Sales decks', 'Internal reports', 'Client proposals', 'Educational content', 'Product demos', 'Conference talks', 'Other'];

const inputStyle = {
  width: '100%',
  padding: '10px 16px',
  background: '#0f0f0f',
  border: '0.5px solid #1e1e1e',
  borderRadius: 6,
  color: '#f0f0ee',
  fontFamily: 'Inter,sans-serif',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle = {
  display: 'block',
  fontFamily: 'Inter,sans-serif',
  fontSize: 12,
  fontWeight: 600,
  color: '#888888',
  marginBottom: 6,
};

function PlanBadge({ plan }) {
  const styles = {
    free:  { bg: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)', label: 'Free' },
    basic: { bg: 'rgba(91,80,255,0.1)',    color: '#8B80FF', label: 'Basic' },
    pro:   { bg: 'rgba(91,80,255,0.1)',    color: '#8B80FF', label: 'Pro' },
    ultra: { bg: 'rgba(251,191,36,0.15)',  color: '#FCD34D', label: 'Ultra' },
  };
  const s = styles[plan] || styles.free;
  return (
    <span
      style={{
        fontFamily: 'Inter,sans-serif',
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        padding: '3px 8px',
        borderRadius: 4,
        background: s.bg,
        border: '0.5px solid rgba(91,80,255,0.3)',
        color: s.color,
      }}
    >
      {s.label}
    </span>
  );
}

const cardStyle = {
  background: '#141414',
  border: '0.5px solid #1e1e1e',
  borderRadius: 8,
  padding: 20,
};

const eyebrowStyle = {
  fontFamily: 'JetBrains Mono,monospace',
  fontSize: 9,
  letterSpacing: '0.15em',
  color: '#8B80FF',
  textTransform: 'uppercase',
  marginBottom: 12,
};

export default function Profile() {
  const { user, logout, deleteAccount } = useAuth();
  const navigate = useNavigate();

  const [name, setName]         = useState('');
  const [bio, setBio]           = useState('');
  const [company, setCompany]   = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [useCase, setUseCase]   = useState('');
  const [industry, setIndustry] = useState('');

  const [sub, setSub]     = useState(null);
  const [plan, setPlan]   = useState(null);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/auth/profile'),
      api.get('/billing/subscription'),
    ]).then(([profileRes, billingRes]) => {
      const p = profileRes.data;
      setName(p.name || '');
      setBio(p.profile_data?.bio || '');
      setCompany(p.profile_data?.company || '');
      setJobTitle(p.profile_data?.jobTitle || '');
      setUseCase(p.profile_data?.useCase || '');
      setIndustry(p.profile_data?.industry || '');
      setSub(billingRes.data.subscription);
      setPlan(billingRes.data.plan);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteAccount();
      navigate('/login');
    } catch {
      alert('Could not delete account. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/auth/profile', { name, bio, company, jobTitle, useCase, industry });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      alert('Could not save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function formatDate(iso) {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  const creditsLeft   = sub ? sub.credits_remaining * CM : null;
  const creditsTotal  = plan ? plan.credits * CM : null;
  const creditsPct    = creditsTotal > 0 ? Math.min(100, Math.round((creditsLeft / creditsTotal) * 100)) : 0;
  const periodEnd     = sub?.current_period_end ? formatDate(sub.current_period_end) : null;
  const nextPayment   = sub?.next_payment_date   ? formatDate(sub.next_payment_date)  : null;
  const pendingPlan   = sub?.pending_plan;
  const isPaid        = sub?.plan && sub.plan !== 'free';

  return (
    <div className="min-h-screen" style={{ background: '#080808' }}>
      {/* Header */}
      <div style={{ borderBottom: '0.5px solid #1e1e1e' }}>
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-70"
            style={{ color: '#888888', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}
          >
            <ArrowLeft size={16} /> Dashboard
          </button>
          <span style={{ color: '#2a2a2a' }}>/</span>
          <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 14, fontWeight: 500, color: '#f0f0ee' }}>Profile</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin" style={{ color: '#5B50FF' }} /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* Left — subscription card */}
            <div className="md:col-span-1 space-y-4">
              {/* Plan card */}
              <div style={cardStyle}>
                <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
                  <p style={{ ...eyebrowStyle, marginBottom: 0 }}>Your plan</p>
                  <PlanBadge plan={sub?.plan || 'free'} />
                </div>

                {creditsLeft !== null && creditsTotal !== null && (
                  <div style={{ marginBottom: 16 }}>
                    <div className="flex justify-between" style={{ marginBottom: 6 }}>
                      <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: '#888888' }}>Credits</span>
                      <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: creditsPct <= 20 ? '#ef4444' : '#8B80FF' }}>
                        {creditsLeft.toLocaleString()} / {creditsTotal.toLocaleString()}
                      </span>
                    </div>
                    <div style={{ height: 4, borderRadius: 9999, overflow: 'hidden', background: 'rgba(255,255,255,0.06)' }}>
                      <div
                        style={{
                          width: `${creditsPct}%`,
                          height: '100%',
                          borderRadius: 9999,
                          background: creditsPct <= 20 ? '#ef4444' : '#5B50FF',
                          transition: 'width 0.5s',
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Subscription timing */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {isPaid && (sub.status === 'cancelled' || sub.status === 'canceled') && periodEnd && (
                    <div className="flex items-start gap-2">
                      <Calendar size={12} style={{ color: '#ef4444', marginTop: 2, flexShrink: 0 }} />
                      <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: '#ef4444' }}>Cancelled — access ends <span style={{ fontWeight: 600 }}>{periodEnd}</span></span>
                    </div>
                  )}
                  {isPaid && sub.status !== 'cancelled' && sub.status !== 'canceled' && periodEnd && (
                    <div className="flex items-start gap-2">
                      <Calendar size={12} style={{ color: '#5B50FF', marginTop: 2, flexShrink: 0 }} />
                      <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: '#888888' }}>
                        {pendingPlan
                          ? <>On <span style={{ color: '#b8b8b8' }} className="capitalize">{sub.plan}</span> until <span style={{ color: '#b8b8b8' }}>{periodEnd}</span>, then switches to <span style={{ color: '#b8b8b8' }} className="capitalize">{pendingPlan}</span></>
                          : <>On <span style={{ color: '#b8b8b8' }} className="capitalize">{sub.plan}</span> plan until <span style={{ color: '#b8b8b8' }}>{periodEnd}</span></>
                        }
                      </span>
                    </div>
                  )}
                  {nextPayment && !pendingPlan && sub.status !== 'cancelled' && sub.status !== 'canceled' && (
                    <div className="flex items-start gap-2">
                      <CreditCard size={12} style={{ color: '#8B80FF', marginTop: 2, flexShrink: 0 }} />
                      <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: '#888888' }}>Next payment on <span style={{ color: '#b8b8b8' }}>{nextPayment}</span></span>
                    </div>
                  )}
                  {!isPaid && (
                    <div className="flex items-start gap-2">
                      <Zap size={12} style={{ color: '#f59e0b', marginTop: 2, flexShrink: 0 }} />
                      <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: '#888888' }}>Free plan — <button onClick={() => navigate('/pricing')} style={{ color: '#8B80FF', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: 12, fontFamily: 'Inter,sans-serif' }}>upgrade to unlock more</button></span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => navigate('/pricing')}
                  style={{
                    width: '100%',
                    marginTop: 16,
                    padding: '10px 0',
                    borderRadius: 6,
                    fontFamily: 'Inter,sans-serif',
                    fontSize: 12,
                    fontWeight: 600,
                    background: 'rgba(91,80,255,0.1)',
                    color: '#8B80FF',
                    border: '0.5px solid rgba(91,80,255,0.3)',
                    cursor: 'pointer',
                    transition: 'opacity 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  {isPaid ? 'Manage subscription' : 'View plans'}
                </button>
              </div>

              {/* Account card */}
              <div style={cardStyle}>
                <p style={eyebrowStyle}>Account</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="flex justify-between">
                    <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: '#888888' }}>Email</span>
                    <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: '#b8b8b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{user?.email}</span>
                  </div>
                </div>
                <button
                  onClick={() => { logout(); navigate('/login'); }}
                  style={{
                    width: '100%',
                    marginTop: 16,
                    padding: '8px 0',
                    borderRadius: 6,
                    fontFamily: 'Inter,sans-serif',
                    fontSize: 12,
                    fontWeight: 600,
                    background: 'rgba(239,68,68,0.08)',
                    color: '#ef4444',
                    border: '0.5px solid rgba(239,68,68,0.15)',
                    cursor: 'pointer',
                    transition: 'opacity 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  Sign out
                </button>
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="flex items-center justify-center gap-1.5"
                  style={{
                    width: '100%',
                    marginTop: 8,
                    padding: '8px 0',
                    borderRadius: 6,
                    fontFamily: 'Inter,sans-serif',
                    fontSize: 12,
                    fontWeight: 600,
                    background: 'transparent',
                    color: 'rgba(239,68,68,0.5)',
                    border: '0.5px solid rgba(239,68,68,0.1)',
                    cursor: 'pointer',
                    transition: 'opacity 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  <Trash2 size={11} /> Delete account
                </button>
              </div>
            </div>

            {/* Right — profile form */}
            <div className="md:col-span-2">
              <div style={cardStyle}>
                <div className="flex items-center gap-3" style={{ marginBottom: 24 }}>
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white flex-shrink-0"
                    style={{ background: '#5B50FF' }}
                  >
                    {(name || user?.name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p style={{ fontFamily: 'Inter,sans-serif', fontWeight: 600, color: '#f0f0ee', fontSize: 14 }}>{name || user?.name}</p>
                    <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: '#888888' }}>Optional — helps personalise your experience</p>
                  </div>
                </div>

                <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={labelStyle}>Display name</label>
                    <input
                      value={name} onChange={e => setName(e.target.value)}
                      style={inputStyle}
                      placeholder="Your name"
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Bio <span style={{ color: '#555555' }}>(optional)</span></label>
                    <textarea
                      value={bio} onChange={e => setBio(e.target.value)}
                      rows={2}
                      style={{ ...inputStyle, resize: 'none', lineHeight: 1.6 }}
                      placeholder="A short bio about you..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label style={labelStyle}>Company <span style={{ color: '#555555' }}>(optional)</span></label>
                      <input
                        value={company} onChange={e => setCompany(e.target.value)}
                        style={inputStyle}
                        placeholder="Company name"
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Job title <span style={{ color: '#555555' }}>(optional)</span></label>
                      <input
                        value={jobTitle} onChange={e => setJobTitle(e.target.value)}
                        style={inputStyle}
                        placeholder="Your role"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label style={labelStyle}>Industry <span style={{ color: '#555555' }}>(optional)</span></label>
                      <select
                        value={industry} onChange={e => setIndustry(e.target.value)}
                        style={inputStyle}
                      >
                        <option value="" style={{ background: '#141414' }}>Select industry</option>
                        {INDUSTRIES.map(i => <option key={i} value={i} style={{ background: '#141414' }}>{i}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Main use case <span style={{ color: '#555555' }}>(optional)</span></label>
                      <select
                        value={useCase} onChange={e => setUseCase(e.target.value)}
                        style={inputStyle}
                      >
                        <option value="" style={{ background: '#141414' }}>Select use case</option>
                        {USE_CASES.map(u => <option key={u} value={u} style={{ background: '#141414' }}>{u}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex items-center gap-2 disabled:opacity-50"
                      style={{
                        padding: '10px 24px',
                        borderRadius: 6,
                        fontFamily: 'Inter,sans-serif',
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#fff',
                        background: '#5B50FF',
                        border: 'none',
                        cursor: saving ? 'not-allowed' : 'pointer',
                        transition: 'opacity 0.2s',
                      }}
                      onMouseEnter={e => { if (!saving) e.currentTarget.style.opacity = '0.85'; }}
                      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                      Save profile
                    </button>
                    {saved && (
                      <motion.span
                        initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                        className="flex items-center gap-1.5 text-sm font-medium"
                        style={{ color: '#22c55e', fontFamily: 'Inter,sans-serif' }}
                      >
                        <CheckCircle2 size={14} /> Saved
                      </motion.span>
                    )}
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Delete account modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
            onClick={e => { if (e.target === e.currentTarget) setShowDeleteModal(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md"
              style={{ background: '#141414', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: 24 }}
            >
              <div className="flex items-center gap-3" style={{ marginBottom: 16 }}>
                <div
                  className="w-10 h-10 flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(239,68,68,0.12)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 8 }}
                >
                  <AlertTriangle size={18} style={{ color: '#ef4444' }} />
                </div>
                <div>
                  <h3 style={{ fontFamily: 'Inter,sans-serif', fontWeight: 700, color: '#f0f0ee', fontSize: 15 }}>Delete account</h3>
                  <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: '#888888' }}>This is permanent and cannot be undone</p>
                </div>
              </div>

              <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: '#b8b8b8', marginBottom: 20, lineHeight: 1.6 }}>
                All your presentations, credits, and billing data will be permanently deleted. If you have an active subscription, cancel it first via <button onClick={() => { setShowDeleteModal(false); navigate('/pricing'); }} style={{ color: '#8B80FF', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: 13, fontFamily: 'Inter,sans-serif' }}>Manage subscription</button> before deleting.
              </p>

              <div style={{ marginBottom: 20 }}>
                <label style={{ ...labelStyle, marginBottom: 8 }}>
                  Type <span style={{ color: '#f0f0ee', fontWeight: 700 }}>DELETE</span> to confirm
                </label>
                <input
                  value={deleteConfirm}
                  onChange={e => setDeleteConfirm(e.target.value)}
                  placeholder="DELETE"
                  style={{ ...inputStyle, border: '0.5px solid rgba(239,68,68,0.25)' }}
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setShowDeleteModal(false); setDeleteConfirm(''); }}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 6,
                    fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 600,
                    background: 'rgba(255,255,255,0.07)', color: '#b8b8b8',
                    border: '0.5px solid #1e1e1e', cursor: 'pointer',
                    transition: 'opacity 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteConfirm !== 'DELETE' || deleting}
                  className="flex items-center justify-center gap-2"
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 6,
                    fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 700,
                    background: '#ef4444', color: '#fff',
                    border: 'none', cursor: deleteConfirm !== 'DELETE' || deleting ? 'not-allowed' : 'pointer',
                    opacity: deleteConfirm !== 'DELETE' || deleting ? 0.3 : 1,
                    transition: 'opacity 0.2s',
                  }}
                >
                  {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Delete my account
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
