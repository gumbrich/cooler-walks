"""Small synthetic source fixtures; never used as production observations."""
import datetime as dt
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import duckdb

spec = importlib.util.spec_from_file_location('counts',Path(__file__).with_name('prepare-vehicle-counts.py'))
counts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(counts)

class Profiles(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        counts.RAW=Path(self.temp.name)
        (counts.RAW/'counts-fetch.json').write_text(json.dumps(dict(fetchedAt='fixture',urls=[])))
        (counts.RAW/'count-sites.geojson').write_text(json.dumps({'features':[{'properties':{'zsid':'Z001','status':'aktiv'},'geometry':{'coordinates':[8.54,47.37]}}]}))
        self.rows=[]

    def row(self, instant, value=100, status='Gemessen', id='Z001M001', direction='east'):
        self.rows.append([id,'Z001','Test site','Test street',direction,2683000,1247000,2,10,'1','2','Unbekannt','Unbekannt',instant,value,status])

    def write(self):
        con=duckdb.connect()
        con.execute('CREATE TABLE c (MSID VARCHAR,ZSID VARCHAR,ZSName VARCHAR,Achse VARCHAR,Richtung VARCHAR,EKoord DOUBLE,NKoord DOUBLE,AnzDetektoren INTEGER,Knummer INTEGER,D1ID VARCHAR,D2ID VARCHAR,D3ID VARCHAR,D4ID VARCHAR,MessungDatZeit VARCHAR,AnzFahrzeuge INTEGER,AnzFahrzeugeStatus VARCHAR)')
        con.executemany('INSERT INTO c VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',self.rows)
        con.sql('SELECT * FROM c').write_parquet(str(counts.RAW/'counts.parquet'))
        con.close()

    def prepare(self):
        self.write(); counts.prepare(2025)
        return json.loads((counts.RAW/'count-profiles.json').read_text())

    def mondays(self):
        return [dt.date(2025,1,6)+dt.timedelta(weeks=i) for i in range(52)]

    def test_only_measured_hours_no_detector_or_direction_multiplication(self):
        for i,day in enumerate(self.mondays()):
            self.row(f'{day}T12:00:00+01:00',100 if i<48 else 9999,'Gemessen' if i<48 else 'Imputiert')
            self.row(f'{day}T12:00:00+01:00',200,id='Z001M002',direction='west')
        result=self.prepare()
        self.assertEqual([c['profile'][12] for c in result['counters']],[[100,48],[200,52]])
        self.assertEqual(result['provenance']['sourceStatuses']['Imputiert'],4)

    def test_sparse_hours_are_null_not_zero(self):
        for i,day in enumerate(self.mondays()):
            self.row(f'{day}T12:00:00+01:00')
            self.row(f'{day}T13:00:00+01:00',100 if i<41 else None,'Gemessen' if i<41 else 'Fehlend')
        profile=self.prepare()['counters'][0]['profile']
        self.assertEqual(profile[13],[None,41])
        self.assertIsNone(profile[14])

    def test_repeated_autumn_hour_has_one_days_weight(self):
        for i in range(52):
            day=dt.date(2025,1,5)+dt.timedelta(weeks=i)
            if str(day)=='2025-03-30': continue
            if str(day)=='2025-10-26':
                self.row(f'{day}T02:00:00+02:00',100)
                self.row(f'{day}T02:00:00+01:00',300)
            else: self.row(f'{day}T02:00:00+01:00',200)
        self.assertEqual(self.prepare()['counters'][0]['profile'][6*24+2],[200,51])

    def test_changed_location_metadata_excluded(self):
        for i,day in enumerate(self.mondays()):
            self.row(f'{day}T12:00:00+01:00',direction='east' if i<20 else 'west')
        result=self.prepare()
        self.assertEqual(result['counters'],[])
        self.assertIn('changed',result['provenance']['excluded'][0]['reason'])

    def test_duplicate_instants_and_invalid_counts_rejected(self):
        self.row('2025-01-06T12:00:00+01:00'); self.row('2025-01-06T12:00:00+01:00')
        self.write()
        with self.assertRaisesRegex(ValueError,'Duplicate'): counts.prepare(2025)
        self.rows=[]; self.row('2025-01-06T12:00:00+01:00',-1)
        self.write()
        with self.assertRaisesRegex(ValueError,'Invalid'): counts.prepare(2025)

if __name__=='__main__': unittest.main()
