"""Analytical checks of the independent reference, not the app implementation."""
import importlib.util
import math
from pathlib import Path
import unittest

import numpy as np
from shapely.geometry import Polygon, box
from shapely.strtree import STRtree

spec = importlib.util.spec_from_file_location('audit', Path(__file__).with_name('audit-shadow-sources.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def roofs(*entries):
    model = audit.SourceFaces.__new__(audit.SourceFaces)
    model.faces, bounds = [], []
    for i, (west, south, east, north, z) in enumerate(entries):
        polygon = box(west, south, east, north)
        model.faces.append((np.array([west, south, z]), np.array([0., 0., 1.]),
                            [0, 1], polygon, str(i), 'RoofSurface'))
        bounds.append(polygon)
    model.tree = STRtree(bounds)
    model.origins = np.array([f[0] for f in model.faces])
    model.normals = np.array([f[1] for f in model.faces])
    model.max_z = max(e[-1] for e in entries)
    return model


class ReferenceChecks(unittest.TestCase):
    def test_known_plane_hit_and_miss(self):
        model = roofs((90, 90, 110, 110, 410))
        row = {'point': [80, 100], 'ground': 400, 'altitude': math.atan(.5), 'azimuth': math.pi/2}
        self.assertEqual(model.exposure(row, [0, 0, 200, 200])[0], 'shade')
        self.assertEqual(model.exposure({**row, 'point': [60, 100]}, [0, 0, 200, 200])[0], 'sun')
        self.assertEqual(model.exposure({**row, 'point': [70, 100]}, [0, 0, 200, 200])[0], 'boundary')

    def test_missing_ground_and_unresolved_reach_stay_unknown(self):
        model = roofs((90, 90, 110, 110, 410))
        row = {'point': [5, 5], 'ground': 400, 'altitude': math.atan(.5), 'azimuth': -math.pi/2}
        self.assertEqual(model.exposure(row, [0, 0, 200, 200])[0], 'unknown')
        self.assertEqual(model.exposure({**row, 'ground': None}, [0, 0, 200, 200])[0], 'unknown')

    def test_courtyard_hole_remains_open(self):
        model = roofs((90, 90, 110, 110, 410))
        face = list(model.faces[0])
        face[3] = Polygon(box(90, 90, 110, 110).exterior.coords,
                          [box(98, 98, 102, 102).exterior.coords])
        model.faces[0] = tuple(face)
        row = {'point': [80, 100], 'ground': 400, 'altitude': math.atan(.5), 'azimuth': math.pi/2}
        self.assertEqual(model.exposure(row, [0, 0, 200, 200])[0], 'sun')

    def test_upper_roof_is_chosen_before_edge_filter(self):
        model = roofs((80, 80, 120, 120, 410), (99, 99, 101, 101, 430))
        self.assertIsNone(model.roof(99.5, 100), 'Do not compare the hidden lower roof with LiDAR')
        self.assertEqual(model.roof(100, 100)[0], 430)
        self.assertEqual(model.roof(85, 85)[0], 410)


if __name__ == '__main__':
    unittest.main()
