// Checks the engineering numbers against independent hand calculations and
// analytical results (not against the model's own code paths).
const test = require('node:test');
const assert = require('node:assert');
const M = require('../scripts/raft-model.js');
const current = require('../data/build.json');
const rules = require('../data/rules.json');
const clone = o => JSON.parse(JSON.stringify(o));
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);
const rel = (a, b, frac, msg) => near(a, b, Math.abs(b) * frac, msg);

// Fresh water: 62.4 lb/ft³; 1 ft³ = 1728 in³; 1 US gal = 231 in³.
const WATER_LB_PER_IN3 = 62.4 / 1728;
// 1-1/2" Sch 40 PVC (ASTM D1785): OD 1.900", wall 0.145" → ID 1.610".
const OD = 1.9, ID = 1.61;

// A symmetric catamaran on two 55 gal drums with a stacked frame: no submerged
// foam-filled pipe, so the drums alone carry the load.
function catamaran() {
  const b = clone(current);
  Object.assign(b.config, { preset: 'cat2', frameStyle: 'stacked', drumOffset: 0, platform: false, bowNoodle: false, sidePanels: false, retention: 'bands', drumSpecs: [] });
  return b;
}
const hFor = (W, r, len, nDrums) => {          // bisection on Archimedes: nDrums · A(h) · len · ρ = W
  let lo = 0, hi = 2 * r;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; nDrums * M.segArea(m, r) * len * WATER_LB_PER_IN3 < W ? lo = m : hi = m; }
  return (lo + hi) / 2;
};

test('units: water weight and drum volume', () => {
  near(M.WATER, WATER_LB_PER_IN3, 1e-12, 'water lb/in³');
  const d = M.drumSpec({ drum: { size: 'hdpe-55-tight' } });
  const vol = Math.PI * (d.dia / 2) ** 2 * d.len;            // outside volume, in³
  near(vol / 231, 59.38, 0.01, 'outside volume, gal');        // a 55 gal drum's outside is ~59 gal
  near(M.drumMaxLb(d), vol * WATER_LB_PER_IN3, 1e-9, 'max lift');
  near(M.drumMaxLb(d), 495.4, 0.1, 'max lift, lb');
});

test('circular segment: area, width and centroid match analytic values and numeric integrals', () => {
  const r = 11.25;
  near(M.segArea(0, r), 0, 1e-12, 'empty');
  near(M.segArea(2 * r, r), Math.PI * r * r, 1e-9, 'full');
  near(M.segArea(r, r), Math.PI * r * r / 2, 1e-9, 'half');
  for (const h of [1, 4.5, 7.7, 15, 20]) {
    near(M.segArea(h, r) + M.segArea(2 * r - h, r), Math.PI * r * r, 1e-9, `symmetry at ${h}`);
    // numeric: area = ∫ width dy, centroid = ∫ y·width dy / area (midpoint rule, 20 000 strips)
    let A = 0, Ay = 0; const n = 20000, dy = h / n;
    for (let i = 0; i < n; i++) { const y = (i + 0.5) * dy, w = 2 * Math.sqrt(Math.max(0, r * r - (r - y) ** 2)); A += w * dy; Ay += y * w * dy; }
    rel(M.segArea(h, r), A, 1e-6, `area at ${h}`);
    near(M.segCentroidY(h, r), Ay / A, 1e-4, `centroid at ${h}`);
    near(M.segWidth(h, r), 2 * Math.sqrt(r * r - (r - h) ** 2), 1e-9, `width at ${h}`);
  }
  near(M.segCentroidY(r, r), r - 4 * r / (3 * Math.PI), 1e-9, 'semicircle centroid 4r/3π from the flat side');
});

