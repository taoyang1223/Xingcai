"""展示 GLB 检查：分件、三个形态键、面数上限。"""

from __future__ import annotations

import json
import struct
import unittest
from pathlib import Path

from check_display_glb import CheckError, check_document, check_path

ROOT = Path(__file__).resolve().parents[2]
PLACEHOLDER = ROOT / "apps/fitme/public/mannequin/mannequin_headless_v1.glb"


def mesh(name: str, morphs: list[str], tris: int = 2) -> dict:
    return {
        "name": name,
        "extras": {"targetNames": morphs},
        "primitives": [
            {
                "attributes": {"POSITION": 0},
                "indices": 1,
                "mode": 4,
                "targets": [{"POSITION": 2} for _ in morphs],
            }
        ],
        "_tris": tris,
    }


def document(parts: list[dict], index_count: int | None = None) -> dict:
    meshes = []
    nodes = []
    for part in parts:
        item = {key: value for key, value in part.items() if key != "_tris"}
        meshes.append(item)
        nodes.append({"name": part["name"], "mesh": len(meshes) - 1})
    count = index_count if index_count is not None else 6
    return {
        "meshes": meshes,
        "nodes": nodes,
        "accessors": [{"count": 4}, {"count": count}],
    }


MORPHS = ["BS_Fat", "BS_Belly", "BS_Shoulder"]


class CheckDisplayGlbTest(unittest.TestCase):
    def test_split_morphs_and_budget(self) -> None:
        report = check_document(
            document([mesh("Body", MORPHS), mesh("TeeGarment", MORPHS)]),
        )
        self.assertEqual(report["body"], ["Body"])
        self.assertEqual(report["garment"], ["TeeGarment"])
        self.assertEqual(report["tris"], 4)

    def test_node_name_overrides_mesh_name(self) -> None:
        doc = document([mesh("Body", MORPHS)])
        doc["meshes"].append(mesh("Shirt", MORPHS))
        doc["nodes"].append({"name": "OuterGarment", "mesh": 1})
        report = check_document(doc)
        self.assertEqual(report["garment"], ["OuterGarment"])

    def test_missing_garment(self) -> None:
        with self.assertRaises(CheckError):
            check_document(document([mesh("Body", MORPHS), mesh("Shirt", MORPHS)]))

    def test_missing_morph_on_one_part(self) -> None:
        with self.assertRaises(CheckError):
            check_document(document([mesh("Body", MORPHS), mesh("TeeGarment", ["BS_Fat"])]))

    def test_triangle_cap(self) -> None:
        doc = document([mesh("Body", MORPHS), mesh("TeeGarment", MORPHS)], index_count=9)
        with self.assertRaises(CheckError):
            check_document(doc, max_tris=5)

    def test_roundtrip_glb_bytes(self) -> None:
        payload = json.dumps(
            document([mesh("Body", MORPHS), mesh("TeeGarment", MORPHS)]),
            separators=(",", ":"),
        ).encode()
        payload += b" " * ((4 - len(payload) % 4) % 4)
        chunk = struct.pack("<II", len(payload), 0x4E4F534A) + payload
        blob = struct.pack("<III", 0x46546C67, 2, 12 + len(chunk)) + chunk
        path = Path(__file__).with_name("_fixture_display.glb")
        path.write_bytes(blob)
        try:
            report = check_path(path)
        finally:
            path.unlink()
        self.assertEqual(report["tris"], 4)

    def test_placeholder_is_not_the_display_contract(self) -> None:
        if not PLACEHOLDER.is_file():
            self.skipTest("占位 GLB 不在工作区")
        with self.assertRaises(CheckError):
            check_path(PLACEHOLDER)


if __name__ == "__main__":
    unittest.main()
