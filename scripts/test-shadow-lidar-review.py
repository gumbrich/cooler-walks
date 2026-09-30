"""Analytical checks for LiDAR review; no network or large source files."""
import importlib.util
from pathlib import Path
import unittest

import numpy as np

spec = importlib.util.spec_from_file_location('review', Path(__file__).with_name('review-shadow-lidar.py'))
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)


class LidarReviewChecks(unittest.TestCase):
    def test_known_sloping_plane_excludes_noise_and_withheld(self):
        points = np.array([[x, y, 420 + 2*x - y] for x, y in
                           [(-.5, 0), (.5, 0), (0, -.5), (0, .5), (.2, .2), (-.2, -.2)]]
                         + [[0, 0, 800], [0, 0, 900], [10, 10, 1000]])
        classes = np.array([6]*6 + [7, 6, 6])
        withheld = np.array([False]*7 + [True, False])
        result = review.neighborhood(points, classes, withheld, np.array([0., 0.]))
        self.assertEqual(result['buildingReturns'], 6)
        self.assertAlmostEqual(result['fittedHeightAtSample'], 420)
        self.assertLess(result['planeResidualRMSE'], 1e-9)
        self.assertEqual(result['classCounts']['7'], 1)

    def test_mixed_heights_remain_visible_in_report(self):
        points = np.array([[x, y, z] for x, y in [(-.5, 0), (.5, 0), (0, -.5), (0, .5)]
                           for z in [410, 430]])
        result = review.neighborhood(points, np.full(8, 6), np.zeros(8, dtype=bool), np.zeros(2))
        self.assertEqual(result['maximumBuildingHeight']-result['minimumBuildingHeight'], 20)
        self.assertAlmostEqual(result['planeResidualRMSE'], 10)

    def test_missing_or_collinear_returns_do_not_create_a_roof_fit(self):
        points = np.array([[0., 0., 420.], [.1, 0, 420], [.2, 0, 420], [.3, 0, 420], [.4, 0, 420]])
        result = review.neighborhood(points, np.full(5, 2), np.zeros(5, dtype=bool), np.zeros(2))
        self.assertEqual(result['buildingReturns'], 0)
        self.assertNotIn('fittedHeightAtSample', result)
        result = review.neighborhood(points, np.full(5, 6), np.zeros(5, dtype=bool), np.zeros(2))
        self.assertNotIn('fittedHeightAtSample', result)


if __name__ == '__main__':
    unittest.main()
