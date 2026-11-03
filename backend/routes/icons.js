import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

// Public lucide icon SVGs for the web slide renderer/editor. Layered slides
// reference icons by name; bundling all ~1,500 into the SPA would bloat it,
// so the client fetches the few a deck uses (cached for a day).
const require = createRequire(import.meta.url);
let LUCIDE_DIR = null;
try { LUCIDE_DIR = path.join(path.dirname(require.resolve('lucide-static/package.json')), 'icons'); } catch { /* optional */ }

const router = Router();
router.get('/:name', (req, res) => {
  const name = String(req.params.name).replace(/\.svg$/, '');
  if (!LUCIDE_DIR || !/^[a-z0-9-]{1,60}$/.test(name)) return res.status(404).json({ error: 'Icon not found.' });
  const file = path.join(LUCIDE_DIR, `${name}.svg`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Icon not found.' });
  res.set('Cache-Control', 'public, max-age=86400');
  res.type('image/svg+xml').send(fs.readFileSync(file, 'utf8'));
});

export default router;
