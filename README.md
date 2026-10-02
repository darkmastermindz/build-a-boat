# BOB — Build-a-Boat Simulator

Interactive simulation and design tool for the **Whitewater Center Build-a-Boat Competition**.

## 🚀 Quick Start

Open `index.html` in any modern browser — no build step required.

```
open index.html
```

Or serve it locally:
```bash
npx serve .
```

## 🗂️ Project Structure

```
bob/
├── index.html              # Interactive boat simulator (single-file HTML)
├── data/
│   ├── bom.json            # Bill of Materials — parts, costs, sources
│   └── suppliers.json      # Local supplier contacts (Charlotte area, NC)
├── docs/
│   └── design.md           # Current design, rules, buoyancy & cost notes
├── PLAN.md                 # Planned code changes
├── reports/
│   └── latest-report.md    # Most recent generated improvement report
├── scripts/
│   └── generate-report.js  # Node.js report generator
└── .github/
    └── workflows/
        └── generate-report.yml  # GitHub Action for automated reports
```

## ⛵ Simulator Features

- **Side / Top / Front views** of the boat
- **Live physics metrics** — displacement, freeboard, stability score
- **Adjustable parameters** — length, width, hull height, PVC tubes, crew weight
- **Wave & current simulation** — animated water with configurable intensity
- **BOM viewer** — full parts list with category-colored badges
- **Export report** — download a Markdown improvement report from the browser

## 📦 Bill of Materials

Edit `data/bom.json` to update parts, quantities, costs, and sources.
Run the report generator to produce a formatted Markdown report:

```bash
node scripts/generate-report.js v1.1 "Added extra cross-beam"
```

Reports are written to `reports/`.

## ⚙️ GitHub Action

The workflow `.github/workflows/generate-report.yml` triggers automatically when
`data/bom.json` or `index.html` changes, or can be run manually via
**Actions → Generate Boat Improvement Report → Run workflow**.

Inputs:
| Input | Description | Default |
|-------|-------------|---------|
| `version` | Report version label | `latest` |
| `notes` | Brief description of improvements | _(empty)_ |

The action:
1. Runs `scripts/generate-report.js`
2. Commits the report to `reports/`
3. Uploads the report as a downloadable artifact
4. Prints the report to the workflow summary

## 🏴‍☠️ Current Design (v2.0): Drum-Pontoon Pirate Raft

| Spec | Value |
|------|-------|
| Flotation | 4 × 55-gal plastic drums (2 per side) + 4 XPS foam boards |
| Frame | 1-1/2" Sch 40 PVC + 2 × 10–12" large PVC sections |
| Deck | 1/4" luan plywood, Coroplast side panels |
| Deck size | ~8 × 4 ft (assumed; to be confirmed) |
| Joinery | Cable ties, paracord, marine epoxy. **No metal, screws or glass.** |
| Theme | Pirate ship: Jolly Roger flag, red pennants, skull hull art |
| Est. buoyancy | ~1,835 lb max (load ≈ 35–40%) |
| Planned BOM cost | ~$916 functional + ~$110 decor = **~$1,026** |

Details: [`docs/design.md`](docs/design.md). Local suppliers:
[`data/suppliers.json`](data/suppliers.json). Pending tooling updates:
[`PLAN.md`](PLAN.md).

> ⚠️ The simulator and report generator still model the v1.0 PVC-tube design
> until the work in `PLAN.md` lands.

## 🤖 AI Improvement Prompts

The generated report includes ready-to-use prompts for Claude or GitHub Copilot
to suggest design improvements, weight reduction, and cost optimization.

---

*Whitewater Center Build-a-Boat Competition*
