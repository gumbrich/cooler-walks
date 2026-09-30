# Zurich shadow observation protocol

This is a collection plan, not completed validation. Do not copy model predictions into the observed-result field. Keep original photos/records in ignored `data/raw/shadow-validation/observations/`; publish only reviewed, de-identified validation evidence with permission to use the images.

## First collection

Choose safe, publicly accessible ground-level locations within the marked central 3D pilot, including Bahnhofquai, streets around Lindenhof, Bahnhofstrasse/Paradeplatz and the Bürkliplatz approaches. These are candidate locations, not surveyed test stations. Confirm each exact point on site; stay out of roads and private entrances. Bridges, arcades, trees and uncertain construction should be recorded as separate limitation cases, not used to certify the ground-level building model.

Photograph the same locations in morning, around solar noon and afternoon on clear days. Keep camera date/time and the Europe/Zurich offset; retain the original files and EXIF. Include an identifiable facade/corner, the ground point being classified, and the visible shadow boundary. A general scenic photograph without an identifiable point cannot establish agreement.

For each record note:

- Stable observation ID, original filename and SHA-256.
- Capture time including UTC offset, and how it was verified; target uncertainty ≤1 minute.
- Exact ground location (WGS84 and/or LV95), marked on a map or measured from a fixed feature; target uncertainty ≤2 m. Phone GPS alone in a narrow street may not meet this requirement.
- Observed class: direct sun, building shade, tree shade, mixed or uncertain; identify the casting building where possible.
- Whether the sun was visibly unobscured, and any cloud, construction, foliage, bridge/deck or ground-level ambiguity.
- For a shadow boundary: at least two independently located points on that boundary and their positional uncertainty.

Classify observations before displaying model predictions. Exclude ambiguous observations using the criteria above, retain their reasons, and never select only photographs that appear to agree. Compare the exact observed instant, not a route's departure time. Evaluate points directly, then separately assess complete walking-route exposure and pavement-side errors.

## Limited-pilot acceptance criteria

These are proposed engineering acceptance criteria, not a scientific standard or a guarantee of safety. They are set before collecting observations and must not be weakened after seeing results.

- At least 60 usable point observations across six locations, two clear dates and morning/noon/afternoon; include at least 20 direct-sun and 20 building-shade observations. Report repeated observations by location/time so correlated samples are visible.
- At least 90% overall classification agreement and at least 85% agreement within each observed class. Report every disagreement, unknown prediction, exclusion and the observed denominators. Unknown predictions count as non-agreement; do not drop them to improve accuracy.
- At least ten independently located building-shadow boundary checks, with median boundary error ≤3 m and 90th percentile ≤6 m. Record combined time/location uncertainty; if it prevents a meaningful comparison, obtain better observations rather than interpreting the photograph as precise.
- Investigate material source-height discrepancies and systematic failure by location, roof type, season or time of day. A pooled average cannot hide a failed group.

Passing this limited pilot does not validate trees, hill shadows, opposite pavements, all Zurich streets, winter/summer conditions absent from the observations or current construction. Expansion requires an explicit review of these results and the additional area's source coverage.

## Alternative: timestamped aerial strips

[SWISSIMAGE RS](https://www.swisstopo.admin.ch/de/orthobilder-swissimage-rs) supplies separate orthorectified strips with date/time in UTC. Request a small extract covering LV95 `[2682200,1246200,2683800,1248300]`, preferably including the model's 2019 building epoch and a later date. Ask for original strip IDs, acquisition timestamps, resolution, georeferencing and any accuracy limitations. The provider quotes preparation costs and requires an email request; no request has been sent.

The public sample archive's worldfiles were inspected with small HTTP range requests. Their northing origins are 1,198,600.65 m and 1,093,794.625 m, both south of this pilot, and their pixels run southward. They cannot cover the Zurich pilot. An ordinary SWISSIMAGE mosaic tile year is insufficient to establish a shadow's exact capture time.
