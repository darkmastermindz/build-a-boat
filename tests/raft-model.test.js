const test = require('node:test');
const assert = require('node:assert');
const M = require('../scripts/raft-model.js');
const build = require('../data/build.json');
const rules = require('../data/rules.json');
const clone = o => JSON.parse(JSON.stringify(o));
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('drum displacement matches cylinder geometry', () => {
  near(M.drumMaxLb(), Math.PI * 11.25 ** 2 * 34.5 * 62.4 / 1728, 1e-9, 'max lb');
  near(M.segArea(11.25), Math.PI * 11.25 ** 2 / 2, 1e-6, 'half segment');
});

test('every preset produces its drum count and no overlaps at defaults', () => {
  for (const [id, p] of Object.entries(M.PRESETS)) {
    const cfg = Object.assign({}, build.config, { preset: id });
    if (id === 'quad4wide') cfg.frameWidth = 96;
    const g = M.geometry(cfg);
    assert.strictEqual(g.drums.length, p.drums, id);
    assert.deepStrictEqual(g.overlaps, [], id);
  }
});

test('symmetric catamaran floats level side to side; buoyancy equals weight', () => {
  const a = M.analyze(build, rules);
  assert.ok(a.solution.ok);
  near(a.solution.rollDeg, 0, 1e-3, 'roll');
  const lb = Object.values(a.solution.perDrum).reduce((s, d) => s + d.lb, 0);
  near(lb, a.solution.W, 0.5, 'force balance');
});

test('moving crew forward trims bow down', () => {
  const b = clone(build); b.config.preset = 'quad4pontoon';
  const level = M.analyze(b, rules, { skipLeak: true }).solution.pitchDeg;
  b.config.crew.xOffset = 20;
  const fwd = M.analyze(b, rules, { skipLeak: true }).solution.pitchDeg;
  assert.ok(fwd < level, `${fwd} < ${level}`);
});

test('overloaded boat sinks', () => {
  const b = clone(build); b.config.crew = { count: 4, weightEach: 300, xOffset: 0, zOffset: 0 };
  const s = M.analyze(b, rules, { skipLeak: true }).solution;
  assert.strictEqual(s.ok, false);
  assert.strictEqual(s.reason, 'sinks');
});

test('more drums means shallower draft for the same load', () => {
  const d = id => { const b = clone(build); b.config.preset = id; return M.analyze(b, rules, { skipLeak: true }).solution.meanDraft; };
  assert.ok(d('tri3inline') < d('cat2'));
});

test('rules: metal, weight, thick wood and long rope are flagged', () => {
  const b = clone(build);
  b.parts.push({ name: 'Galvanized carriage bolts', role: 'other', category: 'frame', material: 'metal', quantity: 1, weight_lb_each: 60 });
  b.parts.push({ name: 'Wood dowel 1 in', role: 'mast', category: 'decor', material: 'wood', thickness_in: 1, quantity: 1, weight_lb_each: 1 });
  b.parts.push({ name: 'Long rope', role: 'rope', category: 'rigging', material: 'polypropylene', max_piece_length_in: 50, quantity: 1, weight_lb_each: 1 });
  const errs = M.analyze(b, rules, { skipLeak: true }).rules.filter(r => r.level === 'error').map(r => r.id);
  for (const id of ['metal', 'wood', 'rope', 'weight']) assert.ok(errs.includes(id), id);
});

test('current build passes hard rules', () => {
  const errs = M.analyze(build, rules).rules.filter(r => r.level === 'error');
  assert.deepStrictEqual(errs, []);
});

test('pipe cut list packs into 10 ft sticks (both frame styles)', () => {
  for (const frameStyle of ['stacked', 'fitted']) {
    const req = M.requirements(M.geometry(Object.assign({}, build.config, { frameStyle })));
    req.sticks.forEach(s => assert.ok(s.cuts.reduce((t, c) => t + c.len, 0) <= 120, frameStyle));
    const total = req.cuts.reduce((t, c) => t + c.len, 0);
    assert.ok(req.items.pipe >= Math.ceil(total / 120), frameStyle);
  }
});

