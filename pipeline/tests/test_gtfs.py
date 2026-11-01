import io
import zipfile
from datetime import date

import numpy as np

from otc_pipeline import gtfs
from otc_pipeline.network2010 import Graph


def _feed(tmp_path):
    files = {
        "agency.txt": "agency_id,agency_name,agency_url,agency_timezone\n1,OC Transpo,http://x,America/Toronto\n",
        "stops.txt": "stop_id,stop_name,stop_lat,stop_lon\nA,Tunney's Pasture,45.4037,-75.7355\nB,Bayview,45.4092,-75.7215\nC,LeBreton,45.4128,-75.7137\n",
        "routes.txt": "route_id,route_short_name,route_long_name,route_type\n95,95,Barrhaven - Orleans,3\n",
        "calendar.txt": "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWK,1,1,1,1,1,0,0,20100901,20101231\nSA,0,0,0,0,0,1,0,20100901,20101231\n",
        "trips.txt": "route_id,service_id,trip_id,direction_id,shape_id,trip_headsign\n"
                     + "".join(f"95,WK,t{i},0,s1,LeBreton\n" for i in range(12)) + "95,SA,sat1,0,s1,LeBreton\n",
        "shapes.txt": "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\ns1,45.4037,-75.7355,1\ns1,45.4092,-75.7215,2\ns1,45.4128,-75.7137,3\n",
    }
    st = ["trip_id,arrival_time,departure_time,stop_id,stop_sequence"]
    for i in range(12):
        t0 = 7 * 3600 + i * 600
        hms = lambda s: f"{s // 3600:02d}:{s % 3600 // 60:02d}:{s % 60:02d}"  # noqa: E731
        st += [f"t{i},{hms(t0)},{hms(t0)},A,1", f"t{i},{hms(t0 + 120)},{hms(t0 + 150)},B,2", f"t{i},{hms(t0 + 270)},{hms(t0 + 270)},C,3"]
    st.append("sat1,08:00:00,08:00:00,A,1\nsat1,08:02:00,08:02:00,B,2\nsat1,08:04:00,08:04:00,C,3")
    files["stop_times.txt"] = "\n".join(st) + "\n"
    p = tmp_path / "feed.zip"
    with zipfile.ZipFile(p, "w") as z:
        for k, v in files.items():
            z.writestr(k, v)
    return p


def test_import_weekday_service(tmp_path):
    g = Graph([np.array([[-75.7355, 45.4037], [-75.7137, 45.4128]])], ["busway"])
    routes, patterns, stops = gtfs.import_gtfs(str(_feed(tmp_path)), g, target=date(2010, 12, 1))
    assert len(routes) == 1 and len(patterns) == 1 and len(stops) == 3
    r, p = routes[0], patterns[0]
    assert r["id"] == "oct-95" and r["provenance"]["verified"] is True
    assert len(r["departures"][p["id"]]) == 12  # Saturday trip excluded
    assert p["runTimes"] == [120.0, 120.0] and p["dwell"][1] == 30.0
    assert p["stopDist"][0] == 0 and p["stopDist"][1] < p["stopDist"][2]
    assert r["class"] == "peak"  # the synthetic feed only runs 07:00-09:00


def test_active_services_falls_back_to_nearest_weekday():
    cal = [{"service_id": "X", "monday": "1", "tuesday": "1", "wednesday": "1", "thursday": "1", "friday": "1",
            "saturday": "0", "sunday": "0", "start_date": "20101206", "end_date": "20101231"}]
    ids, day = gtfs.active_services(cal, [], date(2010, 12, 1))
    assert ids == {"X"} and day == date(2010, 12, 6)


def test_classify():
    allday = [h * 3600 + m * 60 for h in range(6, 23) for m in range(0, 60, 10)]
    assert gtfs.classify({"route_type": "3"}, allday, False, "octranspo") == "frequent"
    assert gtfs.classify({"route_type": "3"}, allday, True, "octranspo") == "transitway"
    assert gtfs.classify({"route_type": "3"}, [7 * 3600, 8 * 3600], False, "octranspo") == "peak"
    assert gtfs.classify({"route_type": "2"}, allday, False, "octranspo") == "otrain"
    assert gtfs.classify({"route_type": "3"}, allday, False, "sto") == "sto"
    hourly = [h * 3600 for h in range(6, 23)]
    assert gtfs.classify({"route_type": "3"}, hourly, False, "octranspo") == "local"


