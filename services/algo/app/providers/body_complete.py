"""关掉衣服后补全身体。

Open3D fill_holes 和 MeshLab Close Holes 只能填同一张曲面上的孔。
页面上用的身体是 NAVER Anny（Apache-2.0，MakeHuman CC0 资产），不是这里的截面放样。
放样只留作没有 Anny 环境时的对照。不使用未授权的 SMPL，也不读取照片。

命令：
  python3 -m app.providers.body_complete \\
      --parts-dir ~/.config/fitme/preview/parts \\
      --garment 1,3 \\
      --out apps/fitme/public/mannequin/body_complete.glb
"""

from __future__ import annotations

import argparse
import json
import math
import struct
from dataclasses import dataclass, field
from pathlib import Path

Vec3 = tuple[float, float, float]


@dataclass
class Mesh:
    verts: list[Vec3] = field(default_factory=list)
    faces: list[tuple[int, int, int]] = field(default_factory=list)

    def add(self, other: Mesh) -> None:
        base = len(self.verts)
        self.verts.extend(other.verts)
        self.faces.extend((a + base, b + base, c + base) for a, b, c in other.faces)


def _load_positions(path: Path) -> list[Vec3]:
    data = path.read_bytes()
    if data[:4] != b"glTF":
        raise ValueError(f"不是 GLB: {path}")
    off = 12
    doc = blob = None
    while off + 8 <= len(data):
        ln, typ = struct.unpack_from("<II", data, off)
        off += 8
        chunk = data[off : off + ln]
        off += ln
        if typ == 0x4E4F534A:
            doc = json.loads(chunk.decode().rstrip())
        elif typ == 0x004E4942:
            blob = chunk
    if doc is None or blob is None:
        raise ValueError(f"GLB 缺少网格数据: {path}")
    out: list[Vec3] = []
    for mesh in doc.get("meshes") or []:
        for prim in mesh.get("primitives") or []:
            acc = doc["accessors"][prim["attributes"]["POSITION"]]
            view = doc["bufferViews"][acc["bufferView"]]
            start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
            stride = view.get("byteStride", 12)
            for i in range(acc["count"]):
                out.append(struct.unpack_from("<fff", blob, start + i * stride))
    if not out:
        raise ValueError(f"没有顶点: {path}")
    return out


def _bbox(pts: list[Vec3]) -> tuple[Vec3, Vec3]:
    xs, ys, zs = zip(*pts)
    return (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))


def _ring_at(pts: list[Vec3], y: float, tol: float) -> tuple[Vec3, float]:
    band: list[Vec3] = []
    width = tol
    while len(band) < 12 and width < 0.25:
        band = [p for p in pts if abs(p[1] - y) <= width]
        width *= 1.6
    if not band:
        band = pts
    cx = sum(p[0] for p in band) / len(band)
    cz = sum(p[2] for p in band) / len(band)
    rad = sum(math.hypot(p[0] - cx, p[2] - cz) for p in band) / len(band)
    return (cx, y, cz), max(rad, 0.012)


def _circle(center: Vec3, rx: float, rz: float, n: int = 16) -> list[Vec3]:
    cx, cy, cz = center
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        pts.append((cx + rx * math.cos(t), cy, cz + rz * math.sin(t)))
    return pts


def _stitch(mesh: Mesh, a0: int, b0: int, n: int) -> None:
    for i in range(n):
        j = (i + 1) % n
        mesh.faces.append((a0 + i, b0 + i, b0 + j))
        mesh.faces.append((a0 + i, b0 + j, a0 + j))


def loft(rings: list[list[Vec3]]) -> Mesh:
    """把一串同顶点数的截面连成管。"""
    mesh = Mesh()
    if len(rings) < 2:
        return mesh
    n = len(rings[0])
    for ring in rings:
        if len(ring) != n:
            raise ValueError("截面顶点数不一致")
        mesh.verts.extend(ring)
    for s in range(len(rings) - 1):
        _stitch(mesh, s * n, (s + 1) * n, n)
    return mesh


