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
├── raft-render.html        # 3D render of the v2.0 drum raft (three.js)
├── data/
│   ├── bom.json            # Bill of Materials — parts, costs, sources
│   └── suppliers.json      # Local supplier contacts (Charlotte/Concord, NC)
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

3D model: open [`raft-render.html`](raft-render.html) in a browser.

| Spec | Value |
|------|-------|
| Footprint | 7 × 6 ft frame (~8.6 ft overall with bow) |
| Flotation | 4 × 55-gal drums, 2 per pontoon, horizontal |
| Frame | 1-1/2" PVC: solid Sch 40 inner rails and beams, foam-core outer rails and bow bar |
| Deck | 72" × 24" XPS foam core with Coroplast skins |
| Joinery | Cable ties, paracord lashing, PVC cement. **No metal, screws or glass.** |
| Dry weight | ~137 lb |
| Draft | ~5" at 200 lb crew, ~6.6" at 350 lb |
| Theme | Pirate ship: Jolly Roger flag, red pennants, skull hull art |
| Planned BOM cost | ~$688 functional + ~$110 decor = **~$798** |

Details: [`docs/design.md`](docs/design.md). Local suppliers:
[`data/suppliers.json`](data/suppliers.json). Pending tooling updates:
[`PLAN.md`](PLAN.md).

> ⚠️ `index.html` and the report generator still model the v1.0 PVC-tube design
> until the work in `PLAN.md` lands.

## 🤖 AI Improvement Prompts

The generated report includes ready-to-use prompts for Claude or GitHub Copilot
to suggest design improvements, weight reduction, and cost optimization.

---

*Whitewater Center Build-a-Boat Competition*
