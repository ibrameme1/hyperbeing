import { useParams, Link, Navigate } from 'react-router-dom';
import PublicPage from '../components/PublicPage';
import { SERVICE_PAGES } from '../data/servicePages';

export default function ServicePage() {
  const { slug } = useParams();
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
    <PublicPage eyebrow="Use case" title={data.title}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <p className="lede">{data.intro}</p>

      <h2>What it is</h2>
      {data.whatItIs.map((para, i) => <p key={i}>{para}</p>)}

      <h2>Who this is for</h2>
      <p>{data.whoItsFor.lead}</p>
      <ul>{data.whoItsFor.items.map((item, i) => <li key={i}>{item}</li>)}</ul>

      <h2>Cost</h2>
      {data.pricing.map((para, i) => <p key={i}>{para}</p>)}
      <p>See every plan in the <Link to="/#pricing">pricing section</Link>.</p>

      <h2>How long it takes</h2>
      <p>{data.timing}</p>

      <h2>What&apos;s included</h2>
      <ul>{data.whatsIncluded.map((item, i) => <li key={i}>{item}</li>)}</ul>

      <h2>The process</h2>
      <ol>{data.process.map((step, i) => <li key={i}>{step}</li>)}</ol>

      <h2>Frequently asked questions</h2>
      {/* Collapsed for reading, but the answers stay in the HTML for crawlers. */}
      <div className="pub-faq">
        {data.faq.map(({ q, a }) => (
          <details key={q}><summary>{q}</summary><p>{a}</p></details>
        ))}
      </div>

      <h2>Related</h2>
      <div className="pub-chips">
        <Link to="/">← Back to homepage</Link>
        {data.related.map((s) => <Link key={s} to={`/services/${s}`}>{SERVICE_PAGES[s].title} →</Link>)}
      </div>

      <div className="pub-cta">
        <p>Your next deck is minutes away.</p>
        <Link to="/login?mode=signup" className="btn btn-primary">Start free <span className="arr">→</span></Link>
      </div>
    </PublicPage>
  );
}
