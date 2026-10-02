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
│   └── bom.json            # Bill of Materials — parts, costs, sources
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

## 🔩 Current Design (v1.0)

| Spec | Value |
|------|-------|
| Hull type | Flat-bottom pontoon |
| Length | 10 ft |
| Width | 4 ft |
| Hull height | 1.5 ft |
| PVC tubes | 4 × 4" diameter |
| Total BOM cost | ~$509 |

## 🤖 AI Improvement Prompts

The generated report includes ready-to-use prompts for Claude or GitHub Copilot
to suggest design improvements, weight reduction, and cost optimization.

---

*Whitewater Center Build-a-Boat Competition*
