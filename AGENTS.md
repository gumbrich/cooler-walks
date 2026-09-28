# Cooler Walks — international cities project instructions

## Purpose and working agreement

Build a visually exceptional, useful walking-route planner that helps people in cities around the world choose routes with more estimated shade and greenery. Visual quality is a core product requirement, alongside trustworthy estimates and working routes. Use Zurich as the first pilot, with Swiss and international cities included in the product design and data architecture from the outset. Geography is limited by validated data coverage, not by a Switzerland-only product rule.

The central question is: **“How can I walk there with less sun exposure, and how much longer will it take?”**

This file defines the product and development constraints. Follow the user's current task: when asked to build the initial app, carry the work through to a running, tested version. For later changes, implement the requested scope without restarting the project or rebuilding unrelated features.

- Inspect the existing project and preserve useful work. In an empty project, make reasonable implementation choices and proceed.
- Keep the user informed in plain language. Ask only when missing information materially blocks progress; resolve routine design and engineering choices yourself.
- Validate the hardest data and routing assumptions early. Do not spend the entire task on a visual mockup.
- Separate implemented features, estimates, and remaining limitations. Never describe a prototype as a validated citywide service.

## Product scope

Working name: **Cooler Walks**. This name describes the product goal; it does not establish a measured temperature benefit.

Deliver a responsive website and an installable mobile web app from a shared codebase. Give both desktop planning and walking with a phone a deliberately designed experience. Use English initially and keep interface text easy to translate. Default to metric distances, with a user-selectable imperial display; keep calculations in consistent internal units. Interpret departure times in the route location's IANA time zone, including local daylight-saving rules. Use Europe/Zurich only for the Zurich pilot, not as a global default. Make the route's local time zone visible when it differs from the device's zone.

First establish a working end-to-end implementation in a clearly defined Zurich coverage area, then validate the approach in a city outside Switzerland. Additional Swiss cities remain in scope. Expand coverage city by city where the routing and environmental data support it. Show actual coverage boundaries; a city's presence in a selector does not establish complete coverage. International ambition does not imply immediate worldwide routing or shade coverage.

### Cities and rollout

- Keep the public brand **Cooler Walks**, with the selected city and country shown separately where useful. Avoid Zurich-specific or country-specific assumptions in shared interface text, routing logic, and data processing.
- Candidate cities may include Basel, Bern, Geneva, Lausanne, Lucerne, Winterthur, Vienna, Paris, Barcelona, Berlin, and Melbourne. These are candidates for investigation, not claims of available data or confirmed launches. Choose an international pilot after comparing real data quality, access, coverage, and integration effort; do not commit to every example city.
- Provide a compact city selector and a coverage view. Default the initial visit to Zurich, remember an explicitly selected city locally, and use location only after permission. Address search should identify the relevant supported area and make any city change visible.
- Keep a city configuration with a stable identifier, country/region, local and translated display names, map centre, coverage geometry, IANA time zone, locale defaults, source coordinate systems, source providers, dataset versions, and enabled capabilities. Shared components should consume this configuration rather than contain city-specific branches. Disambiguate cities with identical names using region and country.
- Maintain a simple coverage register in `docs/cities.md`: candidate, data under review, pilot area, or available. For each active city, list the actual geographic coverage and whether greenery, building shade, tree shade, terrain effects, and fountains are supported.
- Use suitable global, national, regional, and municipal datasets through replaceable adapters. Swiss datasets are inputs for Swiss coverage, not worldwide dependencies. Do not assume another city has Zurich's tree inventory, building heights, or equally detailed canopy data.
- Validate model coverage along the whole route, not only at its endpoints. Handle routes that cross dataset or municipal boundaries explicitly; an administrative boundary alone need not prevent a route where the combined data supports it.
- Show unsupported cities honestly. A basemap may be viewable while cooler-route recommendations remain unavailable. Label pilot areas and disabled capabilities clearly, without inventing results to complete the city selector.
- Preserve local place names, accents, and non-Latin scripts. Separate interface language from destination language, time zone, and units. Keep text and layouts ready for localization, including right-to-left languages, while retaining English as the initial interface language. Do not assume a Swiss address format or restrict search to Switzerland.

