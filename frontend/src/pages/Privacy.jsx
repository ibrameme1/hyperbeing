import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

const LAST_UPDATED = 'May 28, 2025';

export default function Privacy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen" style={{ background: '#0A0A0B' }}>
      {/* Nav */}
      <div className="border-b px-8 py-5 flex items-center gap-3" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <button onClick={() => navigate('/')} className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' }}>
            <Sparkles size={14} className="text-white" />
          </div>
          <span className="text-white font-bold text-base">HyperBeing</span>
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-white/40 text-sm mb-12">Last updated: {LAST_UPDATED}</p>

        <div className="space-y-10" style={{ color: 'rgba(255,255,255,0.7)', lineHeight: '1.8' }}>

          <section>
            <h2 className="text-white font-semibold text-xl mb-3">1. Who We Are</h2>
            <p>HyperBeing ("we", "us", "our") operates hyperbeing.com, an AI-powered presentation platform. This Privacy Policy explains what data we collect, how we use it, and your rights.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-xl mb-3">2. Age Restriction — No Data from Minors</h2>
            <p>HyperBeing is strictly intended for users who are 18 years of age or older. We do not knowingly collect, solicit, or store personal information from anyone under 18. If we learn that we have collected personal data from a person under 18, we will delete that data immediately. If you believe a minor has created an account, please contact us at <span style={{ color: '#8B5CF6' }}>support@hyperbeing.com</span>.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-xl mb-3">3. Data We Collect</h2>
            <p className="mb-3">We collect the following categories of data:</p>
            <ul className="list-disc list-inside space-y-2 text-white/60">
              <li><span className="text-white/80 font-medium">Account data:</span> name, email address, password (hashed), and profile picture (from OAuth providers)</li>
              <li><span className="text-white/80 font-medium">Usage data:</span> presentations you create, credits consumed, feature usage, and session activity</li>
              <li><span className="text-white/80 font-medium">Payment data:</span> billing history and subscription status (card details are handled by Stripe and never stored on our servers)</li>
              <li><span className="text-white/80 font-medium">Technical data:</span> IP address, browser type, and access logs for security purposes</li>
              <li><span className="text-white/80 font-medium">Content you provide:</span> presentation briefs, uploaded reference images, and branding assets</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-semibold text-xl mb-3">4. How We Use Your Data</h2>
            <ul className="list-disc list-inside space-y-2 text-white/60">
              <li>To provide and improve the Service</li>
              <li>To process payments and manage your subscription</li>
              <li>To send transactional emails (billing receipts, password resets)</li>
              <li>To detect and prevent fraud or abuse</li>
              <li>To comply with legal obligations</li>
            </ul>
            <p className="mt-3">We do not sell your personal data to third parties. We do not use your presentation content to train AI models.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-xl mb-3">5. Third-Party Services</h2>
            <p>We use the following third-party processors:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-white/60">
              <li><span className="text-white/80">Stripe</span> — payment processing</li>
              <li><span className="text-white/80">Anthropic / Google</span> — AI content generation (your briefs are sent to these APIs to generate slides)</li>
              <li><span className="text-white/80">Google OAuth / Meta / TikTok</span> — optional social sign-in</li>
              <li><span className="text-white/80">Vercel / Railway</span> — hosting infrastructure</li>
            </ul>
            <p className="mt-3">Each provider has their own privacy policy governing how they handle data.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-xl mb-3">6. Data Retention</h2>
            <p>We retain your account data for as long as your account is active. Presentations and usage data are retained for up to 12 months after account deletion. You can request earlier deletion by contacting us.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-xl mb-3">7. Your Rights</h2>
            <p>Depending on your location, you may have the right to:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-white/60">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your account and associated data</li>
              <li>Object to or restrict certain processing</li>
              <li>Data portability (receive a copy of your data in a structured format)</li>
            </ul>
            <p className="mt-3">To exercise any of these rights, email <span style={{ color: '#8B5CF6' }}>support@hyperbeing.com</span>.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-xl mb-3">8. Cookies</h2>
            <p>We use session cookies for authentication only. We do not use tracking or advertising cookies. You can disable cookies in your browser, but this may prevent you from logging in.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-xl mb-3">9. Security</h2>
            <p>We use industry-standard security measures including HTTPS, bcrypt password hashing, JWT authentication, and rate limiting. No method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-xl mb-3">10. Changes to This Policy</h2>
            <p>We may update this Privacy Policy periodically. We will notify you of significant changes via email or an in-app notice. Continued use of the Service after changes constitutes acceptance.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-xl mb-3">11. Contact</h2>
            <p>Questions or requests regarding this Privacy Policy: <span style={{ color: '#8B5CF6' }}>support@hyperbeing.com</span></p>
          </section>

        </div>
      </div>
    </div>
  );
}