test('fitted frame: fittings and cut lengths follow the grid', () => {
  const cfg = Object.assign({}, build.config, { preset: 'cat2', frameStyle: 'fitted', railsPerPontoon: 2, centerSpine: false, beamCount: 4, frameLength: 84, pontoonSpacing: 47, fittingTakeoff: 1.25, bow: true });
  const g = M.geometry(cfg), req = M.requirements(g);
  // 4 rails x 4 beams = 16 nodes: 4 corners (2 front corners become tees for the bow riser), 8 edges, 4 interior
  assert.strictEqual(req.items.cross, 4);
  assert.strictEqual(req.items.tee, 8 + 2);
  assert.strictEqual(req.items.elbow, 2 + 4);
  const railSeg = req.cuts.find(c => c.label === 'rail 1.1').len;
  near(railSeg, 84 / 3 - 2.5, 1e-6, 'rail segment');
  near(g.frameWidth, 2 * (47 / 2 + 6), 1e-9, 'fitted width = outer rail spacing');
  assert.ok(g.railY > M.DRUM.dia, 'fitted frame sits on top of the drums');
});

test('spine frame matches the receipt: 3 double sani tees, 5 sticks', () => {
  const cfg = Object.assign({}, build.config, { preset: 'cat2', frameStyle: 'fitted', railsPerPontoon: 1, centerSpine: true, beamCount: 5, frameLength: 84, pontoonSpacing: 47, fittingTakeoff: 1.25, bow: true, mastHeight: 30 });
  const req = M.requirements(M.geometry(cfg));
  assert.strictEqual(req.items.cross, 3);
  assert.strictEqual(req.items.tee, 10);
  assert.strictEqual(req.items.pipe, 5);
});

test('inventory: side-outlet tees count as tees, zip ties count by pack', () => {
  const have = M.inventory([
    { role: 'tee', quantity: 4 }, { role: 'side-tee', quantity: 24 }, { role: 'cleanout-tee', quantity: 1 },
    { role: 'zip-tie', quantity: 4, pack_count: 10 }, { role: 'zip-tie', quantity: 1 },
  ]);
  assert.strictEqual(have.tee, 29);
  assert.strictEqual(have['zip-tie'], 140);
});

test('long zip ties are flagged against the 18" rule', () => {
  const b = clone(build);
  b.parts.push({ name: '36 in tie', role: 'zip-tie', category: 'rigging', material: 'nylon', length_in: 36, quantity: 1, weight_lb_each: 0.5 });
  const r = M.analyze(b, rules, { skipLeak: true }).rules.find(x => x.id === 'ties');
  assert.ok(r && r.level === 'warn');
});

test('weights: predicted vs bought so far', () => {
  const a = M.analyze(build, rules, { skipLeak: true });
  const w = a.weights;
  assert.ok(w.predicted > 0 && w.onHand >= 0 && w.onHand <= w.predicted);
  near(w.remaining, w.predicted - w.onHand, 1e-9, 'remaining');
  const b = clone(build); b.parts.forEach(p => { p.status = 'bought'; });
  b.parts.find(p => p.role === 'drum').quantity = 2;
  const all = M.analyze(b, rules, { skipLeak: true }).weights;
  near(all.onHand, all.predicted, 1e-6, 'everything bought');
});

test('shopping list covers what the layout still needs', () => {
  const catalog = require('../data/catalog.json');
  const a = M.analyze(build, rules, { skipLeak: true, catalog });
  const bought = M.inventory(build.parts.filter(p => p.status === 'bought' || p.status === 'installed'));
  for (const role of ['drum', 'pipe', 'cross', 'tee', 'elbow']) {
    const need = a.requirements.items[role] || 0, have = bought[role] || 0;
    const row = a.shopping.rows.find(r => r.role === role && r.priority === 'needed');
    if (need > have) assert.ok(row && row.qty >= need - have, role);
    else assert.ok(!row, `${role} should not be on the list`);
  }
  assert.ok(a.shopping.rows.every(r => !(r.role === 'zip-tie' && /36 in/i.test(r.name))), 'does not suggest ties over 18"');
});