A Zurich pilot is a valid first milestone. Before describing the product as supporting multiple cities, demonstrate real routes and the advertised environmental capability in at least one additional city using the same shared implementation. Before claiming international availability, validate at least one launched city outside Switzerland. Describe availability by supported cities, not as blanket countrywide or worldwide coverage.

### Essential user journey

1. Choose a supported city or find it through address search. Enter a start and destination, choose points on the map, or explicitly choose “Use my location.”
2. Select a departure date and time; default to now.
3. Set the maximum extra walking time: 0, 5, or 10 minutes, with 5 minutes as the default.
4. Compare the fastest valid walking route with an alternative offering more estimated shade when the available data supports one.
5. Select a route and inspect its distance, estimated duration, extra minutes, sun/shade estimate, and data coverage.
6. Move the departure time to see how the estimated shade and route recommendation change.

Show nearby public fountains as an optional layer once their data is integrated. Fountain locations alone do not establish public access, drinking-water status, or whether water is currently flowing.

Do not require registration. Keep accounts, payments, social features, blanket worldwide coverage, live turn-by-turn navigation, and weather forecasting outside the initial scope. Multiple Swiss and international cities are part of the product scope, with a staged rollout. Benches, toilets, gradients, and accessible routes are later additions when their data can be verified.

## Website, app, or both

The recommended first release is **both a website and an installable progressive web app (PWA)**. People should be able to open a link immediately, plan on a laptop, or add the product to their phone's home screen where supported. Installation must remain optional.

- **Website:** provide a distinctive public entry experience, a directly accessible route planner, and concise method/source information. Keep the planner one obvious action away. Returning users and direct planner links should reach the map without repeating an introduction.
- **Installed app:** use the same routing, data, and design system in a standalone presentation. Provide an intentional app icon, manifest, appropriate launch settings, and device-appropriate installation guidance. Verify support in the browsers actually targeted; do not assume a custom install button works everywhere.
- **Desktop:** give users room to explore the map and compare routes beside it. Design for pointer and keyboard input.
- **Phone:** prioritize one-handed use, readable route summaries, device safe areas, and a bottom sheet that leaves the active route visible. Account for the on-screen keyboard and distinguish map gestures from sheet gestures.
- **Offline behaviour:** provide a useful offline message and, where implemented, a cached interface. Offline routing and offline maps are separate features; do not promise them merely because the app is installable. Respect provider caching terms and keep time-sensitive results clearly dated.
- **Native iOS/Android apps:** consider them if a concrete requirement needs capabilities or distribution that the web approach cannot adequately provide. Record the reason and effort before introducing a second interface implementation. A PWA is not an App Store or Play Store release. Preserve reusable routing/data modules so a native client can be added later.

Record the initial platform decision and tested browser support in `docs/platform.md`. Use the [MDN installation guide](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable) to verify current requirements. The initial delivery should include a website that works without installation and a verified installation path on at least one available supported platform; disclose platform tests that could not be performed.

## Experience and visual design

### Art direction

Take inspiration from the care of Swiss atlas design: precise cartography, confident typography, generous space, and the warmth of a walk under trees. Apply this international visual identity to each city's actual geography and character; avoid branding that implies the service is exclusive to Switzerland. Give the product a recognizable identity that feels inviting to use every day.

