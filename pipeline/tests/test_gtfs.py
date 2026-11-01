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