test('no addresses, phone numbers or payment details in data and docs', () => {
  const fs = require('fs'), path = require('path');
  const root = path.join(__dirname, '..');
  const files = [...fs.readdirSync(path.join(root, 'data')).map(f => 'data/' + f), 'docs/design.md', 'README.md', 'PLAN.md', 'reports/latest-report.md'];
  const bad = [
    /"(address|phone)"\s*:/i,
    /\b\d{2,6} [A-Z][a-z]+(?: [A-Z][a-z]+)* (?:St|Ave|Blvd|Dr|Rd|Ct|Pike|Plaza|Hwy)\b/,
    /\(\d{3}\)\s?\d{3}-\d{4}/,
    /X{6,}\d{4}|AUTH CODE|\bAMEX\b|Home Depot #\d+/i,
  ];
  for (const f of files) {
    const t = fs.readFileSync(path.join(root, f), 'utf8');
    bad.forEach(re => assert.ok(!re.test(t), `${f} matches ${re}`));
  }
});

test('drum spec: smaller or custom drums change buoyancy and geometry', () => {
  const run = drum => { const b = clone(build); b.config.drum = drum; return M.analyze(b, rules, { skipLeak: true }); };
  const big = run({ size: 'hdpe-55-tight' }), small = run({ size: 'hdpe-30-tight' });
  assert.ok(small.solution.maxLb < big.solution.maxLb, 'less lift');
  assert.ok(small.geometry.railY < big.geometry.railY, 'frame sits lower on smaller drums');
  const custom = run({ size: 'custom', gallons: 55, dia: 23, len: 35, weight: 19.5, weightMeasured: true });
  near(custom.geometry.drum.dia, 23, 0, 'custom dia');
  near(custom.weights.byRole.drum, 2 * 19.5, 1e-9, 'custom drum weight');
  const off = run({ size: 'custom', gallons: 55, dia: 12, len: 20, weight: 10 });
  assert.ok(off.recommendations.some(r => /don't match 55 gal/.test(r.title)), 'flags mismatched measurements');
  assert.ok(M.DRUM_SIZES.every(d => !/steel|metal/i.test(d.label)), 'no metal drums offered');
});

test('store links: product searches always, map searches only with a valid ZIP', () => {
  const item = { name: '1-1/2" DWV sanitary tee (HxHxH)', role: 'tee', catalog_id: 'FT04' };
  const plain = M.storeLinks(item, {});
  assert.ok(plain.some(l => l.url.startsWith('https://www.homedepot.com/s/1-1%2F2%20in%20DWV%20sanitary%20tee')));
  assert.ok(plain.some(l => l.url.startsWith('https://www.lowes.com/search?searchTerm=')));
  assert.ok(!plain.some(l => l.kind === 'store'));
  assert.ok(!M.storeLinks(item, { zip: '123' }).some(l => l.kind === 'store'), 'invalid ZIP ignored');
  const near = M.storeLinks(item, { zip: '28202' });
  assert.ok(near.some(l => l.kind === 'store' && /Home%20Depot%20near%2028202/.test(l.url)));
  assert.ok(near.some(l => l.kind === 'local'));
});

test('per-drum sizes: a smaller drum rides higher, lifts less and heels the boat toward it', () => {
  const b = clone(build);
  b.config.preset = 'quad4pontoon';
  b.config.drumSpecs = [null, null, { size: 'custom', gallons: 45, dia: 20.5, len: 32, weight: 16 }, null];
  const a = M.analyze(b, rules, { skipLeak: true }), g = a.geometry;
  const small = g.drums[2], big = g.drums[0];
  near(small.y0, big.r * 2 - 20.5, 1e-9, 'top-aligned under the frame');
  assert.ok(M.drumMaxLb(small.spec) < M.drumMaxLb(big.spec));
  near(a.weights.byRole.drum, 20 * 3 + 16, 1e-9, 'per-drum weights');
  assert.ok(g.mixed);
  // drum 3 sits on the starboard side (+z); less lift there means starboard sinks (roll < 0 lifts port)
  assert.ok(small.z > 0 && a.solution.rollDeg < 0, `roll ${a.solution.rollDeg}`);
  assert.ok(a.recommendations.some(r => /is smaller/.test(r.title)));
  const same = clone(build); same.config.drumSpecs = [null, null];
  assert.ok(!M.analyze(same, rules, { skipLeak: true }).geometry.mixed, 'null entries use the default');
});

test('placement suggestion only appears when it levels the boat', () => {
  const b = clone(build);
  b.config.preset = 'tri3inline';
  b.config.drumSpecs = [{ size: 'hdpe-30-tight' }, null, null];   // small drum on the port side
  const a = M.analyze(b, rules);
  if (a.placement) {
    const c2 = clone(b); c2.config.drumSpecs = a.placement.drumSpecs;
    const after = M.analyze(c2, rules, { skipLeak: true }).solution;
    assert.ok(Math.abs(after.rollDeg) + Math.abs(after.pitchDeg) < Math.abs(a.solution.rollDeg) + Math.abs(a.solution.pitchDeg));
  } else {
    assert.ok(Math.abs(a.solution.rollDeg) < 1, 'no suggestion only when already level');
  }
});

test('crosswise tandem: steady fore-aft but tippy side to side (the reverse of the catamaran)', () => {
  const run = preset => { const b = clone(build); b.config.preset = preset; return M.analyze(b, rules, { skipLeak: true }).solution; };
  const cat = run('cat2'), tan = run('tandem2');
  assert.ok(tan.gmPitch > cat.gmPitch, 'tandem pitch stiffer');
  assert.ok(tan.gmRoll < cat.gmRoll, 'tandem roll softer');
  const g = M.geometry(Object.assign({}, build.config, { preset: 'tandem2' }));
  assert.ok(g.drums.every(d => d.axis === 'z'));
  assert.ok(g.rails.every(r => Math.abs(r.z) < g.drums[0].len / 2), 'rails sit on the crosswise drums');
});

test('comparison: every layout gets pros, cons and a fitted frame; ranking respects hard limits', () => {
  const catalog = require('../data/catalog.json');
  const rows = M.comparePresets(build, rules, { catalog });
  assert.strictEqual(rows.length, Object.keys(M.PRESETS).length);
  rows.forEach(r => {
    assert.ok(r.pros.length + r.cons.length >= 4, r.id);
    assert.ok(r.strengths.length && r.weaknesses.length, r.id);
    const g = M.geometry(Object.assign({}, build.config, { preset: r.id }, r.config));
    assert.ok(!g.drumsOffFrame, `${r.id} frame holds its drums`);
  });
  for (const p of Object.keys(M.PRIORITIES)) {
    const ranked = M.rankPresets(rows, p);
    const firstBlocked = ranked.findIndex(r => r.blocked);
    if (firstBlocked >= 0) assert.ok(ranked.slice(firstBlocked).every(r => r.blocked), `${p}: blocked layouts rank last`);
  }
  const light = M.rankPresets(rows, 'light')[0], stab = M.rankPresets(rows, 'stability')[0];
  assert.ok(light.weight <= stab.weight, 'light priority picks a lighter boat');
});

test('cage: a second frame traps the drums, costs pipe and weight, adds a little lift, drops the drum bands', () => {
  const run = (retention, cageStyle) => { const b = clone(build); Object.assign(b.config, { preset: 'cat2', retention, cageStyle }); return M.analyze(b, rules, { skipLeak: true }); };
  const bands = run('bands'), cradle = run('cage', 'cradle'), single = run('cage', 'single');
  assert.ok(cradle.geometry.cage && !bands.geometry.cage);
  assert.ok(cradle.requirements.cageLength_in > 0 && cradle.requirements.pipeLength_in > bands.requirements.pipeLength_in);
  assert.ok(cradle.weights.total > single.weights.total && single.weights.total > bands.weights.total, 'cradle > single > bands');
  assert.ok(cradle.solution.maxLb > bands.solution.maxLb, 'foam-filled cage pipes add lift');
  assert.ok(cradle.requirements.items['zip-tie'] < bands.requirements.items['zip-tie'], 'no drum bands');
  // posts land on the deck frame and every post is spliced into a rail with a tee (fitted frame)
  const posts = cradle.geometry.cagePieces.filter(p => p.kind === 'post');
  assert.ok(posts.every(p => Math.abs(p.b[1] - cradle.geometry.railY) < 1e-9));
  assert.ok(cradle.recommendations.some(r => /trapped between two frames/.test(r.title)));
  assert.ok(bands.recommendations.some(r => /Option: trap the drums/.test(r.title)));
});

test('cage pushing a heavy layout over the limit is flagged', () => {
  const b = clone(build); Object.assign(b.config, { preset: 'quad4pontoon', retention: 'cage', cageStyle: 'cradle' });
  b.parts.find(p => p.role === 'drum').quantity = 4;
  const a = M.analyze(b, rules, { skipLeak: true });
  assert.ok(a.weights.total >= 150);
  assert.ok(a.rules.some(r => r.id === 'weight' && r.level === 'error'));
});

test('box frames: each drum in its own box, joined to its neighbours, no deck frame', () => {
  const b = clone(build); Object.assign(b.config, { preset: 'stagger2', frameStyle: 'boxes' });
  const a = M.analyze(b, rules, { skipLeak: true }), g = a.geometry, q = a.requirements;
  assert.ok(g.boxes && g.cage && g.rails.length === 0 && g.beams.length === 0);
  const kinds = k => g.cagePieces.filter(p => p.kind === k).length;
  assert.strictEqual(kinds('post'), 4 * g.drums.length, 'four corner posts per box');
  assert.ok(kinds('link') >= 2, 'boxes are joined');
  // every box encloses its drum, top above it and bottom below it
  g.drums.forEach((d, i) => {
    const bx = g.boxList[i];
    assert.ok(bx.x0 < d.x - d.ex && bx.x1 > d.x + d.ex && bx.z0 < d.z - d.ez && bx.z1 > d.z + d.ez);
    assert.ok(bx.yb < d.y0 && g.railY > d.y0 + 2 * d.r);
  });
  assert.ok(q.cuts.every(c => c.len >= 2), 'no pipe stubs');
  assert.strictEqual(q.items.cross, 0);
  assert.ok(q.items.tee >= 8 * g.drums.length, 'every box corner joins 3 pipes');
  assert.ok(a.recommendations.some(r => /^Box frames:/.test(r.title)));
  // staggering the boxes steadies pitch versus the straight catamaran
  const straight = M.analyze(Object.assign(clone(b), { config: Object.assign({}, b.config, { preset: 'cat2' }) }), rules, { skipLeak: true });
  assert.ok(a.solution.gmPitch > straight.solution.gmPitch);
});

test('box frames: packed triangle shares walls and crossbars, with no doubled pipe', () => {
  const b = clone(build); Object.assign(b.config, { preset: 'tri3pack', frameStyle: 'boxes' });
  b.parts.find(p => p.role === 'drum').quantity = 3;
  const g = M.geometry(b.config), q = M.requirements(g, b.parts);
  const kinds = k => g.cagePieces.filter(p => p.kind === k).length;
  assert.strictEqual(g.drums.length, 3);
  assert.strictEqual(kinds('link'), 0, 'boxes butt together, no links');
  assert.strictEqual(kinds('post'), 10, 'the front pair shares its middle posts');
  // no pipe runs inside another: every joint sits at a piece end, never partway along one
  const ends = g.cagePieces.flatMap(p => [p.a, p.b]);
  g.cagePieces.forEach(p => ends.forEach(e => {
    const d = p.b.map((v, k) => v - p.a[k]), L = Math.hypot(...d), t = e.reduce((s, v, k) => s + (v - p.a[k]) * d[k], 0) / (L * L);
    const off = Math.hypot(...e.map((v, k) => v - (p.a[k] + t * d[k])));
    assert.ok(!(off < 0.1 && t * L > 0.5 && (1 - t) * L > 0.5), 'joint partway along a pipe');
  }));
  assert.ok(q.items.cross >= 4, 'shared corners take 4-way fittings');
  assert.ok(q.cuts.every(c => c.len >= 2));
  for (let gap = 0; gap <= 14; gap++) {             // widening the front pair never leaves stubs
    const q2 = M.requirements(M.geometry(Object.assign({}, b.config, { packGap: gap })), b.parts);
    assert.ok(q2.cuts.every(c => c.len >= 2), `gap ${gap}`);
  }
});

test('box frames: every layout builds without pipe stubs', () => {
  for (const preset of Object.keys(M.PRESETS)) {
    const b = clone(build); Object.assign(b.config, { preset, frameStyle: 'boxes' });
    const q = M.requirements(M.geometry(b.config), b.parts);
    assert.ok(q.cuts.every(c => c.len >= 2), preset);
  }
});
