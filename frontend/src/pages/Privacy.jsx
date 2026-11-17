import PublicPage from '../components/PublicPage';

const LAST_UPDATED = 'May 28, 2025';


export default function Privacy() {
  return (
    <PublicPage eyebrow="Legal" title="Privacy Policy" meta={`Last updated: ${LAST_UPDATED}`}>
      <div className="pub-legal">

          <section>
            <h2>1. Who We Are</h2>
            <p>HyperBeing ("we", "us", "our") operates hyperbeing.com, an AI-powered presentation platform. This Privacy Policy explains what data we collect, how we use it, and your rights.</p>
          </section>
          <section>
            <h2>2. Age Restriction — No Data from Minors</h2>
            <p>HyperBeing is strictly intended for users who are 18 years of age or older. We do not knowingly collect, solicit, or store personal information from anyone under 18. If we learn that we have collected personal data from a person under 18, we will delete that data immediately. If you believe a minor has created an account, please contact us at <a href="mailto:team@hyperbeing.co" >team@hyperbeing.co</a>.</p>
          </section>
          <section>
            <h2>3. Data We Collect</h2>
            <p>We collect the following categories of data:</p>
            <ul>
              <li><span>Account data:</span> name, email address, password (hashed), and profile picture</li>
              <li><span>Usage data:</span> presentations you create, credits consumed, feature usage, and session activity</li>
              <li><span>Payment data:</span> billing history and subscription status (card details handled by Stripe)</li>
              <li><span>Technical data:</span> IP address, browser type, and access logs for security purposes</li>
              <li><span>Content you provide:</span> presentation briefs, uploaded reference images, and branding assets</li>
            </ul>
          </section>
          <section>
            <h2>4. How We Use Your Data</h2>
            <ul>
              <li>To provide and improve the Service</li>
              <li>To process payments and manage your subscription</li>
              <li>To send transactional emails (billing receipts, password resets)</li>
              <li>To detect and prevent fraud or abuse</li>
              <li>To comply with legal obligations</li>
            </ul>
            <p>We do not sell your personal data to third parties. We do not use your presentation content to train AI models.</p>
          </section>
          <section>
            <h2>5. Third-Party Services</h2>
            <p>We use the following third-party processors:</p>
            <ul>
              <li><span>Stripe</span> — payment processing</li>
              <li><span>Anthropic / Google</span> — AI content generation</li>
              <li><span>Google OAuth</span> — optional social sign-in</li>
              <li><span>Vercel / Render</span> — hosting infrastructure</li>
            </ul>
          </section>
          <section>
            <h2>6. Data Retention</h2>
            <p>We retain your account data for as long as your account is active. Presentations and usage data are retained for up to 12 months after account deletion. You can request earlier deletion by contacting us.</p>
          </section>
          <section>
            <h2>7. Your Rights</h2>
            <p>Depending on your location, you may have the right to:</p>
            <ul>
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your account and associated data</li>
              <li>Object to or restrict certain processing</li>
              <li>Data portability</li>
            </ul>
            <p>To exercise any of these rights, email <a href="mailto:team@hyperbeing.co" >team@hyperbeing.co</a>.</p>
          </section>
          <section>
            <h2>8. Cookies</h2>
            <p>We use session cookies for authentication only. We do not use tracking or advertising cookies.</p>
          </section>
          <section>
            <h2>9. Security</h2>
            <p>We use industry-standard security measures including HTTPS, bcrypt password hashing, JWT authentication, and rate limiting.</p>
          </section>
          <section>
            <h2>10. Changes to This Policy</h2>
            <p>We may update this Privacy Policy periodically. We will notify you of significant changes via email or an in-app notice.</p>
          </section>
          <section>
            <h2>11. Contact</h2>
            <p>Questions or requests: <a href="mailto:team@hyperbeing.co" >team@hyperbeing.co</a></p>
          </section>
      </div>
    </PublicPage>
  );
}
