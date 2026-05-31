import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const STORAGE_KEY = 'hb_cookie_consent';

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
  }, []);

  if (!visible) return null;

  function accept() {
    localStorage.setItem(STORAGE_KEY, 'accepted');
    setVisible(false);
  }

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        background: 'rgba(18,18,20,0.97)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: '1rem',
        padding: '1rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1.25rem',
        maxWidth: '680px',
        width: 'calc(100vw - 2rem)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}
    >
      <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.85rem', lineHeight: '1.5', flex: 1, margin: 0 }}>
        We use a session cookie for authentication and{' '}
        <a href="https://vercel.com/docs/analytics/privacy-policy" target="_blank" rel="noopener noreferrer"
           style={{ color: '#8B5CF6', textDecoration: 'underline' }}>
          cookieless analytics
        </a>{' '}
        to improve the product. No tracking cookies.{' '}
        <Link to="/privacy" style={{ color: '#8B5CF6', textDecoration: 'underline' }}>
          Privacy policy
        </Link>
      </p>
      <button
        onClick={accept}
        style={{
          flexShrink: 0,
          background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)',
          border: 'none',
          borderRadius: '0.5rem',
          color: '#fff',
          fontWeight: 600,
          fontSize: '0.85rem',
          padding: '0.5rem 1.1rem',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Got it
      </button>
    </div>
  );
}
