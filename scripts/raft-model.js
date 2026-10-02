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
  const PIPE_R = 0.95;                // 1-1/2" Sch 40 OD 1.9"
  const PIPE_ID_AREA = Math.PI * (1.61 / 2) ** 2;
  const RAIL_OFFSET = 6;              // rails sit 6" either side of a pontoon line
  const STOCK = 120;                  // 10 ft pipe sticks
  const SHEET = { w: 48, l: 96 };
  const FOAM_IN3_PER_CAN = 600;       // conservative 12 oz expanding-foam yield
  const SEATED_CG = 10;               // crew CG above deck top
  const SLICES = 12;

  const PRESETS = {
    cat2: {
      label: 'Catamaran: 2 drums', drums: 2,
      blurb: 'Lightest. One drum per side, so there is no redundancy and the boat is pitch-sensitive with a long frame.',
      layout: c => [-1, 1].map(s => ({ x: c.drumOffset, z: s * c.pontoonSpacing / 2 })),
    },
    tri3inline: {
      label: 'Trimaran: 3 drums side by side', drums: 3,
      blurb: 'Adds a center drum. ~50% more lift and survives losing one drum. Same pitch behavior as the catamaran.',
      layout: c => [-1, 0, 1].map(s => ({ x: c.drumOffset, z: s * c.pontoonSpacing / 2 })),
    },
    tri3bow: {
      label: 'Triangle: bow drum + 2 stern drums', drums: 3,
      blurb: 'Spreads drums fore and aft, which resists nose-diving in waves. Bow lift and stern lift differ, so trim it with crew position.',
      layout: c => [
        { x: c.drumOffset + c.drumSpread, z: 0 },
        { x: c.drumOffset - c.drumSpread, z: -c.pontoonSpacing / 2 },
        { x: c.drumOffset - c.drumSpread, z: c.pontoonSpacing / 2 },
      ],
    },
    quad4pontoon: {
      label: 'Pontoon: 4 drums (2 per side)', drums: 4,
      blurb: 'Original render. Most lift and best pitch stability, at ~40 lb more than the catamaran.',
      layout: c => {
        const hx = DRUM.len / 2 + 0.5;
        const out = [];
        [-1, 1].forEach(s => [-hx, hx].forEach(x => out.push({ x: c.drumOffset + x, z: s * c.pontoonSpacing / 2 })));
        return out;
      },
    },
    quad4wide: {
      label: 'Wide raft: 4 drums across', drums: 4,
      blurb: 'Very stable side to side, but wide and short fore-aft, so it pitches like the catamaran. Needs longer beams.',
      layout: c => {
        const step = Math.max(c.pontoonSpacing / 3, DRUM.dia + 1);
        return [-1.5, -0.5, 0.5, 1.5].map(k => ({ x: c.drumOffset, z: k * step }));
      },
    },
  };

  const DEFAULT_CONFIG = {
    preset: 'cat2', frameStyle: 'stacked', fittingTakeoff: 1.25, frameLength: 84, frameWidth: 72, beamCount: 4, pontoonSpacing: 47,
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
  const r = DRUM.dia / 2;
  function segArea(h) {
    h = Math.min(Math.max(h, 0), 2 * r);
    const a = r - h;
    return r * r * Math.acos(a / r) - a * Math.sqrt(Math.max(0, 2 * r * h - h * h));
  }
  function segCentroidY(h) { // height of segment centroid above drum bottom
    h = Math.min(Math.max(h, 0), 2 * r);
    const A = segArea(h);
    if (A < 1e-9) return 0;
    return r - (2 * Math.pow(Math.max(0, 2 * r * h - h * h), 1.5)) / (3 * A);
  }
  function segWidth(h) {
    if (h <= 0 || h >= 2 * r) return 0;
    return 2 * Math.sqrt(2 * r * h - h * h);
  }
  const drumMaxLb = () => Math.PI * r * r * DRUM.len * WATER;

  // ── Geometry ──
  function geometry(cfgIn) {
    const c = withDefaults(cfgIn);
    const raw = Array.isArray(c.drums) ? c.drums : PRESETS[c.preset].layout(c);
    const drums = raw.map((d, i) => ({ id: i, x: d.x, z: d.z, failed: c.failedDrum === i }));
    const lines = [...new Set(drums.map(d => +d.z.toFixed(2)))].sort((a, b) => a - b);
    // stacked: rails rest on the drums, beams lashed on top (the render).
    // fitted: rails and beams in one plane joined by tees/crosses, sitting on the drum tops.
    const fitted = c.frameStyle === 'fitted';
    const railY = fitted ? 2 * r + PIPE_R : r + Math.sqrt(r * r - RAIL_OFFSET * RAIL_OFFSET) + PIPE_R;
    const beamY = fitted ? railY : railY + 2 * PIPE_R;
    const deckBottom = beamY + PIPE_R;
    const deckTop = deckBottom + c.deck.thickness;
    const L = c.frameLength;
    const rails = [];
    lines.forEach(z => [-1, 1].forEach(s => rails.push({ z: z + s * RAIL_OFFSET, x0: -L / 2, x1: L / 2 })));
    const n = Math.max(2, Math.round(c.beamCount));
    const inset = fitted ? 0 : Math.min(6, L / 4);
    const beams = Array.from({ length: n }, (_, i) => -L / 2 + inset + i * (L - 2 * inset) / (n - 1));
    const outerZ = Math.max(...rails.map(rl => Math.abs(rl.z)));
    const W = fitted ? 2 * outerZ : c.frameWidth;
    const bow = c.bow ? {
      x0: L / 2, x1: L / 2 + c.bowStrut, topY: railY + c.bowRiser, z: outerZ,
    } : null;
    const xs = [-L / 2, L / 2 + (bow ? c.bowStrut + PIPE_R : 0)];
    drums.forEach(d => { xs.push(d.x - DRUM.len / 2, d.x + DRUM.len / 2); });
    const zs = [-W / 2, W / 2];
    drums.forEach(d => zs.push(d.z - r, d.z + r));
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
      if (Math.abs(a.z - b.z) < DRUM.dia && Math.abs(a.x - b.x) < DRUM.len) overlaps.push([i, j]);
    }
    return {
      config: c, fitted, frameWidth: W, drums, lines, rails, beams, railY, beamY, deckBottom, deckTop, bow, outerZ,
      mastTop, wallHeight: Math.max(0, wallTop - deckTop), overall, overlaps,
      beamsTooShort: !fitted && outerZ + PIPE_R > W / 2,
      drumsOffFrame: drums.some(d => d.x - DRUM.len / 2 < -L / 2 - 1 || d.x + DRUM.len / 2 > L / 2 + 1),
    };
  }

  // ── Material requirements derived from geometry ──
  function binPack(cuts) {
    const sticks = [];
    [...cuts].sort((a, b) => b.len - a.len).forEach(cut => {
      const s = sticks.find(st => st.left >= cut.len + 0.125);
      if (s) { s.cuts.push(cut); s.left -= cut.len + 0.125; }
      else sticks.push({ cuts: [cut], left: STOCK - cut.len });
    });
    return sticks;
  }
  function sheetsFor(len, wid, pieces) {
    const per = Math.max(
      Math.floor(SHEET.w / wid) * Math.floor(SHEET.l / len),
      Math.floor(SHEET.w / len) * Math.floor(SHEET.l / wid));
    if (per > 0) return Math.ceil(pieces / per);
    return Math.ceil(pieces * len * wid * 1.15 / (SHEET.w * SHEET.l));
  }
  function requirements(g) {
    const c = g.config;
    const cuts = [];
    const fit = { cross: 0, tee: 0, elbow: 0 };
    if (g.fitted) {
      // Pipe runs between fitting centers, minus the take-off at each end.
      const k = c.fittingTakeoff || 0;
      const zs = g.rails.map(rl => rl.z).sort((a, b) => a - b), xs = g.beams;
      g.rails.forEach((rl, i) => { for (let j = 0; j < xs.length - 1; j++) cuts.push({ label: `rail ${i + 1}.${j + 1}`, len: +(xs[j + 1] - xs[j] - 2 * k).toFixed(2) }); });
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
    const sticks = binPack(cuts);
    const pipeLen = cuts.reduce((s, k) => s + k.len, 0);
    const crossings = g.fitted ? 0 : g.rails.length * g.beams.length;
    const bandTies = Math.ceil((2 * Math.PI * r + 8) / 13) * 2;
    const ties = crossings * 2 + g.drums.length * bandTies + g.beams.length * 4 + (g.bow ? 10 : 0) + (c.mastHeight > 0 ? 6 : 0);
    const layers = Math.max(1, Math.round(c.deck.thickness - 0.3));
    const bowGuardArea = g.bow ? 2 * (g.outerZ + PIPE_R) * (c.bowStrut + c.bowRiser) * 1.3 : 0;
    const coroArea = 2 * c.deck.length * c.deck.width + bowGuardArea;
    return {
      cuts, sticks, pipeLength_in: pipeLen,
      items: {
        drum: g.drums.length,
        pipe: sticks.length,
        elbow: fit.elbow,
        tee: fit.tee,
        cross: fit.cross,
        coupling: g.bow ? 1 : 0,
        'zip-tie': Math.ceil(ties * 1.15 / 100),      // packs of 100, 15% spare
        xps: sheetsFor(c.deck.length, c.deck.width, layers),
        coroplast: Math.ceil(coroArea * 1.15 / (SHEET.w * SHEET.l)),
        'spray-foam': Math.ceil(pipeLen * PIPE_ID_AREA / FOAM_IN3_PER_CAN),
        cement: g.bow || g.fitted ? 1 : 0,
      },
      tieCount: ties,
    };
  }

  // ── Weight & mass distribution ──
  const FRAME_ROLES = new Set(['pipe', 'pipe-large', 'elbow', 'coupling', 'tee', 'cross', 'wye', 'cleanout-tee', 'spray-foam', 'zip-tie', 'cement', 'epoxy', 'sealant', 'rope', 'mast']);
  const DECK_ROLES = new Set(['xps', 'coroplast', 'plywood']);
  const boatParts = parts => (parts || []).filter(p => p.role !== 'tool' && p.category !== 'tools');

  function weights(build, g) {
    const parts = boatParts(build.parts);
    const drumPart = parts.find(p => p.role === 'drum');
    const drumEach = drumPart ? +drumPart.weight_lb_each || DRUM.emptyWeight : DRUM.emptyWeight;
    let total = g.drums.length * drumEach, measured = g.drums.length * drumEach * (drumPart && drumPart.weight_measured ? 1 : 0);
    const byRole = { drum: g.drums.length * drumEach };
    parts.filter(p => p.role !== 'drum').forEach(p => {
      const w = (+p.quantity || 0) * (+p.weight_lb_each || 0);
      total += w; if (p.weight_measured) measured += w;
      byRole[p.role] = (byRole[p.role] || 0) + w;
    });
    return { total, measured, drumEach, byRole, measuredShare: total ? measured / total : 0 };
  }

  function massItems(build, g, crewOverride) {
    const c = g.config, crew = Object.assign({}, c.crew, crewOverride || {});
    const wt = weights(build, g);
    const items = g.drums.map(d => ({ w: wt.drumEach, x: d.x, y: r, z: d.z, label: 'drum' }));
    let frameW = 0, deckW = 0, topW = 0;
    boatParts(build.parts).filter(p => p.role !== 'drum').forEach(p => {
      const w = (+p.quantity || 0) * (+p.weight_lb_each || 0);
      if (FRAME_ROLES.has(p.role)) frameW += w; else if (DECK_ROLES.has(p.role)) deckW += w; else topW += w;
    });
    const fx = g.bow ? c.bowStrut * 0.15 : 0;
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
    const out = [], dl = DRUM.len / SLICES;
    g.drums.filter(d => !d.failed).forEach(d => {
      for (let k = 0; k < SLICES; k++) out.push({ x: d.x - DRUM.len / 2 + (k + 0.5) * dl, z: d.z, dl, drum: d.id });
    });
    return out;
  }
  function forces(sl, d, t, p) {
    let F = 0, Mx = 0, Mz = 0;
    for (const s of sl) {
      const b = segArea(d - s.x * t - s.z * p) * s.dl * WATER;
      F += b; Mx += b * s.x; Mz += b * s.z;
    }
    return { F, Mx, Mz };
  }

  function solve(g, items) {
    const sl = slicesOf(g);
    const W = items.reduce((s, i) => s + i.w, 0);
    const xg = items.reduce((s, i) => s + i.w * i.x, 0) / W;
    const zg = items.reduce((s, i) => s + i.w * i.z, 0) / W;
    const KG = items.reduce((s, i) => s + i.w * i.y, 0) / W;
    const maxLb = sl.reduce((s, k) => s + Math.PI * r * r * k.dl * WATER, 0);
    const base = { W, xg, zg, KG, maxLb, loadPct: maxLb ? (W / maxLb) * 100 : Infinity };
    if (!sl.length || W >= maxLb * 0.995) return Object.assign(base, { ok: false, reason: 'sinks' });
    const span = Math.max(1, ...sl.map(s => Math.abs(s.x)), ...sl.map(s => Math.abs(s.z)));
    // initial heave by bisection at level trim
    let lo = 0, hi = 2 * r;
    for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; forces(sl, m, 0, 0).F < W ? lo = m : hi = m; }
    let v = [lo, 0, 0];
    const resid = x => { const f = forces(sl, x[0], x[1], x[2]); return [(f.F - W) / W, (f.Mx - W * xg) / (W * span), (f.Mz - W * zg) / (W * span)]; };
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
      const hh = hAt(s.x, s.z), a = segArea(hh), vol = a * s.dl;
      V += vol; KBm += vol * segCentroidY(hh);
      const w = segWidth(hh), wa = w * s.dl;
      A += wa; Ax += wa * s.x; Az += wa * s.z;
      Izz += wa * s.z * s.z + s.dl * w ** 3 / 12;   // roll (about x axis)
      Ixx += wa * s.x * s.x + w * s.dl ** 3 / 12;   // pitch (about z axis)
      const pd = perDrum[s.drum] || (perDrum[s.drum] = { min: Infinity, max: -Infinity, lb: 0 });
      pd.min = Math.min(pd.min, hh); pd.max = Math.max(pd.max, hh); pd.lb += vol * WATER;
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
    return Object.assign(base, {
      ok: true, d, t, p, pitchDeg, rollDeg, perDrum,
      maxDraft: Math.max(...drafts), meanDraft: d,
      minFreeboard: Math.min(...freeboards), bowFreeboard, sternFreeboard,
      gmRoll, gmPitch, KB, waterplaneArea: A,
      buoyancyCenterX: g.drums.filter(x => !x.failed).reduce((s, x) => s + x.x, 0) / Math.max(1, g.drums.filter(x => !x.failed).length),
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
  const SINKS = new Set(['cotton-canvas', 'nylon', 'foam-fabric', 'polyester']);
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
    const pipes = parts.filter(p => ['pipe', 'pipe-large', 'elbow', 'coupling', 'tee', 'cross', 'wye', 'cleanout-tee', 'mast'].includes(p.role) && p.material === 'pvc');
    const hasFoam = parts.some(p => p.role === 'spray-foam' && p.quantity > 0);
    const unfilled = pipes.filter(p => !p.foam_filled);
    if (pipes.length && (!hasFoam || unfilled.length)) add('error', 'float', 'PVC sinks: every pipe and fitting must be foam-filled so broken pieces float', unfilled.length ? unfilled.map(p => p.name).join('; ') : 'Add expanding spray foam to the parts list.');
    const sinkers = parts.filter(p => SINKS.has(p.material) && !FASTENER_ROLES.has(p.role));
    if (sinkers.length) add('warn', 'float', 'These materials may not float', sinkers.map(p => p.name).join('; ') + '. Test in a bucket or swap for a floating alternative (e.g. polypropylene rope).');
    else if (!(pipes.length && (!hasFoam || unfilled.length))) add('ok', 'float', 'All structural materials float (PVC is foam-filled)', '');
    return out;
  }

  // ── Analysis + recommendations ──
  function analyze(build, rules, opts) {
    opts = opts || {};
    const g = geometry(build.config);
    const req = requirements(g);
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
    const spent = parts.filter(p => p.status === 'bought' || p.status === 'installed').reduce((s, p) => s + (+p.quantity || 0) * (+p.unit_cost_usd || 0), 0);
    const recs = recommend({ build, g, req, wt, sol, fwd, side, leaks, rulesOut, crewW });
    return { geometry: g, requirements: req, weights: wt, solution: sol, scenarios: { crewForward: fwd, crewSide: side, leaks }, rules: rulesOut, recommendations: recs, cost, spent, crewWeight: crewW };
  }

  function recommend(a) {
    const { build, g, req, wt, sol, fwd, side, leaks, rulesOut, crewW } = a;
    const c = g.config, out = [];
    const add = (level, title, detail) => out.push({ level, title, detail });
    rulesOut.filter(x => x.level === 'error' || x.level === 'warn').forEach(x => add(x.level, x.title, x.detail));
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
      if (sol.gmPitch < 0) add('warn', `Fore-aft unstable: see-saws on the drums (GM ${sol.gmPitch.toFixed(0)}")`, `The drums are only ${DRUM.len}" long under a ${c.frameLength}" frame and the crew sits high, so the boat rocks bow-down or stern-down until the frame hits the water. Spread drums fore-aft (Triangle or Pontoon preset), keep the crew low and centered, or shorten the frame.`);
      else if (sol.gmPitch < 12) add('warn', `Low fore-aft stability (GM ${sol.gmPitch.toFixed(0)}")`, 'Spread drums further fore-aft or keep the crew low.');
    }
    if (!fwd.ok || fwd.bowFreeboard < 2) add('warn', 'Nose-dive risk with crew at the bow', !fwd.ok ? 'Moving the crew forward overwhelms the bow.' : `Bow clearance drops to ${fwd.bowFreeboard.toFixed(1)}". Consider the Triangle or Pontoon preset, a drum further forward, or crew seated aft of center.`);
    if (!side.ok || Math.abs(side.rollDeg) > 8) add('warn', 'Leaning crew heels the boat hard', side.ok ? `${Math.abs(side.rollDeg).toFixed(0)}° heel with crew at the deck edge.` : 'Crew at the deck edge capsizes it.');
    const fails = leaks.filter(l => !l.sol.ok);
    if (leaks.length && fails.length) add('warn', `Losing one drum ${fails.length === leaks.length ? 'sinks or capsizes the boat' : 'is unsafe for some drums'}`, 'No redundancy. Seal and test the bung caps, or add a drum. Foam-filled rails and the XPS deck still float the wreck.');
    else if (leaks.length) add('ok', 'Survives losing any one drum', '');
    // parts list vs geometry
    const have = {};
    (build.parts || []).forEach(p => { have[p.role] = (have[p.role] || 0) + (+p.quantity || 0); });
    const names = { drum: 'drums', pipe: '10 ft pipe sticks', elbow: 'elbows', tee: 'tees', cross: 'double sani tees (4-way)', coupling: 'couplings', 'zip-tie': 'zip-tie packs (100)', xps: 'XPS sheets', coroplast: 'Coroplast sheets', 'spray-foam': 'spray-foam cans', cement: 'PVC cement kits' };
    Object.entries(req.items).forEach(([role, need]) => {
      const h = have[role] || 0;
      if (need > h && role === 'pipe') {
        const tries = [];
        if (c.mastHeight > 0) tries.push(['without the PVC mast', Object.assign({}, c, { mastHeight: 0 })]);
        if (g.bow) tries.push(['without the bow frame', Object.assign({}, c, { bow: false })]);
        for (const n of [c.beamCount - 1]) if (n >= 2) tries.push([`with ${n} cross beams`, Object.assign({}, c, { beamCount: n })]);
        const fits = tries.filter(([, cfg]) => requirements(geometry(cfg)).items.pipe <= h).map(([label]) => label);
        add('warn', `Parts list is short ${need - h} ${names[role]}`, `This configuration needs ${need}; the list has ${h}.` + (fits.length ? ` It fits in ${h} ${fits.join(', or ')}.` : ''));
      } else if (need > h) add('warn', `Parts list is short ${need - h} ${names[role]}`, `This configuration needs ${need}; the list has ${h}.`);
      else if (h > need + (role === 'zip-tie' ? 1 : 0) && need >= 0 && role !== 'drum') add('info', `${h - need} spare ${names[role]} on the list`, 'Keep for repairs or trim the list to save weight and cost.');
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

  function comparePresets(build, rules) {
    return Object.keys(PRESETS).map(id => {
      const cfg = Object.assign({}, build.config, { preset: id, drums: undefined, failedDrum: null });
      if (id === 'quad4wide') cfg.frameWidth = Math.max(cfg.frameWidth, Math.ceil(2 * (1.5 * Math.max(cfg.pontoonSpacing / 3, DRUM.dia + 1) + RAIL_OFFSET + PIPE_R)));
      const a = analyze(Object.assign({}, build, { config: cfg }), rules);
      const s = a.solution;
      return {
        id, label: PRESETS[id].label, blurb: PRESETS[id].blurb, drums: PRESETS[id].drums,
        weight: a.weights.total, ok: s.ok, loadPct: s.loadPct, maxDraft: s.maxDraft, gmRoll: s.gmRoll, gmPitch: s.gmPitch,
        bowFwd: a.scenarios.crewForward.ok ? a.scenarios.crewForward.bowFreeboard : -Infinity,
        survivesLeak: a.scenarios.leaks.every(l => l.sol.ok),
        errors: a.rules.filter(x => x.level === 'error').length + a.recommendations.filter(x => x.level === 'error').length,
      };
    });
  }

  return {
    WATER, DRUM, PIPE_R, RAIL_OFFSET, PRESETS, DEFAULT_CONFIG,
    withDefaults, geometry, requirements, weights, massItems, crewPositions, solve, checkRules, analyze, comparePresets,
    segArea, drumMaxLb,
  };
});
