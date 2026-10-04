# BOB — Build-a-Boat Simulator

Design tool for the **U.S. National Whitewater Center Build Your Own Boat
Competition**: **Saturday, Oct 10, 2026**, on the Class II–IV competition
channel.

The team is building a pirate-themed drum raft. This repo holds the
**configurable 3D simulator**, the team's **actual parts list**, a list of
**suggested materials**, and a rules checker that turns all of it into
recommendations.

## 🌐 Live site

**https://bob-sim.netlify.app**: the simulator, deployed on Netlify,
with shared design profiles.

## 🏴‍☠️ Current plan

**Packed triangle in box frames** (the default in `data/build.json`):
- 1 drum at the bow and 2 side by side behind it, every drum boxed in 1-1/2"
  PVC.
- The rear pair sits 4" apart, and the drums sit 6" forward so the boat
  floats level.
- Predicted weight about 138 lb. Side-to-side stability is low (GM +2"), so
  keep the crew low and centered.
- See `docs/design.md` for the numbers and tradeoffs.

## 🚀 Quick start

Requires Node 24 (see `.nvmrc`).

```bash
npm install
npx netlify dev        # full site incl. shared profiles API at http://localhost:8888
# or static only:  npx serve .  → http://localhost:3000/raft-simulation.html
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
├── netlify/functions/profiles.mts  # Shared design profiles API (Netlify Blobs)
├── netlify.toml / package.json     # Netlify build: tests → dist/
├── data/profiles.json       # Built-in suggested design profiles
├── scripts/
│   ├── build-site.js        # Assembles dist/ for Netlify
│   ├── raft-model.js        # Shared geometry, hydrostatics, rules and recommendations (browser + Node)
│   └── generate-report.js   # Markdown build report from build.json
├── tests/raft-model.test.js # node --test
├── docs/design.md           # Design notes, rules compliance, findings
├── PLAN.md                  # Roadmap to the final build
└── reports/latest-report.md # Latest generated report
```

## ⛵ Simulator

- **Frame joinery**: *Fitted* (1-1/2" DWV tees, double sani tees and
  elbows, cut to length: the team's first mockup) or *Stacked* (beams
  zip-tied on rails, from the original render). Fitted mode computes the
  fitting counts and exact cut lengths, and "Fit frame length to drums" sizes
  the frame to the drums.
- **Frame joinery**: also **Box frames**, where each drum sits in its own box
  of pipe (top and bottom rectangles and corner posts) and the boxes are
  linked, with no separate deck frame. Pairs with the **Staggered
  catamaran** and **Packed triangle** layouts from the team's Onshape
  sketches. Boxes that touch share walls and crossbars, and their 4-pipe
  corners are counted as 4-way fittings.
- **Drum retention**: zip-tie bands, or **caged** between two PVC frames
  (a lower cradle or a single rail under each drum, with posts up to the deck
  frame). Caging adds pipe, fittings and weight, and is shown for every
  layout in Compare.
- **Layouts with 2–4 drums**: catamaran (2), staggered catamaran (2),
  trimaran (3 side by side), triangle (bow drum + 2 stern), packed triangle
  (bow drum + 2 side by side, the **current plan**), pontoon (4, 2 per side) and wide raft (4
  across). Each one has adjustable frame length, beam length, beam count,
  pontoon spacing, drum position, deck size, mast height, bow frame and
  noodle rail.
- **Drums**: pick a standard plastic drum size (55, 30 or 15 gal) or enter
  your own gallons, diameter, length and empty weight. Buoyancy, frame height,
  the cut list and the 3D view all follow the drum you enter.
- **Part sizes and 📏 Measure**:
  - Hover over any part, or tap it on a phone, to see its size. Pipes show
    the center-to-center length and the cut length after fitting take-off.
    Drums show gallons, diameter, length and position. The deck shows its
    size.
  - **Click a part to adjust it.** The popup gets sliders for the settings
    that drive that part, and the frame is rebuilt around the drums so the
    other pipes follow:
    - drums: their own diameter, length and weight, position, pair gap;
    - box pipes: end, side and top clearance;
    - frame pipes: frame length, beam length and spacing, take-off;
    - deck: size; mast: height; crew: weight and seat.
    - The selected part is highlighted, and an open measurement stays
      attached to its points and updates as you slide.
  - **📏 Measure**, below the 3D view, measures between two clicked points.
    Points snap to pipe ends and midpoints, fitting and drum centers, drum
    ends and deck corners (shown yellow).
  - It gives the straight-line distance plus the fore-aft, up and across
    parts. Turning 📏 off keeps the finished measurement on screen while you
    adjust parts, and Esc clears it.
- **Crew**: 1–4 people, weight each, seat position and lean.
- **Physics**: solves heave, trim and heel for horizontal drums, then reports
  draft, frame clearance, reserve buoyancy and stability (GM) both ways.
  Scenarios cover crew at the bow, crew leaning, and **any one drum
  leaking**.
- **Parts tab**: the team's actual list. Add parts from the suggested
  materials or as custom parts, and track qty, weight (tick **measured** once
  weighed), cost and status (planned / bought / installed). Changes are saved
  in the browser. **Export** downloads `build.json`; commit it to `data/`.
- **Next shopping trip** (Check tab):
  - Home Depot and Lowe's product links for every item, plus local suppliers.
  - Enter a ZIP for "near you" store and supplier map links. The ZIP stays on
    your device and is never saved to `build.json` or profiles.
  - Live stock isn't available here; each store's site shows in-store
    availability once you pick your store.
- **Check tab**: competition rules, recommendations, what the layout needs
  compared with what's listed, and the pipe cut list.
- **Compare tab**: 10 structures (catamaran, staggered catamaran, tandem,
  trimaran, triangle, reverse triangle, packed triangle, pontoon, diamond,
  wide raft), each run with your crew,
  drums and parts.
  - Every structure gets plain-language pros and cons: stability, leaks,
    weight, parts you own, handling and build effort.
  - A "what matters most" selector re-ranks them.
- **Design profiles** (the dropdown in the header): load a suggested design
  or a team design, then **Save** (overwrite) or **Save as…** (new profile).
  - On the Netlify site, profiles are shared with everyone through
    `/api/profiles` (a Netlify Function backed by Netlify Blobs).
  - On a plain static server they're saved on your device instead.
  - Suggested designs come from `data/profiles.json`.
- **Set as default / Reset to default** (header):
  - **Set as default** makes the current design the one the simulator opens
    with. On the Netlify site that applies to everyone (`/api/default`);
    elsewhere it applies to this device only.
  - **Reset to default** discards your changes and goes back to that
    design.
  - With no default set, the simulator opens `data/build.json`.

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

## ☁️ Netlify

Project: `bob-sim`. The build runs `npm test && npm run build`, publishes
`dist/`, and deploys `netlify/functions/profiles.mts`.

- `/`: the simulator. `/raft-render.html`: the original render.
  `/legacy.html`: the v1.0 simulator.
- `GET /api/profiles`, `GET|PUT|DELETE /api/profiles/:id`: team profiles.
- `GET|PUT|DELETE /api/default`: the team's default design (falls back to
  `data/build.json`).
- Production deploys write to the global `profiles` blob store; previews use a
  deploy-scoped store, so test saves never reach production.
- Anyone with the URL can save or delete profiles. To restrict that, turn on
  site password protection in Netlify.

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
Team: “Knot So Fast”
*Build Your Own Boat Competition*
