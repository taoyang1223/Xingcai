"""短裤。裤腰和裤管的尺寸写在本目录，不读腿的曲线。"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from services.common.mesh import sweep

HIP = [(0.50, 0.112, 0.082), (0.535, 0.108, 0.078), (0.56, 0.100, 0.074)]
THIGH_X = 0.105


def generate(height_m=1.75):
    centers, radii = [], []
    for h, a, b in HIP:
        centers.append((0.0, h * height_m, 0.0))
        radii.append((a * height_m, b * height_m))
    v, f = sweep(centers, radii, radial=24, power=2.3)
    pieces = [{"name": "ShortHip", "verts": v, "faces": f, "slot": "cloth", "subdiv": 1, "thickness": 0.004}]
    for side in (1, -1):
        sc, sr = [], []
        for i in range(8):
            t = i / 7
            h = 0.52 - 0.18 * t
            x = side * THIGH_X * (0.72 + 0.28 * t)
            sc.append((x, h * height_m, 0.0))
            radius = 0.075 - 0.012 * t
            sr.append((radius, radius * 0.96))
        v, f = sweep(sc, sr, radial=16, power=2.1)
        pieces.append({"name": f"ShortLeg{side}", "verts": v, "faces": f, "slot": "cloth", "subdiv": 1, "thickness": 0.004})
    return pieces
