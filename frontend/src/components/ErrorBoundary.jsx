import React from 'react';

function HBIcon() {
  return (
    <div style={{ width: 40, height: 40, background: '#5B50FF', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 900, color: '#fff', fontSize: 18, letterSpacing: '-0.1em', paddingRight: '0.05em' }}>HB</span>
    </div>
  );
}

export function ErrorFallback({ error, resetError }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#080808',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Inter, sans-serif', padding: 24,
    }}>
      <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <HBIcon />
        </div>

        <h1 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 32, fontWeight: 400, color: '#f0f0ee', marginBottom: 12, letterSpacing: '-0.02em' }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: 14, color: '#666', lineHeight: 1.7, marginBottom: 8 }}>
          An unexpected error occurred. Your work is safe — this is likely a one-time glitch.
        </p>

        {error?.message && (
          <p style={{ fontSize: 11, color: '#444', fontFamily: 'JetBrains Mono, monospace', background: '#111', border: '0.5px solid #222', borderRadius: 8, padding: '8px 12px', marginBottom: 28, wordBreak: 'break-all' }}>
            {error.message}
          </p>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={resetError}
            style={{
              background: '#5B50FF', color: '#fff', border: 'none', borderRadius: 10,
              padding: '10px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            Try again
          </button>
          <a
            href="/"
            style={{
              background: '#141414', color: '#888', border: '0.5px solid #2a2a2a', borderRadius: 10,
              padding: '10px 22px', fontSize: 14, fontWeight: 500, cursor: 'pointer',
              fontFamily: 'Inter, sans-serif', textDecoration: 'none',
            }}
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (typeof this.props.onError === 'function') {
      this.props.onError(error, info);
    }
  }

  reset() {
    this.setState({ error: null });
  }

  render() {
    if (this.state.error) {
      const Fallback = this.props.fallback;
      if (Fallback) return <Fallback error={this.state.error} resetError={this.reset} />;
      return <ErrorFallback error={this.state.error} resetError={this.reset} />;
    }
    return this.props.children;
  }
}