- Establish a cohesive palette: warm off-white backgrounds, deep forest-green text and actions, soft vegetation greens, restrained blue for water, and warm amber for direct sunlight. Adjust actual colours for contrast and map clarity.
- Use a distinctive, legible type system with a clear hierarchy. Expressive headings can complement readable interface text; keep font loading light and use practical type for controls and measurements.
- Define reusable colour, typography, spacing, radius, elevation, and motion tokens. Give buttons, inputs, sheets, cards, and map markers consistent proportions and interaction states.
- Create a simple brand mark and app icon that work at small sizes. Use a coherent icon family and label unfamiliar icons.
- Use photography or illustration selectively on the public entry page when it improves the atmosphere. Keep imagery geographically honest and properly licensed; generated artwork must not masquerade as a real location or a functioning map. City-specific imagery must match the selected city.
- Spend design effort on the route planner itself. Default component styling or a polished introduction followed by an unfinished map does not satisfy the brief.

### Cartography and signature interaction

The map is the main visual asset. Style its land, water, vegetation, streets, buildings, and labels as a coherent composition when the map source permits it. With fixed raster tiles, choose a suitable base layer and integrate the overlays thoughtfully. Keep required attribution visible.

- Preserve each city's recognizable geography, waterways, parks, and street structure; in Zurich, for example, the lake and Limmat should remain legible. At each zoom level, reveal the detail needed for orientation and walking. Apply one coherent map design across cities.
- Give the chosen route a clear stroke with a contrasting casing. Make alternatives subordinate but selectable. Separate route selection from sun/shade encoding so users can identify both.
- Encode estimated shade, direct sun, and unknown data consistently, with a small legend and a non-colour distinction. Overlay opacity must preserve street labels and crossings.
- Make the departure-time control a signature feature: a tactile timeline or slider that updates modelled exposure and route summaries smoothly. Keep the selected time visible, show calculation progress, and suppress stale responses when scrubbing quickly. Respect the capability limits of the greenery prototype.
- Use subtle route drawing, marker transitions, and sheet movement to explain changes. Respect reduced motion and keep rendering responsive on ordinary phones. Animation must not imply modelling precision that does not exist.
- Show route differences in a compact visual comparison: walking time, extra minutes, and estimated exposure with its coverage. Display only values the implementation computes.

### Screen composition and interaction

- **Public entry:** use a strong headline, an appealing map or place-based visual, and an immediate “Find a cooler walk” action. Explain the benefit through one clear visual example, labelled as illustrative if it is not a live calculation. Keep additional explanation concise.
- **Planner before search:** make the selected city, start, destination, departure time, and detour budget easy to understand. Use the active city's map to establish context without overwhelming the form. Make supported coverage discoverable.
- **Results:** let the map and route comparison occupy the main screen. Use a compact bottom sheet on phones and a side panel on larger screens. If only one useful route exists, show it without duplicate cards.
- **Selected route:** provide a legible summary and an explanation such as “More estimated shade, 4 minutes longer,” using computed values. Make editing the trip and comparing alternatives easy.
- **Method and coverage:** provide a small “How estimates work” view with sources, included model components, and limitations. Use plain language and keep technical details out of the main planning flow.
- **States:** deliberately design loading, no route, no better alternative, unsupported area, unavailable data, denied geolocation, offline mode, and service errors. Preserve inputs after recoverable errors. These states must match the visual quality of the main screens.

### Design quality gate

Create a short `docs/design.md` describing the visual direction, key tokens, page structure, and interaction choices. Establish one polished desktop planner view and one polished phone view early, then apply the same language across the product. Make design decisions independently unless the user supplies a specific preference.

Before delivery, inspect rendered screenshots of the actual implementation at representative phone, tablet, and desktop sizes. Include the public entry, route results, and at least one difficult state. Fix awkward spacing, weak hierarchy, clipped content, crowded maps, and inconsistent controls. Deliver selected screenshots with the app so the user can review the visual result.

Support keyboard operation, visible focus, labelled controls, large touch targets, reduced motion, and a textual route summary usable without the map. Check contrast, outdoor legibility, and zoomed text. Visual ambition and accessibility are both acceptance requirements. Do not claim device, browser, or usability validation based only on screenshots.

## Public data and provenance