def test_nice_name():
    assert gtfs.nice_name("TUNNEY'S PASTURE 1A") == "Tunney's Pasture 1A"
    assert gtfs.nice_name("MCARTHUR / ST-LAURENT") == "McArthur / St-Laurent"
    assert gtfs.nice_name("O'CONNOR / ALBERT") == "O'Connor / Albert"
    assert gtfs.nice_name("Place d'Orléans") == "Place d'Orléans"  # mixed case is kept


def test_match_stations_takes_platforms_not_street_stops():
    stations = [{"id": "baseline", "name": "Baseline", "lon": -75.7605, "lat": 45.3485},
                {"id": "bank", "name": "Bank", "lon": -75.6990, "lat": 45.4190, "gtfs_match": ["Albert / Bank"]}]
    stops = {"p1": {"stop_name": "BASELINE 2A", "stop_lon": "-75.7601", "stop_lat": "45.3487"},
             "p2": {"stop_name": "Baseline station", "stop_lon": "-75.7609", "stop_lat": "45.3483"},
             "s1": {"stop_name": "BASELINE / WOODROFFE", "stop_lon": "-75.7590", "stop_lat": "45.3490"},
             "far": {"stop_name": "BASELINE 9A", "stop_lon": "-75.70", "stop_lat": "45.30"},
             "d1": {"stop_name": "ALBERT / BANK", "stop_lon": "-75.6992", "stop_lat": "45.4192"},
             "d2": {"stop_name": "BANK / QUEEN", "stop_lon": "-75.6985", "stop_lat": "45.4199"}}
    assert gtfs.match_stations(stops, stations) == {"p1": "baseline", "p2": "baseline", "d1": "bank"}


def test_forward_project_handles_out_and_back():
    shape = np.array([[0.0, 0.0], [1000.0, 0.0], [0.0, 1.0]])  # out along y=0, back along y=1
    pts = np.array([[100.0, 0.5], [900.0, 0.5], [100.0, 0.5]])  # the same spot, passed both ways
    d = gtfs.forward_project(shape, pts)
    assert abs(d[0] - 100) < 1 and abs(d[1] - 900) < 1 and abs(d[2] - 1900) < 1


def test_fill_times_interpolates_blank_stops_by_distance():
    xy = {"A": (0, 0), "B": (100, 0), "C": (400, 0)}
    filled = gtfs.fill_times([(1, "A", 0, 0), (2, "B", None, None), (3, "C", 400, 420)], xy)
    assert filled == [("A", 0, 0), ("B", 100, 100), ("C", 400, 420)]
    assert gtfs.fill_times([(1, "A", 0, 0), (2, "B", None, None)], xy) is None


def test_import_without_shapes_routes_on_the_graph_and_uses_stations(tmp_path):
    p = _feed(tmp_path)
    with zipfile.ZipFile(p) as z:
        files = {n: z.read(n).decode() for n in z.namelist() if n != "shapes.txt"}
    files["stops.txt"] = files["stops.txt"].replace("Tunney's Pasture", "TUNNEY'S PASTURE 1A")
    # blank the middle stop's times (a non-timepoint)
    lines = files["stop_times.txt"].splitlines()
    files["stop_times.txt"] = "\n".join(l if ",B,2" not in l else f"{l.split(',')[0]},,,B,2" for l in lines) + "\n"
    q = tmp_path / "noshapes.zip"
    with zipfile.ZipFile(q, "w") as z:
        for k, v in files.items():
            z.writestr(k, v)
    g = Graph([np.array([[-75.7355, 45.4037], [-75.7215, 45.4092], [-75.7137, 45.4128]])], ["busway"])
    stations = [{"id": "tunneys", "name": "Tunney's Pasture", "lon": -75.7356, "lat": 45.4038}]
    routes, patterns, stops = gtfs.import_gtfs(str(q), g, target=date(2010, 12, 1), stations=stations)
    pat = patterns[0]
    assert pat["stops"][0] == "tunneys" and "oct:A" not in {s["id"] for s in stops}
    assert len(pat["shape"]) >= 2 and pat["stopDist"][-1] > 1000
    assert sum(pat["runTimes"]) == 270  # blank middle stop interpolated, total kept
