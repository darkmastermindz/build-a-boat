#!/usr/bin/env node
/**
 * generate-report.js
 * Reads data/bom.json and outputs a markdown improvement report
 * to reports/latest-report.md and reports/<date>-<version>-report.md
 *
 * Usage: node scripts/generate-report.js [version] [notes]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BOM_PATH = path.join(ROOT, 'data', 'bom.json');
const REPORTS_DIR = path.join(ROOT, 'reports');

// ── Load BOM ──────────────────────────────────
if (!fs.existsSync(BOM_PATH)) {
  console.error('ERROR: data/bom.json not found');
  process.exit(1);
}

const bom = JSON.parse(fs.readFileSync(BOM_PATH, 'utf8'));
const version = process.argv[2] || 'latest';
const userNotes = process.argv[3] || '';
const now = new Date();
const dateStr = now.toISOString().split('T')[0];

// ── Compute totals by category ────────────────
const byCategory = {};
let grandTotal = 0;
for (const part of bom.parts) {
  byCategory[part.category] = (byCategory[part.category] || 0) + part.total_cost_usd;
  grandTotal += part.total_cost_usd;
}

// ── Physics helpers ───────────────────────────
const hull = bom.hull || { length_ft: 10, width_ft: 4, height_ft: 1.5 };
const tubeCount = bom.parts.filter(p => p.category === 'hull' && p.name.includes('Pipe')).reduce((s, p) => s + p.quantity, 0);
const PVC_DIAM_FT = 4 / 12;
const tubVol = tubeCount * hull.length_ft * Math.PI * (PVC_DIAM_FT / 2) ** 2;
const displacement = Math.round(tubVol * 62.4);
const boatWeight = Math.round(bom.parts.filter(p => ['deck','hull'].includes(p.category)).reduce((s, p) => s + p.total_cost_usd * 0.4, 0) + 40);
const defaultCrewWeight = 300;
const freeboard = Math.max(0, ((displacement - boatWeight - defaultCrewWeight) / (hull.width_ft * hull.length_ft * 62.4)) * 12).toFixed(1);
const stability = Math.min(100, Math.round((hull.width_ft / hull.length_ft * 50) + (tubeCount / 4 * 30) + Math.min(20, parseFloat(freeboard) * 3)));

// ── Improvement suggestions ───────────────────
function suggestions() {
  const lines = [];
  if (stability < 70) {
    lines.push(`- ⚠️ **Stability (${stability}/100):** Consider widening beam from ${hull.width_ft} ft to ${hull.width_ft + 1} ft. Estimated added cost: ~$30 lumber.`);
  } else {
    lines.push(`- ✅ **Stability (${stability}/100):** Good. Consider rope safety rails along the perimeter.`);
  }
  if (parseFloat(freeboard) < 2) {
    lines.push(`- ⚠️ **Freeboard (${freeboard}"):** Low clearance. Add 1–2 PVC tubes or reduce crew weight for safety.`);
  } else {
    lines.push(`- ✅ **Freeboard (${freeboard}"):** Adequate. You may reduce tube count to save cost.`);
  }
  if (grandTotal > 600) {
    lines.push(`- 💰 **Cost ($${grandTotal.toFixed(2)}):** Over $600. Review fastener packs for bulk pricing and check local lumber yards.`);
  } else {
    lines.push(`- 💰 **Cost ($${grandTotal.toFixed(2)}):** Within budget. Great job keeping costs controlled!`);
  }
  lines.push(`- 🔧 **Build tip:** Pre-drill all holes before assembly to reduce splitting pressure on PVC joints.`);
  lines.push(`- 🛡️ **Safety:** Ensure all PFD (life jackets) are Type III or better and properly fitted before race day.`);
  return lines.join('\n');
}

// ── Build report markdown ─────────────────────
const report = `# 🚣 BOB – Build-a-Boat Improvement Report

**Version:** ${version}  
**Date:** ${dateStr}  
**Project:** ${bom.project}  
${userNotes ? `**Notes:** ${userNotes}` : ''}

---

## Design Specifications

| Parameter | Value |
|-----------|-------|
| Hull Type | ${hull.type || 'flat-bottom pontoon'} |
| Length | ${hull.length_ft} ft |
| Width | ${hull.width_ft} ft |
| Hull Height | ${hull.height_ft} ft |
| PVC Tubes | ${tubeCount} |

---

## Physics Assessment

| Metric | Value | Status |
|--------|-------|--------|
| Est. Displacement | ${displacement} lbs | ${displacement > boatWeight + defaultCrewWeight ? '✅ Floats' : '❌ Sinks'} |
| Freeboard | ${freeboard} in | ${parseFloat(freeboard) >= 2 ? '✅ Safe' : '⚠️ Low'} |
| Stability Score | ${stability}/100 | ${stability >= 70 ? '✅ Good' : '⚠️ Needs work'} |
| Est. Boat Weight | ${boatWeight} lbs | — |

---

## Improvement Suggestions

${suggestions()}

---

## Bill of Materials (BOM)

| ID | Part Name | Category | Qty | Unit Cost | Total | Source |
|----|-----------|----------|-----|-----------|-------|--------|
${bom.parts.map(p =>
  `| ${p.id} | ${p.name} | ${p.category} | ${p.quantity} ${p.unit} | $${p.unit_cost_usd.toFixed(2)} | $${p.total_cost_usd.toFixed(2)} | ${p.source} |`
).join('\n')}

---

## Cost Breakdown by Category

| Category | Cost |
|----------|------|
${Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, cost]) =>
  `| ${cat} | $${cost.toFixed(2)} |`
).join('\n')}
| **GRAND TOTAL** | **$${grandTotal.toFixed(2)}** |

---

## Sourcing Links

${bom.parts.filter(p => p.url).map(p =>
  `- [${p.name}](${p.url}) — ${p.source} (SKU: ${p.sku || 'N/A'})`
).join('\n')}

---

## AI Prompt Suggestions

Use these prompts with Claude or GitHub Copilot to get design improvement ideas:

\`\`\`
Prompt 1 — Stability:
"Our boat is ${hull.length_ft}ft long × ${hull.width_ft}ft wide with ${tubeCount} PVC pontoon tubes and 
a stability score of ${stability}/100. How can we improve stability without increasing overall cost 
significantly? Current BOM total: $${grandTotal.toFixed(2)}."

Prompt 2 — Weight reduction:
"We're building a competition boat weighing approximately ${boatWeight} lbs for the Whitewater Center 
build-a-boat event. What materials can we substitute to reduce weight while maintaining structural 
integrity? Key materials: ${bom.parts.filter(p=>p.category==='deck').map(p=>p.name).join(', ')}."

Prompt 3 — Cost optimization:
"Review this boat BOM and suggest where we can save money through bulk buying, alternative materials, 
or design simplification. Total budget: $${grandTotal.toFixed(2)}. Categories with highest spend: 
${Object.entries(byCategory).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([c,v])=>c + ' ($' + v.toFixed(2) + ')').join(', ')}."
\`\`\`

---

*Generated by BOB Simulator GitHub Action — Whitewater Center Build-a-Boat Competition*  
*Run at: ${now.toISOString()}*
`;

// ── Write files ───────────────────────────────
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

const latestPath = path.join(REPORTS_DIR, 'latest-report.md');
const versionedPath = path.join(REPORTS_DIR, `${dateStr}-${version}-report.md`);

fs.writeFileSync(latestPath, report, 'utf8');
fs.writeFileSync(versionedPath, report, 'utf8');

console.log(`✅ Report written to:`);
console.log(`   ${latestPath}`);
console.log(`   ${versionedPath}`);
console.log(`\n📊 Summary:`);
console.log(`   Total parts: ${bom.parts.length}`);
console.log(`   Grand total: $${grandTotal.toFixed(2)}`);
console.log(`   Stability:   ${stability}/100`);
console.log(`   Freeboard:   ${freeboard}"`);
