#!/usr/bin/env node
// Write the raft model as a STEP file for SolidWorks:
//   node scripts/export-step.js [build.json] [out.step] [--expect expected.json]
// Defaults: data/build.json → bob-raft.step in the current directory. --expect also writes each
// solid's volume from its dimensions, for scripts/check-step.py.
const fs = require('fs');
const path = require('path');
const M = require('./raft-model.js');
const S = require('./step-export.js');
const args = process.argv.slice(2), ei = args.indexOf('--expect'), expect = ei >= 0 ? args.splice(ei, 2)[1] : null;
const src = args[0] || path.join(__dirname, '..', 'data', 'build.json');
const out = args[1] || 'bob-raft.step';
const build = JSON.parse(fs.readFileSync(src, 'utf8'));
const g = M.geometry(build.config);
const text = S.exportStep(g, { name: build.name || 'BOB raft' });
fs.writeFileSync(out, text);
if (expect) fs.writeFileSync(expect, JSON.stringify(S.bodies(g).map(b => ({ name: b.name, volume: S.volume(b) }))) + '\n');
console.log(`Wrote ${out}: ${S.bodies(g).length} solids (inches) from ${path.relative(process.cwd(), src) || src}`);
