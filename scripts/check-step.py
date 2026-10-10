#!/usr/bin/env python3
"""Check a STEP export with OpenCascade (pip install cadquery-ocp):
   python3 scripts/check-step.py bob-raft.step [expected.json]
Reads the file and checks that every solid is a valid, closed B-rep with a
positive volume. Prints one line per solid: name, volume (in³), bounding box
(in). With expected.json (from `node scripts/export-step.js --expect`), also
checks each volume against the one its dimensions give, within 0.5%.
Exit 1 on any problem."""
import json, re, sys
from OCP.STEPControl import STEPControl_Reader
from OCP.IFSelect import IFSelect_RetDone
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_SOLID
from OCP.TopoDS import TopoDS
from OCP.BRepCheck import BRepCheck_Analyzer
from OCP.GProp import GProp_GProps
from OCP.BRepGProp import BRepGProp
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib

path = sys.argv[1]
expected = json.load(open(sys.argv[2])) if len(sys.argv) > 2 else None
text = open(path).read()
names = re.findall(r"MANIFOLD_SOLID_BREP\('((?:[^']|'')*)'", text)
r = STEPControl_Reader()
if r.ReadFile(path) != IFSelect_RetDone: sys.exit('could not read ' + path)
r.TransferRoots(); shape = r.OneShape()
MM = 25.4   # OpenCascade works in mm; the file is in inches
ex = TopExp_Explorer(shape, TopAbs_SOLID); solids = []
while ex.More(): solids.append(TopoDS.Solid(ex.Current())); ex.Next()
bad = 0
if len(solids) != len(names): bad += 1; print(f'{len(solids)} solids read, {len(names)} in the file')
for i, s in enumerate(solids):
    nm = names[i] if i < len(names) else '?'
    p = GProp_GProps(); BRepGProp.VolumeProperties_s(s, p); v = p.Mass() / MM ** 3
    b = Bnd_Box(); BRepBndLib.Add_s(s, b, False); mn, mx = b.CornerMin(), b.CornerMax(); x0, y0, z0, x1, y1, z1 = (c / MM for c in (mn.X(), mn.Y(), mn.Z(), mx.X(), mx.Y(), mx.Z()))
    ok = BRepCheck_Analyzer(s).IsValid() and v > 0
    msg = '' if ok else '  INVALID'
    if expected is not None:
        want = expected[i]['volume']
        if abs(v - want) > 0.005 * want: ok = False; msg += f'  expected {want:.2f}'
    bad += not ok
    print(f'{nm:32s} {v:10.2f} in3  [{x0:7.2f} {y0:6.2f} {z0:7.2f}] .. [{x1:7.2f} {y1:6.2f} {z1:7.2f}]{msg}')
print(f'{len(solids)} solids, {bad} problem(s)')
sys.exit(1 if bad else 0)
