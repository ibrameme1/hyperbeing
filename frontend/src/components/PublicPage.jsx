import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import '../pages/landing.css';
import './publicPage.css';

// Shell for the public reading pages (use cases, terms, privacy) so they look
// like part of the landing page: same midnight stage, nav, type and footer.
// Pricing is not here on purpose: it lives on the landing page (#pricing).
export default function PublicPage({ eyebrow, title, meta, children }) {
  const { user } = useAuth();
  const start = user ? { to: '/dashboard', label: 'Open dashboard' } : { to: '/login?mode=signup', label: 'Start free' };
  return (
    <div className="lp lp-public">
      <div className="pub-light" aria-hidden="true" />
      <header className="pub-nav">
        <div className="wrap">
          <Link to="/" className="logo" aria-label="HyperBeing home"><b>HB</b>HyperBeing</Link>
          <nav className="pub-links" aria-label="Main">
            <Link to="/#studio">Product</Link>
            <Link to="/#pricing">Pricing</Link>
            <Link to="/#faq">FAQ</Link>
          </nav>
          <div className="pub-right">
            {!user && <Link to="/login" className="pub-signin">Sign in</Link>}
            <Link to={start.to} className="btn btn-primary">{start.label} <span className="arr">→</span></Link>
          </div>
        </div>
      </header>

      <main className="wrap pub-main">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {meta && <p className="pub-meta">{meta}</p>}
        <div className="pub-body">{children}</div>
      </main>

      <footer>
        <div className="wrap">
          <div><Link to="/" className="logo"><b>HB</b>HyperBeing</Link><p style={{ margin: '14px 0 0', maxWidth: '32ch' }}>The AI presentation studio that art-directs every slide.</p></div>
          <div><h4>Product</h4><ul><li><Link to="/#studio">How it works</Link></li><li><Link to="/#work">Examples</Link></li><li><Link to="/#pricing">Pricing</Link></li></ul></div>
          <div><h4>Use cases</h4><ul><li><Link to="/services/marketing-decks">Marketing decks</Link></li><li><Link to="/services/consulting-decks">Consulting decks</Link></li></ul></div>
          <div><h4>Legal</h4><ul><li><Link to="/privacy">Privacy</Link></li><li><Link to="/terms">Terms</Link></li></ul></div>
          <div className="copy">© {new Date().getFullYear()} HyperBeing. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
