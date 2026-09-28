#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/raw
curl -fSL --retry 2 --max-time 120 --get 'https://www.ogd.stadt-zuerich.ch/wfs/geoportal/Baumkataster' \
  --data-urlencode 'service=WFS' --data-urlencode 'version=1.1.0' \
  --data-urlencode 'request=GetFeature' --data-urlencode 'typename=baumkataster_baumstandorte' \
  --data-urlencode 'outputFormat=GeoJSON' --data-urlencode 'srsName=EPSG:4326' \
  --data-urlencode 'bbox=8.529,47.362,8.552,47.385,EPSG:4326' \
  -o data/raw/zurich-tree-register-audit.json
