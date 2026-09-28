#!/usr/bin/env bash
# Bounded one-off source preparation, never a runtime dependency.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/raw
fetch() {
  # Resume incomplete downloads. Delete a source explicitly to refresh it, then
  # regenerate its manifest and increment the city data version before release.
  curl -fSL -C - --retry 2 --max-time 3600 "$1" -o "data/raw/$2"
}
case "${1:-}" in
  basel)
    fetch 'https://data.bs.ch/api/explore/v2.1/catalog/datasets/100052/exports/geojson' basel-trees.geojson
    fetch 'https://data.bs.ch/api/explore/v2.1/catalog/datasets/100052' basel-trees-metadata.json
    curl -fSL --retry 2 --max-time 180 --get 'https://overpass.osm.ch/api/interpreter' \
      --data-urlencode 'data=[out:json][timeout:90];(way[highway](47.540,7.575,47.577,7.612);way[building](47.540,7.575,47.577,7.612);way[natural=water](47.536,7.570,47.582,7.617);way[waterway](47.536,7.570,47.582,7.617);way[leisure=park](47.536,7.570,47.582,7.617);node[name][tourism](47.540,7.575,47.577,7.612);node[place](47.540,7.575,47.577,7.612););out body;>;out skel qt;' \
      -o data/raw/basel-osm.json
    curl -fSL --retry 2 --max-time 180 --get 'https://overpass.osm.ch/api/interpreter' \
      --data-urlencode 'data=[out:json][timeout:90];(relation[natural=water](47.536,7.570,47.582,7.617);relation[leisure=park](47.536,7.570,47.582,7.617););out body;>;out skel qt;' \
      -o data/raw/basel-areas.json
    python3 scripts/complete-basel-water.py
    ;;
  cambridge)
    fetch 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Environmental/Trees/ENVIRONMENTAL_StreetTrees.geojson' cambridge-trees.geojson
    fetch 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Basemap/Buildings/BASEMAP_Buildings.geojson' cambridge-buildings.geojson
    fetch 'https://download.geofabrik.de/north-america/us/massachusetts-260927.osm.pbf' massachusetts-260927.osm.pbf
    .venv-geo/bin/python scripts/extract-cambridge-osm.py
    ;;
  munich)
    fetch 'https://geodaten.bayern.de/odd/a/lod2/citygml/meta/metalink/09162000.meta4' munich-buildings.meta4
    fetch 'https://download1.bayernwolke.de/a/lod2/citygml/690_5334.gml' munich-690_5334.gml
    python3 scripts/fetch-munich-trees.py
    python3 scripts/fetch-munich-network.py
    .venv-geo/bin/python scripts/extract-munich-environment.py
    ;;
  *) echo 'Usage: bash scripts/fetch-city-data.sh basel|cambridge|munich' >&2; exit 1 ;;
esac
npx tsx scripts/prepare-cities.ts "$1"
