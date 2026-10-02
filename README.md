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

## 🏴‍☠️ Current Design (v2.1): Two-Drum Pirate Catamaran

**Race day: Sat Oct 10, 2026**. [Official rules](https://whitewater.org/race/build-your-own-boat-competition/):
< 150 lb, max 10 × 10 × 5 ft, no metal, all materials must float, wood ≤ 1/4",
rope and straps ≤ 18", zip ties trimmed flush. The venue provides paddles,
PFDs and helmets.

| Spec | Value |
|------|-------|
| Flotation | **2 × 55-gal drums**, one per side (cut from 4 to meet the weight limit) |
| Footprint | 7 × 6 ft frame (~8.6 ft overall with bow) |
| Frame | 1-1/2" Sch 40 PVC, **foam-filled** so broken pieces float |
| Deck | 72" × 24" XPS foam core with Coroplast skins |
| Joinery | 17" zip ties (trimmed flush), PVC cement. **No metal.** |
| Est. weight | **~112 lb** (limit 150) |
| Crew | 1–2 recommended (~10.5" draft at 350 lb) |
| Theme | Pirate ship: Jolly Roger on a short PVC mast, red pennants, skull hull art |
| Planned cost | ~$689 functional + ~$104 decor + $8 tools = **~$801** |

Rules compliance, cut list and buoyancy are in
[`docs/design.md`](docs/design.md). 3D reference (4-drum version):
[`raft-render.html`](raft-render.html). Suppliers:
[`data/suppliers.json`](data/suppliers.json). Tooling work:
[`PLAN.md`](PLAN.md).

> ⚠️ `index.html`, `raft-render.html` and the report generator don't reflect
> v2.1 yet. See `PLAN.md`.

## 🤖 AI Improvement Prompts

The generated report includes ready-to-use prompts for Claude or GitHub Copilot
to suggest design improvements, weight reduction, and cost optimization.

---

*Whitewater Center Build-a-Boat Competition*
