# Sun and shade routing · 0.21.1

Investigated the report that the two buttons only change the theme. Both already pass different primary preferences to the routing worker, generate candidates for that preference, rank their arrival-time exposure and select the resulting recommendation on the map. This release does **not** change the physical model, route selection policy, data or coverage threshold.

The reproducible problem was an unexplained fallback. A route cannot be compared by sunlight after dark, below the model's solar-elevation limit, across dawn/dusk, or with insufficient model coverage. The user also gets the fastest route with zero allowed detour or when no useful alternative is found. Some explanations were hidden when Calm streets was enabled; others were below the route cards. The new bilingual status sits directly below Sun/Shade and explains the result, including the estimated benefit of an available alternative. Secondary-wish comparisons no longer imply that sunlight was compared when it was unavailable.

## Real Zurich reference

Talacker / Pelikanstrasse → Bahnhofstrasse / Sihlstrasse, municipal pavements, integrated building/tree model, five minutes allowed extra time. Rounded distances below are derived results, not measurements.

| Departure in Zurich    | Choice | Selected distance | Direct-sun distance | Unknown exposure | Result                                            |
| ---------------------- | ------ | ----------------: | ------------------: | ---------------: | ------------------------------------------------- |
| 21 June 2026, 14:00    | Shade  |             490 m |               167 m |             10 m | Different route via Nüschelerstrasse/Sihlstrasse  |
| 21 June 2026, 14:00    | Sun    |             463 m |               433 m |             10 m | Different route via Pelikanstrasse/St. Annagasse  |
| 10 October 2026, 14:00 | Either |             399 m |                46 m |            110 m | 73% known exposure; no light-based recommendation |
| 10 October 2026, 22:00 | Either |             399 m |                 0 m |              0 m | After dark; sunlight is irrelevant                |

The summer fastest reference is 399 m with 316 m in direct sun. Shade minimizes time in direct sun; Sun maximizes the sunny share of the walk, within the detour limit. Sun does not reward extra distance merely for accumulating more exposure. Candidate generation is finite, not a proof of global optimality.

`node --import tsx scripts/verify-light-choice.ts` checks ten real calculations: both light choices in daylight, with Calm streets, with zero detour, with incomplete exposure and at night. It asserts different node sequences and opposite exposure improvements where supported, the same fastest baseline, the detour bounds and honest unchanged fallbacks. [Exact input/output evidence](light-choice-validation.json). Included in `data:verify:planner` and the complete data checks.

Browser regressions exercise the actual buttons, selected route distances, repeated switching, preserved addresses, zero detour, the formerly hidden Calm streets warning and German/English night messages. Actual desktop, phone and tablet captures are in `screenshots/light-choice-*`.

Remaining limitation: the integrated canopy model still produces substantial unknown exposure on some routes/times, including this October example. The 95% requirement remains intact, unknown sections are not relabelled sun, and no building-only fallback is silently substituted. Expanding geometric coverage did not establish seasonal foliage or field accuracy. See [shade validation](shadow-validation.md) and [tree library limits](tree-shade-expansion.md).
