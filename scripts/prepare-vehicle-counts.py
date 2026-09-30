"""Aggregate measured directional counters, not invented street-wide traffic.

Optional preparation dependency: requirements-counts.txt. Raw files stay ignored.
Use --fetch to refresh both public sources; inspect provenance before release.
"""
import argparse
import calendar
import datetime as dt
import hashlib
import json
from pathlib import Path
import urllib.request
import duckdb

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw/traffic'
COUNTS_URL = 'https://data.stadt-zuerich.ch/dataset/sid_dav_verkehrszaehlung_miv_od2031/download/sid_dav_verkehrszaehlung_miv_od2031_alle_jahre.parquet'
SITES_URL = 'https://www.ogd.stadt-zuerich.ch/wfs/geoportal/Standorte_der_Verkehrszaehlungen_MIV?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&TYPENAME=tbl_standort_zaehlung_miv_p&outputFormat=application/json&SRSNAME=EPSG:4326'

def prepare(year):
    con = duckdb.connect()
    con.read_parquet(str(RAW / 'counts.parquet')).create_view('raw')
    con.execute("CREATE TABLE observations AS SELECT *, substr(MessungDatZeit,1,10)::DATE AS day, substr(MessungDatZeit,12,2)::INTEGER AS hour FROM raw WHERE starts_with(MessungDatZeit, ?)", [f'{year}-'])
    statuses = dict(con.sql('SELECT AnzFahrzeugeStatus, count(*) FROM observations GROUP BY 1').fetchall())
    if set(statuses) - {'Gemessen', 'Imputiert', 'Fehlend'}:
        raise ValueError('Unrecognized count status')
    if con.sql('SELECT count(*) FROM (SELECT MSID, MessungDatZeit FROM observations GROUP BY 1,2 HAVING count(*) > 1)').fetchone()[0]:
        raise ValueError('Duplicate measurement instants; inspect before aggregating')
    if con.sql("SELECT count(*) FROM observations WHERE AnzFahrzeugeStatus='Gemessen' AND (AnzFahrzeuge IS NULL OR AnzFahrzeuge < 0)").fetchone()[0]:
        raise ValueError('Invalid measured vehicle count')
    sites = {f['properties']['zsid']: f for f in json.loads((RAW/'count-sites.geojson').read_text())['features'] if f['properties']['status'] == 'aktiv'}
    # One value per calendar day/hour. The repeated autumn hour is averaged,
    # so one Sunday cannot receive double weight. Spring's missing hour stays absent.
    con.sql("CREATE TABLE daily AS SELECT MSID, day, hour, avg(AnzFahrzeuge) AS vehicles FROM observations WHERE AnzFahrzeugeStatus='Gemessen' GROUP BY 1,2,3")
    profiles = con.sql('SELECT MSID, isodow(day)-1 AS weekday, hour, avg(vehicles), count(*) FROM daily GROUP BY 1,2,3').fetchall()
    expected = [0]*7
    for d in range(366 if calendar.isleap(year) else 365):
        expected[(dt.date(year,1,1)+dt.timedelta(days=d)).weekday()] += 1
    by_id = {}
    for id, weekday, hour, mean, days in profiles:
        by_id.setdefault(id, [None]*168)[weekday*24+hour] = [round(mean,2) if days/expected[weekday] >= .8 else None, days]
    metadata = con.sql('SELECT DISTINCT MSID, ZSID, ZSName, Achse, Richtung, EKoord, NKoord, AnzDetektoren, Knummer, D1ID, D2ID, D3ID, D4ID FROM observations ORDER BY MSID').fetchall()
    variants = {}
    for row in metadata:
        variants.setdefault(row[0], []).append(row)
    included, excluded = [], []
    for id, rows in variants.items():
        if len(rows) != 1:
            excluded.append({'id':id, 'reason':'Measurement metadata changed during reference year'})
            continue
        _, sid, name, street, direction, east, north, detectors, signal, *detector_ids = rows[0]
        if sid not in sites or east is None or north is None or 'tunnel' in street.lower():
            excluded.append({'id':id,'reason':'Inactive, missing coordinates or tunnel counter'})
            continue
        profile = by_id.get(id, [None]*168)
        if not any(p and p[0] is not None for p in profile):
            excluded.append({'id':id,'reason':'No weekday/hour has 80% measured-day coverage'})
            continue
        included.append(dict(id=id, siteId=sid, name=name, street=street, direction=direction,
            metricPoint=[east,north], currentSitePoint=sites[sid]['geometry']['coordinates'],
            detectors=detectors, signal=signal, detectorIds=detector_ids, profile=profile))
    fetch = json.loads((RAW/'counts-fetch.json').read_text())
    provenance = dict(model='zurich-measured-hour-profiles-v1', year=year, observationStart=f'{year}-01-01', observationEnd=f'{year}-12-31',
        fetchedAt=fetch['fetchedAt'], urls=fetch['urls'], sourceCrs='EPSG:2056', timeZone='Europe/Zurich',
        sourceStatuses=statuses, expectedDays=expected, minimumMeasuredDayShare=.8,
        sha256={f:hashlib.sha256((RAW/f).read_bytes()).hexdigest() for f in ['counts.parquet','count-sites.geojson']},
        excluded=excluded, note='Directional measurement totals are already aggregated over detectors. No sum across counters; no imputed or missing values. Annual same-weekday/hour means, not live counts or forecasts. Public source may revise past observations.')
    (RAW/'count-profiles.json').write_text(json.dumps(dict(provenance=provenance,counters=included),ensure_ascii=False))
    print(json.dumps({'counters':len(included),'excluded':len(excluded),'statuses':statuses}))

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--fetch',action='store_true')
    parser.add_argument('--year',type=int,default=2025)
    args=parser.parse_args()
    if args.year >= dt.date.today().year:
        raise ValueError('Choose a completed reference year')
    RAW.mkdir(parents=True,exist_ok=True)
    if args.fetch:
        for name,url in [('counts.parquet',COUNTS_URL),('count-sites.geojson',SITES_URL)]:
            target=RAW/name
            urllib.request.urlretrieve(url,target.with_suffix(target.suffix+'.tmp'))
            target.with_suffix(target.suffix+'.tmp').replace(target)
        (RAW/'counts-fetch.json').write_text(json.dumps(dict(fetchedAt=dt.datetime.now(dt.timezone.utc).isoformat(),urls=[COUNTS_URL,SITES_URL])))
    prepare(args.year)
