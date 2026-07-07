import { useParams, useNavigate, Link, Navigate } from 'react-router-dom';
import Logo from '../components/Logo';
import { SERVICE_PAGES } from '../data/servicePages';

const H2 = ({ children }) => (
  <h2 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 'clamp(22px, 3vw, 28px)', fontWeight: 400, color: '#0d0b1a', letterSpacing: '-0.01em', margin: '48px 0 16px' }}>
    {children}
  </h2>
);

const P = ({ children }) => (
  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px', color: '#3d3660', lineHeight: 1.75, marginBottom: '16px' }}>
    {children}
  </p>
);

export default function ServicePage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const data = SERVICE_PAGES[slug];

  if (!data) return <Navigate to="/" replace />;

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: data.faq.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };

  return (
    <div data-theme="light" style={{ fontFamily: 'Inter, system-ui, sans-serif', background: '#f5f5f5', color: '#0d0b1a', minHeight: '100vh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

      {/* Nav */}
      <nav style={{ height: '60px', display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.92)', borderBottom: '0.5px solid #e8e8f0' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto', width: '100%', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            <Logo height={32} />
          </Link>
          <button
            onClick={() => navigate('/login')}
            style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: 600, color: '#fff', background: '#5B50FF', border: 'none', borderRadius: '6px', padding: '8px 16px', cursor: 'pointer' }}
          >
            Start free →
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '64px 24px 96px' }}>
        <h1 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 'clamp(36px, 5vw, 52px)', fontWeight: 400, letterSpacing: '-0.03em', color: '#0d0b1a', marginBottom: '16px', lineHeight: 1.05 }}>
          {data.title}
        </h1>
        <P>{data.intro}</P>

        <H2>What it is</H2>
        {data.whatItIs.map((para, i) => <P key={i}>{para}</P>)}

        <H2>Who this is for</H2>
        <P>{data.whoItsFor.lead}</P>
        <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          {data.whoItsFor.items.map((item, i) => (
            <li key={i} style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px', color: '#3d3660', lineHeight: 1.6 }}>{item}</li>
          ))}
        </ul>

        <H2>Cost</H2>
        {data.pricing.map((para, i) => <P key={i}>{para}</P>)}
        <P>See the full breakdown on the <Link to="/pricing" style={{ color: '#5B50FF', textDecoration: 'none' }}>pricing page</Link>.</P>

        <H2>How long it takes</H2>
        <P>{data.timing}</P>

        <H2>What's included</H2>
        <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          {data.whatsIncluded.map((item, i) => (
            <li key={i} style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px', color: '#3d3660', lineHeight: 1.6 }}>{item}</li>
          ))}
        </ul>

        <H2>The process</H2>
        <ol style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
          {data.process.map((step, i) => (
            <li key={i} style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px', color: '#3d3660', lineHeight: 1.6 }}>{step}</li>
          ))}
        </ol>

        <H2>Frequently asked questions</H2>
        <div>
          {data.faq.map(({ q, a }) => (
            <div key={q} style={{ padding: '20px 0', borderBottom: '0.5px solid #e8e8f0' }}>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px', fontWeight: 600, color: '#0d0b1a', marginBottom: '8px' }}>{q}</p>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: '#6b6490', lineHeight: 1.7 }}>{a}</p>
            </div>
          ))}
        </div>

        <H2>Related</H2>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Link to="/" style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: '#5B50FF', textDecoration: 'none', border: '0.5px solid #e8e8f0', borderRadius: '6px', padding: '8px 14px' }}>
            ← Back to homepage
          </Link>
          {data.related.map(slug => (
            <Link key={slug} to={`/services/${slug}`} style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: '#5B50FF', textDecoration: 'none', border: '0.5px solid #e8e8f0', borderRadius: '6px', padding: '8px 14px' }}>
              {SERVICE_PAGES[slug].title} →
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
