/* Reusable skeleton shapes — all use the global .skeleton shimmer class from index.css */

export function SkeletonBlock({ width = '100%', height = 16, radius = 8, className = '' }) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width, height, borderRadius: radius, flexShrink: 0 }}
    />
  );
}

export function SkeletonText({ lines = 3, widths, gap = 8 }) {
  const ws = widths || ['100%', '80%', '60%'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBlock key={i} width={ws[i % ws.length]} height={13} radius={6} />
      ))}
    </div>
  );
}

export function SkeletonCard({ aspectRatio = '16/9' }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)' }}>
      <div className="skeleton w-full" style={{ aspectRatio }} />
      <div className="p-4 space-y-2">
        <SkeletonBlock width="75%" height={14} radius={6} />
        <SkeletonBlock width="50%" height={11} radius={6} />
      </div>
    </div>
  );
}

export function SkeletonPresentationViewer() {
  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-page)', overflow: 'hidden' }}>
      {/* Filmstrip sidebar */}
      <div style={{ width: 140, borderRight: '0.5px solid var(--border)', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', flexShrink: 0 }}>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div key={i} style={{ width: '100%', aspectRatio: '16/9', borderRadius: 8 }} className="skeleton" />
        ))}
      </div>

      {/* Main slide area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
        {/* Nav bar top */}
        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <SkeletonBlock width={120} height={32} radius={8} />
          <div style={{ display: 'flex', gap: 8 }}>
            <SkeletonBlock width={80} height={32} radius={8} />
            <SkeletonBlock width={80} height={32} radius={8} />
          </div>
        </div>
        {/* Slide canvas */}
        <div style={{ width: '100%', maxWidth: 800, aspectRatio: '16/9', borderRadius: 12 }} className="skeleton" />
        {/* Slide nav controls */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <SkeletonBlock width={36} height={36} radius={8} />
          <SkeletonBlock width={60} height={16} radius={6} />
          <SkeletonBlock width={36} height={36} radius={8} />
        </div>
      </div>

      {/* Edit panel */}
      <div style={{ width: 280, borderLeft: '0.5px solid var(--border)', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16, flexShrink: 0 }}>
        <SkeletonBlock width="60%" height={18} radius={6} />
        <SkeletonBlock width="100%" height={80} radius={10} />
        <SkeletonBlock width="100%" height={36} radius={8} />
        <div style={{ marginTop: 8 }}>
          <SkeletonBlock width="50%" height={14} radius={6} className="mb-3" />
          <SkeletonText lines={4} widths={['100%', '90%', '80%', '65%']} />
        </div>
      </div>
    </div>
  );
}

export function SkeletonDashboardPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>
      {/* Nav */}
      <div style={{ padding: '12px 16px' }}>
        <div style={{ borderRadius: 12, padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)', border: '0.5px solid var(--border)' }}>
          <SkeletonBlock width={140} height={28} radius={7} />
          <div style={{ display: 'flex', gap: 10 }}>
            <SkeletonBlock width={32} height={32} radius={8} />
            <SkeletonBlock width={32} height={32} radius={16} />
          </div>
        </div>
      </div>
      {/* Hero */}
      <div style={{ maxWidth: 672, margin: '0 auto', padding: '48px 16px 40px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <SkeletonBlock width={220} height={36} radius={8} />
          <SkeletonBlock width={160} height={20} radius={6} />
        </div>
        {/* Composer card */}
        <div style={{ borderRadius: 16, border: '0.5px solid var(--border)', overflow: 'hidden', background: 'var(--bg-card)' }}>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SkeletonBlock width="80%" height={16} radius={6} />
            <SkeletonBlock width="60%" height={16} radius={6} />
            <SkeletonBlock width="40%" height={16} radius={6} />
          </div>
          <div style={{ borderTop: '0.5px solid var(--border)', padding: '12px 20px', display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <SkeletonBlock width={80} height={30} radius={8} />
              <SkeletonBlock width={80} height={30} radius={8} />
            </div>
            <SkeletonBlock width={80} height={36} radius={10} />
          </div>
        </div>
      </div>
      {/* Recents grid */}
      <div style={{ maxWidth: 672, margin: '0 auto', padding: '0 16px' }}>
        <SkeletonBlock width={100} height={20} radius={6} className="mb-5" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[0,1,2,3,4,5].map(i => <SkeletonCard key={i} />)}
        </div>
      </div>
    </div>
  );
}
