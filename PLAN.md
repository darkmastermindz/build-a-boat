# Change Plan: move the tooling to the v2.0 drum-raft design

`data/bom.json` now describes the v2.0 drum-pontoon pirate raft (see
`docs/design.md`). The simulator and report generator still assume v1.0
(4" PVC tubes as flotation). This plan brings them in line.

## Current gaps

| File | Problem |
|------|---------|
| `index.html` | `BOM_DATA` is a hard-coded copy of the old BOM. The physics uses 4" PVC tube volume. The "PVC Tubes" slider and all three views draw tubes instead of drums. |
| `scripts/generate-report.js` | Counts flotation as `hull` parts named "Pipe", which finds 0 in the new BOM, so it reports 0 lb displacement and "Sinks". Its tips say "pre-drill holes" and "bulk fastener packs", which break the no-metal rule. |
| `.github/workflows/generate-report.yml` | Fires on any branch push. Its commit-back runs `git push` with no upstream branch set (works on `main` only) and can race other pushes. |
| `reports/` | Old v1.0 reports. They'll be replaced once the generator is fixed. |

## Phase 1: shared physics (small, do first)

1. Add `scripts/physics.js`, a dependency-free module (also loaded by
   `index.html` via a `<script>` tag) that exports:
   - `drumBuoyancy(count, volumeGal)`: max lift in lb.
   - `boatWeight(bom)`: sums per-part `weight_lb`. Add a `weight_lb` field to
     each BOM part instead of guessing weight from cost the way it's done now.
   - `draft()`, `freeboard()` and `loadRatio()` for horizontal cylinders (a
     circular-segment solver for submerged depth).
   - `stabilityScore()`, based on beam ÷ length, the drums' lateral spacing
     and the load ratio.
2. Read `hull.flotation` from `bom.json` (drum count, size, layout).

## Phase 2: report generator

1. Use `physics.js`. Replace the tube count with drum count and foam reserve.
2. Add sections for **Rules compliance** (flag any part whose name or category
   suggests metal: bolt, screw, bracket, clamp, staple, nail),
   **Open items** (from `bom.open_items`), **Estimates to confirm** (parts with
   `estimate: true`) and **Price comparison** (from `price_options`: HD vs
   Lowe's vs local).
3. Drop the metal-related build tips. Add lashing and sealing tips instead.
4. Add an "Excluding decor" subtotal.
5. Optional: link supplier contacts from `data/suppliers.json` by part ID.

## Phase 3: simulator (`index.html`)

1. Load `data/bom.json` with `fetch()` and keep the inline copy only as a
   fallback for `file://` use. This removes the duplicate data.
2. Replace the "PVC Tubes" slider with **Drums (2–6)** and **Layout**
   (2×2 inline / 4 across). Change the defaults to an 8 × 4 ft deck and
   ~350 lb crew.
3. Redraw the side, top and front views with horizontal drums under a PVC
   frame. Add a pool-noodle rail and the pirate mast and flag.
4. Add a **Load %** metric and a "drum leak" toggle that removes one drum, to
   show the foam reserve.
5. Group the BOM tab by category, show the decor subtotal, and add HD / Lowe's
   / Alt price columns plus an "estimate" badge.

## Phase 4: CI and docs

1. Workflow: limit the `push` trigger to `main`, use `git push origin HEAD`,
   and add `concurrency` so overlapping runs don't race.
2. Add `node --test` checks for `physics.js` (a known drum volume gives the
   expected lift) and a BOM schema/metal-word lint step in CI.
3. Regenerate `reports/` as v2.0. Update the README screenshots and notes.

## Decisions needed

- **Deck size:** the BOM assumes 8 × 4 ft. What are the event's size limits?
- **Crew size:** the buoyancy check assumes 2 people at ~350 lb.
- **PFDs and paddles:** does the venue provide them, or do they go back in
  the BOM?
- **Large PVC:** if thin-wall pipe isn't available, consider dropping the
  "housing" pipe and saving about 150 lb and $130.

## Suggested order

Phase 1 → 2 (gets correct reports on CI quickly) → 4.1 (stops CI commit
noise) → 3 (largest change) → rest of 4.
