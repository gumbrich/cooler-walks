"""Independent area/plane checks of the source polygon conversion; no raw data needed."""
import importlib.util
from pathlib import Path
import unittest
import numpy as np
from shapely.geometry import Polygon

spec = importlib.util.spec_from_file_location('prepare', Path(__file__).with_name('prepare-detailed-shade.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Surfaces(unittest.TestCase):
    def test_pitched_concave_roof_with_hole_preserves_area_and_plane(self):
        exterior = [(0,0),(10,0),(10,10),(5,10),(5,5),(0,5)]
        hole = [(6,2),(8,2),(8,4),(6,4)]
        xyz = lambda ring: np.array([[2683000+x,1247000+y,410+.5*x] for x,y in ring])
        parts = module.triangulate(xyz(exterior), [xyz(hole)])
        # Analytic XY area 75 minus the 4 m² courtyard, true inclined area sqrt(1+.5²).
        area = sum(np.linalg.norm(np.cross(p[1]-p[0],p[2]-p[0]))/2 for p in parts)
        self.assertAlmostEqual(area, 71*np.sqrt(1.25), places=6)
        for triangle in parts:
            self.assertTrue(np.allclose(triangle[:,2],410+.5*(triangle[:,0]-2683000)))
            self.assertFalse(Polygon(triangle[:,:2]).contains(Polygon(xyz(hole)[:,:2]).centroid))

    def test_vertical_facade_and_collinear_initial_vertices(self):
        wall = np.array([[0,0,400],[0,5,400],[0,10,400],[0,10,420],[0,0,420]])
        parts = module.triangulate(wall)
        self.assertAlmostEqual(sum(np.linalg.norm(np.cross(p[1]-p[0],p[2]-p[0]))/2 for p in parts), 200)
        self.assertTrue(all(np.allclose(p[:,0],0) for p in parts))

    def test_nonplanar_or_invalid_source_is_not_silently_flattened(self):
        with self.assertRaises(ValueError):
            module.triangulate(np.array([[0,0,400],[10,0,400],[10,10,402],[0,10,400]]))
        with self.assertRaises(ValueError):
            module.triangulate(np.array([[0,0,400],[10,10,400],[0,10,400],[10,0,400]]))


if __name__ == '__main__': unittest.main()
