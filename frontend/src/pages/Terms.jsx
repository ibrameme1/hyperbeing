import { useNavigate } from 'react-router-dom';

const LAST_UPDATED = 'May 28, 2025';

function HBIcon() {
  return (
    <div style={{ width: 26, height: 26, background: '#5B50FF', clipPath: 'polygon(0 0, 100% 0, 100% 78%, 78% 100%, 0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ fontFamily: 'Inter,sans-serif', fontWeight: 800, color: '#fff', fontSize: 10, letterSpacing: '-0.05em' }}>HB</span>
    </div>
  );
}

export default function Terms() {
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
        <h1 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 48, fontWeight: 400, color: '#f0f0ee', marginBottom: 8, letterSpacing: '-0.03em' }}>Terms of Service</h1>
        <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#555555', letterSpacing: '0.1em', marginBottom: 64 }}>Last updated: {LAST_UPDATED}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 40, color: '#888888', lineHeight: 1.8 }}>
          {[
            ['1. Acceptance of Terms', 'By accessing or using HyperBeing ("Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.'],
            ['2. Eligibility', 'You must be at least 18 years of age to create an account and use HyperBeing. By using the Service, you represent that you meet this requirement. We do not knowingly permit persons under 18 to use the Service, and we will terminate any account we discover belongs to a minor.'],
            ['3. Description of Service', 'HyperBeing is an AI-powered presentation generation platform. You provide a brief, and our AI generates presentation slides, images, and supporting content. Features and availability may change at any time.'],
            ['4. Accounts and Security', 'You are responsible for maintaining the confidentiality of your account credentials. You agree to notify us immediately of any unauthorized use. We are not liable for losses from unauthorized access resulting from your failure to safeguard your credentials.'],
            ['5. Subscriptions and Payments', 'Paid plans are billed on a recurring monthly or annual basis via Stripe. Credits are allocated at the start of each billing period and do not roll over. You can cancel at any time through the billing portal; your access continues until the end of the current period. All payments are non-refundable except as required by law.'],
            ['6. Credits', 'Credits are consumed when you generate presentations, add slides, or regenerate slides. Credits expire at the end of each billing period and cannot be transferred. Free credits granted upon signup are also subject to expiry.'],
            ['8. Intellectual Property', 'You own the presentations you create. By using the Service, you grant HyperBeing a limited licence to process your inputs solely to provide the Service. HyperBeing retains all rights to its platform, models, and proprietary technology.'],
            ['9. Disclaimer of Warranties', 'The Service is provided "as is" without warranties of any kind. We do not guarantee that AI-generated content will be accurate, complete, or fit for any particular purpose. You are responsible for reviewing and verifying all generated content before use.'],
            ['10. Limitation of Liability', "To the maximum extent permitted by law, HyperBeing's total liability for any claim arising from use of the Service is limited to the amount you paid us in the three months preceding the claim. We are not liable for indirect, incidental, or consequential damages."],
            ['11. Changes to Terms', 'We may update these Terms at any time. Continued use of the Service after changes constitutes acceptance of the revised Terms. We will notify you of material changes via email or a notice within the platform.'],
          ].map(([title, body]) => (
            <section key={title}>
              <h2 style={{ fontFamily: 'Inter, sans-serif', fontSize: 16, fontWeight: 600, color: '#f0f0ee', marginBottom: 10 }}>{title}</h2>
              <p>{body}</p>
            </section>
          ))}

          <section>
            <h2 style={{ fontFamily: 'Inter, sans-serif', fontSize: 16, fontWeight: 600, color: '#f0f0ee', marginBottom: 10 }}>7. Acceptable Use</h2>
            <p>You agree not to use HyperBeing to:</p>
            <ul style={{ listStyleType: 'disc', paddingLeft: 20, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4, color: '#555555' }}>
              <li>Generate content that is illegal, harmful, threatening, or defamatory</li>
              <li>Infringe the intellectual property rights of others</li>
              <li>Attempt to reverse engineer or scrape the Service</li>
              <li>Use the Service for any purpose that violates applicable law</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontFamily: 'Inter, sans-serif', fontSize: 16, fontWeight: 600, color: '#f0f0ee', marginBottom: 10 }}>12. Contact</h2>
            <p>For questions about these Terms, contact us at <a href="mailto:team@hyperbeing.co" style={{ color: '#8B80FF', textDecoration: 'none' }}>team@hyperbeing.co</a>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
