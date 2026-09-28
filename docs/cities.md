# Coverage register

| City                         | Status            | Geographic coverage                                                                          | Greenery                | Building shade                                              | Tree shade | Terrain | Fountains |
| ---------------------------- | ----------------- | -------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------- | ---------- | ------- | --------- |
| Zurich, Zürich, Switzerland  | Pilot area        | Central rectangle: W 8.529, S 47.362, E 8.552, N 47.385. Whole routes must remain within it. | Recorded tree proximity | Experimental flat-ground buildings, sun ≥10°, coverage ≥95% | No         | No      | No        |
| Paris, Île-de-France, France | Data under review | No launched coverage; configuration bounds are a research area only                          | Not launched            | Not launched                                                | No         | No      | No        |
| Vienna, Austria              | Candidate         | No launched coverage                                                                         | Not launched            | Not launched                                                | No         | No      | No        |

Zurich's routing area is about 1.7 × 2.6 km. Its rectangular boundary is a data-validation scope, not a municipal boundary. The building source area is larger, with additional boundary checks for shadows entering the walking area. The map can show source geography outside the supported routing rectangle; this does not establish route or shade coverage there.

## International comparison and choice

**Paris: selected next investigation.** The municipal [Arbres API](https://opendata.paris.fr/explore/dataset/les-arbres/) returned actual public records on 28 September 2026. Two inspected examples include species, height in metres, circumference in centimetres, public-management category and WGS84 positions; IDs 256125 and 280520. This establishes API/schema feasibility, not reliable crown geometry, complete private-tree coverage or observation dates. The API reported 220,215 records at inspection; this is a catalog count, not a claim of complete city coverage. [IGN BD TOPO](https://www.data.gouv.fr/datasets/bd-topo-r) supplies building geometries and heights under Licence Ouverte 2.0. Height definitions and local missing values must be inspected before modelling.

**Vienna: compared candidate.** The city documents a [public WFS](https://digitales.wien.gv.at/open-data/geowebservices/) with tree-inventory examples and [downloadable geodata](https://www.wien.gv.at/stadtplanung/geodatenviewer-ogd-daten-herunterladen). Reuse requires city attribution. It remains credible, but no source sample or building-height adapter was validated in this milestone. Paris has the stronger directly inspected vegetation API and a clear national building source, so it is the next integration target.

## Paris integration steps

1. Select a small pedestrian district and inspect an OSM graph plus bridge/underpass, barrier and entrance cases. Record extraction date and network freshness.
2. Fetch bounded Paris tree records, retain IDs/measurement provenance and verify the portal's licence and record-update semantics. Start with greenery only.
3. Inspect an actual IGN building extract: Lambert-93 (EPSG:2154), height/ground fields, vertical reference, geometry holes and missing-data distribution. Normalize to Paris's metric calculation CRS (UTM 31N in current config) and WGS84 display.
4. Generate a Paris-specific bundle and map through separate adapters, add sources/attribution and measured coverage to the shared city configuration.
5. Verify real alternatives, coverage boundaries, Europe/Paris DST and city switching. Do not enable a capability until its own tests pass.

The current blocker to launch is **unimplemented and unvalidated routing/building integration**, not an asserted lack of access. No international availability is claimed. Additional Swiss cities remain in scope when their local data has been reviewed.
