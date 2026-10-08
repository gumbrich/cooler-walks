# Route preferences · 0.20.0

The planner now has one **Main priority / Am wichtigsten** selector. **More preferences / Weitere Wünsche** holds optional wishes; they stay selected together instead of silently switching one another off. The visible sequence is the actual ranking order. Changing the main priority preserves compatible secondary choices and removes duplicates. Sun and shade exclude one another. City changes reset incompatible preferences.

| Combination                          | Meaning and limits                                                                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shade or sun + water                 | First improve direct-sun exposure, then prefer water among similar candidates. Water proximity is not shade or a temperature measurement.                  |
| Calmer streets + shade + flatter     | First compare street context, then exposure, then ascent/descent. Each layer needs its own coverage; unknown elevation does not become flat terrain.       |
| Flatter + water                      | Prefer less vertical movement/gentler grades, then nearby water. Riversides can still have bridges and stairs. This is not step-free routing.              |
| Water + sun in winter                | Prioritize water, then known sun, where the solar model is usable. Very low sun remains unsupported; seasons do not automatically change the preference.   |
| Municipal pavements + calmer streets | Unavailable: the traffic adapter has not been matched to that network. Shade, water and supported elevation remain usable.                                 |
| Tree scenario                        | A separate model setting, not another route wish. It assumes full foliage and remains experimental. Do not treat it as validated winter tree transmission. |

## Ranking

Model identifier: `ordered-physical-bands-v1`. The fastest valid route remains the reference. The 0/5/10-minute budget, ordered stops, legal graph topology and complete walking-area checks are unchanged. Duration still uses 80 m/min; terrain does not change the time estimate.

The router generates distinct candidates for **each selected objective**, as well as alternatives avoiding the fastest path. Ground-height and arrival-time solar sampling use their existing models. It evaluates the collected candidates, not every possible route; there is no global-optimality claim.

An alternative needs at least 10% new walking length. It must either materially improve the main goal, or keep that goal no worse than the fastest route while materially improving a supported secondary wish. Missing data is treated conservatively against the candidate. A single-priority request keeps the existing exact ranking and duration tie-breaker.

With optional wishes, start with the best main-goal candidate. Retain candidates within these explicit similarity bands, then apply each optional wish in the displayed order:

- Shade: at most 40 m more sun-plus-unknown distance, roughly half a minute at the fixed walking speed.
- Sun, water and greenery: at most 3 percentage points less of the relevant whole-route share.
- Calm streets: at most 40 m more near main roads **and** 40 m more on streets permitting motor access.
- Flatter: at most 5 m more total ascent/descent, and grade burden no more than 25% or 1 m above the best value, whichever is larger. These are model tolerances, not field accuracy claims.

Every retained candidate stays inside all earlier bands. Compare candidates against one fixed best value at each stage; pairwise fuzzy sorting could be inconsistent. Choose the shortest remaining walk. These bands express small trade-offs in real units; there is no opaque combined “coolness” score. See `src/lib/preferences.ts` for thresholds and tests.

Shade/sun requires at least 95% modeled daylight coverage, no night/low-sun transition and comparable detailed-model coverage (within 5 percentage points of the reference). Traffic requires at least 95% coverage. Terrain requires complete usable walking-ground heights. A secondary wish with insufficient comparable coverage is explicitly listed as **not compared**; it cannot improve the score. If the main goal lacks coverage, show the fastest route.

## Interface and evidence

The optional comparison table shows computed values for the fastest and alternative routes. A requested wish can still be worse on the alternative when a higher priority wins; the table exposes that trade-off. Sunlight values describe model estimates, water means within 50 m of mapped surface water, and traffic remains street context rather than live vehicle counts. Tree settings are folded under **Shade model**. Map overlays do not change routing preferences.

`npm run data:verify:preferences` checks five actual Zurich requests at 0, 5 and 10 extra minutes, covering the centre, Bucheggplatz–Waidbadstrasse and Bellevue–Zürichhorn. [Computed records](preferences-validation.json) include candidates, actual metrics, gaps and applied wishes. Synthetic tests cover priority order, contradictory sun/shade choices, coverage, secondary gains with an unchanged main goal and tie-breaking. Browser checks cover German/English, independent selections, time limits, city switching, accessibility and phone/tablet/desktop layouts. Computational checks do not replace the agreed field validation.
