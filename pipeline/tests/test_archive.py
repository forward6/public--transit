from otc_pipeline import archive


def test_candidates_and_closest():
    cdx = [["urlkey", "timestamp", "original", "mimetype", "statuscode", "digest", "length"],
           ["k", "20100301000000", "http://x/google_transit.zip", "application/zip", "200", "d", "1"],
           ["k", "20101125120000", "http://x/google_transit.zip", "application/zip", "200", "d", "1"],
           ["k", "20101130120000", "http://x/page.html", "text/html", "200", "d", "1"],
           ["k", "20110601000000", "http://x/google_transit.zip", "application/zip", "404", "d", "1"]]
    c = archive.candidates(cdx)
    assert [d["timestamp"] for d in c] == ["20100301000000", "20101125120000"]
    assert archive.closest(c)["timestamp"] == "20101125120000"


def test_cdx_url_has_period_and_json():
    u = archive.cdx_url({"url": "octranspo.com", "matchType": "domain"})
    assert "from=2009" in u and "to=2012" in u and "output=json" in u
