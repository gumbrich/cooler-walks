"""Download only the four official LoD2 tiles used by the expanded pilot.

Resume partial files; validate the published byte count and SHA-256 before use.
Raw CityGML stays out of Git. The municipal metalink is the source of URLs.
"""
import hashlib
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET

TILES = ['690_5334', '692_5334', '690_5336', '692_5336']

if __name__ == '__main__':
    raw = Path('data/raw')
    index = ET.parse(raw / 'munich-buildings.meta4').getroot()
    for tile in TILES:
        entry = index.find(f"{{*}}file[@name='{tile}.gml']")
        if entry is None:
            raise ValueError(f'Missing published tile {tile}')
        target = raw / f'munich-{tile}.gml'
        size = int(entry.find('{*}size').text)
        if not target.exists() or target.stat().st_size != size:
            subprocess.run(['curl', '-fSL', '-C', '-', '--retry', '2', '--max-time', '1800',
                            entry.find('{*}url').text, '-o', str(target)], check=True)
        if target.stat().st_size != size or hashlib.sha256(target.read_bytes()).hexdigest() != entry.find('{*}hash').text:
            raise ValueError(f'Tile {tile} failed its source checksum')
        print(tile, 'verified', flush=True)
