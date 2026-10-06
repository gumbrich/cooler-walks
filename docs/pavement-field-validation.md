# Pavement field validation

**No field observations have been collected.** The [GeoJSON template](pavement-field-points.geojson) contains six source-network locations: three west/east pavement pairs on Bahnhofstrasse. All observation fields are deliberately empty. Import it into a mapping tool or inspect its WGS84 coordinates; save completed observations in a separate file so data preparation cannot overwrite them.

1. Check public access and the reference walk before testing: current works, source crossings, level changes, steps and any disconnected or wrongly connected section. Cross only where currently permitted. Record source-feature/location IDs and exceptions, including routes that cannot be walked as modelled.
2. Choose clear direct-sun conditions and record actual date, local time **with UTC offset**, Europe/Zurich, and a time-synchronised original photo. Seek morning, midday and afternoon observations. Do not simulate a summer observation on an autumn test day.
3. Locate the point using visible fixed landmarks as well as coordinates; consumer GPS alone may not distinguish pavements. Photograph both paired sides as close in time as practical, recording the individual timestamp for each. Locate the ground shadow edge relative to kerbs or other measurable features.
4. Record **sun, building shade, tree shade, mixed, or uncertain** before consulting the prediction. Identify the shading object where possible. Record cloud cover and moving obstructions; exclude cloud-ambiguous or unlocatable evidence with the reason retained. Tree shade does not validate the current building-only model.
5. Freeze app/model/network/source versions and calculate the matching point and instant afterwards. For a moving walk, record the time at each location; waiting at crossings is not included in the app's walking-time estimate. Compare classifications and boundary offsets separately, preserving failures and unknown results.
6. Review all pairs, roof-source flags and the existing photo disagreement together. Do not infer a citywide accuracy percentage from these few locations. Publish evidence and any model corrections before removing the experimental label or widening pavement claims.

Crossing counts in the app count municipal source **sections**, not traffic signals. Map geometry does not establish safety, current legal access, accessible design, or reliable side detection by the phone. Field validation should assess these limitations explicitly.

The broader source/photo protocol and unresolved observations remain in [shadow-validation.md](shadow-validation.md) and [shadow-observations.md](shadow-observations.md). Traffic observations are a separate exercise under [traffic.md](traffic.md).