test('hydrostatics: level draft from Archimedes, and roll/pitch GM from waterplane inertia', () => {
  const b = catamaran(), g = M.geometry(b.config);
  assert.strictEqual(g.cage, false, 'no foam-filled pipe below the water in this check');
  const [d1, d2] = g.drums, r = d1.r, L = d1.len, s = Math.abs(d1.z - d2.z);
  const W = 300, KG = 30;                                    // one 300 lb load centred, 30" up
  const sol = M.solve(g, [{ w: W, x: d1.x, y: KG, z: 0, label: 'test' }]);
  assert.ok(sol.ok);
  const h = hFor(W, r, L, 2);
  near(sol.d, h, 1e-4, 'draft');
  near(sol.pitchDeg, 0, 1e-6, 'trim'); near(sol.rollDeg, 0, 1e-6, 'heel');
  // waterplane of each drum: a w × L rectangle; parallel axis to the centreline for roll
  const w = 2 * Math.sqrt(2 * r * h - h * h), V = 2 * M.segArea(h, r) * L, KB = M.segCentroidY(h, r);
  const Iroll = 2 * (L * w ** 3 / 12 + L * w * (s / 2) ** 2), Ipitch = 2 * (w * L ** 3 / 12);
  rel(sol.gmRoll, Iroll / V + KB - KG, 2e-3, 'roll GM');
  rel(sol.gmPitch, Ipitch / V + KB - KG, 2e-3, 'pitch GM');
  // a load moved off-centre heels the boat by about atan(offset / GM) for small angles
  const z0 = 1;
  const off = M.solve(g, [{ w: W, x: d1.x, y: KG, z: z0, label: 'test' }]);
  rel(Math.abs(Math.tan(off.rollDeg * Math.PI / 180)), z0 / sol.gmRoll, 0.01, 'small-angle heel');
  assert.ok(off.rollDeg * z0 > 0 || off.rollDeg * z0 < 0, 'heels');
  // the heavy side goes down: a load to +z makes the water deeper on the +z side (p < 0)
  assert.ok(off.p < 0, 'heels toward the load');
  // a catamaran this short is unstable fore-aft (negative pitch GM): flagged, not reported as a resting trim
  assert.ok(sol.gmPitch < 0 && sol.stablePitch === false && sol.stableRoll === true);
});

test('hydrostatics: no resting heel exists when G is outboard of every drum', () => {
  // B can never be outboard of the drums' outer edge, and with G above B the
  // equilibrium condition zB = zG + p·(yB − yG) pushes B even further out, so a
  // centre of gravity beyond the outer edge has no balance: it must report a capsize.
  const b = catamaran(), g = M.geometry(b.config);
  const [d1, d2] = g.drums, edge = Math.max(Math.abs(d1.z), Math.abs(d2.z)) + d1.r;
  const sol = M.solve(g, [{ w: 300, x: d1.x, y: 30, z: edge + 2, label: 'test' }]);
  assert.strictEqual(sol.ok, false);
  assert.strictEqual(sol.reason, 'capsizes');
});

test('buoyancy numbers: lift, reserve, safety factor, per-drum shares and swamped foam lift', () => {
  const b = clone(current), a = M.analyze(b, rules, { skipLeak: true }), B = a.engineering.buoyancy, g = a.geometry, q = a.requirements;
  const drumLift = g.drums.reduce((t, d) => t + Math.PI * d.r ** 2 * d.len * WATER_LB_PER_IN3, 0);
  assert.ok(B.max >= drumLift, 'total lift includes every drum');
  near(B.reserve, B.max - B.load, 1e-9, 'reserve');
  near(B.sf, B.max / B.load, 1e-9, 'safety factor');
  near(B.load, a.weights.predicted + b.config.crew.count * b.config.crew.weightEach, 1e-6, 'boat + crew');
  near(B.drums.reduce((t, d) => t + d.lb, 0) + B.frameLift, B.load, 1e-6, 'drums and pipe carry the load');
  B.drums.forEach(d => { near(d.used, d.lb / d.capacity, 1e-12, 'used'); near(d.share, d.lb / B.load, 1e-12, 'share'); });
  // swamped: deck XPS (minus ~0.3" of skins) + noodles + gross foam-filled pipe volume
  const deck = b.config.deck.length * b.config.deck.width * (b.config.deck.thickness - 0.3) * WATER_LB_PER_IN3;
  const noodles = (q.items.noodle || 0) * Math.PI * 1.25 ** 2 * 52 * WATER_LB_PER_IN3;
  const pipe = q.pipeLength_in * Math.PI * (OD / 2) ** 2 * WATER_LB_PER_IN3;
  near(B.emergency, deck + noodles + pipe, 1e-6, 'swamped foam lift');
  near(B.structure, a.weights.predicted - g.drums.reduce((t, d) => t + d.spec.weight, 0), 1e-6, 'structure without drums');
});

