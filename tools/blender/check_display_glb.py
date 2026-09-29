"""检查展示人台 GLB 是否满足页面合同。

页面把节点名（没有节点名时用网格名）里含 garment 的网格当成衣服，其余当成身体。
每块网格都要有 extras.targetNames：BS_Fat、BS_Belly、BS_Shoulder。
三角面合计不得超过清单里的 triangleCountMax（默认 25000）。

不读顶点，不量胸围腰围臀围。围度仍由 apps/fitme/src/mannequin/body.ts 计算。

用法：
  python3 tools/blender/check_display_glb.py apps/fitme/public/mannequin/mannequin_headless_v1.glb
"""

from __future__ import annotations

import argparse
import json
import struct
import sys
from pathlib import Path

REQUIRED_MORPHS = ("BS_Fat", "BS_Belly", "BS_Shoulder")
DEFAULT_MAX_TRIS = 25000
TRIANGLES = 4
TRIANGLE_STRIP = 5
TRIANGLE_FAN = 6


class CheckError(Exception):
    """合同没过。"""


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="按 FitMe 展示合同检查 GLB")
    p.add_argument("glb", type=Path, help="要检查的 .glb 或 .gltf")
    p.add_argument("--max-tris", type=int, default=DEFAULT_MAX_TRIS, help="三角面上限，对应 manifest.triangleCountMax")
    return p.parse_args(argv)


def gltf_json(path: Path) -> dict:
    data = path.read_bytes()
    if path.suffix.lower() == ".gltf" or not data.startswith(b"glTF"):
        return json.loads(data.decode("utf-8"))
    if len(data) < 20:
        raise CheckError("GLB 太短")
    magic, version, length = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67 or version != 2 or length != len(data):
        raise CheckError("不是 glTF 2.0 GLB")
    offset = 12
    document = None
    while offset + 8 <= len(data):
        chunk_len, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk = data[offset : offset + chunk_len]
        offset += chunk_len
        if chunk_type == 0x4E4F534A:
            document = json.loads(chunk.decode("utf-8").rstrip())
            break
    if document is None:
        raise CheckError("GLB 没有 JSON 块")
    return document


def runtime_name(node: dict, meshes: list[dict]) -> str:
    if node.get("name"):
        return str(node["name"])
    mesh = meshes[node["mesh"]]
    return str(mesh.get("name") or "")


def displayed_meshes(doc: dict) -> list[tuple[str, dict]]:
    meshes = doc.get("meshes") or []
    nodes = [node for node in (doc.get("nodes") or []) if "mesh" in node]
    if nodes:
        return [(runtime_name(node, meshes), meshes[node["mesh"]]) for node in nodes]
    return [(str(mesh.get("name") or ""), mesh) for mesh in meshes]


def is_garment(name: str) -> bool:
    return "garment" in name.lower()


def morph_names(mesh: dict) -> list[str]:
    extras = mesh.get("extras") or {}
    names = extras.get("targetNames")
    if not isinstance(names, list) or not all(isinstance(name, str) for name in names):
        return []
    primitives = mesh.get("primitives") or []
    if not primitives:
        return []
    targets = primitives[0].get("targets") or []
    if len(names) != len(targets):
        return []
    if any(len(prim.get("targets") or []) != len(names) for prim in primitives):
        return []
    return names


def accessor_count(doc: dict, index: int) -> int:
    accessors = doc.get("accessors") or []
    if index < 0 or index >= len(accessors):
        raise CheckError(f"缺少 accessor {index}")
    count = accessors[index].get("count")
    if not isinstance(count, int):
        raise CheckError(f"accessor {index} 没有 count")
    return count


def primitive_tris(doc: dict, prim: dict) -> int:
    mode = prim.get("mode", TRIANGLES)
    if "indices" in prim:
        count = accessor_count(doc, prim["indices"])
    else:
        position = (prim.get("attributes") or {}).get("POSITION")
        if position is None:
            raise CheckError("图元没有 POSITION")
        count = accessor_count(doc, position)
    if mode == TRIANGLES:
        if count % 3 != 0:
            raise CheckError(f"三角形顶点 {count} 不是 3 的倍数")
        return count // 3
    if mode in (TRIANGLE_STRIP, TRIANGLE_FAN):
        if count < 3:
            raise CheckError(f"三角带顶点 {count} 不够一面")
        return count - 2
    raise CheckError(f"不支持的图元 mode {mode}")


def triangle_count(doc: dict, mesh: dict) -> int:
    return sum(primitive_tris(doc, prim) for prim in mesh.get("primitives") or [])


def check_document(doc: dict, max_tris: int = DEFAULT_MAX_TRIS) -> dict:
    shown = displayed_meshes(doc)
    if not shown:
        raise CheckError("没有网格")
    bodies = [name for name, _mesh in shown if not is_garment(name)]
    garments = [name for name, _mesh in shown if is_garment(name)]
    if not bodies or not garments:
        raise CheckError("需要至少一块身体网格，以及一块名字含 garment 的衣服网格")

    total = 0
    for name, mesh in shown:
        names = morph_names(mesh)
        missing = [need for need in REQUIRED_MORPHS if need not in names]
        if missing:
            raise CheckError(f"{name or '未命名网格'} 缺少形态键: {', '.join(missing)}")
        total += triangle_count(doc, mesh)
    if total > max_tris:
        raise CheckError(f"三角面 {total} 超过 {max_tris}")
    return {
        "body": bodies,
        "garment": garments,
        "morphs": list(REQUIRED_MORPHS),
        "tris": total,
    }


def check_path(path: Path, max_tris: int = DEFAULT_MAX_TRIS) -> dict:
    if not path.is_file():
        raise CheckError(f"找不到文件: {path}")
    return check_document(gltf_json(path), max_tris)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        report = check_path(args.glb, args.max_tris)
    except CheckError as exc:
        print(f"check fail: {exc}", file=sys.stderr)
        return 1
    except (OSError, json.JSONDecodeError, struct.error, UnicodeError, KeyError, IndexError) as exc:
        print(f"check fail: 无法读取 GLB ({exc})", file=sys.stderr)
        return 1
    print(
        f"check ok body={','.join(report['body'])} garment={','.join(report['garment'])} "
        f"morphs={','.join(report['morphs'])} tris={report['tris']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
