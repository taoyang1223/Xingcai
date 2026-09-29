"""纯合成纸样几何回归测试：python3 -B -m unittest discover -s tools/blender -p test_pattern_tshirt.py"""

import copy
import json
from pathlib import Path
import math
import re
import unittest
import xml.etree.ElementTree as ET

import pattern_tshirt as pattern


class SyntheticTeeTests(unittest.TestCase):
    def setUp(self):
        self.draft = pattern.make_pattern()

    def test_version_units_quantities_and_deterministic_serialization(self):
        self.assertEqual(self.draft["schema_version"], pattern.SCHEMA_VERSION)
        self.assertEqual(self.draft["unit"], "mm")
        self.assertEqual([(p["id"], p["cut_quantity"]) for p in self.draft["pieces"]],
                         [("front", 1), ("back", 1), ("sleeve", 2)])
        self.assertEqual(self.draft, pattern.make_pattern())
        self.assertTrue(pattern.validate(json.loads(json.dumps(self.draft))))

    def test_checked_in_artifacts_match_generator(self):
        folder = Path(__file__).resolve().parent
        expected = json.dumps(self.draft, ensure_ascii=False, indent=2) + "\n"
        self.assertEqual((folder / "synthetic_tee_v1.json").read_text(encoding="utf-8"), expected)
        self.assertEqual((folder / "synthetic_tee_v1.svg").read_text(encoding="utf-8"), pattern.svg(self.draft))

    def test_seam_and_cut_geometry_grain_and_allowances(self):
        for piece in self.draft["pieces"]:
            seam, cut = piece["seamline_mm"], piece["cutline_mm"]
            self.assertTrue(pattern.is_simple(seam))
            self.assertTrue(pattern.is_simple(cut))
            self.assertGreater(pattern.signed_area(cut), pattern.signed_area(seam))
            for start, end in zip(piece["grainline_mm"], piece["grainline_mm"][1:]):
                self.assertGreater(pattern.distance(start, end), 50)
            for i, edge in enumerate(piece["edges"]):
                a, b = seam[i], seam[(i + 1) % len(seam)]
                c = cut[i]
                self.assertAlmostEqual(abs(pattern.cross(a, b, c)) / pattern.distance(a, b),
                                       edge["allowance_mm"], places=5)

    def test_all_sewn_lengths_match_with_cut_quantities(self):
        lengths = {}
        for piece in self.draft["pieces"]:
            seam = piece["seamline_mm"]
            for i, edge in enumerate(piece["edges"]):
                if edge["join"]:
                    key = edge["join"], edge["side"]
                    lengths[key] = lengths.get(key, 0) + piece["cut_quantity"] * pattern.distance(seam[i], seam[(i + 1) % len(seam)])
        for join, (left, right) in pattern.JOIN_SIDES.items():
            self.assertIn((join, left), lengths)
            self.assertIn((join, right), lengths)
            self.assertAlmostEqual(lengths[(join, left)], lengths[(join, right)], places=5)

    def test_reject_broken_geometry_and_pairing(self):
        for change in (
            lambda p: p["pieces"][0]["seamline_mm"].__setitem__(0, p["pieces"][0]["seamline_mm"][1]),
            lambda p: p["pieces"][0]["cutline_mm"].__setitem__(0, (999, 999)),
            lambda p: p["pieces"][0]["grainline_mm"].__setitem__(0, (999, 999)),
            lambda p: p["pieces"][0]["edges"][13].__setitem__("allowance_mm", -1),
            lambda p: p["pieces"][2].__setitem__("cut_quantity", 1),
            lambda p: p["pieces"][0]["edges"][13].__setitem__("join", "wrong"),
            lambda p: p["pieces"][0]["grainline_mm"].__setitem__(1, (40, 610)),
            lambda p: p["pieces"][0]["edges"][13].__setitem__("side", "back"),
        ):
            with self.subTest(change=change):
                damaged = copy.deepcopy(self.draft)
                change(damaged)
                with self.assertRaises(ValueError):
                    pattern.validate(damaged)
        self.assertFalse(pattern.is_simple([(0, 0), (10, 10), (0, 10), (10, 0)]))

    def test_reject_pair_length_and_allowance_mismatches_after_recalculation(self):
        for mutation in ("length", "allowance"):
            damaged = copy.deepcopy(self.draft)
            front = damaged["pieces"][0]
            if mutation == "length":
                side_end = next(i for i, point in enumerate(front["seamline_mm"]) if point == (255, 680))
                front["seamline_mm"][side_end] = (260, 680)
            else:
                front["edges"][13]["allowance_mm"] = 11
            front["cutline_mm"] = pattern.cutline(front["seamline_mm"], front["edges"])
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                pattern.validate(damaged)

    def test_svg_is_explicit_mm_with_real_scale_marker(self):
        markup = pattern.svg(self.draft)
        root = ET.fromstring(markup)
        width, height = root.attrib["width"], root.attrib["height"]
        self.assertRegex(width, r"^\d+mm$")
        self.assertRegex(height, r"^\d+mm$")
        self.assertEqual(list(map(int, root.attrib["viewBox"].split())),
                         [0, 0, int(width[:-2]), int(height[:-2])])
        self.assertIn('M 30 1220 h 100 v 100 h -100 z', markup)
        self.assertIn("NOT FOR CUTTING", markup)
        self.assertEqual(len(root.findall(".//{*}polygon[@class='cutline']")), 3)
        self.assertEqual(len(root.findall(".//{*}polygon[@class='seamline']")), 3)
        self.assertEqual(len(root.findall(".//{*}line[@class='grainline']")), 3)
        self.assertGreater(int(height[:-2]), 1320)
        self.assertTrue(all(math.isfinite(float(number)) for number in re.findall(r'(?<=")\d+\.\d+(?=")', markup)))


if __name__ == "__main__":
    unittest.main()
