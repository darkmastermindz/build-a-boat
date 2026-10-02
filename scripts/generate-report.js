#!/usr/bin/env node
/**
 * generate-report.js
 * Reads data/build.json (the team's actual parts + configuration),
 * data/rules.json and data/catalog.json, runs the shared raft model, and
 * writes reports/latest-report.md and reports/<date>-<version>-report.md.
 *
 * Usage: node scripts/generate-report.js [version] [notes] [--check]
 *   --check  exit 1 if any rule or recommendation is an error (for CI)
 */

const fs = require('fs');
const path = require('path');
const M = require('./raft-model.js');

const ROOT = path.resolve(__dirname, '..');
const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const args = process.argv.slice(2);
const check = args.includes('--check');
const [version = 'latest', userNotes = ''] = args.filter(a => a !== '--check');

const build = read('build.json');
const rules = read('rules.json');
const catalog = read('catalog.json');
const dateStr = new Date().toISOString().split('T')[0];

const a = M.analyze(build, rules, { catalog });
const g = a.geometry, c = g.config, s = a.solution;
const cmp = M.comparePresets(build, rules);
const icon = { ok: '✅', warn: '⚠️', error: '❌', info: 'ℹ️' };
const f1 = v => (v == null || !isFinite(v)) ? '—' : v.toFixed(1);
const f0 = v => (v == null || !isFinite(v)) ? '—' : v.toFixed(0);
const money = v => `$${v.toFixed(2)}`;
const ft = v => `${(v / 12).toFixed(1)} ft`;

const physics = s.ok ? `| Max draft | ${f1(s.maxDraft)}" |
| Load (of max buoyancy) | ${f0(s.loadPct)}% (${f0(s.W)} lb on ${f0(s.maxLb)} lb) |
| Frame clearance above water | ${f1(s.minFreeboard)}" |
| Trim / heel | ${f1(s.pitchDeg)}° / ${f1(s.rollDeg)}° |
| Stability GM roll / pitch | ${f0(s.gmRoll)}" / ${f0(s.gmPitch)}" |
| Crew at bow: bow clearance | ${a.scenarios.crewForward.ok ? f1(a.scenarios.crewForward.bowFreeboard) + '"' : 'nose-dives'} |
| Lose one drum | ${a.scenarios.leaks.every(l => l.sol.ok) ? 'still floats' : 'sinks or capsizes'} |` : `| Status | **${s.reason}**: ${f0(s.W)} lb on ${f0(s.maxLb)} lb max |`;

const have = {};
build.parts.forEach(p => { have[p.role] = (have[p.role] || 0) + (+p.quantity || 0); });

