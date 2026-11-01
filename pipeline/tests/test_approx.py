from otc_pipeline import approx
from otc_pipeline.approx import Gazetteer, Place

STATIONS = [{"id": "hurdman", "name": "Hurdman", "lon": -75.664, "lat": 45.412},
            {"id": "mackenzie-king", "name": "Mackenzie King", "lon": -75.691, "lat": 45.424},
            {"id": "blair", "name": "Blair", "lon": -75.608, "lat": 45.431}]
MANUAL = {"downtown": "mackenzie-king", "ottawa": [-75.6935, 45.4255], "pont du portage": [-75.7165, 45.4215],
          "parc o bus freeman": [-75.747, 45.4615], "front": [-75.853, 45.393], "gatineau octranspo": [-75.72, 45.429],
          "gatineau": [-75.656, 45.485]}
DIVISIONS = [{"name": "Elmvale", "region": "CA-ON", "subtype": "neighborhood", "lon": -75.6306, "lat": 45.3969},
             {"name": "Le Plateau", "region": "CA-QC", "subtype": "neighborhood", "lon": -75.7797, "lat": 45.4405},
             {"name": "Le Plateau", "region": "CA-QC", "subtype": "neighborhood", "lon": -75.5046, "lat": 45.5572},
             {"name": "Chapel Hill North", "region": "CA-ON", "subtype": "neighborhood", "lon": -75.539, "lat": 45.451}]


def gaz():
    return Gazetteer(STATIONS, MANUAL, DIVISIONS, [])


def test_parse_termini_reads_places_regions_and_bridges():
    q, highway = approx.parse_termini(["Parc-o-bus Freeman (Secteur Hull)", "Ottawa via Pont du Portage & Autoroute 50"])
    assert q == [("Parc-o-bus Freeman", "hull", False), ("pont du portage", None, True), ("Ottawa", None, False)]
    assert highway
    q, _ = approx.parse_termini(["Hunt Club Loop", "Local", "Barrhaven C.", "Baseline*",
                                 "Serves the new neighborhood in Riverside South."])
    assert q == [("Barrhaven C.", None, False), ("Baseline", None, False)]


def test_gazetteer_order_of_sources():
    g = gaz()
    assert g.find("Downtown")[0].station == "mackenzie-king"  # hand-placed name -> station
    assert g.find("Hurdman")[0].station == "hurdman"  # station name
    assert g.find("Elmvale")[0].lon == -75.6306  # Overture neighbourhood
    assert g.find("Chapel Hill")[0].lat == 45.451  # "Chapel Hill" -> "Chapel Hill North"
    assert g.find("Le Plateau", "sto", "hull")[0].lon == -75.7797  # the Hull one, not the Buckingham one
    assert g.find("Gatineau", "octranspo")[0].lon == -75.72  # OC Transpo's "Gatineau" is downtown Hull
    assert g.find("Gatineau", "sto")[0].lon == -75.656
    assert g.find("Nowhere Special") == []


def test_order_and_orientation():
    a, b, c = Place("A", -75.80, 45.35), Place("B", -75.70, 45.42), Place("C", -75.60, 45.47)
    assert [p.name for p in approx.order_places([b, c, a, Place("A2", -75.8001, 45.3501)])] in (["A", "B", "C"], ["C", "B", "A"])
    # inbound ends nearest downtown
    assert approx.inbound([Place("Downtown", -75.699, 45.424), Place("Kanata", -75.90, 45.31)])[-1].name == "Downtown"


def test_service_by_fare_class():
    inb, outb = approx.service("octranspo", "express", "35")
    assert inb[0]["from"] < "09:00" and outb[0]["from"] > "15:00"  # inbound AM, outbound PM
    inb, outb = approx.service("octranspo", "regular", "7")
    assert inb == outb and min(p["headwayMin"] for p in inb) == 10
    assert approx.route_class("sto", "regular", "38") == "sto"
    assert approx.route_class("octranspo", "regular", "86") == "frequent"
    assert approx.route_class("octranspo", "regular", "150") == "local"


def test_approx_routes_build_definitions_and_skip_what_they_cannot_place():
    catalogue = [
        {"agency": "octranspo", "number": "106", "class": "regular", "termini": ["Elmvale", "Hurdman"], "source": "s"},
        {"agency": "octranspo", "number": "12", "class": "regular", "termini": ["Blair", "Downtown"], "source": "s"},
        {"agency": "sto", "number": "38", "class": "regular", "termini": ["Parc-o-bus Freeman (Secteur Hull)",
                                                                         "Ottawa via Pont du Portage"], "source": "s"},
        {"agency": "octranspo", "number": "601", "class": "school", "termini": ["Elmvale", "Hurdman"], "source": "s"},
        {"agency": "octranspo", "number": "503", "class": "rural", "termini": ["Perth", "Downtown"], "source": "s"},
    ]
    routes, skipped = approx.approx_routes(catalogue, gaz(), have={"oct-106"})
    by = {r["id"]: r for r in routes}
    assert set(by) == {"oct-12", "sto-38"}  # 106 already mapped, 601 is a school trip
    assert by["oct-12"]["patterns"][0]["path"] == ["blair", "mackenzie-king"]  # inbound: towards downtown
    sto = by["sto-38"]
    assert sto["longName"] == "Parc-o-bus Freeman – Ottawa"  # the bridge is routed through, not named
    assert len(sto["patterns"][0]["path"]) == 3 and sto["provenance"]["confidence"] == "low"
    assert [s["id"] for s in skipped] == ["oct-503"]