test('drag: frontal and side areas match the drum geometry; force goes as ½ρv²CdA', () => {
  const b = catamaran(), g = M.geometry(b.config), q = M.requirements(g, b.parts);
  const [d1] = g.drums, r = d1.r, L = d1.len, W = 300;
  const items = [{ w: W, x: d1.x, y: 30, z: 0, label: 'test' }], sol = M.solve(g, items), h = hFor(W, r, L, 2);
  const D = M.engineering(b, g, sol, items, q).drag;
  // ahead: two separate submerged circle segments; from the side the drums line up: an L × h rectangle
  rel(D.frontArea, 2 * M.segArea(h, r) / 144, 0.01, 'frontal area, ft²');
  rel(D.sideArea, L * h / 144, 0.01, 'side area, ft²');
  near(D.CdA, 0.9 * D.frontArea, 1e-9, 'blunt drums: Cd 0.9');
  const rho = 1.94, ftps = mph => mph * 5280 / 3600;          // slug/ft³, ft/s
  D.at.forEach(x => {
    near(x.lb, 0.5 * rho * ftps(x.mph) ** 2 * D.CdA, 1e-6, `force at ${x.mph} mph`);
    near(x.watts, x.lb * ftps(x.mph) * 1.35582, 1e-6, `power at ${x.mph} mph`);   // 1 ft·lbf/s = 1.35582 W
  });
  // top speed: the paddlers' power equals the drag power there
  const v = ftps(D.speed), Pdrag = 0.5 * rho * v ** 3 * D.CdA * 1.35582;
  rel(Pdrag, D.power, 0.002, 'power at top speed');
  D.broadside.forEach(x => near(x.lb, 0.5 * rho * ftps(x.mph) ** 2 * 1.1 * D.sideArea, 1e-6, `broadside at ${x.mph} mph`));
});

test('weight distribution: centre of gravity and fore/aft split from the mass items', () => {
  const b = clone(current), a = M.analyze(b, rules, { skipLeak: true }), Wt = a.engineering.weight;
  const items = M.massItems(b, a.geometry), W = items.reduce((t, i) => t + i.w, 0);
  near(Wt.total, W, 1e-9, 'total');
  near(Wt.cg.x, items.reduce((t, i) => t + i.w * i.x, 0) / W, 1e-9, 'CG fore-aft');
  near(Wt.cg.y, items.reduce((t, i) => t + i.w * i.y, 0) / W, 1e-9, 'CG height');
  near(Wt.cg.z, items.reduce((t, i) => t + i.w * i.z, 0) / W, 1e-9, 'CG across');
  near(Wt.forward, items.filter(i => i.x > 0).reduce((t, i) => t + i.w, 0) / W, 1e-12, 'forward share');
  near(Wt.groups.reduce((t, gr) => t + gr.lb, 0), W, 1e-9, 'groups add up');
  near(Wt.cgAboveWater, a.solution.KG - a.solution.d, 1e-9, 'CG above the waterline');
});

test('structure: Sch 40 section modulus and the beam formulas', () => {
  const S = Math.PI * (OD ** 4 - ID ** 4) / (32 * OD);
  near(S, 0.3262, 0.0001, 'section modulus, in³');
  near(M.PVC.S, S, 1e-12, 'model uses the same S');
  const b = clone(current), a = M.analyze(b, rules, { skipLeak: true }), E = a.engineering, g = a.geometry, c = b.config;
  const P = c.crew.weightEach * 2;                            // one person, ×2 for slamming
  const get = id => E.structure.find(s => s.id === id);
  // box top rail: simply supported between the corner posts, centre load shared by two rails
  const Lbox = Math.max(...g.boxList.map(bx => bx.x1 - bx.x0));
  near(get('deck-rail').moment, (P / 2) * Lbox / 4, 1e-9, 'deck rail moment');
  // drum uplift: W = U/2 per rail spread over the drum length a in a span L → M = W(2L − a)/8
  const d = g.drums.reduce((m, x) => x.r > m.r ? x : m, g.drums[0]);
  const U = Math.PI * d.r ** 2 * d.len * WATER_LB_PER_IN3 - d.spec.weight, span = d.len + 2 * M.withDefaults(c).boxEndGap;
  near(get('uplift').moment, (U / 2) * (2 * span - d.len) / 8, 1e-9, 'uplift moment');
  // independent check of that formula: integrate the bending moment of the beam numerically
  const Mnum = (() => { const w = (U / 2) / d.len, a0 = (span - d.len) / 2, R = U / 4; let best = 0;
    for (let i = 0; i <= 2000; i++) { const x = span * i / 2000, loaded = Math.max(0, Math.min(x, a0 + d.len) - a0), arm = x - (a0 + loaded / 2);
      best = Math.max(best, R * x - w * loaded * arm); } return best; })();
  rel(get('uplift').moment, Mnum, 1e-3, 'uplift moment vs numeric beam');
  // stress and safety factor for every bending check
  E.structure.filter(s => s.moment > 0).forEach(s => { near(s.stress, s.moment / S, 1e-6, s.id + ' stress'); near(s.sf, 14000 / s.stress, 1e-9, s.id + ' SF');
    assert.strictEqual(s.level, s.sf < 1.5 ? 'error' : s.sf < 2.5 ? 'warn' : 'ok', s.id + ' level'); });
  // deck tie-downs: 16 ties × the weakest tie rating against the deck foam lift
  const lift = c.deck.length * c.deck.width * (c.deck.thickness - 0.3) * WATER_LB_PER_IN3;
  near(get('deck-ties').sf, 16 * 50 / lift, 1e-9, 'tie-down SF');
});

