// STEP AP214 export of the raft model, for SolidWorks (File → Open → STEP) and other CAD tools.
// The boat becomes one multibody part in inches, one named solid per item, with its part ID:
//   P… pipes as hollow 1-1/2" Sch 40 tubes (OD 1.900", ID 1.610"), centre to centre between joints
//   J… fittings as 2.6" spheres at the joints (as in the 3D view)
//   D… drums as solid cylinders (outside size), K1 the deck as a box, N… noodles as 2.5" cylinders
// Axes follow the simulator: x fore-aft (bow +), y up (drum bottoms at 0), z port(−)/starboard(+).
// Left out: side panels, the bow noodle (curved), mast, flag and crew.
// Topology follows ISO 10303-42: each solid is a closed shell of faces whose loops run
// counter-clockwise seen from outside; a cylinder's side face is closed by a seam line.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RaftStep = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const PIPE_OD = 1.9, PIPE_ID = 1.61, FIT_R = 1.3, NOODLE_R = 1.25;

  // ── small vector helpers ──
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(...a); if (!(l > 1e-9)) throw new Error('zero-length direction'); return mul(a, 1 / l); };
  const perp = d => norm(cross(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));

  // ── entity writer ──
  function Writer() {
    const lines = [];
    const fmt = v => {
      if (typeof v === 'number') { if (!isFinite(v)) throw new Error('non-finite number in STEP'); const s = (+v.toFixed(6)).toString(); return /[.eE]/.test(s) ? s : s + '.'; }
      if (Array.isArray(v)) return '(' + v.map(fmt).join(',') + ')';
      return v;   // already formatted: #ref, 'string', .ENUM., $, *
    };
    const e = (type, ...args) => { lines.push(`#${lines.length + 1}=${type}(${args.map(fmt).join(',')});`); return '#' + lines.length; };
    e.raw = text => { lines.push(`#${lines.length + 1}=${text};`); return '#' + lines.length; };
    e.lines = lines;
    return e;
  }
  const str = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/[^\x20-\x7e]/g, '?') + "'";

  // geometry primitives
  const pt = (e, p) => e('CARTESIAN_POINT', "''", p);
  const dir = (e, d) => e('DIRECTION', "''", d);
  const ax2 = (e, o, z, x) => e('AXIS2_PLACEMENT_3D', "''", pt(e, o), dir(e, z), dir(e, x));
  const vtx = (e, p) => e('VERTEX_POINT', "''", pt(e, p));
  const lineEdge = (e, v1, v2, p1, p2) => e('EDGE_CURVE', "''", v1, v2, e('LINE', "''", pt(e, p1), e('VECTOR', "''", dir(e, norm(sub(p2, p1))), Math.hypot(...sub(p2, p1)))), '.T.');
  // a full circle about axis d through centre c, starting and ending at vertex v (at c + r·x)
  const circleEdge = (e, v, c, d, x, r) => e('EDGE_CURVE', "''", v, v, e('CIRCLE', "''", ax2(e, c, d, x), r), '.T.');
  const oe = (e, edge, sense) => e('ORIENTED_EDGE', "''", '*', '*', edge, sense ? '.T.' : '.F.');
  const loop = (e, edges) => e('EDGE_LOOP', "''", edges);
  const face = (e, bounds, surf, same = true) => e('ADVANCED_FACE', "''", bounds, surf, same ? '.T.' : '.F.');
  const outer = (e, l) => e('FACE_OUTER_BOUND', "''", l, '.T.');
  const inner = (e, l) => e('FACE_BOUND', "''", l, '.T.');

  // Cylinder or tube from p0 to p1 (radius ro, bore ri or 0): side face(s) closed by a seam line,
  // planar (or annular) end faces. Returns the faces.
  function cylinderFaces(e, p0, p1, ro, ri) {
    const L = Math.hypot(...sub(p1, p0)), d = norm(sub(p1, p0)), x = perp(d);
    const ring = r => {
      const a = add(p0, mul(x, r)), b = add(p1, mul(x, r)), va = vtx(e, a), vb = vtx(e, b);
      return { c0: circleEdge(e, va, p0, d, x, r), c1: circleEdge(e, vb, p1, d, x, r), seam: lineEdge(e, va, vb, a, b), surf: e('CYLINDRICAL_SURFACE', "''", ax2(e, p0, d, x), r) };
    };
    if (!(L > 1e-6)) throw new Error('zero-length cylinder');
    const o = ring(ro), faces = [];
    // outside: (u around d, v along d) is right-handed with the outward normal, so the loop runs
    // bottom circle forward, up the seam, top circle backward, down the seam
    faces.push(face(e, [outer(e, loop(e, [oe(e, o.c0, true), oe(e, o.seam, true), oe(e, o.c1, false), oe(e, o.seam, false)]))], o.surf));
    const capBottom = e('PLANE', "''", ax2(e, p0, mul(d, -1), x)), capTop = e('PLANE', "''", ax2(e, p1, d, x));
    if (ri > 0) {
      const i = ring(ri);
      // bore: the face normal points into the bore (same_sense false), so its loop runs the other way
      faces.push(face(e, [outer(e, loop(e, [oe(e, i.seam, true), oe(e, i.c1, true), oe(e, i.seam, false), oe(e, i.c0, false)]))], i.surf, false));
      faces.push(face(e, [outer(e, loop(e, [oe(e, o.c0, false)])), inner(e, loop(e, [oe(e, i.c0, true)]))], capBottom));
      faces.push(face(e, [outer(e, loop(e, [oe(e, o.c1, true)])), inner(e, loop(e, [oe(e, i.c1, false)]))], capTop));
    } else {
      faces.push(face(e, [outer(e, loop(e, [oe(e, o.c0, false)]))], capBottom));
      faces.push(face(e, [outer(e, loop(e, [oe(e, o.c1, true)]))], capTop));
    }
    return faces;
  }
  // Sphere: two hemispheres of one spherical surface, split by the equator circle.
  function sphereFaces(e, c, r) {
    const z = [0, 1, 0], x = [1, 0, 0], v = vtx(e, add(c, mul(x, r))), eq = circleEdge(e, v, c, z, x, r), surf = e('SPHERICAL_SURFACE', "''", ax2(e, c, z, x), r);
    return [face(e, [outer(e, loop(e, [oe(e, eq, true)]))], surf), face(e, [outer(e, loop(e, [oe(e, eq, false)]))], surf)];
  }
  // Axis-aligned box from its centre and size [x, y, z].
  function boxFaces(e, c, s) {
    const h = s.map(v => v / 2);
    if (!h.every(v => v > 0)) throw new Error('box needs a positive size');
    const P = [];
    for (let i = 0; i < 8; i++) P.push([c[0] + (i & 1 ? h[0] : -h[0]), c[1] + (i & 2 ? h[1] : -h[1]), c[2] + (i & 4 ? h[2] : -h[2])]);
    const V = P.map(p => vtx(e, p)), edges = new Map();
    const edge = (i, j) => { const k = Math.min(i, j) + ',' + Math.max(i, j); if (!edges.has(k)) edges.set(k, { from: Math.min(i, j), id: lineEdge(e, V[Math.min(i, j)], V[Math.max(i, j)], P[Math.min(i, j)], P[Math.max(i, j)]) }); const ed = edges.get(k); return oe(e, ed.id, ed.from === i); };
    // corners of each face, counter-clockwise seen from outside, with the outward normal
    const F = [[[0, 2, 6, 4], [-1, 0, 0]], [[1, 5, 7, 3], [1, 0, 0]], [[0, 4, 5, 1], [0, -1, 0]], [[2, 3, 7, 6], [0, 1, 0]], [[0, 1, 3, 2], [0, 0, -1]], [[4, 6, 7, 5], [0, 0, 1]]];
    return F.map(([q, n]) => {
      const mid = q.reduce((a, i) => add(a, mul(P[i], 0.25)), [0, 0, 0]), xr = norm(sub(P[q[1]], P[q[0]]));
      return face(e, [outer(e, loop(e, q.map((i, k) => edge(i, q[(k + 1) % 4]))))], e('PLANE', "''", ax2(e, mid, n, xr)));
    });
  }

  // ── the bodies of the boat, from the model geometry (with part labels) ──
  function bodies(g) {
    if (!g || !g.labels) throw new Error('geometry needs part labels (use RaftModel.geometry or analyze().geometry)');
    const c = g.config, out = [], L = g.labels;
    L.pipes.forEach(p => out.push({ kind: 'cyl', name: `${p.id} pipe ${p.kind}`, a: p.a, b: p.b, ro: PIPE_OD / 2, ri: PIPE_ID / 2, color: [0.94, 0.94, 0.92] }));
    L.joints.forEach(j => out.push({ kind: 'sphere', name: `${j.id} fitting ${j.type}`, c: j.at, r: FIT_R, color: [0.85, 0.85, 0.82] }));
    g.drums.forEach(d => {
      const cy = d.y0 + d.r, h = d.len / 2, a = d.axis === 'z' ? [d.x, cy, d.z - h] : [d.x - h, cy, d.z], b = d.axis === 'z' ? [d.x, cy, d.z + h] : [d.x + h, cy, d.z];
      out.push({ kind: 'cyl', name: `D${d.id + 1} drum ${d.spec.dia}x${d.len}${d.failed ? ' (failed)' : ''}`, a, b, ro: d.r, ri: 0, color: [0.12, 0.35, 0.75] });
    });
    const dk = c.deck;
    out.push({ kind: 'box', name: 'K1 deck', c: [0, g.deckBottom + dk.thickness / 2, 0], s: [dk.length, dk.thickness, dk.width], color: [0.55, 0.6, 0.65] });
    const R = PIPE_OD / 2;
    if (g.frameNoodles) { let n = 0; g.frameNoodles.runs.forEach(rn => { for (let k = 0; k < g.frameNoodles.layers; k++) {
      const z = rn.z + rn.side * (R + NOODLE_R), y = rn.y + (k - (g.frameNoodles.layers - 1) / 2) * 2.5 + NOODLE_R;
      out.push({ kind: 'cyl', name: `NF${++n} noodle`, a: [rn.x0 + R, y, z], b: [rn.x1 - R, y, z], ro: NOODLE_R, ri: 0, color: [0.2, 0.55, 0.95] });
    } }); }
    if (c.noodleRail) [-1, 1].forEach((s, i) => out.push({ kind: 'cyl', name: `NR${i + 1} noodle rail`, a: [-dk.length / 2, g.deckTop + NOODLE_R, s * (dk.width / 2 - NOODLE_R)], b: [dk.length / 2, g.deckTop + NOODLE_R, s * (dk.width / 2 - NOODLE_R)], ro: NOODLE_R, ri: 0, color: [0.95, 0.85, 0.2] }));
    if (g.platform) { const pl = g.platform; let n = 0; for (let k = 0; k < pl.bays; k++) for (let j = 0; j < pl.across; j++) {
      const z = -pl.W / 2 + R + NOODLE_R + j * 2.5 + ((pl.W - 2 * R) - pl.across * 2.5) / 2;
      out.push({ kind: 'cyl', name: `N${++n} noodle`, a: [pl.xs[k] + R, pl.y, z], b: [pl.xs[k + 1] - R, pl.y, z], ro: NOODLE_R, ri: 0, color: [0.95, 0.85, 0.2] });
    } }
    return out.filter(b => b.kind !== 'cyl' || Math.hypot(...sub(b.b, b.a)) > 1e-3);
  }

  // ── the file ──
  function exportStep(g, opts) {
    opts = opts || {};
    const name = opts.name || 'BOB raft', stamp = opts.timestamp || new Date().toISOString().slice(0, 19);
    const e = Writer(), list = bodies(g);
    // context: AP214 automotive design, lengths in inches (25.4 mm)
    const appCtx = e('APPLICATION_CONTEXT', "'core data for automotive mechanical design processes'");
    e('APPLICATION_PROTOCOL_DEFINITION', "'international standard'", "'automotive_design'", '2000', appCtx);
    const prodCtx = e('PRODUCT_CONTEXT', "''", appCtx, "'mechanical'");
    const product = e('PRODUCT', str(name), str(name), str('Generated by the BOB raft simulator'), [prodCtx]);
    e('PRODUCT_RELATED_PRODUCT_CATEGORY', "'part'", '$', [product]);
    const pdf = e('PRODUCT_DEFINITION_FORMATION', "''", "''", product);
    const pdCtx = e('PRODUCT_DEFINITION_CONTEXT', "'part definition'", appCtx, "'design'");
    const pd = e('PRODUCT_DEFINITION', "'design'", "''", pdf, pdCtx);
    const pds = e('PRODUCT_DEFINITION_SHAPE', "''", "''", pd);
    const mm = e.raw("(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))");
    const inchFactor = e('LENGTH_MEASURE_WITH_UNIT', 'LENGTH_MEASURE(25.4)', mm);
    const dimExp = e('DIMENSIONAL_EXPONENTS', 1., 0., 0., 0., 0., 0., 0.);
    const inch = e.raw(`(CONVERSION_BASED_UNIT('INCH',${inchFactor})LENGTH_UNIT()NAMED_UNIT(${dimExp}))`);
    const rad = e.raw('(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))');
    const sr = e.raw('(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())');
    const unc = e('UNCERTAINTY_MEASURE_WITH_UNIT', 'LENGTH_MEASURE(1.E-05)', inch, "'distance_accuracy_value'", "'confusion accuracy'");
    const geoCtx = e.raw(`(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${unc}))GLOBAL_UNIT_ASSIGNED_CONTEXT((${inch},${rad},${sr}))REPRESENTATION_CONTEXT('',''))`);
    const breps = [], styled = [];
    list.forEach(b => {
      const faces = b.kind === 'cyl' ? cylinderFaces(e, b.a, b.b, b.ro, b.ri) : b.kind === 'sphere' ? sphereFaces(e, b.c, b.r) : boxFaces(e, b.c, b.s);
      const brep = e('MANIFOLD_SOLID_BREP', str(b.name), e('CLOSED_SHELL', "''", faces));
      breps.push(brep);
      const colour = e('COLOUR_RGB', "''", b.color[0], b.color[1], b.color[2]);
      const fill = e('FILL_AREA_STYLE', "''", [e('FILL_AREA_STYLE_COLOUR', "''", colour)]);
      const side = e('SURFACE_SIDE_STYLE', "''", [e('SURFACE_STYLE_FILL_AREA', fill)]);
      const psa = e('PRESENTATION_STYLE_ASSIGNMENT', [e('SURFACE_STYLE_USAGE', '.BOTH.', side)]);
      styled.push(e('STYLED_ITEM', "'color'", [psa], brep));
    });
    const origin = ax2(e, [0, 0, 0], [0, 0, 1], [1, 0, 0]);
    const shapeRep = e('ADVANCED_BREP_SHAPE_REPRESENTATION', str(name), [origin, ...breps], geoCtx);
    e('SHAPE_DEFINITION_REPRESENTATION', pds, shapeRep);
    e('MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION', "''", styled, geoCtx);
    const header = [
      'ISO-10303-21;', 'HEADER;',
      "FILE_DESCRIPTION(('BOB raft: one solid per part, named by part ID; inches'),'2;1');",
      `FILE_NAME(${str(name + '.step')},${str(stamp)},(''),(''),'BOB raft simulator','BOB raft simulator','');`,
      "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));", 'ENDSEC;', 'DATA;'];
    return header.concat(e.lines, ['ENDSEC;', 'END-ISO-10303-21;']).join('\n') + '\n';
  }

  // volume of a body from its dimensions (in³), to check the exported solids against
  function volume(b) {
    if (b.kind === 'cyl') return Math.PI * (b.ro * b.ro - b.ri * b.ri) * Math.hypot(...sub(b.b, b.a));
    if (b.kind === 'sphere') return 4 / 3 * Math.PI * b.r ** 3;
    return b.s[0] * b.s[1] * b.s[2];
  }

  return { exportStep, bodies, volume, PIPE_OD, PIPE_ID, FIT_R, NOODLE_R };
}));
