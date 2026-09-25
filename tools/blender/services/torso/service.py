"""躯干大形。从髋扫到肩再收到脖子。胖瘦公式不给衣服用。"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from services.common.mesh import sweep

BETA = {"heightCm": 175.0, "fat": 0.36, "belly": 0.22, "shoulder": 0.48}
# 照片轮廓：肩从脖子斜着拉开，胸腰髋正面接近一根柱，后背保持一条直线。
# 元组是 (身高比, 半宽, 半厚, 前后偏移, 前半压扁)。
# 胸到髋的半宽落在正面蓝色衣身内侧，上下差不多宽。肩斜和侧面厚度不动。
TORSO = [
    (0.470, 0.102, 0.048, 0.000, 1.0),
    (0.520, 0.102, 0.048, 0.000, 1.0),
    (0.575, 0.102, 0.046, 0.000, 1.0),
    (0.620, 0.102, 0.046, 0.000, 1.0),
    (0.665, 0.102, 0.046, 0.001, 1.0),
    (0.710, 0.102, 0.050, 0.002, 0.98),
    (0.748, 0.102, 0.052, 0.002, 0.98),
    (0.778, 0.104, 0.048, 0.000, 1.0),
    (0.800, 0.108, 0.046, 0.000, 1.0),
    (0.822, 0.100, 0.044, 0.000, 1.0),
    (0.842, 0.068, 0.038, 0.000, 1.0),
    (0.862, 0.042, 0.034, 0.000, 1.0),
    (0.886, 0.034, 0.032, 0.000, 1.0),
    (0.910, 0.032, 0.032, 0.000, 1.0),
]


def _spline(hs, vs):
    n = len(hs)
    d = [(vs[i + 1] - vs[i]) / (hs[i + 1] - hs[i]) for i in range(n - 1)]
    m = [d[0]] + [0.0] * (n - 2) + [d[-1]]
    for i in range(1, n - 1):
        if d[i - 1] * d[i] <= 0:
            m[i] = 0.0
        else:
            w1 = 2 * (hs[i + 1] - hs[i]) + (hs[i] - hs[i - 1])
            w2 = (hs[i + 1] - hs[i]) + 2 * (hs[i] - hs[i - 1])
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])

    def ev(h):
        if h <= hs[0]:
            return vs[0]
        if h >= hs[-1]:
            return vs[-1]
        i = 0
        while i < n - 2 and h > hs[i + 1]:
            i += 1
        dh = hs[i + 1] - hs[i]
        t = (h - hs[i]) / dh
        t2, t3 = t * t, t * t * t
        return (
            (2 * t3 - 3 * t2 + 1) * vs[i]
            + (t3 - 2 * t2 + t) * dh * m[i]
            + (-2 * t3 + 3 * t2) * vs[i + 1]
            + (t3 - t2) * dh * m[i + 1]
        )

    return ev


_H = [r[0] for r in TORSO]
_A, _B, _C, _F = (_spline(_H, [r[c] for r in TORSO]) for c in (1, 2, 3, 4))


def _section(h):
    fat = 1 + (BETA["fat"] - 0.45) * 0.24
    return {"a": _A(h) * fat, "b": _B(h) * fat, "cz": _C(h), "front": _F(h)}


def generate(height_m=1.75):
    centers, radii, fronts = [], [], []
    for i in range(32):
        h = 0.47 + (0.91 - 0.47) * i / 31
        s = _section(h)
        centers.append((0.0, h * height_m, s["cz"] * height_m))
        radii.append((s["a"] * height_m, s["b"] * height_m))
        fronts.append(s["front"])
    verts, faces = sweep(centers, radii, radial=28, power=2.15, front=fronts)
    return [{"name": "TorsoSkin", "verts": verts, "faces": faces, "slot": "skin", "subdiv": 1, "thickness": 0.0}]
