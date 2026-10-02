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
