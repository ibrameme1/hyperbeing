import { useNavigate } from 'react-router-dom';

const LAST_UPDATED = 'May 28, 2025';

function HBIcon() {
  return (
    <div style={{ width: 26, height: 26, background: '#5B50FF', clipPath: 'polygon(0 0, 100% 0, 100% 78%, 78% 100%, 0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ fontFamily: 'Inter,sans-serif', fontWeight: 800, color: '#fff', fontSize: 10, letterSpacing: '-0.05em' }}>HB</span>
    </div>
  );
}

const s = { color: '#8B80FF', textDecoration: 'none' };
const h2Style = { fontFamily: 'Inter, sans-serif', fontSize: 16, fontWeight: 600, color: '#f0f0ee', marginBottom: 10 };
const liStyle = { marginBottom: 6 };

export default function Privacy() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: '#080808', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ borderBottom: '0.5px solid #1e1e1e', padding: '0 16px', height: 56, display: 'flex', alignItems: 'center' }}>
        <button onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer' }}>
          <HBIcon />
          <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 14, color: '#f0f0ee', letterSpacing: '-0.02em' }}>HyperBeing</span>
        </button>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px' }}>
        <h1 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 48, fontWeight: 400, color: '#f0f0ee', marginBottom: 8, letterSpacing: '-0.03em' }}>Privacy Policy</h1>
        <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#555555', letterSpacing: '0.1em', marginBottom: 64 }}>Last updated: {LAST_UPDATED}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 40, color: '#888888', lineHeight: 1.8 }}>
          <section>
            <h2 style={h2Style}>1. Who We Are</h2>
            <p>HyperBeing ("we", "us", "our") operates hyperbeing.com, an AI-powered presentation platform. This Privacy Policy explains what data we collect, how we use it, and your rights.</p>
          </section>
          <section>
            <h2 style={h2Style}>2. Age Restriction — No Data from Minors</h2>
            <p>HyperBeing is strictly intended for users who are 18 years of age or older. We do not knowingly collect, solicit, or store personal information from anyone under 18. If we learn that we have collected personal data from a person under 18, we will delete that data immediately. If you believe a minor has created an account, please contact us at <a href="mailto:team@hyperbeing.co" style={s}>team@hyperbeing.co</a>.</p>
          </section>
          <section>
            <h2 style={h2Style}>3. Data We Collect</h2>
            <p style={{ marginBottom: 12 }}>We collect the following categories of data:</p>
            <ul style={{ listStyleType: 'disc', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6, color: '#555555' }}>
              <li style={liStyle}><span style={{ color: '#b8b8b8', fontWeight: 500 }}>Account data:</span> name, email address, password (hashed), and profile picture</li>
              <li style={liStyle}><span style={{ color: '#b8b8b8', fontWeight: 500 }}>Usage data:</span> presentations you create, credits consumed, feature usage, and session activity</li>
              <li style={liStyle}><span style={{ color: '#b8b8b8', fontWeight: 500 }}>Payment data:</span> billing history and subscription status (card details handled by Stripe)</li>
              <li style={liStyle}><span style={{ color: '#b8b8b8', fontWeight: 500 }}>Technical data:</span> IP address, browser type, and access logs for security purposes</li>
              <li style={liStyle}><span style={{ color: '#b8b8b8', fontWeight: 500 }}>Content you provide:</span> presentation briefs, uploaded reference images, and branding assets</li>
            </ul>
          </section>
          <section>
            <h2 style={h2Style}>4. How We Use Your Data</h2>
            <ul style={{ listStyleType: 'disc', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6, color: '#555555', marginBottom: 12 }}>
              <li>To provide and improve the Service</li>
              <li>To process payments and manage your subscription</li>
              <li>To send transactional emails (billing receipts, password resets)</li>
              <li>To detect and prevent fraud or abuse</li>
              <li>To comply with legal obligations</li>
            </ul>
            <p>We do not sell your personal data to third parties. We do not use your presentation content to train AI models.</p>
          </section>
          <section>
            <h2 style={h2Style}>5. Third-Party Services</h2>
            <p style={{ marginBottom: 12 }}>We use the following third-party processors:</p>
            <ul style={{ listStyleType: 'disc', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6, color: '#555555' }}>
              <li><span style={{ color: '#b8b8b8' }}>Stripe</span> — payment processing</li>
              <li><span style={{ color: '#b8b8b8' }}>Anthropic / Google</span> — AI content generation</li>
              <li><span style={{ color: '#b8b8b8' }}>Google OAuth</span> — optional social sign-in</li>
              <li><span style={{ color: '#b8b8b8' }}>Vercel / Render</span> — hosting infrastructure</li>
            </ul>
          </section>
          <section>
            <h2 style={h2Style}>6. Data Retention</h2>
            <p>We retain your account data for as long as your account is active. Presentations and usage data are retained for up to 12 months after account deletion. You can request earlier deletion by contacting us.</p>
          </section>
          <section>
            <h2 style={h2Style}>7. Your Rights</h2>
            <p style={{ marginBottom: 12 }}>Depending on your location, you may have the right to:</p>
            <ul style={{ listStyleType: 'disc', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6, color: '#555555' }}>
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your account and associated data</li>
              <li>Object to or restrict certain processing</li>
              <li>Data portability</li>
            </ul>
            <p style={{ marginTop: 12 }}>To exercise any of these rights, email <a href="mailto:team@hyperbeing.co" style={s}>team@hyperbeing.co</a>.</p>
          </section>
          <section>
            <h2 style={h2Style}>8. Cookies</h2>
            <p>We use session cookies for authentication only. We do not use tracking or advertising cookies.</p>
          </section>
          <section>
            <h2 style={h2Style}>9. Security</h2>
            <p>We use industry-standard security measures including HTTPS, bcrypt password hashing, JWT authentication, and rate limiting.</p>
          </section>
          <section>
            <h2 style={h2Style}>10. Changes to This Policy</h2>
            <p>We may update this Privacy Policy periodically. We will notify you of significant changes via email or an in-app notice.</p>
          </section>
          <section>
            <h2 style={h2Style}>11. Contact</h2>
            <p>Questions or requests: <a href="mailto:team@hyperbeing.co" style={s}>team@hyperbeing.co</a></p>
          </section>
        </div>
      </div>
    </div>
  );
}
