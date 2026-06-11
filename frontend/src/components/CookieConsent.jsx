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
        background: 'rgba(15,15,15,0.97)',
        border: '0.5px solid #1e1e1e',
        backdropFilter: 'blur(12px)',
        borderRadius: 8,
        padding: '1rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1.25rem',
        maxWidth: '680px',
        width: 'calc(100vw - 2rem)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}
    >
      <p style={{ color: '#888888', fontFamily: 'Inter, sans-serif', fontSize: 13, lineHeight: '1.5', flex: 1, margin: 0 }}>
        We use a session cookie for authentication and{' '}
        <a href="https://vercel.com/docs/analytics/privacy-policy" target="_blank" rel="noopener noreferrer"
           style={{ color: '#8B80FF', textDecoration: 'underline' }}>
          cookieless analytics
        </a>{' '}
        to improve the product. No tracking cookies.{' '}
        <Link to="/privacy" style={{ color: '#8B80FF', textDecoration: 'underline' }}>
          Privacy policy
        </Link>
      </p>
      <button
        onClick={accept}
        style={{
          flexShrink: 0,
          background: '#5B50FF',
          border: 'none',
          borderRadius: 6,
          color: '#fff',
          fontFamily: 'Inter, sans-serif',
          fontWeight: 600,
          fontSize: 13,
          padding: '7px 16px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          transition: 'background 0.15s',
        }}
      >
        Got it
      </button>
    </div>
  );
}
