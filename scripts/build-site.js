#!/usr/bin/env node
// Assemble the static site for Netlify into dist/.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist');
const files = {
  'index.html': 'raft-simulation.html',
  'raft-simulation.html': 'raft-simulation.html',
  'raft-render.html': 'raft-render.html',
  'legacy.html': 'index.html',
  'favicon.svg': 'favicon.svg',
  'manifest.webmanifest': 'manifest.webmanifest',
  'icons/apple-touch-icon.png': 'icons/apple-touch-icon.png',
  'icons/icon-192.png': 'icons/icon-192.png',
  'icons/icon-512.png': 'icons/icon-512.png',
  'icons/icon-maskable-512.png': 'icons/icon-maskable-512.png',
  'scripts/raft-model.js': 'scripts/raft-model.js',
  'data/build.json': 'data/build.json',
  'data/catalog.json': 'data/catalog.json',
  'data/rules.json': 'data/rules.json',
  'data/profiles.json': 'data/profiles.json',
  'data/suppliers.json': 'data/suppliers.json',
  'reports/latest-report.md': 'reports/latest-report.md',
};
fs.rmSync(OUT, { recursive: true, force: true });
for (const [dest, src] of Object.entries(files)) {
  const to = path.join(OUT, dest);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(ROOT, src), to);
}
// designs saved in the repo (data/designs/*.json, e.g. from "Propose PR"): one index the page lists
const dir = path.join(ROOT, 'data/designs');
const designs = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter(f => f.endsWith('.json')).sort().map(f => {
  const b = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  return { id: f.replace(/\.json$/, ''), name: b.name || f, description: 'Saved in the repo (data/designs/' + f + ')', build: b };
});
fs.mkdirSync(path.join(OUT, 'data/designs'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'data/designs/index.json'), JSON.stringify({ designs }) + '\n');
console.log(`Built ${Object.keys(files).length} files and ${designs.length} repo designs into dist/`);
