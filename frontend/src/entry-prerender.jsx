// Build-time prerender of the public landing page (see scripts/prerender.mjs).
// AI crawlers and most bots don't run JavaScript, so the homepage ships as
// real HTML: every heading, paragraph, FAQ answer, price and image alt text.
// The browser then mounts the SPA over it (createRoot, not hydrate, since the
// signed-in nav can differ from the static one).
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { AuthProvider } from './contexts/AuthContext';
import Homepage from './pages/Homepage';

export function render(url = '/') {
  return renderToString(
    <StaticRouter location={url}>
      <AuthProvider>
        <Homepage />
      </AuthProvider>
    </StaticRouter>,
  );
}
