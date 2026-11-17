// Prerender "/" into dist/index.html and keep the empty SPA shell as
// dist/app.html for every other route (vercel.json rewrites to it).
//
// Runs after `vite build` and `vite build --ssr src/entry-prerender.jsx`.
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const ssrDir = path.join(root, 'dist-prerender');

const shell = readFileSync(path.join(dist, 'index.html'), 'utf8');
const marker = '<div id="root"></div>';
if (!shell.includes(marker)) throw new Error('prerender: #root placeholder not found in dist/index.html');

const { render } = await import(pathToFileURL(path.join(ssrDir, 'entry-prerender.js')).href);
const html = render('/');
if (!html.includes('Presentations that make people go')) throw new Error('prerender: landing page did not render');

writeFileSync(path.join(dist, 'app.html'), shell);
writeFileSync(path.join(dist, 'index.html'), shell.replace(marker, `<div id="root">${html}</div>`));
rmSync(ssrDir, { recursive: true, force: true });
console.log(`prerender: / -> dist/index.html (${Math.round(html.length / 1024)} kB of HTML), shell -> dist/app.html`);
