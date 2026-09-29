"""Blender 离线二维纸样驱动的 3D 外观辅助视图；没有布料仿真或实物贴合校验。

Blender --background --python tools/blender/preview_pattern_tshirt.py -- --output /tmp/synthetic_tee_preview.blend
只生成合成常量；不读取文件、人体测量值或照片。保存场景需显式指定输出路径。
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pattern_tshirt import make_pattern, validate


def _material(name, color):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1)
    return material


def _body_vertex(point, side):
    x, y = point
    return x / 1000, side * (0.115 + 0.025 * (1 - min(abs(x) / 255, 1))), 1.56 - y / 1000


def _sleeve_vertex(point, side):
    x, y = point
    u = max(-1.0, min(1.0, x / 200))
    return side * (0.19 + y / 1000), 0.14 * u, 1.51 - 0.21 * (y / 305) + 0.025 * (1 - u * u)


def build():
    pattern = make_pattern()
    validate(pattern)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    colors = {
        "front": _material("front / synthetic seamline panel", (0.12, 0.45, 0.72)),
        "back": _material("back / synthetic seamline panel", (0.13, 0.62, 0.60)),
        "sleeve": _material("sleeve / synthetic seamline panel", (0.85, 0.47, 0.18)),
    }
    for piece in pattern["pieces"]:
        instances = (1, -1) if piece["id"] == "sleeve" else (1,)
        for side in instances:
            name = piece["id"] + ("_right" if side == 1 else "_left") if piece["id"] == "sleeve" else piece["id"]
            mapping = (lambda p: _sleeve_vertex(p, side)) if piece["id"] == "sleeve" else (lambda p: _body_vertex(p, 1 if name == "front" else -1))
            points = piece["seamline_mm"]
            verts = [mapping(p) for p in points]
            mesh = bpy.data.meshes.new(name)
            mesh.from_pydata(verts, [], [tuple(range(len(verts)))])
            mesh.materials.append(colors[piece["id"]])
            mesh.update()
            obj = bpy.data.objects.new(name, mesh)
            bpy.context.collection.objects.link(obj)
            obj["pattern_schema"] = pattern["schema_version"]
            obj["pattern_piece"] = piece["id"]
            obj["note"] = "synthetic flat seamline projection, not sewn/fit/simulated"
            border = bpy.data.curves.new(name + " / seamline", "CURVE")
            border.dimensions = "3D"
            border.bevel_depth = 0.001
            border.bevel_resolution = 1
            spline = border.splines.new("POLY")
            spline.points.add(len(verts) - 1)
            for target, xyz in zip(spline.points, verts):
                target.co = (*xyz, 1)
            spline.use_cyclic_u = True
            bpy.context.collection.objects.link(bpy.data.objects.new(name + " / seamline", border))
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0
    return pattern


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="合成二维纸样的静态 3D 示意；不是布料仿真")
    parser.add_argument("--output", type=Path, help="可选 .blend 输出；不读取任何外部输入")
    args = parser.parse_args(argv)
    if args.output and args.output.suffix.lower() != ".blend":
        parser.error("--output 必须是 .blend")
    build()
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(args.output))
    print("合成纸样驱动 3D 静态示意完成；未进行布料仿真、试穿、打版师签核或打印裁剪验证")


if __name__ == "__main__":
    main()
