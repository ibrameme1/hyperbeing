import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

const LAST_UPDATED = 'May 28, 2025';

export default function Terms() {
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
        <h1 className="text-4xl font-bold text-white mb-2">Terms of Service</h1>
        <p className="text-white/40 text-sm mb-12">Last updated: {LAST_UPDATED}</p>

        <div className="space-y-10" style={{ color: 'rgba(255,255,255,0.7)', lineHeight: '1.8' }}>

          <section>
            <h2 className="text-white font-semibold text-xl mb-3">1. Acceptance of Terms</h2>
            <p>By accessing or using HyperBeing ("Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-xl mb-3">2. Eligibility</h2>
            <p>You must be at least 18 years of age to create an account and use HyperBeing. By using the Service, you represent that you meet this requirement. We do not knowingly permit persons under 18 to use the Service, and we will terminate any account we discover belongs to a minor.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-xl mb-3">3. Description of Service</h2>
            <p>HyperBeing is an AI-powered presentation generation platform. You provide a brief, and our AI generates presentation slides, images, and supporting content. Features and availability may change at any time.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-xl mb-3">4. Accounts and Security</h2>
            <p>You are responsible for maintaining the confidentiality of your account credentials. You agree to notify us immediately of any unauthorized use. We are not liable for losses from unauthorized access resulting from your failure to safeguard your credentials.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-xl mb-3">5. Subscriptions and Payments</h2>
            <p>Paid plans are billed on a recurring monthly or annual basis via Stripe. Credits are allocated at the start of each billing period and do not roll over. You can cancel at any time through the billing portal; your access continues until the end of the current period. All payments are non-refundable except as required by law.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-xl mb-3">6. Credits</h2>
            <p>Credits are consumed when you generate presentations, add slides, or regenerate slides. Credits expire at the end of each billing period and cannot be transferred. Free credits granted upon signup are also subject to expiry.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-xl mb-3">7. Acceptable Use</h2>
            <p>You agree not to use HyperBeing to:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-white/60">
              <li>Generate content that is illegal, harmful, threatening, or defamatory</li>
              <li>Infringe the intellectual property rights of others</li>
              <li>Attempt to reverse engineer or scrape the Service</li>
              <li>Use the Service for any purpose that violates applicable law</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-semibold text-xl mb-3">8. Intellectual Property</h2>
            <p>You own the presentations you create. By using the Service, you grant HyperBeing a limited licence to process your inputs solely to provide the Service. HyperBeing retains all rights to its platform, models, and proprietary technology.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-xl mb-3">9. Disclaimer of Warranties</h2>
            <p>The Service is provided "as is" without warranties of any kind. We do not guarantee that AI-generated content will be accurate, complete, or fit for any particular purpose. You are responsible for reviewing and verifying all generated content before use.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-xl mb-3">10. Limitation of Liability</h2>
            <p>To the maximum extent permitted by law, HyperBeing's total liability for any claim arising from use of the Service is limited to the amount you paid us in the three months preceding the claim. We are not liable for indirect, incidental, or consequential damages.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-xl mb-3">11. Changes to Terms</h2>
            <p>We may update these Terms at any time. Continued use of the Service after changes constitutes acceptance of the revised Terms. We will notify you of material changes via email or a notice within the platform.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-xl mb-3">12. Contact</h2>
            <p>For questions about these Terms, contact us at <span style={{ color: '#8B5CF6' }}>support@hyperbeing.com</span>.</p>
          </section>

        </div>
      </div>
    </div>
  );
}
