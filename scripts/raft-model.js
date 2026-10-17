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
    preset: 'cat2', frameStyle: 'stacked', retention: 'bands', cageStyle: 'cradle', sidePanels: false, sideStyle: 'hull', hullBow: 18, platform: false, platformSpacing: 16, bowNoodle: false, packGap: 0, boxEndGap: 2, boxSideGap: 1, boxTopGap: 0, fittingTakeoff: 1.25, cutAllowance: 0.5, railsPerPontoon: 2, centerSpine: false, frameLength: 84, frameWidth: 72, beamCount: 4, pontoonSpacing: 47,
    drumOffset: 0, drumSpread: 20, bow: true, bowRiser: 12, bowStrut: 18,
    deck: { length: 72, width: 24, thickness: 2.3 }, mastHeight: 30, noodleRail: true, railing: false, railingHeight: 10, frameNoodles: 0, floodPct: 0, drumNoodles: 0, floodVented: false, extras: [],
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
    const g = buildGeometry(cfgIn);
    g.extras = extrasOf(g.config);
    labelParts(g);
    return g;
  }
  // ── Added parts (edit mode): pieces from the parts list placed by hand ──
  // config.extras = [{ type, at: [x, y, z], axis: 'x'|'y'|'z', len, role, dia, weight }]
  //   pipe / noodle: a cylinder of length len centred on `at` along `axis`
  //   fitting (role elbow, tee, side-tee, five-way, cross, coupling, elbow45, cap): a joint at `at`
  //   drum: a sealed drum centred on `at`, laid along `axis` (x or z)
  // They count toward weight, centre of gravity, flotation, the cut list and the parts used.
  const EXTRA_TYPES = {
    pipe: { label: '1-1/2" PVC pipe', role: 'pipe', len: 24, r: PIPE_R },
    noodle: { label: 'Pool noodle', role: 'noodle', len: NOODLE_L, r: NOODLE_D / 2 },
    fitting: { label: 'Fitting', role: 'tee' },
    drum: { label: 'Drum', role: 'drum' },
  };
  const FITTING_ROLES = ['elbow', 'elbow45', 'tee', 'side-tee', 'five-way', 'cross', 'coupling', 'cap'];
  function extrasOf(c) {
    const list = Array.isArray(c.extras) ? c.extras : [];
    return list.map((x, i) => {
      const t = EXTRA_TYPES[x.type]; if (!t) throw new Error(`added part ${i + 1}: unknown type ${x.type}`);
      const at = (x.at || [0, 0, 0]).map(v => +v || 0), axis = ['x', 'y', 'z'].includes(x.axis) ? x.axis : 'x', ax = { x: 0, y: 1, z: 2 }[axis];
      const out = { id: 'X' + (i + 1), i, type: x.type, role: x.type === 'fitting' ? (FITTING_ROLES.includes(x.role) ? x.role : 'tee') : t.role, at, axis };
      if (x.type === 'pipe' || x.type === 'noodle') {
        out.len = Math.max(1, +x.len || t.len); out.r = t.r;
        out.a = at.slice(); out.b = at.slice(); out.a[ax] -= out.len / 2; out.b[ax] += out.len / 2;
      } else if (x.type === 'drum') {
        const sp = drumSpec(c, 0); out.axis = axis === 'z' ? 'z' : 'x';
        out.r = (+x.dia || sp.dia) / 2; out.len = +x.len || sp.len; out.weight = +x.weight || sp.weight;
        const k = out.axis === 'z' ? 2 : 0; out.a = at.slice(); out.b = at.slice(); out.a[k] -= out.len / 2; out.b[k] += out.len / 2;
      }
      return out;
    });
  }

  // ── Part IDs: a short label on every pipe, joint and part, to reference in conversation ──
  // P = pipe, J = joint (fitting), L = lashing (platform pipe tied onto a box rail), D = drum,
  // S = side panel, N = pool noodle, K = deck, M = mast, C = crew.
  // Numbered by position, bow first, then top to bottom, then port to starboard, so the
  // same design always gets the same labels. Changing the design renumbers them.
  const r1 = v => Math.round(v * 10) / 10;
  const byPlace = (pa, pb) => r1(pb[0]) - r1(pa[0]) || r1(pb[1]) - r1(pa[1]) || r1(pa[2]) - r1(pb[2]);
  function labelParts(g) {
    const pipes = [];
    const addPipe = (kind, a, b, ref, drum) => pipes.push({ kind, a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), drum, ref });
    (g.cagePieces || []).forEach(pc => addPipe(pc.kind, pc.a, pc.b, pc, pc.drum));
    (g.rails || []).forEach(rl => addPipe('rail', [rl.x0, g.railY, rl.z], [rl.x1, g.railY, rl.z], rl));
    (g.beams || []).forEach((x, i) => addPipe('beam', [x, g.beamY, -g.frameWidth / 2], [x, g.beamY, g.frameWidth / 2], { beam: i }));
    const mid = q => q.a.map((v, k) => (v + q.b[k]) / 2);
    pipes.sort((p, q) => byPlace(mid(p), mid(q)));
    pipes.forEach((q, i) => { q.id = 'P' + (i + 1); q.ref.id = q.id; });
    // joints: every point where pipe ends meet, or a pipe end lands partway along another pipe
    const key = pt => pt.map(v => v.toFixed(1)).join(','), nodes = new Map();
    pipes.forEach(q => [q.a, q.b].forEach(pt => { if (!nodes.has(key(pt))) nodes.set(key(pt), { at: pt.slice(), dirs: [], pipes: [] }); }));
    nodes.forEach(nd => pipes.forEach(q => {
      const d = q.b.map((v, k) => v - q.a[k]), L2 = d.reduce((t, v) => t + v * v, 0), t = nd.at.reduce((s2, v, k) => s2 + (v - q.a[k]) * d[k], 0) / L2;
      const off = Math.hypot(...nd.at.map((v, k) => v - (q.a[k] + t * d[k]))), L = Math.sqrt(L2);
      if (off > 0.1 || t * L < -0.1 || (1 - t) * L < -0.1) return;
      const u = d.map(v => v / L);
      if (t * L < 0.1) nd.dirs.push(u); else if ((1 - t) * L < 0.1) nd.dirs.push(u.map(v => -v)); else nd.dirs.push(u, u.map(v => -v));
      nd.pipes.push(q.id);
    }));
    const joints = [...nodes.values()].filter(nd => nd.dirs.length >= 2).sort((p, q) => byPlace(p.at, q.at));
    joints.forEach((nd, i) => {
      nd.id = 'J' + (i + 1); nd.ways = nd.dirs.length;
      if (nd.ways === 2) { const dot = nd.dirs[0].reduce((t, v, k) => t + v * nd.dirs[1][k], 0), deg = Math.round(Math.acos(Math.max(-1, Math.min(1, -dot))) * 180 / Math.PI);
        nd.type = deg < 2 ? 'coupling' : `${180 - deg}° elbow`; }
      else nd.type = `${nd.ways}-way`;
      delete nd.dirs;
    });
    const drums = g.drums.map(d => ({ id: 'D' + (d.id + 1), drum: d.id, at: [d.x, d.y0 + d.r, d.z] }));
    const panels = (g.sidePanels || []).map((sp, i) => ({ id: 'S' + (i + 1), i, at: sp.hull ? [(g.hull.xs + g.hull.tip) / 2, (sp.y0 + sp.y1) / 2, 0] : [(sp.a[0] + sp.b[0]) / 2, (sp.y0 + sp.y1) / 2, (sp.a[2] + sp.b[2]) / 2] }));
    (g.sidePanels || []).forEach((sp, i) => { sp.id = panels[i].id; });
    const c = g.config, others = [{ id: 'K1', kind: 'deck', at: [0, g.deckTop, 0] }];
    if (c.mastHeight > 0) others.push({ id: 'M1', kind: 'mast', at: [c.deck.length / 2 - 8, g.deckTop + c.mastHeight / 2, 0] });
    crewPositions(c, c.crew).forEach((p, i) => others.push({ id: 'C' + (i + 1), kind: 'crew', i, at: [p.x, g.deckTop + 20, p.z] }));
    const noodles = [];
    if (g.platform) { const pl = g.platform; let n = 0;
      for (let k = 0; k < pl.bays; k++) for (let j = 0; j < pl.across; j++) noodles.push({ id: 'N' + (++n), bay: k, row: j, at: [(pl.xs[k] + pl.xs[k + 1]) / 2, pl.y, -pl.W / 2 + PIPE_R + 1.25 + j * 2.5 + ((pl.W - 2 * PIPE_R) - pl.across * 2.5) / 2] }); }
    if (g.bowNoodle) noodles.unshift({ id: 'N0', bow: true, at: [g.hull ? g.hull.tip : 0, g.bowNoodle.y, 0] });
    if (c.noodleRail) [-1, 1].forEach((sd, i) => noodles.push({ id: 'NR' + (i + 1), rail: sd, at: [0, g.deckTop + 1.25, sd * (c.deck.width / 2 - 1.25)] }));
    if (g.frameNoodles) { let n = 0; g.frameNoodles.runs.forEach(rn => { for (let k = 0; k < g.frameNoodles.layers; k++) noodles.push({ id: 'NF' + (++n), frame: true, at: [(rn.x0 + rn.x1) / 2, rn.y + (k - (g.frameNoodles.layers - 1) / 2) * 2.5 + 1.25, rn.z + rn.side * (PIPE_R + 1.25)] }); }); }
    const lashings = ((g.platform && g.platform.lashings) || []).slice().sort((p, q) => byPlace(p.at, q.at)).map((l, i) => {
      l.id = 'L' + (i + 1);
      return { id: l.id, at: l.at, joins: [l.platformPiece.id, l.boxPiece.id] };
    });
    const extras = (g.extras || []).map(x => ({ id: x.id, type: x.type, role: x.role, at: x.at }));
    g.labels = { pipes, joints, drums, panels, noodles, others, lashings, extras };
    return g.labels;
  }

  function buildGeometry(cfgIn) {
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
    // Railing (as built 2026-10-07): posts rise from the outer box corners and top rails run
    // around the outline of all the boxes (the convex hull of their corners in plan), so the
    // rails angle in from the wide rear pair to the narrow bow box. Posts sit in the corner fittings.
    let railing = null;
    if (c.railing && boxes.length) {
      const rh = Math.max(4, +c.railingHeight || 10), ry = topY + rh;
      const pts = [];
      boxes.forEach(b => [[b.x0, b.z0], [b.x0, b.z1], [b.x1, b.z0], [b.x1, b.z1]].forEach(([x, z]) => { if (!pts.some(q => Math.hypot(q[0] - x, q[1] - z) < 0.5)) pts.push([x, z, b.yt]); }));
      const cross = (o, a, b2) => (a[0] - o[0]) * (b2[1] - o[1]) - (a[1] - o[1]) * (b2[0] - o[0]);
      const sorted = pts.slice().sort((a, b2) => a[0] - b2[0] || a[1] - b2[1]), lower = [], upper = [];
      sorted.forEach(q => { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 1e-9) lower.pop(); lower.push(q); });
      sorted.slice().reverse().forEach(q => { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 1e-9) upper.pop(); upper.push(q); });
      const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
      hull.forEach(([x, z, y]) => add('rpost', [x, y, z], [x, ry, z], -1));
      hull.forEach(([x, z], i) => { const [x2, z2] = hull[(i + 1) % hull.length]; add('railing', [x, ry, z], [x2, ry, z2], -1); });
      railing = { y: ry, height: rh, outline: hull.map(([x, z]) => [x, z]) };
    }
    // Pool noodles zip-tied along the fore-aft box top rails (as built), N layers per rail
    let frameNoodles = null;
    const nl = Math.max(0, Math.round(+c.frameNoodles || 0));
    if (nl) {
      const runs = pieces.filter(pc => pc.kind === 'top' && Math.abs(pc.a[1] - pc.b[1]) < 0.1 && Math.abs(pc.a[0] - pc.b[0]) > Math.abs(pc.a[2] - pc.b[2]))
        .flatMap(pc => {
          const x0 = Math.min(pc.a[0], pc.b[0]), x1 = Math.max(pc.a[0], pc.b[0]), z = pc.a[2];
          // a noodle row on the inside of each box this rail belongs to (both sides of a shared wall)
          const sides = boxes.filter(b => b.x0 <= x0 + 0.5 && b.x1 >= x1 - 0.5 && (Math.abs(b.z0 - z) < 0.5 || Math.abs(b.z1 - z) < 0.5)).map(b => Math.abs(b.z0 - z) < 0.5 ? 1 : -1);
          return [...new Set(sides)].map(side => ({ x0, x1, y: pc.a[1], z, side }));
        });
      const len = runs.reduce((t, r) => t + (r.x1 - r.x0), 0) * nl;
      frameNoodles = { layers: nl, runs, length: len, count: Math.ceil(len / NOODLE_L) };
    }
    pieces.forEach(pc => { pc.len = Math.hypot(pc.b[0] - pc.a[0], pc.b[1] - pc.a[1], pc.b[2] - pc.a[2]); });
    // How the platform is joined: it rests one pipe diameter above the box top rails, so it
    // can't share their fittings. Every place a platform pipe crosses a box top rail (or a
    // top link) it sits on, the two pipes are lashed together with zip ties.
    if (platform) {
      const flat = pc => Math.abs(pc.a[1] - pc.b[1]) < 0.1, along = pc => Math.abs(pc.a[0] - pc.b[0]) > Math.abs(pc.a[2] - pc.b[2]) ? 'x' : 'z';
      const lo = (pc, k) => Math.min(pc.a[k], pc.b[k]), hi = (pc, k) => Math.max(pc.a[k], pc.b[k]);
      const under = pieces.filter(pc => (pc.kind === 'top' || pc.kind === 'link') && flat(pc) && Math.abs(pc.a[1] + 2 * PIPE_R - platY) < 0.5);
      platform.lashings = [];
      pieces.filter(pc => pc.kind === 'platform').forEach(pp => under.forEach(bp => {
        if (along(pp) === along(bp)) return;   // parallel pipes never cross
        const [xp, zp] = along(pp) === 'x' ? [null, pp.a[2]] : [pp.a[0], null], [xb, zb] = along(bp) === 'x' ? [null, bp.a[2]] : [bp.a[0], null];
        const x = xp ?? xb, z = zp ?? zb;
        if (x < lo(pp, 0) - 0.1 || x > hi(pp, 0) + 0.1 || z < lo(pp, 2) - 0.1 || z > hi(pp, 2) + 0.1) return;
        if (x < lo(bp, 0) - 0.1 || x > hi(bp, 0) + 0.1 || z < lo(bp, 2) - 0.1 || z > hi(bp, 2) + 0.1) return;
        if (platform.lashings.some(l => Math.hypot(l.at[0] - x, l.at[2] - z) < 0.5)) return;
        platform.lashings.push({ at: [x, platY - PIPE_R, z], platformPiece: pp, boxPiece: bp });
      }));
    }
    const xsAll = boxes.flatMap(b => [b.x0, b.x1]).concat(hull ? [hull.tip] : []), zsAll = boxes.flatMap(b => [b.z0, b.z1]);
    const L = 2 * Math.max(...xsAll.map(Math.abs)), outerZ = Math.max(...zsAll.map(Math.abs));
    c.frameLength = Math.round(L);                       // used for freeboard corners
    const mastTop = c.mastHeight > 0 ? deckTop + c.mastHeight : deckTop;
    const wallTop = Math.max(c.noodleRail ? deckTop + 2.5 : 0, railing ? railing.y + PIPE_R : 0);
    const overlaps = [];
    for (let i = 0; i < drums.length; i++) for (let j = i + 1; j < drums.length; j++) {
      const a = drums[i], b = drums[j];
      if (Math.abs(a.z - b.z) < a.ez + b.ez && Math.abs(a.x - b.x) < a.ex + b.ex) overlaps.push([i, j]);
    }
    return {
      platform, railing, frameNoodles, bowNoodle: hull && c.bowNoodle ? bowNoodleShape(hull, topY) : null,
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
  // Pipes are cut a little long (cut = fit length + allowance) and trimmed after a dry fit:
  // once glued and hammered home, a joint seats deeper or shallower than planned.
  function binPack(cutsIn, allowance) {
    const a = Math.max(0, +allowance || 0);
    const cuts = cutsIn.map(k => Object.assign(k, { cut: +(k.len + a).toFixed(2) }));
    // Best-fit decreasing on the cut length, then a few randomized restarts to squeeze out a stick.
    const run = order => {
      const sticks = [];
      order.forEach(cut => {
        let best = null;
        for (const st of sticks) if (st.left >= cut.cut + KERF && (!best || st.left < best.left)) best = st;
        if (best) { best.cuts.push(cut); best.left -= cut.cut + KERF; }
        else sticks.push({ cuts: [cut], left: STOCK - cut.cut });
      });
      return sticks;
    };
    const sorted = [...cuts].sort((p, q) => q.cut - p.cut);
    let best = run(sorted);
    const lower = Math.ceil(cuts.reduce((t, k) => t + k.cut, 0) / STOCK);
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 400 && best.length > lower; i++) {
      const o = sorted.map(k => [k, k.cut * (0.85 + rand() * 0.3)]).sort((p, q) => q[1] - p[1]).map(x => x[0]);
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
    const noodles = { platform: pl ? Math.ceil(pl.bays * pl.across / perNoodle) : 0, bow: g.bowNoodle ? 1 : 0, rail: c.noodleRail ? 2 * Math.ceil(c.deck.length / NOODLE_L) : 0, frame: g.frameNoodles ? g.frameNoodles.count : 0 };
    noodles.total = noodles.platform + noodles.bow + noodles.rail + noodles.frame;
    req.noodles = noodles; if (noodles.total) req.items.noodle = noodles.total;
    if (extra) { req.extraTies = extra; req.tieCount += extra; req.items['zip-tie'] = Math.ceil(req.tieCount * 1.15); }
    const ex = g.extras || [];
    if (ex.length) {
      req.extras = {};
      ex.forEach(x => {
        req.extras[x.role] = (req.extras[x.role] || 0) + 1;
        if (x.type === 'pipe') req.cuts.push({ id: x.id, label: 'added pipe', len: +x.len.toFixed(2) });
        else if (x.type === 'noodle') { req.noodles.extra = (req.noodles.extra || 0) + Math.ceil(x.len / NOODLE_L); req.noodles.total += Math.ceil(x.len / NOODLE_L); }
        else if (x.type === 'drum') req.items.drum = (req.items.drum || 0) + 1;
        else { const k = USED_ROLES[x.role] || x.role; req.items[k] = (req.items[k] || 0) + 1; }
      });
      if (ex.some(x => x.type === 'pipe')) { req.sticks = binPack(req.cuts, g.config.cutAllowance); req.items.pipe = req.sticks.length; req.pipeLength_in = req.cuts.reduce((t, k) => t + k.len, 0); }
      if (req.noodles.total) req.items.noodle = req.noodles.total;
    }
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
        for (let j = 0; j < pts.length - 1; j++) cuts.push({ id: `${rl.id}.${j + 1}`, label: `rail ${i + 1}.${j + 1}`, len: +(pts[j + 1] - pts[j] - 2 * k).toFixed(2) });
      });
      xs.forEach((x, i) => { for (let j = 0; j < zs.length - 1; j++) cuts.push({ id: `${(g.labels.pipes.find(q => q.ref.beam === i) || {}).id}.${j + 1}`, label: `beam ${i + 1}.${j + 1}`, len: +(zs[j + 1] - zs[j] - 2 * k).toFixed(2) }); });
      xs.forEach((x, bi) => zs.forEach((z, ri) => {
        const endB = bi === 0 || bi === xs.length - 1, endR = ri === 0 || ri === zs.length - 1;
        const bowCorner = g.bow && bi === xs.length - 1 && endR;   // riser leaves the front corners
        if (endB && endR) bowCorner ? fit.tee++ : fit.elbow++;
        else if (endB || endR) fit.tee++;
        else fit.cross++;
      }));
      if (g.bow) fit.elbow += 4;
    } else {
      g.rails.forEach((rl, i) => cuts.push({ id: rl.id, label: `rail ${i + 1}`, len: c.frameLength }));
      g.beams.forEach((_, i) => cuts.push({ id: (g.labels.pipes.find(q => q.ref.beam === i) || {}).id, label: `beam ${i + 1}`, len: c.frameWidth }));
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
      g.cagePieces.forEach(pc => cuts.push({ id: pc.id, label: `cage ${pc.drum + 1} ${pc.kind}`, len: +(pc.len - 2 * k).toFixed(2), cage: true }));
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
    const sticks = binPack(cuts, c.cutAllowance);
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

  // A crossing of two 1-1/2" pipes is cross-lashed with two ties in an X. Each tie goes around both
  // pipes: a loop of about (2 + π)·OD = 9.8" plus ~2" for the head and tail, so it needs a 12" tie or
  // longer (and at most 18" by the rules, trimmed flush).
  const PLATFORM_TIES_PER_CROSSING = 2, LASH_TIE_MIN_IN = Math.ceil((2 + Math.PI) * 1.9 + 2);
  function boxRequirements(g) {
    const c = g.config, k = c.fittingTakeoff || 0;
    const cuts = g.cagePieces.map(pc => ({ id: pc.id, label: pc.drum < 0 ? pc.kind : `box ${pc.drum + 1} ${pc.kind}`, len: +(pc.len - 2 * k).toFixed(2), cage: true }));
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
    const sticks = binPack(cuts, c.cutAllowance);
    const pipeLen = cuts.reduce((t, x) => t + x.len, 0), cageLen = cuts.filter(x => x.cage).reduce((t, x) => t + x.len, 0);
    const sides = g.sidePanels || [], panels = sides.length ? panelPack(sides) : [];
    const sideTies = sides.reduce((t, sp) => t + 2 * (Math.ceil(sp.len / 18) + 1), 0);   // panel tied to the top and bottom rails about every 18"
    const lashings = g.platform ? (g.platform.lashings || []).length : 0, lashTies = PLATFORM_TIES_PER_CROSSING * lashings;
    const ties = 16 + (c.mastHeight > 0 ? 6 : 0) + sideTies + lashTies;   // deck tie-downs, mast, side panels, platform lashings; drums need no bands
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
      tieCount: ties, tieLength: 17, fourWay: fit.four, platformLashings: lashings, platformLashTies: lashTies,
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
    const drumW = g.drums.reduce((t, d) => t + d.spec.weight, 0) + (g.extras || []).filter(x => x.type === 'drum').reduce((t, x) => t + x.weight, 0);
    const drumEach = drumW / Math.max(1, g.drums.length + (g.extras || []).filter(x => x.type === 'drum').length);
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

  // weight of each added part: a listed part's weight per piece (per inch for pipe), else a typical weight
  function extraWeights(build, g) {
    const parts = boatParts(build.parts), TYPICAL = { pipe: 5.1, noodle: 0.3, elbow: 0.2, elbow45: 0.15, tee: 0.35, 'side-tee': 0.3, 'five-way': 0.4, cross: 0.45, coupling: 0.15, cap: 0.08 };
    const each = role => { const p = parts.find(q => q.role === role && +q.weight_lb_each > 0); return p ? +p.weight_lb_each : TYPICAL[role] || 0; };
    return (g.extras || []).map(x => Object.assign({}, x, {
      w: x.type === 'drum' ? x.weight : x.type === 'pipe' ? each('pipe') * x.len / STOCK : x.type === 'noodle' ? each('noodle') * x.len / NOODLE_L : each(x.role) }));
  }
  function massItems(build, g, crewOverride) {
    const c = g.config, crew = Object.assign({}, c.crew, crewOverride || {});
    const wt = weights(build, g);
    const items = g.drums.map(d => ({ w: d.spec.weight, x: d.x, y: d.y0 + d.r, z: d.z, label: 'drum' }));
    let frameW = 0, deckW = 0, topW = 0;
    partWeights(build, g).forEach(({ part: p, w }) => {
      if (FRAME_ROLES.has(p.role)) frameW += w; else if (DECK_ROLES.has(p.role)) deckW += w; else topW += w;
    });
    // added parts sit where they were placed; their weight was counted in their role's group above
    extraWeights(build, g).forEach(x => {
      if (x.type === 'drum') { items.push({ w: x.w, x: x.at[0], y: x.at[1], z: x.at[2], label: 'added drum' }); return; }
      if (FRAME_ROLES.has(x.role)) frameW -= x.w; else if (DECK_ROLES.has(x.role)) deckW -= x.w; else topW -= x.w;
      items.push({ w: x.w, x: x.at[0], y: x.at[1], z: x.at[2], label: 'added ' + x.type });
    });
    frameW = Math.max(0, frameW); deckW = Math.max(0, deckW); topW = Math.max(0, topW);
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
    return applyFlood(items, g, c);
  }

  // Flooded drums (see floodFloor): with the cap open the HDPE shell floats its own weight and is left
  // out of the load (about 1 lb each, on the safe side); with the cap closed the water inside rides
  // along as ballast at the bottom of the drum.
  function applyFlood(items, g, c) {
    if (!isFlooded(c)) return items;
    const open = floodOpen(c), out = items.filter(i => i.label !== 'drum water').map(i => i.label === 'drum' && open ? Object.assign({}, i, { w: 0 }) : i);
    if (!open) g.drums.filter(d => !d.failed).forEach(d => {
      const pct = floodShare(c, d), yb = floodFloor(d.r, pct);
      if (pct > 0) out.push({ w: Math.PI * d.r * d.r * d.len * pct / 100 * WATER, x: d.x, y: d.y0 + segCentroidY(yb, d.r), z: d.z, label: 'drum water' });
    });
    return out;
  }
  // Flood level vs noodles: sweep the flooded share (caps closed), and find how many noodles per drum
  // keep the boat up on their own if the trapped air escapes (cap open, a leak at the top).
  const FLOOD_MIN_CLEAR = 6;   // inches of deck clearance to call a flooded set-up usable (judgement: a small wave)
  function floodAdvice(build, g) {
    const c = g.config, base = massItems(build, Object.assign({}, g, { config: Object.assign({}, c, { floodPct: 0 }) }));
    const at = over => { const G = Object.assign({}, g, { config: Object.assign({}, c, over) }); return solve(G, applyFlood(base, G, G.config)); };
    const usable = s => s.ok && s.stableRoll && s.deckClearance >= FLOOD_MIN_CLEAR;
    const pick = s => ({ ok: s.ok, reason: s.reason, W: s.W, maxLb: s.maxLb, draft: s.d, deckClearance: s.deckClearance, gmRoll: s.gmRoll, loadPct: s.loadPct, usable: usable(s) });
    const rows = [];
    for (let pct = 0; pct <= 90; pct += 10) rows.push(Object.assign({ floodPct: pct }, pick(at({ floodPct: pct, floodVented: false }))));
    const ok = rows.filter(r => r.usable), best = ok.length ? ok.reduce((a, b) => (b.gmRoll > a.gmRoll + 0.05 ? b : a)) : null;
    const d0 = g.drums.find(d => !d.failed), per = d0 ? NOODLE_VOL / (Math.PI * d0.r * d0.r * d0.len) * 100 : 0;
    const maxN = per ? Math.floor(100 / per) : 0;
    let need = null;
    for (let n = 0; n <= maxN; n++) if (usable(at({ floodPct: Math.max(1, +c.floodPct || 0), floodVented: true, drumNoodles: n }))) { need = n; break; }
    const airLost = pick(at({ floodPct: Math.max(1, +c.floodPct || 0), floodVented: true }));
    return { current: pick(at({})), rows, best, airLost, noodles: +c.drumNoodles || 0, noodlePct: d0 ? noodlePct(c, d0) : 0, perNoodlePct: per, noodlesNeeded: need, maxNoodles: maxN, minClear: FLOOD_MIN_CLEAR,
      maxFloodPct: d0 ? 100 - noodlePct(c, d0) : 100 };
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
  // Drums drilled at the bottom (2026-10-09). Two cases:
  //  • Cap closed: the trapped air pocket holds a fixed amount of water inside (Boyle: ~3% volume change
  //    per foot of head, ignored). The drum still displaces its whole outside shape, and the water inside
  //    rides along as ballast at the bottom of the drum, with a free surface that moves to the low side
  //    (a virtual rise of G of i/∇: free-surface effect).
  //  • Cap open (or the air escapes): the water inside stands at the river level, weighs nothing in the
  //    water and only removes lift. What still lifts is the noodles stuffed inside, which float up into a
  //    band across the top of the drum; below that band the drum gives no lift and no stability. The
  //    flooded drum's HDPE shell (~0.95 g/cm³) then floats its own weight, so it is left out of the load.
  function floodFloor(r, pct) {   // height above the drum bottom where pct % of the cross-section lies below
    const target = Math.PI * r * r * Math.min(100, Math.max(0, pct)) / 100;
    let lo = 0, hi = 2 * r;
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; segArea(m, r) < target ? lo = m : hi = m; }
    return lo;
  }
  const NOODLE_VOL = Math.PI * (NOODLE_D / 2) ** 2 * NOODLE_L;
  const noodlePct = (c, d) => Math.min(100, 100 * Math.max(0, +c.drumNoodles || 0) * NOODLE_VOL / (Math.PI * d.r * d.r * d.len));
  // share of a drum's inside that is water (%), capped by the room the noodles leave
  const floodShare = (c, d) => Math.max(0, Math.min(+c.floodPct || 0, 100 - noodlePct(c, d)));
  const isFlooded = c => (+c.floodPct || 0) > 0;
  const floodOpen = c => isFlooded(c) && !!c.floodVented;
  function slicesOf(g) {
    const out = [], c = g.config;
    g.drums.filter(d => !d.failed).forEach(d => {
      // cap open: only the noodle band at the top lifts (yb = its floor); otherwise the whole drum
      const dl = d.len / SLICES, yb = floodOpen(c) ? floodFloor(d.r, 100 - noodlePct(c, d)) : 0, none = floodOpen(c) && noodlePct(c, d) <= 0;
      for (let k = 0; k < SLICES; k++) {
        const u = -d.len / 2 + (k + 0.5) * dl;
        out.push(d.axis === 'x' ? { x: d.x + u, z: d.z, dl, r: d.r, y0: d.y0, yb: none ? 2 * d.r : yb, axis: 'x', drum: d.id }
                                : { x: d.x, z: d.z + u, dl, r: d.r, y0: d.y0, yb: none ? 2 * d.r : yb, axis: 'z', drum: d.id });
      }
    });
    (g.extras || []).filter(x => x.type === 'drum').forEach(x => {   // added drums are sealed
      const dl = x.len / SLICES;
      for (let k = 0; k < SLICES; k++) {
        const u = -x.len / 2 + (k + 0.5) * dl;
        out.push(x.axis === 'z' ? { x: x.at[0], z: x.at[2] + u, dl, r: x.r, y0: x.at[1] - x.r, yb: 0, axis: 'z', drum: x.id } : { x: x.at[0] + u, z: x.at[2], dl, r: x.r, y0: x.at[1] - x.r, yb: 0, axis: 'x', drum: x.id });
      }
    });
    return out;
  }
  // Free surface of the water held inside closed, flooded drums: Σ i about the roll and pitch axes (in⁴)
  function freeSurface(g) {
    const c = g.config; let roll = 0, pitch = 0;
    if (!isFlooded(c) || floodOpen(c)) return { roll, pitch };
    g.drums.filter(d => !d.failed).forEach(d => {
      const pct = floodShare(c, d); if (pct <= 0 || pct >= 100) return;
      const w = segWidth(floodFloor(d.r, pct), d.r), across = d.axis === 'x' ? w : d.len, along = d.axis === 'x' ? d.len : w;
      roll += along * across ** 3 / 12; pitch += across * along ** 3 / 12;
    });
    return { roll, pitch };
  }
  // lifting cross-section of a slice under water depth h (above the drum bottom), its centroid and water-line width
  const wetArea = (h, s) => Math.max(0, segArea(h, s.r) - (s.yb ? segArea(Math.min(h, s.yb), s.r) : 0));
  function wetCentroidY(h, s) {
    if (!s.yb || h <= s.yb) return s.yb ? s.yb : segCentroidY(h, s.r);
    const A = segArea(h, s.r), Ab = segArea(s.yb, s.r);
    return A - Ab > 1e-9 ? (A * segCentroidY(h, s.r) - Ab * segCentroidY(s.yb, s.r)) / (A - Ab) : s.yb;
  }
  const wetWidth = (h, s) => h > (s.yb || 0) ? segWidth(h, s.r) : 0;
  const PIPE_AREA = Math.PI * PIPE_R * PIPE_R;
  // Cage pipes, cut into short pieces; a piece adds lift by how much of it is under water.
  function pipeSlices(g) {
    const out = [];
    (g.extras || []).filter(x => x.type === 'pipe' || x.type === 'noodle').forEach(x => {   // added pipes (foam-filled) and noodles
      const n = Math.max(1, Math.ceil(x.len / 6));
      for (let k = 0; k < n; k++) {
        const f = (k + 0.5) / n;
        out.push({ x: x.a[0] + (x.b[0] - x.a[0]) * f, y: x.a[1] + (x.b[1] - x.a[1]) * f, z: x.a[2] + (x.b[2] - x.a[2]) * f, vol: Math.PI * x.r * x.r * x.len / n, vertical: x.axis === 'y', dl: x.len / n, r: x.r });
      }
    });
    if (!g.cage) return out;
    g.cagePieces.forEach(pc => {
      const n = Math.max(1, Math.ceil(pc.len / 6));
      for (let k = 0; k < n; k++) {
        const f = (k + 0.5) / n;
        out.push({ x: pc.a[0] + (pc.b[0] - pc.a[0]) * f, y: pc.a[1] + (pc.b[1] - pc.a[1]) * f, z: pc.a[2] + (pc.b[2] - pc.a[2]) * f, vol: PIPE_AREA * pc.len / n, vertical: pc.kind === 'post', dl: pc.len / n });
      }
    });
    return out;
  }
  const wetFrac = (h, ps) => { const r = ps.r || PIPE_R; return ps.vertical ? Math.max(0, Math.min(1, (h - (ps.y - ps.dl / 2)) / ps.dl)) : Math.max(0, Math.min(1, (h - (ps.y - r)) / (2 * r))); };
  // Buoyancy and its moments for a water plane y = d − x·t − z·p (boat frame).
  // My is the lift-weighted height of the centre of buoyancy.
  // An optional wave adds a surface height η(x, z) above that plane (inches, measured
  // vertically). Each slice then floats at its own local water level: the quasi-static
  // "boat balanced on a wave" method (wave pressure taken as hydrostatic, no orbital
  // accelerations), valid when the wave is longer than the boat's slices.
  // In a wave the water under a sloping surface accelerates downhill. Its pressure gradient also
  // pushes the boat sideways (the Froude–Krylov force, ρ g V · slope), so the boat feels gravity at
  // right angles to the local surface. Sx/Sz sum lift × local slope; Sxy/Szy weight it by height.
  function forces(sl, d, t, p, ps, eta) {
    let F = 0, Mx = 0, Mz = 0, My = 0, Sx = 0, Sz = 0, Sxy = 0, Szy = 0;
    const E = 0.5;   // inches, for the local surface slope across a drum
    // η is measured along the earth vertical at the earth position under the slice. In the
    // tilted boat frame that is a height η·√(1 + t² + p²) at (x·cos θ, z·cos φ).
    const sec = Math.sqrt(1 + t * t + p * p), cx = 1 / Math.sqrt(1 + t * t), cz = 1 / Math.sqrt(1 + p * p);
    const wv = eta ? (x, z) => eta(x * cx, z * cz) * sec : null;
    for (const s of sl) {
      const e0 = wv ? wv(s.x, s.z) : 0;
      const h = d - s.x * t - s.z * p - s.y0 + e0, b = wetArea(h, s) * s.dl * WATER;
      F += b; Mx += b * s.x; Mz += b * s.z; My += b * (s.y0 + wetCentroidY(h, s));
      if (wv && b > 0) {
        const ax = (wv(s.x + E, s.z) - wv(s.x - E, s.z)) / (2 * E), az = (wv(s.x, s.z + E) - wv(s.x, s.z - E)) / (2 * E), yc = s.y0 + wetCentroidY(h, s);
        Sx += b * ax; Sz += b * az; Sxy += b * ax * yc; Szy += b * az * yc;
      }
      // the water line also tilts across the drum's own width w: depth h − slope·u at offset u
      // moves the slice's lift sideways by ∫ u·(−slope·u) du = −slope·w³/12 (its own waterplane inertia)
      const w = wetWidth(h, s), own = w * w * w / 12 * s.dl * WATER;
      if (s.axis === 'x') Mz += (-p + (wv ? (wv(s.x, s.z + E) - wv(s.x, s.z - E)) / (2 * E) : 0)) * own;
      else Mx += (-t + (wv ? (wv(s.x + E, s.z) - wv(s.x - E, s.z)) / (2 * E) : 0)) * own;
    }
    for (const q of ps || []) {
      const b = wetFrac(d - q.x * t - q.z * p + (wv ? wv(q.x, q.z) : 0), q) * q.vol * WATER;
      F += b; Mx += b * q.x; Mz += b * q.z; My += b * q.y;
      if (wv && b > 0) { const ax = (wv(q.x + E, q.z) - wv(q.x - E, q.z)) / (2 * E), az = (wv(q.x, q.z + E) - wv(q.x, q.z - E)) / (2 * E); Sx += b * ax; Sz += b * az; Sxy += b * ax * q.y; Szy += b * az * q.y; }
    }
    return { F, Mx, Mz, My, Sx, Sz, Sxy, Szy };
  }

  function solve(g, items, eta, opts) {
    const maxAngle = opts && opts.maxAngleDeg || 25;   // flat water: beyond 25° it is going over
    const sl = slicesOf(g), ps = pipeSlices(g), fs = freeSurface(g);
    const W = items.reduce((s, i) => s + i.w, 0);
    const xg = items.reduce((s, i) => s + i.w * i.x, 0) / W;
    const zg = items.reduce((s, i) => s + i.w * i.z, 0) / W;
    const KG = items.reduce((s, i) => s + i.w * i.y, 0) / W;
    // loose water in closed drums acts as if G were higher by i/∇ (∇ = W ÷ water weight per in³)
    const fsRoll = fs.roll * WATER / W, fsPitch = fs.pitch * WATER / W, KGr = KG + fsRoll, KGp = KG + fsPitch;
    const r = g.r;
    const maxLb = sl.reduce((s, k) => s + (Math.PI * k.r * k.r - (k.yb ? segArea(k.yb, k.r) : 0)) * k.dl * WATER, 0) + ps.reduce((s, q) => s + q.vol * WATER, 0);
    const base = { W, xg, zg, KG, maxLb, loadPct: maxLb ? (W / maxLb) * 100 : Infinity };
    if (!sl.length || W >= maxLb * 0.995) return Object.assign(base, { ok: false, reason: 'sinks' });
    const span = Math.max(1, ...sl.map(s => Math.abs(s.x)), ...sl.map(s => Math.abs(s.z)));
    // initial heave by bisection at level trim
    let lo = -4 * r, hi = 4 * r;   // wide bracket: a wave can lift or drop the whole boat
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; forces(sl, m, 0, 0, ps, eta).F < W ? lo = m : hi = m; }
    let v = opts && opts.init ? opts.init.slice() : [lo, 0, 0];
    // Equilibrium: lift equals weight, and the centre of buoyancy B lies on the same
    // vertical as the centre of gravity G. The water plane's normal in the boat frame
    // is (t, 1, p), so B − G ∥ (t, 1, p):  xB − xG = t·(yB − yG),  zB − zG = p·(yB − yG).
    // (Leaving out the yB − yG terms would use BM instead of GM and under-predict heel.)
    // With a wave, the Froude–Krylov push b·slope acting at each slice's height adds Σ b·α·(y − yG):
    // a boat on a uniformly sloping surface then balances aligned with it (righting acts relative
    // to the local surface, as in the beam-sea roll moment W·GM·k·ζ).
    const resid = x => { const f = forces(sl, x[0], x[1], x[2], ps, eta), yB = f.F > 0 ? f.My / f.F : 0;
      return [(f.F - W) / W, (f.Mx - f.F * (xg + x[1] * (yB - KGp)) + (f.Sxy - f.Sx * KGp)) / (W * span), (f.Mz - f.F * (zg + x[2] * (yB - KGr)) + (f.Szy - f.Sz * KGr)) / (W * span)]; };
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
    if (!ok || Math.abs(pitchDeg) > maxAngle || Math.abs(rollDeg) > maxAngle) {
      return Object.assign(base, { ok: false, reason: 'capsizes', d, pitchDeg, rollDeg });
    }
    const hAt = (x, z) => d - x * t - z * p + (eta ? eta(x / Math.sqrt(1 + t * t), z / Math.sqrt(1 + p * p)) * Math.sqrt(1 + t * t + p * p) : 0);
    // per-drum immersion and waterplane / stability
    let V = 0, KBm = 0, A = 0, Ax = 0, Az = 0, Ixx = 0, Izz = 0, Ix0 = 0, Iz0 = 0;
    const perDrum = {};
    for (const s of sl) {
      const hh = hAt(s.x, s.z) - s.y0, a = wetArea(hh, s), vol = a * s.dl;
      V += vol; KBm += vol * (wetCentroidY(hh, s) + s.y0);
      const w = wetWidth(hh, s), wa = w * s.dl;
      A += wa; Ax += wa * s.x; Az += wa * s.z;
      // strip own inertia: w across the drum, dl along it
      const spanZ = s.axis === 'x' ? w : s.dl, spanX = s.axis === 'x' ? s.dl : w;
      Izz += wa * s.z * s.z + wa * spanZ * spanZ / 12;   // roll (about x axis)
      Ixx += wa * s.x * s.x + wa * spanX * spanX / 12;   // pitch (about z axis)
      const pd = perDrum[s.drum] || (perDrum[s.drum] = { min: Infinity, max: -Infinity, lb: 0 });
      pd.min = Math.min(pd.min, hh); pd.max = Math.max(pd.max, hh); pd.lb += vol * WATER;
    }
    for (const q of ps) {   // submerged cage pipes add volume low down (raises KB slightly)
      const hq = hAt(q.x, q.z), vol = wetFrac(hq, q) * q.vol;
      V += vol; KBm += vol * q.y;
      // a pipe or noodle cut by the water line adds water-plane area: its chord (lying) or its circle (upright)
      const r = q.r || PIPE_R, dh = hq - q.y;
      const wa = q.vertical ? (Math.abs(dh) < q.dl / 2 ? Math.PI * r * r : 0) : (Math.abs(dh) < r ? 2 * Math.sqrt(r * r - dh * dh) * q.dl : 0);
      if (wa) { A += wa; Ax += wa * q.x; Az += wa * q.z; Izz += wa * q.z * q.z; Ixx += wa * q.x * q.x; }
    }
    const cx = A ? Ax / A : 0, cz = A ? Az / A : 0;
    Ix0 = Ixx - A * cx * cx; Iz0 = Izz - A * cz * cz;
    const KB = V ? KBm / V : 0;
    const gmRoll = V ? Iz0 / V + KB - KGr : 0;
    const gmPitch = V ? Ix0 / V + KB - KGp : 0;
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
      deckClearance: Math.min(...corners.map(([x, z]) => g.deckTop - hAt(x, z)), g.hull ? g.deckTop - hAt(g.hull.tip, 0) : Infinity),
      gmRoll, gmPitch, KB, waterplaneArea: A,
      // negative GM: the angles found are a balance point it tips away from, not where it rests
      stableRoll: gmRoll > 0, stablePitch: gmPitch > 0,
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
  const NU_WATER = 1.0e-6 * 10.7639;         // kinematic viscosity of water at 20 °C: 1.0 cSt = 1.0e-6 m²/s, in ft²/s

  // ── Sources: where each formula and constant comes from ──
  // Educational references first (Wikipedia, Khan Academy, Brilliant, Wolfram), then
  // papers, standards and manufacturer data for the numbers a textbook doesn't give.
  const SOURCES = {
    archimedes: { kind: 'Wikipedia', title: "Archimedes' principle", url: 'https://en.wikipedia.org/wiki/Archimedes%27_principle' },
    khanBuoyancy: { kind: 'Khan Academy', title: 'Buoyant force and Archimedes\' principle', url: 'https://en.khanacademy.org/science/in-in-class9th-physics-india/in-in-gravity/in-in-pressure-in-liquids-archimedes-principle/a/buoyant-force-and-archimedes-principle-article' },
    brilliantFluids: { kind: 'Brilliant', title: 'Fluid mechanics (buoyant force F = ρVg)', url: 'https://brilliant.org/wiki/fluid-mechanics/' },
    waterProps: { kind: 'Wikipedia', title: 'Properties of water (density 62.43 lb/ft³ at 4 °C; 998 kg/m³ at 20 °C)', url: 'https://en.wikipedia.org/wiki/Properties_of_water' },
    wolframWater: { kind: 'Wolfram Alpha', title: '62.4 lb/ft³ in lb/in³', url: 'https://www.wolframalpha.com/input?i=62.4+lb%2Fft%5E3+in+lb%2Fin%5E3' },
    wolframSlug: { kind: 'Wolfram Alpha', title: '1.94 slug/ft³ in kg/m³', url: 'https://www.wolframalpha.com/input?i=1.94+slug%2Fft%5E3+in+kg%2Fm%5E3' },
    circSeg: { kind: 'Wikipedia', title: 'Circular segment (area, chord)', url: 'https://en.wikipedia.org/wiki/Circular_segment' },
    circSegMW: { kind: 'Wolfram MathWorld', title: 'Circular segment (area, centroid ȳ = 4R sin³(θ/2) ÷ 3(θ − sin θ))', url: 'https://mathworld.wolfram.com/CircularSegment.html' },
    centroids: { kind: 'Wikipedia', title: 'List of centroids', url: 'https://en.wikipedia.org/wiki/List_of_centroids' },
    freeSurface: { kind: 'Wikipedia', title: 'Free surface effect (loose water inside a hull reduces stability)', url: 'https://en.wikipedia.org/wiki/Free_surface_effect' },
    metacentric: { kind: 'Wikipedia', title: 'Metacentric height (GM = KB + BM − KG, BM = I/V)', url: 'https://en.wikipedia.org/wiki/Metacentric_height' },
    secondMoment: { kind: 'Wikipedia', title: 'Second moment of area', url: 'https://en.wikipedia.org/wiki/Second_moment_of_area' },
    parallelAxis: { kind: 'Wikipedia', title: 'Parallel axis theorem (I = I꜀ + A d²)', url: 'https://en.wikipedia.org/wiki/Parallel_axis_theorem' },
    brilliantInertia: { kind: 'Brilliant', title: 'Moment of inertia', url: 'https://brilliant.org/wiki/calculating-moment-of-inertia-of-point-masses/' },
    capsizing: { kind: 'Wikipedia', title: 'Capsizing (righting arm GZ beyond small angles)', url: 'https://en.wikipedia.org/wiki/Capsizing' },
    floatingCylinder: { kind: 'Paper', title: 'Stability of a floating cylinder, Int. J. Mech. Sci. (2003)', url: 'https://www.sciencedirect.com/science/article/abs/pii/S0020722503002374' },
    catamaranTrials: { kind: 'Paper', title: 'Stability Assessment of a Catamaran Using Sea Trials, J. Mar. Sci. Eng. 12 (2024) 1436: wider hull spacing, larger righting arm', url: 'https://doi.org/10.3390/jmse12081436' },
    khanCOM: { kind: 'Khan Academy', title: 'What is center of mass?', url: 'https://www.khanacademy.org/science/physics/linear-momentum/center-of-mass/a/what-is-center-of-mass' },
    khanTorque: { kind: 'Khan Academy', title: 'Torque and equilibrium', url: 'https://en.khanacademy.org/science/ap-physics-1/ap-torque-angular-momentum/torque-and-equilibrium-ap/a/torque-and-equilibrium' },
    dragEq: { kind: 'Wikipedia', title: 'Drag equation (F = ½ ρ v² C_d A)', url: 'https://en.wikipedia.org/wiki/Drag_equation' },
    dragCoef: { kind: 'Wikipedia', title: 'Drag coefficient (table of shapes; cylinder 1.1–1.2 at Re 2×10⁴–10⁵)', url: 'https://en.wikipedia.org/wiki/Drag_coefficient' },
    hoerner: { kind: 'Book', title: 'Hoerner, Fluid-Dynamic Drag (1965): flat-faced cylinder end-on, C_d 1.17 at l/d = 0 falling to ~0.81 for l/d > 2', url: 'https://archive.org/details/FluidDynamicDragHoerner1965' },
    dragCrisis: { kind: 'Wikipedia', title: 'Drag crisis (cylinder C_d drops for Re ≈ 2×10⁵–5×10⁵)', url: 'https://en.wikipedia.org/wiki/Drag_crisis' },
    reynolds: { kind: 'Wikipedia', title: 'Reynolds number (Re = v D ÷ ν)', url: 'https://en.wikipedia.org/wiki/Reynolds_number' },
    viscosity: { kind: 'Wikipedia', title: 'Viscosity (water ≈ 1 cSt at 20 °C)', url: 'https://en.wikipedia.org/wiki/Viscosity' },
    wolframMph: { kind: 'Wolfram Alpha', title: '1 mph in ft/s', url: 'https://www.wolframalpha.com/input?i=1+mph+in+ft%2Fs' },
    wolframPower: { kind: 'Wolfram Alpha', title: '1 ft·lbf/s in watts', url: 'https://www.wolframalpha.com/input?i=1+ft+lbf%2Fs+in+W' },
    humanPower: { kind: 'Wikipedia', title: 'Human power (~75 W all day for a non-athlete; 100–150 W for an hour)', url: 'https://en.wikipedia.org/wiki/Human_power' },
    kayakPower: { kind: 'Paper', title: 'Prediction of simulated 1000 m kayak ergometer performance in young athletes (≈130 W over 1000 m)', url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7855298/' },
    sectionModulus: { kind: 'Wikipedia', title: 'Section modulus (hollow circle S = π(D⁴ − d⁴) ÷ 32D; σ = M ÷ S)', url: 'https://en.wikipedia.org/wiki/Section_modulus' },
    nps: { kind: 'Wikipedia', title: 'Nominal Pipe Size (1-1/2": OD 1.900", Sch 40 wall 0.145")', url: 'https://en.wikipedia.org/wiki/Nominal_Pipe_Size' },
    charlotte: { kind: 'Datasheet', title: 'Charlotte Pipe 1-1/2" Sch 40 PVC (ASTM D1785): OD 1.900", wall 0.145", ~0.51 lb/ft (the pipe the team bought)', url: 'https://www.lowes.com/pd/Charlotte-Pipe-1-1-2-in-x-10-ft-330-Sch-40-Solidcore-PVC-DWV-Pipe/3133037' },
    bendingMoment: { kind: 'Wikipedia', title: 'Bending moment', url: 'https://en.wikipedia.org/wiki/Bending_moment' },
    shearMoment: { kind: 'Wikipedia', title: 'Shear and moment diagram (simply supported beams)', url: 'https://en.wikipedia.org/wiki/Shear_and_moment_diagram' },
    eulerBernoulli: { kind: 'Wikipedia', title: 'Euler–Bernoulli beam theory', url: 'https://en.wikipedia.org/wiki/Euler%E2%80%93Bernoulli_beam_theory' },
    pvcSpears: { kind: 'Datasheet', title: 'Spears: physical properties of PVC pipe, cell class 12454 (flexural strength 14,450 psi at 73 °F)', url: 'https://www.spearsmfg.com/IP-4/03%20Physical%20Properties%20of%20PVC%20&%20CPVC%20Pipe.pdf' },
    pvcCellClass: { kind: 'Standard', title: 'Uni-Bell: PVC pipe materials, cell class explained (ASTM D1784)', url: 'https://www.uni-bell.org/portals/0/ResourceFile/pvc-pipe-materials-cell-class-explained.pdf' },
    pvcDerate: { kind: 'Standard', title: 'PIPA TN003: temperature derating of PVC (0.62 at 100 °F / 38 °C)', url: 'https://www.pipa.com.au/wp-content/uploads/2018/09/tn003.pdf' },
    suddenLoad: { kind: 'Reference', title: 'RoyMech: impact loading (a suddenly applied load gives twice the static stress)', url: 'https://www.roymech.co.uk/Useful_Tables/Fatigue/Mechanics_Impact.html' },
    safetyFactor: { kind: 'Wikipedia', title: 'Factor of safety', url: 'https://en.wikipedia.org/wiki/Factor_of_safety' },
    cableTies: { kind: 'Standard', title: 'NEMA cable tie application guide (loop tensile ratings 18, 50, 120, 175 lb)', url: 'https://www.advancedcableties.com/cable-management-solutions/act-proud-member-nema/nema-application-guide-mechanical-properties/' },
    usnwc: { kind: 'Wikipedia', title: 'U.S. National Whitewater Center (channel lengths, drops, slopes, flows, named rapids)', url: 'https://en.wikipedia.org/wiki/U.S._National_Whitewater_Center' },
    s2o: { kind: 'Designer', title: 'S2O Design: U.S. National Whitewater Center project', url: 'https://s2odesign.com/projects/the-u-s-national-whitewater-center/' },
    isrd: { kind: 'Wikipedia', title: 'International scale of river difficulty (Class II waves up to 3 ft; Class III irregular waves)', url: 'https://en.wikipedia.org/wiki/International_scale_of_river_difficulty' },
    class3waves: { kind: 'Reference', title: 'Class III rapids: irregular waves 3–5 ft', url: 'https://www.airkayaks.com/class-3-rapids-skills-you-need-to-know/' },
    slalomWidth: { kind: 'Wikipedia', title: 'Kraków-Kolna canoe slalom course (Olympic-standard channel 12 m wide)', url: 'https://en.wikipedia.org/wiki/Krak%C3%B3w-Kolna_Canoe_Slalom_Course' },
    canoeSlalom: { kind: 'Wikipedia', title: 'Canoe slalom (course current at least 2 m/s)', url: 'https://en.wikipedia.org/wiki/Canoe_slalom' },
    manning: { kind: 'Wikipedia', title: 'Manning formula (V = (1/n) R^(2/3) S^(1/2), SI)', url: 'https://en.wikipedia.org/wiki/Manning_formula' },
    roughness: { kind: 'Wikipedia', title: 'Hydraulic roughness (boulders raise n)', url: 'https://en.wikipedia.org/wiki/Hydraulic_roughness' },
    froude: { kind: 'Wikipedia', title: 'Froude number (Fr = v ÷ √(g h))', url: 'https://en.wikipedia.org/wiki/Froude_number' },
    khanBernoulli: { kind: 'Khan Academy', title: "Bernoulli's equation (energy along the flow)", url: 'https://www.khanacademy.org/science/physics/fluids/fluid-dynamics/v/fluids-part-9' },
    hydraulicJump: { kind: 'Wikipedia', title: 'Hydraulic jump (Bélanger equation; jump length ≈ 4–6.2 × downstream depth)', url: 'https://en.wikipedia.org/wiki/Hydraulic_jump' },
    jumpRect: { kind: 'Wikipedia', title: 'Hydraulic jumps in rectangular channels', url: 'https://en.wikipedia.org/wiki/Hydraulic_jumps_in_rectangular_channels' },
    dispersion: { kind: 'Wikipedia', title: 'Dispersion (water waves): ω² = g k tanh(k h)', url: 'https://en.wikipedia.org/wiki/Dispersion_(water_waves)' },
    miche: { kind: 'Wikipedia', title: 'Miche criterion (breaking: H/L ≤ 0.142 tanh(k h))', url: 'https://en.wikipedia.org/wiki/Miche_criterion' },
    froudeKrylov: { kind: 'Wikipedia', title: 'Froude–Krylov force (pressure of the undisturbed wave on the hull)', url: 'https://en.wikipedia.org/wiki/Froude%E2%80%93Krylov_force' },
    waveSlope: { kind: 'Paper', title: 'Effective wave slope: beam-sea roll moment = W·GM·k·ζ (ScienceDirect, Ocean Eng.)', url: 'https://www.sciencedirect.com/science/article/pii/S0029801826008371' },
    hogSag: { kind: 'Wikipedia', title: 'Hogging and sagging (a hull balanced on a wave)', url: 'https://en.wikipedia.org/wiki/Hogging_and_sagging' },
    shipStrength: { kind: 'Wikipedia', title: 'Strength of ships (static balance on a design wave)', url: 'https://en.wikipedia.org/wiki/Strength_of_ships' },
    resonance: { kind: 'Wikipedia', title: 'Resonance (undamped magnification 1 ÷ |1 − r²|)', url: 'https://en.wikipedia.org/wiki/Resonance' },
    khanSHM: { kind: 'Khan Academy', title: 'Equation for simple harmonic oscillators (period)', url: 'https://www.khanacademy.org/science/ap-college-physics-1/xf557a762645cccc5:oscillations/xf557a762645cccc5:simple-harmonic-oscillators/v/euqation-for-simple-harmonic-oscillators' },
    videoBYOB2017: { kind: 'Video', title: 'Build Your Own Boat competition, 2017 compilation (USNWC)', url: 'https://www.youtube.com/watch?v=FpRtdIrZW1s' },
    videoBYOB: { kind: 'Video', title: 'Build Your Own Boat at US National Whitewater Center', url: 'https://www.youtube.com/watch?v=Vw2WUAATFZk' },
    newsBYOB2022: { kind: 'News', title: 'WBTV QC Life: the 2022 Build Your Own Boat competition (photos)', url: 'https://qclife.wbtv.com/2022/10/16/whitewater-center-held-build-your-own-boat-competition-this-weekend/' },
  };
  // Which sources back each "show the work" entry (exact id, or the id with its trailing number removed).
  const WORK_REFS = {
    'buoy.max': ['archimedes', 'khanBuoyancy', 'brilliantFluids', 'waterProps', 'wolframWater'],
    'buoy.load': ['khanCOM', 'archimedes'],
    'buoy.reserve': ['archimedes', 'khanBuoyancy'],
    'buoy.sf': ['safetyFactor', 'archimedes'],
    'buoy.drum': ['circSeg', 'circSegMW', 'archimedes', 'khanTorque'],
    'buoy.frame': ['archimedes', 'brilliantFluids'],
    'buoy.emergency': ['archimedes', 'khanBuoyancy', 'waterProps'],
    'drag.area': ['dragEq', 'circSeg'],
    'drag.force': ['dragEq', 'dragCoef', 'hoerner', 'wolframSlug', 'wolframMph'],
    'drag.speed': ['dragEq', 'humanPower', 'kayakPower', 'wolframPower'],
    'drag.broadside': ['dragEq', 'dragCoef', 'dragCrisis', 'reynolds', 'viscosity'],
    'wt.cg': ['khanCOM', 'khanTorque'],
    'wt.fwd': ['khanCOM'],
    'wt.cgw': ['metacentric', 'secondMoment', 'parallelAxis', 'brilliantInertia', 'centroids', 'capsizing', 'floatingCylinder', 'catamaranTrials'],
    'st.deck-rail': ['shearMoment', 'bendingMoment', 'sectionModulus', 'nps', 'pvcSpears', 'suddenLoad', 'safetyFactor'],
    'st.uplift': ['shearMoment', 'eulerBernoulli', 'sectionModulus', 'nps', 'pvcSpears', 'archimedes', 'safetyFactor'],
    'st.platform': ['shearMoment', 'bendingMoment', 'sectionModulus', 'nps', 'pvcSpears', 'suddenLoad', 'safetyFactor'],
    'st.nose': ['shearMoment', 'bendingMoment', 'sectionModulus', 'nps', 'pvcSpears', 'suddenLoad', 'safetyFactor'],
    'st.deck-ties': ['cableTies', 'archimedes', 'safetyFactor'],
    'ww.channel': ['manning', 'roughness', 'froude', 'usnwc', 's2o', 'slalomWidth', 'canoeSlalom'],
    'ww.waves': ['dispersion', 'miche', 'isrd', 'class3waves', 'froudeKrylov', 'waveSlope', 'hogSag', 'shipStrength', 'metacentric'],
    'ww.drop': ['khanBernoulli', 'froude', 'hydraulicJump', 'jumpRect', 'isrd', 'froudeKrylov'],
    'ww.period': ['metacentric', 'khanSHM', 'resonance', 'brilliantInertia'],
    'ww.pin': ['dragEq', 'dragCoef', 'dragCrisis'],
  };
  const refsFor = id => {
    const ids = WORK_REFS[id] || WORK_REFS[id.replace(/\d+$/, '')];
    if (!ids) throw new Error(`No sources listed for the work entry "${id}"`);   // every number shown must say where it comes from
    return ids.map(k => { if (!SOURCES[k]) throw new Error(`Unknown source "${k}" for "${id}"`); return Object.assign({ id: k }, SOURCES[k]); });
  };
  // The numbers the model assumes, next to what the sources say and how the choice leans.
  const ASSUMPTIONS = [
    { name: 'Water weight', used: '62.4 lb/ft³', source: '62.43 lb/ft³ at 4 °C, 62.32 at 20 °C', effect: 'Lift is about 0.1% high in summer water: negligible.', refs: ['waterProps', 'wolframWater'] },
    { name: 'Water density for drag', used: `${RHO} slug/ft³`, source: '1.940 slug/ft³ = 1000 kg/m³', effect: 'Matches.', refs: ['wolframSlug'] },
    { name: '1-1/2" Sch 40 PVC size', used: `OD ${PVC.D}", ID ${PVC.d}"`, source: 'OD 1.900", wall 0.145" → ID 1.610" (Charlotte Pipe, the brand bought; ~0.51 lb/ft, 5.1 lb per 10 ft stick)', effect: 'Matches.', refs: ['nps', 'charlotte'] },
    { name: 'PVC flexural strength', used: `${PVC.flex} psi`, source: '14,450 psi at 73 °F (cell class 12454); about 0.62× that at 100 °F', effect: '3% low (safe side) at 73 °F. Sun-heated pipe is weaker and is not derated here.', refs: ['pvcSpears', 'pvcCellClass', 'pvcDerate'] },
    { name: 'Drag coefficient, drum end-on', used: '0.9', source: '1.17 for a flat disc, falling to ~0.81 for length/diameter > 2 (a drum is ~1.5)', effect: 'Within the range, toward the high (safe) side for speed.', refs: ['hoerner', 'dragCoef'] },
    { name: 'Drag coefficient, broadside', used: '1.1', source: '1.1–1.2 for a smooth cylinder at Re 2×10⁴–10⁵; lower past the drag crisis (Re > 2×10⁵)', effect: 'The broadside Reynolds number here is ~10⁶, so the real push is probably lower; 1.1 is a high-side estimate for pinning.', refs: ['dragCoef', 'dragCrisis', 'reynolds'] },
    { name: 'Drag coefficient, pointed hull', used: '0.5', source: 'No direct source: a streamlined bow is well below a flat face (1.17) and above a streamlined body', effect: 'Engineering estimate; wave-making and skin friction are left out.', refs: ['dragCoef'] },
    { name: 'Paddler power', used: `${PADDLER_W} W each`, source: '~75 W all day (non-athlete); 100–150 W for an hour; ~130 W for young athletes over 1000 m', effect: 'Low (safe side) for a short race: real top speed is likely a little higher.', refs: ['humanPower', 'kayakPower'] },
    { name: 'Slamming load factor', used: `× ${DYNAMIC}`, source: 'A load applied suddenly (no drop) gives 2× the static stress; a drop from a height gives more: 1 + √(1 + 2h/δ)', effect: 'Covers sitting down hard, not jumping onto the deck.', refs: ['suddenLoad'] },
    { name: 'Safety factor targets', used: `${SF_OK} target, ${SF_MIN} minimum`, source: 'No universal value: chosen by the designer for the uncertainty in loads and materials', effect: 'A judgement call for a one-off amateur build.', refs: ['safetyFactor'] },
    { name: 'Cable tie strength', used: '50 lb (8"), 175 lb (heavy 36")', source: 'Standard loop tensile ratings 18, 50, 120, 175 lb', effect: 'Matches the standard classes.', refs: ['cableTies'] },
    { name: 'Flooded drums (drilled at the bottom)', used: 'Caps closed: the water share is fixed (trapped air), ballast at the drum bottom with a free surface (G rises by i/∇). Caps open or air lost: water at the river level, only the noodles lift, as a band across the top', source: 'Water inside a hull open to the sea weighs nothing in the water and only removes lift; loose water inside a closed hull raises the effective centre of gravity by i/∇', effect: 'Air compression (~3% per foot of head) is ignored. Noodles are taken as solid 2.5" × 52" foam; hollow-core noodles lift less. The flooded share and the noodle count are the team\'s estimates.', refs: ['archimedes', 'freeSurface', 'metacentric'] },
    { name: 'Water viscosity (Reynolds number)', used: '1.0 cSt', source: '≈ 1 cSt at 20 °C', effect: 'Used only to say which drag regime applies.', refs: ['viscosity', 'reynolds'] },
  ].map(a => Object.assign({}, a, { refs: a.refs.map(k => { if (!SOURCES[k]) throw new Error(`Unknown source "${k}"`); return Object.assign({ id: k }, SOURCES[k]); }) }));
  function engineering(build, g, sol, items, req) {
    const c = g.config, out = { buoyancy: null, drag: null, weight: null, structure: [], work: {}, assumptions: ASSUMPTIONS };
    if (!sol || !sol.ok) return out;
    const water = sol.d, crew = c.crew;
    // "show the work": for each number, the formula, the numbers plugged in, and why
    const n = (v, d = 1) => (+v).toFixed(d), work = (id, formula, steps, why) => { out.work[id] = { formula, steps, why, refs: refsFor(id) }; };
    const WATER_TXT = 'water weighs 62.4 lb/ft³ = 0.0361 lb/in³';
    // buoyancy
    const flood = Math.max(0, Math.min(99, +c.floodPct || 0));
    const drums = g.drums.filter(d => !d.failed).map(d => {
      const cap = Math.PI * d.r * d.r * d.len * WATER * (floodOpen(c) ? noodlePct(c, d) / 100 : 1), pd = sol.perDrum[d.id] || { lb: 0, max: 0 };
      return { id: d.id, capacity: cap, lb: pd.lb, share: pd.lb / sol.W, used: pd.lb / cap, depth: pd.max, freeboard: 2 * d.r - pd.max };
    });
    const parts = build.parts || [];
    const deckFoam = c.deck.length * c.deck.width * Math.max(0, c.deck.thickness - 0.3) * WATER;   // XPS lift if swamped
    const noodleFoam = (req.items.noodle || 0) * Math.PI * (NOODLE_D / 2) ** 2 * NOODLE_L * WATER;
    const pipeFoam = req.pipeLength_in * Math.PI * (PVC.D / 2) ** 2 * WATER;   // gross lift of foam-filled pipe (its weight is counted in the structure)
    const drumWeight = g.drums.reduce((t, d) => t + d.spec.weight, 0), boatW = sol.W - crew.count * crew.weightEach;
    out.buoyancy = {
      max: sol.maxLb, load: sol.W, reserve: sol.maxLb - sol.W, sf: sol.maxLb / sol.W, drums,
      frameLift: Math.max(0, sol.W - drums.reduce((t, d) => t + d.lb, 0)),   // submerged foam-filled pipe carries the rest
      waterline: water, emergency: deckFoam + noodleFoam + pipeFoam, structure: boatW - drumWeight,
    };
    const B = out.buoyancy, drumCap = drums.reduce((t, d) => t + d.capacity, 0);
    work('buoy.max', 'Lift = Σ (π r² L × 0.0361) for each drum + foam-filled pipe below the deck',
      [...g.drums.filter(d => !d.failed).map(d => `Drum ${d.id + 1}: π × ${n(d.r, 2)}² × ${n(d.len, 1)} = ${n(Math.PI * d.r * d.r * d.len, 0)} in³ × 0.0361${floodOpen(c) ? ` × ${n(noodlePct(c, d), 0)}% noodles (cap open: only they lift)` : ''} = ${n(Math.PI * d.r * d.r * d.len * WATER * (floodOpen(c) ? noodlePct(c, d) / 100 : 1), 1)} lb`),
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
      `Pipe: ${n(req.pipeLength_in, 0)}" × π × 0.95² × 0.0361 = ${n(pipeFoam, 0)} lb (gross: the pipe's own weight is on the other side, in the structure)`,
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
    const MPH = 5280 / 3600, force = (CdAft, mph) => { const v = mph * MPH; return 0.5 * RHO * v * v * CdAft; };   // lbf
    const reynoldsD = 2 * Math.max(...g.drums.filter(d => !d.failed).map(d => d.r)) / 12;   // ft: drum diameter, the cylinder's size across the flow
    const power = crew.count * PADDLER_W, vMax = Math.cbrt(power / 1.35582 / (0.5 * RHO * Math.max(1e-6, CdA)));   // ft/s
    out.drag = {
      frontArea: (frontDrums + frontHull) / 144, sideArea: (sideDrums + sideHull) / 144, CdA, CdAside,
      at: [1, 2, 3].map(mph => ({ mph, lb: force(CdA, mph), watts: force(CdA, mph) * mph * MPH * 1.35582 })),
      broadside: [3, 5, 8].map(mph => ({ mph, lb: force(CdAside, mph), Re: mph * MPH * reynoldsD / NU_WATER })),
      reynoldsD, nu: NU_WATER,
      speed: vMax / MPH, power, frontDrums: frontDrums / 144, frontHull: frontHull / 144, sideDrums: sideDrums / 144, sideHull: sideHull / 144, CdDrum, CdHull, CdSide, note: hull ? 'The hull skirt below the waterline adds frontal area; the pointed bow cuts its drag coefficient to about 0.5.' : 'Blunt drum ends (drag coefficient about 0.9).',
    };
    const Dg = out.drag;
    work('drag.area', 'Frontal area = drum cross-sections below the waterline (seen from ahead, overlaps counted once) + hull skirt width × depth under water', [
      `Waterline ${n(water, 1)}" above the drum bottoms${hull ? `; hull skirt bottom at ${n(hull.y0, 1)}", so ${n(skirt, 1)}" of skirt is under water` : ''}`,
      `Drums below the skirt: ${n(Dg.frontDrums, 2)} ft² (sampled every 0.5" across)`, hull ? `Hull: ${n(2 * hull.half, 1)}" wide × ${n(skirt, 1)}" = ${n(Dg.frontHull, 2)} ft²` : 'No hull skirt',
      `From the side: drums ${n(Dg.sideDrums, 2)} ft²${hull ? ` + hull ${n(hull.tip - hull.xs, 1)}" × ${n(skirt, 1)}" = ${n(Dg.sideHull, 2)} ft²` : ''}`],
      'Drag depends on how much the boat pushes against water head-on. Only what is below the waterline counts.');
    work('drag.force', 'F = ½ · ρ · v² · Cd · A   (ρ = 1.94 slug/ft³, v in ft/s, 1 mph = 1.467 ft/s)', [
      `Cd·A = ${CdDrum} × ${n(Dg.frontDrums, 2)} (blunt drum ends) + ${CdHull} × ${n(Dg.frontHull, 2)} (${CdHull < 1 ? 'pointed bow' : 'blunt hull'}) = ${n(CdA, 2)} ft²`,
      ...Dg.at.map(x => `${x.mph} mph: ½ × 1.94 × ${n(x.mph * MPH, 2)}² × ${n(CdA, 2)} = ${n(x.lb, 1)} lb; power = F × v = ${n(x.lb, 1)} × ${n(x.mph * MPH, 2)} × 1.356 = ${n(x.watts, 0)} W`)],
      'Water drag grows with the square of speed, and the power to push it with the cube. Skin friction along the sides is left out, so real drag is a little higher.');
    work('drag.speed', 'P = F · v = ½ ρ Cd A v³  →  v = ∛(P ÷ (½ ρ Cd A))', [`P = ${crew.count} paddlers × ${PADDLER_W} W = ${power} W = ${n(power / 1.35582, 0)} ft·lb/s`, `v = ∛(${n(power / 1.35582, 0)} ÷ (0.5 × 1.94 × ${n(CdA, 2)})) = ${n(vMax, 2)} ft/s = ${n(vMax / MPH, 1)} mph`],
      'A fit recreational paddler sustains about 75 W. Top speed is where the paddlers\' power equals the drag power.');
    work('drag.broadside', 'F = ½ · ρ · v² · Cd · A_side   (Cd ≈ 1.1 broadside);  Re = v · D ÷ ν', [`Cd·A_side = 1.1 × ${n(Dg.sideArea, 2)} = ${n(CdAside, 2)} ft²`, ...Dg.broadside.map(x => `${x.mph} mph: ½ × 1.94 × ${n(x.mph * MPH, 2)}² × ${n(CdAside, 2)} = ${n(x.lb, 0)} lb`),
      ...Dg.broadside.map(x => `Re at ${x.mph} mph = ${n(x.mph * MPH, 2)} ft/s × ${n(reynoldsD, 3)} ft ÷ ${NU_WATER.toExponential(3)} ft²/s = ${x.Re.toExponential(1)}${x.Re > 2e5 ? ' (past the drag crisis: a smooth drum would see less drag)' : ''}`)],
      'Turned sideways in the current, the long side faces the flow. This is the push that pins a boat against a rock, so keep the bow into the rapids. Cd 1.1 is the textbook value for a cylinder below the drag crisis; at these Reynolds numbers the ribbed drums probably see less, so the push shown is on the high side.');
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
      // the rail spans post to post: tees along it (links, butting boxes) don't hold it up
      const longBox = g.boxList.reduce((m, b) => (b.x1 - b.x0) > (m.x1 - m.x0) ? b : m, g.boxList[0]);
      const longRails = lenRails.filter(pc => pc.drum === longBox.id);
      chk('deck-rail', 'Box top rail under the deck (crew)', (crewP / 2) * boxLen / 4,
        `One crew member (${crew.weightEach} lb × ${DYNAMIC} for slamming) at mid-span, shared by the two top rails of a box, span ${boxLen.toFixed(1)}" post to post.`, longRails,
        { formula: 'Simply supported, centre load: M = (P/2) · L ÷ 4', steps: [`P = ${crew.weightEach} lb × ${DYNAMIC} (slamming) = ${crewP} lb, split over 2 rails = ${crewP / 2} lb`, `L = ${n(boxLen, 1)}" between the corner posts (the longest box)`, `M = ${crewP / 2} × ${n(boxLen, 1)} ÷ 4 = ${n((crewP / 2) * boxLen / 4, 0)} in·lb`],
          why: 'The deck spreads a person over the two top rails of the box below; each rail acts as a beam between its corner posts.' });
      const big = g.drums.reduce((m, d) => d.r > m.r ? d : m, g.drums[0]);
      const uplift = Math.PI * big.r * big.r * big.len * WATER - big.spec.weight, span = big.len + 2 * (c.boxEndGap ?? 2);
      const upRails = lenRails.filter(pc => pc.drum === big.id);
      chk('uplift', 'Drum uplift on its box (drum pushed fully under a wave)', (uplift / 2) * (2 * span - big.len) / 8,
        `A fully submerged drum pushes up ${uplift.toFixed(0)} lb, spread along its two top rails (span ${span.toFixed(1)}").`, upRails,
        { formula: 'Load W spread over the middle length a of a span L: M = W · (2L − a) ÷ 8', steps: [`U = π × ${n(big.r, 2)}² × ${n(big.len, 1)} × 0.0361 − ${big.spec.weight} lb drum = ${n(uplift, 0)} lb`, `Per rail W = U/2 = ${n(uplift / 2, 0)} lb over the drum length a = ${n(big.len, 1)}", span L = ${n(span, 1)}"`, `M = ${n(uplift / 2, 0)} × (2 × ${n(span, 1)} − ${n(big.len, 1)}) ÷ 8 = ${n((uplift / 2) * (2 * span - big.len) / 8, 0)} in·lb`],
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


  // ── Whitewater: U.S. National Whitewater Center, Class II and III features ──
  // Channel data from the USNWC page (Wikipedia) and the designer (S2O). Class wave
  // heights from the International Scale of River Difficulty. The channel width, Manning
  // roughness and drop heights are not published: they are explicit, editable assumptions.
  const G_SI = 9.80665, IN_PER_M = 1 / 0.0254, FT_PER_M = 1 / 0.3048, G_IN = G_SI * IN_PER_M;
  const WW_CHANNELS = {
    competition: { name: 'Competition channel (the race course)', length_m: 300, drop_m: 6.4, slope: 0.021, flow_m3s: 15,
      features: [
        { id: 'upper-waves', name: 'Upper channel wave train', cls: 'II', type: 'waves' },
        { id: 'bridge-drop', name: 'Bridge Drop', cls: 'III', type: 'drop' },
        { id: 'class3-waves', name: 'Wave train below Bridge Drop', cls: 'III', type: 'waves' },
      ], notModeled: 'Big Drop (Class IV) is also on the race course and is not simulated here.' },
    wilderness: { name: 'Wilderness channel', length_m: 550, drop_m: 6.4, slope: 0.012, flow_m3s: 19,
      features: [
        { id: 'entrance-exam', name: 'Entrance Exam', cls: 'II', type: 'waves' },
        { id: 'huey-lewis', name: 'Huey Lewis', cls: 'II', type: 'waves' },
        { id: 'bread-butter', name: 'Bread and Butter', cls: 'II', type: 'waves' },
        { id: 'sunset', name: 'Sunset', cls: 'III', type: 'drop' },
        { id: 'm-wave', name: 'M-Wave', cls: 'III', type: 'waves' },
      ], notModeled: '' },
  };
  // Class II: "waves up to 3 ft" (ISRD). Class III: "irregular waves 3–5 ft"; the top of each range is used.
  const WW_CLASS = { II: { waveFt: 3, dropFt: 1 }, III: { waveFt: 5, dropFt: 3 } };
  // Riding a wave face tilts the boat with the water, so only a failed balance or more than
  // 60° counts as going over (flat water uses 25°).
  const WAVE_SOLVE = { maxAngleDeg: 60 };
  const WW_DEFAULTS = { channel: 'competition', width_m: 12, manningN: 0.045, classes: ['II', 'III'], dropFt: { II: 1, III: 3 }, waveFt: { II: 3, III: 5 }, phases: 16, rollerFactor: 6 };

  // Normal depth from Manning, rectangular channel (SI): Q = (1/n) · b h · (b h ÷ (b + 2h))^(2/3) · √S
  function manningDepth(Q, b, n, S) {
    if (!(Q > 0 && b > 0 && n > 0 && S > 0)) throw new Error('manningDepth needs positive Q, b, n and S');
    const q = h => (1 / n) * b * h * Math.pow(b * h / (b + 2 * h), 2 / 3) * Math.sqrt(S);
    let lo = 1e-6, hi = 50;
    for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; q(m) < Q ? lo = m : hi = m; }
    return (lo + hi) / 2;
  }
  // A wave that stands still on the riverbed travels upstream at the current speed U:
  // (ω − U k)² = g k tanh(k h) with ω = 0  →  U² = (g/k) tanh(k h)  →  tanh(x)/x = Fr², x = k h.
  // tanh(x)/x < 1, so a standing wave train needs subcritical flow (Fr < 1). Returns k (1/m) or null.
  function standingWaveK(U, h) {
    const Fr2 = U * U / (G_SI * h);
    if (!(Fr2 < 1)) return null;
    let lo = 1e-9, hi = 2 / Fr2;   // tanh(x)/x ≤ 1/x, so the root is below 1/Fr²
    for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; Math.tanh(m) / m > Fr2 ? lo = m : hi = m; }
    return ((lo + hi) / 2) / h;
  }
  // Supercritical depth at the foot of a drop of Δz, from energy: h + q²/(2 g h²) = E (losses ignored, so a fast, conservative jet).
  function supercriticalDepth(q, E) {
    const hc = Math.cbrt(q * q / G_SI);
    if (E < 1.5 * hc - 1e-12) throw new Error('Specific energy below the critical minimum');
    let lo = 1e-6, hi = hc;
    for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; (m + q * q / (2 * G_SI * m * m)) > E ? lo = m : hi = m; }
    return (lo + hi) / 2;
  }
  const belanger = (h1, Fr1) => h1 / 2 * (Math.sqrt(1 + 8 * Fr1 * Fr1) - 1);

  function whitewaterHydraulics(o) {
    const ch = WW_CHANNELS[o.channel];
    if (!ch) throw new Error(`Unknown channel "${o.channel}"`);
    const h = manningDepth(ch.flow_m3s, o.width_m, o.manningN, ch.slope), U = ch.flow_m3s / (o.width_m * h);
    return { channel: ch, h_m: h, U_ms: U, q_m2s: ch.flow_m3s / o.width_m, Fr: U / Math.sqrt(G_SI * h) };
  }

  function whitewater(build, rules, opts) {
    const o = Object.assign({}, WW_DEFAULTS, opts || {});
    ['width_m', 'manningN', 'phases', 'rollerFactor'].forEach(k => { if (!(o[k] > 0)) throw new Error(`whitewater: ${k} must be positive`); });
    const a = analyze(build, rules, { skipLeak: true });
    const g = a.geometry, items = massItems(build, g), still = a.solution, E = a.engineering;
    const hy = whitewaterHydraulics(o), ch = hy.channel;
    const work = {}, warnings = [], features = [];
    const n = (v, d = 1) => (+v).toFixed(d);
    const W = (id, formula, steps, why) => { work[id] = { formula, steps, why, refs: refsFor(id.replace(/:.*/, '')) }; };
    const warn = (level, feature, title, detail, workId) => warnings.push({ level, category: 'whitewater', feature, title, detail, work: workId });
    if (!still.ok) {
      warn('error', null, 'The boat does not float in flat water', 'Fix flat-water flotation before simulating rapids.');
      return { options: o, hydraulics: hy, features, warnings, work, assumptions: WW_ASSUMPTIONS(o), sources: SOURCES };
    }
    W('ww.channel', 'Manning (SI): Q = (1/n) · A · R^(2/3) · √S, A = b·h, R = b·h ÷ (b + 2h);  U = Q ÷ A;  Fr = U ÷ √(g h)', [
      `${ch.name}: Q = ${ch.flow_m3s} m³/s, slope S = ${ch.slope} (${ch.drop_m} m drop over ${ch.length_m} m)`,
      `Assumed width b = ${o.width_m} m and roughness n = ${o.manningN}`,
      `Normal depth h = ${n(hy.h_m, 3)} m (${n(hy.h_m * FT_PER_M, 2)} ft), solved by bisection`,
      `U = ${ch.flow_m3s} ÷ (${o.width_m} × ${n(hy.h_m, 3)}) = ${n(hy.U_ms, 2)} m/s (${n(hy.U_ms * 2.23694, 1)} mph)`,
      `Fr = ${n(hy.U_ms, 2)} ÷ √(9.81 × ${n(hy.h_m, 3)}) = ${n(hy.Fr, 2)} (${hy.Fr < 1 ? 'subcritical: standing waves can form' : 'supercritical'})`],
      'The channel average: how fast and deep the water runs between features. The boat drifts at about this speed. Width and roughness are not published, so they are assumptions you can change.');

    // natural periods (no added mass of water, so the real periods are somewhat longer)
    const Wt = items.reduce((t, i) => t + i.w, 0), yg = still.KG;
    const rP = Math.sqrt(items.reduce((t, i) => t + i.w * ((i.x - still.xg) ** 2 + (i.y - yg) ** 2), 0) / Wt);
    const rR = Math.sqrt(items.reduce((t, i) => t + i.w * ((i.z - still.zg) ** 2 + (i.y - yg) ** 2), 0) / Wt);
    const Tp = still.gmPitch > 0 ? 2 * Math.PI * rP / Math.sqrt(G_IN * still.gmPitch) : null;
    const Tr = still.gmRoll > 0 ? 2 * Math.PI * rR / Math.sqrt(G_IN * still.gmRoll) : null;
    W('ww.period', 'T = 2π · r ÷ √(g · GM)  (r = radius of gyration about the centre of gravity)', [
      `Pitch: r = √(Σ w·(Δx² + Δy²) ÷ W) = ${n(rP, 1)}", GM = ${n(still.gmPitch, 1)}" → T = ${Tp ? n(Tp, 2) + ' s' : 'none (unstable)'}`,
      `Roll: r = √(Σ w·(Δz² + Δy²) ÷ W) = ${n(rR, 1)}", GM = ${n(still.gmRoll, 1)}" → T = ${Tr ? n(Tr, 2) + ' s' : 'none (unstable)'}`,
      'g = 386.1 in/s². The water dragged along with the drums (added mass) is left out, so the real periods are somewhat longer.'],
      'Every floating body rocks at its own natural period, like a pendulum. Waves met at that period pump the motion up (resonance).');

    const L = g.config.frameLength, boatLenM = (g.hull ? g.hull.tip - Math.min(...g.drums.map(d => d.x - d.ex)) : L) / IN_PER_M;
    // Newton from flat water can miss on a big wave: grow the wave in steps, starting each from the last answer.
    // Newton can miss a balance on a big wave even when one exists, so: start from the previous
    // position's answer; failing that, grow the wave in steps from flat water. Only when every
    // start fails is it reported as no balance (capsizes or goes under).
    const at = sol => sol && sol.ok ? { init: [sol.d, sol.t, sol.p] } : {};
    const solveRamped = (etaOf, prev) => {
      if (prev && prev.ok) { const s1 = solve(g, items, etaOf(1), Object.assign({}, WAVE_SOLVE, at(prev))); if (s1.ok) return s1; }
      for (const start of [null, prev]) {
        let sol = start && start.ok ? start : null;
        for (let i = 1; i <= 12; i++) { sol = solve(g, items, etaOf(i / 12), Object.assign({}, WAVE_SOLVE, at(sol))); if (!sol.ok) break; }
        if (sol.ok) return sol;
      }
      return solve(g, items, etaOf(1), WAVE_SOLVE);
    };
    const crestScan = (eta, phases) => {   // balance the boat on the surface at each phase, carrying the answer along
      const out = [];
      let prev = null;
      for (let i = 0; i < phases; i++) { const ph = 2 * Math.PI * i / phases, sol = solveRamped(e => eta(ph, e), prev); out.push({ phase: ph, sol }); prev = sol; }
      return out;
    };
    const pinLb = U_ms => { const v = U_ms * FT_PER_M; return 0.5 * RHO * v * v * E.drag.CdAside; };

    ch.features.filter(f => o.classes.includes(f.cls)).forEach(f => {
      const res = { id: f.id, name: f.name, cls: f.cls, type: f.type, level: 'ok', notes: [] };
      const lv = (l) => { const rank = { ok: 0, info: 1, warn: 2, error: 3 }; if (rank[l] > rank[res.level]) res.level = l; };
      if (f.type === 'waves') {
        const Hc = o.waveFt[f.cls] / FT_PER_M, U = hy.U_ms, h = hy.h_m, k = standingWaveK(U, h);
        if (!k) { res.level = 'warn'; res.notes.push('Supercritical flow: no standing wave train at these settings.'); warn('warn', f.id, `${f.name}: no standing waves at Fr ${n(hy.Fr, 2)}`, 'Fast, shallow flow (Fr ≥ 1) jumps before it forms waves. Try a wider channel or rougher bed.', 'ww.channel'); features.push(res); return; }
        // The class sets the height H. A wave can be no steeper than the breaking limit H/λ = 0.142
        // (Miche, deep water: the steepest case, since the local depth at a feature isn't known),
        // so the wavelength is the longer of the current's standing wavelength and H ÷ 0.142.
        const lamFlow = 2 * Math.PI / k, lamMin = Hc / 0.142, lam = Math.max(lamFlow, lamMin), breaking = lamFlow < lamMin, H = Hc;
        const kIn = 2 * Math.PI / lam / IN_PER_M, Hin = H * IN_PER_M;
        const head = crestScan((ph, e) => (x) => e * Hin / 2 * Math.cos(kIn * x - ph), o.phases);
        const beam = crestScan((ph, e) => (x, z) => e * Hin / 2 * Math.cos(kIn * z - ph), o.phases);
        const all = [...head, ...beam], capsize = all.filter(r => !r.sol.ok);
        const okH = head.filter(r => r.sol.ok), okB = beam.filter(r => r.sol.ok);
        const maxPitch = Math.max(0, ...okH.map(r => Math.abs(r.sol.pitchDeg))), maxRoll = Math.max(0, ...okB.map(r => Math.abs(r.sol.rollDeg)));
        const minDeck = Math.min(Infinity, ...all.filter(r => r.sol.ok).map(r => r.sol.deckClearance));
        const minFrame = Math.min(Infinity, ...all.filter(r => r.sol.ok).map(r => r.sol.minFreeboard));
        const lostRoll = okB.some(r => !r.sol.stableRoll) || okH.some(r => !r.sol.stableRoll);
        const buried = all.filter(r => r.sol.ok).some(r => Object.values(r.sol.perDrum).some(pd => pd.max >= 2 * g.r - 1e-6));
        const Te = lam / U, ampP = Tp ? 1 / Math.abs(1 - (Tp / Te) ** 2) : null, ampR = Tr ? 1 / Math.abs(1 - (Tr / Te) ** 2) : null;
        Object.assign(res, { H_m: H, lambda_m: lam, lambdaFlow_m: lamFlow, breaking, U_ms: U, depth_m: h, maxSlopeDeg: Math.atan(Math.PI * H / lam) * 180 / Math.PI,
          maxPitchDeg: maxPitch, maxRollDeg: maxRoll, minDeckClearance_in: minDeck, minFrameClearance_in: minFrame, capsizePhases: capsize.length,
          encounterPeriod_s: Te, pitchPeriod_s: Tp, rollPeriod_s: Tr, pitchAmplification: ampP, rollAmplification: ampR, drumBuried: buried, pinForce_lb: pinLb(U),
          motion: head.map(r => ({ phase: r.phase, ok: r.sol.ok, d: r.sol.d, t: r.sol.t, p: r.sol.p, pitchDeg: r.sol.pitchDeg })), motionBeam: beam.map(r => ({ phase: r.phase, ok: r.sol.ok, d: r.sol.d, t: r.sol.t, p: r.sol.p, rollDeg: r.sol.rollDeg })) });
        const wid = 'ww.waves:' + f.id;
        W(wid, 'Standing wave: U² = (g/k)·tanh(k h), λ = 2π/k;  breaking at H ≤ 0.142·λ·tanh(k h);  boat balanced on η = (H/2)·cos(k x − φ)', [
          `Class ${f.cls} wave height (top of the class range): ${o.waveFt[f.cls]} ft = ${n(Hc, 2)} m`,
          `Current U = ${n(U, 2)} m/s, depth h = ${n(h, 3)} m → k = ${n(k, 3)} 1/m, standing wavelength ${n(lamFlow, 2)} m (${n(lamFlow * FT_PER_M, 1)} ft)`,
          `Steepest a ${n(H, 2)} m wave can be: H/λ = 0.142 → λ ≥ ${n(lamMin, 2)} m. Used λ = ${n(lam, 2)} m (${n(lam * FT_PER_M, 1)} ft)${breaking ? ': at the breaking limit, so expect a breaking, foaming crest' : ''}; the boat is ${n(boatLenM, 2)} m long`,
          `Steepest surface slope atan(π H ÷ λ) = ${n(res.maxSlopeDeg, 1)}°`,
          `Balanced at ${o.phases} positions on head waves (crests across the boat) and beam waves (crests along it):`,
          `Largest trim ${n(maxPitch, 1)}°, largest heel ${n(maxRoll, 1)}°, lowest frame clearance ${n(minFrame, 1)}", lowest deck clearance ${n(minDeck, 1)}" (after the breaking crest)`,
          capsize.length ? `${capsize.length} of ${all.length} positions have no balance: it capsizes or goes under` : 'Every position balances',
          `Meeting the waves: T_e = λ ÷ U = ${n(Te, 2)} s vs natural pitch ${Tp ? n(Tp, 2) + ' s' : '—'} and roll ${Tr ? n(Tr, 2) + ' s' : '—'}; undamped magnification 1 ÷ |1 − (T_n/T_e)²| = ${ampP ? n(ampP, 2) : '—'} (pitch), ${ampR ? n(ampR, 2) : '—'} (roll)`],
          'The waves stand still while the boat drifts through them at the current speed. A Class III wave at the top of its range is taller than the channel-average flow can hold, so it is treated as the steepest wave of that height that can exist. Each drum slice floats at its own local water level (the classic way to balance a hull on a wave), and the water accelerating down each slope pushes the boat too (Froude–Krylov), so it rights itself relative to the local surface. Wave dynamics, fast flow in the crest and splash are left out.');
        if (capsize.length) { lv('error'); warn('error', f.id, `${f.name} (Class ${f.cls}): capsizes or goes under on ${capsize.length} of ${all.length} wave positions`, 'Lower the crew, spread the drums, or add flotation before this rapid.', wid); }
        if (minDeck < 0) { lv('warn'); warn('warn', f.id, `${f.name} (Class ${f.cls}): water over the deck (${n(-minDeck, 1)}" deep at worst)`, breaking ? 'The deck edge dips under the breaking crest. Expect to take on water; keep weight back and paddle hard through it.' : 'The deck edge dips under the wave. Raise the deck or add bow flotation.', wid); }
        else if (minFrame < 0) { lv('info'); res.notes.push('Frame rails go under at the worst wave position.'); }
        if (lostRoll) { lv('warn'); warn('warn', f.id, `${f.name} (Class ${f.cls}): loses side-to-side stability on the wave`, 'At some positions the righting arm goes negative. Keep the crew low and centred.', wid); }
        const amp = Math.max(ampP || 0, ampR || 0);
        if (amp >= 2) { lv('warn'); warn('warn', f.id, `${f.name} (Class ${f.cls}): waves arrive near the boat's natural ${ampP >= ampR ? 'pitch' : 'roll'} period (×${n(amp, 1)})`, `Waves every ${n(Te, 2)} s rock it at its own rhythm, so the motion builds. Paddling faster or slower through the train changes the timing.`, 'ww.period'); }
        if (buried) { lv('info'); res.notes.push('A drum goes fully under at a crest: the drum uplift check applies.'); }
        if (maxPitch > 20 || maxRoll > 20) { lv('warn'); warn('warn', f.id, `${f.name} (Class ${f.cls}): ${n(Math.max(maxPitch, maxRoll), 0)}° of ${maxPitch >= maxRoll ? 'trim' : 'heel'} on the wave`, 'Crew will need to brace and hold on.', wid); }
      } else {
        // drop into a hydraulic jump (hole)
        const dz = o.dropFt[f.cls] / FT_PER_M, q = hy.q_m2s, h0 = hy.h_m, U0 = hy.U_ms;
        const E1 = h0 + U0 * U0 / (2 * G_SI) + dz, h1 = supercriticalDepth(q, E1), U1 = q / h1, Fr1 = U1 / Math.sqrt(G_SI * h1);
        const h2 = belanger(h1, Fr1), U2 = q / h2, jumpH = h2 - h1, Lr = o.rollerFactor * h2, retentive = h0 >= h2;
        const keeper = retentive && boatLenM < Lr;
        const face = (s0, e) => (x) => { const u = (x - s0) / (Lr * IN_PER_M); return e * jumpH * IN_PER_M * (u <= 0 ? 0 : u >= 1 ? 1 : (1 - Math.cos(Math.PI * u)) / 2); };
        const pos = []; for (let i = 0; i <= o.phases; i++) pos.push(-L / 2 - (Lr * IN_PER_M) * i / o.phases);
        let prevS = null; const scan = pos.map(s0 => { const sol = solveRamped(e => face(s0, e), prevS); prevS = sol; return { s0, sol }; }), okS = scan.filter(r => r.sol.ok), cap = scan.length - okS.length;
        const minDeck = Math.min(Infinity, ...okS.map(r => r.sol.deckClearance)), maxPitch = Math.max(0, ...okS.map(r => Math.abs(r.sol.pitchDeg)));
        Object.assign(res, { drop_m: dz, h1_m: h1, U1_ms: U1, Fr1, h2_m: h2, U2_ms: U2, jumpHeight_m: jumpH, roller_m: Lr, tailwater_m: h0, retentive, keeper,
          maxPitchDeg: maxPitch, minDeckClearance_in: minDeck, capsizePositions: cap, pinForce_lb: pinLb(U1), boatLength_m: boatLenM,
          motion: scan.map(r => ({ s0: r.s0, ok: r.sol.ok, d: r.sol.d, t: r.sol.t, p: r.sol.p })) });
        const wid = 'ww.drop:' + f.id;
        W(wid, 'Energy: h₀ + U₀²/2g + Δz = h₁ + q²/(2g h₁²);  Fr₁ = U₁/√(g h₁);  Bélanger: h₂/h₁ = ½(√(1 + 8 Fr₁²) − 1);  roller ≈ 6 h₂', [
          `Class ${f.cls} drop Δz = ${o.dropFt[f.cls]} ft = ${n(dz, 2)} m (assumed); q = Q ÷ b = ${n(q, 3)} m²/s`,
          `Above: h₀ = ${n(h0, 3)} m, U₀ = ${n(U0, 2)} m/s → energy E = ${n(E1, 3)} m (losses ignored: the fastest jet)`,
          `Foot of the drop: h₁ = ${n(h1, 3)} m, U₁ = ${n(U1, 2)} m/s (${n(U1 * 2.23694, 1)} mph), Fr₁ = ${n(Fr1, 2)}`,
          `Jump: h₂ = ${n(h1, 3)}/2 × (√(1 + 8 × ${n(Fr1, 2)}²) − 1) = ${n(h2, 3)} m; face height h₂ − h₁ = ${n(jumpH, 2)} m (${n(jumpH * FT_PER_M, 1)} ft); U₂ = ${n(U2, 2)} m/s`,
          `Roller length ≈ ${o.rollerFactor} × h₂ = ${n(Lr, 2)} m (${n(Lr * FT_PER_M, 1)} ft) vs boat ${n(boatLenM, 2)} m`,
          `Tailwater h₀ = ${n(h0, 3)} m ${retentive ? '≥' : '<'} h₂ = ${n(h2, 3)} m → ${retentive ? 'the jump stays put: a retentive hole' : 'the jump is pushed downstream: it flushes into waves'}`,
          `Boat balanced at ${scan.length} positions climbing the face: largest trim ${n(maxPitch, 1)}°, lowest deck clearance ${n(minDeck, 1)}"${cap ? `, ${cap} positions with no balance` : ''}`],
          'Water speeds up down the drop, then slams into slower water and piles up in a hydraulic jump (the hole). A hole longer than the boat that the tailwater holds in place can keep a boat surfing in it. Drop heights at the venue are not published; measure or estimate them from video and change the setting.');
        if (cap) { lv('error'); warn('error', f.id, `${f.name} (Class ${f.cls}): capsizes or goes under climbing the hole`, 'The face is too steep for the boat. Add bow flotation or move weight aft.', wid); }
        if (minDeck < 0) { lv('warn'); warn('warn', f.id, `${f.name} (Class ${f.cls}): bow buries in the hole (${n(-minDeck, 1)}" of water over the deck)`, 'Hit it straight and fast with the crew leaning back; a pointed, raised bow helps.', wid); }
        if (keeper) { lv('error'); warn('error', f.id, `${f.name} (Class ${f.cls}): retentive hole longer than the boat (${n(Lr * FT_PER_M, 0)} ft vs ${n(boatLenM * FT_PER_M, 0)} ft)`, 'The boat can get stuck surfing in it. Hit it with speed and paddle through.', wid); }
        else if (retentive) { lv('warn'); warn('warn', f.id, `${f.name} (Class ${f.cls}): retentive hole`, 'The boat is longer than the roller, so it should punch through with speed.', wid); }
      }
      // broadside pin against a rock or wall at the feature's speed
      const U = f.type === 'drop' ? res.U1_ms : res.U_ms;
      if (U) {
        W('ww.pin:' + f.id, 'F = ½ · ρ · v² · (Cd · A_side)', [`v = ${n(U, 2)} m/s = ${n(U * FT_PER_M, 2)} ft/s`, `Cd·A_side = ${n(E.drag.CdAside, 2)} ft² (from the drag numbers)`, `F = ½ × ${RHO} × ${n(U * FT_PER_M, 2)}² × ${n(E.drag.CdAside, 2)} = ${n(res.pinForce_lb, 0)} lb`],
          'If the boat turns sideways and pins on a rock or wall, the current pushes it with this force. It is flagged when it is more than the whole loaded boat weighs (a rule of thumb, not a strength limit).');
        if (res.pinForce_lb > still.W) { lv('warn'); warn('warn', f.id, `${f.name} (Class ${f.cls}): ${n(res.pinForce_lb, 0)} lb broadside pinning force, more than the loaded boat weighs (${n(still.W, 0)} lb)`, 'Turned sideways against a rock or wall, the current holds the boat there. Keep it pointed downstream.', 'ww.pin:' + f.id); }
      }
      features.push(res);
    });
    if (!warnings.some(w => w.level === 'error' || w.level === 'warn')) warn('ok', null, 'No whitewater warnings at these settings', 'The boat balances on every wave and hole position tested.');
    return { options: o, hydraulics: { h_m: hy.h_m, U_ms: hy.U_ms, q_m2s: hy.q_m2s, Fr: hy.Fr, channel: { name: ch.name, length_m: ch.length_m, drop_m: ch.drop_m, slope: ch.slope, flow_m3s: ch.flow_m3s, notModeled: ch.notModeled } },
      periods: { pitch_s: Tp, roll_s: Tr, rPitch_in: rP, rRoll_in: rR }, boat: { weight_lb: still.W, draft_in: still.d, gmRoll_in: still.gmRoll, gmPitch_in: still.gmPitch, length_m: boatLenM, drums: g.drums.length },
      features, warnings, work, assumptions: WW_ASSUMPTIONS(o), sources: SOURCES };
  }
  const srcs = ks => ks.map(k => { if (!SOURCES[k]) throw new Error(`Unknown source "${k}"`); return Object.assign({ id: k }, SOURCES[k]); });
  const WW_ASSUMPTIONS = o => [
    { name: 'Channel data', used: 'Competition: 300 m, 6.4 m drop, 2.1%, 15 m³/s. Wilderness: 550 m, 6.4 m, 1.2%, 19 m³/s', source: 'Published', effect: 'Sourced.', refs: srcs(['usnwc', 's2o']) },
    { name: 'Channel width', used: `${o.width_m} m`, source: 'Not published for USNWC; Olympic slalom channels are about 12 m', effect: 'Narrower → deeper, faster water and shorter waves.', refs: srcs(['slalomWidth']) },
    { name: 'Manning roughness n', used: `${o.manningN}`, source: 'Boulder-lined channels are rough (n roughly 0.04–0.07)', effect: 'Lower n → faster, shallower water.', refs: srcs(['manning', 'roughness']) },
    { name: 'Class wave heights', used: `II: ${o.waveFt.II} ft, III: ${o.waveFt.III} ft`, source: 'II: up to 3 ft; III: irregular, 3–5 ft', effect: 'Top of each range (worst case).', refs: srcs(['isrd', 'class3waves']) },
    { name: 'Drop heights', used: `II: ${o.dropFt.II} ft, III: ${o.dropFt.III} ft`, source: 'Not published', effect: 'Estimate from video or on site; higher drops give bigger holes.', refs: srcs(['videoBYOB2017', 'videoBYOB', 'newsBYOB2022']) },
    { name: 'Hole roller length', used: `${o.rollerFactor} × downstream depth`, source: '4 to 6.2 × downstream depth', effect: 'High side: a longer hole is more likely to hold the boat.', refs: srcs(['hydraulicJump']) },
    { name: 'Wave forces', used: 'Quasi-static: each slice floats at the local water level, plus the Froude–Krylov push down the slope', source: 'Hull balanced on a wave; beam-sea roll moment W·GM·k·ζ', effect: 'Leaves out wave-motion dynamics, fast flow in crests, splash and impact; real motion can be larger.', refs: srcs(['hogSag', 'froudeKrylov', 'waveSlope']) },
    { name: 'Pinning flag', used: 'Broadside force > loaded weight', source: 'Rule of thumb (no standard)', effect: 'A comparison, not a strength limit.', refs: srcs(['dragEq']) },
    { name: 'Wave steepness', used: 'Class height at H/λ ≤ 0.142 (deep-water breaking limit)', source: 'Miche criterion', effect: 'Steepest case for that height, so trim and deck wetting are on the high side.', refs: srcs(['miche']) },
    { name: 'Capsize on a wave', used: 'No balance, or more than 60° of trim or heel', source: 'Modeling choice: riding a 24° wave face is not capsizing', effect: 'Flat-water checks still use 25°.', refs: srcs(['capsizing']) },
    { name: 'Natural periods', used: 'No added mass', source: 'T = 2π r ÷ √(g GM)', effect: 'Real periods are somewhat longer, which shifts resonance.', refs: srcs(['metacentric', 'resonance']) },
  ];

  // Plain-language summary for download and the report.
  function whitewaterMarkdown(ww, meta) {
    const n = (v, d = 1) => v == null || !isFinite(v) ? '—' : (+v).toFixed(d), icon = { error: '❌', warn: '⚠️', info: 'ℹ️', ok: '✅' };
    const H = ww.hydraulics, f = ww.features;
    if (!ww.boat) return `# Whitewater simulation: ${H.channel.name}

${meta && meta.generated ? `Generated ${meta.generated}. ` : ''}Not simulated: the boat does not float level in still water with this load.

${(ww.warnings || []).map(w => `- ${icon[w.level] || ''} **${w.title}** ${w.detail || ''}`).join('\n')}
`;
    return `# Whitewater simulation: ${H.channel.name}

${meta && meta.generated ? `Generated ${meta.generated}. ` : ''}Classes simulated: ${ww.options.classes.join(', ')}. Boat: ${n(ww.boat.weight_lb, 0)} lb loaded, ${ww.boat.drums} drums, ${n(ww.boat.length_m * FT_PER_M, 1)} ft long, roll GM ${n(ww.boat.gmRoll_in, 1)}", pitch GM ${n(ww.boat.gmPitch_in, 1)}".

## Warnings

${ww.warnings.map(w => `- ${icon[w.level]} **${w.title}**${w.detail ? ` — ${w.detail}` : ''}`).join('\n')}

## Channel

${H.channel.length_m} m long, ${H.channel.drop_m} m drop (slope ${H.channel.slope}), ${H.channel.flow_m3s} m³/s. With a ${ww.options.width_m} m width and Manning n ${ww.options.manningN}: depth ${n(H.h_m, 2)} m, current ${n(H.U_ms, 2)} m/s (${n(H.U_ms * 2.23694, 1)} mph), Froude number ${n(H.Fr, 2)}.${H.channel.notModeled ? ' ' + H.channel.notModeled : ''}

Natural periods (no added mass): pitch ${n(ww.periods.pitch_s, 2)} s, roll ${n(ww.periods.roll_s, 2)} s.

## Features

| Feature | Class | Type | Key numbers | Result |
|---|---|---|---|---|
${f.map(x => `| ${x.name} | ${x.cls} | ${x.type} | ${x.type === 'waves' ? (x.lambda_m ? `H ${n(x.H_m * FT_PER_M, 1)} ft${x.breaking ? ' (breaking)' : ''}, λ ${n(x.lambda_m * FT_PER_M, 1)} ft, trim ${n(x.maxPitchDeg, 0)}°, heel ${n(x.maxRollDeg, 0)}°, deck clearance ${n(x.minDeckClearance_in, 1)}"` : 'no standing waves') : `drop ${n(x.drop_m * FT_PER_M, 1)} ft, jet ${n(x.U1_ms * 2.23694, 1)} mph, hole ${n(x.jumpHeight_m * FT_PER_M, 1)} ft high × ${n(x.roller_m * FT_PER_M, 0)} ft long, ${x.retentive ? 'retentive' : 'flushing'}`}; pin ${n(x.pinForce_lb, 0)} lb | ${icon[x.level]} |`).join('\n')}

## How each number was worked out

${Object.entries(ww.work).map(([id, w]) => `### ${id}

**${w.formula}**

${w.steps.map((t, i) => `${i + 1}. ${t}`).join('\n')}

${w.why}

Sources: ${w.refs.map(r => `[${r.kind}: ${r.title}](${r.url})`).join(' · ')}`).join('\n\n')}

## Assumptions

| Assumption | Used | Sources say | Effect |
|---|---|---|---|
${ww.assumptions.map(x => `| ${x.name} | ${x.used} | ${x.source} | ${x.effect} |`).join('\n')}

## Limits

- Quasi-static: the boat is balanced on the water surface at each position. Fast flow, splash, impacts and paddling are left out.
- Wave and drop sizes come from the class definitions and estimates, not measurements at the venue.
- Use this to compare designs and spot weak points, not as a guarantee. Wear the venue's PFDs and helmets.
`;
  }
  // The downloadable JSON artifact: inputs, results, assumptions and sources (no parts receipts or personal data).
  function whitewaterArtifact(build, ww, meta) {
    return {
      kind: 'bob-whitewater-simulation', version: 1, generated: meta && meta.generated || null,
      design: { preset: build.config.preset, config: build.config },
      options: ww.options, hydraulics: ww.hydraulics, periods: ww.periods, boat: ww.boat,
      features: ww.features, warnings: ww.warnings, work: ww.work, assumptions: ww.assumptions,
      sources: Object.entries(ww.sources).map(([id, s]) => Object.assign({ id }, s)),
    };
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
    // Float test (qualification): the boat must float with its crew aboard
    {
      const q = rules && rules.qualification, when = q ? ` (${[q.date, q.time].filter(Boolean).join(', ')})` : '', n = c.crew.count;
      const fails = !sol.ok ? (sol.reason === 'sinks' ? `sinks: ${sol.W.toFixed(0)} lb on ${sol.maxLb.toFixed(0)} lb of lift` : 'tips over') : !sol.stableRoll ? `tips over (GM ${sol.gmRoll.toFixed(1)}")` : sol.deckClearance < 0 ? `deck ${(-sol.deckClearance).toFixed(1)}" under water` : null;
      if (fails) rulesOut.push({ level: 'error', id: 'floatTest', title: `Float test${when}: fails with ${n} crew`, detail: `It ${fails}.${isFlooded(c) ? ' The drums are flooded: plug the holes (no metal: no screws) and drain them.' : ''}` });
      else rulesOut.push({ level: sol.deckClearance < FLOOD_MIN_CLEAR ? 'warn' : 'ok', id: 'floatTest', title: `Float test${when}: floats with ${n} crew, deck ${sol.deckClearance.toFixed(1)}" above the water`, detail: `GM ${sol.gmRoll.toFixed(1)}".` });
    }
    const parts = build.parts || [];
    const cost = parts.reduce((s, p) => s + (+p.quantity || 0) * (+p.unit_cost_usd || 0), 0);
    const spent = parts.filter(isBought).reduce((s, p) => s + (+p.quantity || 0) * (+p.unit_cost_usd || 0), 0);
    const flood = isFlooded(g.config) ? floodAdvice(build, g) : null;
    const recs = recommend({ build, g, req, wt, sol, fwd, side, leaks, rulesOut, crewW, flood });
    if (g.cageUnsupported) recs.push({ level: 'warn', title: 'The cage is only modeled for lengthwise drums', detail: 'Crosswise drums use zip-tie bands here. Switch to a lengthwise layout to compare a caged build.' });
    const plan = paintPlan(g.config, build.parts);
    if (plan) {
      const short = plan.colors.filter(b => b.cans > b.have);
      recs.push({ level: short.length ? 'warn' : 'info', title: `Paint plan: ${plan.area.toFixed(1)} sq ft painted (~${(plan.area * PAINT_LB_PER_SQFT).toFixed(1)} lb)`,
        detail: plan.colors.map(b => `${b.paint || b.color}: ${b.area.toFixed(1)} sq ft on ${b.parts} part${b.parts > 1 ? 's' : ''}, ~${b.cans} can${b.cans > 1 ? 's' : ''} for one coat (${b.have} on the list)`).join('; ') + '.' + (short.length ? ' Buy more of: ' + short.map(b => b.paint || b.color).join(', ') + '.' : '') });
    }
    const decals = decalPlan(g.config, g);
    if (decals) recs.push({ level: 'info', title: `Decals: ${g.config.decals.length} placed in the 3D view`, detail: 'To buy (optional, in Next shopping trip): ' + decals.map(d => `${d.qty} ${d.unit}${d.qty > 1 ? 's' : ''} of ${d.name}`).join('; ') + '. Use waterproof outdoor vinyl, and press it onto clean, dry, scuffed plastic so it stays on in the rapids.' });
    if (g.platform) {
      const nL = req.platformLashings || 0, tl = (build.parts || []).filter(p => p.role === 'zip-tie').map(p => +p.length_in || 0), ok = tl.filter(t => t >= LASH_TIE_MIN_IN && t <= 18);
      if (!nL) recs.push({ level: 'warn', title: 'The platform rests on nothing it can be tied to', detail: 'No platform pipe crosses a box top rail. Move the cross members over the boxes, or the deck will slide off.' });
      else recs.push({ level: ok.length ? 'info' : 'warn', title: `Platform joins the boxes at ${nL} crossings (${req.platformLashTies} zip ties)`,
        detail: `The platform sits one pipe diameter above the box top rails, so it can't use their fittings. Cross-lash each crossing with ${PLATFORM_TIES_PER_CROSSING} ties in an X (labels L1–L${nL} in 🏷️ IDs). Each tie must be at least ${LASH_TIE_MIN_IN}" long to go around both pipes, and at most 18" by the rules; trim flush. ${ok.length ? `The ${Math.max(...ok)}" ties on the parts list work.` : `None of the ties on the parts list fit (${[...new Set(tl)].map(t => t + '"').join(', ') || 'none listed'}): buy ${LASH_TIE_MIN_IN}–18" ties.`} Fewer crossings means more sliding; the platform's middle members only hold where they cross a box.` });
    }
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
    const result = { placement, shopping, geometry: g, requirements: req, weights: wt, solution: sol, scenarios: { crewForward: fwd, crewSide: side, leaks }, rules: rulesOut, recommendations: recs, cost, spent, crewWeight: crewW, engineering: eng, flood };
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
    const fl = a.flood;
    if (fl) {
      const pct = (+c.floodPct).toFixed(0), sealed = fl.rows[0], f1 = v => (+v).toFixed(1);
      const state = r => !r.ok ? (r.reason === 'sinks' ? `sinks (${r.W.toFixed(0)} lb on ${r.maxLb.toFixed(0)} lb of lift)` : 'tips over') : `deck ${f1(r.deckClearance)}" above the water, GM ${f1(r.gmRoll)}"`;
      if (c.floodVented) add(fl.current.usable ? 'warn' : 'error', `Drums open to the river (holes top and bottom, or caps open): only the ${fl.noodles} noodles in each drum lift`, `Water inside an open drum stands at the river level and weighs nothing in the water, so it does not lower the centre of gravity; it only takes the drum's lift away. With ${fl.noodles} noodles per drum (${fl.noodlePct.toFixed(0)}% of it): ${state(fl.current)}. Sealed: ${state(sealed)}.`);
      else add(!fl.current.usable ? 'error' : fl.current.gmRoll >= sealed.gmRoll ? 'info' : 'warn', `Drums ${pct}% flooded, caps closed: ${state(fl.current)}`, `The trapped air holds the water in, so it rides along as ${(fl.current.W - sealed.W).toFixed(0)} lb of ballast low in the drums. But the boat sinks deeper, where the drums are narrower at the water line, and the loose water slides to the low side (free-surface effect). Sealed and dry: ${state(sealed)}.`);
      if (!c.floodVented) add(fl.best && fl.best.floodPct === +c.floodPct ? 'ok' : 'warn', fl.best ? `Most stable flood level: ${fl.best.floodPct}% (GM ${f1(fl.best.gmRoll)}", deck ${f1(fl.best.deckClearance)}" clear)` : 'No flood level keeps the deck clear and the boat upright',
        `Caps closed, crew as set. ${fl.rows.map(r => `${r.floodPct}%: ${r.ok ? `GM ${f1(r.gmRoll)}", deck ${f1(r.deckClearance)}"` : r.reason}`).join(' · ')}. Usable = upright with at least ${fl.minClear}" of deck clearance.`);
      const lead = c.floodVented ? 'With holes top and bottom' : 'If the trapped air escapes';
      add(fl.airLost.usable ? 'ok' : 'error', fl.airLost.usable ? `${lead}, the noodles hold it up (${fl.noodles} per drum)` : `${lead}, ${fl.noodles} noodles per drum ${fl.airLost.ok ? 'leave the deck awash' : 'cannot hold the boat up'}`,
        `${c.floodVented ? 'Air leaves through the top holes and the drums fill to the river level.' : 'Air gets out through an open cap, a crack at the top, or holes that roll above the water.'} Then only the noodles lift: ${state(fl.airLost)}. ${fl.noodlesNeeded == null ? `Even ${fl.maxNoodles} noodles per drum (completely full) are not enough with this crew.` : `Needed: at least ${fl.noodlesNeeded} noodles per drum (${(fl.noodlesNeeded * fl.perNoodlePct).toFixed(0)}% of each drum) for ${fl.minClear}" of deck clearance${fl.noodlesNeeded > fl.noodles ? `, ${fl.noodlesNeeded - fl.noodles} more than now` : ''}.`} Sealing the holes gives back the full lift; the rules ban metal, so plug them with plastic, hot glue or foam, not screws.`);
      if (fl.noodles > 0 && +c.floodPct > fl.maxFloodPct) add('info', `The noodles leave room for only ${fl.maxFloodPct.toFixed(0)}% water`, `${fl.noodles} noodles take ${fl.noodlePct.toFixed(0)}% of each drum, so it cannot flood past ${fl.maxFloodPct.toFixed(0)}%; the model uses that.`);
    }
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
    if (!fwd.ok || fwd.bowFreeboard < 2) add('warn', 'Nose-dive risk with crew at the bow', !fwd.ok ? 'Moving the crew forward overwhelms the bow.' : `Bow clearance drops to ${fwd.bowFreeboard.toFixed(1)}" (${Math.abs(fwd.pitchDeg).toFixed(0)}° bow-down)${fwd.stableRoll ? '' : ', and with the bow drum buried the boat also loses side-to-side stability'}. Consider the Triangle or Pontoon preset, a drum further forward, or crew seated aft of center.`);
    if (!side.ok || !side.stableRoll || Math.abs(side.rollDeg) > 8) add('warn', 'Leaning crew heels the boat hard', side.ok ? (side.stableRoll ? `${Math.abs(side.rollDeg).toFixed(0)}° heel with crew at the deck edge.` : 'With crew at the deck edge it tips until the frame or a drum catches.') : 'Crew at the deck edge capsizes it.');
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
    if (g.fitted || g.boxes) {
      const short = g.fitted ? req.cuts.filter(k => k.len < 2) : [];
      if (short.length) add('error', 'Some pipe runs are shorter than 2" between fittings', 'Fittings would touch. Spread the beams or pontoons further apart.');
      add('info', `Cut lengths assume ${c.fittingTakeoff}" fitting take-off${c.cutAllowance ? ` and ${c.cutAllowance}" extra on every cut` : ''}`, `Dry-fit one tee and measure center-to-socket-bottom, then set the take-off to match before cutting.${c.cutAllowance ? ` Each pipe is cut ${c.cutAllowance}" long (the stick count includes it): dry-fit, mark, and trim before gluing, because a glued joint hammered home seats deeper or shallower than planned.` : ' Consider a cut allowance: glued joints hammered home seat differently than planned.'}`);
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
    segArea, segWidth, segCentroidY, drumMaxLb, floodAdvice, floodFloor, EXTRA_TYPES, FITTING_ROLES, extraWeights, labelParts, LASH_TIE_MIN_IN, PLATFORM_TIES_PER_CROSSING, SOURCES, WORK_REFS, ASSUMPTIONS, RHO, NU_WATER, PADDLER_W, DYNAMIC,
    whitewater, whitewaterMarkdown, whitewaterArtifact, whitewaterHydraulics, manningDepth, standingWaveK, supercriticalDepth, belanger, WW_CHANNELS, WW_CLASS, WW_DEFAULTS, G_SI,
  };
});