const report = `# 🏴‍☠️ BOB – Build Report

**Version:** ${version}
**Date:** ${dateStr}
**Build:** ${build.name || 'Untitled'}${userNotes ? `  \n**Notes:** ${userNotes}` : ''}
**Race:** ${rules.event ? `${rules.event.date}, ${rules.event.course}` : 'see rules'}

Generated from \`data/build.json\` by \`scripts/raft-model.js\`. Open
\`raft-simulation.html\` to explore the same numbers in 3D.

---

## Configuration

| Parameter | Value |
|-----------|-------|
| Layout | ${M.PRESETS[c.preset] ? M.PRESETS[c.preset].label : 'custom'} |
| Drums | ${g.drums.length} × 55 gal (${M.DRUM.dia}" × ${M.DRUM.len}") |
| Frame | ${c.frameLength}" rails × ${c.frameWidth}" beams, ${g.beams.length} beams, pontoon spacing ${c.pontoonSpacing}" |
| Deck | ${c.deck.length}" × ${c.deck.width}" × ${c.deck.thickness}" |
| Overall size | ${ft(g.overall.length)} × ${ft(g.overall.width)} × ${ft(g.overall.height)} |
| Crew | ${c.crew.count} × ${c.crew.weightEach} lb |
| Predicted final weight | ${f1(a.weights.predicted)} lb (limit ${rules.max_boat_weight_lb || 150}) |
| Bought so far | ${f1(a.weights.onHand)} lb on the boat + ${f1(a.weights.spareOnHand)} lb spares/offcuts |
| Measured | ${f1(a.weights.measured)} lb (${f0(a.weights.measuredShare * 100)}% of predicted) |

## Weight

| | lb |
|---|---|
| **Predicted final boat** | **${f1(a.weights.predicted)}** |
| Bought so far (on the boat) | ${f1(a.weights.onHand)} |
| Bought spares and offcuts (not on the boat) | ${f1(a.weights.spareOnHand)} |
| Still to buy | ${f1(a.weights.remaining)} |
| Measured on a scale | ${f1(a.weights.measured)} |

## Next shopping trip

| Item | Qty | Est. | Priority | Where | Why |
|------|-----|------|----------|-------|-----|
${a.shopping.rows.map(r => `| ${r.name} | ${r.qty} | ${money(r.cost)}${r.estimate ? ' (est.)' : ''} | ${r.priority} | ${r.source} | ${r.why} |`).join('\n')}
| **Needed** | | **${money(a.shopping.neededCost)}** | | | ${money(a.shopping.totalCost)} including spare and optional |

## Physics

| Metric | Value |
|--------|-------|
${physics}

## Competition rules

${a.rules.map(r => `- ${icon[r.level]} **${r.title}**${r.detail ? ` — ${r.detail}` : ''}`).join('\n')}

## Recommendations

${a.recommendations.filter(r => !a.rules.some(x => x.title === r.title)).map(r => `- ${icon[r.level]} **${r.title}**${r.detail ? ` — ${r.detail}` : ''}`).join('\n') || '- ✅ Nothing to flag.'}

## Layout comparison (same parts, frame and crew)

| Layout | lb | Load | Draft | GM roll | GM pitch | Crew at bow | Survives leak |
|--------|----|------|-------|---------|----------|-------------|---------------|
${cmp.map(r => `| ${r.label}${r.id === c.preset ? ' **(current)**' : ''} | ${f0(r.weight)}${r.weight >= (rules.max_boat_weight_lb || 150) ? ' ❌' : ''} | ${r.ok ? f0(r.loadPct) + '%' : '✕'} | ${r.ok ? f1(r.maxDraft) + '"' : '—'} | ${f0(r.gmRoll)}" | ${f0(r.gmPitch)}" | ${isFinite(r.bowFwd) ? f1(r.bowFwd) + '"' : 'dives'} | ${r.survivesLeak ? '✓' : '✕'} |`).join('\n')}

## Needed for this layout vs parts list

| Item | Needed | Listed |
|------|--------|--------|
${Object.entries(a.requirements.items).map(([k, n]) => `| ${k} | ${n} | ${have[k] || 0}${(have[k] || 0) < n ? ' ⚠️' : ''} |`).join('\n')}

### Pipe cut list (10 ft sticks)

${a.requirements.sticks.map((st, i) => `${i + 1}. ${st.cuts.map(k => `${k.label} ${k.len}"`).join(', ')} — offcut ${f0(st.left)}"`).join('\n')}

## Parts list

| Part | Role | Qty | lb ea | Measured | $ ea | Total | Status |
|------|------|-----|-------|----------|------|-------|--------|
${build.parts.map(p => `| ${p.name} | ${p.role} | ${p.quantity} | ${p.weight_lb_each} | ${p.weight_measured ? '✓' : ''} | ${money(+p.unit_cost_usd || 0)} | ${money((+p.quantity || 0) * (+p.unit_cost_usd || 0))} | ${p.status} |`).join('\n')}
| **Total** | | | | | | **${money(a.cost)}** | bought ${money(a.spent)} |

## Suggested materials not on the list

${catalog.items.filter(it => !build.parts.some(p => p.catalog_id === it.id)).map(it => `- ${it.name} (${money(it.unit_cost_usd)}${it.estimate ? ', est.' : ''}) — ${it.notes}`).join('\n') || '- None.'}
`;

const dir = path.join(ROOT, 'reports');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'latest-report.md'), report);
fs.writeFileSync(path.join(dir, `${dateStr}-${version}-report.md`), report);
console.log(`Report written: reports/latest-report.md and reports/${dateStr}-${version}-report.md`);

const errors = [...a.rules, ...a.recommendations].filter(x => x.level === 'error');
if (errors.length) {
  console.log(`\n${errors.length} error(s):`);
  errors.forEach(e => console.log(` - ${e.title}`));
  if (check) process.exit(1);
}
