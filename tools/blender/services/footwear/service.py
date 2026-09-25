"""袜子、鞋和鞋底。踝点坐标写在本目录，不读腿的终点。"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from services.common.mesh import sweep

ANKLE_X = 0.105
ANKLE_Y = 0.105


def generate(height_m=1.75):
    pieces = []
    for side in (1, -1):
        x = side * ANKLE_X
        sock_c, sock_r = [], []
        for i in range(6):
            t = i / 5
            sock_c.append((x, ANKLE_Y + 0.02 + 0.08 * (1 - t), 0.0))
            sock_r.append((0.048 - 0.004 * t, 0.044 - 0.004 * t))
        v, f = sweep(sock_c, sock_r, radial=14, power=2.1)
        pieces.append({"name": f"Sock{side}", "verts": v, "faces": f, "slot": "sock", "subdiv": 1, "thickness": 0.003})
        y, z = ANKLE_Y, 0.0
        shoe_c = [(x, y - 0.01, z - 0.03), (x, y, z + 0.04), (x, y - 0.005, z + 0.10), (x, y - 0.02, z + 0.16)]
        shoe_r = [(0.042, 0.036), (0.046, 0.040), (0.044, 0.034), (0.036, 0.024)]
        v, f = sweep(shoe_c, shoe_r, radial=16, power=2.0, cap_start=True, cap_end=True)
        pieces.append({"name": f"Shoe{side}", "verts": v, "faces": f, "slot": "shoe", "subdiv": 1, "thickness": 0.0})
        sole_c = [(x, y - 0.045, z - 0.02), (x, y - 0.045, z + 0.06), (x, y - 0.045, z + 0.15)]
        sole_r = [(0.048, 0.012), (0.052, 0.012), (0.040, 0.010)]
        v, f = sweep(sole_c, sole_r, radial=12, power=2.0, cap_start=True, cap_end=True)
        pieces.append({"name": f"Sole{side}", "verts": v, "faces": f, "slot": "sole", "subdiv": 0, "thickness": 0.0})
    return pieces
