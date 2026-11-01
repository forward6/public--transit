from otc_pipeline import wiki

OCT = """intro
==Black Routes (Regular Fare)==
{| class="wikitable"
|-
! colspan="2" | #
! Start
! End
! Notes
|-
|bgcolor="black"|
|'''[[OC Transpo Route 2|2]]'''
|Downtown
|[[Bayshore Station (OC Transpo)|Bayshore]]<br>[[Westboro Station (OC Transpo)|Westboro]]
|Some note.
|-
|bgcolor="black"|
|'''85'''
|[[Hurdman Station (OC Transpo)|Hurdman]]
|[[Bayshore Station (OC Transpo)|Bayshore]]
|Via Bronson and Carling.
|}
==Red routes (Peak Periods / Regular Fare)==
{|
|-
|bgcolor="red"|
|'''15'''
|Downtown
|Parkwood Hills
|x
|}
==References==
"""

TW = """==Rapid transit stations==
===Transitway===
====Southwest (95)====
*[[Fallowfield Station (OC Transpo)|Fallowfield]] - text
*[[Baseline Station (OC Transpo)|Baseline]] - text
====Central (all routes)====
*[[Lees Station (OC Transpo)|Lees]] - Located on Lees Avenue.
===Ottawa O-Train===
"""


def test_parse_oct_routes():
    routes = wiki.parse_oct_routes(OCT)
    assert [(r["number"], r["class"]) for r in routes] == [("2", "regular"), ("85", "regular"), ("15", "peak")]
    assert routes[0]["termini"] == ["Downtown", "Bayshore", "Westboro"]


def test_parse_transitway_stations():
    st = wiki.parse_transitway_stations(TW)
    assert st == {"Southwest (95)": ["Fallowfield", "Baseline"], "Central (all routes)": ["Lees"]}


def test_clean_and_revision_url():
    assert wiki.clean("[[A|B]]<br>'''C'''<ref>x</ref>") == "B / C"
    assert wiki.revision_url("en", 123) == "https://en.wikipedia.org/w/index.php?oldid=123"