test('structure: platform cross member spans', () => {
  const b = clone(current), g = M.geometry(b.config), q = M.requirements(g, b.parts);
  const items = M.massItems(b, g), sol = M.solve(g, items), P = b.config.crew.weightEach * 2;
  const pl = g.platform, E = M.engineering(b, g, sol, items, q), chk = E.structure.find(s => s.id === 'platform');
  // the stern-most cross member hangs past the boxes: nothing under it, so it spans the whole platform width
  assert.ok(pl.xs[0] < Math.min(...g.boxList.map(bx => bx.x0)), 'end member is past the boxes');
  near(chk.moment, P * pl.W / 4, 1e-9, 'unsupported member: M = P·W/4');
  // move the deck so every member sits over a box: the worst span gets shorter
  const b2 = clone(b); b2.config.deck = Object.assign({}, b2.config.deck, { length: 60 });
  const g2 = M.geometry(b2.config), E2 = M.engineering(b2, g2, M.solve(g2, M.massItems(b2, g2)), M.massItems(b2, g2), M.requirements(g2, b2.parts));
  assert.ok(E2.structure.find(s => s.id === 'platform').sf > chk.sf);
});

test('shown work matches the numbers it explains', () => {
  const a = M.analyze(current, rules, { skipLeak: true }), E = a.engineering;
  const num = t => [...t.matchAll(/-?\d+(?:\.\d+)?/g)].map(m => +m[0]);
  const last = id => num(E.work[id].steps[E.work[id].steps.length - 1]);
  assert.ok(last('buoy.max').includes(Math.round(E.buoyancy.max)));
  assert.ok(num(E.work['buoy.sf'].steps[0]).includes(+E.buoyancy.sf.toFixed(2)));
  E.structure.filter(s => s.moment > 0).forEach(s => assert.ok(last('st.' + s.id).includes(+s.sf.toFixed(2)), s.id));
  assert.ok(num(E.work['drag.speed'].steps[1]).includes(+E.drag.speed.toFixed(1)));
});

test('hydrostatics: trim from a fore-aft load on a stable 4-drum pontoon matches tan θ = offset / GM', () => {
  const b = clone(current);
  Object.assign(b.config, { preset: 'quad4pontoon', frameStyle: 'stacked', drumOffset: 0, platform: false, bowNoodle: false, sidePanels: false, retention: 'bands', drumSpecs: [] });
  const g = M.geometry(b.config); assert.strictEqual(g.drums.length, 4); assert.strictEqual(g.cage, false);
  const W = 400, KG = 30, x0 = g.drums.reduce((t, d) => t + d.x, 0) / 4;
  const level = M.solve(g, [{ w: W, x: x0, y: KG, z: 0, label: 'test' }]);
  assert.ok(level.ok && level.gmPitch > 0 && level.stablePitch);
  const r = g.drums[0].r, h = hFor(W, r, g.drums[0].len, 4);
  near(level.d, h, 1e-4, 'level draft of 4 drums');
  const moved = M.solve(g, [{ w: W, x: x0 + 2, y: KG, z: 0, label: 'test' }]);
  rel(Math.abs(Math.tan(moved.pitchDeg * Math.PI / 180)), 2 / level.gmPitch, 0.02, 'small-angle trim');
  assert.ok(moved.t < 0 && moved.pitchDeg < 0, 'bow goes down when the load moves forward (water line y = d − x·t is deeper at +x)');
});
