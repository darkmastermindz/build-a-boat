/**
 * raft-model.js — shared geometry, physics, rules and recommendations for
 * the drum raft. Used by raft-simulation.html (browser), the report
 * generator and the tests (Node). No dependencies.
 *
 * Units: inches and pounds. +x = bow, +y = up, +z = starboard.
 * y = 0 is the bottom of the drums.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RaftModel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WATER = 62.4 / 1728;          // lb per in³ (fresh water)
  const DRUM = { dia: 22.5, len: 34.5, emptyWeight: 20 };
  // Typical plastic (HDPE) drums. Sizes vary by maker: measure yours and use Custom.
  // Metal drums are not allowed by the rules, so none are listed.
  const DRUM_SIZES = [
    { id: 'hdpe-55-tight', label: '55 gal plastic, tight-head (bung caps)', gallons: 55, dia: 22.5, len: 34.5, weight: 20 },
    { id: 'hdpe-55-open', label: '55 gal plastic, open-head (lid + ring)', gallons: 55, dia: 23.0, len: 36.0, weight: 22 },
    { id: 'hdpe-30-tight', label: '30 gal plastic, tight-head', gallons: 30, dia: 18.25, len: 29.75, weight: 12 },
    { id: 'hdpe-15-tight', label: '15 gal plastic, tight-head', gallons: 15, dia: 14.25, len: 23.5, weight: 7 },
  ];
  function specFrom(d, fallback) {
    d = d || {};
    const base = DRUM_SIZES.find(x => x.id === d.size) || fallback || DRUM_SIZES[0];
    const num = (v, def) => (isFinite(+v) && +v > 0 ? +v : def);
    return {
      size: d.size || base.size || base.id, label: d.size === 'custom' ? 'Custom drum' : (base.label || 'Drum'),
      gallons: num(d.gallons, base.gallons), dia: num(d.dia, base.dia), len: num(d.len, base.len), weight: num(d.weight, base.weight),
      weightMeasured: !!d.weightMeasured,
    };
  }
  // drumSpec(c) is the default drum; drumSpec(c, i) is drum i, using
  // config.drumSpecs[i] when set (per-drum measurements) or the default.
  function drumSpec(c, i) {
    const def = specFrom(c && c.drum);
    if (i == null) return def;
    const o = c && Array.isArray(c.drumSpecs) ? c.drumSpecs[i] : null;
    return o ? Object.assign(specFrom(o, def), { own: true }) : Object.assign({}, def, { own: false });
  }
  const sameSpec = (a, b) => a.dia === b.dia && a.len === b.len && a.weight === b.weight;
  const PIPE_R = 0.95;                // 1-1/2" Sch 40 OD 1.9"
  const NOODLE_D = 2.5, NOODLE_L = 52; // pool noodle diameter and length
  const PIPE_ID_AREA = Math.PI * (1.61 / 2) ** 2;
  const RAIL_OFFSET = 6;              // rails sit 6" either side of a pontoon line
  const STOCK = 120;                  // 10 ft pipe sticks
  const SHEET = { w: 48, l: 96 };
  const FOAM_IN3_PER_CAN = 600;       // conservative 12 oz expanding-foam yield
  const SEATED_CG = 10;               // crew CG above deck top
  const SLICES = 12;

  // Each preset: where the drums go, plus the qualitative tradeoffs the
  // numbers can't show (handling, build effort). Numbers come from analyze().
  const PRESETS = {
    cat2: {
      label: 'Catamaran: 2 drums', drums: 2,
      blurb: 'One drum per side. The lightest and simplest boat to build.',
      strengths: ['Lightest and cheapest; the fewest lashings', 'Turns easily: short waterline, nothing in the middle'],
      weaknesses: ['No backup: losing a drum swamps that side', 'Rocks fore and aft over a long frame, so seat the crew low and centered'],
      layout: c => [-1, 1].map(s => ({ x: c.drumOffset, z: s * c.pontoonSpacing / 2 })),
    },
    stagger2: {
      label: 'Staggered catamaran: 2 drums offset', drums: 2,
      blurb: 'Two drums side by side but shifted fore and aft, like the team\'s box-frame sketch.',
      strengths: ['Spreads the lift fore and aft, so it rocks less than a straight catamaran', 'Same 2 drums and weight class as the catamaran'],
      weaknesses: ['Lopsided: trims and turns a little differently each way', 'Still no backup if a drum leaks'],
      layout: c => [-1, 1].map(s => ({ x: c.drumOffset + s * c.drumSpread / 2, z: s * c.pontoonSpacing / 2 })),
    },
    tandem2: {
      label: 'Tandem: 2 drums crosswise', drums: 2,
      blurb: 'Two drums laid across the boat, one at the bow and one at the stern. Same weight as the catamaran, turned 90°.',
      strengths: ['Rides over waves bow-first: a drum lifts each end', 'Same weight and drum count as the catamaran'],
      weaknesses: ['Tippy side to side: only ~3 ft of drum across the beam', 'Drums push water broadside, so it is slow to paddle', 'Crosswise lashing is harder to keep tight'],
      layout: c => [-1, 1].map(s => ({ x: c.drumOffset + s * Math.max(c.drumSpread + 8, drumSpec(c).dia / 2 + 12), z: 0, axis: 'z' })),
      lines: c => { const h = Math.max(4, drumSpec(c).len / 2 - 4); return [-h, h]; },   // rails rest on the drums, just inside their ends
    },
    tri3inline: {
      label: 'Trimaran: 3 drums side by side', drums: 3,
      blurb: 'A center drum between the two side drums.',
      strengths: ['About 50% more lift than the catamaran', 'Survives losing one side drum in most cases'],
      weaknesses: ['Still rocks fore and aft like the catamaran', 'Center drum adds drag and ~20 lb'],
      layout: c => [-1, 0, 1].map(s => ({ x: c.drumOffset, z: s * c.pontoonSpacing / 2 })),
    },
    tri3bow: {
      label: 'Triangle: 1 bow + 2 stern drums', drums: 3,
      blurb: 'One drum up front on the centerline, two at the stern.',
      strengths: ['Stable both ways, at ~20 lb under the pontoon', 'Bow drum lifts the nose into waves'],
      weaknesses: ['Bow-down unless crew sit aft or drums shift forward', 'One bow drum carries the whole front: a leak there is serious'],
      layout: c => [
        { x: c.drumOffset + c.drumSpread, z: 0 },
        { x: c.drumOffset - c.drumSpread, z: -c.pontoonSpacing / 2 },
        { x: c.drumOffset - c.drumSpread, z: c.pontoonSpacing / 2 },
      ],
    },
    tri3stern: {
      label: 'Reverse triangle: 2 bow + 1 stern drum', drums: 3,
      blurb: 'Two drums up front, one at the stern on the centerline.',
      strengths: ['Most lift where crew lean in rapids, at the bow', 'Wide bow resists nose-diving and rolling as you enter drops'],
      weaknesses: ['Stern-heavy crews squat the single stern drum', 'Wide, flat bow pushes more water'],
      layout: c => [
        { x: c.drumOffset + c.drumSpread, z: -c.pontoonSpacing / 2 },
        { x: c.drumOffset + c.drumSpread, z: c.pontoonSpacing / 2 },
        { x: c.drumOffset - c.drumSpread, z: 0 },
      ],
    },
    tri3pack: {
      label: 'Packed triangle: 1 bow drum + 2 side by side', drums: 3,
      blurb: 'The team\'s current design: two drums side by side at the stern, boxes sharing a middle wall, and one drum in front of them on the centerline, its box butted against their crossbar.',
      strengths: ['Compact (about 4 ft wide); the boxes share a wall and a crossbar, so it takes less pipe than 3 separate boxes', 'Lift at the bow and the stern, so it rides over waves instead of see-sawing'],
      weaknesses: ['Narrow: with 2 adults it can tip sideways. Open the "Pair gap" to widen it, at the cost of more pipe', 'Three drums plus boxes runs close to the 150 lb limit', 'Shared corners need 4-way side-outlet fittings'],
      layout: c => {
        // boxes meet at x = drumOffset: each drum sits its own half-length plus the end clearance away,
        // and the side-by-side pair sits its own radius plus the side clearance off the centerline
        // with chord-fit sides (negative side gap) the drums still keep 1" apart: their sides bulge past the box
        const eg = c.boxEndGap ?? 2, sg = Math.max(0.5, c.boxSideGap ?? 1), gap = Math.min(14, Math.max(0, c.packGap || 0)) / 2;
        const [b, p, s] = [0, 1, 2].map(i => drumSpec(c, i));
        return [{ x: c.drumOffset + b.len / 2 + eg, z: 0 }, { x: c.drumOffset - p.len / 2 - eg, z: -(p.dia / 2 + sg + gap) }, { x: c.drumOffset - s.len / 2 - eg, z: s.dia / 2 + sg + gap }];
      },
    },
    quad4pontoon: {
      label: 'Pontoon: 4 drums (2 per side)', drums: 4,
      blurb: 'Two drums end to end on each side (the original render).',
      strengths: ['Most stable both ways; survives any single leak', 'Long hulls track straight and ride low'],
      weaknesses: ['Heaviest (~40 lb over the catamaran) and close to the 150 lb limit', 'Long waterline turns slowly', 'Twice the lashing'],
      layout: c => {
        const hx = drumSpec(c).len / 2 + (c.retention === 'cage' ? 2 : 0.5);   // caged drums need room for the shared end posts
        const out = [];
        [-1, 1].forEach(s => [-hx, hx].forEach(x => out.push({ x: c.drumOffset + x, z: s * c.pontoonSpacing / 2 })));
        return out;
      },
    },
    diamond4: {
      label: 'Diamond: bow, stern, port, starboard', drums: 4,
      blurb: 'One drum at each point of a diamond: bow and stern on the centerline, port and starboard at mid-length.',
      strengths: ['Stable both ways with 4 drums spread over a short frame', 'Survives any single leak', 'Pivots well: drums are near the middle'],
      weaknesses: ['Heaviest class, like the pontoon', 'Bow and stern drums need their own cross beams'],
      layout: c => {
        const ax = Math.max(c.drumSpread + 10, drumSpec(c).len / 2 + 8);
        return [
          { x: c.drumOffset + ax, z: 0 }, { x: c.drumOffset - ax, z: 0 },
          { x: c.drumOffset, z: -c.pontoonSpacing / 2 }, { x: c.drumOffset, z: c.pontoonSpacing / 2 },
        ];
      },
    },
    quad4wide: {
      label: 'Wide raft: 4 drums across', drums: 4,
      blurb: 'Four drums side by side across a wide frame.',
      strengths: ['Hardest to tip sideways', 'Survives any single leak'],
      weaknesses: ['Still rocks fore and aft: every drum is short', 'Widest and draggiest; needs longer beams'],
      layout: c => {
        const step = Math.max(c.pontoonSpacing / 3, drumSpec(c).dia + 1);
        return [-1.5, -0.5, 0.5, 1.5].map(k => ({ x: c.drumOffset, z: k * step }));
      },
    },
  };

  const DEFAULT_CONFIG = {
    preset: 'cat2', frameStyle: 'stacked', retention: 'bands', cageStyle: 'cradle', sidePanels: false, sideStyle: 'hull', hullBow: 18, platform: false, platformSpacing: 16, bowNoodle: false, packGap: 0, boxEndGap: 2, boxSideGap: 1, boxTopGap: 0, fittingTakeoff: 1.25, railsPerPontoon: 2, centerSpine: false, frameLength: 84, frameWidth: 72, beamCount: 4, pontoonSpacing: 47,
    drumOffset: 0, drumSpread: 20, bow: true, bowRiser: 12, bowStrut: 18,
    deck: { length: 72, width: 24, thickness: 2.3 }, mastHeight: 30, noodleRail: true,
    crew: { count: 2, weightEach: 175, xOffset: 0, zOffset: 0 }, failedDrum: null,
  };

  const clone = o => JSON.parse(JSON.stringify(o));
  function withDefaults(cfg) {
    const c = Object.assign(clone(DEFAULT_CONFIG), clone(cfg || {}));
    c.deck = Object.assign(clone(DEFAULT_CONFIG.deck), (cfg && cfg.deck) || {});
    c.crew = Object.assign(clone(DEFAULT_CONFIG.crew), (cfg && cfg.crew) || {});
    if (!PRESETS[c.preset] && !Array.isArray(c.drums)) c.preset = 'cat2';
    return c;
  }

  // ── Circle-segment helpers (horizontal drum cross-section) ──
  function segArea(h, r = DRUM.dia / 2) {
    h = Math.min(Math.max(h, 0), 2 * r);
    const a = r - h;
    return r * r * Math.acos(a / r) - a * Math.sqrt(Math.max(0, 2 * r * h - h * h));
  }
  function segCentroidY(h, r) { // height of segment centroid above drum bottom
    h = Math.min(Math.max(h, 0), 2 * r);
    const A = segArea(h, r);
    if (A < 1e-9) return 0;
    return r - (2 * Math.pow(Math.max(0, 2 * r * h - h * h), 1.5)) / (3 * A);
  }
  function segWidth(h, r) {
    if (h <= 0 || h >= 2 * r) return 0;
    return 2 * Math.sqrt(2 * r * h - h * h);
  }
  const drumMaxLb = (spec = DRUM) => Math.PI * (spec.dia / 2) ** 2 * spec.len * WATER;

  // ── Geometry ──
  function geometry(cfgIn) {
    const c = withDefaults(cfgIn);
    const raw = Array.isArray(c.drums) ? c.drums : PRESETS[c.preset].layout(c);
    const drum = drumSpec(c);
    const drums = raw.map((d, i) => { const sp = drumSpec(c, i); return { id: i, x: d.x, z: d.z, axis: d.axis === 'z' ? 'z' : 'x', failed: c.failedDrum === i, spec: sp, r: sp.dia / 2, len: sp.len }; });
    // half-extents in plan: a lengthwise drum runs along x, a crosswise one along z
    drums.forEach(d => { d.ex = d.axis === 'x' ? d.len / 2 : d.r; d.ez = d.axis === 'x' ? d.r : d.len / 2; });
    // Drums are lashed up snug to the frame, so their tops line up; a smaller
    // drum's bottom sits higher (y0) than the largest drum's (y = 0).
    const r = Math.max(...drums.map(d => d.r));
    drums.forEach(d => { d.y0 = 2 * (r - d.r); });
    const mixed = drums.some(d => !sameSpec(d.spec, drums[0].spec));
    const presetLines = !Array.isArray(c.drums) && PRESETS[c.preset] && PRESETS[c.preset].lines;
    const crosswise = drums.some(d => d.axis === 'z');
    const lines = presetLines ? presetLines(c) : [...new Set(drums.map(d => +d.z.toFixed(2)))].sort((a, b) => a - b);
    if (c.frameStyle === 'boxes') return boxGeometry(c, drum, drums, r, mixed);
    // stacked: rails rest on the drums, beams lashed on top (the render).
    // fitted: rails and beams in one plane joined by tees/crosses, sitting on the drum tops.
    const fitted = c.frameStyle === 'fitted';
    const off = c.railsPerPontoon === 1 ? 0 : Math.min(RAIL_OFFSET, r * 0.8);
    // rails across crosswise drums sit on the drum tops
    const railY = fitted || crosswise ? 2 * r + PIPE_R : r + Math.sqrt(r * r - off * off) + PIPE_R;
    const beamY = fitted ? railY : railY + 2 * PIPE_R;
    const deckBottom = beamY + PIPE_R;
    const deckTop = deckBottom + c.deck.thickness;
    const L = c.frameLength;
    const rails = [];
    lines.forEach(z => (off ? [-1, 1] : [0]).forEach(s => rails.push({ z: z + s * off, x0: -L / 2, x1: L / 2 })));
    if (c.centerSpine && !rails.some(rl => Math.abs(rl.z) < PIPE_R * 2)) rails.push({ z: 0, x0: -L / 2, x1: L / 2, spine: true });
    rails.sort((a, b) => a.z - b.z);
    const n = Math.max(2, Math.round(c.beamCount));
    const inset = fitted ? 0 : Math.min(6, L / 4);
    const beams = Array.from({ length: n }, (_, i) => -L / 2 + inset + i * (L - 2 * inset) / (n - 1));
    const outerZ = Math.max(...rails.map(rl => Math.abs(rl.z)));
    const W = fitted ? 2 * outerZ : c.frameWidth;
    // Caged retention: a second PVC frame under each drum (a cradle of two
    // rails and two end ties) joined to the deck frame by posts at the drum
    // ends, so the drum is trapped instead of strapped. Lengthwise drums only.
    const cage = c.retention === 'cage' && drums.length > 0 && drums.every(d => d.axis === 'x');
    const cagePieces = [];
    if (cage) {
      drums.forEach(d => {
        // cradle: two lower rails either side of the drum line; single: one rail straight under it
        const co = c.cageStyle === 'single' ? 0 : off > 0 ? off : Math.min(6, d.r * 0.55);
        const th = Math.asin(Math.min(0.95, co / (d.r + PIPE_R)));
        const cy = d.y0 + d.r - (d.r + PIPE_R) * Math.cos(th);              // cradle rails touch the drum's underside
        // cage ends sit just past the drum; when a cross beam is within 8" outward, extend the
        // cage to it so the post meets the deck frame at an existing joint (no tiny pipe stubs)
        const snapOut = (x, dir) => { const c2 = beams.filter(bx => (dir < 0 ? bx <= x : bx >= x) && Math.abs(bx - x) <= 8); return c2.length ? c2.reduce((m, bx) => Math.abs(bx - x) < Math.abs(m - x) ? bx : m) : x; };
        const xa = snapOut(d.x - d.len / 2 - 2, -1), xb = snapOut(d.x + d.len / 2 + 2, 1);
        (co > 0 ? [-1, 1] : [0]).forEach(sg => cagePieces.push({ kind: 'cradle', drum: d.id, a: [xa, cy, d.z + sg * co], b: [xb, cy, d.z + sg * co] }));
        if (co > 0) [xa, xb].forEach(x => cagePieces.push({ kind: 'tie', drum: d.id, a: [x, cy, d.z - co], b: [x, cy, d.z + co] }));
        const postZ = co > 0 && off > 0 ? [d.z - off, d.z + off] : [d.z];
        [xa, xb].forEach(x => postZ.forEach(z => cagePieces.push({ kind: 'post', drum: d.id, a: [x, cy, z], b: [x, railY, z] })));
      });
      // end-to-end drums share their end ties and posts
      const key = pt => pt.map(v => v.toFixed(1)).join(',');
      const seen = new Set();
      for (let i = cagePieces.length - 1; i >= 0; i--) {
        const pc = cagePieces[i];
        if (pc.kind === 'cradle') continue;
        const k2 = pc.kind + ':' + [key(pc.a), key(pc.b)].sort().join('|');
        if (seen.has(k2)) cagePieces.splice(i, 1); else seen.add(k2);
      }
      // a post landing mid-tie splits the tie into two pieces
      const posts = cagePieces.filter(pc => pc.kind === 'post');
      for (let i = cagePieces.length - 1; i >= 0; i--) {
        const pc = cagePieces[i];
        if (pc.kind !== 'tie') continue;
        const mid = posts.find(po => Math.abs(po.a[0] - pc.a[0]) < 0.1 && po.a[2] > Math.min(pc.a[2], pc.b[2]) + 0.1 && po.a[2] < Math.max(pc.a[2], pc.b[2]) - 0.1);
        if (mid) cagePieces.splice(i, 1, { kind: 'tie', drum: pc.drum, a: pc.a, b: mid.a.slice() }, { kind: 'tie', drum: pc.drum, a: mid.a.slice(), b: pc.b });
      }
      cagePieces.forEach(pc => { pc.len = Math.hypot(pc.b[0] - pc.a[0], pc.b[1] - pc.a[1], pc.b[2] - pc.a[2]); });
    }
    const lowestY = cage ? Math.min(...cagePieces.map(pc => Math.min(pc.a[1], pc.b[1]))) - PIPE_R : 0;
    const bow = c.bow ? {
      x0: L / 2, x1: L / 2 + c.bowStrut, topY: railY + c.bowRiser, z: outerZ,
    } : null;
    const xs = [-L / 2, L / 2 + (bow ? c.bowStrut + PIPE_R : 0)];
    drums.forEach(d => { xs.push(d.x - d.ex, d.x + d.ex); });
    const zs = [-W / 2, W / 2];
    drums.forEach(d => zs.push(d.z - d.ez, d.z + d.ez));
    const mastTop = c.mastHeight > 0 ? deckTop + c.mastHeight : deckTop;
    const wallTop = Math.max(bow ? bow.topY + PIPE_R : 0, c.noodleRail ? deckTop + 2.5 : 0);
    const overall = {
      length: Math.max(...xs) - Math.min(...xs),
      width: Math.max(...zs) - Math.min(...zs),
      height: Math.max(mastTop, wallTop),
    };
    const overlaps = [];
    for (let i = 0; i < drums.length; i++) for (let j = i + 1; j < drums.length; j++) {
      const a = drums[i], b = drums[j];
      if (Math.abs(a.z - b.z) < a.ez + b.ez && Math.abs(a.x - b.x) < a.ex + b.ex) overlaps.push([i, j]);
    }
    return {
      config: c, drum, r, mixed, fitted, frameWidth: W, railOffset: off, cage, cagePieces, lowestY,
      cageUnsupported: c.retention === 'cage' && !cage, drums, lines, rails, beams, railY, beamY, deckBottom, deckTop, bow, outerZ,
      mastTop, wallHeight: Math.max(0, wallTop - deckTop), overall, overlaps,
      beamsTooShort: !fitted && outerZ + PIPE_R > W / 2,
      drumsOffFrame: drums.some(d => d.x - d.ex < -L / 2 - 1 || d.x + d.ex > L / 2 + 1),
    };
  }

  // ── Box frames: every drum sits inside its own box of pipe ──
  // A box is a top and a bottom rectangle joined by four corner posts. Boxes
  // are joined to their nearest neighbours by short links (top, and bottom
  // when the bottoms line up), and the deck sits on the box tops. There is no
  // separate deck frame, and the drums are trapped without straps.
  function boxGeometry(c, drum, drums, r, mixed) {
    // Side fit: a positive boxSideGap leaves clearance beside the drum. A
    // negative one pulls the side rails inside the drum's diameter, so each
    // box side is a chord of the drum's circle: the four rails press on the
    // drum (end view: a rectangle inscribed in the circle) and it can't roll.
    const eg = Math.max(0.5, c.boxEndGap ?? 2), sgRaw = c.boxSideGap ?? 1;
    const boxes = drums.map(d => {
      const sg = d.axis === 'x' ? Math.max(-0.75 * d.r, sgRaw) : Math.max(0.5, sgRaw), hw = d.ez + sg, rr = d.r + PIPE_R, cy = d.y0 + d.r;
      const chord = d.axis === 'x' && hw < rr, v = chord ? Math.sqrt(rr * rr - hw * hw) : rr;
      return { id: d.id, x0: d.x - d.ex - eg, x1: d.x + d.ex + eg, z0: d.z - hw, z1: d.z + hw, yb: cy - v, yt: cy + v, chord, attach: [] };
    });
    // join boxes with a minimum spanning tree on centre distance
    const ctr = b => [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2];
    const dist = (a, b) => Math.hypot(ctr(a)[0] - ctr(b)[0], ctr(a)[1] - ctr(b)[1]);
    const inTree = new Set([0]), edges = [];
    while (boxes.length && inTree.size < boxes.length) {
      let best = null;
      inTree.forEach(i => boxes.forEach((b, j) => { if (!inTree.has(j) && (!best || dist(boxes[i], b) < best.d)) best = { i, j, d: dist(boxes[i], b) }; }));
      edges.push([best.i, best.j]); inTree.add(best.j);
    }
    const links = [], contacts = [];
    edges.forEach(([i, j]) => {
      const A = boxes[i], B = boxes[j];
      const ox = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0), oz = Math.min(A.z1, B.z1) - Math.max(A.z0, B.z0);
      const levels = Math.abs(A.yb - B.yb) < 0.5 ? ['top', 'bottom'] : ['top'];
      if (oz >= 8 && ox < 8) {                           // one in front of the other
        const [F, Bk] = A.x0 > B.x0 ? [A, B] : [B, A];   // F is the front box
        if (F.x0 - Bk.x1 < 4) { const m = (F.x0 + Bk.x1) / 2; F.x0 = m; Bk.x1 = m; return; }   // close: share one end
        const lo = Math.max(A.z0, B.z0), hi = Math.min(A.z1, B.z1);
        const zs = hi - lo < 24 ? [(lo + hi) / 2] : [lo + 8, hi - 8];   // keep links clear of the corner fittings
        zs.forEach(z => links.push({ dir: 'x', z, xa: Bk.x1, xb: F.x0, from: Bk, to: F, levels }));
      } else if (ox >= 8) {                              // side by side
        const [P, S] = A.z0 < B.z0 ? [A, B] : [B, A];   // P is the port-side box
        if (S.z0 - P.z1 < 6) { const m = (S.z0 + P.z1) / 2; S.z0 = m; P.z1 = m; return; }   // close: share one wall
        const lo = Math.max(A.x0, B.x0), hi = Math.min(A.x1, B.x1);
        const xs = hi - lo < 24 ? [(lo + hi) / 2] : [lo + 8, hi - 8];
        xs.forEach(x => links.push({ dir: 'z', x, za: P.z1, zb: S.z0, from: P, to: S, levels }));
      } else {                                           // diagonal neighbours: corner to corner
        const [F, Bk] = ctr(A)[0] > ctr(B)[0] ? [A, B] : [B, A];
        if (ox < 8 && F.x0 - Bk.x1 < 6) {                // nearly touching: meet at one line and tie the corners together
          const m = F.met ? F.x0 : Bk.met ? Bk.x1 : (F.x0 + Bk.x1) / 2; F.x0 = m; Bk.x1 = m; F.met = Bk.met = true;
          if (oz > 0 && oz < 4) {                        // sides overlap slightly: meet at one corner instead of leaving a stub
            const [Lo, Hi] = ctr(F)[1] < ctr(Bk)[1] ? [F, Bk] : [Bk, F], mz = (Lo.z1 + Hi.z0) / 2; Lo.z1 = mz; Hi.z0 = mz;
          }
          contacts.push([Bk.id, F.id]); return;
        }
        const pa = [ctr(B)[0] > ctr(A)[0] ? A.x1 : A.x0, ctr(B)[1] > ctr(A)[1] ? A.z1 : A.z0];
        const pb = [ctr(A)[0] > ctr(B)[0] ? B.x1 : B.x0, ctr(A)[1] > ctr(B)[1] ? B.z1 : B.z0];
        links.push({ dir: 'd', pa, pb, from: A, to: B, levels });
      }
    });
    // boxes that meet on a line with corners a few inches apart: move those
    // corners together, so no pipe stub shorter than ~4.5" is left between them
    for (let i = 0; i < boxes.length; i++) for (let j = 0; j < boxes.length; j++) {
      const A = boxes[i], B = boxes[j]; if (i === j) continue;
      if (Math.abs(A.x1 - B.x0) < 0.5) [['z0', 'z0'], ['z0', 'z1'], ['z1', 'z0'], ['z1', 'z1']].forEach(([ka, kb]) => { const d2 = Math.abs(A[ka] - B[kb]); if (d2 > 1e-6 && d2 < 4.5) { const m = (A[ka] + B[kb]) / 2; A[ka] = m; B[kb] = m; } });
      if (Math.abs(A.z1 - B.z0) < 0.5) [['x0', 'x0'], ['x0', 'x1'], ['x1', 'x0'], ['x1', 'x1']].forEach(([ka, kb]) => { const d2 = Math.abs(A[ka] - B[kb]); if (d2 > 1e-6 && d2 < 4.5) { const m = (A[ka] + B[kb]) / 2; A[ka] = m; B[kb] = m; } });
    }
    // chord fit: set each box's rail heights from its tighter side, so the rails touch the drum
    boxes.forEach(b => { const d = drums.find(x => x.id === b.id); if (!b.chord || !d) return;
      const hw = Math.min(d.z - b.z0, b.z1 - d.z), rr = d.r + PIPE_R, v = hw < rr ? Math.sqrt(rr * rr - hw * hw) : rr, cy = d.y0 + d.r; b.yb = cy - v; b.yt = cy + v; });
    // boxes that touch share rail heights (the loosest of the group), so shared corners line up
    const near2 = (a, b) => [a.x0, a.x1].some(x => [b.x0, b.x1].some(x2 => Math.abs(x - x2) < 0.5)) && [a.z0, a.z1].some(z => [b.z0, b.z1].some(z2 => Math.abs(z - z2) < 0.5));
    const grp = boxes.map((_, i) => i), root = i => grp[i] === i ? i : (grp[i] = root(grp[i]));
    boxes.forEach((a, i) => boxes.forEach((b, j) => { if (i < j && near2(a, b)) grp[root(i)] = root(j); }));
    boxes.forEach((b, i) => { const g2 = boxes.filter((_, j) => root(j) === root(i)); b.yt = Math.max(...g2.map(x => x.yt)); b.yb = Math.min(...g2.map(x => x.yb)); });
    const topY = Math.max(...boxes.map(b => b.yt)) + (boxes.some(b => b.chord) ? 0 : Math.max(0, c.boxTopGap || 0));
    if (!boxes.some(b => b.chord)) boxes.forEach(b => { b.yt = topY; });
    // PVC platform on the box tops for the foam deck to sit on: a rectangle the
    // size of the deck with cross members, resting on the top rails
    const platY = c.platform ? topY + 2 * PIPE_R : null;
    const deckBottom = (c.platform ? platY : topY) + PIPE_R, deckTop = deckBottom + c.deck.thickness;
    const pieces = [];
    const add = (kind, a, b, id) => pieces.push({ kind, drum: id, a, b });
    // links, and where they land on each box's top/bottom edges
    links.forEach(l => l.levels.forEach(level => {
      const ya = level === 'top' ? l.from.yt : l.from.yb, yb2 = level === 'top' ? l.to.yt : l.to.yb;
      if (l.dir === 'x') { add('link', [l.from.x1, ya, l.z], [l.to.x0, yb2, l.z], l.from.id); l.from.attach.push({ level, edge: 'x1', t: l.z }); l.to.attach.push({ level, edge: 'x0', t: l.z }); }
      else if (l.dir === 'z') { add('link', [l.x, ya, l.from.z1], [l.x, yb2, l.to.z0], l.from.id); l.from.attach.push({ level, edge: 'z1', t: l.x }); l.to.attach.push({ level, edge: 'z0', t: l.x }); }
      else add('link', [l.pa[0], ya, l.pa[1]], [l.pb[0], yb2, l.pb[1]], l.from.id);
    }));
    // box edges, split wherever a link lands
    boxes.forEach(b => ['top', 'bottom'].forEach(level => {
      const y = level === 'top' ? b.yt : b.yb;
      const edgesOf = { z0: ['x', b.x0, b.x1, b.z0], z1: ['x', b.x0, b.x1, b.z1], x0: ['z', b.z0, b.z1, b.x0], x1: ['z', b.z0, b.z1, b.x1] };
      Object.entries(edgesOf).forEach(([name, [dir, lo, hi, fixed]]) => {
        const cuts2 = b.attach.filter(at => at.level === level && at.edge === name && at.t > lo + 0.5 && at.t < hi - 0.5).map(at => at.t);
        const pts = [lo, ...cuts2.sort((p, q) => p - q), hi];
        for (let k = 0; k < pts.length - 1; k++) {
          if (dir === 'x') add(level, [pts[k], y, fixed], [pts[k + 1], y, fixed], b.id);
          else add(level, [fixed, y, pts[k]], [fixed, y, pts[k + 1]], b.id);
        }
      });
      if (level === 'bottom') [[b.x0, b.z0], [b.x0, b.z1], [b.x1, b.z0], [b.x1, b.z1]].forEach(([x, z]) => add('post', [x, b.yb, z], [x, b.yt, z], b.id));
    }));
    let platform = null;
    if (c.platform) {
      const L = c.deck.length - 2 * PIPE_R, W = c.deck.width - 2 * PIPE_R, sp = Math.max(8, c.platformSpacing || 16), n = Math.max(1, Math.round(L / sp));
      const xs2 = Array.from({ length: n + 1 }, (_, k) => -L / 2 + k * L / n);
      [-W / 2, W / 2].forEach(z => add('platform', [-L / 2, platY, z], [L / 2, platY, z], -1));
      xs2.forEach(x => add('platform', [x, platY, -W / 2], [x, platY, W / 2], -1));
      // yellow pool noodles fill the bays between cross members, laid fore-aft
      const bayLen = L / n - 2 * PIPE_R, across = Math.max(1, Math.floor((W - 2 * PIPE_R) / NOODLE_D));
      platform = { y: platY, L, W, xs: xs2, bays: n, bayLen, across, noodleLen: n * across * bayLen };
    }
    // curved hull: the side panels wrap the boxes as one boat-shaped skin; a
    // small pipe nose (two chords top and bottom, and a post) holds the point
    // with chord-fit sides the drums bulge past their boxes, so the hull wraps the wider of the box and the drum
    const footprint = boxes.map(b => { const d = drums.find(x => x.id === b.id); return d ? Object.assign({}, b, { z0: Math.min(b.z0, d.z - d.ez - 0.5), z1: Math.max(b.z1, d.z + d.ez + 0.5) }) : b; });
    const hull = c.sidePanels && c.sideStyle !== 'boxes' ? hullShape(footprint, Math.max(0, c.hullBow ?? 18)) : null;
    if (hull && hull.tip > hull.xf + 3) {
      const bowBox = boxes.reduce((m, b) => b.x1 > m.x1 ? b : m, boxes[0]), yb = Math.min(...boxes.map(b => b.yb));
      [bowBox.yb, bowBox.yt].forEach(y => [bowBox.z0, bowBox.z1].forEach(z => add('nose', [bowBox.x1, y, z], [hull.tip, y, 0], bowBox.id)));
      add('nose', [hull.tip, bowBox.yb, 0], [hull.tip, bowBox.yt, 0], bowBox.id);
    }
    // a corner that lands partway along another box's edge splits that edge
    // (e.g. a box butted against the middle of a wider pair of boxes)
    const corners = pieces.flatMap(pc => [pc.a, pc.b]);
    for (let i = pieces.length - 1; i >= 0; i--) {
      const pc = pieces[i], d = pc.b.map((v, k) => v - pc.a[k]), L2 = d.reduce((t, v) => t + v * v, 0);
      if (L2 < 1e-6) { pieces.splice(i, 1); continue; }
      const ts = [...new Set(corners.map(pt => {
        const t = pt.reduce((s2, v, k) => s2 + (v - pc.a[k]) * d[k], 0) / L2;
        const off = Math.hypot(...pt.map((v, k) => v - (pc.a[k] + t * d[k])));
        return off < 0.1 && t * Math.sqrt(L2) > 0.5 && (1 - t) * Math.sqrt(L2) > 0.5 ? +t.toFixed(4) : null;
      }).filter(t => t != null))].sort((p, q) => p - q);
      if (!ts.length) continue;
      const pts = [pc.a, ...ts.map(t => pc.a.map((v, k) => v + t * d[k])), pc.b];
      pieces.splice(i, 1, ...pts.slice(1).map((pt, k) => ({ kind: pc.kind, drum: pc.drum, a: pts[k], b: pt })));
    }
    // boxes that share an end share those pieces
    const key = pt => pt.map(v => v.toFixed(1)).join(',');
    const seen = new Set();
    for (let i = pieces.length - 1; i >= 0; i--) {
      const k2 = [key(pieces[i].a), key(pieces[i].b)].sort().join('|');
      if (seen.has(k2)) pieces.splice(i, 1); else seen.add(k2);
    }
    pieces.forEach(pc => { pc.len = Math.hypot(pc.b[0] - pc.a[0], pc.b[1] - pc.a[1], pc.b[2] - pc.a[2]); });
    const xsAll = boxes.flatMap(b => [b.x0, b.x1]).concat(hull ? [hull.tip] : []), zsAll = boxes.flatMap(b => [b.z0, b.z1]);
    const L = 2 * Math.max(...xsAll.map(Math.abs)), outerZ = Math.max(...zsAll.map(Math.abs));
    c.frameLength = Math.round(L);                       // used for freeboard corners
    const mastTop = c.mastHeight > 0 ? deckTop + c.mastHeight : deckTop;
    const wallTop = c.noodleRail ? deckTop + 2.5 : 0;
    const overlaps = [];
    for (let i = 0; i < drums.length; i++) for (let j = i + 1; j < drums.length; j++) {
      const a = drums[i], b = drums[j];
      if (Math.abs(a.z - b.z) < a.ez + b.ez && Math.abs(a.x - b.x) < a.ex + b.ex) overlaps.push([i, j]);
    }
    return {
      platform, bowNoodle: hull && c.bowNoodle ? bowNoodleShape(hull, topY) : null,
      sidePanels: !c.sidePanels ? [] : hull ? [hullPanel(hull, Math.min(...boxes.map(b => b.yb)), topY)] : boxOutline(boxes, topY),
      hull: hull ? Object.assign(hull, { y0: Math.min(...boxes.map(b => b.yb)), y1: topY }) : null,
      config: c, drum, r, mixed, fitted: false, boxes: true, boxList: boxes, boxContacts: contacts, frameWidth: 2 * outerZ, railOffset: 0,
      cage: true, cagePieces: pieces, lowestY: Math.min(...boxes.map(b => b.yb)) - PIPE_R, cageUnsupported: false,
      drums, lines: [], rails: [], beams: [], railY: topY, beamY: topY, deckBottom, deckTop, bow: null, outerZ,
      mastTop, wallHeight: Math.max(0, wallTop - deckTop),
      overall: { length: Math.max(...xsAll) - Math.min(...xsAll), width: Math.max(...zsAll) - Math.min(...zsAll), height: Math.max(mastTop, wallTop) },
      overlaps, beamsTooShort: false, drumsOffFrame: false,
    };
  }

  // Side panels: every outer face of the boxes (faces two boxes share stay
  // open), from the bottom rail to the top rail. Each panel is
  // { a, b, y0, y1, len, face } with a/b the ends along the face.
  function boxOutline(boxes, topY) {
    const faces = [];
    boxes.forEach(b => {
      faces.push({ axis: 'z', fixed: b.x0, lo: b.z0, hi: b.z1, out: -1, b }, { axis: 'z', fixed: b.x1, lo: b.z0, hi: b.z1, out: 1, b },
        { axis: 'x', fixed: b.z0, lo: b.x0, hi: b.x1, out: -1, b }, { axis: 'x', fixed: b.z1, lo: b.x0, hi: b.x1, out: 1, b });
    });
    const out = [];
    faces.forEach(f => {
      // parts of this face covered by another box's face on the same line, facing the other way
      const cover = faces.filter(o => o.b !== f.b && o.axis === f.axis && o.out === -f.out && Math.abs(o.fixed - f.fixed) < 0.5).map(o => [o.lo, o.hi]);
      let segs = [[f.lo, f.hi]];
      cover.forEach(([l, h]) => { segs = segs.flatMap(([a, b2]) => (h <= a || l >= b2) ? [[a, b2]] : [[a, Math.max(a, l)], [Math.min(b2, h), b2]].filter(([u, v]) => v - u > 0.5)); });
      segs.filter(([a, b2]) => b2 - a > 0.5).forEach(([a, b2]) => {
        const y0 = f.b.yb, y1 = f.b.yt;
        const pt = t => f.axis === 'z' ? [f.fixed, 0, t] : [t, 0, f.fixed];
        const face = f.axis === 'z' ? (f.out > 0 ? 'bow end' : 'stern end') : (f.out > 0 ? 'starboard side' : 'port side');
        out.push({ a: pt(a), b: pt(b2), y0, y1, len: b2 - a, height: y1 - y0, face, box: f.b.id, n: out.filter(o => o.box === f.b.id && o.face === face).length });
      });
    });
    return out;
  }
  // Curved hull outline (x fore-aft, z across): a square transom at the stern,
  // straight sides along the widest boxes, then a curve to a point hullBow
  // ahead of the bow box. The curve is made fuller until it clears every box
  // corner by 1". Returns a closed polyline and its length.
  function hullShape(boxes, bow) {
    const xs = Math.min(...boxes.map(b => b.x0)), xf = Math.max(...boxes.map(b => b.x1));
    const h = Math.max(...boxes.map(b => Math.max(Math.abs(b.z0), Math.abs(b.z1))));
    const xw = Math.max(...boxes.filter(b => Math.max(Math.abs(b.z0), Math.abs(b.z1)) >= h - 1).map(b => b.x1));
    const corners = boxes.flatMap(b => [[b.x0, b.z0], [b.x0, b.z1], [b.x1, b.z0], [b.x1, b.z1]]);
    let tip = xf + bow, f = 0.5, curve;
    const make = () => {
      const P = [[xw, h], [xw + (tip - xw) * 0.5, h], [tip - (tip - xw) * 0.15, h * f], [tip, 0]], out = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24, u = 1 - t, w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
        out.push([0, 1].map(k => w.reduce((s2, wi, j) => s2 + wi * P[j][k], 0)));
      }
      return out;
    };
    const half = (pts, x) => { if (x <= xw) return h; for (let i = 1; i < pts.length; i++) if (pts[i][0] >= x) { const [a, b] = [pts[i - 1], pts[i]], t = (x - a[0]) / ((b[0] - a[0]) || 1); return a[1] + t * (b[1] - a[1]); } return 0; };
    for (let n = 0; n < 40; n++) {
      curve = make();
      const bad = corners.some(([x, z]) => x > xw && half(curve, x) < Math.abs(z) + 1);
      if (!bad) break;
      if (f < 1) f = Math.min(1, f + 0.05); else tip += 2;
    }
    const side = [[xs, h], ...curve];                       // stern corner, along the side, round to the tip
    const outline = [...side, ...side.slice(0, -1).reverse().map(([x, z]) => [x, -z])];   // back down the other side to the stern
    let len = 0; for (let i = 0; i < outline.length; i++) { const a = outline[i], b = outline[(i + 1) % outline.length]; len += Math.hypot(b[0] - a[0], b[1] - a[1]); }
    return { outline, perimeter: len, xs, xw, xf, tip, half: h };
  }
  // one pool noodle wrapped around the bow along the top of the hull, centered on the point
  function bowNoodleShape(hull, y) {
    const o = hull.outline, tipI = o.reduce((m, p, i) => p[0] > o[m][0] ? i : m, 0), pts = [o[tipI]];
    let a = 0, b = 0;
    for (let i = tipI; a < NOODLE_L / 2 && i > 0; i--) { a += Math.hypot(o[i][0] - o[i - 1][0], o[i][1] - o[i - 1][1]); pts.unshift(o[i - 1]); }
    for (let i = tipI; b < NOODLE_L / 2 && i < o.length - 1; i++) { b += Math.hypot(o[i + 1][0] - o[i][0], o[i + 1][1] - o[i][1]); pts.push(o[i + 1]); }
    return { points: pts, y, len: a + b };
  }
  function hullPanel(hull, y0, y1) {
    return { hull: true, a: [hull.xs, 0, -hull.half], b: [hull.xs, 0, hull.half], y0, y1, len: hull.perimeter, height: y1 - y0, face: 'hull (one piece around the boat)', box: 0, n: 0 };
  }
  // corrugated panels are 26" x 8 ft: pack the side pieces into whole panels
  const PANEL = { w: 26, l: 96 };
  function panelPack(sides) {
    // a hull is one strip: whole panels joined with a 4" overlap at each seam
    const pieces = sides.flatMap(sp => { const n = sp.hull ? Math.ceil((sp.len - 4) / (PANEL.l - 4) - 1e-9) : Math.ceil(sp.len / PANEL.l - 1e-9); return Array.from({ length: n }, () => sp.hull ? Math.min(PANEL.l, sp.len / n + 4) : sp.len / n); }).sort((a, b) => b - a);
    const bins = [];
    pieces.forEach(len => { const bin = bins.find(b => b.left >= len + KERF); if (bin) { bin.cuts.push(len); bin.left -= len + KERF; } else bins.push({ cuts: [len], left: PANEL.l - len }); });
    return bins;
  }

  // ── Material requirements derived from geometry ──
  const KERF = 0.125;
  function binPack(cuts) {
    // Best-fit decreasing, then a few randomized restarts to squeeze out a stick.
    const run = order => {
      const sticks = [];
      order.forEach(cut => {
        let best = null;
        for (const st of sticks) if (st.left >= cut.len + KERF && (!best || st.left < best.left)) best = st;
        if (best) { best.cuts.push(cut); best.left -= cut.len + KERF; }
        else sticks.push({ cuts: [cut], left: STOCK - cut.len });
      });
      return sticks;
    };
    const sorted = [...cuts].sort((a, b) => b.len - a.len);
    let best = run(sorted);
    const lower = Math.ceil(cuts.reduce((t, k) => t + k.len, 0) / STOCK);
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 400 && best.length > lower; i++) {
      const o = sorted.map(k => [k, k.len * (0.85 + rand() * 0.3)]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
      const r = run(o);
      if (r.length < best.length) best = r;
    }
    return best;
  }
  function sheetsFor(len, wid, pieces) {
    const per = Math.max(
      Math.floor(SHEET.w / wid) * Math.floor(SHEET.l / len),
      Math.floor(SHEET.w / len) * Math.floor(SHEET.l / wid));
    if (per > 0) return Math.ceil(pieces / per);
    return Math.ceil(pieces * len * wid * 1.15 / (SHEET.w * SHEET.l));
  }
  // Extra zip-tie supports placed in the 3D view (config.extraTies) add to
  // the layout's tie count.
  function requirements(g, parts) {
    const req = baseRequirements(g, parts), c = g.config, extra = Array.isArray(c.extraTies) ? c.extraTies.length : 0;
    // pool noodles: platform bays (pieces cut from 52" noodles), the bow wrap, and the deck-edge rail
    const pl = g.platform, perNoodle = pl ? Math.max(1, Math.floor(NOODLE_L / Math.max(1, pl.bayLen))) : 1;
    const noodles = { platform: pl ? Math.ceil(pl.bays * pl.across / perNoodle) : 0, bow: g.bowNoodle ? 1 : 0, rail: c.noodleRail ? 2 * Math.ceil(c.deck.length / NOODLE_L) : 0 };
    noodles.total = noodles.platform + noodles.bow + noodles.rail;
    req.noodles = noodles; if (noodles.total) req.items.noodle = noodles.total;
    if (extra) { req.extraTies = extra; req.tieCount += extra; req.items['zip-tie'] = Math.ceil(req.tieCount * 1.15); }
    return req;
  }
  function baseRequirements(g, parts) {
    if (g.boxes) return boxRequirements(g, parts);
    const c = g.config;
    const r = g.r;
    const tieLen = Math.max(17, ...(parts || []).filter(p => p.role === 'zip-tie').map(p => +p.length_in || 17));
    const cuts = [];
    const fit = { cross: 0, tee: 0, elbow: 0 };
    if (g.fitted) {
      // Pipe runs between fitting centers, minus the take-off at each end.
      const k = c.fittingTakeoff || 0;
      const zs = g.rails.map(rl => rl.z).sort((a, b) => a - b), xs = g.beams;
      // cage posts are spliced into the rail above them with a tee, which splits that rail segment
      const splices = g.cage ? g.cagePieces.filter(pc => pc.kind === 'post') : [];
      g.rails.forEach((rl, i) => {
        const extra = splices.filter(pc => Math.abs(pc.b[2] - rl.z) < 0.5 && pc.b[0] > xs[0] + 0.5 && pc.b[0] < xs[xs.length - 1] - 0.5 && !xs.some(x => Math.abs(x - pc.b[0]) < 0.5)).map(pc => pc.b[0]);
        fit.tee += extra.length;
        const pts = [...xs, ...extra].sort((a, b) => a - b);
        for (let j = 0; j < pts.length - 1; j++) cuts.push({ label: `rail ${i + 1}.${j + 1}`, len: +(pts[j + 1] - pts[j] - 2 * k).toFixed(2) });
      });
      xs.forEach((x, i) => { for (let j = 0; j < zs.length - 1; j++) cuts.push({ label: `beam ${i + 1}.${j + 1}`, len: +(zs[j + 1] - zs[j] - 2 * k).toFixed(2) }); });
      xs.forEach((x, bi) => zs.forEach((z, ri) => {
        const endB = bi === 0 || bi === xs.length - 1, endR = ri === 0 || ri === zs.length - 1;
        const bowCorner = g.bow && bi === xs.length - 1 && endR;   // riser leaves the front corners
        if (endB && endR) bowCorner ? fit.tee++ : fit.elbow++;
        else if (endB || endR) fit.tee++;
        else fit.cross++;
      }));
      if (g.bow) fit.elbow += 4;
    } else {
      g.rails.forEach((rl, i) => cuts.push({ label: `rail ${i + 1}`, len: c.frameLength }));
      g.beams.forEach((_, i) => cuts.push({ label: `beam ${i + 1}`, len: c.frameWidth }));
      if (g.bow) fit.elbow += 6;
    }
    if (g.bow) {
      ['port', 'stbd'].forEach(s => {
        cuts.push({ label: `bow riser ${s}`, len: c.bowRiser });
        cuts.push({ label: `bow strut ${s}`, len: c.bowStrut });
        cuts.push({ label: `bow bar half ${s}`, len: +(g.outerZ).toFixed(1) });
      });
    }
    if (c.mastHeight > 0) cuts.push({ label: 'mast', len: c.mastHeight + 6 });
    let cageLen = 0;
    if (g.cage) {
      const k = c.fittingTakeoff || 0;
      g.cagePieces.forEach(pc => cuts.push({ label: `cage ${pc.drum + 1} ${pc.kind}`, len: +(pc.len - 2 * k).toFixed(2), cage: true }));
      // lower joints: 2 pipes meeting at an angle = elbow, 3 or more = tee (side-outlet where a post rises)
      const deg = new Map(), dirs = new Map();
      const k3 = pt => pt.map(v => v.toFixed(1)).join(',');
      g.cagePieces.forEach(pc => [[pc.a, pc.b], [pc.b, pc.a]].forEach(([p0, p1]) => {
        if (pc.kind === 'post' && p0 === pc.b) return;            // the post's top is handled by the deck frame
        const kk = k3(p0); deg.set(kk, (deg.get(kk) || 0) + 1);
        (dirs.get(kk) || dirs.set(kk, []).get(kk)).push([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]);
      }));
      deg.forEach((n, kk) => {
        if (n >= 3) fit.tee++;
        else if (n === 2) {
          const [u, v] = dirs.get(kk), dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
          if (dot < 0 && Math.abs(dot) > 0.99 * Math.hypot(...u) * Math.hypot(...v)) fit.coupling = (fit.coupling || 0) + 1; else fit.elbow++;
        }
      });
      cageLen = cuts.filter(x => x.cage).reduce((t, x) => t + x.len, 0);
    }
    const sticks = binPack(cuts);
    const pipeLen = cuts.reduce((s, k) => s + k.len, 0);
    const crossings = g.fitted ? 0 : g.rails.length * g.beams.length;
    const bandTiesFor = rr => Math.ceil((2 * Math.PI * rr + 8) / (tieLen - 4)) * 2;   // 2 bands per drum, ~4" lost per tie to the head and overlap
    const ties = crossings * 2 + (g.cage ? g.cagePieces.filter(pc => pc.kind === 'post').length * 2 * (g.fitted ? 0 : 1) : g.drums.reduce((t, d) => t + bandTiesFor(d.r), 0)) + g.beams.length * 4 + (g.bow ? 10 : 0) + (c.mastHeight > 0 ? 6 : 0);
    const layers = Math.max(1, Math.round(c.deck.thickness - 0.3));
    const bowGuardArea = g.bow ? 2 * (g.outerZ + PIPE_R) * (c.bowStrut + c.bowRiser) * 1.3 : 0;
    const coroArea = 2 * c.deck.length * c.deck.width + bowGuardArea;
    return {
      cuts, sticks, pipeLength_in: pipeLen, cageLength_in: cageLen,
      items: {
        drum: g.drums.length,
        pipe: sticks.length,
        elbow: fit.elbow,
        tee: fit.tee,
        cross: fit.cross,
        coupling: (g.bow ? 1 : 0) + (fit.coupling || 0),
        'zip-tie': Math.ceil(ties * 1.15),            // individual ties, 15% spare
        xps: sheetsFor(c.deck.length, c.deck.width, layers),
        coroplast: Math.ceil(coroArea * 1.15 / (SHEET.w * SHEET.l)),
        'spray-foam': Math.ceil(pipeLen * PIPE_ID_AREA / FOAM_IN3_PER_CAN),
        cement: g.bow || g.fitted ? 1 : 0,
      },
      tieCount: ties, tieLength: tieLen,
    };
  }

  function boxRequirements(g) {
    const c = g.config, k = c.fittingTakeoff || 0;
    const cuts = g.cagePieces.map(pc => ({ label: pc.drum < 0 ? pc.kind : `box ${pc.drum + 1} ${pc.kind}`, len: +(pc.len - 2 * k).toFixed(2), cage: true }));
    if (c.mastHeight > 0) cuts.push({ label: 'mast', len: c.mastHeight + 6 });
    // every joint: 2 pipes at an angle = elbow (3-way corners need side-outlet tees), 3+ = tee
    const fit = { elbow: 0, tee: 0, four: 0, coupling: 0 };
    const k3 = pt => pt.map(v => v.toFixed(1)).join(','), dirs = new Map();
    g.cagePieces.forEach(pc => [[pc.a, pc.b], [pc.b, pc.a]].forEach(([p0, p1]) => {
      const kk = k3(p0); (dirs.get(kk) || dirs.set(kk, []).get(kk)).push([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]);
    }));
    dirs.forEach(ds => {
      if (ds.length >= 4) { fit.tee++; fit.four++; }         // shared corner: 4-way side-outlet tee
      else if (ds.length === 3) fit.tee++;                   // box corner: 3-way side-outlet fitting
      else if (ds.length === 2) {
        const [u, v] = ds, dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
        if (dot < 0 && Math.abs(dot) > 0.99 * Math.hypot(...u) * Math.hypot(...v)) fit.coupling++; else fit.elbow++;
      }
    });
    const sticks = binPack(cuts);
    const pipeLen = cuts.reduce((t, x) => t + x.len, 0), cageLen = cuts.filter(x => x.cage).reduce((t, x) => t + x.len, 0);
    const sides = g.sidePanels || [], panels = sides.length ? panelPack(sides) : [];
    const sideTies = sides.reduce((t, sp) => t + 2 * (Math.ceil(sp.len / 18) + 1), 0);   // panel tied to the top and bottom rails about every 18"
    const ties = 16 + (c.mastHeight > 0 ? 6 : 0) + sideTies;   // deck tie-downs, mast, side panels; drums need no bands
    const layers = Math.max(1, Math.round(c.deck.thickness - 0.3));
    const panelArea = sides.reduce((t, sp) => t + sp.len * sp.height, 0) / 144;
    return {
      panels, panelArea_sqft: panelArea, sideTies,
      cuts, sticks, pipeLength_in: pipeLen, cageLength_in: cageLen,
      items: {
        drum: g.drums.length, pipe: sticks.length, elbow: fit.elbow, tee: fit.tee, cross: 0, coupling: fit.coupling,
        'zip-tie': Math.ceil(ties * 1.15),
        xps: sheetsFor(c.deck.length, c.deck.width, layers),
        coroplast: Math.ceil(2 * c.deck.length * c.deck.width * 1.15 / (SHEET.w * SHEET.l)),
        'spray-foam': Math.ceil(pipeLen * PIPE_ID_AREA / FOAM_IN3_PER_CAN),
        cement: 1,
        ...(sides.length ? { panel: panels.length } : {}),
      },
      tieCount: ties, tieLength: 17, fourWay: fit.four,
    };
  }

  // ── Weight & mass distribution ──
  const FRAME_ROLES = new Set(['pipe', 'pipe-large', 'elbow', 'elbow45', 'coupling', 'tee', 'side-tee', 'five-way', 'cross', 'wye', 'cleanout-tee', 'cap', 'spray-foam', 'zip-tie', 'cement', 'epoxy', 'sealant', 'rope', 'mast']);
  const DECK_ROLES = new Set(['xps', 'coroplast', 'plywood']);
  // tools, and parts marked on_boat: false (bought, use not decided), are not weighed
  const boatParts = parts => (parts || []).filter(p => p.role !== 'tool' && p.category !== 'tools' && p.on_boat !== false && p.status !== 'suggested');

  // Pipe, fittings and zip ties the layout derives are weighed by what it
  // actually uses (spares and offcuts stay on the list but off the boat).
  // Consumables (paint, glue, sealant, tape, twine) are weighed by the share
  // of each container that ends up on the boat: the part's on_boat_share, or
  // a default per role. Everything else is weighed as listed.
  const USED_ROLES = { pipe: 'pipe', elbow: 'elbow', tee: 'tee', 'side-tee': 'tee', 'five-way': 'tee', 'cleanout-tee': 'tee', cross: 'cross', coupling: 'coupling', 'zip-tie': 'zip-tie', xps: 'xps', coroplast: 'coroplast', panel: 'panel', noodle: 'noodle' };
  const CONSUMABLE_SHARE = { paint: 0.5, glue: 0.5, sealant: 0.5, epoxy: 0.75, cement: 0.25, tape: 0.25, rope: 0.25 };
  const onBoatShare = p => (p.on_boat_share != null && isFinite(+p.on_boat_share) ? Math.min(1, Math.max(0, +p.on_boat_share)) : CONSUMABLE_SHARE[p.role] ?? 1);
  function partWeights(build, g) {
    const parts = boatParts(build.parts);
    const req = requirements(g, build.parts);
    const used = {};
    Object.values(USED_ROLES).forEach(k => { used[k] = k === 'pipe' ? req.pipeLength_in / STOCK : req.items[k] || 0; });
    // foam board and Coroplast are cut to the deck: weigh the area used (in full 4 x 8 ft sheets, XPS per 1" layer)
    const c = g.config, deckSheets = c.deck.length * c.deck.width / (SHEET.w * SHEET.l);
    used.xps = deckSheets * Math.max(1, Math.round(c.deck.thickness - 0.3));
    used.coroplast = deckSheets * 2;                         // top and bottom skins
    used.panel = (req.panelArea_sqft || 0) / (PANEL.w * PANEL.l / 144);   // side panels: the area cut, in whole panels
    const pool = {};
    parts.forEach(p => { const k = USED_ROLES[p.role]; if (k) pool[k] = (pool[k] || 0) + (inventory([p])[k] || 0); });
    const plan = paintPlan(c, parts);
    const rows = parts.filter(p => p.role !== 'drum').map(p => {
      const q = +p.quantity || 0, k = USED_ROLES[p.role];
      const share = k ? (pool[k] ? Math.min(1, used[k] / pool[k]) : 1) : (plan && p.role === 'paint' ? 0 : onBoatShare(p));
      return { part: p, w: q * share * (+p.weight_lb_each || 0) };
    });
    // the layout needs more pipe or fittings than listed: weigh the shortfall too
    const DEFAULT_EACH = { pipe: 5.1, elbow: 0.2, tee: 0.35, cross: 0.45, coupling: 0.15, xps: 3, coroplast: 6, panel: 3, noodle: 0.3 };
    Object.keys(DEFAULT_EACH).forEach(k => {
      const short = used[k] - (pool[k] || 0);
      if (short <= 1e-9) return;
      const listed = parts.filter(p => USED_ROLES[p.role] === k);
      const each = pool[k] ? listed.reduce((t, p) => t + (+p.quantity || 0) * (+p.weight_lb_each || 0), 0) / pool[k] : DEFAULT_EACH[k];   // per pipe stick, fitting or sheet
      rows.push({ part: { name: `more ${k} (not on the list yet)`, role: k, status: 'planned' }, w: short * each });
    });
    if (plan) rows.push({ part: { name: `paint on ${plan.area.toFixed(1)} sq ft (painted in the 3D view)`, role: 'paint', status: parts.some(p => p.role === 'paint' && isBought(p)) ? 'bought' : 'planned' }, w: plan.area * PAINT_LB_PER_SQFT });
    return rows;
  }

  // Decals placed in the 3D view: config.decals = [{ type, kind: 'sticker' |
  // 'paint', color, size, text, at, normal, y }]. Stickers become optional
  // shopping rows (what to buy); painted ones need a stencil and paint.
  const DECALS = {
    stripe: { label: 'Stripe', buy: 'Waterproof vinyl pinstripe tape, 1 in x 150 ft', price: 9.98, per: 150, unit: 'roll', stencil: null },
    skull: { label: 'Skull and crossbones', buy: 'Skull and crossbones vinyl decal, waterproof, 6-12 in', price: 7.99, per: 1, unit: 'decal', stencil: 'Skull and crossbones stencil, reusable plastic, 8-12 in' },
    porthole: { label: 'Porthole window', buy: 'Porthole window vinyl decals, waterproof, set of 4', price: 11.99, per: 4, unit: 'set', stencil: 'Circle stencil set (portholes)' },
    star: { label: 'Nautical star', buy: 'Nautical star vinyl decal, waterproof', price: 5.99, per: 1, unit: 'decal', stencil: 'Nautical star stencil' },
    flames: { label: 'Flames', buy: 'Flame vinyl decals, waterproof, pair', price: 11.99, per: 2, unit: 'pair', stencil: 'Flame stencil set' },
    strawhat: { label: 'Straw-hat skull', buy: 'Straw hat pirate skull vinyl decal, waterproof, 6-10 in', price: 8.99, per: 1, unit: 'decal', stencil: 'Skull stencil plus a hat stencil, reusable plastic' },
    name: { label: 'Boat name', buy: 'Waterproof vinyl letters, 3 in, black (letters and numbers set)', price: 7.98, per: 1, unit: 'pack', stencil: 'Letter stencil set, 3-4 in' },
  };
  function decalPlan(c, g) {
    const list = Array.isArray(c && c.decals) ? c.decals.filter(d => DECALS[d.type]) : [];
    if (!list.length) return null;
    const rows = {}, add = (name, n, def, why) => { (rows[name] = rows[name] || { name, n: 0, price: def.price, per: def.per, unit: def.unit, why: [] }); rows[name].n += n; rows[name].why.push(why); };
    list.forEach(d => {
      const def = DECALS[d.type];
      if (d.kind === 'paint') { if (def.stencil) add(def.stencil, 1, { price: 8.98, per: 99, unit: 'stencil' }, `${def.label} (painted)`); return; }
      if (d.type === 'stripe') { const ft = (g && g.hull ? g.hull.perimeter : 48) / 12; add(def.buy, ft, def, `${ft.toFixed(0)} ft stripe`); }
      else if (d.type === 'name') add(def.buy, Math.max(1, Math.ceil(String(d.text || '').replace(/\s/g, '').length / 30)), def, `name "${d.text || ''}"`);
      else add(def.buy, 1, def, def.label);
    });
    return Object.values(rows).map(r => Object.assign(r, { qty: Math.ceil(r.n / r.per - 1e-9) }));
  }

  // Paint applied in the 3D view: config.paint = [{ paint: part name, color, area_sqft }].
  // Dried spray paint weighs about 0.02 lb per sq ft per coat; a 12 oz can covers
  // about 15 sq ft (a part's coverage_sqft overrides it).
  const PAINT_LB_PER_SQFT = 0.02, CAN_SQFT = 15;
  function paintPlan(c, parts) {
    const list = Array.isArray(c && c.paint) ? c.paint.filter(x => +x.area_sqft > 0) : [];
    if (!list.length) return null;
    const by = {};
    list.forEach(x => { const k = x.paint || x.color; (by[k] = by[k] || { paint: x.paint, color: x.color, area: 0, parts: 0 }); by[k].area += +x.area_sqft; by[k].parts++; });
    const colors = Object.values(by).map(b => {
      const part = (parts || []).find(p => p.name === b.paint);
      const cover = part && +part.coverage_sqft > 0 ? +part.coverage_sqft : CAN_SQFT;
      return Object.assign(b, { cans: Math.ceil(b.area / cover - 1e-9), have: part ? +part.quantity || 0 : 0, bought: !!(part && isBought(part)) });
    });
    return { area: colors.reduce((t, b) => t + b.area, 0), colors };
  }

  // Part states: suggested (an idea, not weighed), planned (will buy), ordered
  // (paid, on the way), bought, installed. Ordered counts as bought.
  const STATUSES = ['suggested', 'planned', 'ordered', 'bought', 'installed'];
  const isBought = p => p.status === 'bought' || p.status === 'installed' || p.status === 'ordered';

  // predicted: the finished boat as configured (all listed parts, pipe and
  //   fittings counted by what the layout uses, drums by the layout's count).
  // onHand: the part of that predicted weight already bought.
  // spareOnHand: bought pipe/fittings the layout doesn't use (offcuts, spares).
  function weights(build, g) {
    const parts = boatParts(build.parts);
    const drumPart = parts.find(p => p.role === 'drum');
    const drumW = g.drums.reduce((t, d) => t + d.spec.weight, 0);
    const drumEach = drumW / Math.max(1, g.drums.length);
    const allMeasured = drumPart && drumPart.weight_measured;
    let total = drumW, measured = g.drums.reduce((t, d) => t + (allMeasured || d.spec.weightMeasured ? d.spec.weight : 0), 0);
    const drumsBoughtW = drumPart && isBought(drumPart) ? g.drums.slice(0, +drumPart.quantity || 0).reduce((t, d) => t + d.spec.weight, 0) : 0;
    let onHand = drumsBoughtW;
    let boughtListed = 0;
    const byRole = { drum: drumW };
    partWeights(build, g).forEach(({ part: p, w }) => {
      total += w; if (p.weight_measured) measured += w;
      byRole[p.role] = (byRole[p.role] || 0) + w;
      if (isBought(p)) { onHand += w; boughtListed += (+p.quantity || 0) * (+p.weight_lb_each || 0); }
    });
    const usedBought = onHand - drumsBoughtW;
    const undecided = (build.parts || []).filter(p => (p.on_boat === false || p.status === 'suggested') && p.role !== 'tool' && p.category !== 'tools');
    return {
      total, predicted: total, measured, drumEach, byRole, onHand,
      undecided: undecided.reduce((t, p) => t + (+p.quantity || 0) * (+p.weight_lb_each || 0), 0), undecidedParts: undecided.map(p => p.name),
      spareOnHand: Math.max(0, boughtListed - usedBought),
      remaining: Math.max(0, total - onHand),
      measuredShare: total ? measured / total : 0,
    };
  }

  function massItems(build, g, crewOverride) {
    const c = g.config, crew = Object.assign({}, c.crew, crewOverride || {});
    const wt = weights(build, g);
    const items = g.drums.map(d => ({ w: d.spec.weight, x: d.x, y: d.y0 + d.r, z: d.z, label: 'drum' }));
    let frameW = 0, deckW = 0, topW = 0;
    partWeights(build, g).forEach(({ part: p, w }) => {
      if (FRAME_ROLES.has(p.role)) frameW += w; else if (DECK_ROLES.has(p.role)) deckW += w; else topW += w;
    });
    const fx = g.bow ? c.bowStrut * 0.15 : 0;
    if (g.cage) {
      const req = requirements(g, build.parts), frac = req.pipeLength_in ? req.cageLength_in / req.pipeLength_in : 0;
      const cageW = frameW * frac, total = g.cagePieces.reduce((t, pc) => t + pc.len, 0) || 1;
      g.cagePieces.forEach(pc => items.push({ w: cageW * pc.len / total, x: (pc.a[0] + pc.b[0]) / 2, y: (pc.a[1] + pc.b[1]) / 2, z: (pc.a[2] + pc.b[2]) / 2, label: 'cage' }));
      frameW -= cageW;
    }
    items.push({ w: frameW, x: fx, y: g.railY + PIPE_R, z: 0, label: 'frame' });
    items.push({ w: deckW, x: 0, y: (g.deckBottom + g.deckTop) / 2, z: 0, label: 'deck' });
    items.push({ w: topW, x: 0, y: g.deckTop + 2, z: 0, label: 'fittings/decor' });
    crewPositions(c, crew).forEach(p => items.push({ w: crew.weightEach, x: p.x, y: g.deckTop + SEATED_CG, z: p.z, label: 'crew' }));
    return items;
  }

  function crewPositions(c, crew) {
    const n = Math.max(0, Math.round(crew.count));
    const half = c.deck.length / 2 - 9;
    const spacing = n > 1 ? Math.min(30, (2 * half) / (n - 1)) : 0;
    return Array.from({ length: n }, (_, i) => ({
      x: Math.max(-half, Math.min(half, crew.xOffset + (i - (n - 1) / 2) * spacing)),
      z: crew.zOffset || 0,
    }));
  }

  // ── Hydrostatics: solve heave, trim and heel ──
  function slicesOf(g) {
    const out = [];
    g.drums.filter(d => !d.failed).forEach(d => {
      const dl = d.len / SLICES;
      for (let k = 0; k < SLICES; k++) {
        const u = -d.len / 2 + (k + 0.5) * dl;
        out.push(d.axis === 'x' ? { x: d.x + u, z: d.z, dl, r: d.r, y0: d.y0, axis: 'x', drum: d.id }
                                : { x: d.x, z: d.z + u, dl, r: d.r, y0: d.y0, axis: 'z', drum: d.id });
      }
    });
    return out;
  }
  const PIPE_AREA = Math.PI * PIPE_R * PIPE_R;
  // Cage pipes, cut into short pieces; a piece adds lift by how much of it is under water.
  function pipeSlices(g) {
    if (!g.cage) return [];
    const out = [];
    g.cagePieces.forEach(pc => {
      const n = Math.max(1, Math.ceil(pc.len / 6));
      for (let k = 0; k < n; k++) {
        const f = (k + 0.5) / n;
        out.push({ x: pc.a[0] + (pc.b[0] - pc.a[0]) * f, y: pc.a[1] + (pc.b[1] - pc.a[1]) * f, z: pc.a[2] + (pc.b[2] - pc.a[2]) * f, vol: PIPE_AREA * pc.len / n, vertical: pc.kind === 'post', dl: pc.len / n });
      }
    });
    return out;
  }
  const wetFrac = (h, ps) => ps.vertical ? Math.max(0, Math.min(1, (h - (ps.y - ps.dl / 2)) / ps.dl)) : Math.max(0, Math.min(1, (h - (ps.y - PIPE_R)) / (2 * PIPE_R)));
  function forces(sl, d, t, p, ps) {
    let F = 0, Mx = 0, Mz = 0;
    for (const s of sl) {
      const b = segArea(d - s.x * t - s.z * p - s.y0, s.r) * s.dl * WATER;
      F += b; Mx += b * s.x; Mz += b * s.z;
    }
    for (const q of ps || []) {
      const b = wetFrac(d - q.x * t - q.z * p, q) * q.vol * WATER;
      F += b; Mx += b * q.x; Mz += b * q.z;
    }
    return { F, Mx, Mz };
  }

  function solve(g, items) {
    const sl = slicesOf(g), ps = pipeSlices(g);
    const W = items.reduce((s, i) => s + i.w, 0);
    const xg = items.reduce((s, i) => s + i.w * i.x, 0) / W;
    const zg = items.reduce((s, i) => s + i.w * i.z, 0) / W;
    const KG = items.reduce((s, i) => s + i.w * i.y, 0) / W;
    const r = g.r;
    const maxLb = sl.reduce((s, k) => s + Math.PI * k.r * k.r * k.dl * WATER, 0) + ps.reduce((s, q) => s + q.vol * WATER, 0);
    const base = { W, xg, zg, KG, maxLb, loadPct: maxLb ? (W / maxLb) * 100 : Infinity };
    if (!sl.length || W >= maxLb * 0.995) return Object.assign(base, { ok: false, reason: 'sinks' });
    const span = Math.max(1, ...sl.map(s => Math.abs(s.x)), ...sl.map(s => Math.abs(s.z)));
    // initial heave by bisection at level trim
    let lo = 0, hi = 2 * r;
    for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; forces(sl, m, 0, 0, ps).F < W ? lo = m : hi = m; }
    let v = [lo, 0, 0];
    const resid = x => { const f = forces(sl, x[0], x[1], x[2], ps); return [(f.F - W) / W, (f.Mx - W * xg) / (W * span), (f.Mz - W * zg) / (W * span)]; };
    let res = resid(v), ok = false;
    for (let it = 0; it < 80; it++) {
      const n0 = Math.hypot(...res);
      if (n0 < 1e-7) { ok = true; break; }
      const h = [1e-3, 1e-5, 1e-5], J = [[], [], []];
      for (let j = 0; j < 3; j++) {
        const vp = v.slice(); vp[j] += h[j];
        const rp = resid(vp);
        for (let i = 0; i < 3; i++) J[i][j] = (rp[i] - res[i]) / h[j];
      }
      const step = solve3(J, res.map(x => -x));
      if (!step) break;
      let lam = 1, accepted = false;
      for (let k = 0; k < 20; k++) {
        const cand = [v[0] + lam * clampAbs(step[0], 4), v[1] + lam * clampAbs(step[1], 0.08), v[2] + lam * clampAbs(step[2], 0.08)];
        const rc = resid(cand);
        if (Math.hypot(...rc) < n0) { v = cand; res = rc; accepted = true; break; }
        lam /= 2;
      }
      if (!accepted) break;
    }
    if (!ok && Math.hypot(...res) < 1e-4) ok = true;
    const [d, t, p] = v;
    const pitchDeg = Math.atan(t) * 180 / Math.PI, rollDeg = Math.atan(p) * 180 / Math.PI;
    if (!ok || Math.abs(pitchDeg) > 25 || Math.abs(rollDeg) > 25) {
      return Object.assign(base, { ok: false, reason: 'capsizes', d, pitchDeg, rollDeg });
    }
    const hAt = (x, z) => d - x * t - z * p;
    // per-drum immersion and waterplane / stability
    let V = 0, KBm = 0, A = 0, Ax = 0, Az = 0, Ixx = 0, Izz = 0, Ix0 = 0, Iz0 = 0;
    const perDrum = {};
    for (const s of sl) {
      const hh = hAt(s.x, s.z) - s.y0, a = segArea(hh, s.r), vol = a * s.dl;
      V += vol; KBm += vol * (segCentroidY(hh, s.r) + s.y0);
      const w = segWidth(hh, s.r), wa = w * s.dl;
      A += wa; Ax += wa * s.x; Az += wa * s.z;
      // strip own inertia: w across the drum, dl along it
      const spanZ = s.axis === 'x' ? w : s.dl, spanX = s.axis === 'x' ? s.dl : w;
      Izz += wa * s.z * s.z + wa * spanZ * spanZ / 12;   // roll (about x axis)
      Ixx += wa * s.x * s.x + wa * spanX * spanX / 12;   // pitch (about z axis)
      const pd = perDrum[s.drum] || (perDrum[s.drum] = { min: Infinity, max: -Infinity, lb: 0 });
      pd.min = Math.min(pd.min, hh); pd.max = Math.max(pd.max, hh); pd.lb += vol * WATER;
    }
    for (const q of ps) {   // submerged cage pipes add volume low down (raises KB slightly)
      const vol = wetFrac(hAt(q.x, q.z), q) * q.vol;
      V += vol; KBm += vol * q.y;
    }
    const cx = A ? Ax / A : 0, cz = A ? Az / A : 0;
    Ix0 = Ixx - A * cx * cx; Iz0 = Izz - A * cz * cz;
    const KB = V ? KBm / V : 0;
    const gmRoll = V ? Iz0 / V + KB - KG : 0;
    const gmPitch = V ? Ix0 / V + KB - KG : 0;
    const railBottom = g.railY - PIPE_R;
    const c = g.config;
    const corners = [[-c.frameLength / 2, -g.outerZ], [-c.frameLength / 2, g.outerZ], [c.frameLength / 2, -g.outerZ], [c.frameLength / 2, g.outerZ]];
    const freeboards = corners.map(([x, z]) => railBottom - hAt(x, z));
    const bowFreeboard = Math.min(railBottom - hAt(c.frameLength / 2, -g.outerZ), railBottom - hAt(c.frameLength / 2, g.outerZ));
    const sternFreeboard = Math.min(railBottom - hAt(-c.frameLength / 2, -g.outerZ), railBottom - hAt(-c.frameLength / 2, g.outerZ));
    const drafts = Object.values(perDrum).map(pd => pd.max);
    if (g.cage) g.cagePieces.filter(pc => pc.kind !== 'post').forEach(pc => drafts.push(hAt((pc.a[0] + pc.b[0]) / 2, (pc.a[2] + pc.b[2]) / 2) - (pc.a[1] - PIPE_R)));
    return Object.assign(base, {
      ok: true, d, t, p, pitchDeg, rollDeg, perDrum,
      maxDraft: Math.max(...drafts), meanDraft: d,
      minFreeboard: Math.min(...freeboards), bowFreeboard, sternFreeboard,
      gmRoll, gmPitch, KB, waterplaneArea: A,
      buoyancyCenterX: (() => { const live = g.drums.filter(x => !x.failed), v = live.map(x => x.r * x.r * x.len); const tv = v.reduce((a2, b2) => a2 + b2, 0); return tv ? live.reduce((s2, x, i) => s2 + x.x * v[i], 0) / tv : 0; })(),
    });
  }
  const clampAbs = (v, m) => Math.max(-m, Math.min(m, v));
  function solve3(A, b) {
    const M = A.map((row, i) => [...row, b[i]]);
    for (let i = 0; i < 3; i++) {
      let piv = i;
      for (let k = i + 1; k < 3; k++) if (Math.abs(M[k][i]) > Math.abs(M[piv][i])) piv = k;
      if (Math.abs(M[piv][i]) < 1e-12) return null;
      [M[i], M[piv]] = [M[piv], M[i]];
      for (let k = 0; k < 3; k++) if (k !== i) {
        const f = M[k][i] / M[i][i];
        for (let j = i; j < 4; j++) M[k][j] -= f * M[i][j];
      }
    }
    return M.map((row, i) => row[3] / row[i]);
  }

  // ── Rules ──
  const METAL = /\b(nail|screw|staple|bolt|bracket|clamp|hinge|wire|sheet metal|steel|alumin(?:i)?um|metal|rivet|washer|nut)s?\b/i;
  const SINKS = new Set(['cotton-canvas', 'nylon', 'foam-fabric', 'polyester', 'sisal', 'pvc-sheet', 'unknown']);
  const FASTENER_ROLES = new Set(['zip-tie', 'cement', 'epoxy', 'sealant', 'glue', 'spray-foam', 'paint', 'tape']);

  function checkRules(build, g, rules, wt) {
    const out = [];
    const add = (level, id, title, detail) => out.push({ level, id, title, detail });
    const max = rules.max_boat_weight_lb || 150;
    if (wt.total >= max) add('error', 'weight', `Boat weighs ~${wt.total.toFixed(0)} lb, at or over the ${max} lb limit`, 'Remove weight or switch to a lighter preset.');
    else if (wt.total > max - 10) add('warn', 'weight', `~${wt.total.toFixed(0)} lb is within 10 lb of the ${max} lb limit`, 'Estimated weights can be off. Weigh the parts.');
    else add('ok', 'weight', `~${wt.total.toFixed(0)} lb, under the ${max} lb limit (${(max - wt.total).toFixed(0)} lb margin)`, '');
    const md = rules.max_dimensions_ft || { length: 10, width: 10, height: 5 };
    const dims = [['length', g.overall.length], ['width', g.overall.width], ['height', g.overall.height]];
    const bad = dims.filter(([k, v]) => v > md[k] * 12);
    if (bad.length) add('error', 'dims', `Over the size limit: ${bad.map(([k, v]) => `${k} ${(v / 12).toFixed(1)} ft`).join(', ')}`, `Limit is ${md.length} × ${md.width} × ${md.height} ft.`);
    else add('ok', 'dims', `Size ${(g.overall.length / 12).toFixed(1)} × ${(g.overall.width / 12).toFixed(1)} × ${(g.overall.height / 12).toFixed(1)} ft (L × W × H)`, `Limit ${md.length} × ${md.width} × ${md.height} ft.`);
    const wallMax = (rules.max_wall_height_ft || 2) * 12;
    if (g.wallHeight >= wallMax) add('error', 'wall', `Wall height ${g.wallHeight.toFixed(0)}" exceeds ${wallMax}"`, '');
    else add('ok', 'wall', `Wall height ~${g.wallHeight.toFixed(0)}" (limit < ${wallMax}")`, '');
    const parts = boatParts(build.parts);
    const metal = parts.filter(p => METAL.test(p.name || '') || p.material === 'metal');
    if (metal.length) add('error', 'metal', 'Metal parts are not allowed', metal.map(p => p.name).join('; '));
    else add('ok', 'metal', 'No metal parts', '');
    const woodMax = rules.max_wood_thickness_in || 0.25;
    const thick = parts.filter(p => p.material === 'wood' && (+p.thickness_in || 99) > woodMax);
    if (thick.length) add('error', 'wood', `Wood over ${woodMax}" thick`, thick.map(p => `${p.name} (${p.thickness_in || '?'}")`).join('; '));
    const ropeMax = rules.max_securing_material_length_in || 18;
    const ropes = parts.filter(p => p.role === 'rope' && !(+p.max_piece_length_in <= ropeMax));
    if (ropes.length) add('error', 'rope', `Rope/strap pieces must be ≤ ${ropeMax}"`, ropes.map(p => p.name).join('; ') + ': set the max piece length to ≤ 18".');
    else add('ok', 'rope', `Securing materials ≤ ${ropeMax}" pieces; zip ties trimmed flush`, 'Drum bands made of daisy-chained ties: confirm with the organizers.');
    const longTies = parts.filter(p => p.role === 'zip-tie' && +p.length_in > ropeMax);
    if (longTies.length) add('warn', 'ties', `Zip ties longer than ${ropeMax}"`, longTies.map(p => p.name).join('; ') + `. The rule caps securing materials at ${ropeMax}". Ask the organizers whether a long tie trimmed flush counts by its installed length. If not, use daisy-chained ties of ${ropeMax}" or less.`);
    const pipes = parts.filter(p => ['pipe', 'pipe-large', 'elbow', 'elbow45', 'coupling', 'tee', 'side-tee', 'five-way', 'cross', 'wye', 'cleanout-tee', 'cap', 'mast'].includes(p.role) && p.material === 'pvc');
    const hasFoam = parts.some(p => p.role === 'spray-foam' && p.quantity > 0);
    const unfilled = pipes.filter(p => !p.foam_filled);
    if (pipes.length && (!hasFoam || unfilled.length)) add('error', 'float', 'PVC sinks: every pipe and fitting must be foam-filled so broken pieces float', unfilled.length ? unfilled.map(p => p.name).join('; ') : 'Add expanding spray foam to the parts list.');
    const sinkers = parts.filter(p => SINKS.has(p.material) && !FASTENER_ROLES.has(p.role));
    if (sinkers.length) add('warn', 'float', 'These materials may not float', sinkers.map(p => p.name).join('; ') + '. Test in a bucket or swap for a floating alternative (e.g. polypropylene rope).');
    else if (!(pipes.length && (!hasFoam || unfilled.length))) add('ok', 'float', 'All structural materials float (PVC is foam-filled)', '');
    return out;
  }

  function drumLabel(g, d) {
    const fa = d.x > 3 ? 'bow' : d.x < -3 ? 'stern' : 'mid';
    const side = d.z > 3 ? 'starboard' : d.z < -3 ? 'port' : 'center';
    return `Drum ${d.id + 1} (${fa} ${side})`;
  }

  // With mixed drum sizes, try every assignment of the measured drums to the
  // layout's positions and return the one that floats most level.
  function permutations(arr) {
    if (arr.length <= 1) return [arr.slice()];
    const out = [];
    arr.forEach((x, i) => permutations(arr.slice(0, i).concat(arr.slice(i + 1))).forEach(p => out.push([x].concat(p))));
    return out;
  }
  function bestPlacement(build, g) {
    if (!g.mixed || g.drums.length > 5) return null;
    const c = g.config;
    const specs = g.drums.map(d => (Array.isArray(c.drumSpecs) && c.drumSpecs[d.id]) || null);
    const score = cfg => {
      const gg = geometry(cfg), s = solve(gg, massItems(Object.assign({}, build, { config: cfg }), gg));
      return s.ok ? Math.abs(s.pitchDeg) + Math.abs(s.rollDeg) * 1.5 - Math.min(0, s.minFreeboard) : 1e9;
    };
    const cur = score(c);
    let best = null;
    const tried = new Set();
    permutations(specs.map((_, i) => i)).forEach(order => {
      const key = order.map(i => JSON.stringify(specs[i])).join('|');
      if (tried.has(key)) return; tried.add(key);
      const cfg = Object.assign({}, c, { drumSpecs: order.map(i => specs[i]) });
      const sc = score(cfg);
      if (!best || sc < best.score) best = { order, score: sc, drumSpecs: cfg.drumSpecs };
    });
    if (!best || best.score >= cur - 0.3) return null;
    const moves = best.order.map((from, to) => ({ from, to })).filter(m => m.from !== m.to && !sameSpec(drumSpec(c, m.from), drumSpec(c, m.to)));
    return { current: cur, best: best.score, drumSpecs: best.drumSpecs, moves };
  }

  // ── Engineering numbers: buoyancy, drag, weight distribution, structure ──
  // Simple, conservative hand calculations. Units: inches and pounds unless noted.
  const RHO = 1.94;                       // fresh water, slug / ft³
  const PVC = { D: 1.9, d: 1.61, flex: 14000 };   // 1-1/2" Sch 40: OD, ID; PVC flexural strength, psi
  PVC.S = Math.PI * (PVC.D ** 4 - PVC.d ** 4) / (32 * PVC.D);   // section modulus, in³
  const DYNAMIC = 2;                      // crew load factor for slamming through rapids
  const SF_OK = 2.5, SF_MIN = 1.5;        // target and minimum safety factors
  const PADDLER_W = 75;                   // sustained watts per paddler
  const TIE_LB = len => (+len || 8) > 14 ? 175 : 50;   // cable tie tensile rating
  function engineering(build, g, sol, items, req) {
    const c = g.config, out = { buoyancy: null, drag: null, weight: null, structure: [], work: {} };
    if (!sol || !sol.ok) return out;
    const water = sol.d, crew = c.crew;
    // "show the work": for each number, the formula, the numbers plugged in, and why
    const n = (v, d = 1) => (+v).toFixed(d), work = (id, formula, steps, why) => { out.work[id] = { formula, steps, why }; };
    const WATER_TXT = 'water weighs 62.4 lb/ft³ = 0.0361 lb/in³';
    // buoyancy
    const drums = g.drums.filter(d => !d.failed).map(d => {
      const cap = Math.PI * d.r * d.r * d.len * WATER, pd = sol.perDrum[d.id] || { lb: 0, max: 0 };
      return { id: d.id, capacity: cap, lb: pd.lb, share: pd.lb / sol.W, used: pd.lb / cap, depth: pd.max, freeboard: 2 * d.r - pd.max };
    });
    const parts = build.parts || [];
    const deckFoam = c.deck.length * c.deck.width * Math.max(0, c.deck.thickness - 0.3) * WATER;   // XPS lift if swamped
    const noodleFoam = (req.items.noodle || 0) * Math.PI * (NOODLE_D / 2) ** 2 * NOODLE_L * WATER;
    const pipeFoam = req.pipeLength_in * Math.PI * (PVC.D / 2) ** 2 * WATER * 0.45;          // foam-filled PVC nets ~45% lift
    const drumWeight = g.drums.reduce((t, d) => t + d.spec.weight, 0), boatW = sol.W - crew.count * crew.weightEach;
    out.buoyancy = {
      max: sol.maxLb, load: sol.W, reserve: sol.maxLb - sol.W, sf: sol.maxLb / sol.W, drums,
      frameLift: Math.max(0, sol.W - drums.reduce((t, d) => t + d.lb, 0)),   // submerged foam-filled pipe carries the rest
      waterline: water, emergency: deckFoam + noodleFoam + pipeFoam, structure: boatW - drumWeight,
    };
    const B = out.buoyancy, drumCap = drums.reduce((t, d) => t + d.capacity, 0);
    work('buoy.max', 'Lift = Σ (π r² L × 0.0361) for each drum + foam-filled pipe below the deck',
      [...g.drums.filter(d => !d.failed).map(d => `Drum ${d.id + 1}: π × ${n(d.r, 2)}² × ${n(d.len, 1)} = ${n(Math.PI * d.r * d.r * d.len, 0)} in³ × 0.0361 = ${n(Math.PI * d.r * d.r * d.len * WATER, 1)} lb`),
        `Foam-filled pipe that can go under: ${n(sol.maxLb - drumCap, 1)} lb`, `Total = ${n(drumCap, 1)} + ${n(sol.maxLb - drumCap, 1)} = ${n(sol.maxLb, 0)} lb`],
      `Archimedes: a body pushed under water is lifted by the weight of water it displaces (${WATER_TXT}). This is the most the boat can ever hold up.`);
    work('buoy.load', 'W = boat parts + drums + crew', [...items.reduce((acc, it) => { const k = it.label === 'cage' ? 'frame' : it.label; const e = acc.find(x => x[0] === k); e ? e[1] += it.w : acc.push([k, it.w]); return acc; }, []).map(([k, w]) => `${k}: ${n(w, 1)} lb`), `Total W = ${n(sol.W, 1)} lb`],
      'Everything the drums have to hold up: the predicted boat weight from the parts list plus the crew.');
    work('buoy.reserve', 'Reserve = Lift − W', [`${n(sol.maxLb, 0)} − ${n(sol.W, 0)} = ${n(B.reserve, 0)} lb`], 'How much more weight (water in the boat, a wave pushing down) it can take before it goes under.');
    work('buoy.sf', 'Safety factor = Lift ÷ W', [`${n(sol.maxLb, 0)} ÷ ${n(sol.W, 0)} = ${n(B.sf, 2)}×`], 'Above 2× is comfortable for rough water; below 1.5× a big wave or a swamped deck can push it under.');
    drums.forEach(d => { const dd = g.drums.find(x => x.id === d.id);
      work('buoy.drum' + d.id, 'Submerged slice area A(h) = r² · acos((r − h)/r) − (r − h) · √(2rh − h²); lift = Σ A(h) × slice length × 0.0361',
        [`r = ${n(dd.r, 2)}", length ${n(dd.len, 1)}", deepest point h = ${n(d.depth, 2)}" (the boat trims, so h varies along the drum)`, `Lift = ${n(d.lb, 1)} lb of a ${n(d.capacity, 1)} lb maximum = ${n(d.used * 100, 0)}% used`, `Share of the load = ${n(d.lb, 1)} ÷ ${n(sol.W, 1)} = ${n(d.share * 100, 0)}%`],
        'The solver moves the boat up/down and tilts it until the lift equals the weight and the lift is centred under the centre of gravity. Each drum is cut into 12 slices; each slice floats to its own depth.'); });
    work('buoy.frame', 'Pipe lift = W − Σ drum lift', [`${n(sol.W, 1)} − ${n(drums.reduce((t, d) => t + d.lb, 0), 1)} = ${n(B.frameLift, 1)} lb`], 'The bottom rails of the boxes sit below the waterline; foam-filled pipe floats, so it carries part of the load.');
    work('buoy.emergency', 'Foam lift = deck XPS + pool noodles + foam-filled pipe', [
      `Deck: ${c.deck.length} × ${c.deck.width} × (${c.deck.thickness} − 0.3 skins) in³ × 0.0361 = ${n(deckFoam, 0)} lb`,
      `Noodles: ${req.items.noodle || 0} × π × 1.25² × 52 in³ × 0.0361 = ${n(noodleFoam, 0)} lb`,
      `Pipe: ${n(req.pipeLength_in, 0)}" × π × 0.95² × 0.0361 × 45% net = ${n(pipeFoam, 0)} lb`,
      `Total ${n(B.emergency, 0)} lb vs structure without drums ${n(boatW, 0)} − ${n(drumWeight, 0)} = ${n(B.structure, 0)} lb`],
      'The rules say everything must float even when broken. If every drum leaked, the foam would still have to hold up the frame and deck.');
    // drag: the underwater shape seen from ahead and from the side
    const hull = g.hull, skirt = hull ? Math.max(0, water - hull.y0) : 0;
    const segH = (u, r, h) => { const half = Math.sqrt(Math.max(0, r * r - u * u)); return Math.max(0, Math.min(h, r + half) - (r - half)); };
    const under = (y0, h) => Math.max(0, h - y0);
    let frontDrums = 0, sideDrums = 0;
    for (let z = -80; z <= 80; z += 0.5) {                   // union of drum cross-sections, ahead
      let best = 0; g.drums.filter(d => !d.failed).forEach(d => { const hgt = d.axis === 'x' ? segH(z - d.z, d.r, water - d.y0) : (Math.abs(z - d.z) <= d.len / 2 ? Math.min(2 * d.r, under(d.y0, water)) : 0); best = Math.max(best, hull ? Math.min(hgt, Math.max(0, hull.y0 - d.y0)) : hgt); });
      frontDrums += best * 0.5;
    }
    for (let x = -120; x <= 120; x += 0.5) {                 // and from the side
      let best = 0; g.drums.filter(d => !d.failed).forEach(d => { const hgt = d.axis === 'z' ? segH(x - d.x, d.r, water - d.y0) : (Math.abs(x - d.x) <= d.len / 2 ? Math.min(2 * d.r, under(d.y0, water)) : 0); best = Math.max(best, hull ? Math.min(hgt, Math.max(0, hull.y0 - d.y0)) : hgt); });
      sideDrums += best * 0.5;
    }
    const frontHull = hull ? 2 * hull.half * skirt : 0, sideHull = hull ? (hull.tip - hull.xs) * skirt : 0;
    const CdDrum = 0.9, CdHull = hull && hull.tip - hull.xf > 6 ? 0.5 : 1.0, CdSide = 1.1;
    const CdA = (CdDrum * frontDrums + CdHull * frontHull) / 144, CdAside = CdSide * (sideDrums + sideHull) / 144;   // ft²
    const force = (CdAft, mph) => { const v = mph * 1.4667; return 0.5 * RHO * v * v * CdAft; };   // lbf
    const power = crew.count * PADDLER_W, vMax = Math.cbrt(power / 1.356 / (0.5 * RHO * Math.max(1e-6, CdA)));   // ft/s
    out.drag = {
      frontArea: (frontDrums + frontHull) / 144, sideArea: (sideDrums + sideHull) / 144, CdA, CdAside,
      at: [1, 2, 3].map(mph => ({ mph, lb: force(CdA, mph), watts: force(CdA, mph) * mph * 1.4667 * 1.356 })),
      broadside: [3, 5, 8].map(mph => ({ mph, lb: force(CdAside, mph) })),
      speed: vMax / 1.4667, power, frontDrums: frontDrums / 144, frontHull: frontHull / 144, sideDrums: sideDrums / 144, sideHull: sideHull / 144, CdDrum, CdHull, CdSide, note: hull ? 'The hull skirt below the waterline adds frontal area; the pointed bow cuts its drag coefficient to about 0.5.' : 'Blunt drum ends (drag coefficient about 0.9).',
    };
    const Dg = out.drag;
    work('drag.area', 'Frontal area = drum cross-sections below the waterline (seen from ahead, overlaps counted once) + hull skirt width × depth under water', [
      `Waterline ${n(water, 1)}" above the drum bottoms${hull ? `; hull skirt bottom at ${n(hull.y0, 1)}", so ${n(skirt, 1)}" of skirt is under water` : ''}`,
      `Drums below the skirt: ${n(Dg.frontDrums, 2)} ft² (sampled every 0.5" across)`, hull ? `Hull: ${n(2 * hull.half, 1)}" wide × ${n(skirt, 1)}" = ${n(Dg.frontHull, 2)} ft²` : 'No hull skirt',
      `From the side: drums ${n(Dg.sideDrums, 2)} ft²${hull ? ` + hull ${n(hull.tip - hull.xs, 1)}" × ${n(skirt, 1)}" = ${n(Dg.sideHull, 2)} ft²` : ''}`],
      'Drag depends on how much the boat pushes against water head-on. Only what is below the waterline counts.');
    work('drag.force', 'F = ½ · ρ · v² · Cd · A   (ρ = 1.94 slug/ft³, v in ft/s, 1 mph = 1.467 ft/s)', [
      `Cd·A = ${CdDrum} × ${n(Dg.frontDrums, 2)} (blunt drum ends) + ${CdHull} × ${n(Dg.frontHull, 2)} (${CdHull < 1 ? 'pointed bow' : 'blunt hull'}) = ${n(CdA, 2)} ft²`,
      ...Dg.at.map(x => `${x.mph} mph: ½ × 1.94 × ${n(x.mph * 1.4667, 2)}² × ${n(CdA, 2)} = ${n(x.lb, 1)} lb; power = F × v = ${n(x.lb, 1)} × ${n(x.mph * 1.4667, 2)} × 1.356 = ${n(x.watts, 0)} W`)],
      'Water drag grows with the square of speed, and the power to push it with the cube. Skin friction along the sides is left out, so real drag is a little higher.');
    work('drag.speed', 'P = F · v = ½ ρ Cd A v³  →  v = ∛(P ÷ (½ ρ Cd A))', [`P = ${crew.count} paddlers × ${PADDLER_W} W = ${power} W = ${n(power / 1.356, 0)} ft·lb/s`, `v = ∛(${n(power / 1.356, 0)} ÷ (0.5 × 1.94 × ${n(CdA, 2)})) = ${n(vMax, 2)} ft/s = ${n(vMax / 1.4667, 1)} mph`],
      'A fit recreational paddler sustains about 75 W. Top speed is where the paddlers\' power equals the drag power.');
    work('drag.broadside', 'F = ½ · ρ · v² · Cd · A_side   (Cd ≈ 1.1 broadside)', [`Cd·A_side = 1.1 × ${n(Dg.sideArea, 2)} = ${n(CdAside, 2)} ft²`, ...Dg.broadside.map(x => `${x.mph} mph: ½ × 1.94 × ${n(x.mph * 1.4667, 2)}² × ${n(CdAside, 2)} = ${n(x.lb, 0)} lb`)],
      'Turned sideways in the current, the long side faces the flow. This is the push that pins a boat against a rock, so keep the bow into the rapids.');
    // weight distribution
    const groups = {};
    items.forEach(it => { const k = it.label === 'cage' ? 'frame' : it.label; groups[k] = groups[k] || { w: 0, mx: 0 }; groups[k].w += it.w; groups[k].mx += it.w * it.x; });
    const fwdW = items.reduce((t, it) => t + (it.x > 0 ? it.w : 0), 0);
    const portW = items.reduce((t, it) => t + (it.z < 0 ? it.w : 0), 0), stbdW = items.reduce((t, it) => t + (it.z > 0 ? it.w : 0), 0);
    const boatItems = items.filter(it => it.label !== 'crew'), bw = boatItems.reduce((t, it) => t + it.w, 0);
    out.weight = {
      total: sol.W, cg: { x: sol.xg, y: sol.KG, z: sol.zg }, boatCg: { x: boatItems.reduce((t, it) => t + it.w * it.x, 0) / bw, y: boatItems.reduce((t, it) => t + it.w * it.y, 0) / bw },
      groups: Object.entries(groups).map(([k, v]) => ({ name: k, lb: v.w, x: v.mx / (v.w || 1) })).sort((a, b) => b.lb - a.lb),
      forward: fwdW / sol.W, port: portW / sol.W, starboard: stbdW / sol.W, cgAboveWater: sol.KG - water, KB: sol.KB,
    };
    work('wt.cg', 'x̄ = Σ wᵢ·xᵢ ÷ Σ wᵢ (same for height and across)', [...items.map(it => `${it.label}: ${n(it.w, 1)} lb at x ${n(it.x, 1)}", height ${n(it.y, 1)}", across ${n(it.z, 1)}"`),
      `x̄ = ${n(items.reduce((t, it) => t + it.w * it.x, 0), 0)} ÷ ${n(sol.W, 1)} = ${n(sol.xg, 1)}"; height = ${n(sol.KG, 1)}"; across = ${n(sol.zg, 1)}"`],
      'The centre of gravity is the balance point of everything on board. The drums must float the boat with their combined lift centred right under it, so it decides trim and heel.');
    work('wt.fwd', 'Forward share = Σ w (x > 0) ÷ W', [`${n(fwdW, 1)} ÷ ${n(sol.W, 1)} = ${n(out.weight.forward * 100, 0)}% forward`], 'Weight forward of the middle pushes the bow down; balance it against where the drums are.');
    work('wt.cgw', 'CG height above the waterline = KG − waterline', [`${n(sol.KG, 1)} − ${n(water, 1)} = ${n(sol.KG - water, 1)}"`, `Centre of buoyancy KB = ${n(sol.KB, 1)}"; stability GM = I/V + KB − KG (roll ${n(sol.gmRoll, 1)}", pitch ${n(sol.gmPitch, 1)}")`],
      'The higher the weight sits above the water, the easier it tips. Seated crew are most of it; sitting low on the deck raises stability.');
    // structure: bending of 1-1/2" Sch 40 PVC under the crew (x2 for slamming) and drum uplift
    const crewP = crew.weightEach * DYNAMIC, chk = (id, name, M, detail, pieces, how) => {
      const stress = M / PVC.S, sf = stress > 0 ? PVC.flex / stress : Infinity;
      out.structure.push({ id, name, moment: M, stress, sf, level: sf < SF_MIN ? 'error' : sf < SF_OK ? 'warn' : 'ok', detail, pieces: pieces || [] });
      work('st.' + id, `${how.formula};  σ = M ÷ S;  SF = ${PVC.flex} psi ÷ σ`, [...how.steps,
        `S = π (D⁴ − d⁴) ÷ (32 D) = π (${PVC.D}⁴ − ${PVC.d}⁴) ÷ (32 × ${PVC.D}) = ${n(PVC.S, 3)} in³ (1-1/2" Sch 40)`,
        `σ = ${n(M, 0)} in·lb ÷ ${n(PVC.S, 3)} in³ = ${n(stress, 0)} psi`, `SF = ${PVC.flex} ÷ ${n(stress, 0)} = ${n(sf, 2)} (target ${SF_OK}, minimum ${SF_MIN})`],
        how.why + ` Bending stress in the pipe wall is compared with PVC's flexural strength (about ${PVC.flex} psi).`);
    };
    if (g.boxes) {
      const tops = g.cagePieces.filter(pc => pc.kind === 'top');
      const boxLen = Math.max(...g.boxList.map(b => b.x1 - b.x0));
      const lenRails = tops.filter(pc => Math.abs(pc.a[2] - pc.b[2]) < 0.1);
      const longest = lenRails.reduce((m, pc) => pc.len > (m ? m.len : 0) ? pc : m, null);
      chk('deck-rail', 'Box top rail under the deck (crew)', (crewP / 2) * (longest ? longest.len : boxLen) / 4,
        `One crew member (${crew.weightEach} lb × ${DYNAMIC} for slamming) at mid-span, shared by the two top rails of a box, span ${(longest ? longest.len : boxLen).toFixed(1)}".`, longest ? [longest] : [],
        { formula: 'Simply supported, centre load: M = (P/2) · L ÷ 4', steps: [`P = ${crew.weightEach} lb × ${DYNAMIC} (slamming) = ${crewP} lb, split over 2 rails = ${crewP / 2} lb`, `L = ${n(longest ? longest.len : boxLen, 1)}" between the corner posts`, `M = ${crewP / 2} × ${n(longest ? longest.len : boxLen, 1)} ÷ 4 = ${n((crewP / 2) * (longest ? longest.len : boxLen) / 4, 0)} in·lb`],
          why: 'The deck spreads a person over the two top rails of the box below; each rail acts as a beam between its corner posts.' });
      const big = g.drums.reduce((m, d) => d.r > m.r ? d : m, g.drums[0]);
      const uplift = Math.PI * big.r * big.r * big.len * WATER - big.spec.weight, span = big.len + 2 * (c.boxEndGap ?? 2);
      const upRails = lenRails.filter(pc => pc.drum === big.id);
      chk('uplift', 'Drum uplift on its box (drum pushed fully under a wave)', (uplift / 2) * span / 8,
        `A fully submerged drum pushes up ${uplift.toFixed(0)} lb, spread along its two top rails (span ${span.toFixed(1)}").`, upRails,
        { formula: 'Uniform load over the span: M = (U/2) · L ÷ 8', steps: [`U = π × ${n(big.r, 2)}² × ${n(big.len, 1)} × 0.0361 − ${big.spec.weight} lb drum = ${n(uplift, 0)} lb`, `Per rail U/2 = ${n(uplift / 2, 0)} lb along L = ${n(span, 1)}"`, `M = ${n(uplift / 2, 0)} × ${n(span, 1)} ÷ 8 = ${n((uplift / 2) * span / 8, 0)} in·lb`],
          why: 'When a wave shoves a drum fully under, its whole lift presses up on the rails that trap it.' });
      if (g.platform) {
        const pl = g.platform; let worst = null;
        pl.xs.forEach(x => {
          const cross = g.cagePieces.find(pc => pc.kind === 'platform' && Math.abs(pc.a[0] - x) < 0.1 && Math.abs(pc.b[0] - x) < 0.1);
          const onEnd = g.boxList.some(b => Math.abs(b.x0 - x) < 1 || Math.abs(b.x1 - x) < 1);
          if (onEnd) return;                                   // sits right on a crosswise top rail
          const sup = [...new Set(g.boxList.filter(b => x >= b.x0 && x <= b.x1).flatMap(b => [b.z0, b.z1]).filter(z => Math.abs(z) <= pl.W / 2 + 1))].sort((a, b) => a - b);
          let M = 0, what = '', how = '';
          if (!sup.length) { M = crewP * pl.W / 4; what = `no rail under it: spans the full ${pl.W.toFixed(1)}"`; how = `M = P · L ÷ 4 = ${crewP} × ${n(pl.W, 1)} ÷ 4`; }
          else {
            for (let i = 0; i < sup.length - 1; i++) { const L = sup[i + 1] - sup[i]; if (crewP * L / 4 > M) { M = crewP * L / 4; what = `${L.toFixed(1)}" between box rails`; how = `M = P · L ÷ 4 = ${crewP} × ${n(L, 1)} ÷ 4`; } }
            const over = Math.max(sup[0] + pl.W / 2, pl.W / 2 - sup[sup.length - 1]);
            if (over > 0 && crewP * over / 2 > M) { M = crewP * over / 2; what = `${over.toFixed(1)}" overhang past the last rail`; how = `Cantilever, load spread: M = P · a ÷ 2 = ${crewP} × ${n(over, 1)} ÷ 2`; }
          }
          if (!worst || M > worst.M) worst = { M, what, cross, x, how };
        });
        if (worst) chk('platform', 'Platform cross member (crew)', worst.M, `Worst cross member: ${worst.what}. One crew member (${crew.weightEach} lb × ${DYNAMIC}) on it.`, worst.cross ? [worst.cross] : [],
          { formula: 'Worst platform cross member: centre load M = P · L ÷ 4, or overhang M = P · a ÷ 2', steps: [`P = ${crew.weightEach} × ${DYNAMIC} = ${crewP} lb (one person, slamming)`, `Worst member at x = ${n(worst.x, 1)}": ${worst.what}`, `${worst.how} = ${n(worst.M, 0)} in·lb`],
            why: 'Each cross member under the foam rests on the box top rails it crosses; the longest gap between rails (or past the last one) bends the most.' });
      }
      if (g.hull && g.hull.tip > g.hull.xf + 3) {
        const nose = g.cagePieces.filter(pc => pc.kind === 'nose' && Math.abs(pc.a[1] - pc.b[1]) < 0.1);
        const L = nose.length ? Math.max(...nose.map(pc => pc.len)) : 0;
        chk('nose', 'Bow nose chords (a 100 lb wave hit on the point)', (100 * DYNAMIC / 2) * L / 4, `A 100 lb hit (× ${DYNAMIC}) on the bow point, carried by the top and bottom chord pairs as beams (conservative: they also act as a truss).`, nose,
          { formula: 'M = (P/2) · L ÷ 4 per chord pair', steps: [`P = 100 lb wave hit × ${DYNAMIC} = ${100 * DYNAMIC} lb, split top/bottom = ${100 * DYNAMIC / 2} lb`, `L = ${n(L, 1)}" (longest chord)`, `M = ${100 * DYNAMIC / 2} × ${n(L, 1)} ÷ 4 = ${n((100 * DYNAMIC / 2) * L / 4, 0)} in·lb`],
            why: 'The nose points take the first hit from waves and rocks. Treating the chords as beams is conservative; as a triangle they mostly carry the push along their length.' });
      }
    }
    // deck tie-downs: XPS lifting off when swamped vs the ties holding it
    const ties = parts.filter(p => p.role === 'zip-tie'), tieR = ties.length ? Math.min(...ties.map(p => TIE_LB(p.length_in))) : 50;
    const deckTies = 16, deckLift = deckFoam;
    out.structure.push({ id: 'deck-ties', name: 'Deck tie-downs vs foam lift when swamped', moment: 0, stress: 0, sf: (deckTies * tieR) / Math.max(1, deckLift), level: (deckTies * tieR) / Math.max(1, deckLift) < SF_OK ? 'warn' : 'ok',
      detail: `${deckTies} ties × ${tieR} lb rating against ${deckLift.toFixed(0)} lb of XPS lift.`, pieces: [] });
    work('st.deck-ties', 'SF = ties × rating ÷ foam lift', [`Foam lift = ${c.deck.length} × ${c.deck.width} × (${c.deck.thickness} − 0.3) × 0.0361 = ${n(deckLift, 0)} lb`, `Hold = ${deckTies} ties × ${tieR} lb = ${deckTies * tieR} lb`, `SF = ${deckTies * tieR} ÷ ${n(deckLift, 0)} = ${n((deckTies * tieR) / Math.max(1, deckLift), 1)}`],
      'If the boat swamps, the foam deck wants to float off. The tie-downs hold it; their rating comes from the weakest tie on the parts list (8" ties ≈ 50 lb, heavy 36" ties ≈ 175 lb).');
    return out;
  }

  // Where each issue sits on the boat, for markers in the 3D view.
  function issueMarkers(a) {
    const g = a.geometry, c = g.config, out = [];
    const top = g.deckTop + 4, bow = [g.hull ? g.hull.tip : Math.max(...g.drums.map(d => d.x + d.ex)), g.railY, 0];
    const stern = [Math.min(...g.drums.map(d => d.x - d.ex)), g.railY, 0], side = [0, g.railY, Math.max(...g.drums.map(d => d.z + d.ez))];
    const drumAt = d => [d.x, d.y0 + 2 * d.r, d.z], framePt = g.boxes ? g.cagePieces[0].a : [0, g.railY, 0];
    const place = r => {
      const t = (r.id || '') + ' ' + r.title;
      if (/weight|lb is within|over the 150/i.test(t)) return { at: [0, top, 0] };
      if (/dimension|too long|too wide|size/i.test(t)) return { at: bow };
      if (/side-to-side|Leaning crew|heel/i.test(t)) return { at: side };
      if (/Fore-aft|see-saw|Nose-dive|bow-down|Trim/i.test(t)) return { at: bow };
      if (/Losing one drum|leak|overlap/i.test(t)) return { at: drumAt(g.drums[0]), drums: g.drums.map(d => d.id) };
      if (/Zip ties|tie/i.test(t)) return { at: framePt };
      if (/float|materials/i.test(t)) return { at: g.hull ? [0, (g.hull.y0 + g.hull.y1) / 2, g.hull.half] : [0, top, 0] };
      if (/pipe|stick|fitting|tee|elbow/i.test(t)) return { at: framePt };
      if (/drum/i.test(t)) return { at: drumAt(g.drums[0]) };
      return { at: [0, top, 0] };
    };
    [...a.rules, ...a.recommendations].filter(r => (r.level === 'error' || r.level === 'warn') && !/^Structure:/.test(r.title))
      .filter((r, i, arr) => arr.findIndex(x => x.title === r.title) === i)
      .forEach(r => out.push(Object.assign({ level: r.level, title: r.title, detail: r.detail || '' }, place(r))));
    (a.engineering.structure || []).filter(s => s.level !== 'ok').forEach(s => {
      const pc = s.pieces[0];
      out.push({ level: s.level, title: `Structure: ${s.name} (safety factor ${s.sf.toFixed(1)})`, detail: s.detail, work: 'st.' + s.id, at: pc ? pc.a.map((v, i) => (v + pc.b[i]) / 2) : [0, top, 0], pieces: s.pieces.map(p => ({ a: p.a, b: p.b })) });
    });
    return out;
  }

  // ── Analysis + recommendations ──
  function analyze(build, rules, opts) {
    opts = opts || {};
    const g = geometry(build.config);
    const req = requirements(g, build.parts);
    const wt = weights(build, g);
    const items = massItems(build, g);
    const sol = solve(g, items);
    const c = g.config;
    const crewW = c.crew.count * c.crew.weightEach;
    // scenarios
    const fwd = solve(g, massItems(build, g, { xOffset: c.deck.length / 2 - 9, count: c.crew.count }));
    const side = solve(g, massItems(build, g, { zOffset: c.deck.width / 2 - 4 }));
    const leaks = opts.skipLeak ? [] : g.drums.map(d => {
      const gl = geometry(Object.assign({}, c, { failedDrum: d.id }));
      return { drum: d.id, sol: solve(gl, massItems(build, gl)) };
    });
    const rulesOut = checkRules(build, g, rules || {}, wt);
    const parts = build.parts || [];
    const cost = parts.reduce((s, p) => s + (+p.quantity || 0) * (+p.unit_cost_usd || 0), 0);
    const spent = parts.filter(isBought).reduce((s, p) => s + (+p.quantity || 0) * (+p.unit_cost_usd || 0), 0);
    const recs = recommend({ build, g, req, wt, sol, fwd, side, leaks, rulesOut, crewW });
    if (g.cageUnsupported) recs.push({ level: 'warn', title: 'The cage is only modeled for lengthwise drums', detail: 'Crosswise drums use zip-tie bands here. Switch to a lengthwise layout to compare a caged build.' });
    const plan = paintPlan(g.config, build.parts);
    if (plan) {
      const short = plan.colors.filter(b => b.cans > b.have);
      recs.push({ level: short.length ? 'warn' : 'info', title: `Paint plan: ${plan.area.toFixed(1)} sq ft painted (~${(plan.area * PAINT_LB_PER_SQFT).toFixed(1)} lb)`,
        detail: plan.colors.map(b => `${b.paint || b.color}: ${b.area.toFixed(1)} sq ft on ${b.parts} part${b.parts > 1 ? 's' : ''}, ~${b.cans} can${b.cans > 1 ? 's' : ''} for one coat (${b.have} on the list)`).join('; ') + '.' + (short.length ? ' Buy more of: ' + short.map(b => b.paint || b.color).join(', ') + '.' : '') });
    }
    const decals = decalPlan(g.config, g);
    if (decals) recs.push({ level: 'info', title: `Decals: ${g.config.decals.length} placed in the 3D view`, detail: 'To buy (optional, in Next shopping trip): ' + decals.map(d => `${d.qty} ${d.unit}${d.qty > 1 ? 's' : ''} of ${d.name}`).join('; ') + '. Use waterproof outdoor vinyl, and press it onto clean, dry, scuffed plastic so it stays on in the rapids.' });
    if (g.config.extraTies && g.config.extraTies.length) recs.push({ level: 'info', title: `${g.config.extraTies.length} extra zip-tie supports added in the 3D view`, detail: 'Counted in the zip-tie total and weight. Keep each tie 18" or less and trim flush.' });
    if (wt.undecided > 0) {
      const max = (rules && rules.max_boat_weight_lb) || 150, all = wt.total + wt.undecided;
      recs.push({ level: all >= max ? 'warn' : 'info', title: `Not counted yet: ${wt.undecided.toFixed(1)} lb of suggested or undecided parts`,
        detail: `${wt.undecidedParts.join('; ')}. Using all of it would bring the boat to ${all.toFixed(1)} lb${all >= max ? `, over the ${max} lb limit` : ''}. Set a suggested part to planned, or untick "not on the boat yet", once you decide to use it.` });
    }
    if (g.sidePanels && g.sidePanels.length) recs.push({ level: 'info', title: `Side panels: ${req.items.panel} of the 26" × 8 ft panels, ${req.panelArea_sqft.toFixed(1)} sq ft`,
      detail: `Cut each panel to ${g.sidePanels[0].height.toFixed(1)}" tall (rail to rail) and to these lengths: ` + req.panels.map((pn, i) => `panel ${i + 1}: ${pn.cuts.map(x => x.toFixed(1) + '"').join(' + ')} (${pn.left.toFixed(1)}" left)`).join('; ') + `. Zip-tie them to the top and bottom rails about every 18" (${req.sideTies} ties). Solid PVC sheet sinks if it breaks loose: back it with foam or keep scraps from washing away.` });
    if (g.boxes) recs.push({ level: 'info', title: `Box frames: each drum sits in its own box of pipe (${(req.cageLength_in / 12).toFixed(0)} ft of pipe)`,
      detail: 'Drums are trapped without straps and the deck sits on the box tops, so there is no separate deck frame. The bottom rails sit just under the drums and can catch rocks in shallow water. Every box corner joins 3 pipes, so use side-outlet tees (3-way corners) there.' + (req.fourWay ? ` Where boxes share a wall or butt against another box's crossbar, ${req.fourWay} of the ${req.items.tee} joints take 4 pipes: use 4-way side-outlet tees or 5-way fittings there.` : '') + (g.boxContacts.length ? ` Boxes ${g.boxContacts.map(([a2, b2]) => `${a2 + 1} and ${b2 + 1}`).join(', ')} meet corner to corner: join them where their end rails meet (a 4-way fitting where the corners touch, short ties otherwise).` : '') });
    if (!opts.noVariant && !g.boxes && g.drums.every(d => d.axis === 'x')) {
      const other = g.cage ? Object.assign({}, c, { retention: 'bands' }) : Object.assign({}, c, { retention: 'cage' });
      const v = analyze(Object.assign({}, build, { config: other }), rules, { skipLeak: true, noVariant: true });
      const dW = (g.cage ? wt.total - v.weights.total : v.weights.total - wt.total), dS = g.cage ? req.items.pipe - v.requirements.items.pipe : v.requirements.items.pipe - req.items.pipe;
      const maxW = (rules && rules.max_boat_weight_lb) || 150;
      if (g.cage) recs.push({ level: 'info', title: `Drums are trapped between two frames (+${dW.toFixed(0)} lb, +${dS} stick${dS === 1 ? '' : 's'} vs zip-tie bands)`,
        detail: `Posts meet the deck frame at beam joints where they line up (use side-outlet tees there) and are spliced into the rail elsewhere. Nothing can slip out even if ties break, and you don't need long straps around the drums (the 18" securing rule). The lower frame sits ${Math.max(0, -g.lowestY).toFixed(1)}" below the drums and can catch rocks in shallow water.${c.cageStyle === 'single' ? ' With a single lower rail a drum can still rock sideways, so snug it with short ties to the posts.' : ''}` });
      else recs.push({ level: 'info', title: `Option: trap the drums in a second frame (+${dW.toFixed(0)} lb, +${dS} stick${dS === 1 ? '' : 's'})`,
        detail: `A lower PVC ${c.cageStyle === 'single' ? 'rail' : 'cradle'} joined by posts to the deck frame holds each drum, so no long drum straps are needed.${wt.total + dW >= maxW ? ` But it would put this layout at ${(wt.total + dW).toFixed(0)} lb, over the ${maxW} lb limit.` : ` Weight would be ${(wt.total + dW).toFixed(0)} lb.`} Configure → Drum retention.` });
    }
    const placement = opts.skipLeak ? null : bestPlacement(build, g);
    if (placement) {
      const pos = d => drumLabel(g, d).replace(/^Drum \d+ \((.*)\)$/, '$1');
      const ownMoves = placement.moves.filter(m => Array.isArray(c.drumSpecs) && c.drumSpecs[m.from]);
      const list = (ownMoves.length ? ownMoves : placement.moves).map(m => {
        const sp = g.drums[m.from].spec;
        return `the ${sp.dia}" × ${sp.len}" drum from ${pos(g.drums[m.from])} to ${pos(g.drums[m.to])}`;
      }).join('; ');
      recs.push({ level: 'warn', title: 'Moving a drum would float the boat more level', detail: `Put ${list}. Trim + heel drops from ${placement.current.toFixed(1)}° to ${placement.best.toFixed(1)}°. Use "Apply suggested placement" under Drums.` });
    }
    const shopping = shoppingList(build, req, opts.catalog, rules, { zip: opts.zip, suppliers: opts.suppliers, geometry: g });
    const eng = engineering(build, g, sol, items, req);
    eng.structure.filter(s => s.level !== 'ok').forEach(s => recs.push({ level: s.level, title: `Structure: ${s.name}: safety factor ${s.sf.toFixed(1)}`, detail: `${s.detail} Target ${SF_OK} or more. Shorten the span, add a support or a second pipe, or a fitting in the middle.` }));
    if (eng.buoyancy && eng.buoyancy.emergency < eng.buoyancy.structure) recs.push({ level: 'warn', title: 'The wreck may not float without the drums', detail: `Foam in the deck, noodles and pipes lifts about ${eng.buoyancy.emergency.toFixed(0)} lb; the structure without drums weighs about ${eng.buoyancy.structure.toFixed(0)} lb. Add foam (rules: everything must float, even broken).` });
    const result = { placement, shopping, geometry: g, requirements: req, weights: wt, solution: sol, scenarios: { crewForward: fwd, crewSide: side, leaks }, rules: rulesOut, recommendations: recs, cost, spent, crewWeight: crewW, engineering: eng };
    result.issues = issueMarkers(result);
    return result;
  }

  function recommend(a) {
    const { build, g, req, wt, sol, fwd, side, leaks, rulesOut, crewW } = a;
    const c = g.config, out = [];
    const add = (level, title, detail) => out.push({ level, title, detail });
    rulesOut.filter(x => x.level === 'error' || x.level === 'warn').forEach(x => add(x.level, x.title, x.detail));
    const seen = [];
    g.drums.forEach(d => {
      if (seen.some(x => sameSpec(x, d.spec) && x.gallons === d.spec.gallons)) return; seen.push(d.spec);
      const geoGal = Math.PI * d.r * d.r * d.len / 231;
      if (Math.abs(geoGal - d.spec.gallons) / d.spec.gallons > 0.35) add('warn', `Drum measurements don't match ${d.spec.gallons} gal`, `${d.spec.dia}" × ${d.len}"${g.mixed ? ` (${drumLabel(g, d)})` : ''} holds about ${geoGal.toFixed(0)} gal. Buoyancy uses the measured outside dimensions, so re-check the diameter and length.`);
    });
    if (g.mixed) {
      const big = g.drums.reduce((a2, b2) => (b2.r * b2.r * b2.len > a2.r * a2.r * a2.len ? b2 : a2));
      g.drums.filter(d => d.r * d.r * d.len < big.r * big.r * big.len * 0.98).forEach(d => {
        const lostLb = (drumMaxLb(big.spec) - drumMaxLb(d.spec));
        add('info', `${drumLabel(g, d)} is smaller: ${d.spec.dia}" × ${d.len}"`, `Lashed up to the frame, it rides ${d.y0.toFixed(1)}" higher and gives ~${lostLb.toFixed(0)} lb less lift than the largest drum.`);
      });
    }
    if (g.overlaps.length) add('error', 'Drums overlap', 'Increase pontoon spacing or move the drums apart.');
    if (g.beamsTooShort) add('error', 'Beams are shorter than the outer rail spacing', `Make the frame width at least ${Math.ceil(2 * (g.outerZ + PIPE_R))}" or reduce pontoon spacing.`);
    if (g.drumsOffFrame) add('warn', 'Drums extend past the frame ends', 'Lengthen the rails or center the drums, or the lashing has nothing to hold.');
    if (!sol.ok) {
      add('error', sol.reason === 'sinks' ? `Not enough flotation: ${sol.W.toFixed(0)} lb on ${sol.maxLb.toFixed(0)} lb max` : 'Configuration cannot balance (capsizes)', 'Add drums, reduce crew, or center the load.');
    } else {
      if (sol.loadPct > 80) add('error', `Drums are ${sol.loadPct.toFixed(0)}% submerged by volume`, 'Little reserve for waves. Add a drum or reduce crew.');
      else if (sol.loadPct > 60) add('warn', `Load is ${sol.loadPct.toFixed(0)}% of max buoyancy`, 'Aim for ≤ 50% on Class II–IV water. Add a drum or carry fewer people.');
      else add('ok', `Load is ${sol.loadPct.toFixed(0)}% of max buoyancy`, `Max draft ${sol.maxDraft.toFixed(1)}", with ${(sol.maxLb - sol.W).toFixed(0)} lb reserve.`);
      if (sol.minFreeboard < 3) add('error', `Frame only ${sol.minFreeboard.toFixed(1)}" above the water`, 'The frame will drag and catch waves.');
      else if (sol.minFreeboard < 6) add('warn', `Frame clearance is ${sol.minFreeboard.toFixed(1)}"`, 'Waves will slap the rails. Lighten the boat or add flotation.');
      if (Math.abs(sol.pitchDeg) > 2) {
        const shift = (sol.W * (sol.buoyancyCenterX - sol.xg)) / Math.max(1, crewW);
        add('warn', `Trim ${sol.pitchDeg > 0 ? 'bow-up' : 'bow-down'} ${Math.abs(sol.pitchDeg).toFixed(1)}°`, `Move crew ${shift > 0 ? 'forward' : 'aft'} ~${Math.abs(shift).toFixed(0)}", or shift the drums.`);
      }
      if (Math.abs(sol.rollDeg) > 2) add('warn', `Heel ${Math.abs(sol.rollDeg).toFixed(1)}°`, 'Center the load side to side.');
      if (sol.gmRoll < 0) add('error', `Side-to-side unstable (GM ${sol.gmRoll.toFixed(0)}")`, 'It will roll onto one side. Spread the drums wider.');
      else if (sol.gmRoll < 12) add('warn', `Low side-to-side stability (GM ${sol.gmRoll.toFixed(0)}")`, 'Spread the pontoons wider or lower the crew.');
      if (sol.gmPitch < 0) add('warn', `Fore-aft unstable: see-saws on the drums (GM ${sol.gmPitch.toFixed(0)}")`, `The drums are only ${Math.max(...g.drums.map(d => d.ex * 2)).toFixed(1)}" long fore-aft under a ${c.frameLength}" frame and the crew sits high, so the boat rocks bow-down or stern-down until the frame hits the water. Spread drums fore-aft (Triangle or Pontoon preset), keep the crew low and centered, or shorten the frame.`);
      else if (sol.gmPitch < 12) add('warn', `Low fore-aft stability (GM ${sol.gmPitch.toFixed(0)}")`, 'Spread drums further fore-aft or keep the crew low.');
    }
    if (!fwd.ok || fwd.bowFreeboard < 2) add('warn', 'Nose-dive risk with crew at the bow', !fwd.ok ? 'Moving the crew forward overwhelms the bow.' : `Bow clearance drops to ${fwd.bowFreeboard.toFixed(1)}". Consider the Triangle or Pontoon preset, a drum further forward, or crew seated aft of center.`);
    if (!side.ok || Math.abs(side.rollDeg) > 8) add('warn', 'Leaning crew heels the boat hard', side.ok ? `${Math.abs(side.rollDeg).toFixed(0)}° heel with crew at the deck edge.` : 'Crew at the deck edge capsizes it.');
    const fails = leaks.filter(l => !l.sol.ok);
    if (leaks.length && fails.length) add('warn', `Losing one drum ${fails.length === leaks.length ? 'sinks or capsizes the boat' : 'is unsafe for some drums'}`, 'No redundancy. Seal and test the bung caps, or add a drum. Foam-filled rails and the XPS deck still float the wreck.');
    else if (leaks.length) add('ok', 'Survives losing any one drum', '');
    // parts list vs geometry
    const have = inventory(build.parts);
    const names = { drum: 'drums', pipe: '10 ft pipe sticks', elbow: 'elbows', cross: 'double sani tees (4-way)', tee: 'side-outlet fittings and tees (3-, 4- and 5-way)', coupling: 'couplings', 'zip-tie': 'zip ties', xps: 'XPS sheets (4 x 8 ft, 1" layers)', coroplast: 'Coroplast sheets (4 x 8 ft)', panel: 'side panels (26" x 8 ft)', noodle: 'pool noodles', 'spray-foam': 'spray-foam cans', cement: 'PVC cement kits' };
    Object.entries(req.items).forEach(([role, need]) => {
      const h = have[role] || 0;
      if (need > h && role === 'pipe') {
        const tries = [];
        if (c.mastHeight > 0) tries.push(['without the PVC mast', Object.assign({}, c, { mastHeight: 0 })]);
        if (g.bow) tries.push(['without the bow frame', Object.assign({}, c, { bow: false })]);
        for (const n of [c.beamCount - 1]) if (n >= 2) tries.push([`with ${n} cross beams`, Object.assign({}, c, { beamCount: n })]);
        const fits = tries.filter(([, cfg]) => requirements(geometry(cfg), build.parts).items.pipe <= h).map(([label]) => label);
        add('warn', `Parts list is short ${need - h} ${names[role]}`, `This configuration needs ${need}; the list has ${h}.` + (fits.length ? ` It fits in ${h} ${fits.join(', or ')}.` : ''));
      } else if (role === 'pipe' && need === h) {
        const slack = h * STOCK - req.pipeLength_in - req.cuts.length * KERF;
        if (slack < 24) add('warn', `Pipe fits with only ${slack.toFixed(0)}" to spare`, 'One mis-cut means another 10 ft stick. Measure twice, cut the long pieces first, or buy a spare stick.');
      } else if (need > h) add('warn', `Parts list is short ${+(need - h).toFixed(2)} ${names[role]}`, `This configuration needs ${need}; the list has ${+h.toFixed(2)}.` + (['xps', 'coroplast'].includes(role) ? ' Counted in full 4 x 8 ft sheets (XPS per 1" layer).' : ''));
      else if (h > need + (role === 'zip-tie' ? 100 : 0) && need >= 0 && role !== 'drum') add('info', `${+(h - need).toFixed(2)} spare ${names[role]} on the list`, ['xps', 'coroplast', 'zip-tie'].includes(role) ? 'Leftovers after cutting; only what is used is weighed.' : 'Keep for repairs or trim the list to save weight and cost.');
      else if (role === 'drum' && h > need) add('info', `List has ${h} drums; configuration uses ${need}`, 'Extra drums are not counted in the weight.');
    });
    const max = 150;
    if (wt.total >= max) {
      const cuts = (build.parts || []).filter(p => ['comfort', 'decor'].includes(p.category) && p.quantity > 0)
        .map(p => ({ name: p.name, w: p.quantity * (p.weight_lb_each || 0) })).filter(x => x.w > 0).sort((x, y) => y.w - x.w);
      const need = wt.total - max + 2;
      let got = 0; const pick = [];
      for (const x of cuts) { if (got >= need) break; pick.push(x); got += x.w; }
      if (pick.length) add('info', `To get under ${max} lb, drop ~${need.toFixed(0)} lb`, `Candidates: ${pick.map(x => `${x.name} (${x.w.toFixed(1)} lb)`).join(', ')}${got < need ? '. That is still not enough: shorten the frame or use fewer drums.' : ''}`);
    }
    if (g.fitted) {
      const short = req.cuts.filter(k => k.len < 2);
      if (short.length) add('error', 'Some pipe runs are shorter than 2" between fittings', 'Fittings would touch. Spread the beams or pontoons further apart.');
      add('info', `Cut lengths assume ${c.fittingTakeoff}" fitting take-off`, 'Dry-fit one tee and measure center-to-socket-bottom, then set the take-off to match before cutting.');
    }
    if (wt.measuredShare < 0.5) add('info', `Only ${(wt.measuredShare * 100).toFixed(0)}% of the weight is measured`, 'Weigh parts as they arrive and tick "measured".');
    return out;
  }

  // What the parts list covers, by the roles requirements() asks for.
  // 4-way side-outlet tees and cleanout tees can stand in for plain tees.
  function inventory(parts) {
    const have = {};
    (parts || []).forEach(p => {
      let role = p.role, q = +p.quantity || 0;
      if (role === 'side-tee' || role === 'five-way' || role === 'cleanout-tee') role = 'tee';   // any side-outlet fitting can take a box corner
      if (role === 'zip-tie') q *= +p.pack_count || 100;   // list zip ties in packs
      // sheet goods count in full 4 x 8 ft sheets (XPS in 1" layers), so smaller or thicker boards convert
      if ((role === 'coroplast' || role === 'xps') && +p.sheet_sqft > 0) q *= +p.sheet_sqft / (SHEET.w * SHEET.l / 144);
      if (role === 'xps' && +p.thickness_in > 0) q *= +p.thickness_in;
      have[role] = (have[role] || 0) + q;
    });
    return have;
  }

  // ── Next shopping trip ──
  // What still has to be bought for the configured layout, given what's
  // already marked bought/installed, plus planned extras and a spare stick
  // when the cut list has little margin.
  const DERIVED = ['drum', 'pipe', 'cross', 'tee', 'elbow', 'coupling', 'zip-tie', 'xps', 'coroplast', 'spray-foam', 'cement', 'panel', 'noodle'];
  function shoppingList(build, req, catalog, rules, linkOpts) {
    const parts = build.parts || [];
    const bought = inventory(parts.filter(isBought));
    const items = (catalog && catalog.items) || [];
    const byId = Object.fromEntries(items.map(x => [x.id, x]));
    const info = p => Object.assign({}, byId[p.catalog_id] || {}, p);   // listed part + its catalog details
    const ropeMax = (rules && rules.max_securing_material_length_in) || 18;
    const pick = role => {
      const listed = parts.filter(p => (inventory([p])[role] || 0) > 0);
      const okLen = x => !(role === 'zip-tie' && +x.length_in > ropeMax);
      const fromList = listed.find(okLen);
      if (fromList) return info(fromList);
      const cands = items.filter(x => (inventory([Object.assign({ quantity: 1 }, x)])[role] || 0) > 0 && okLen(x)).sort((a, b) => a.unit_cost_usd - b.unit_cost_usd);
      return cands[0] || (listed[0] ? info(listed[0]) : null);
    };
    const rows = [];
    DERIVED.forEach(role => {
      const need = req.items[role] || 0, have = bought[role] || 0;
      if (need <= have) return;
      const src = pick(role);
      const per = src ? (inventory([Object.assign({}, src, { quantity: 1 })])[role] || 1) : 1;   // ties per pack, sheets per board
      const qty = Math.ceil((need - have) / per - 1e-9);
      rows.push({
        role, name: src ? src.name : role, qty, unit: role === 'zip-tie' ? 'pack' : (src && src.unit) || 'each',
        unitCost: src ? +src.unit_cost_usd || 0 : 0, estimate: !!(src && src.estimate),
        source: src ? src.source || '' : '', priority: 'needed', catalog_id: src && (src.catalog_id || src.id), url: src && src.url,
        why: `Layout needs ${need}${role === 'zip-tie' ? ' ties' : ['xps', 'coroplast'].includes(role) ? ' full 4 x 8 ft sheets' : ''}; ${+have.toFixed(2)} bought.` + (role === 'zip-tie' && parts.some(p => p.role === 'zip-tie' && +p.length_in > ropeMax) ? ` Suggests ties of ${ropeMax}" or less, since the longer ones may break the rule.` : ''),
      });
    });
    const slack = (bought.pipe || 0) * STOCK - req.pipeLength_in - req.cuts.length * KERF;
    if ((bought.pipe || 0) >= req.items.pipe && slack < 24) {
      const src = pick('pipe');
      rows.push({ catalog_id: src && (src.catalog_id || src.id), url: src && src.url, role: 'pipe', name: src ? src.name : 'pipe', qty: 1, unit: 'piece', unitCost: src ? +src.unit_cost_usd || 0 : 0, estimate: false, source: src ? src.source || '' : '', priority: 'spare', why: `Only ${slack.toFixed(0)}" of pipe to spare. A spare stick covers a mis-cut.` });
    }
    parts.filter(p => p.status === 'planned' && !DERIVED.includes(p.role) && !(inventory([p]).tee || inventory([p]).elbow) && (+p.quantity || 0) > 0 && (+p.unit_cost_usd || 0) > 0).forEach(raw => {
      let p = info(raw), why = 'Planned on the parts list, not bought yet.';
      if (SINKS.has(p.material) && !FASTENER_ROLES.has(p.role)) {
        const alt = items.filter(x => x.role === p.role && !SINKS.has(x.material)).sort((a, b) => a.unit_cost_usd - b.unit_cost_usd)[0];
        if (alt) { why = `Swapped for ${alt.name}: ${p.name} may not float.`; p = Object.assign({}, alt, { quantity: p.quantity }); }
        else why += ' May not float: bucket-test it.';
      }
      const priority = p.category === 'tools' ? 'needed' : ['comfort', 'decor', 'finish'].includes(p.category) ? 'optional' : 'needed';
      rows.push({ catalog_id: p.catalog_id || p.id, url: p.url, role: p.role, name: p.name, qty: +p.quantity, unit: p.unit || 'each', unitCost: +p.unit_cost_usd || 0, estimate: !!p.estimate, source: p.source || '', priority, why });
    });
    parts.filter(p => p.status === 'suggested' && (+p.quantity || 0) > 0).forEach(p => rows.push({ catalog_id: p.catalog_id, url: p.url, role: p.role, name: p.name, qty: +p.quantity, unit: p.unit || 'each', unitCost: +p.unit_cost_usd || 0, estimate: !!p.estimate, source: p.source || '', priority: 'optional', why: 'Suggested, not on the plan yet.' }));
    (decalPlan(build.config, linkOpts && linkOpts.geometry) || []).forEach(d => {
      if (parts.some(p => p.name === d.name)) return;          // already on the list (its own row covers it)
      rows.push({ role: 'decal', name: d.name, qty: d.qty, unit: d.unit, unitCost: d.price, estimate: true, source: '', priority: 'optional', why: `For the decals placed in the 3D view: ${[...new Set(d.why)].join(', ')}.` });
    });
    rows.forEach(r => { r.cost = r.qty * r.unitCost; r.links = storeLinks(r, linkOpts); });
    const order = { needed: 0, spare: 1, optional: 2 };
    rows.sort((a, b) => order[a.priority] - order[b.priority]);
    const sum = pr => rows.filter(r => pr.includes(r.priority)).reduce((t, r) => t + r.cost, 0);
    return { rows, neededCost: sum(['needed']), totalCost: sum(['needed', 'spare', 'optional']) };
  }

  // ── Store links ──
  // Product searches at Home Depot and Lowe's, and "near ZIP" map searches for
  // stores and local suppliers. Live stock isn't available to us; each store
  // site shows in-store availability once you pick your store there.
  const LOCAL_QUERY = {
    drum: 'reconditioned 55 gallon plastic drums', pipe: 'plumbing supply', tee: 'plumbing supply', cross: 'plumbing supply',
    elbow: 'plumbing supply', coupling: 'plumbing supply', cement: 'plumbing supply', 'side-tee': 'furniture grade PVC fittings', 'five-way': 'furniture grade PVC fittings',
    coroplast: 'corrugated plastic sheet supplier', 'zip-tie': 'Harbor Freight', epoxy: 'Harbor Freight', sealant: 'Harbor Freight',
    tool: 'Harbor Freight', rope: 'Tractor Supply', paint: 'craft store', fabric: 'craft store',
  };
  const cleanQuery = name => String(name || '')
    .replace(/\([^)]*\)/g, ' ').replace(/(\d)"/g, '$1 in').replace(/"/g, ' ')
    .replace(/\b(x|×)\b/g, 'x').replace(/\s+/g, ' ').trim();
  function storeLinks(item, opts) {
    opts = opts || {};
    const q = cleanQuery(item.name);
    const zip = /^\d{5}$/.test(String(opts.zip || '').trim()) ? String(opts.zip).trim() : '';
    const maps = text => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`;
    const url = item.url || '';
    const links = [
      { label: 'Home Depot', url: /homedepot\.com\/p\//.test(url) ? url : `https://www.homedepot.com/s/${encodeURIComponent(q)}` },
      { label: "Lowe's", url: /lowes\.com\/pd\//.test(url) ? url : `https://www.lowes.com/search?searchTerm=${encodeURIComponent(q)}` },
    ];
    if (item.role === 'decal') links.push({ label: 'Amazon', url: `https://www.amazon.com/s?k=${encodeURIComponent(q)}` });
    if (zip) {
      links.push({ label: `Home Depot near ${zip}`, url: maps(`Home Depot near ${zip}`), kind: 'store' });
      links.push({ label: `Lowe's near ${zip}`, url: maps(`Lowe's near ${zip}`), kind: 'store' });
    }
    const id = item.catalog_id || item.id;
    (opts.suppliers || []).filter(sp => (sp.covers_part_ids || []).includes(id)).slice(0, 2).forEach(sp => {
      links.push({ label: sp.name, url: zip ? maps(`${sp.name} near ${zip}`) : (sp.website || maps(sp.name)), kind: 'local' });
    });
    const local = LOCAL_QUERY[item.role];
    if (zip && local) links.push({ label: `${local} near ${zip}`, url: maps(`${local} near ${zip}`), kind: 'local' });
    return links;
  }

  // Fit the frame to a layout: long enough to hold every drum, wide enough
  // for the outer rails. Used by the comparison and when switching layouts.
  function fitFrame(cfg) {
    const out = Object.assign({}, cfg);
    for (let k = 0; k < 2; k++) {
      const g = geometry(out);
      const needL = Math.ceil(2 * Math.max(...g.drums.map(d => Math.abs(d.x) + d.ex)) / 2) * 2;
      if (needL > out.frameLength) out.frameLength = Math.min(120, needL);
      if (g.beamsTooShort) out.frameWidth = Math.min(110, Math.ceil(2 * (g.outerZ + PIPE_R) / 2) * 2);
    }
    return out;
  }

  // Compare every layout with the team's parts, crew and drums, and spell
  // out the tradeoffs in plain words.
  function comparePresets(build, rules, opts) {
    opts = opts || {};
    const max = (rules && rules.max_boat_weight_lb) || 150;
    const bought = inventory((build.parts || []).filter(isBought));
    const rows = Object.keys(PRESETS).map(id => {
      const P = PRESETS[id];
      const cfg = fitFrame(Object.assign({}, build.config, { preset: id, drums: undefined, failedDrum: null }));
      const b2 = Object.assign({}, build, { config: cfg });
      const parts = (build.parts || []).map(p => p.role === 'drum' ? Object.assign({}, p, { quantity: Math.max(+p.quantity || 0, P.drums) }) : p);
      const a = analyze(Object.assign({}, b2, { parts }), rules, { catalog: opts.catalog });
      const s = a.solution, g = a.geometry;
      const fwd = a.scenarios.crewForward;
      // the same layout with the other drum retention (bands vs cage)
      let variant = null;
      if (!g.boxes && g.drums.every(d => d.axis === 'x')) {
        const vcfg = Object.assign({}, cfg, { retention: g.cage ? 'bands' : 'cage' });
        const va = analyze(Object.assign({}, b2, { parts, config: vcfg }), rules, { skipLeak: true, noVariant: true });
        variant = { retention: vcfg.retention, weight: va.weights.total, sticks: va.requirements.items.pipe, gmRoll: va.solution.gmRoll, gmPitch: va.solution.gmPitch, ok: va.solution.ok };
      }
      // the same layout built as box frames (each drum in its own box), or back on a deck frame
      const bcfg = Object.assign({}, cfg, { frameStyle: g.boxes ? (build.config.frameStyle === 'boxes' ? 'fitted' : build.config.frameStyle) : 'boxes' });
      const ba = analyze(Object.assign({}, b2, { parts, config: bcfg }), rules, { skipLeak: true, noVariant: true });
      const boxVariant = { boxes: !g.boxes, weight: ba.weights.total, sticks: ba.requirements.items.pipe, gmRoll: ba.solution.gmRoll, gmPitch: ba.solution.gmPitch, ok: ba.solution.ok };
      return {
        id, label: P.label, blurb: P.blurb, drums: P.drums, config: { frameLength: cfg.frameLength, frameWidth: cfg.frameWidth },
        weight: a.weights.total, ok: s.ok, loadPct: s.loadPct, maxDraft: s.maxDraft, gmRoll: s.gmRoll, gmPitch: s.gmPitch,
        reserve: s.ok ? s.maxLb - s.W : 0,
        bowFwd: fwd.ok ? fwd.bowFreeboard : -Infinity,
        survivesLeak: a.scenarios.leaks.every(l => l.sol.ok),
        drumsNeeded: Math.max(0, P.drums - (bought.drum || 0)),
        sticks: a.requirements.items.pipe, sticksNeeded: Math.max(0, a.requirements.items.pipe - (bought.pipe || 0)),
        size: g.overall,
        costToFinish: a.shopping.neededCost,
        errors: a.rules.filter(x => x.level === 'error').length + a.recommendations.filter(x => x.level === 'error').length,
        strengths: P.strengths, weaknesses: P.weaknesses, caged: g.cage, boxes: !!g.boxes, variant, boxVariant,
      };
    });
    const lightest = Math.min(...rows.map(r => r.weight));
    const cheapest = Math.min(...rows.map(r => r.costToFinish));
    rows.forEach(r => {
      const pros = [], cons = [];
      if (!r.ok) cons.push('Does not float with this crew');
      if (r.weight >= max) cons.push(`${r.weight.toFixed(0)} lb: over the ${max} lb limit`);
      else if (r.weight - lightest < 1) pros.push(`Lightest option: ${r.weight.toFixed(0)} lb`);
      else if (max - r.weight < 10) cons.push(`${r.weight.toFixed(0)} lb: only ${(max - r.weight).toFixed(0)} lb under the limit`);
      else pros.push(`${r.weight.toFixed(0)} lb, ${(max - r.weight).toFixed(0)} lb under the limit`);
      if (r.ok) {
        if (r.gmPitch < 0) cons.push(`Rocks fore and aft (pitch GM ${r.gmPitch.toFixed(0)}")`);
        else if (r.gmPitch >= 24) pros.push(`Steady fore and aft (pitch GM ${r.gmPitch.toFixed(0)}")`);
        if (r.gmRoll < 12) cons.push(`Tippy side to side (roll GM ${r.gmRoll.toFixed(0)}")`);
        else if (r.gmRoll >= 60) pros.push(`Very steady side to side (roll GM ${r.gmRoll.toFixed(0)}")`);
        if (r.loadPct > 60) cons.push(`Sits deep: ${r.loadPct.toFixed(0)}% of lift used, ${r.maxDraft.toFixed(1)}" draft`);
        else if (r.loadPct <= 35) pros.push(`Rides high: ${r.loadPct.toFixed(0)}% of lift used, ${r.maxDraft.toFixed(1)}" draft`);
        if (!isFinite(r.bowFwd) || r.bowFwd < 2) cons.push('Nose-dives if the crew shift forward');
        else if (r.bowFwd >= 6) pros.push(`Bow stays ${r.bowFwd.toFixed(0)}" clear with the crew forward`);
      }
      (r.survivesLeak ? pros : cons).push(r.survivesLeak ? 'Still floats if any one drum leaks' : 'Losing one drum can sink or capsize it');
      if (r.drumsNeeded) cons.push(`Needs ${r.drumsNeeded} more drum${r.drumsNeeded > 1 ? 's' : ''} than you have`);
      else pros.push(`Uses drums you already have (${r.drums})`);
      if (r.sticksNeeded) cons.push(`Needs ${r.sticksNeeded} more 10 ft pipe stick${r.sticksNeeded > 1 ? 's' : ''} (${r.sticks} total)`);
      else pros.push(`Cut list fits the pipe you bought (${r.sticks} sticks)`);
      if (r.costToFinish - cheapest < 1) pros.push(`Cheapest to finish: ~$${r.costToFinish.toFixed(0)} more`);
      if (r.boxes) pros.push('Each drum boxed in: no straps, and no separate deck frame');
      else if (r.caged) pros.push('Drums trapped in a second frame: no long straps needed');
      const v = r.variant;
      if (v) {
        const dW = v.weight - r.weight, dS = v.sticks - r.sticks;
        r.retentionNote = v.retention === 'cage'
          ? `Caged instead of strapped: ${v.weight.toFixed(0)} lb (+${dW.toFixed(0)}), ${v.sticks} sticks (+${dS})${v.weight >= max ? `, over the ${max} lb limit` : ''}. Drums can't slip out, and no long straps are needed.`
          : `Strapped instead of caged: ${v.weight.toFixed(0)} lb (${dW.toFixed(0)}), ${v.sticks} sticks (${dS}). Lighter, but relies on drum straps.`;
      }
      const bv = r.boxVariant;
      if (bv) {
        const dW = bv.weight - r.weight, dS = bv.sticks - r.sticks, sgn = x => (x >= 0 ? '+' : '') + x.toFixed(0);
        r.boxNote = bv.boxes
          ? `As box frames (each drum in its own box, no deck frame): ${bv.weight.toFixed(0)} lb (${sgn(dW)}), ${bv.sticks} sticks (${sgn(dS)})${bv.weight >= max ? `, over the ${max} lb limit` : ''}. Drums are trapped and the boxes carry the deck.`
          : `On a deck frame instead of boxes: ${bv.weight.toFixed(0)} lb (${sgn(dW)}), ${bv.sticks} sticks (${sgn(dS)}).`;
      }
      r.pros = pros; r.cons = cons;
    });
    return rows;
  }

  // Rank layouts by what the team cares about most. Hard limits (over the
  // weight limit, sinking, rule errors) always rank last.
  const PRIORITIES = {
    balanced: { label: 'Balanced', w: { stab: 1, leak: 1, weight: 0.6, owned: 0.6, cost: 0.4 } },
    stability: { label: 'Stability in rapids', w: { stab: 2, leak: 1.5, weight: 0.3, owned: 0.3, cost: 0.2 } },
    light: { label: 'Light and easy to carry', w: { stab: 0.6, leak: 0.4, weight: 2, owned: 0.5, cost: 0.4 } },
    owned: { label: 'Use what we already bought', w: { stab: 0.6, leak: 0.4, weight: 0.4, owned: 2, cost: 1 } },
  };
  function rankPresets(rows, priority) {
    const w = (PRIORITIES[priority] || PRIORITIES.balanced).w;
    const clamp01 = v => Math.max(0, Math.min(1, v));
    const scored = rows.map(r => {
      // a boat that tips over one way is a real problem, not just a lower score
      const stab = r.ok ? (clamp01((r.gmPitch + 10) / 70) + clamp01(r.gmRoll / 80) + clamp01((isFinite(r.bowFwd) ? r.bowFwd : -2) / 8)) / 3
        - (r.gmPitch < 0 ? 0.4 : 0) - (r.gmRoll < 0 ? 0.6 : 0) - (!isFinite(r.bowFwd) || r.bowFwd < 2 ? 0.15 : 0) : 0;
      const weight = clamp01((150 - r.weight) / 50);
      const owned = 1 - clamp01((r.drumsNeeded + r.sticksNeeded) / 4);
      const cost = clamp01(1 - r.costToFinish / 600);
      const blocked = !r.ok || r.weight >= 150 || r.errors > 0;
      const score = blocked ? -1 : w.stab * stab + w.leak * (r.survivesLeak ? 1 : 0) + w.weight * weight + w.owned * owned + w.cost * cost;
      return Object.assign({}, r, { score, blocked });
    });
    return scored.sort((a, b) => b.score - a.score);
  }

  return {
    WATER, DRUM, DRUM_SIZES, drumSpec, drumLabel, PIPE_R, RAIL_OFFSET, PRESETS, DEFAULT_CONFIG, inventory,
    STATUSES, isBought, engineering, PVC, SF_OK, SF_MIN, CONSUMABLE_SHARE, onBoatShare, paintPlan, decalPlan, DECALS, PAINT_LB_PER_SQFT, withDefaults, geometry, requirements, shoppingList, storeLinks, fitFrame, rankPresets, PRIORITIES, weights, massItems, crewPositions, solve, checkRules, analyze, comparePresets,
    segArea, drumMaxLb,
  };
});
