# Change Plan: v2.1 two-drum catamaran

**Race day is Sat Oct 10, 2026, 8 days out.** The plan puts build-critical
work first. Tooling polish only matters if it helps the team build and pass
inspection.

`data/bom.json` (v2.1) and `docs/design.md` are current. The simulator
(`index.html`), the 3D render and the report generator still show older
designs.

## Phase 0: build-critical (this week, no code)

1. **Organizers:** ask whether daisy-chained 17" zip-tie bands are OK for
   holding the drums, given the 18" securing-material rule. Without a yes, the
   drum attachment needs a redesign. One option is drum saddles cut from foam
   board, X-tied to the rails.
2. **Mockup:** add the team's 2-drum mockup (photo, sketch or HTML) to
   `docs/`. Update `hull.frame` in `bom.json` if the rails or beams were
   shortened.
3. **Crew size:** 1–2 recommended (see the buoyancy table in the design doc).
4. **Shopping:** call McManus Drum, then buy from the BOM. Check the
   `estimate: true` prices in store.
5. **Weigh-in:** weigh the drums and the assembled frame as you go, and log the
   numbers in `bom.json` (`weight_lb_each`) so the estimate turns into a
   measurement.

## Phase 1: report generator + rules check (~half a day)

This gives the team a one-command "are we legal?" check.

1. Add `scripts/physics.js` (UMD, no dependencies) with `maxBuoyancy`,
   `dryWeight` (Σ quantity × `weight_lb_each`, skipping `tools`), `draft`
   (circular-segment solve) and `loadRatio`. Add `node --test` cases matching
   the design-doc table: 290 lb → ~7.4", 460 lb → ~10.5".
2. Add `scripts/check-rules.js`, which reads `bom.rules` and fails on:
   - dry weight ≥ `max_boat_weight_lb`
   - frame or mast dimensions over `max_dimensions_ft`
   - any part name matching metal words (nail|screw|staple|bolt|bracket|clamp|wire|sheet metal)
   - any `wood` part thicker than 1/4"
   - any rope or strap part not marked as ≤ 18" pieces
   - pipe without a foam-fill step (no `A004` in the BOM)
3. Rework `generate-report.js` to use these. Add sections for rules
   compliance, the draft table by crew size, the cut list, estimates to
   confirm, and price comparison. Drop the v1.0 tips (pre-drilling, fastener
   packs).

## Phase 2: CI fix (~30 min)

1. Limit the `generate-report.yml` push trigger to `main`, push with
   `git push origin HEAD:main`, and add a `concurrency` group.
2. Gate the workflow on `node --test` and `check-rules.js`.
3. Regenerate `reports/` as v2.1 and delete the v1.0 reports.

## Phase 3: 3D render (after the mockup)

1. Make `raft-render.html` data-driven: read `bom.json` for drum count,
   placement, frame size and deck. Set the water plane from
   `physics.draft()` with a crew slider (1–4 people).
2. Replace the rope-wrap meshes with zip-tie bands. Shorten the mast to under
   33" and add the Jolly Roger.
3. Show live stats: weight vs the 150 lb limit, draft and load %.

## Phase 4: simulator (after race day, optional)

1. Add the render to `index.html` as a 3D tab, load `bom.json` with `fetch()`
   and drop the inline copy.
2. Replace the "PVC Tubes" slider with drum count and crew. Redraw the 2D views.
3. Group the BOM tab by category with HD / Lowe's / Alt prices.

## Decisions needed

- Do the daisy-chained zip-tie bands pass the 18" rule? (Ask the organizers.)
- What does the mockup's frame look like: full 84" rails, or shortened to the
  drums?
- Crew size?
- Keep the pool noodles and seat cushions? They add ~6 lb, and the cushions
  must float.
