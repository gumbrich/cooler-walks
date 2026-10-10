# Restore useful Sun/Shade routing · 0.22.0

The 0.21.0 integration of tree shade exposed a routing regression: unknown tree observations replaced otherwise usable building-only sunlight, then a blanket 95% known-exposure requirement disabled the choice for the entire trip. The 0.21.1 warning explained this without solving it. This release changes route selection, not just the message.

## Comparison with incomplete observations

Model `roof-mesh-tiled-ground-arrival-v9` keeps the existing geometry, solar calculations, arrival-time sampling and source masks. It does not interpolate scan gaps or turn unknown tree exposure into sun.

1. Evaluate buildings and trees together first. A partial-data recommendation is allowed only when its benefit survives the worst assignment of unknown exposure. Shade requires `fastest known sun − (alternative known sun + alternative unknown) ≥ 40 m`, multiplied by the number of extra crossing sections if greater than one. Sun requires the alternative's known-sun share to exceed the fastest route's sun-plus-unknown share by at least 3 percentage points. Thus unknown observations never earn a recommendation.
2. If more than 5% of the fastest route is unknown and no combined-model light improvement qualifies, retry the same trip with the building model. This also covers a completely unknown canopy result. Use that result only if it actually reduces unknown coverage. The same access rules, time limit and primary/optional preferences apply.
3. Re-evaluate the selected building paths with trees. Retain this evidence, and reject a building-based alternative if the known combined evidence already proves it worse overall, even allowing the unknown sections to favour it. This guard cannot establish an overall tree-inclusive benefit where observations are missing: the recommendation is explicitly about buildings.
4. The interface says **“Vergleich nach Gebäudeschatten · Baumdaten lückenhaft”** / **“Building shade comparison · tree coverage is incomplete.”** The map legend identifies buildings-only sunlight; route details preserve potential tree shade and unknown metres on those exact paths. Partial-data comparison values use ranges. Night, low sun below 10°, unknown bridge heights and missing building geometry remain limitations.

The former 95% boundary is now a display-quality and fallback trigger, not a blanket eligibility gate. Routes still need comparable detailed-building coverage within 5 percentage points. The fastest valid path remains the reference; alternatives must be distinct, remain inside coverage and respect the whole-trip detour budget. This is the best of evaluated candidates, not a claim of global optimality. If no justified alternative exists, keep the fastest route.

## Broad real-route regression

Eight real address/place pairs use explicit municipal walking-point selections: central Zurich, Oerlikon, Altstetten, Höngg, Wipkingen, Wiedikon, the university area and the lakeshore. Each is evaluated for Shade and Sun with five extra minutes at 14:00 CEST on 21 June and 10 October, and noon CET on 21 December: **48 calculations / 24 matched pairs**.

- Before: the old combined-model 95% rule allowed comparison in only **6/24 pairs**. [Pinned pre-change evidence](shade-availability-before.json).
- After: all 48 calculations have a usable daylight comparison model. Shade and Sun select different paths in **19/24 pairs**, including **7/8 October pairs**. There are 18 tree-aware and 13 explicitly building-based alternative recommendations. [Computed paths, coverage, model basis and timing](shade-availability-validation.json).
- The five unchanged pairs are the three short Höngg journeys and winter Wiedikon/lakeshore cases. No detour is manufactured merely to make the buttons look different.
- The former failing October default trip now selects approximately **405 m for Shade and 439 m for Sun**, compared with a 399 m fastest path. Building-only direct-sun distance is approximately 81 m versus 342 m; the model basis is visible. [June/October, zero-budget and night evidence](light-choice-validation.json).

These pairs are a broad regression suite, not a random sample or a citywide success-rate estimate. Winter calculations still use the historical opaque-canopy scenario; they do not validate actual winter leaf cover. Synthetic tests assign unknown exposure throughout its possible range and check that an accepted improvement cannot reverse. A separate test covers all-unknown trees with a usable building model. Pure canopy/source checks deliberately disable adaptive fallback so source gaps remain independently observable.

Reproduce with `npm run check`, `npm run data:verify`, and `npm run test:e2e`. The broad suite alone is `node --import tsx scripts/verify-shade-availability.ts`. Browser, PWA and Android evidence is recorded separately in [platform.md](platform.md).

## Remaining limits

No physical model or source accuracy was improved by this routing repair. Known shade remains an estimate; cloud cover, seasonal transmission, current construction and terrain-cast shadows remain unmodelled. Some routes legitimately have no defensible alternative, and building-only suggestions cannot promise the most sun/shade once missing trees are accounted for. The [field-validation HOLD](shadow-validation.md), source disagreements and competitor comparison limitations remain unchanged.
