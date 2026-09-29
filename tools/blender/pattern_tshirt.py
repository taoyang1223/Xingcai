"""纯标准库、纯合成尺寸的宽松 T 恤纸样几何原型；不接收照片或人体数据。

坐标及 SVG viewBox 均为毫米。纸样只用于离线几何复测与 3D 外观辅助，
缺少专业打版师签核、面料参数、缩水/工艺验证，不可作为实际裁剪交付。
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from xml.sax.saxutils import escape

SCHEMA_VERSION = "synthetic-loose-tee-pattern/1"
EPS = 1e-7
JOIN_SIDES = {
    "shoulder": ("front", "back"),
    "side": ("front", "back"),
    "armscye_front": ("front", "sleeve"),
    "armscye_back": ("back", "sleeve"),
    "sleeve_underarm": ("left", "right"),
}


def distance(a, b):
    return math.hypot(b[0] - a[0], b[1] - a[1])


def signed_area(points):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(points, points[1:] + points[:1])) / 2


def cross(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def _between(a, b, p):
    return min(a[0], b[0]) - EPS <= p[0] <= max(a[0], b[0]) + EPS and min(a[1], b[1]) - EPS <= p[1] <= max(a[1], b[1]) + EPS


def _intersects(a, b, c, d):
    ab_c, ab_d = cross(a, b, c), cross(a, b, d)
    cd_a, cd_b = cross(c, d, a), cross(c, d, b)
    if (ab_c > EPS and ab_d < -EPS or ab_c < -EPS and ab_d > EPS) and (cd_a > EPS and cd_b < -EPS or cd_a < -EPS and cd_b > EPS):
        return True
    return any(abs(v) <= EPS and _between(p, q, r) for v, p, q, r in ((ab_c, a, b, c), (ab_d, a, b, d), (cd_a, c, d, a), (cd_b, c, d, b)))


def is_simple(points):
    n = len(points)
    if n < 3 or any(distance(points[i], points[(i + 1) % n]) <= EPS for i in range(n)):
        return False
    return all(
        not _intersects(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])
        for i in range(n)
        for j in range(i + 1, n)
        if j != i + 1 and not (i == 0 and j == n - 1)
    )


def inside(point, polygon):
    x, y = point
    hits = 0
    for a, b in zip(polygon, polygon[1:] + polygon[:1]):
        if abs(cross(a, b, point)) <= EPS and _between(a, b, point):
            return False  # 纱向端点必须严格在内部
        if (a[1] > y) != (b[1] > y) and x < a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]):
            hits += 1
    return hits % 2 == 1


def cutline(points, edges):
    """逐边缝份的外侧直线交点；尖角不作工业级圆角/缩水处理。"""
    if signed_area(points) <= EPS:
        raise ValueError("缝线轮廓必须顺时针（SVG 向下为正）")
    lines = []
    for i, edge in enumerate(edges):
        a, b = points[i], points[(i + 1) % len(points)]
        length = distance(a, b)
        if length <= EPS or edge["allowance_mm"] <= 0:
            raise ValueError("退化边或非正缝份")
        k = edge["allowance_mm"] / length
        lines.append(((a[0] + (b[1] - a[1]) * k, a[1] - (b[0] - a[0]) * k), (b[0] - a[0], b[1] - a[1])))
    outline = []
    for i in range(len(points)):
        p, u = lines[i - 1]
        q, v = lines[i]
        det = u[0] * v[1] - u[1] * v[0]
        if abs(det) < EPS:
            if u[0] * v[0] + u[1] * v[1] <= 0:
                raise ValueError("缝线折返")
            outline.append(q)
        else:
            t = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / det
            outline.append((p[0] + t * u[0], p[1] + t * u[1]))
    return outline


def _curve(a, b, c, d, steps=12):
    return [(
        (1 - t) ** 3 * a[0] + 3 * (1 - t) ** 2 * t * b[0] + 3 * (1 - t) * t * t * c[0] + t ** 3 * d[0],
        (1 - t) ** 3 * a[1] + 3 * (1 - t) ** 2 * t * b[1] + 3 * (1 - t) * t * t * c[1] + t ** 3 * d[1],
    ) for i in range(steps + 1) for t in [i / steps]]


def _neck(depth):
    return [(85 * math.sin(i * math.pi / 24), depth * math.cos(i * math.pi / 24)) for i in range(13)]


def _armhole():
    return _curve((205, 25), (212, 76), (249, 112), (255, 205))


def _piece(name, quantity, grainline, sections):
    points, edges = [], []
    for path, join, side, allowance in sections:
        if points and distance(points[-1], path[0]) > EPS:
            raise ValueError(f"{name}: 不连续的分段")
        if not points:
            points.append(path[0])
        for end in path[1:]:
            edges.append({"join": join, "side": side, "allowance_mm": allowance})
            points.append(end)
    if distance(points[-1], points[0]) > EPS:
        raise ValueError(f"{name}: 轮廓未闭合")
    points.pop()
    result = {"id": name, "cut_quantity": quantity, "seamline_mm": points, "edges": edges, "grainline_mm": grainline}
    result["cutline_mm"] = cutline(points, edges)
    return result


def _body(name, depth, arm):
    neck = _neck(depth)
    mirror = lambda path: [(-x, y) for x, y in reversed(path)]
    return _piece(name, 1, [(0, 125), (0, 610)], [
        (neck, None, None, 8),
        ([(85, 0), (205, 25)], "shoulder", name, 10),
        (arm, f"armscye_{name}", name, 10),
        ([(255, 205), (255, 680)], "side", name, 12),
        ([(255, 680), (-255, 680)], None, None, 25),
        ([(-255, 680), (-255, 205)], "side", name, 12),
        (mirror(arm), f"armscye_{name}", name, 10),
        ([(-205, 25), (-85, 0)], "shoulder", name, 10),
        (mirror(neck), None, None, 8),
    ])


def _sleeve(arm):
    origin, end = arm[0], arm[-1]
    dx, dy = end[0] - origin[0], end[1] - origin[1]
    length = math.hypot(dx, dy)
    target_x = 150
    target_y = math.sqrt(length * length - target_x * target_x)

    def rotated(p):
        x, y = p[0] - origin[0], p[1] - origin[1]
        return ((x * dx + y * dy) * target_x / length**2 + (-x * dy + y * dx) * target_y / length**2,
                (x * dx + y * dy) * target_y / length**2 - (-x * dy + y * dx) * target_x / length**2)

    front = [rotated(p) for p in arm]
    back = [(-x, y) for x, y in reversed(front)]
    return _piece("sleeve", 2, [(0, 135), (0, 265)], [
        (front, "armscye_front", "sleeve", 10),
        ([front[-1], (200, 305)], "sleeve_underarm", "right", 12),
        ([(200, 305), (-200, 305)], None, None, 25),
        ([(-200, 305), back[0]], "sleeve_underarm", "left", 12),
        (back, "armscye_back", "sleeve", 10),
    ])


def make_pattern():
    arm = _armhole()
    pattern = {
        "schema_version": SCHEMA_VERSION,
        "source": "synthetic constants only; no user measurements or photos",
        "unit": "mm",
        "limitations": "Geometry-only prototype; no fabric/shrinkage data, neckband, physical fitting or professional patternmaker approval. Not for cutting or production.",
        "pieces": [_body("front", 95, arm), _body("back", 35, arm), _sleeve(arm)],
    }
    validate(pattern)
    return pattern


def validate(pattern):
    if pattern.get("schema_version") != SCHEMA_VERSION or pattern.get("unit") != "mm":
        raise ValueError("未知纸样版本或单位")
    pieces = pattern["pieces"]
    if {p["id"] for p in pieces} != {"front", "back", "sleeve"} or len(pieces) != 3:
        raise ValueError("裁片集合不完整或重复")
    if {p["id"]: p["cut_quantity"] for p in pieces} != {"front": 1, "back": 1, "sleeve": 2}:
        raise ValueError("裁剪数量错误")
    joins = {join: {side: 0.0 for side in sides} for join, sides in JOIN_SIDES.items()}
    counts = {join: {side: 0 for side in sides} for join, sides in JOIN_SIDES.items()}
    allowances = {join: set() for join in JOIN_SIDES}
    for piece in pieces:
        name = piece["id"]
        points = piece["seamline_mm"]
        edges = piece["edges"]
        outer = piece["cutline_mm"]
        grain = piece["grainline_mm"]
        coords = points + outer + grain
        if not all(len(p) == 2 and all(isinstance(v, (float, int)) and math.isfinite(v) for v in p) for p in coords):
            raise ValueError(f"{name}: 坐标非法")
        if len(points) != len(edges) or len(points) != len(outer) or not is_simple(points) or signed_area(points) <= EPS:
            raise ValueError(f"{name}: 缝线轮廓非法")
        if not is_simple(outer) or signed_area(outer) <= signed_area(points):
            raise ValueError(f"{name}: 裁剪轮廓非法")
        if len(grain) != 2 or distance(*grain) < 50 or abs(grain[0][0] - grain[1][0]) > EPS or grain[1][1] <= grain[0][1] or not all(inside(p, points) for p in grain):
            raise ValueError(f"{name}: 纱向线非法")
        expected = cutline(points, edges)
        if any(distance(a, b) > 1e-5 for a, b in zip(outer, expected)):
            raise ValueError(f"{name}: 裁剪轮廓与缝份不一致")
        for i, edge in enumerate(edges):
            join, side, allowance = edge["join"], edge["side"], edge["allowance_mm"]
            if not isinstance(allowance, (int, float)) or not math.isfinite(allowance) or not 0 < allowance <= 40:
                raise ValueError(f"{name}: 缝份非法")
            if join is None:
                if side is not None:
                    raise ValueError(f"{name}: 未配对边有缝合侧")
                continue
            if join not in JOIN_SIDES or side not in JOIN_SIDES[join]:
                raise ValueError(f"{name}: 缝边配对不合法")
            if (join.startswith("armscye_") and name not in (join.removeprefix("armscye_"), "sleeve")) or (join in ("shoulder", "side") and name == "sleeve") or (join == "sleeve_underarm" and name != "sleeve"):
                raise ValueError(f"{name}: 缝边归属错误")
            if name in ("front", "back") and side != name:
                raise ValueError(f"{name}: 缝边侧别错误")
            joins[join][side] += distance(points[i], points[(i + 1) % len(points)]) * piece["cut_quantity"]
            counts[join][side] += 1
            allowances[join].add(allowance)
    for join, sides in joins.items():
        a, b = JOIN_SIDES[join]
        if not counts[join][a] or not counts[join][b] or abs(sides[a] - sides[b]) > 0.01 or len(allowances[join]) != 1:
            raise ValueError(f"{join}: 缝合两侧长度或缝份不匹配")
    return True


def _coords(points):
    return " ".join(f"{x:.5f},{y:.5f}" for x, y in points)


def svg(pattern):
    """单张实际毫米尺寸 SVG；打印必须禁用适配页面并实测标尺。"""
    validate(pattern)
    layout = []
    x = 20.0
    for piece in pattern["pieces"][:2]:
        bounds = piece["cutline_mm"]
        min_x, min_y = min(p[0] for p in bounds), min(p[1] for p in bounds)
        max_x = max(p[0] for p in bounds)
        layout.append((piece, x - min_x, 60 - min_y))
        x += max_x - min_x + 50
    sleeve = pattern["pieces"][2]
    bound = sleeve["cutline_mm"]
    layout.append((sleeve, 20 - min(p[0] for p in bound), 840 - min(p[1] for p in bound)))
    width = math.ceil(max(dx + max(p[0] for p in piece["cutline_mm"]) for piece, dx, dy in layout) + 20)
    height = math.ceil(max(1350, max(dy + max(p[1] for p in piece["cutline_mm"]) + 30 for piece, dx, dy in layout)))
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}mm" height="{height}mm" viewBox="0 0 {width} {height}">',
             '<title>synthetic loose tee geometry prototype — NOT FOR CUTTING</title>',
             '<rect width="100%" height="100%" fill="#ffffff"/>',
             '<style>',
             '.cutline { stroke: #e10600; stroke-width: 2.5; vector-effect: non-scaling-stroke; }',
             '.seamline { stroke: #111111; stroke-width: 2; stroke-dasharray: 6 4; vector-effect: non-scaling-stroke; }',
             '.grainline { stroke: #0b6bff; stroke-width: 2.5; vector-effect: non-scaling-stroke; }',
             'text { fill: #111111; font-family: sans-serif; }',
             '</style>',
             '<g fill="none" stroke-linejoin="round" stroke-linecap="round">']
    for piece, dx, dy in layout:
        name = escape(piece["id"])
        parts.extend([f'<g transform="translate({dx:.5f} {dy:.5f})" id="{name}">',
                      f'<polygon class="cutline" points="{_coords(piece["cutline_mm"])}"/>',
                      f'<polygon class="seamline" points="{_coords(piece["seamline_mm"])}"/>'])
        for i, edge in enumerate(piece["edges"]):
            if edge["join"] is not None:
                a, b = piece["seamline_mm"][i], piece["seamline_mm"][(i + 1) % len(piece["edges"])]
                parts.append(f'<line data-join="{edge["join"]}" data-side="{edge["side"]}" data-allowance-mm="{edge["allowance_mm"]}" x1="{a[0]:.5f}" y1="{a[1]:.5f}" x2="{b[0]:.5f}" y2="{b[1]:.5f}" stroke="none"/>')
        a, b = piece["grainline_mm"]
        parts.extend([f'<line class="grainline" x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}"/>',
                      f'<text x="0" y="370" font-size="22">{name} / cut {piece["cut_quantity"]} / grain blue</text>', '</g>'])
    parts.extend(['</g>', '<path class="cutline" fill="none" d="M 30 1220 h 100 v 100 h -100 z"/>',
                  '<text x="30" y="1196" font-size="18">100 x 100 mm check square</text>',
                  '<text x="150" y="1230" font-size="18">SYNTHETIC PROTOTYPE - NOT FOR CUTTING / PRINT 100% NO FIT TO PAGE</text>', '</svg>'])
    return "\n".join(parts) + "\n"


def main():
    parser = argparse.ArgumentParser(description="生成合成 T 恤纸样 JSON + 毫米 SVG（非实物交付）")
    parser.add_argument("--output-dir", type=Path, required=True, help="只写入输出目录，不读取任何输入文件")
    args = parser.parse_args()
    pattern = make_pattern()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "synthetic_tee_v1.json").write_text(json.dumps(pattern, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (args.output_dir / "synthetic_tee_v1.svg").write_text(svg(pattern), encoding="utf-8")
    print("合成几何校验通过；已输出毫米 JSON/SVG。未验证真实打印、面料、实物版型或工业格式。")


if __name__ == "__main__":
    main()
