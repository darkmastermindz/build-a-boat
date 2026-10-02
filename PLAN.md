# Plan: from suggested materials to the final build

**Race day: Sat Oct 10, 2026.** The design stays open (2–4 drums) until the
team picks a layout. The tools are now in place to compare options and to
grow the actual parts list toward the final product.

## Done (v2.2)

- `raft-simulation.html`: configurable 3D simulator. It has 5 layouts (2–4
  drums), frame, deck, crew and mast controls, a drum-leak scenario, a parts
  editor with export/import, a rules check, recommendations, layout
  comparison and a pipe cut list.
- `scripts/raft-model.js`: one shared model for the browser, the report and
  the tests. It covers hydrostatics (heave, trim and heel solve), GM in both
  axes, derived material needs, rules and recommendations.
- Data split: `build.json` (actual) / `catalog.json` (suggested) /
  `rules.json`.
- `generate-report.js` rewritten on the model, with `--check` to fail on rule
  errors.
- CI: tests and rules gate on PRs; the report is committed on `main` only,
  with a concurrency guard.

## Done (v2.3)

- Netlify-ready site with a design-profile dropdown (Save / Save as /
  Delete). Team profiles are shared through `/api/profiles`.
- **Fitted frame** mode matching the team's DWV mockup: fitting counts, cut
  lengths with take-off, and a stick count checked against the 5 sticks
  bought.
- Real shelf prices for the DWV fittings; `build.json` records the pipe as
  bought.

## Next: team decisions (this week)

1. **Organizers:** confirm daisy-chained zip-tie drum bands under the 18" rule.
2. **Pick a layout** in the Compare tab. Current lean: **Triangle (3 drums)**
   for stability under the weight limit, or **Pontoon (4)** if decor and
   cushions are cut to get under 150 lb. The catamaran is lightest, but it
   see-saws fore and aft.
3. **Crew size**: 1–2 for 2 drums, up to 3 for 3–4 drums.
4. **Measure the fitting take-off** on a dry-fit tee and set it in the
   simulator before cutting any pipe. Then cut from the Check tab's cut list.
5. **Actual parts list**: in the Parts tab, keep what you'll buy, delete the
   rest, fix the quantities using "Needed vs listed", then export and commit
   `data/build.json`.

## Next: tooling (as useful)

| # | Item | Why |
|---|------|-----|
| 1 | Mockup import: let the team type in custom drum positions (the `config.drums` array is already supported by the model) and add a small editor | Matches the team's own mockup exactly |
| 2 | Per-part placement (x, y, z) for heavy items | Better trim prediction than "frame centroid" |
| 3 | Shopping view: group parts by supplier with phone numbers from `suppliers.json` | One printable list per store |
| 4 | Float-test logger: enter the measured draft and back out the actual weight | Checks the model against reality |
| 5 | Retire `index.html` (v1.0) or point it at the new simulator | Avoid confusion |
| 6 | Dynamic wave sim (pitching in a wave train) | Nice to have; static stability already ranks the layouts |

## Validation before race day

- Float test in a pool or lake with the full crew. Compare the draft with the
  simulator.
- Bucket-test non-structural materials.
- Final weigh-in under 150 lb, logged in `build.json`.
