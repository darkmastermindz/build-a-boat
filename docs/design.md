# Design v2.0: Drum-Pontoon Pirate Raft (lightweight build)

Sources:
- **[`raft-render.html`](../raft-render.html)**: the 3D render from the
  boat-planning chat, the source of truth for geometry. Open it in a browser;
  drag to rotate and use the buttons to show or hide drums, deck, bow guard,
  lashing and water.
- **Boat Building Shopping List Comparison** Google Sheet (2026-09-29): parts,
  prices, local suppliers and the pirate decorations.

Where the two disagree, this doc follows the render (the lighter build).
Items from the sheet that the render drops are listed under
`removed_from_sheet` in `data/bom.json`.

## Competition constraints

- **Not allowed: metal, screws or glass.** No bolts, brackets, hose clamps,
  staples or tacks anywhere, including the decorations.
- Join parts with **cable ties, paracord lashing, PVC solvent cement, marine
  epoxy, silicone and fabric glue** only.
- Wood is allowed (the dowel mast).

## Geometry (from the render)

Units are inches. +X points to the bow.

| Element | Spec |
|---------|------|
| Footprint | **7 × 6 ft** frame (84" rails × 72" beams); ~8.6 ft overall with the bow |
| Flotation | 4 × 55-gal drums (23" dia × 34.5"), horizontal, 2 per pontoon end-to-end |
| Pontoon spacing | Centerlines ±23.5" from the boat centerline (47" apart) |
| Rails | 4 × 84" of 1-1/2" PVC. Each pontoon has a **solid Sch 40 inner rail** and a **foam-core outer rail**, 6" either side of the drum centerline, resting on the drums |
| Cross beams | 4 × 72" solid PVC on top of the rails at x = −36, −12, 12, 36 (24" spacing) |
| Joints | X-pattern cable ties at all 16 rail/beam crossings |
| Drum lashing | 2 rope wraps per drum, around the drum and over both rails (8 wraps) |
| Deck | 72" × 24" × 2.3" sandwich: 2 × 1" XPS core with Coroplast skins top and bottom, centered on the beams |
| Bow frame | On each outer rail: 90° elbow up, 12" riser, elbow forward, 18" strut, elbow inward. A foam-core bow bar with a center coupling joins the two sides |
| Bow guard | Curved Coroplast panel from the front beam up to the bow bar |
| Dry weight | **~137 lb** target (render). The BOM estimate with cushions, noodles and decor is ~149 lb |

### Pipe cut list (1-1/2", 10 ft lengths)

| Stock | Cuts | Pieces |
|-------|------|--------|
| Solid Sch 40 #1–2 | 84" inner rail + 36" offcut → 12" riser + 18" strut | 2 |
| Solid Sch 40 #3–6 | 72" cross beam (48" spare each) | 4 |
| Foam-core #1–2 | 84" outer rail + 36" offcut → ~30" bow-bar half | 2 |

Fittings: 6 × 90° elbows and 1 coupling, solvent-welded.

## Buoyancy check

Max buoyancy for 4 drums fully submerged (4 × 7.35 ft³ × 62.4 lb/ft³) is
**~1,835 lb**. Draft comes from a circular-segment solve on the horizontal
drums (r = 11.5", 34.5" long):

| Crew load | Total (137 lb dry) | Draft | Load % of max |
|-----------|-------------------|-------|---------------|
| 200 lb (render's design case) | 337 lb | ~5.1" | 18% |
| 350 lb (2 adults) | 487 lb | ~6.6" | 27% |
| 500 lb (3 adults) | 637 lb | ~8.0" | 35% |

At every load the drums sit less than half submerged, with the rails ~10"
above the drum centerline. That leaves lots of reserve buoyancy.

## Cost summary

| Scenario | Total |
|----------|-------|
| Sheet: everything from Home Depot (incl. new drums at $124.88) | $1,274.06 |
| Sheet: everything from Lowe's (where available) | $732.32 |
| **Planned BOM: lightweight build, cheapest source, functional parts** | **$688.22** |
| Planned decorations (paint, fabric, mast) | $109.81 |
| **Planned total** | **$798.03** |

Savings against the sheet come from dropping the large PVC, luan and marine
paint, using reconditioned local drums, and buying sheet goods to the
render's cut list. Foam-core pipe and fittings aren't on the sheet; their
prices are estimates.

## Open items

1. Call McManus Drum Co. to confirm drum price and condition, and that the
   bung caps seal.
2. Check foam-core PVC, elbow and coupling prices in store.
3. Check whether the Whitewater Center provides PFDs and paddles. If not, add
   them to the BOM.
4. Confirm crew size and the event's maximum boat dimensions.
5. Check the pool-noodle price: the HD listing is a 12-pack.

Supplier contacts are in `data/suppliers.json`.
