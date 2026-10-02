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
console.log(`Built ${Object.keys(files).length} files into dist/`);
