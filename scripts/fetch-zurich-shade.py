"""Public, unauthenticated Canton Zurich export API; no email, account or message.
Documented API: https://www.zh.ch/content/dam/zhweb/bilder-dokumente/themen/planen-bauen/geoinformation/geodaten/geodatenshop/rest_schnittstelle_ogd_interface.pdf
Orders are bounded and reused. Large source exports remain in ignored data/raw.
"""
import json
from pathlib import Path
import time
import zipfile
import requests

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw/zurich-shadow'
API = 'https://geoservices.zh.ch/geoshopapi/v1'


def main():
    RAW.mkdir(exist_ok=True)
    for part, bounds in [('south', [2682000,1246000,2684000,1248000]), ('north', [2682000,1248000,2684000,1248500])]:
        archive = RAW / f'raster-{part}.zip'
        if archive.exists() and zipfile.is_zipfile(archive):
            print('Using existing', archive.name, flush=True); continue
        order_file = RAW / ('raster-order.json' if part == 'south' else 'raster-north-order.json')
        if order_file.exists():
            order = json.loads(order_file.read_text())
        else:
            w,s,e,n = bounds
            body = {'email': '', 'perimeter_type': 'DIRECT', 'pdir_coordsys': 'LV95',
                    'pdir_polygon': {'type':'Polygon', 'coordinates': [[[w,s],[e,s],[e,n],[w,n],[w,s]]]},
                    'products': [{'product_id': p, 'format_id': 21} for p in [555,558,559]]}
            response = requests.post(API + '/orders', json=body, timeout=60)
            response.raise_for_status(); order = response.json()
            order_file.write_text(json.dumps(order, indent=2)+'\n')
        order_id = order.get('order_id')
        if not order_id:
            raise ValueError('Order response has no ID')
        for _ in range(60):
            response = requests.get(f'{API}/orders/{order_id}', timeout=60)
            response.raise_for_status(); status = response.json()
            (RAW / f'raster-{part}-status.json').write_text(json.dumps(status, indent=2)+'\n')
            code = status.get('status_code')
            if code == 200: break
            if code not in [0, 10, 20, 30, 40, 50]:
                raise ValueError(f'Export is unavailable: {status.get("status")}; inspect the existing order before requesting another')
            time.sleep(10)
        else: raise TimeoutError('Export still processing; rerun to resume this order')
        print('Downloading', part, flush=True)
        temporary = archive.with_suffix('.zip.part')
        with requests.get(f'{API}/orders/{order_id}/download', stream=True, timeout=(30,120)) as response:
            response.raise_for_status()
            with temporary.open('wb') as f:
                size = 0
                for chunk in response.iter_content(1024*1024):
                    size += len(chunk)
                    if size > 2_000_000_000: raise ValueError('Export unexpectedly exceeds 2 GB')
                    f.write(chunk)
        if not zipfile.is_zipfile(temporary): raise ValueError('Export is not a complete ZIP')
        temporary.replace(archive)
        print('Saved', archive.name, archive.stat().st_size, flush=True)


if __name__ == '__main__': main()
