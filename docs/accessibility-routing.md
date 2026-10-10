# Accessibility routing · Zurich

The **Accessibility / Barrierefreiheit** option is a limited barrier-avoidance aid, not certification of a route's accessibility.

Selecting it:

1. Excludes the municipal network's named stair sections.
2. Excludes short pavement pieces closely aligned with an OpenStreetMap stair segment or a walking-specific way tagged `wheelchair=no`. A wheelchair restriction on a nearby carriageway is not transferred to the pavement. Both endpoints must be within 2.5 m, and the direction within 30°. Grade-separated municipal paths do not inherit a ground-level access restriction merely by proximity.
3. Requests the existing flatter-route comparison. Missing heights are not flat; bridge decks are not bare-earth heights.
4. Computes the fastest remaining connected walking route before applying the user's extra-time limit. If no such route exists, an explicit error preserves the trip inputs. The router never silently permits a blocked edge.

The source does **not** establish every stair, kerb ramp, crossing, elevator, surface, path width, temporary obstruction or current closure. Unflagged paths are **unknown as to full accessibility**, not verified accessible. Known wheelchair restrictions are avoided, but absent tags are not positive access evidence. The planner states this beside the option and on results. No gradient limit or wheelchair travel-speed model is claimed.

The municipal [Fuss- und Velowegnetz](https://data.stadt-zuerich.ch/dataset/geo_fuss__und_velowegnetz), checked 10 October 2026, describes positionally recorded walking paths but its downloaded WFS schema has no complete stair/accessibility inventory. The preserved source geometry contains 121 named stair features. The supplement identifies 3,140 additional derived pieces with mapped stairs or wheelchair restrictions; some can overlap those named features. These counts are model flags, not a count of distinct barriers.

Next: inspect a source containing kerb ramps, measured widths/surfaces and elevator status, and validate real journeys with people who use mobility aids. A stricter accessible-route mode needs positive coverage of those attributes and explicit treatment of unknown sections.
