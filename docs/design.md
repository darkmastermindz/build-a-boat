# Design Notes: Pirate Drum Raft

**Status:** open-ended. The team is choosing between **2, 3 and 4 drum**
layouts and building the actual parts list. Use
[`raft-simulation.html`](../raft-simulation.html) to try configurations; this
doc records the reasoning and the findings so far.

## Sources of truth

| What | Where | Notes |
|------|-------|-------|
| Actual build (configuration + parts) | `data/build.json` | Edited in the simulator's Parts tab, exported and committed |
| Suggested materials | `data/catalog.json` | From the *Boat Building Shopping List Comparison* sheet (2026-09-29), plus rule-driven additions (foam fill, fittings, floating rope). **Suggestions, not commitments.** |
| Rules | `data/rules.json` | From the [official page](https://whitewater.org/race/build-your-own-boat-competition/) via search excerpts; that site is blocked from the dev environment. **Check them against the official page.** |
| Geometry and physics | `scripts/raft-model.js` | Shared by the simulator, the report and the tests |
| Original render | `raft-render.html` | 4-drum lightweight raft that the frame geometry comes from |

## Event

- **Sat Oct 10, 2026**, competition 12–4 PM, Class II–IV channel, U.S.
  National Whitewater Center.
- Teams of 1–4, 16+, $60. Scored on **style and performance**.
- The venue provides paddles, PFDs and helmets.

## Rules and how the design meets them

| Rule | Approach |
|------|----------|
| < 150 lb | Weight is computed from the parts list. Weigh parts and tick "measured" |
| ≤ 10 × 10 × 5 ft | Checked from the geometry, including the bow and mast |
| Walls < 2 ft | Checked: bow guard and noodle rail are ~8" |
| No metal | Name and material scan of the parts list |
| All materials float, even broken | Foam-fill every PVC pipe and fitting (filled 1-1/2" pipe averages SG ~0.4). Flags nylon paracord, canvas and cushions for a bucket test |
| Wood ≤ 1/4" | Checked from `thickness_in`; the 1" dowel mast was replaced by a PVC offcut |
| Rope/straps ≤ 18" | Checked from `max_piece_length_in`. Drums are held by **daisy-chained 17" zip ties**; **confirm with the organizers** |
| Zip ties trimmed flush | Flush-cut snips on the list |

## Team progress

### 2026-10-01: dry-fit mockup and pipe run

![Dry-fit mockup with precut pipe and DWV fittings at Home Depot](photos/2026-10-01-mockup-and-fittings.jpg)
![Five 10 ft sticks of 1-1/2" PVC in the truck](photos/2026-10-01-pipe-haul.jpg)

- The team laid out the frame on the store floor with **precut pieces and
  1-1/2" DWV fittings** to check the shape. Then they bought **five full
  10 ft sticks** to cut to fit the drums.
- That makes the frame **fitted**, not lashed: rails and beams sit in one plane
  and join at fittings. The simulator models this as **Frame joinery →
  Fitted**:
  - **Double sanitary tees** (4-way) where inner rails cross beams.
  - **Sanitary tees** (3-way) on the edges.
  - **Elbows** at the corners and the bow.
  - The frame sits on top of the drums.
  - Cut lengths are center-to-center minus the **fitting take-off** at each
    end. Measure it on a dry-fit tee before cutting; the default is 1.25".
- Shelf prices (Home Depot):

  | Fitting | Price |
  |---------|-------|
  | 1-1/2" DWV double sani tee | **$7.23** |
  | Cleanout tee with plug | **$9.85** |
  | Wye | **$6.96** |

- **Stick count:** the fitted 2-drum frame with bow and mast needs **6
  sticks**, so the list is 1 short. It fits in 5 if the bow frame is left
  off. Use the "Catamaran: fits 5 sticks" profile, or buy one more stick.
  "Fit frame length to drums" shortens the rails to the drum length, which
  also saves pipe.

### Purchases so far

Recorded in `data/build.json` (`receipts` and parts marked `bought`). Only
item names, quantities and prices are kept: no store addresses, store
numbers, card details or other personal information.

| Item | Qty | Each | Total |
|------|-----|------|-------|
| 1-1/2" × 10 ft PVC Sch 40 DWV pipe (plain end) | 5 | $11.96 | $59.80 |
| 1-1/2" DWV double sani tee (4-way) | 3 | $7.23 | $21.69 |
| 1-1/2" DWV sani tee (3-way) | 4 | $3.76 | $15.04 |
| 1-1/2" DWV 90° elbow | 16 | $1.09 | $17.44 |
| 1-1/2" DWV 45° elbow | 5 | $2.56 | $12.80 |
| 1-1/2" DWV coupling | 4 | $1.36 | $5.44 |
| 1-1/2" PVC DWV hub cap | 4 | $2.09 | $8.36 |
| 36 in. heavy-duty cable tie, black (packs) | 4 | $16.36 | $65.44 |
| **Home Depot total (incl. $17.00 tax)** | | | **$223.01** |
| Zernmiarder 1-1/2" furniture-grade 4-way side-outlet tee, 12-pack (Amazon) | 2 | ? | ? |

What this tells the model:
- **Pipe was $11.96 a stick, not the sheet's ~$35–39.** The frame costs far
  less than planned.
- **3 double sani tees + 5 sticks** fit a frame with **one rail centered on
  each drum plus a center spine, and 5 cross beams**. That's now the build in
  `data/build.json` (Frame joinery: Fitted · Rails per drum line: 1 · Center
  spine on). It also matches the spine in the mockup photo. **Confirm the
  real layout.**
  - The cut list fits in the 5 sticks with **~21" to spare** in total, so
    measure twice. The "Spine frame, 4 beams" profile leaves more margin.
- **Side-outlet tees** count as 3-way tees. Their extra outlet is a ready
  socket for the mast, a bow riser or deck posts; cap the unused ones.
  Fittings on hand cover the layout with spares.
- **36" cable ties** are over the 18" securing-material limit as bought.
  **Ask the organizers** whether a long tie trimmed flush is judged by its
  installed length. The pack count is assumed to be 10; check the bag.
- **Weight** is reported two ways: the **predicted finished boat (~106 lb)**
  and what's **bought so far (~34 lb on the boat, plus ~9 lb of spare
  fittings and offcuts)**. Only the pipe and fittings the layout uses count
  toward the boat.
- **More shopping is planned.** The simulator's **Check → Next shopping
  trip** (and the report) lists what the layout still needs after what's
  marked bought. It covers:
  - priority (needed / spare / optional), estimated cost and where to buy;
  - a spare stick when the cut list is tight;
  - floating swaps for materials that sink (paracord → polypropylene rope);
  - rule-safe ties of 18" or less.

  Mark items `bought` as you shop and the list shrinks.

## Shared frame concept (from the render)

- 1-1/2" Sch 40 PVC (foam-filled). Two rails per pontoon line, 6" either
  side of the drum centerline, resting on the drums.
- Cross beams on top of the rails, X-tied at every crossing.
- Deck: 2 × 1" XPS core with Coroplast skins (72" × 24" × 2.3" by default).
- Bow: elbow up (12" riser), 18" strut, foam-filled bow bar, curved Coroplast
  guard.
- Pirate dress: Jolly Roger on a short PVC mast (the boat must stay under
  5 ft tall), red pennants, skull art.

## Findings so far

Run with the current parts list: 84" × 72" frame, 2 crew at 175 lb.

| Layout | lb | Load | Draft | GM roll | GM pitch | Crew at bow | Survives leak |
|--------|----|------|-------|---------|----------|-------------|---------------|
| Catamaran: 2 drums | 111 | 47% | 11.0" | 46" | **−14"** | dives | ✕ |
| Trimaran: 3 side by side | 131 | 32% | 8.3" | 41" | **−10"** | dives | ✕ |
| **Triangle: bow + 2 stern** | 131 | 32% | 11.5" | 39" | 49" | −1.3" | ✕ |
| Pontoon: 4 (2 per side) | **151** | 25% | 6.9" | 94" | 58" | 7.0" | ✓ |
| Wide raft: 4 across | **151** | 25% | 7.0" | 122" | −7" | dives | ✓ |

1. **The 2-drum catamaran is unstable fore and aft** (negative pitch GM). Each
   side floats on a single 34.5" drum, but the crew sits ~37" above the drum
   bottoms on an 84" frame. It will see-saw until a frame end hits the water,
   and it nose-dives if the crew shifts forward. The side-to-side GM is fine.
   - Mitigations: spread the drums fore and aft, shorten the frame, or seat
     the crew lower.
2. **The 3-drum triangle is the most balanced option under the weight
   limit.** It's stable both ways at 131 lb. With the drums centered it trims
   4.6° bow-down because one drum sits forward against two aft. Setting
   **"Drums fore/aft" to +7"** levels it and gives an 8.1" draft.
3. **The 4-drum pontoon is the best performer, but it's 151 lb with today's
   list.** Dropping the cushions and some decor, or shortening the frame,
   gets it under 150. The simulator lists candidate cuts when you're over.
4. **Crew size on 2 drums:** 1 person draws 7.8" (29% load), 2 draw 11.0"
   (47%), 3 draw 14.1" (64%), 4 draw 17.6" (82%, flagged).
5. **No 2- or 3-drum layout survives losing a drum** at this weight. Seal and
   test the bung caps. The foam-filled frame and XPS deck still float a
   wreck.

**Model limits:** these are static hydrostatics. GM uses small-angle
waterplane theory, and drums are 22.5" × 34.5" cylinders (external volume).
Real behavior in rapids depends on speed, waves and crew movement. Use the
numbers to compare layouts, not as guarantees. A pool or lake float test
before race day is the real check.

## Open items

1. Organizers: are daisy-chained zip-tie drum bands OK under the 18" rule?
2. Choose a layout (2, 3 or 4 drums) and crew size.
3. Turn `data/build.json` into the real shopping list. Check the prices
   marked `estimate`.
4. Weigh parts as they arrive; float-test the finished boat.
5. Bucket-test the flag fabric, the cushions and the paracord, or swap them
   for floating alternatives.
