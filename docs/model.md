# Model and recommendation rules

## Walking network

OSM node identities establish connectivity. Crossing lines without a shared node are not joined, so bridges and tunnels retain their mapped topology. Way segments become metre-weighted graph edges in LV95. Motorways/trunks, construction, private or prohibited pedestrian access, conditional access, indoor paths, unmapped plaza interiors, restricted gates and vehicle-only cycleways are excluded conservatively. Explicit pedestrian access can override a general vehicle restriction. Normal traffic one-way tags do not imply pedestrian one-way restrictions.

We route between actual graph nodes within 45 m of an input, show the snapped route endpoints and disclose snap distances. No straight connector is advertised as a walking route. Named places are selected on the main connected walking network; small disconnected components remain in the graph so map selections can be reported honestly. Place points may be a nearby mapped path rather than a building's door. Snapping and recorded access still require local verification before broader rollout.

Dijkstra finds the shortest route on the included network. A constant 80 m/min (4.8 km/h) converts distance to duration. Crossing waits, gradients and individual walking speed are not estimated. Stairs are retained and disclosed; no accessibility claim is made.

Alternatives come from three penalties on the reference path and three environmental weightings. All candidates must respect the precise unrounded extra-time budget. At least 10% of an alternative's distance must use new path nodes, and improvement must be at least 40 m less direct sun or 3 percentage points more tree proximity. The result is the best candidate evaluated, not a proof of globally optimal shade routing. Exact zero detour returns only the shortest reference route. Different weighting searches can converge to the same route and are deduplicated.

## Estimated building shade — experimental

1. Parse actual `GroundSurface` triangles from swissBUILDINGS3D CityGML and derive each building's height from maximum model Z minus minimum ground Z. Source coordinates are LV95 with LN02 vertical reference. Heights are **relative metres**, not absolute elevations used as heights.
2. Merge ground triangles and preserve holes. Simplify their outlines by 0.1 m. Display and storage use WGS84; calculations project into the city's explicitly configured metric CRS.
3. SunCalc supplies solar altitude and azimuth for an absolute instant. Convert its south-origin convention to clockwise from north. The route's IANA time zone converts user-entered local dates to an instant. Ambiguous/skipped DST times are rejected.
4. Sample each walking edge at intervals no longer than 8 m, weighting by segment length. Cast a ray towards the sun against each extruded footprint; horizontal reach is `height / tan(altitude)`. Preserve courtyard openings. Use a spatial grid to bound candidate objects.
5. Use a **departure-time snapshot** for the entire walk. This does not model the time of arrival at each segment. Flat-ground prisms overstate some roof shadows and do not capture terrain. Opposite pavements cannot be distinguished from street centrelines.

Object data extends beyond the routing boundary. Samples are unknown if their potential source reach exceeds the model bounds. Solar altitude below 10° is withheld because a bounded flat-ground model becomes particularly unreliable; solar altitude at or below 0° is night. Tree shadows, leaf seasonality, clouds, weather and terrain effects are disabled.

Shade, direct sun and unknown distances are separate. Shade percentage uses **modelled distance** (`shade + sun`) as denominator, while model coverage uses total route distance. Both comparison routes must have at least 95% model coverage. Unknown segments never reduce the sunlight cost or improve eligibility. Inadequate shade coverage falls back explicitly to the separate greenery comparison. Qualitative quality: **experimental — simplified buildings, historical source geometry, no field validation**. No confidence probabilities, measured temperature reductions or thermal-safety claims are made.

For shade, prefer lower absolute modelled distance in direct sun (equivalent to time under a constant walking speed); shorter duration breaks ties. At night the app only compares greenery and does not call a zero-sun route cooler.

## Greenery

The measure is the fraction of route distance within 15 m of a verified inventory tree position. It is a reproducible **tree-proximity indicator**, independent of time. Invented/randomly distributed TLM woodland trees are excluded by their source prefix. No assumption about crown size, actual canopy shade, foliage, seasonality or cooling is inferred from proximity. Building shade and greenery remain separate metrics.

## Water and ordered stops

Water is a separate, optional preference. Sample the route at the same ≤8 m resolution and count distance within **50 m of mapped surface-water polygons**, including bridges over water. Distances use the city's metric CRS; polygon holes preserve islands. Water fraction uses total route distance. This is straight-line proximity, not verified views, bank access, drinking-water availability or cooling. Untagged/missing water and historical source changes remain possible. Do not interpret a zero as proof that no water exists.

The source adapter keeps actual OSM water polygons and multipolygons, excluding fountains, basins, reflecting pools, underground/covered water, and tagged intermittent/seasonal features. Water centreline widths are not invented. With **Prefer waterside** enabled, generate candidates using water proximity and choose the greatest water fraction, with walking time as tie-breaker. Require at least a three-percentage-point increase and 10% new path length. Shade/greenery remain visible, independently calculated metrics; a waterside recommendation may have less building shade. Existing shade-coverage comparison rules still apply when displaying shade. No composite cooling score is used.

Up to **three intermediate stops** are visited in the specified order. Each stop uses the same access, snapping and coverage checks as an endpoint. The fastest reference is the sum of shortest valid legs through all requested stops; a candidate's **whole-trip duration** must stay within the single 0/5/10-minute extra-time budget. Stops do not each receive another budget. Return trips and repeated path segments are allowed. Stop dwell time is not included; shade remains a departure snapshot. A disconnected leg fails the trip with its leg number. Reversing endpoints also reverses stops.

## Verification and remaining work

Focused tests check LV95 against the official Bern origin, a Paris UTM round-trip, unit conversion, DST, Melbourne local time and solar orientation, polar night, shadow direction and length, an analytic 10 m block at 45°, courtyard openings, graph access, disconnected routes, detours and missing coverage. `docs/route-validation.json` records a real Zurich route at several times.

Analytic geometry checks are independent physical reference cases; they are not validation against real dated Zurich shadows. Before expanding or removing the experimental label: field-check paths, compare timestamped observations, add terrain-aware reference cases, audit tagged pedestrian restrictions and snapping near barriers, and evaluate route-side geometry. Historical geometry and source network freshness remain material limits.
