const test = require('node:test');
const assert = require('node:assert');
const M = require('../scripts/raft-model.js');
const asBuilt = require('../data/build.json');
// Most checks are about the sealed-drum design; the drums flooded on 2026-10-09 are tested on their own.
const current = Object.assign({}, asBuilt, { config: Object.assign({}, asBuilt.config, { floodPct: 0, floodVented: false }) });
const rules = require('../data/rules.json');
const clone = o => JSON.parse(JSON.stringify(o));
// reference boat for the physics tests: the team's parts on the earlier 2-drum spine-frame catamaran
const build = clone(current);
Object.assign(build.config, { preset: 'cat2', frameStyle: 'fitted', drumOffset: 0, packGap: 0, boxSideGap: 1, platform: false, bowNoodle: false });
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
  b.parts.push({ name: 'Galvanized carriage bolts', role: 'other', category: 'frame', material: 'metal', quantity: 1, weight_lb_each: 80 });
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

test('no addresses, phone numbers, payment details or specific towns in data and docs', () => {
  const fs = require('fs'), path = require('path');
  const root = path.join(__dirname, '..');
  const files = [...fs.readdirSync(path.join(root, 'data')).filter(f => f.endsWith('.json')).map(f => 'data/' + f),
    ...fs.readdirSync(path.join(root, 'data/designs')).filter(f => f.endsWith('.json')).map(f => 'data/designs/' + f),   // designs proposed from the site
    'docs/design.md', 'README.md', 'PLAN.md', 'reports/latest-report.md'];
  const bad = [
    /"(address|phone)"\s*:/i,
    /\b\d{2,6} [A-Z][a-z]+(?: [A-Z][a-z]+)* (?:St|Ave|Blvd|Dr|Rd|Ct|Pike|Plaza|Hwy)\b/,
    /\(\d{3}\)\s?\d{3}-\d{4}/,
    /X{6,}\d{4}|AUTH CODE|\bAMEX\b|Home Depot #\d+/i,
    /~?\d+ min from\b/i,                                   // drive times from home
  ];
  for (const f of files) {
    const t = fs.readFileSync(path.join(root, f), 'utf8');
    bad.forEach(re => assert.ok(!re.test(t), `${f} matches ${re}`));
    // locations stay general: the only town named is Charlotte ("Charlotte area"), never a nearby one
    for (const m of t.matchAll(/\b([A-Z][a-z]+(?: [A-Z][a-z]+)?),? NC\b/g)) assert.strictEqual(m[1], 'Charlotte', `${f}: "${m[0]}"`);
    for (const m of t.matchAll(/"name": "[^"]* - ([A-Z][a-z]+(?: [a-z]+)?)"/g)) assert.ok(/^Charlotte( area)?$/.test(m[1]), `${f}: supplier named for "${m[1]}"`);
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
  b.config.drum = Object.assign({}, b.config.drum, { weight: 22 });   // open-head drums
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
  assert.strictEqual(kinds('post'), 10, 'the side-by-side pair shares its middle posts');
  // no pipe runs inside another: every joint sits at a piece end, never partway along one
  const ends = g.cagePieces.flatMap(p => [p.a, p.b]);
  g.cagePieces.forEach(p => ends.forEach(e => {
    const d = p.b.map((v, k) => v - p.a[k]), L = Math.hypot(...d), t = e.reduce((s, v, k) => s + (v - p.a[k]) * d[k], 0) / (L * L);
    const off = Math.hypot(...e.map((v, k) => v - (p.a[k] + t * d[k])));
    assert.ok(!(off < 0.1 && t * L > 0.5 && (1 - t) * L > 0.5), 'joint partway along a pipe');
  }));
  assert.ok(q.fourWay >= 4 && q.items.cross === 0, 'shared corners take 4-way side-outlet tees');
  assert.ok(q.cuts.every(c => c.len >= 2));
  for (let gap = 0; gap <= 14; gap++) {             // widening the side-by-side pair never leaves stubs
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

test('current plan: packed triangle in box frames passes the rules and floats level', () => {
  const a = M.analyze(current, rules), s = a.solution;
  assert.strictEqual(current.config.preset, 'tri3pack');
  assert.ok(a.geometry.boxes && a.geometry.drums.length === 3);
  assert.ok(a.geometry.drums[0].x > a.geometry.drums[1].x && a.geometry.drums[0].z === 0, 'single drum at the bow');
  assert.ok(s.ok && s.gmRoll > 0 && s.gmPitch > 12 && Math.abs(s.pitchDeg) < 1.5);
  assert.ok(a.weights.predicted < 150);
  assert.deepStrictEqual([...a.rules, ...a.recommendations].filter(r => r.level === 'error').map(r => r.title), []);
});

test('packed triangle: a resized drum moves its box instead of overlapping', () => {
  const b = clone(current); b.config.drumSpecs = [{ size: 'custom', gallons: 55, dia: 22.5, len: 40, weight: 20 }];
  b.config.boxSideGap = 3;
  const g = M.geometry(b.config), [bow, p, s] = g.boxList;
  assert.ok(Math.abs(bow.x0 - p.x1) < 0.01 && Math.abs(bow.x0 - s.x1) < 0.01, 'bow box butts the pair');
  assert.deepStrictEqual(g.overlaps, []);
  g.drums.forEach((d, i) => { const bx = g.boxList[i]; assert.ok(bx.x0 < d.x - d.ex && bx.x1 > d.x + d.ex && bx.z0 < d.z - d.ez && bx.z1 > d.z + d.ez); });
});

test('tools: extra zip-tie supports add ties; painted area replaces paint can weight', () => {
  const b = clone(current), base = M.analyze(b, rules, { skipLeak: true });
  b.config.extraTies = [{ kind: 'pipe', point: [0, 0, 0] }, { kind: 'pipe', point: [1, 0, 0] }];
  const red = b.parts.find(p => /matte red/.test(p.name));
  b.config.paint = [{ kind: 'drum', key: 'drum:0', color: red.color_hex, paint: red.name, area_sqft: 22.5 }];
  const a = M.analyze(b, rules, { skipLeak: true });
  assert.strictEqual(a.requirements.tieCount, base.requirements.tieCount + 2);
  const plan = M.paintPlan(b.config, b.parts);
  assert.strictEqual(plan.colors[0].cans, 2);                       // 22.5 sq ft at 15 sq ft a can
  near(a.weights.byRole.paint, 22.5 * M.PAINT_LB_PER_SQFT, 1e-6, 'paint weighed by area');
  assert.ok(a.recommendations.some(r => /^Paint plan/.test(r.title) && r.level === 'warn'), 'one can of red is not enough');
});

test('weights: consumables and sheet goods count only what ends up on the boat', () => {
  const a = M.analyze(current, rules, { skipLeak: true }), w = a.weights;
  assert.ok(w.byRole.xps < 8 && w.byRole.xps > 0, 'XPS cut to the deck');
  const tieW = current.parts.filter(p => p.role === 'zip-tie').reduce((t, p) => t + p.quantity * p.weight_lb_each, 0);
  assert.ok(w.byRole['zip-tie'] < tieW, 'only the ties the layout uses');
  assert.ok(w.undecided > 0 && w.predicted < 150);
  assert.ok(a.recommendations.some(r => /^Not counted yet/.test(r.title)));
});

test('side panels: outer box faces only, packed into 26" x 8 ft panels, weighed by area', () => {
  const g = M.geometry(current.config), q = M.requirements(g, current.parts);
  assert.ok(g.sidePanels.length > 0);
  // the pair's shared middle wall and the bow box's butted end get no panel
  assert.ok(!g.sidePanels.some(sp => Math.abs(sp.a[2]) < 0.5 && Math.abs(sp.b[2]) < 0.5 && sp.a[0] !== sp.b[0]), 'no panel on the shared wall');
  const outerLen = g.sidePanels.reduce((t, sp) => t + sp.len, 0);
  const g2 = M.geometry(Object.assign({}, current.config, { sidePanels: false }));
  assert.strictEqual(g2.sidePanels.length, 0);
  assert.ok(q.items.panel >= Math.ceil(outerLen / 96) && q.items.panel <= 4);
  near(q.panelArea_sqft, g.sidePanels.reduce((t, sp) => t + sp.len * sp.height, 0) / 144, 1e-9, 'area');
  const a = M.analyze(current, rules, { skipLeak: true });
  const listed = current.parts.find(p => p.role === 'panel');
  assert.ok(a.weights.byRole.panel > 0 && a.weights.byRole.panel < listed.quantity * listed.weight_lb_each, 'only the area used');
});

test('curved hull: one piece around every box with a pointed bow, held by a pipe nose', () => {
  const g = M.geometry(current.config), q = M.requirements(g, current.parts), hl = g.hull;
  assert.ok(hl && g.sidePanels.length === 1 && g.sidePanels[0].hull);
  assert.ok(hl.tip >= hl.xf + current.config.hullBow - 1e-9, 'bow point ahead of the boxes');
  // the outline contains every box corner
  const inside = ([x, z]) => { let c = false; const o = hl.outline; for (let i = 0, j = o.length - 1; i < o.length; j = i++) { const [xi, zi] = o[i], [xj, zj] = o[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
  g.boxList.forEach(b => [[b.x0 + .1, b.z0 + .1], [b.x1 - .1, b.z1 - .1], [b.x1 - .1, b.z0 + .1]].forEach(pt => assert.ok(inside(pt), JSON.stringify(pt))));
  assert.ok(g.cagePieces.some(pc => pc.kind === 'nose'), 'nose pipes');
  assert.ok(q.items.panel <= 4 && q.panels.every(p => p.cuts.every(c => c <= 96)));
  assert.ok(g.overall.length / 12 <= 10, 'still under 10 ft');
});

test('decals: stickers become optional shopping rows; suggested parts are not weighed', () => {
  const b = clone(current);
  b.parts = b.parts.filter(p => p.role !== 'decal');
  b.config.decals = [{ type: 'skull', kind: 'sticker' }, { type: 'porthole' }, { type: 'porthole' }, { type: 'stripe' }, { type: 'star', kind: 'paint' }];
  const a = M.analyze(b, rules, { skipLeak: true });
  const rows = a.shopping.rows.filter(r => r.role === 'decal');
  assert.ok(rows.every(r => r.priority === 'optional' && r.links.some(l => l.label === 'Amazon')));
  assert.strictEqual(rows.find(r => /Porthole/.test(r.name)).qty, 1, 'two portholes fit in one set of 4');
  assert.ok(rows.some(r => /stencil/i.test(r.name)), 'painted decals need a stencil');
  const s = clone(current); const cushion = s.parts.find(p => p.role === 'cushion');
  cushion.status = 'planned'; const w1 = M.analyze(s, rules, { skipLeak: true }).weights.predicted;
  cushion.status = 'suggested'; const w2 = M.analyze(s, rules, { skipLeak: true }).weights.predicted;
  near(w1 - w2, cushion.quantity * cushion.weight_lb_each, 1e-9, 'suggested parts are not weighed');
  assert.ok(M.isBought({ status: 'ordered' }));
});

test('chord fit: side rails inside the drum diameter press on it, no stubs, drums never overlap', () => {
  for (const sg of [-6, -4, -2.6, -1, 0, 1]) for (const gap of [0, 4, 8, 14]) {
    const cfg = Object.assign({}, current.config, { boxSideGap: sg, packGap: gap });
    const g = M.geometry(cfg), q = M.requirements(g, current.parts);
    assert.deepStrictEqual(g.overlaps, [], `sg ${sg} gap ${gap}`);
    assert.ok(q.cuts.every(c => c.len >= 2), `stub at sg ${sg} gap ${gap}`);
    if (sg < 0) g.drums.forEach((d, i) => {
      const b = g.boxList[i], rr = d.r + M.PIPE_R, cy = d.y0 + d.r;
      // every rail is at or outside the drum surface (it touches, it doesn't cut in)
      [[b.z0, b.yt], [b.z1, b.yt], [b.z0, b.yb], [b.z1, b.yb]].forEach(([z, y]) => assert.ok(Math.hypot(z - d.z, y - cy) >= rr - 0.05, `rail inside drum ${i}`));
      assert.ok(b.z1 - b.z0 < 2 * d.r, 'box narrower than the drum');
    });
  }
});

test('platform and noodles: PVC grid under the deck, noodles in its bays and around the bow', () => {
  const withPlatform = Object.assign({}, current.config, { platform: true });   // optional, off by default
  const g = M.geometry(withPlatform), q = M.requirements(g, current.parts);
  assert.ok(g.platform && g.cagePieces.some(pc => pc.kind === 'platform'));
  assert.ok(g.deckBottom > g.platform.y, 'deck sits on the platform');
  assert.ok(g.bowNoodle && g.bowNoodle.len <= 52 + 10);
  assert.strictEqual(q.items.noodle, q.noodles.platform + q.noodles.bow + q.noodles.rail + q.noodles.frame);
  const off = M.requirements(M.geometry(Object.assign({}, current.config, { platform: false, bowNoodle: false })), current.parts);
  assert.ok(off.pipeLength_in < q.pipeLength_in);
});

test('engineering: buoyancy, drag, weight distribution and structural checks', () => {
  const a = M.analyze(current, rules, { skipLeak: true }), E = a.engineering;
  near(E.buoyancy.load, a.solution.W, 1e-9, 'load');
  near(E.buoyancy.drums.reduce((t, d) => t + d.lb, 0) + E.buoyancy.frameLift, a.solution.W, 1e-6, 'drums and foam-filled pipe carry the boat');
  assert.ok(E.buoyancy.sf > 1 && E.buoyancy.emergency > 0);
  assert.ok(E.drag.at[1].lb > E.drag.at[0].lb * 3.9 && E.drag.at[1].lb < E.drag.at[0].lb * 4.1, 'drag goes with speed squared');
  assert.ok(E.drag.sideArea > E.drag.frontArea, 'broadside shows more area');
  near(E.weight.groups.reduce((t, g) => t + g.lb, 0), a.solution.W, 1e-6, 'groups add up');
  assert.ok(E.structure.length >= 3 && E.structure.every(s => isFinite(s.sf) && ['ok', 'warn', 'error'].includes(s.level)));
  near(M.PVC.S, 0.326, 0.005, 'Sch 40 section modulus');
  // a longer unsupported platform span lowers the safety factor (the platform is optional, so turn it on)
  const withPlat = deck => M.analyze(Object.assign({}, current, { config: Object.assign({}, current.config, { platform: true, deck: Object.assign({}, current.config.deck, deck) }) }), rules, { skipLeak: true });
  const sf = r => (r.engineering.structure.find(s => s.id === 'platform') || {}).sf;
  assert.ok(sf(withPlat({ width: 40 })) < sf(withPlat({})));
  // every warning has a place on the boat
  assert.ok(a.issues.length > 0 && a.issues.every(i => Array.isArray(i.at) && i.at.length === 3 && i.at.every(Number.isFinite)));
});

test('engineering: every number shows its work', () => {
  const withPlatform = Object.assign({}, current, { config: Object.assign({}, current.config, { platform: true }) });
  const E = M.analyze(withPlatform, rules, { skipLeak: true }).engineering;
  ['buoy.max', 'buoy.load', 'buoy.reserve', 'buoy.sf', 'buoy.frame', 'buoy.emergency', 'drag.area', 'drag.force', 'drag.speed', 'drag.broadside', 'wt.cg', 'wt.fwd', 'wt.cgw']
    .concat(E.buoyancy.drums.map(d => 'buoy.drum' + d.id), E.structure.map(s => 'st.' + s.id))
    .forEach(id => { const w = E.work[id]; assert.ok(w && w.formula && w.steps.length && w.why, id); assert.ok(w.steps.every(t => !/NaN|undefined/.test(t)), id); });
  // the shown numbers are the ones used: the platform check's last step ends in its safety factor
  const pl = E.structure.find(s => s.id === 'platform');
  assert.ok(E.work['st.platform'].steps.some(t => t.includes('SF = ') && t.includes(pl.sf.toFixed(2))));
});

test('default build: the short cage pipes (box cross pieces and links) cut to 11.5", as built', () => {
  const g = M.geometry(M.withDefaults(current.config)), req = M.requirements(g, current.parts);
  const cross = req.cuts.filter(c => /(top|bottom|link)$/.test(c.label) && c.len < 12);
  assert.ok(cross.length >= 8, 'front box cross pieces and the links');
  cross.filter(c => c.len > 10).forEach(c => assert.strictEqual(c.len, 11.5, c.label));
});

test('part IDs: every pipe, joint and part gets a unique, stable label that matches the cut list and fittings', () => {
  const g = M.geometry(M.withDefaults(current.config)), L = g.labels, req = M.requirements(g, current.parts);
  const all = [...L.pipes, ...L.joints, ...L.drums, ...L.panels, ...L.noodles, ...L.others].map(o => o.id);
  assert.strictEqual(new Set(all).size, all.length, 'IDs are unique');
  assert.ok(g.cagePieces.every(pc => /^P\d+$/.test(pc.id)), 'every pipe piece has a P number');
  assert.deepStrictEqual(L.pipes.map(q => q.id), L.pipes.map((_, i) => 'P' + (i + 1)), 'pipes numbered 1..n');
  assert.strictEqual(L.drums.length, g.drums.length);
  // the cut list carries the same IDs, each pipe once
  const cutIds = req.cuts.filter(c => c.cage).map(c => c.id).sort();
  assert.deepStrictEqual(cutIds, g.cagePieces.map(pc => pc.id).sort());
  // joint types agree with the fittings count: 3+ way joints are the tees, angled 2-way the elbows
  assert.strictEqual(L.joints.filter(j => j.ways >= 3).length, req.items.tee);
  assert.strictEqual(L.joints.filter(j => /elbow/.test(j.type)).length, req.items.elbow);
  // every joint's pipes really end or pass there
  L.joints.forEach(j => assert.ok(j.pipes.length >= 1 && j.pipes.every(id => L.pipes.some(q => q.id === id)), j.id));
  // same design, same labels
  const again = M.geometry(M.withDefaults(current.config)).labels;
  assert.deepStrictEqual(again.joints.map(j => [j.id, j.type, j.pipes.join()]), L.joints.map(j => [j.id, j.type, j.pipes.join()]));
});

test('platform: off by default; when on, it is lashed to the box top rails it crosses', () => {
  assert.strictEqual(current.config.platform, false, 'default build has no platform');
  const g0 = M.geometry(current.config), r0 = M.requirements(g0, current.parts);
  assert.ok(!g0.cagePieces.some(pc => pc.kind === 'platform') && !r0.platformLashings);
  const g = M.geometry(Object.assign({}, current.config, { platform: true })), r = M.requirements(g, current.parts);
  const L = g.platform.lashings;
  assert.ok(L.length > 0, 'the platform crosses some box rails');
  L.forEach(l => {
    const pp = l.platformPiece, bp = l.boxPiece;
    assert.strictEqual(pp.kind, 'platform'); assert.ok(['top', 'link'].includes(bp.kind));
    // the platform pipe rests on the rail: one pipe diameter higher, crossing at right angles in plan
    near(pp.a[1] - bp.a[1], 2 * M.PIPE_R, 1e-6, 'stacked one diameter up');
    const d = q => [q.b[0] - q.a[0], q.b[2] - q.a[2]];
    near(d(pp)[0] * d(bp)[0] + d(pp)[1] * d(bp)[1], 0, 1e-6, 'perpendicular');
  });
  assert.strictEqual(r.platformLashTies, M.PLATFORM_TIES_PER_CROSSING * L.length);
  assert.strictEqual(r.tieCount - r0.tieCount, r.platformLashTies, 'lashing ties are counted');
  // a tie around two crossed 1.9" pipes needs about (2 + π)·1.9 + 2 ≈ 12"
  assert.strictEqual(M.LASH_TIE_MIN_IN, Math.ceil((2 + Math.PI) * 1.9 + 2));
  assert.strictEqual(new Set(g.labels.lashings.map(x => x.id)).size, L.length);
});

test('cut allowance: every pipe is cut long by the allowance and the sticks still hold the cuts', () => {
  const cfg = M.withDefaults(current.config), g = M.geometry(cfg), req = M.requirements(g, current.parts);
  assert.ok(cfg.cutAllowance > 0, 'the default leaves margin to trim after a dry fit');
  req.cuts.forEach(k => near(k.cut, k.len + cfg.cutAllowance, 1e-9, k.label));
  req.sticks.forEach(st => assert.ok(st.cuts.reduce((t, k) => t + k.cut + 0.125, 0) <= 120 + 0.125 + 1e-9, 'fits a 10 ft stick'));
  // no allowance never needs more sticks than with one
  const none = M.requirements(M.geometry(Object.assign({}, current.config, { cutAllowance: 0 })), current.parts);
  assert.ok(none.items.pipe <= req.items.pipe);
  none.cuts.forEach(k => assert.strictEqual(k.cut, k.len));
});

test('railing and frame noodles (as built 2026-10-07): posts on the outline corners, rails around it', () => {
  const cfg = M.withDefaults(current.config);
  assert.ok(cfg.railing && cfg.frameNoodles >= 1, 'the default build has the railing and noodles on the box rails');
  const g = M.geometry(cfg), posts = g.cagePieces.filter(pc => pc.kind === 'rpost'), rails = g.cagePieces.filter(pc => pc.kind === 'railing');
  const outline = g.railing.outline;
  assert.strictEqual(posts.length, outline.length); assert.strictEqual(rails.length, outline.length);
  // every box corner lies inside or on the railing outline (it is the convex hull of the corners)
  const inside = (x, z) => outline.every(([x1, z1], i) => { const [x2, z2] = outline[(i + 1) % outline.length]; return (x2 - x1) * (z - z1) - (z2 - z1) * (x - x1) >= -1e-6; });
  g.boxList.forEach(b => [[b.x0, b.z0], [b.x0, b.z1], [b.x1, b.z0], [b.x1, b.z1]].forEach(([x, z]) => assert.ok(inside(x, z), `corner ${x},${z}`)));
  // posts stand on box corners and reach the railing height; rails are level at that height
  posts.forEach(pc => { assert.ok(g.boxList.some(b => [b.x0, b.x1].some(x => Math.abs(x - pc.a[0]) < 0.5) && [b.z0, b.z1].some(z => Math.abs(z - pc.a[2]) < 0.5))); near(pc.b[1], g.railing.y, 1e-9, 'post top'); });
  rails.forEach(pc => { near(pc.a[1], g.railing.y, 1e-9, 'rail'); near(pc.b[1], g.railing.y, 1e-9, 'rail'); });
  near(g.railing.y, Math.max(...g.boxList.map(b => b.yt)) + cfg.railingHeight, 1e-9, 'height above the box tops');
  // the railing counts toward the wall height (rule: under 2 ft) and the overall height
  assert.ok(g.wallHeight >= g.railing.y + M.PIPE_R - g.deckTop - 1e-9 && g.wallHeight < 24);
  // frame noodles: layers × the fore-aft top rail rows, cut from 52" noodles
  const q = M.requirements(g, current.parts);
  near(g.frameNoodles.length, g.frameNoodles.runs.reduce((t, r) => t + r.x1 - r.x0, 0) * cfg.frameNoodles, 1e-9, 'noodle length');
  assert.strictEqual(q.noodles.frame, Math.ceil(g.frameNoodles.length / 52));
  // off means no railing pieces and no frame noodles
  const g0 = M.geometry(Object.assign({}, cfg, { railing: false, frameNoodles: 0 }));
  assert.ok(!g0.railing && !g0.frameNoodles && !g0.cagePieces.some(pc => /rpost|railing/.test(pc.kind)));
});

test('flooded drums, caps closed: the water inside is ballast with a free surface; caps open: only the noodles lift', () => {
  const at = over => { const b = JSON.parse(JSON.stringify(current)); Object.assign(b.config, over); return b; };
  const dry = M.analyze(at({})), g = dry.geometry, WATER = 62.4 / 1728;
  const vol = g.drums.reduce((t, d) => t + Math.PI * d.r * d.r * d.len, 0);
  // closed: lift is the whole drum, and the water inside is added weight
  const closed = M.analyze(at({ floodPct: 30, drumNoodles: 0 })).solution;
  assert.ok(Math.abs(closed.maxLb - dry.solution.maxLb) < 1e-6);
  assert.ok(Math.abs(closed.W - (dry.solution.W + 0.3 * vol * WATER)) < 0.5, `closed W ${closed.W}`);
  // free surface: the same ballast as a solid block (no free surface) would be more stable
  const gc = M.analyze(at({ floodPct: 30 })).geometry, items = M.massItems(at({ floodPct: 30 }), gc);
  const solid = M.solve(Object.assign({}, gc, { config: Object.assign({}, gc.config, { floodPct: 0 }) }), items);
  const yb = M.floodFloor(g.drums[0].r, 30), w = M.segWidth(yb, g.drums[0].r);
  const fsc = g.drums.length * g.drums[0].len * w ** 3 / 12 / (closed.W / WATER);
  assert.ok(Math.abs((solid.gmRoll - closed.gmRoll) - fsc) < 0.05, `free-surface loss ${solid.gmRoll - closed.gmRoll} vs i/∇ ${fsc}`);
  // open: shells and inside water carry no weight; lift = the noodles' share of each drum (plus cage pipes)
  const pipeLb = dry.solution.maxLb - vol * WATER;
  for (const n of [0, 10, 20]) {
    const s = M.analyze(at({ floodPct: 70, floodVented: true, drumNoodles: n })).solution;
    const noodleLb = 3 * n * Math.PI * 1.25 ** 2 * 52 * WATER;
    assert.ok(Math.abs(s.maxLb - (Math.min(noodleLb, vol * WATER) + pipeLb)) < 0.5, `${n} noodles: ${s.maxLb}`);
    assert.ok(Math.abs(s.W - (dry.solution.W - g.drums.reduce((t, d) => t + d.spec.weight, 0))) < 1e-6);
  }
  // noodles take room the water cannot: 20 noodles (~37%) cap the flood at ~63%
  const capped = M.analyze(at({ floodPct: 90, drumNoodles: 20 })).solution, c63 = M.analyze(at({ floodPct: 100 - 100 * 20 * Math.PI * 1.25 ** 2 * 52 / (vol / 3), drumNoodles: 0 })).solution;
  assert.ok(Math.abs(capped.W - c63.W) < 0.5);
  // advice: the sweep, the best level and the noodles needed if the air escapes
  const a = M.analyze(at({ floodPct: 70, drumNoodles: 4 }));
  assert.strictEqual(a.flood.rows.length, 10);
  assert.ok(a.flood.best && a.flood.best.usable && a.flood.rows.every(r => !r.usable || r.gmRoll <= a.flood.best.gmRoll + 0.05));
  assert.ok(a.flood.noodlesNeeded > 4 && !a.flood.airLost.usable);
  const need = M.analyze(at({ floodPct: 70, floodVented: true, drumNoodles: a.flood.noodlesNeeded })).solution;
  assert.ok(need.ok && need.deckClearance >= 6);
  assert.ok(a.recommendations.some(r => /noodles/.test(r.title)) && a.recommendations.some(r => /Most stable flood level/.test(r.title)));
  // the shipped default is the team's 2026-10-09 boat: drums 70% flooded through holes in their tops and bottoms
  assert.strictEqual(asBuilt.config.floodPct, 70);
  assert.strictEqual(asBuilt.config.floodVented, true);
});

test('float-test rule: passes for the sealed boat, fails when the flooded drums cannot carry the crew', () => {
  const r = require('../data/rules.json');
  const sealed = M.analyze(current, r).rules.find(x => x.id === 'floatTest');
  assert.ok(sealed && sealed.level !== 'error' && /floats with 2 crew/.test(sealed.title));
  const built = M.analyze(asBuilt, r), ft = built.rules.find(x => x.id === 'floatTest');
  assert.ok(ft && ft.level === 'error' && /sinks/.test(ft.detail) && /no screws/.test(ft.detail));
  assert.ok(/2026-10-09/.test(ft.title));
  // enough noodles to carry the crew turns it back into a pass
  const need = built.flood.noodlesNeeded, b = JSON.parse(JSON.stringify(asBuilt)); b.config.drumNoodles = need;
  assert.notStrictEqual(M.analyze(b, r).rules.find(x => x.id === 'floatTest').level, 'error');
});

test('added parts (edit mode): weight, centre of gravity, flotation, cut list and parts used', () => {
  const at = extras => { const b = JSON.parse(JSON.stringify(current)); b.config.extras = extras; return b; };
  const base = M.analyze(at([])), g0 = base.geometry;
  // a 52" noodle along the outer side at the water line: lift, weight and the noodle count go up
  const zOut = Math.max(...g0.boxList.map(b => b.z1)) + 3, y = base.solution.d;
  const n = M.analyze(at([{ type: 'noodle', at: [-13, y, zOut], axis: 'x', len: 52 }]));
  assert.strictEqual(n.geometry.labels.extras[0].id, 'X1');
  assert.strictEqual(n.requirements.items.noodle, (base.requirements.items.noodle || 0) + 1);
  const noodleVol = Math.PI * 1.25 ** 2 * 52;
  assert.ok(Math.abs(n.solution.maxLb - base.solution.maxLb - noodleVol * 62.4 / 1728) < 1e-6);
  assert.ok(n.weights.total > base.weights.total && n.weights.total - base.weights.total < 1);
  // a half-submerged noodle out to the side adds roll stability
  assert.ok(n.solution.gmRoll > base.solution.gmRoll);
  // an added pipe goes on the cut list and is weighed per inch
  const p = M.analyze(at([{ type: 'pipe', at: [0, 30, 0], axis: 'z', len: 30 }]));
  assert.ok(p.requirements.cuts.some(k => k.id === 'X1' && k.len === 30));
  assert.ok(Math.abs(p.requirements.pipeLength_in - base.requirements.pipeLength_in - 30) < 1e-9);
  const pw = M.extraWeights(at([{ type: 'pipe', at: [0, 30, 0], axis: 'z', len: 30 }]), p.geometry)[0].w;
  assert.ok(Math.abs(pw - 5.1 * 30 / 120) < 1e-9);
  // weight placed up high raises the centre of gravity; the total weight stays consistent
  assert.ok(p.solution.KG > base.solution.KG);
  assert.ok(Math.abs(p.solution.W - (base.solution.W + (p.weights.total - base.weights.total))) < 0.05, `W ${p.solution.W} vs ${base.solution.W} + ${p.weights.total - base.weights.total}`);
  // a fitting counts toward its role; the spare drum adds weight and lift
  const f = M.analyze(at([{ type: 'fitting', role: 'elbow', at: [0, 30, 0] }]));
  assert.strictEqual(f.requirements.items.elbow, (base.requirements.items.elbow || 0) + 1);
  const d = M.analyze(at([{ type: 'drum', at: [-50, 11.25, 0], axis: 'z' }]));
  const spec = M.drumSpec(current.config, 0);
  assert.strictEqual(d.requirements.items.drum, base.requirements.items.drum + 1);
  assert.ok(Math.abs(d.weights.total - base.weights.total - spec.weight) < 1e-9);
  assert.ok(Math.abs(d.solution.maxLb - base.solution.maxLb - Math.PI * (spec.dia / 2) ** 2 * spec.len * 62.4 / 1728) < 1e-6);
  assert.throws(() => M.geometry(Object.assign({}, current.config, { extras: [{ type: 'rocket', at: [0, 0, 0] }] })), /unknown type/);
});
