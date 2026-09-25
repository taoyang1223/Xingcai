"""腿的肌肤。中心线对齐直立骨骼的髋、膝、踝。大腿上段和腓肠加粗，膝和踝收细。"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from services.common.mesh import sweep

# x、z 为米，y 为身高比例，后两个数是半宽和半厚（米）。
JOINTS = [
    (0.09, 0.52, 0.00, 0.078, 0.080),
    (0.095, 0.42, 0.00, 0.072, 0.074),
    (0.10, 0.28, 0.00, 0.048, 0.050),
    (0.10, 0.18, 0.006, 0.058, 0.062),
    (0.10, 0.08, 0.00, 0.036, 0.038),
]


def _sample(side, height_m, steps=5):
    centers, radii = [], []
    spans = len(JOINTS) - 1
    for i in range(spans):
        k0 = 0 if i == 0 else 1
        for k in range(k0, steps + 1):
            u = k / steps
            a, b = JOINTS[i], JOINTS[i + 1]
            x = a[0] + (b[0] - a[0]) * u
            y = (a[1] + (b[1] - a[1]) * u) * height_m
            z = a[2] + (b[2] - a[2]) * u
            ra = a[3] + (b[3] - a[3]) * u
            rb = a[4] + (b[4] - a[4]) * u
            centers.append((side * x, y, z))
            radii.append((ra, rb))
    return centers, radii


def generate(height_m=1.75):
    pieces = []
    for side in (1, -1):
        verts, faces = sweep(*_sample(side, height_m), radial=16, power=2.15)
        pieces.append({
            "name": f"Leg{side}",
            "verts": verts,
            "faces": faces,
            "slot": "skin",
            "subdiv": 1,
            "thickness": 0.0,
        })
    return pieces