The following are research starting points checked on 28 September 2026. Verify current documentation, actual download resources, schemas, geographic coverage, observation dates, licensing, attribution, and service limits before implementation. Catalogue presence is not proof of suitability.

The Swiss and Zurich-specific sources below are pilot inputs. For every additional city, locate and verify appropriate national, regional, municipal, or global datasets and record them separately. Verify country-specific access rules, source terms, attribution, units, and coordinate systems. Missing local layers should change the advertised capabilities, not silently inherit Zurich's settings. Swiss address, tile, terrain, and building services must not be assumed to cover other countries.

| Need | Starting source | Implementation requirement |
| --- | --- | --- |
| Zurich trees | [City tree inventory](https://data.stadt-zuerich.ch/dataset/geo_bauminventar) and [tree register](https://data.stadt-zuerich.ch/dataset/geo_baumkataster) | Inspect the underlying data dates. The inventory describes modelled tree forms with widths that are not measured crown widths. Treat inferred canopy geometry as uncertain. |
| Building geometry | [swissBUILDINGS3D 3.0 Beta](https://www.swisstopo.admin.ch/de/landschaftmodell-swissbuildings3d-3-0-beta) | Evaluate building geometry and height information for shadow calculations. Check coverage and version before selecting assets. |
| Terrain and base geodata | [swisstopo open geodata](https://www.swisstopo.admin.ch/en/free-geodata-ogd) | Select an appropriate elevation product if modelling slopes or terrain shadows. A basemap is not a routing network. |
| Address search and map services | [geo.admin.ch documentation](https://docs.geo.admin.ch/) | Discover supported endpoints from current documentation; verify coordinates, attribution, quotas, and deployment suitability. |
| Public fountains | [Zurich fountain dataset](https://data.stadt-zuerich.ch/dataset/geo_brunnen) | Inspect access and water-related attributes. Do not label every point as a functioning drinking-water fountain. |
| Additional local layers | [Open Data Zurich](https://data.stadt-zuerich.ch/) | Add layers only when they improve the core route decision and have usable coverage. |
| Walking network | A suitable OpenStreetMap extract or another documented pedestrian routing source | Verify pedestrian access, crossings, bridges, tunnels, stairs, connectivity, and applicable data and service terms. |

Create `docs/data-sources.md` with the resources actually used, observation/update dates, fetch dates, licence and attribution requirements, coordinate systems, coverage, relevant fields, transformations, and known gaps. Do not confuse a recent catalogue edit or fetch date with recent field observations.

Keep source datasets separate from derived geometry and route scores. Make ingestion reproducible and retain source/version identifiers. Use small regional extracts for development; do not commit huge raw datasets.

Do not make production depend on scraping map viewers or unlimited use of public demo servers. Use documented interfaces and appropriate caching or locally processed extracts. Distinguish permission to reuse data from permission to consume a hosted tile or routing service at scale.

## Shade estimation: non-negotiable rules

**Greenery, geometric shade, weather, and perceived temperature are different quantities.**

- Tree proximity is a greenery indicator. It is not proof of shade.
- A geometric shadow model estimates obstruction of direct sunlight for a location, date, and time. It is not a live observation or a complete thermal-comfort model.
- Do not claim temperature reductions in degrees, “heat-safe” routes, or measured comfort improvements without suitable evidence.
- Do not use decorative shadow polygons from a basemap as time-specific physical shadows.
- Do not generate environmental facts, routes, or scores with a language model.

Implement two explicit capability levels:

1. **Greenery prototype:** use real walking routes and verified vegetation data. Label recommendations “Greener route.” Do not show shade percentages or claim that changing the time changes greenery.
2. **Estimated shade:** use building geometry and solar position for the chosen date/time, adding tree canopy and terrain only to the extent supported by available data. Label results “Estimated shade.” State whether the estimate includes buildings only, buildings and trees, or additional terrain effects.

The first level is a useful development milestone. It does not complete the time-dependent shade feature. If required data is inaccessible, deliver the working greenery prototype and document the precise remaining blocker instead of fabricating shade results.

For the shade model:

- Use a tested solar-position method with explicit azimuth conventions and the route location's time zone. Support both hemispheres and handle high-latitude daylight conditions without assuming Swiss sunrise times or seasons.
- Calculate distances and shadow geometry in a suitable local metric coordinate system. Swiss LV95 is appropriate for the Swiss pilot, not for cities worldwide. Transform explicitly to/from WGS84 for display, normalize source units, and check the meaning and reference datum of heights. Do not buffer longitude/latitude coordinates as though they were metres.
- Use actual height information where available. Mark assumptions about tree crowns, foliage, seasonality, and simplified building forms. Leaf cover must reflect supported local vegetation and seasonal evidence; do not apply a Northern Hemisphere summer calendar globally.
- Sample along walking segments at a documented resolution. Estimate shade at the expected time the walker reaches each segment, or disclose a departure-time snapshot approximation.
- Preserve shaded, sun-exposed, and unknown portions separately. Missing data is not evidence of full sun or full shade.
- Define any percentage's denominator. If displaying shade over the modelled portion, also show how much of the total route is covered by the model.
- Present appropriately rounded estimates. Use qualitative data-quality labels with documented criteria instead of invented confidence probabilities.
- Describe geometric exposure as an estimate for direct sunlight; clouds are not accounted for unless a separate weather model is actually integrated.
- At night, indicate that direct sun is not relevant. Do not recommend a route as cooler solely because every segment has zero direct solar exposure.
- Include geometry outside the route-area boundary where necessary to account for shadows cast into it.

## Routing and recommendation logic

First compute a valid fastest walking route. Use it as the reference for duration and the user's extra-time limit.

Generate genuinely different, legal pedestrian alternatives. Within the time budget, prefer lower estimated time in direct sun when coverage is comparable. Use shorter duration as a tie-breaker. For the greenery prototype, use a separately defined greenery score and name it accordingly.

Do not let unknown coverage improve a route's score. Establish a documented coverage rule: compare adequately modelled routes, or decline to make a shade-based recommendation and explain the missing coverage. Do not silently treat unknown segments as favourable.

Candidate-route generation followed by scoring is acceptable for the first version. Describe the selected route as the best of the alternatives evaluated; do not claim a globally optimal route unless the algorithm establishes it.

Respect pedestrian access and network topology. Never draw straight-line “routes” through buildings, private land, water, railway tracks, or disconnected streets. Snapping a start or destination to the graph must preserve plausible public access. Account for bridges and tunnels rather than joining edges solely because they cross on a 2D map.

Street centreline data may not distinguish opposite pavements. Do not claim side-of-street shade precision unless the walking geometry supports it. Do not claim wheelchair or pushchair suitability solely from a walking route.

Keep scoring parameters, walking-speed assumptions, sampling resolution, detour limits, and model versions explicit and testable. Avoid arbitrary composite “coolness” scores that users cannot interpret.

## Implementation approach

Use the project's existing stack when present. For a new project, a reasonable starting point is TypeScript, React, and MapLibre GL JS, with a small server where needed for data processing or protected service access. Verify current library documentation and select maintained versions during setup.

Choose the simplest architecture that supports real routing and reproducible shade calculations. Keep map display, search, routing, environmental data, and route scoring separate. Use backend or offline geospatial processing when it avoids sending large datasets to a phone; do not add a database or service solely for hypothetical future scale.

Normalize inputs into typed data structures with provenance and explicit missing values. Validate provider responses. Handle timeouts and partial failures. Cache reusable calculations using keys that include city or coverage identifier, date/time, area, model version, and source-data version as appropriate. On city changes, cancel stale requests and clear incompatible route and layer state so results from one city cannot appear in another.

Keep secrets on the server and provide a redacted `.env.example` only for settings that actually exist. Clearly labelled fixtures may support tests and demos, but production failures must never silently substitute synthetic routes or environmental results.

Ask for location permission only when the user invokes the location feature. Do not store precise journey or location history by default. Explain relevant third-party location requests in a short privacy note; do not claim all processing stays on-device if it does not.

## Build sequence and completion criteria

Work in demonstrable increments:

1. Inspect real data samples and prove a valid pedestrian route in a small Zurich area. Compare international pilot candidates and establish the city configuration and coverage register. Document the feasibility findings and chosen model.
2. Establish the visual direction with polished phone and desktop planner views. Deliver a working map, start/destination selection, route comparison, and genuine greenery data using that design system.
3. Implement and validate time-dependent building shade, then supported vegetation effects. Connect those estimates to route selection and the departure-time control.
4. Complete the public website entry and installable app experience. Refine responsive layouts, failure states, coverage explanations, and performance. Inspect screenshots and fix visual defects. Expand coverage when justified by data.
5. Integrate the best-supported international pilot through the shared configuration and data adapters. Validate its advertised capabilities, local time, units, coordinate transformations, city switching, and differences in coverage. Continue to further Swiss and international cities only after their data has been checked.

Keep a short `docs/progress.md` with completed work and the next useful step. Do not leave the project at a plan or a static mockup when implementation is requested.

Before calling the initial shade-enabled version complete, verify:

- A fresh checkout can be installed and run using the README and documented data setup.
- At least one real Zurich origin/destination pair produces a valid route and a meaningfully different alternative where one exists; examples are based on computed results.
- For a release presented as supporting multiple cities, at least one additional city produces real routes and its advertised greenery or shade estimates. An international release must include a validated city outside Switzerland. Report capability levels separately; a greenery-only city is not shade-enabled.
- City switching updates search, map, layers, route results, attribution, and coverage without stale data. Unsupported areas and routes crossing coverage boundaries are handled explicitly.
- Changing departure time changes the shade estimate appropriately in a scenario with moving shadows.
- The extra-time constraint is respected, including the zero-extra-time setting.
- Missing coverage, night-time, disconnected destinations, unsupported areas, denied location access, and unavailable services behave clearly.
- Shadow geometry passes meaningful synthetic checks: direction follows the sun, taller objects cast longer shadows at a fixed elevation, and lower sun produces longer shadows on flat ground.
- Coordinate transformations, city-local time versus device-local time, daylight-saving handling, unit conversion, route scoring, and coverage accounting have focused tests. Include Southern Hemisphere and different-time-zone cases in solar/time tests even if the first international pilot is in Europe.
- Routes have been visually checked against the mapped pedestrian network. Modelled shadows have been checked against independently calculated reference cases or suitable dated observations; a plausible-looking screenshot alone is not validation.
- The public website and main planner share a coherent, distinctive visual identity. The main flow works at phone, tablet, and desktop sizes, with readable attribution and no overlapping controls.
- The time control, route comparison, map styling, typography, and interaction states meet the design quality gate; selected screenshots document the result.
- The site works without installation. PWA installation and standalone launch have been checked on an available supported platform, with any untested platforms listed explicitly.
- Offline behaviour matches the implemented capabilities, and users can recover when the connection returns.
- Relevant build, type, lint, and test checks pass. Report checks that could not be run and why.

Deliver the running website and installable web app, or a local preview with any deployment-dependent checks clearly identified. Include source code, reproducible data preparation, setup and installation instructions, source attribution, selected desktop and phone screenshots, a concise description of the model, the city coverage register, and specific remaining limitations. Report for each city whether it provides greenery recommendations or estimated shade and whether coverage is a pilot area or the full city. List the browser and installation paths actually tested. If a second city's integration is blocked, deliver the working pilot and reusable city support with the exact blocker, without claiming that city is launched.

Keep this instruction file focused on durable product rules. Put detailed implementation decisions and data findings in the project documentation as the app evolves.
