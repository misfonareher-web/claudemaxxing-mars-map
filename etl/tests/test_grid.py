import unittest
import numpy as np
from etl.grid import RADIUS_M, centers, definition, sample, terrain, wrap_lon


class GridTests(unittest.TestCase):
    def test_geometry(self):
        bbox = [77.2,18.25,77.75,18.7]
        shape, size = definition(bbox)
        self.assertEqual(shape, (58,71))
        lon, lat = centers(bbox)
        self.assertAlmostEqual(lon[0]-size[1]/2, bbox[0])
        self.assertAlmostEqual(lat[-1]-size[0]/2, bbox[1])
        self.assertLess(lat[-1],lat[0])
        self.assertTrue(max(definition([-180,-90,180,90])[0]) <= 512)

    def test_longitude(self):
        np.testing.assert_equal(wrap_lon([0,180,270,360]),[0,-180,-90,0])

    def test_plane(self):
        bbox = [0,-.1,.1,.1]
        lon, lat = centers(bbox)
        elevation = np.broadcast_to(RADIUS_M*np.deg2rad(lon)*np.tan(np.deg2rad(10)), (len(lat),len(lon)))
        slope, roughness = terrain(elevation,bbox)
        np.testing.assert_allclose(slope,10,atol=.0001)
        self.assertTrue(np.all(roughness > 0))

    def test_sampling(self):
        array = np.array([[0,2],[4,6]],dtype=float)
        self.assertEqual(sample(array,.5,.5),3)
        self.assertEqual(sample(array,1,1),6)
        with self.assertRaises(ValueError):
            sample(array,-1,0)

    def test_flat(self):
        bbox = [0,0,.1,.1]
        slope, roughness = terrain(np.ones(definition(bbox)[0]),bbox)
        self.assertFalse(np.any(slope))
        self.assertFalse(np.any(roughness))
