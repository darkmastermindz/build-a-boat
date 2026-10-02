# BOB — Build-a-Boat Simulator

Design tool for the **U.S. National Whitewater Center Build Your Own Boat
Competition**: **Saturday, Oct 10, 2026**, on the Class II–IV competition
channel.

The team is building a pirate-themed drum raft. This repo holds the
**configurable 3D simulator**, the team's **actual parts list**, a list of
**suggested materials**, and a rules checker that turns all of it into
recommendations.

## 🚀 Quick start

```bash
npx serve .            # or: python3 -m http.server
# open http://localhost:3000/raft-simulation.html
```

`raft-simulation.html` loads its data with `fetch()`, so serve the folder
rather than opening the file directly. If the data doesn't load, the page
falls back to defaults and lets you import a `build.json`.

## 🗂️ Project structure

```
bob/
├── raft-simulation.html     # ⭐ Configurable 3D simulator: layouts, parts, rules, recommendations
├── raft-render.html         # Original static render of the 4-drum lightweight raft (reference)
├── index.html               # Legacy v1.0 2D simulator (PVC-tube pontoon)
├── data/
│   ├── build.json           # The team's ACTUAL build: configuration + parts (edit via the simulator)
│   ├── catalog.json         # SUGGESTED materials (from the shopping-list sheet + rule-driven additions)
│   ├── rules.json           # Competition rules used by the checker
│   └── suppliers.json       # Local suppliers (Charlotte area, NC)
├── scripts/
│   ├── raft-model.js        # Shared geometry, hydrostatics, rules and recommendations (browser + Node)
│   └── generate-report.js   # Markdown build report from build.json
├── tests/raft-model.test.js # node --test
├── docs/design.md           # Design notes, rules compliance, findings
├── PLAN.md                  # Roadmap to the final build
└── reports/latest-report.md # Latest generated report
```

## ⛵ Simulator

- **Layouts with 2–4 drums**: catamaran (2), trimaran (3 side by side),
  triangle (bow drum + 2 stern), pontoon (4, 2 per side) and wide raft (4
  across). Each one has adjustable frame length, beam length, beam count,
  pontoon spacing, drum position, deck size, mast height, bow frame and
  noodle rail.
- **Crew**: 1–4 people, weight each, seat position and lean.
- **Physics**: solves heave, trim and heel for horizontal drums, then reports
  draft, frame clearance, reserve buoyancy and stability (GM) both ways.
  Scenarios cover crew at the bow, crew leaning, and **any one drum
  leaking**.
- **Parts tab**: the team's actual list. Add parts from the suggested
  materials or as custom parts, and track qty, weight (tick **measured** once
  weighed), cost and status (planned / bought / installed). Changes are saved
  in the browser. **Export** downloads `build.json`; commit it to `data/`.
- **Check tab**: competition rules, recommendations, what the layout needs
  compared with what's listed, and the pipe cut list.
- **Compare tab**: every layout run on your parts and crew, with a suggested
  pick.

## 📋 Workflow toward the final build

1. Pick a layout in the simulator and tune it until the Check tab is clean.
2. Edit the Parts tab to match what you'll actually buy. Start from the
   suggested materials and adjust.
3. Export `build.json`, commit it, and push or open a PR. CI runs the tests and
   the rules check, and writes `reports/latest-report.md`.
4. As parts arrive, weigh them and set `weight_measured`. Mark status as
   bought / installed.

Report from the command line:

```bash
node scripts/generate-report.js v2.2 "notes" --check   # exits 1 on rule errors
node --test tests/*.test.js
```

## ⚙️ GitHub Action

`.github/workflows/generate-report.yml` runs on PRs and on pushes to `main`
that touch `data/`, `scripts/` or `tests/`, and can also be run manually. It
runs the tests, generates the report (and fails on rule errors), commits the
report on `main`, and uploads it as an artifact.

## 📏 Competition rules (summary)

Under 150 lb · max 10 × 10 × 5 ft · walls under 2 ft · **no metal** · **all
materials must float, even broken** · wood ≤ 1/4" · rope and straps ≤ 18" ·
zip ties trimmed flush · human powered · teams of 1–4. Paddles, PFDs and
helmets are provided. Full details:
[official page](https://whitewater.org/race/build-your-own-boat-competition/)
and `data/rules.json`.

---

*Whitewater Center Build Your Own Boat Competition*
