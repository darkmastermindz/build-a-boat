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
  b.parts.push({ name: 'Galvanized carriage bolts', role: 'other', category: 'frame', material: 'metal', quantity: 1, weight_lb_each: 40 });
  b.parts.push({ name: 'Wood dowel 1 in', role: 'mast', category: 'decor', material: 'wood', thickness_in: 1, quantity: 1, weight_lb_each: 1 });
  b.parts.push({ name: 'Long rope', role: 'rope', category: 'rigging', material: 'polypropylene', max_piece_length_in: 50, quantity: 1, weight_lb_each: 1 });
  const errs = M.analyze(b, rules, { skipLeak: true }).rules.filter(r => r.level === 'error').map(r => r.id);
  for (const id of ['metal', 'wood', 'rope', 'weight']) assert.ok(errs.includes(id), id);
});

test('current build passes hard rules', () => {
  const errs = M.analyze(build, rules).rules.filter(r => r.level === 'error');
  assert.deepStrictEqual(errs, []);
});

test('pipe cut list packs into 10 ft sticks', () => {
  const req = M.requirements(M.geometry(build.config));
  req.sticks.forEach(s => assert.ok(s.cuts.reduce((t, c) => t + c.len, 0) <= 120));
  assert.ok(req.items.pipe >= 8);
});
