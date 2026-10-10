# Route preferences · 0.21.0

The planner starts with two buttons: **Shade / Sun** (**Schatten / Sonne**). They remain visible on phone results as well as in the editor. Shade uses a cool forest palette; Sun uses warm cream and amber. Map exposure colours retain their meaning in both modes.

Zurich always uses the municipal pavement, footpath and crossing network. There is no network switch. Existing beta cities retain their own supported walking graphs; this does not establish pavement precision outside Zurich. Addresses and arbitrary map points still require an explicit reachable walking-point choice.

**Extra walking time** has 0, 5, 10 and 15 minute presets and a native range input accepting every whole minute from 0 through 15. Clicking the track, dragging and keyboard arrows all work. Five minutes remains the default. The budget covers the whole journey through any stops.

**More preferences** contains independent choices for calmer streets, water and flatter paths, plus **Accessibility** in Zurich. There are no numbered or ordered priorities. Accessibility excludes known stairs and closely matched mapped barriers and also requests the gentler-route comparison; it is not a guarantee of step-free or wheelchair-accessible travel. [Coverage and limitations](accessibility-routing.md).

## Choosing a route

Policy: `equal-wish-bands-v2`. The fastest valid route under the selected access restrictions is the reference. Distinct alternatives must respect its extra-time limit and contain at least 10% new walking length. Walking speed remains 80 m/min, without crossing waits, pauses or a slope adjustment.

When sunlight coverage supports comparison, first retain routes similar to the best shade/sun alternative. An alternative must meaningfully improve the chosen sunlight goal, or keep it no worse than the fastest route while improving a supported optional wish. Unknown exposure cannot earn an improvement. When sunlight cannot be compared, supported optional wishes can still produce an alternative; the sunlight estimate remains unavailable/partial, explicitly displayed.

For each optional wish, calculate its best value within that candidate pool. Every wish uses the same fixed physical similarity bands, independently:

- Shade: within 40 m of sun-plus-unknown distance.
- Sun, water or greenery: within 3 percentage points of the whole-route share.
- Calm streets: within 40 m of both main-road proximity and motor-access street distance.
- Flatter: within 5 m of total ascent/descent and within the greater of 1 m or 25% of the best grade burden.

Choose the route meeting the most selected wishes, with shorter walking time breaking ties. Each wish counts once; there is no weighted temperature or “coolness” score. **Selection order does not matter.** Choices can conflict: the comparison table exposes the actual resulting values, including a wish that could not be improved. We evaluate generated alternatives, not all possible routes.

Shade/sun comparison still requires at least 95% known daylight exposure, no night/low-sun transition and comparable detailed-building coverage within 5 percentage points. Calm comparison requires at least 95% traffic-context coverage. Terrain comparison requires complete usable walking-height data. Missing criteria are reported, never treated as favourable values. Tree shade is included by default; foliage and historical-source uncertainty remain in the method and result notes.

## Evidence

[24 real Zurich cases](planner-defaults-validation.json) cover central Zurich, Oerlikon and the Waid area, Shade and Sun, 0/1/7/15 minute budgets, calmer streets + water + barrier avoidance, exact budget enforcement and reversed selection order. Unit tests exercise every minute budget, hard barrier exclusion, restricted fastest-reference routing, missing coverage and equal-wish selection. Browser and Android reports record their tested platforms separately. These are computational checks; field validation remains pending.
