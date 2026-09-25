"""按人台合同导出 GLB。合同见 docs/tech/13 第 3 节与 apps/fitme/src/mannequin/manifest.ts。

Blender 内部是 Z 朝上；glTF 导入后身高在 Z。导出时 export_yup=True，文件里仍是 Y 朝上。

用法（Blender 5.2）：
  Blender --background --python tools/blender/export_mannequin.py -- \\
      --input 人台.blend --output apps/fitme/public/mannequin/mannequin_headless_v1.glb
  Blender --background --python tools/blender/export_mannequin.py -- \\
      --input apps/fitme/public/mannequin/mannequin_headless_v1.glb --check
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy
from mathutils import Vector

REQUIRED = ("BS_Fat", "BS_Belly", "BS_Shoulder")
MAX_TRIS = 25000
MAX_BYTES = 8 * 1024 * 1024
# 无头人台颈根大约在 0.85 身高，占位网格约 1.45m；带脚底到头顶的正式网格约 1.70m。
HEIGHT_MIN_M = 1.20
HEIGHT_MAX_M = 1.90


def parse_args() -> argparse.Namespace:
    argv = sys.argv
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    p = argparse.ArgumentParser(description="按 FitMe 人台合同检查并导出 GLB")
    p.add_argument("--input", required=True, type=Path)
    p.add_argument("--output", type=Path)
    p.add_argument("--check", action="store_true", help="只检查，不写文件")
    args = p.parse_args(argv)
    if not args.check and args.output is None:
        p.error("导出需要 --output；只检查时加 --check")
    return args


def load_input(path: Path) -> None:
    ext = path.suffix.lower()
    if ext == ".blend":
        bpy.ops.wm.open_mainfile(filepath=str(path))
        return
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if ext in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=str(path))
        return
    if ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(path))
        return
    raise SystemExit(f"不支持的输入: {path}")


def mesh_objects() -> list[bpy.types.Object]:
    return [obj for obj in bpy.data.objects if obj.type == "MESH"]


def triangle_count(obj: bpy.types.Object) -> int:
    mesh = obj.data
    mesh.calc_loop_triangles()
    return len(mesh.loop_triangles)


def morph_names(obj: bpy.types.Object) -> list[str]:
    keys = obj.data.shape_keys
    if keys is None:
        return []
    return [block.name for block in keys.key_blocks if block.name != "Basis"]


def world_height_z(obj: bpy.types.Object) -> float:
    zs = [(obj.matrix_world @ Vector(corner)).z for corner in obj.bound_box]
    return max(zs) - min(zs)


def validate() -> None:
    meshes = mesh_objects()
    if not meshes:
        raise SystemExit("场景里没有网格")

    found = {name: [] for name in REQUIRED}
    extra: list[str] = []
    total = 0
    heights: list[float] = []
    for obj in meshes:
        total += triangle_count(obj)
        heights.append(world_height_z(obj))
        for name in morph_names(obj):
            if name in found:
                found[name].append(obj.name)
            else:
                extra.append(f"{obj.name}:{name}")

    missing = [name for name, owners in found.items() if not owners]
    height = max(heights) if heights else 0.0
    print(
        f"meshes={len(meshes)} tris={total} height_z={height:.3f}m "
        f"morphs={ {name: owners for name, owners in found.items()} }"
    )
    if extra:
        print("extra_shape_keys", ", ".join(extra))
    if missing:
        raise SystemExit("缺少形态名: " + ", ".join(missing) + "。需要 " + ", ".join(REQUIRED))
    if total > MAX_TRIS:
        raise SystemExit(f"三角面 {total} 超过 {MAX_TRIS}")
    if not HEIGHT_MIN_M <= height <= HEIGHT_MAX_M:
        raise SystemExit(
            f"身高 {height:.3f}m 不在 {HEIGHT_MIN_M}–{HEIGHT_MAX_M}m。"
            "合同单位是米，170cm 的整身网格约 1.70，无头颈根可以更矮。"
        )


def export_glb(path: Path) -> None:
    meshes = mesh_objects()
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_morph=True,
        export_morph_normal=True,
        export_draco_mesh_compression_enable=False,
        export_meshopt_compression_enable=False,
        export_animations=False,
        export_skins=False,
        export_cameras=False,
        export_lights=False,
        export_materials="EXPORT",
    )
    size = path.stat().st_size
    print(f"wrote {path} ({size} bytes)")
    if size > MAX_BYTES:
        raise SystemExit(f"文件 {size} 字节，超过 {MAX_BYTES}")


def main() -> None:
    args = parse_args()
    if not args.input.is_file():
        raise SystemExit(f"找不到输入: {args.input}")
    load_input(args.input)
    validate()
    if args.check:
        print("check ok")
        return
    export_glb(args.output)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.output))
    validate()
    print("roundtrip ok")


if __name__ == "__main__":
    main()
