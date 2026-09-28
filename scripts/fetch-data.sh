#!/usr/bin/env bash
# A one-off bounded development extract, not a runtime dependency.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/raw
curl -fSL --retry 2 --max-time 180 --get 'https://overpass.osm.ch/api/interpreter' \
  --data-urlencode 'data=[out:json][timeout:80];(way[highway](47.355,8.522,47.391,8.558);way[building](47.355,8.522,47.391,8.558);way[natural=water](47.350,8.520,47.393,8.565);way[waterway](47.350,8.520,47.393,8.565);way[leisure=park](47.350,8.520,47.393,8.565);node[name][tourism](47.360,8.525,47.388,8.556);node[place](47.350,8.520,47.390,8.565););out body;>;out skel qt;' \
  -o data/raw/zurich-osm.json
curl -fSL --retry 2 --max-time 180 --get 'https://overpass.osm.ch/api/interpreter' \
  --data-urlencode 'data=[out:json][timeout:90];(relation[natural=water](47.350,8.520,47.393,8.565);relation[leisure=park](47.350,8.520,47.393,8.565););out body;>;out skel qt;' \
  -o data/raw/zurich-areas.json
curl -fSL --retry 2 --max-time 120 --get 'https://www.ogd.stadt-zuerich.ch/wfs/geoportal/Bauminventar' \
  --data-urlencode 'service=WFS' --data-urlencode 'version=1.1.0' \
  --data-urlencode 'request=GetFeature' --data-urlencode 'typename=bauminventar' \
  --data-urlencode 'outputFormat=GeoJSON' --data-urlencode 'srsName=EPSG:4326' \
  --data-urlencode 'bbox=8.523,47.358,8.558,47.390,EPSG:4326' \
  -o data/raw/zurich-trees.json
for tile in 1091-23 1091-41; do
  curl -fSL --retry 2 --max-time 1800 \
    "https://data.geo.admin.ch/ch.swisstopo.swissbuildings3d_3_0/swissbuildings3d_3_0_2019_${tile}/swissbuildings3d_3_0_2019_${tile}_2056_5728.citygml.zip" \
    -o "data/raw/buildings-${tile}.zip"
done
printf '\nSource downloads complete. Follow docs/data-sources.md to process and version the data.\n'
