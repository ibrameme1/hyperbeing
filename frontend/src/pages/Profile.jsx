import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Briefcase, Zap, Building2, ArrowLeft, CheckCircle2, Loader2, Crown, CreditCard, Calendar, Trash2, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';

const CM = 10;

const INDUSTRIES = ['Technology', 'Finance', 'Healthcare', 'Education', 'Marketing', 'Design', 'Consulting', 'Real Estate', 'Media', 'Other'];
const USE_CASES = ['Investor pitches', 'Sales decks', 'Internal reports', 'Client proposals', 'Educational content', 'Product demos', 'Conference talks', 'Other'];

function PlanBadge({ plan }) {
  const styles = {
    free:  { bg: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)', label: 'Free' },
    basic: { bg: 'rgba(139,92,246,0.15)',  color: '#C4B5FD', label: 'Basic' },
    pro:   { bg: 'rgba(0,240,255,0.12)',   color: '#00F0FF', label: 'Pro' },
    ultra: { bg: 'rgba(251,191,36,0.15)',  color: '#FCD34D', label: 'Ultra' },
  };
  const s = styles[plan] || styles.free;
  return (
    <span className="text-xs font-bold px-2.5 py-1 rounded-lg" style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

export default function Profile() {
  const { user, logout, deleteAccount } = useAuth();
  const navigate = useNavigate();

  const [name, setName]         = useState('');
  const [bio, setBio]           = useState('');
  const [company, setCompany]   = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [useCase, setUseCase]   = useState('');
  const [industry, setIndustry] = useState('');

  const [email, setEmail] = useState('');
  const [nameError,  setNameError]  = useState('');
  const [emailError, setEmailError] = useState('');

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
      setEmail(p.email || '');
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
      await api.put('/auth/profile', { name, email, bio, company, jobTitle, useCase, industry });
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
    <div className="min-h-screen" style={{ background: '#0A0A0B' }}>
      {/* Header */}
      <div className="border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-70"
            style={{ color: 'rgba(255,255,255,0.5)' }}
          >
            <ArrowLeft size={16} /> Dashboard
          </button>
          <span style={{ color: 'rgba(255,255,255,0.15)' }}>/</span>
          <span className="text-sm font-medium text-white">Profile</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin" style={{ color: '#8B5CF6' }} /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* Left — subscription card */}
            <div className="md:col-span-1 space-y-4">
              {/* Plan card */}
              <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Your plan</span>
                  <PlanBadge plan={sub?.plan || 'free'} />
                </div>

                {creditsLeft !== null && creditsTotal !== null && (
                  <div className="mb-4">
                    <div className="flex justify-between text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      <span>Credits</span>
                      <span style={{ color: creditsPct <= 20 ? '#f87171' : '#C4B5FD' }}>
                        {creditsLeft.toLocaleString()} / {creditsTotal.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${creditsPct}%`,
                          background: creditsPct <= 20
                            ? 'linear-gradient(90deg, #f87171 0%, #fca5a5 100%)'
                            : 'linear-gradient(90deg, #8B5CF6 0%, #00F0FF 100%)',
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Subscription timing */}
                <div className="space-y-2 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {isPaid && (sub.status === 'cancelled' || sub.status === 'canceled') && periodEnd && (
                    <div className="flex items-start gap-2">
                      <Calendar size={12} className="mt-0.5 flex-shrink-0" style={{ color: '#f87171' }} />
                      <span style={{ color: '#f87171' }}>Cancelled — access ends <span className="font-semibold">{periodEnd}</span></span>
                    </div>
                  )}
                  {isPaid && sub.status !== 'cancelled' && sub.status !== 'canceled' && periodEnd && (
                    <div className="flex items-start gap-2">
                      <Calendar size={12} className="mt-0.5 flex-shrink-0" style={{ color: '#8B5CF6' }} />
                      <span>
                        {pendingPlan
                          ? <>On <span className="text-white/70 capitalize">{sub.plan}</span> until <span className="text-white/70">{periodEnd}</span>, then switches to <span className="text-white/70 capitalize">{pendingPlan}</span></>
                          : <>On <span className="text-white/70 capitalize">{sub.plan}</span> plan until <span className="text-white/70">{periodEnd}</span></>
                        }
                      </span>
                    </div>
                  )}
                  {nextPayment && !pendingPlan && sub.status !== 'cancelled' && sub.status !== 'canceled' && (
                    <div className="flex items-start gap-2">
                      <CreditCard size={12} className="mt-0.5 flex-shrink-0" style={{ color: '#00F0FF' }} />
                      <span>Next payment on <span className="text-white/70">{nextPayment}</span></span>
                    </div>
                  )}
                  {!isPaid && (
                    <div className="flex items-start gap-2">
                      <Zap size={12} className="mt-0.5 flex-shrink-0" style={{ color: '#f59e0b' }} />
                      <span>Free plan — <button onClick={() => navigate('/pricing')} className="underline" style={{ color: '#C4B5FD' }}>upgrade to unlock more</button></span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => navigate('/pricing')}
                  className="w-full mt-4 py-2.5 rounded-xl text-xs font-bold transition-opacity hover:opacity-80"
                  style={{ background: 'rgba(139,92,246,0.15)', color: '#C4B5FD', border: '1px solid rgba(139,92,246,0.2)' }}
                >
                  {isPaid ? 'Manage subscription' : 'View plans'}
                </button>
              </div>

              {/* Quick stats */}
              <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.35)' }}>Account</p>
                <div className="space-y-2 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <div className="flex justify-between">
                    <span>Email</span>
                    <span className="text-white/70 truncate ml-3 max-w-[140px]">{user?.email}</span>
                  </div>
                </div>
                <button
                  onClick={() => { logout(); navigate('/login'); }}
                  className="w-full mt-4 py-2 rounded-xl text-xs font-semibold transition-opacity hover:opacity-70"
                  style={{ background: 'rgba(248,113,113,0.08)', color: '#f87171', border: '1px solid rgba(248,113,113,0.15)' }}
                >
                  Sign out
                </button>
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="w-full mt-2 py-2 rounded-xl text-xs font-semibold transition-opacity hover:opacity-70 flex items-center justify-center gap-1.5"
                  style={{ background: 'transparent', color: 'rgba(248,113,113,0.5)', border: '1px solid rgba(248,113,113,0.1)' }}
                >
                  <Trash2 size={11} /> Delete account
                </button>
              </div>
            </div>

            {/* Right — profile form */}
            <div className="md:col-span-2">
              <div className="rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white flex-shrink-0"
                       style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' }}>
                    {(name || user?.name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-white text-sm">{name || user?.name}</p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Optional — helps personalise your experience</p>
                  </div>
                </div>

                <form onSubmit={handleSave} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>Display name</label>
                    <input
                      value={name} onChange={e => setName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl text-sm text-white outline-none transition-all"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                      placeholder="Your name"
                      onFocus={() => setNameError('')}
                      onBlur={() => { if (!name.trim()) setNameError("Name can't be empty."); }}
                    />
                    {nameError && (
                      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#ef4444', marginTop: 4 }}>{nameError}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>Email</label>
                    <input
                      type="email"
                      value={email} onChange={e => setEmail(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl text-sm text-white outline-none transition-all"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                      placeholder="your@email.com"
                      onFocus={() => setEmailError('')}
                      onBlur={() => { if (email && !EMAIL_RE.test(email)) setEmailError('Enter a valid email address.'); }}
                    />
                    {emailError && (
                      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#ef4444', marginTop: 4 }}>{emailError}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>Bio <span style={{ color: 'rgba(255,255,255,0.25)' }}>(optional)</span></label>
                    <textarea
                      value={bio} onChange={e => setBio(e.target.value)}
                      rows={2}
                      className="w-full px-4 py-2.5 rounded-xl text-sm text-white outline-none transition-all resize-none"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                      placeholder="A short bio about you..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>Company <span style={{ color: 'rgba(255,255,255,0.25)' }}>(optional)</span></label>
                      <input
                        value={company} onChange={e => setCompany(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl text-sm text-white outline-none"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                        placeholder="Company name"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>Job title <span style={{ color: 'rgba(255,255,255,0.25)' }}>(optional)</span></label>
                      <input
                        value={jobTitle} onChange={e => setJobTitle(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl text-sm text-white outline-none"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                        placeholder="Your role"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>Industry <span style={{ color: 'rgba(255,255,255,0.25)' }}>(optional)</span></label>
                      <select
                        value={industry} onChange={e => setIndustry(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl text-sm text-white outline-none"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                      >
                        <option value="" style={{ background: '#1a1a2e' }}>Select industry</option>
                        {INDUSTRIES.map(i => <option key={i} value={i} style={{ background: '#1a1a2e' }}>{i}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>Main use case <span style={{ color: 'rgba(255,255,255,0.25)' }}>(optional)</span></label>
                      <select
                        value={useCase} onChange={e => setUseCase(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl text-sm text-white outline-none"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                      >
                        <option value="" style={{ background: '#1a1a2e' }}>Select use case</option>
                        {USE_CASES.map(u => <option key={u} value={u} style={{ background: '#1a1a2e' }}>{u}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={saving || !!(nameError || emailError)}
                      className="px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-80 disabled:opacity-50 flex items-center gap-2"
                      style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' }}
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                      Save profile
                    </button>
                    {saved && (
                      <motion.span
                        initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                        className="flex items-center gap-1.5 text-sm font-medium"
                        style={{ color: '#34D399' }}
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
            style={{ background: 'rgba(0,0,0,0.75)' }}
            onClick={e => { if (e.target === e.currentTarget) setShowDeleteModal(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl p-6"
              style={{ background: '#141416', border: '1px solid rgba(248,113,113,0.2)' }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                     style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.2)' }}>
                  <AlertTriangle size={18} style={{ color: '#f87171' }} />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Delete account</h3>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>This is permanent and cannot be undone</p>
                </div>
              </div>

              <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.55)' }}>
                All your presentations, credits, and billing data will be permanently deleted. If you have an active subscription, cancel it first via <button onClick={() => { setShowDeleteModal(false); navigate('/pricing'); }} className="underline" style={{ color: '#C4B5FD' }}>Manage subscription</button> before deleting.
              </p>

              <div className="mb-5">
                <label className="block text-xs font-semibold mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Type <span className="text-white font-bold">DELETE</span> to confirm
                </label>
                <input
                  value={deleteConfirm}
                  onChange={e => setDeleteConfirm(e.target.value)}
                  placeholder="DELETE"
                  className="w-full px-4 py-2.5 rounded-xl text-sm text-white outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(248,113,113,0.25)' }}
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setShowDeleteModal(false); setDeleteConfirm(''); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-70"
                  style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteConfirm !== 'DELETE' || deleting}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-opacity hover:opacity-80 disabled:opacity-30 flex items-center justify-center gap-2"
                  style={{ background: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid rgba(248,113,113,0.25)' }}
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
