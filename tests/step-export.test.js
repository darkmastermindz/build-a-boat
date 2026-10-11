const test = require('node:test');
const assert = require('node:assert');
const M = require('../scripts/raft-model.js');
const S = require('../scripts/step-export.js');
const build = require('../data/build.json');

// minimal STEP data-section parser: #id=TYPE(args); or complex #id=(…);
function parse(text) {
  const ents = new Map();
  for (const m of text.matchAll(/^#(\d+)=(.*);$/gm)) {
    const body = m[2], t = /^([A-Z_0-9]+)\(/.exec(body);
    ents.set(+m[1], { type: t ? t[1] : 'COMPLEX', body, refs: [...body.matchAll(/#(\d+)/g)].map(r => +r[1]) });
  }
  return ents;
}
const g = M.geometry(build.config);
const text = S.exportStep(g, { name: 'test raft', timestamp: '2026-10-10T00:00:00' });
const E = parse(text);

test('STEP file: AP214 header, inches, every reference resolves, ids are sequential', () => {
  assert.ok(text.startsWith('ISO-10303-21;\nHEADER;'));
  assert.ok(text.trimEnd().endsWith('END-ISO-10303-21;'));
  assert.match(text, /FILE_SCHEMA\(\('AUTOMOTIVE_DESIGN/);
  assert.match(text, /CONVERSION_BASED_UNIT\('INCH',#\d+\)/);
  assert.match(text, /LENGTH_MEASURE_WITH_UNIT\(LENGTH_MEASURE\(25\.4\)/);
  const ids = [...E.keys()];
  assert.deepStrictEqual(ids, ids.map((_, i) => i + 1));
  E.forEach((e, id) => e.refs.forEach(r => assert.ok(E.has(r), `#${id} refers to missing #${r}`)));
  assert.ok(!/NaN|Infinity|undefined/.test(text));
  // deterministic for the same design and timestamp
  assert.strictEqual(S.exportStep(g, { name: 'test raft', timestamp: '2026-10-10T00:00:00' }), text);
});

test('STEP file: one named solid per pipe, fitting, drum, deck and noodle', () => {
  const names = [...E.values()].filter(e => e.type === 'MANIFOLD_SOLID_BREP').map(e => /^MANIFOLD_SOLID_BREP\('([^']*)'/.exec(e.body)[1]);
  const bodies = S.bodies(g);
  assert.strictEqual(names.length, bodies.length);
  const ids = new Set(names.map(n => n.split(' ')[0]));
  g.labels.pipes.forEach(p => assert.ok(ids.has(p.id), p.id));
  g.labels.joints.forEach(j => assert.ok(ids.has(j.id), j.id));
  g.labels.drums.forEach(d => assert.ok(ids.has(d.id), d.id));
  assert.ok(ids.has('K1'));
  assert.ok(names.some(n => /^NF\d+ noodle/.test(n)) === !!g.frameNoodles);
  // every solid is coloured, and the shape representation lists them all
  assert.strictEqual([...E.values()].filter(e => e.type === 'STYLED_ITEM').length, bodies.length);
  const rep = [...E.values()].find(e => e.type === 'ADVANCED_BREP_SHAPE_REPRESENTATION');
  assert.strictEqual(rep.refs.filter(r => E.get(r).type === 'MANIFOLD_SOLID_BREP').length, bodies.length);
});

test('STEP solids are closed and consistently oriented: each edge is used twice, once each way', () => {
  E.forEach((e, id) => {
    if (e.type !== 'MANIFOLD_SOLID_BREP') return;
    const shell = E.get(e.refs[0]);
    assert.strictEqual(shell.type, 'CLOSED_SHELL');
    const uses = new Map();
    shell.refs.forEach(f => {
      assert.strictEqual(E.get(f).type, 'ADVANCED_FACE');
      E.get(f).refs.slice(0, -1).forEach(b => {        // the bounds (the last ref is the surface)
        const loop = E.get(E.get(b).refs[0]);
        assert.strictEqual(loop.type, 'EDGE_LOOP');
        loop.refs.forEach(o => {
          const oe = E.get(o), sense = /\.T\.\)$/.test(oe.body), edge = oe.refs[0];
          const u = uses.get(edge) || { T: 0, F: 0 }; u[sense ? 'T' : 'F']++; uses.set(edge, u);
        });
      });
    });
    uses.forEach((u, edge) => assert.ok(u.T === 1 && u.F === 1, `solid #${id}: edge #${edge} used ${JSON.stringify(u)}`));
  });
});

test('STEP geometry matches the model: tube and drum radii, deck box, volumes from dimensions', () => {
  const radii = [...E.values()].filter(e => e.type === 'CYLINDRICAL_SURFACE').map(e => +/,([0-9.]+)\)$/.exec(e.body)[1]);
  assert.ok(radii.includes(0.95) && radii.includes(0.805), 'Sch 40 OD and ID');
  g.drums.forEach(d => assert.ok(radii.includes(d.r)));
  const bodies = S.bodies(g), deck = bodies.find(b => b.name === 'K1 deck');
  assert.deepStrictEqual(deck.s, [build.config.deck.length, build.config.deck.thickness, build.config.deck.width]);
  assert.ok(Math.abs(deck.c[1] - (g.deckBottom + build.config.deck.thickness / 2)) < 1e-9);
  const pipe = bodies.find(b => b.name.startsWith('P1 '));
  const L = Math.hypot(...pipe.b.map((v, k) => v - pipe.a[k]));
  assert.ok(Math.abs(S.volume(pipe) - Math.PI * (0.95 ** 2 - 0.805 ** 2) * L) < 1e-9);
  const drum = bodies.find(b => b.name.startsWith('D1 '));
  assert.ok(Math.abs(S.volume(drum) - Math.PI * g.drums[0].r ** 2 * g.drums[0].len) < 1e-6);
});

test('STEP export includes parts added in edit mode', () => {
  const c = Object.assign({}, build.config, { extras: [{ type: 'noodle', at: [0, 10, 30], axis: 'x', len: 52 }, { type: 'fitting', role: 'elbow', at: [0, 30, 0] }] });
  const t = S.exportStep(M.geometry(c), { timestamp: 't' });
  assert.match(t, /MANIFOLD_SOLID_BREP\('X1 added noodle'/);
  assert.match(t, /MANIFOLD_SOLID_BREP\('X2 added fitting elbow'/);
});
