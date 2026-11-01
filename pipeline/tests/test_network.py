import numpy as np

from otc_pipeline.network2010 import Graph, path_coords, path_time


def test_graph_splits_only_at_shared_vertices():
    # a cross where both lines share the centre vertex, and an overpass that does not
    a = np.array([[-75.70, 45.40], [-75.69, 45.40], [-75.68, 45.40]])
    b = np.array([[-75.69, 45.39], [-75.69, 45.40], [-75.69, 45.41]])
    over = np.array([[-75.685, 45.39], [-75.685, 45.41]])  # crosses `a` without a shared vertex
    g = Graph([a, b, over], ["primary", "primary", "motorway"])
    assert len(g.edges) == 5  # a and b split in two each, overpass stays whole
    start, _ = g.nearest_node(-75.70, 45.40)
    end, _ = g.nearest_node(-75.69, 45.41)
    edges = g.path(start, end)
    coords = path_coords(edges)
    assert tuple(coords[0]) == (-75.70, 45.40) and tuple(coords[-1]) == (-75.69, 45.41)
    assert path_time(edges, "bus") > 0


def test_links_connect_corridor_ends_only():
    street = np.array([[-75.70, 45.40], [-75.69, 45.40]])
    culdesac = np.array([[-75.6955, 45.4003], [-75.6955, 45.4010]])  # dangling street end near `street`
    busway = np.array([[-75.6896, 45.4002], [-75.68, 45.4002]])  # 30 m from the street's end, no shared vertex
    g = Graph([street, culdesac, busway], ["primary", "minor", "busway"])
    assert g.add_links(60) >= 1
    assert all(e.cls != "link" or "busway" for e in g.edges)
    a, _ = g.nearest_node(-75.70, 45.40)
    b, _ = g.nearest_node(-75.68, 45.4002)
    assert len(g.path(a, b)) >= 2


def test_departures_offsets_return_direction():
    from otc_pipeline.network2010 import departures
    d0 = departures([{"from": "07:00", "to": "08:00", "headwayMin": 15}], 0)
    d1 = departures([{"from": "07:00", "to": "08:00", "headwayMin": 15}], 1)
    assert d0 == [25200, 26100, 27000, 27900]
    assert d1[0] == 25200 + 450 and len(d1) == 4


def test_split_edges_near_and_intersection():
    from otc_pipeline.network2010 import Graph
    busway = np.array([[-75.70, 45.40], [-75.68, 45.40]])  # one long edge, no node in the middle
    street = np.array([[-75.69, 45.395], [-75.69, 45.4045]])
    cross = np.array([[-75.695, 45.4045], [-75.69, 45.4045], [-75.685, 45.4045]])  # shares the junction vertex
    g = Graph([busway, street, cross], ["busway", "secondary", "minor"], ["Transitway", "Main Street", "King Street"])
    nodes = g.split_edges_near(-75.69, 45.4002, "busway", 150)
    assert len(nodes) == 1
    lon, lat = g.node_lonlat[nodes[0]]
    assert abs(lon + 75.69) < 1e-4 and abs(lat - 45.40) < 1e-6
    g.rebuild()
    n = g.intersection("Main Street", "King Street")
    assert tuple(np.round(g.node_lonlat[n], 4)) == (-75.69, 45.4045)
