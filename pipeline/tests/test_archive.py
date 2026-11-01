import io
import zipfile
from datetime import date

from otc_pipeline import archive

HEAD = ["timestamp", "original", "mimetype", "statuscode", "digest", "length"]


def test_candidates_and_closest():
    cdx = [HEAD,
           ["20100301000000", "http://x/google_transit.zip", "application/zip", "200", "a", "1"],
           ["20101125120000", "http://x/google_transit.zip", "application/zip", "200", "b", "1"],
           ["20101130120000", "http://x/page.html", "text/html", "200", "c", "1"],
           ["20110601000000", "http://x/google_transit.zip", "application/zip", "404", "d", "1"]]
    c = archive.candidates(cdx)
    assert [d["timestamp"] for d in c] == ["20100301000000", "20101125120000"]
    assert archive.closest(c)["timestamp"] == "20101125120000"


def test_file_name_dates_beat_capture_dates():
    # GTFS Data Exchange copies: captured years later, but the name says which feed version it is
    cdx = [HEAD,
           ["20140101000000", "http://gtfs.s3.amazonaws.com/oc-transpo_20101116_0545.zip", "application/zip", "200", "a", "1"],
           ["20140101000000", "http://gtfs.s3.amazonaws.com/oc-transpo_20110620_0101.zip", "application/zip", "200", "b", "1"]]
    c = archive.candidates(cdx, dated=True)
    assert [d["date"] for d in c] == ["2010-11-16", "2011-06-20"]
    assert all(d["dated_by"] == "file name" for d in c)
    assert archive.closest(c)["original"].endswith("20101116_0545.zip")


def test_rank_keeps_one_entry_per_content():
    cdx = [HEAD,
           ["20101120000000", "http://x/a.zip", "application/zip", "200", "same", "1"],
           ["20101128000000", "http://x/a.zip", "application/zip", "200", "same", "1"],
           ["20100601000000", "http://x/a.zip", "application/zip", "200", "other", "1"]]
    r = archive.rank(archive.candidates(cdx))
    assert [(d["digest"], d["timestamp"][:8]) for d in r] == [("same", "20101128"), ("other", "20100601")]


def test_cdx_url():
    u = archive.cdx_url({"url": "octranspo1.com", "matchType": "domain", "filter": archive.ZIP, "years": (2009, 2012)})
    assert "from=2009" in u and "to=2012" in u and "output=json" in u and "collapse=digest" in u
    assert "from=" not in archive.cdx_url({"url": "gtfs.s3.amazonaws.com/oc-transpo", "matchType": "prefix"})


def _feed(calendar_rows, agency="OC Transpo", folder=""):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(folder + "agency.txt", f"agency_name,agency_url,agency_timezone\n{agency},http://x,America/Toronto\n")
        z.writestr(folder + "stops.txt", "stop_id,stop_name,stop_lat,stop_lon\n")
        z.writestr(folder + "routes.txt", "route_id,route_short_name,route_type\n95,95,3\n")
        z.writestr(folder + "trips.txt", "route_id,service_id,trip_id\n")
        z.writestr(folder + "stop_times.txt", "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n")
        z.writestr(folder + "calendar.txt", "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n"
                   + "".join(r + "\n" for r in calendar_rows))
    return buf.getvalue()


def test_inspect_feed_checks_the_snapshot_date():
    fall = archive.inspect_feed(_feed(["WK,1,1,1,1,1,0,0,20100905,20101218"]))
    assert fall["gtfs"] and fall["runs_on_snapshot"] and fall["days_from_snapshot"] == 0
    assert fall["agencies"] == ["OC Transpo"] and fall["routes"] == 1
    winter = archive.inspect_feed(_feed(["WK,1,1,1,1,1,0,0,20101219,20110402"]))
    assert not winter["runs_on_snapshot"] and winter["days_from_snapshot"] == 18
    assert archive.better(winter, fall) and not archive.better(fall, winter)
    assert not archive.inspect_feed(b"not a zip")["gtfs"]


def test_flatten_moves_files_to_the_root():
    data = archive.flatten(_feed(["WK,1,1,1,1,1,0,0,20100905,20101218"], folder="google_transit/"))
    assert "stops.txt" in zipfile.ZipFile(io.BytesIO(data)).namelist()
    assert archive.inspect_feed(data)["runs_on_snapshot"]


def test_snapshot_is_a_wednesday():
    assert archive.SNAPSHOT == date(2010, 12, 1) and archive.DAYS[archive.SNAPSHOT.weekday()] == "wednesday"
