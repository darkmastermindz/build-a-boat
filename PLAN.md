# Change Plan: move the tooling to the v2.0 drum raft

`data/bom.json` and `docs/design.md` now describe the lightweight drum raft
shown in `raft-render.html`. The simulator (`index.html`) and the report
generator still assume v1.0 (4" PVC tubes as flotation). This plan brings them
in line. The render already has the right geometry, so it becomes the base of
the 3D view instead of something to rebuild from scratch.

## Current gaps

| File | Problem |
|------|---------|
| `index.html` | `BOM_DATA` is a hard-coded copy of the v1.0 BOM. The physics uses 4" tube volume. The "PVC Tubes" slider and the 2D side/top/front views draw tubes. |
| `raft-render.html` | Geometry is hard-coded constants (drum size, 84"/72" frame, water fixed at 5" draft) and the header stats are static text. Nothing ties it to `bom.json`. |
| `scripts/generate-report.js` | Counts flotation as `hull` parts named "Pipe", which finds 0 now, so it reports 0 lb displacement and "Sinks". Boat weight is guessed from cost. Its tips ("pre-drill holes", "bulk fastener packs") break the no-metal rule. |
| `.github/workflows/generate-report.yml` | Fires on every branch push and commits a report back to that branch. Uses `git push` with no ref and no concurrency guard. |
| `reports/` | Old v1.0 reports. |

## Phase 1: shared physics module

1. Add `scripts/physics.js`, dependency-free and usable from Node and the
   browser (UMD). It covers:
   - `maxBuoyancy(flotation)`: drum count × volume × 62.4.
   - `dryWeight(bom)`: Σ quantity × `weight_lb_each`. That field is now on
     every part.
   - `draft(flotation, totalLoad)`: circular-segment solve for horizontal
     drums. Its results must match `docs/design.md`: 337 lb → ~5.1", 487 lb →
     ~6.6".
   - `freeboard()`: rail height above the waterline. `loadRatio()`.
   - `stability()`: based on pontoon spacing ÷ beam width, load ratio and
     freeboard. It replaces the v1.0 heuristic.
2. Add `node --test` cases for the three draft values above and a 1-drum-lost
   case.

## Phase 2: report generator

1. Switch to `physics.js` and `hull.flotation` / `hull.frame`.
2. Add these sections:
   - **Rules compliance**: fail if any part matches
     bolt|screw|bracket|clamp|nail|staple|glass.
   - **Pipe cut list**, from `hull.frame`.
   - **Estimates to confirm**: parts with `estimate: true`.
   - **Price comparison**: HD / Lowe's / local, from `price_options`.
   - **Removed from sheet** and **open items**.
3. Show subtotals with and without decor. Replace the metal-related build tips
   with lashing and sealing tips.
4. Optional: list supplier contacts by part ID from `data/suppliers.json`.

## Phase 3: simulator

1. **Make the render data-driven**: read drum size, frame dimensions and deck
   size from `bom.json`, and set the water plane from `physics.draft()`
   instead of the fixed 5". Fill the header stats (footprint, dry weight,
   drum count) from data.
2. **Merge it into `index.html`**: add a **3D** view tab built from the
   render's three.js code, next to the existing Side / Top / Front views.
   Keep `raft-render.html` as a standalone share link that uses the same
   module.
3. Load `data/bom.json` with `fetch()` and drop the duplicate inline copy.
   Keep a fallback for `file://` use.
4. Controls:
   - Replace the "PVC Tubes" slider with a **crew load** slider (100–600 lb)
     and a **drum leak** toggle that drops one drum to show heel and draft.
   - Keep the length and beam sliders, but scale the frame model from them.
   - Add a **Load %** metric.
5. Redraw the 2D views to show drums, inner/outer rails, beams, the bow frame
   and the pirate mast and flag.
6. BOM tab: group by category, add HD / Lowe's / Alt price columns, show an
   estimate badge and the decor subtotal.

## Phase 4: CI and docs

1. Workflow:
   - Limit the `push` trigger to `main`.
   - Push with `git push origin HEAD:main`.
   - Add a `concurrency` group.
   - Run `node --test` plus the rules-compliance check as a gate.
2. Regenerate `reports/` as v2.0 and delete the old v1.0 reports.
3. Add a README screenshot of the 3D view.

## Decisions needed

- **Crew size / load:** the render's design case is 200 lb. Is the crew one
  person or two?
- **PFDs and paddles:** does the venue provide them, or do they go in the BOM?
- **Event size limits:** the boat is ~8.6 × 6 ft overall. Is that within
  the rules?
- **Pool noodles and cushions:** they're on the sheet but not in the render.
  Keep them?

## Suggested order

Phase 1 → 2 → 4.1 (correct reports, stops wrong CI commits) → 3.1–3.3 (3D
view on real data) → 3.4–3.6 → rest of 4.
