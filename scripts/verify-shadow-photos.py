"""Verify original photographic evidence, never infer a missing capture time.

--fetch downloads only the reviewed public originals from the checked register.
Image authors retain copyright; source images remain ignored, not in Git.
"""
import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import time

from PIL import Image, ExifTags
import requests

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw/shadow-validation/observations'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fetch', action='store_true')
    args = parser.parse_args()
    records = json.loads((ROOT / 'docs/validation/photo-register.json').read_text())['photos']
    RAW.mkdir(parents=True, exist_ok=True)
    for row in records:
        path = RAW / (row['id']+'.jpg')
        if not path.exists() and args.fetch:
            assert row['original'].startswith('https://upload.wikimedia.org/')
            with requests.get(row['original'], stream=True, timeout=(30, 90),
                              headers={'User-Agent': 'CoolerWalksValidation/0.10'}) as response:
                response.raise_for_status()  # Stop on 429; do not bypass rate limits.
                temporary = path.with_suffix('.part')
                size = 0
                with temporary.open('wb') as stream:
                    for chunk in response.iter_content(1024*1024):
                        size += len(chunk)
                        if size > row['bytes']:
                            raise ValueError('Original changed or unexpected size')
                        stream.write(chunk)
            with temporary.open('rb') as stream:
                assert hashlib.file_digest(stream, 'sha256').hexdigest() == row['sha256']
            temporary.replace(path)
            time.sleep(5)
        with path.open('rb') as stream:
            assert hashlib.file_digest(stream, 'sha256').hexdigest() == row['sha256'], row['id']
        with Image.open(path) as photo:
            exif = photo.getexif()
            camera = exif.get_ifd(ExifTags.IFD.Exif).get(36867)
            gps = exif.get_ifd(ExifTags.IFD.GPSInfo)
        assert camera == row['captureCameraEXIF'], row['id']
        utc = None
        if gps.get(29) and gps.get(7):
            h, m, s = map(float, gps[7])
            utc = datetime.strptime(gps[29], '%Y:%m:%d').replace(tzinfo=timezone.utc)
            utc += timedelta(hours=h, minutes=m, seconds=s)
        assert (utc.isoformat() if utc else None) == row['captureGPSUTC'], row['id']
        print(row['id'], 'hash and original EXIF verified;', row['status'])
    print('Photo provenance verified. This does not clear field-validation acceptance.')


if __name__ == '__main__':
    main()