def _lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def complete_body(parts: list[list[Vec3]], garment: set[int]) -> Mesh:
    """用非衣服部件的断口放样躯干和双腿。衣服顶点不进入补全表面。"""
    if not parts:
        raise ValueError("没有部件")
    body_ids = [i for i in range(len(parts)) if i not in garment]
    if len(body_ids) < 3:
        raise ValueError("至少要有头、手臂和鞋才能补全")

    def center_y(i: int) -> float:
        ys = [p[1] for p in parts[i]]
        return (min(ys) + max(ys)) / 2

    head_i = max(body_ids, key=center_y)
    low = sorted(body_ids, key=center_y)
    shoe_ids = low[:2]
    arm_ids = [i for i in body_ids if i != head_i and i not in shoe_ids]

    head = parts[head_i]
    head_min, _head_max = _bbox(head)
    neck_c, neck_r = _ring_at(head, head_min[1] + 0.015, 0.02)

    shoes = []
    for i in shoe_ids:
        pts = parts[i]
        _mn, mx = _bbox(pts)
        c, r = _ring_at(pts, mx[1] - 0.008, 0.015)
        shoes.append((c, r))
    shoes.sort(key=lambda item: item[0][0])
    if len(shoes) == 1:
        c, r = shoes[0]
        shoes = [((c[0] - 0.08, c[1], c[2]), r), ((c[0] + 0.08, c[1], c[2]), r)]

    shoulders = []
    for i in arm_ids:
        pts = parts[i]
        nearest = sorted(pts, key=lambda p: abs(p[0]))[: max(12, len(pts) // 8)]
        y = sum(p[1] for p in nearest) / len(nearest)
        c, r = _ring_at(pts, y, 0.02)
        shoulders.append((c, r))

    floor = min(c[1] for c, _r in shoes) - 0.02
    neck_y = neck_c[1]
    height = max(neck_y - floor, 0.2)
    hip_y = floor + 0.50 * height
    span = abs(shoes[0][0][0] - shoes[-1][0][0])
    hip_rx = max(span * 0.42, neck_r * 2.2, 0.08)
    hip_rz = hip_rx * 0.72

    def torso_rx(y: float) -> float:
        t = (neck_y - y) / max(neck_y - hip_y, 1e-4)
        t = min(1.0, max(0.0, t))
        rx = _lerp(neck_r, hip_rx, t)
        for c, _r in shoulders:
            if abs(y - c[1]) < 0.07:
                rx = max(rx, abs(c[0]) * 0.9)
        return rx

    stacks = 8
    torso_rings = []
    for s in range(stacks + 1):
        y = _lerp(neck_y, hip_y, s / stacks)
        rx = torso_rx(y)
        torso_rings.append(_circle((0.0, y, neck_c[2] * (1 - s / stacks)), rx, max(rx * 0.72, hip_rz * (s / stacks))))
    mesh = loft(torso_rings)

    for c, r in shoes:
        sign = -1.0 if c[0] < 0 else 1.0
        hip = (sign * hip_rx * 0.55, hip_y, 0.0)
        leg_rings = []
        for s in range(stacks + 1):
            t = s / stacks
            y = _lerp(hip[1], c[1], t)
            x = _lerp(hip[0], c[0], t)
            z = _lerp(hip[2], c[2], t)
            rad = _lerp(hip_rx * 0.42, r, t)
            leg_rings.append(_circle((x, y, z), rad, rad * 0.9))
        mesh.add(loft(leg_rings))
    return mesh


def write_glb(mesh: Mesh, path: Path) -> None:
    verts = b"".join(struct.pack("<fff", *v) for v in mesh.verts)
    faces = b"".join(struct.pack("<III", *f) for f in mesh.faces)
    # 4-byte pad between views
    bin_blob = verts + faces
    while len(bin_blob) % 4:
        bin_blob += b"\x00"
    xs, ys, zs = zip(*mesh.verts) if mesh.verts else ((0,), (0,), (0,))
    gltf = {
        "asset": {"version": "2.0", "generator": "fitme-body-complete"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"name": "body_complete", "mesh": 0}],
        "meshes": [{
            "name": "body_complete",
            "primitives": [{
                "attributes": {"POSITION": 0},
                "indices": 1,
                "mode": 4,
            }],
        }],
        "accessors": [
            {
                "bufferView": 0,
                "componentType": 5126,
                "count": len(mesh.verts),
                "type": "VEC3",
                "min": [min(xs), min(ys), min(zs)],
                "max": [max(xs), max(ys), max(zs)],
            },
            {
                "bufferView": 1,
                "componentType": 5125,
                "count": len(mesh.faces) * 3,
                "type": "SCALAR",
            },
        ],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(verts), "target": 34962},
            {"buffer": 0, "byteOffset": len(verts), "byteLength": len(faces), "target": 34963},
        ],
        "buffers": [{"byteLength": len(bin_blob)}],
    }
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(bin_blob)
    out = bytearray()
    out += struct.pack("<III", 0x46546C67, 2, total)
    out += struct.pack("<II", len(js), 0x4E4F534A) + js
    out += struct.pack("<II", len(bin_blob), 0x004E4942) + bin_blob
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(out)


def complete_parts_dir(parts_dir: Path, garment: set[int], out: Path) -> dict:
    files = sorted(parts_dir.glob("part_*.glb"))
    if not files:
        raise ValueError(f"找不到 part_*.glb: {parts_dir}")
    parts = [_load_positions(p) for p in files]
    mesh = complete_body(parts, garment)
    if len(mesh.verts) < 16 or not mesh.faces:
        raise ValueError("补全结果是空的")
    write_glb(mesh, out)
    return {"vertices": len(mesh.verts), "triangles": len(mesh.faces), "out": str(out)}


def main() -> None:
    p = argparse.ArgumentParser(description="按断口补全关衣服后的躯干和腿")
    p.add_argument("--parts-dir", type=Path, required=True)
    p.add_argument("--garment", default="1,3", help="衣服部件序号，逗号分隔")
    p.add_argument("--out", type=Path, required=True)
    args = p.parse_args()
    garment = {int(x) for x in args.garment.split(",") if x.strip()}
    report = complete_parts_dir(args.parts_dir, garment, args.out)
    print(f"complete ok vertices={report['vertices']} triangles={report['triangles']}")


if __name__ == "__main__":
    main()
