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

## 📐 Export to SolidWorks (STEP)

The model exports as a STEP AP214 file in inches. SolidWorks opens it with
**File → Open**, file type STEP, as a multibody part with one named solid for
each part. Every solid is named by its part ID:

- **P… pipes:** hollow 1-1/2" Sch 40 tubes (OD 1.900", ID 1.610"), centre to
  centre between joints.
- **J… fittings:** 2.6" spheres at the joints, as drawn in the 3D view.
- **D… drums:** solid cylinders at their outside size.
- **K1 deck:** a box.
- **N… noodles:** 2.5" cylinders.

Each solid is coloured. Axes match the simulator: x is fore-aft (bow +), y is
up (drum bottoms at 0) and z runs port (−) to starboard (+). Side panels, the
curved bow noodle, the mast and the crew are left out.

There are three ways to get the file:

- **Simulator:** the 📐 STEP (SolidWorks) button downloads the design you have
  on screen.
- **Live site:** [/bob-raft.step](https://bob-sim.netlify.app/bob-raft.step)
  is the team's `data/build.json`, rebuilt on every deploy.
- **Command line:**

  ```bash
  npm run step -- data/build.json bob-raft.step
  # optional check with OpenCascade (pip install cadquery-ocp):
  node scripts/export-step.js data/build.json bob-raft.step --expect expected.json
  python3 scripts/check-step.py bob-raft.step expected.json
  ```

  The check confirms that every solid is a valid closed shape and that its
  volume matches its dimensions.

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
│   ├── step-export.js       # STEP (AP214) export for SolidWorks (browser + Node)
│   ├── export-step.js       # CLI: build.json → .step
│   ├── check-step.py        # Optional: validate a .step with OpenCascade
│   └── generate-report.js   # Markdown build report from build.json
├── tests/raft-model.test.js # node --test
├── tests/step-export.test.js # STEP structure and solid topology checks
├── tests/engineering.test.js # physics checked against hand calculations
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
- **Side fit (chord)** (box frames): a negative *Side fit* pulls the box's
  side rails inside the drum's diameter. Each side becomes a chord of the
  drum's circle and all four rails press on the drum, so it can't roll.
  - −2.6" makes a square box (rails at 45°). The current plan uses it.
  - Pipe lengths follow; click a box pipe to adjust its fit.
- **PVC platform + noodles** (optional, off by default): a PVC grid on the box
  tops for the foam deck to sit on, with cross members every 16".
  - **How it joins:** it rests one pipe diameter above the box top rails, so it
    can't share their fittings. Every place a platform pipe crosses a box rail
    is lashed with 2 zip ties in an X. Each tie must be 12–18" long.
  - The lashings are counted in the ties, drawn on the boat, and labelled L1, L2…
    in 🏷️ IDs.
  - Yellow pool noodles fill the gaps between the cross members.
  - The bow noodle and the noodle count in the parts check don't depend on it.
- **Side panels** (box frames): the corrugated PVC roofing panels.
  - **Curved hull (default):** one boat-shaped piece around all the boxes,
    with a square transom and a pointed bow. The **Hull bow point** slider
    sets how far the point sits ahead of the boxes. A small pipe nose (top
    and bottom chords and a post) holds the point.
  - **Flat:** a panel on each outer box face. Shared walls stay open.
  - Panels run from the bottom rail to the top rail.
  - The cut list packs the pieces into 26" × 8 ft panels. The current plan
    uses 3 of the 4 bought.
  - Only the area used is weighed. Ties to the rails, about every 18", are
    added to the zip-tie count.
  - Panels have their own **Sides** layer and can be painted or clicked for
    sizes.
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
- **🧰 Tools panel** (button under the 3D view):
  - 👆 Adjust: click a part for sliders.
  - 🔗 Zip tie: click a pipe, joint or drum to add a support tie; click a
    tie to remove it. Added ties count toward the zip-tie total and weight.
  - 🎨 Paint: pick one of your paint parts and click parts to paint them.
    Shift-click paints every part of that kind; Erase removes paint.
    - The panel shows the painted area and cans needed per color (one coat,
      ~15 sq ft a can) against cans on the list.
    - Painted area replaces the paint cans in the weight.
  - 🏴‍☠️ Decals: stripe (wraps the hull at the clicked height), skull and
    crossbones, porthole, nautical star, flames and the boat name.
    - Pick a size and colour, and choose a vinyl sticker (to buy) or
      painted (stencil). Erase removes a decal.
    - Stickers show up as optional items in the Next shopping trip, with
      Home Depot, Lowe's and Amazon links.
  - 📏 Measure.
  - **↶ Undo / ↷ Redo** (Ctrl+Z / Ctrl+Shift+Z). Dragging a slider counts
    as one step.
  - **🏴‍☠️ One Piece theme**: white hull, red stripe, the yellow noodle
    "mane" around the bow, straw-hat skulls on both bow sides, the name on
    the stern and a straw-hat Jolly Roger.
    - It uses the white and red paints already bought.
    - *Plain* removes it.
  - Ties, paint and decals are saved with the design and follow parts when you
    resize them.
- **Crew**: 1–4 people, weight each, seat position and lean.
- **Physics**: solves heave, trim and heel for horizontal drums, then reports
  draft, frame clearance, reserve buoyancy and stability (GM) both ways.
  Scenarios cover crew at the bow, crew leaning, and **any one drum
  leaking**.
- **Weight counts what ends up on the boat**:
  - Pipe, fittings and zip ties are weighed by what the layout uses.
  - Foam board and Coroplast are weighed by the deck area cut from them.
  - Paint, glue, sealant, tape and twine are weighed by a "% on boat" share
    of each container, which you can edit per part.
  - Leftovers count as spares, not boat weight.
  - Parts ticked "not on the boat yet" (bought, use undecided) are left out
    of the total, and the Check tab shows what they'd add.
- **Part status**:
  - 💡 suggested: an idea, not weighed, optional on the shopping list.
  - 📝 planned: will buy.
  - 🚚 ordered: paid, on the way. Counts as bought.
  - ✅ bought.
  - 🔧 installed.
  - ⏸️ marks a part that isn't on the boat yet.
  - Each part row is colour-coded, and the chips above the list filter by
    status. Parts added from the suggested materials start as 💡 suggested.
- **Engineering** (top of the Check tab, and in the report):
  - **🛟 Buoyancy:** total lift, reserve and safety factor; each drum's
    load, share and depth; what the foam-filled pipe carries; whether the
    wreck floats on its foam if swamped.
  - **🌊 Drag:** underwater area from ahead and the side; force and power
    at 1–3 mph; top speed at about 75 W per paddler; broadside force in a
    3–8 mph current.
  - **⚖️ Weight distribution:** centre of gravity, the split forward and
    aft, its height above the waterline, and weight by group.
  - **🔩 Structure:** bending stress and safety factor of the box top rails
    (crew), the box under drum uplift (a drum pushed under), platform cross
    members (worst span), the bow nose, and deck tie-downs.
    - Crew loads are doubled for slamming. PVC flexural strength is about
      14,000 psi; the target safety factor is 2.5.
- **Show the work:** click any engineering row to expand its formula, every
  number plugged in, and the reasoning behind it. Structural issues on the
  model have a *Show the work* button too, and the report includes all of it.
- **Sources:** every worked calculation links to where its formula comes from:
  Wikipedia, Khan Academy, Brilliant and Wolfram first, then papers, standards
  and datasheets. *Assumptions and sources* (bottom of the engineering panel)
  lists each assumed constant next to what the sources say. The tests check
  that each constant stays inside its source's range.
- **🏷️ IDs** (button under the 3D view): labels every part so you can refer to it.
  - **Prefixes:** pipes P, joints J, drums D, side panels S, noodles N, deck K,
    mast M, crew C, extra zip ties T. For example, "J3 is a 4-way fitting joining
    P2, P6, P7 and P13".
  - **Numbering:** bow first, then top to bottom, then port to starboard. The
    same design always gets the same IDs; changing the design renumbers them.
  - **Find:** type an ID to jump to that part and open its popup.
  - **Elsewhere:** the cut list and the report use the same IDs, and the report
    lists every joint with its fitting type and the pipes it joins.
- **🌊 Whitewater** (button under the 3D view): simulates the U.S. National
  Whitewater Center's Class II and III rapids on the competition (race) or
  wilderness channel.
  - **Channel:** current speed and depth come from the published flow and
    slope, using the Manning formula. Width and roughness are assumptions you
    can change.
  - **Waves:** the boat is balanced on Class II (3 ft) and Class III (5 ft)
    standing waves at every position, head-on and sideways. Each drum slice
    floats at its local water level, plus the downhill (Froude–Krylov) push.
    The waves are never steeper than the breaking limit.
  - **Drops:** each drop leads into a hydraulic jump (energy plus the Bélanger
    equation). The check reports hole height and length, and whether the hole
    holds the boat.
  - **Also checked:** resonance with the boat's natural pitch and roll periods,
    and the broadside pinning force.
  - Warnings get their own category, in the panel and in the Check tab. Each
    one shows its work and sources.
  - Click a feature to watch the boat ride it in 3D.
  - Download a JSON artifact (inputs, results, assumptions, sources) and a
    Markdown summary.
- **⚠️ Issues** (button under the 3D view): numbered markers on the boat for
  every warning and error, placed where each problem is.
  - Pipes that fail a structural check turn orange or red.
  - Click a marker or a list entry to see what's wrong and how to fix it.
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
- **⬇️ Export** (header): downloads every setting of the current design as
  JSON: layout, parts, paint, decals, ties and theme.
- **⇪ Propose PR** (header): opens a GitHub pull request with the design.
  - *As the default design* replaces `data/build.json`.
  - *As a new saved design* adds `data/designs/<name>.json`, which shows in
    the dropdown under *Saved in the repo*.
  - It needs a `GITHUB_TOKEN` environment variable in Netlify: a
    fine-grained token with Contents and Pull requests write access to this
    repo. Without it, the page downloads the file and opens GitHub's
    upload/edit page, where you choose *Create a new branch and start a pull
    request*.
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
- `POST /api/propose`: opens a PR with a design (needs `GITHUB_TOKEN`).
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
