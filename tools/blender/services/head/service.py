"""头。只生成头、短发、眼睛、脖子。不读取其他部位。"""
import math
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from services.common.mesh import sweep, to_blender

RADIAL = 28
RINGS = 22


def _band(theta, lo, hi):
    if theta <= lo:
        return 0.0
    if theta >= hi:
        return 1.0
    t = (theta - lo) / (hi - lo)
    return t * t * (3 - 2 * t)


def _radius(theta, phi):
    rx, ry, rz = 0.075, 0.108, 0.088
    jaw = _band(theta, 1.55, 2.55)
    rx *= 1 - 0.34 * jaw
    rz *= 1 - 0.16 * jaw
    chin = _band(theta, 2.35, math.pi)
    rx *= 1 - 0.28 * chin
    nose = math.exp(-((theta - 1.85) ** 2) / 0.08) * math.exp(-(phi ** 2) / 0.12)
    rz += 0.012 * nose
    return rx, ry, rz


def _point(theta, phi, hair=False):
    rx, ry, rz = _radius(theta, phi)
    if hair:
        rx, ry, rz = rx * 1.06 + 0.004, ry * 1.04 + 0.004, rz * 1.05 + 0.003
    st, ct = math.sin(theta), math.cos(theta)
    return (rx * st * math.sin(phi), 1.575 + ry * ct, rz * st * math.cos(phi))


def _grid(predicate, hair=False):
    verts, faces, index = [], [], {}
    for i in range(RINGS):
        theta = 0.08 + (math.pi - 0.16) * i / (RINGS - 1)
        for j in range(RADIAL):
            phi = (j / RADIAL) * math.tau - math.pi
            if predicate(theta, phi):
                index[(i, j)] = len(verts)
                verts.append(to_blender(_point(theta, phi, hair)))
    for i in range(RINGS - 1):
        for j in range(RADIAL):
            j2 = (j + 1) % RADIAL
            quad = [(i, j), (i, j2), (i + 1, j2), (i + 1, j)]
            if all(p in index for p in quad):
                faces.append(tuple(index[p] for p in quad))
    return verts, faces


def _neck():
    centers = [(0.0, 1.30 + i * 0.026, -0.002) for i in range(10)]
    radii = []
    for i in range(10):
        t = i / 9
        radii.append((0.046 + 0.006 * t, 0.042 + 0.006 * t))
    return sweep(centers, radii, radial=20, power=2.3)


def _eye(side):
    centers, radii = [], []
    for i in range(6):
        t = i / 5
        centers.append((side * 0.030, 1.585, 0.078 + t * 0.012))
        radii.append((0.013 - 0.004 * t, 0.012 - 0.003 * t))
    return sweep(centers, radii, radial=12, power=2.0, cap_start=True, cap_end=True)


def generate(height_m=1.75):
    skin_v, skin_f = _grid(lambda theta, phi: True)
    hair_v, hair_f = _grid(lambda theta, phi: theta < 1.85 and not (abs(phi) < 0.85 and theta > 0.95), hair=True)
    neck_v, neck_f = _neck()
    pieces = [
        {"name": "Head", "verts": skin_v, "faces": skin_f, "slot": "skin", "subdiv": 1, "thickness": 0.0},
        {"name": "Hair", "verts": hair_v, "faces": hair_f, "slot": "hair", "subdiv": 1, "thickness": 0.0},
        {"name": "Neck", "verts": neck_v, "faces": neck_f, "slot": "skin", "subdiv": 1, "thickness": 0.0},
    ]
    for side, label in ((1, "L"), (-1, "R")):
        v, f = _eye(side)
        pieces.append({"name": f"Eye{label}", "verts": v, "faces": f, "slot": "eye", "subdiv": 0, "thickness": 0.0})
    return pieces
