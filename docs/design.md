# Design v2.1: Two-Drum Pirate Catamaran

Sources:
- **[`raft-render.html`](../raft-render.html)**: 3D render of the 4-drum
  lightweight raft. Its frame and deck geometry carry over; the drum count does
  not (see below).
- **Team decision (2026-10-02):** cut to **2 drums** to stay under the 150 lb
  weight limit. The team's mockup isn't in the repo yet, so this doc keeps the
  render's frame and puts **one drum per side, centered fore-aft**. Update it
  when the mockup is added.
- **Boat Building Shopping List Comparison** Google Sheet (2026-09-29): parts,
  prices, local suppliers and decorations.
- **Official rules:**
  [whitewater.org/race/build-your-own-boat-competition](https://whitewater.org/race/build-your-own-boat-competition/).
  That site is blocked from the dev environment, so the rules below come from
  search excerpts of the page and 2026 event coverage. **Check them against the
  official page.**

## Event

- **Saturday, Oct 10, 2026**, competition 12–4 PM, U.S. National Whitewater
  Center, Class II–IV competition channel.
- Teams of 1–4, all 16 or older, $60 registration. Max 60 entries.
- Scored on **style and performance**.
- **The venue provides paddles, PFDs and helmets**, so they stay out of the
  BOM.

## Rules compliance

| Rule | Design status |
|------|---------------|
| Boat weight **< 150 lb** | ✅ ~112 lb estimated (2 drums). **Weigh before race day.** |
| Max **10 × 10 × 5 ft** (L × W × H) | ✅ ~8.6 × 6 ft. Height: deck top is ~27" off the drum bottom, so the mast must stay **under ~33"** above the deck |
| Wall height **< 2 ft** (floor to top of side wall) | ✅ Bow guard and noodle rail are well under 2 ft above the deck |
| **No metal** (nails, screws, staples, sheet metal…) | ✅ Ties, cement, epoxy and short paracord only |
| **All materials must float, even if broken** | ⚠️ Solid PVC sinks (SG ~1.4). **Fill every pipe and fitting with spray foam**; filled 1-1/2" pipe averages SG ~0.4. Drums (HDPE), Coroplast (PP), XPS and noodles float. Check that the canvas flag and seat cushions float |
| Wood **≤ 1/4"** thick | ✅ The 1" dowel mast is replaced by a foam-filled PVC offcut; no plywood |
| Rope, webbing and straps **≤ 18"** | ⚠️ The render's continuous rope wraps around the drums are **not allowed**. The plan is daisy-chained 17" zip-tie bands (2 per drum); **ask the organizers to confirm** |
| Zip ties **trimmed flush** | ✅ Flush-cut snips added (tool, not part of the boat) |
| Human powered | ✅ Paddles |

## Geometry

Units are inches. +X points to the bow.

| Element | Spec |
|---------|------|
| Footprint | 7 × 6 ft frame (84" rails × 72" beams); ~8.6 ft overall with the bow |
| Flotation | **2 × 55-gal drums** (23" dia × 34.5"), horizontal, one per side, centered fore-aft |
| Drum spacing | Centerlines ±23.5" from the boat centerline (47" apart) |
| Rails | 4 × 84" of 1-1/2" Sch 40, all foam-filled: an inner and an outer rail per side, 6" either side of the drum centerline |
| Cross beams | 4 × 72" at x = −36, −12, 12, 36, X-tied at all 16 crossings |
| Drum attachment | 2 bands of daisy-chained 17" zip ties per drum, around the drum and both rails |
| Deck | 72" × 24" × 2.3": 2 × 1" XPS core with Coroplast skins top and bottom |
| Bow | Elbow up, 12" riser, 18" strut, elbow in; foam-filled bow bar; curved Coroplast guard |
| Mast | Foam-filled 1-1/2" PVC offcut, under 33" above the deck, carrying the Jolly Roger |

### Pipe cut list (1-1/2" Sch 40, 10 ft lengths, all foam-filled)

| Stock | Cuts | Pieces |
|-------|------|--------|
| #1–2 | 84" inner rail + 36" offcut → 12" riser + 18" strut | 2 |
| #3–6 | 72" cross beam + 48" offcut (one becomes the mast) | 4 |
| #7–8 | 84" outer rail + 36" offcut → ~30" bow-bar half | 2 |

Fittings: 6 × 90° elbows and 1 coupling, solvent-welded and foam-filled.

## Buoyancy (2 drums)

Max buoyancy for 2 drums fully submerged is **~918 lb**. Draft comes from a
circular-segment solve (r = 11.5", 34.5" long), assuming ~110 lb dry. The
rails sit ~21" above the drum bottom.

| Crew | Total | Draft | Load % of max |
|------|-------|-------|---------------|
| 1 (~180 lb) | 290 lb | ~7.4" | 32% |
| 2 (~350 lb) | 460 lb | ~10.5" | 50% |
| 3 (~525 lb) | 635 lb | ~13.6" | 69% |
| 4 (~700 lb) | 810 lb | ~16.8" | 88% ⚠️ |

**Recommendation: crew of 1–2.** At 3 or more, the drums sit mostly
underwater and the frame will plow through Class II–IV waves.

**Pitch stability:** each side floats on a single 34.5" drum under an 84"
frame, so weight at either end tips the boat. Keep the crew close to the
middle, or shorten the rails and beams to match the drums. Shorter rails also
save weight. Settle this against the team's mockup.

## Cost and weight

| | |
|---|---|
| Functional parts | **$689.10** |
| Decorations | $103.83 |
| Tools | $7.99 |
| **Total** | **$800.92** |
| Estimated boat weight | **~112 lb**, leaving ~38 lb under the limit |

Prices for the foam-filled pipe, spray foam, fittings and snips are estimates.
Items marked `estimate: true` in `data/bom.json` need a check in store or by
phone.

## Open items

1. **Ask the organizers** whether daisy-chained zip-tie bands are OK under the
   18" securing-material rule.
2. Add the team's 2-drum mockup to the repo and update the frame dimensions.
3. Decide crew size (1–2 recommended).
4. Weigh the finished boat (limit 150 lb).
5. Check that the canvas flag and seat cushions float.
6. Call McManus Drum Co. about drum price and condition.
7. Check the rules against the official page.

Supplier contacts are in `data/suppliers.json`.
