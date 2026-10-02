# Design v2.0: Drum-Pontoon Pirate Raft

This doc records the design from the boat-planning chat and the
**Boat Building Shopping List Comparison** Google Sheet (2026-09-29). It
replaces the v1.0 4" PVC pontoon design.

## Competition constraints

- **Not allowed: metal, screws or glass.** No bolts, brackets, hose clamps,
  staples or tacks anywhere on the boat, including the decorations.
- Join parts with **cable ties, paracord lashing, marine epoxy, silicone
  sealant and fabric glue** only.
- Wood is allowed (luan deck, dowel mast).

## Concept

| Element | Choice |
|---------|--------|
| Flotation | 4 × 55-gal plastic drums: 2 per side, horizontal, lashed under the frame |
| Backup flotation | 4 × 1" XPS foam boards (keeps the boat afloat if a drum leaks) |
| Frame | 1-1/2" Sch 40 PVC rails and cross-members |
| Housing / hull shape | 2 × 10–12" large-diameter PVC sections (special order) |
| Deck / skin | 1/4" luan plywood deck, 4 mm Coroplast side panels |
| Joints | 17" UV heavy-duty cable ties, 550 paracord, marine epoxy |
| Comfort / safety | Pool-noodle top rail and bow bumper, seat cushions |
| Finish | Marine topside paint on all wood |
| Theme | Pirate ship: Jolly Roger flag, red pennants, skull-and-crossbones hull art on a 72" dowel mast |

The sheet doesn't give exact dimensions. `data/bom.json` assumes an
**8 × 4 ft** deck based on the 4×8 sheet goods. Confirm this against the
event's size limits.

## Buoyancy check (rough)

| Item | Estimate |
|------|----------|
| Max buoyancy, 4 drums fully submerged (4 × 7.35 ft³ × 62.4 lb/ft³) | **~1,835 lb** |
| Boat weight, Sch 40 large PVC (~7.5 lb/ft) | ~360 lb |
| Boat weight, thin-wall SDR-35 large PVC (~3 lb/ft) | ~270 lb |
| Crew (assumed 2 people) | ~350 lb |
| **Load as % of max buoyancy** | **~34–39%** |

The target is ≤ 50% so the drums ride about half-submerged with good
freeboard. **Watch-out:** the large PVC is the heaviest part. Ask suppliers
for thin-wall (SDR-35 sewer or drain) pipe instead of Sch 40.

## Cost summary

`data/bom.json` uses the cheapest confirmed source for each item. Local drum
suppliers and Harbor Freight beat the big-box stores on drums, epoxy and
sealant.

| Scenario | Total |
|----------|-------|
| Sheet: everything from Home Depot (incl. new drums at $124.88) | $1,274.06 |
| Sheet: everything from Lowe's (where available) | $732.32 |
| **Planned BOM: cheapest source per item, functional parts** | **$915.90** |
| Planned decorations (paint, fabric, mast) | $109.81 |
| **Planned total** | **$1,025.71** |

Why the planned total is higher than "all Lowe's": the Lowe's column skips
items Lowe's doesn't stock (drums, large PVC). The planned BOM includes them
at local estimates: drums at $35 each, large PVC at about $65 per length.

## Open items

1. Call McManus Drum Co. to confirm drum price and condition, and that the
   bung caps seal.
2. Get large-PVC quotes from Ferguson, Hubbard and Catawba Valley, and ask
   about thin-wall pipe.
3. Check whether the Whitewater Center provides PFDs and paddles. If not, add
   them to the BOM.
4. Confirm crew size and the maximum boat dimensions in the competition rules.
5. Check the pool-noodle price: the HD listing is a 12-pack.

Supplier contacts are in `data/suppliers.json`.
