"""手臂肌肤。中心线对齐直立骨骼的肩、肘、腕、掌。肌肉是半径上的鼓起，不读骨架服务。"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from services.common.mesh import sweep

# x、z 为米，y 为身高比例，半径为米。肩头略鼓，上臂中段是肱二头肌，腕收细。
JOINTS = [
    (0.18, 0.76, 0.02, 0.056, 0.050),
    (0.19, 0.67, 0.025, 0.064, 0.056),
    (0.20, 0.58, 0.03, 0.040, 0.038),
    (0.20, 0.50, 0.035, 0.036, 0.034),
    (0.20, 0.43, 0.04, 0.028, 0.026),
    (0.20, 0.36, 0.05, 0.032, 0.016),
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
        verts, faces = sweep(*_sample(side, height_m), radial=16, power=2.15, cap_end=True)
        pieces.append({
            "name": f"Arm{side}",
            "verts": verts,
            "faces": faces,
            "slot": "skin",
            "subdiv": 1,
            "thickness": 0.0,
        })
    return pieces
