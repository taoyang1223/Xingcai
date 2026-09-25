"""T 恤和袖管。宽度表写在本目录，不调用躯干或手臂。"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from services.common.mesh import sweep

# 身高比例上的衣身半宽、半厚。领口最后一圈是米，在 generate 里另加。
BODY = [
    (0.46, 0.122, 0.084, 0.0),
    (0.54, 0.142, 0.096, -0.004),
    (0.62, 0.116, 0.074, 0.0),
    (0.70, 0.124, 0.082, 0.004),
    (0.76, 0.130, 0.074, 0.0),
    (0.79, 0.124, 0.066, -0.002),
]
SLEEVE_EDGE = 0.22


def generate(height_m=1.75):
    centers, radii = [], []
    for h, a, b, cz in BODY:
        centers.append((0.0, h * height_m, cz * height_m))
        radii.append((a * height_m, b * height_m))
    centers.append((0.0, 0.825 * height_m, 0.01))
    radii.append((0.055, 0.048))
    v, f = sweep(centers, radii, radial=28, power=2.35)
    pieces = [{"name": "Shirt", "verts": v, "faces": f, "slot": "cloth", "subdiv": 1, "thickness": 0.004}]
    y0 = 0.75 * height_m
    for side in (1, -1):
        sc, sr = [], []
        for i in range(7):
            t = i / 6
            sc.append((side * SLEEVE_EDGE * (0.78 + 0.34 * t), y0 - 0.22 * t, 0.02))
            radius = 0.070 - 0.016 * t
            sr.append((radius, radius * 0.92))
        v, f = sweep(sc, sr, radial=16, power=2.1)
        pieces.append({"name": f"Sleeve{side}", "verts": v, "faces": f, "slot": "cloth", "subdiv": 1, "thickness": 0.004})
    return pieces
