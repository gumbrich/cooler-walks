# Design direction

## Munich · 0.23.0

Munich uses the same paired Shade/Sun buttons, quiet/flat/water/access wishes, 0/5/10/15-minute shortcuts and minute slider as Zurich. No second interaction model is introduced. Its method dialog names Munich's actual capabilities and gaps. Implemented Tempo 30 context colours corroborated street fragments, and the legend omits unavailable 20 km/h or ordered-zone categories. Source attribution remains visible in English and German. Phone route fitting reserves the measured legend and attribution heights so the longer source credit cannot cover endpoint markers.

The current preference design supersedes the historical numbered/main-priority description below: optional wishes are unnumbered and can be combined. Actual Munich desktop, phone, tablet, error, installed-PWA and Android emulator screenshots accompany this release.

## Lean preference controls · 0.20.0

Replaced competing toggle rows with one main-priority selector. Optional wishes are folded under “More preferences”; their displayed order matches ranking. Sun and shade are mutually exclusive. A compact computed comparison explains trade-offs, and unavailable layers are named. Tree geometry assumptions sit under a separate model disclosure. The same components serve web, installed PWA and native shells.

Tempo 30/20 highlights follow clipped road geometry; solid neighbourhood fills are removed. The legend distinguishes inferred implemented street context from unconfirmed legal-order boundaries. Its measured height reserves space above the time control. Password entry uses a small EN/DE form in the existing warm/forest palette, served by the edge gate independently of app assets.

An everyday walking atlas: precise local cartography, a warm paper surface, deep forest ink and a generous serif headline. The map is actual geography and carries the visual identity; no generated place photography or decorative map routes are used.

## Tokens

The revised mark is an open C shaped like a continuous route, with an amber start and green shaded section on forest ink. It replaces the original bent-arrow mark and is shared by the site, favicon and install icons. Water preference uses restrained blue-green accents and remains visually distinct from shade. Intermediate stops have numbered map markers and ordered controls between start and destination.

- Paper `#f8f6ef`, ink `#193d32`, route `#214e3a`, foliage `#91b681`, water `#a9c9cd`, sunlight `#dfa848`.
- Self-hosted DM Sans for interface and measurements; DM Serif Display for expressive headings. Local Open Sans Semibold glyphs label map streets.
- 4/8 px spacing rhythm, 7–14 px control and panel corners, restrained green-tinted shadows. Visible brown focus outline remains separate from route selection.
- Route selection uses a dark stroke with cream casing; sun appears as amber dots and unknown as outlined dots. The selected route remains distinguishable independently of exposure.
- Reduced-motion mode removes transitions and route-fit animation. Calculations run off the main thread and stale worker messages are ignored.

## Composition

Entry: an editorial headline beside a genuine Zurich map and live computed example, then concise explanation. The planner is one action away; direct links and returning visitors bypass the introduction.

Desktop: the trip editor and compact comparison occupy a side panel, with most space reserved for the map. A floating time card makes local time and date visible. The route card shows rounded duration, distance, the environmental metric and its coverage.

Phone: the map stays above an intentionally compact sheet. Route endpoints collapse to a readable trip summary, with an explicit editor control. Departure controls sit between the compact trip summary and route results; the page can scroll rather than hide content behind a fixed-height sheet. There is no sheet-drag gesture to conflict with map gestures. Safe-area padding protects the bottom controls.

Search supports keyboard arrows, Enter and Escape. Route results remain available as text without WebGL. Geolocation is opt-in, errors preserve input, and the unsupported city has a designed state. Method and coverage use a native modal dialog with focus handling.

Screenshots at phone, tablet and desktop sizes are retained in `docs/screenshots/`. Their review and browser-interaction results are recorded in `docs/platform.md`. Screenshots alone do not establish physical-device usability or field accuracy.

## Sun preference and international pilots

The sunlight selector pairs labelled leaf/sun icons with native radio inputs. Forest green signals shade, warm amber signals sun; selected cards carry a checkmark and explicit metric labels. Sun/shade does not change route-selection casing on the map. Cambridge and Basel display a greenery capability note and omit unsupported sunlight controls. Source views and map signatures follow the selected city.

Additional cities share the atlas palette while displaying their actual streets, waterways, buildings and source tree points. The city picker identifies Cambridge as MA; its time control uses New York local time. Immediate route reframing on viewport changes keeps phone endpoints visible, while departure-time scrubbing preserves the map position.

## Larger areas and native phones

A “Show whole coverage” control fits the full supported extent. The dashed boundary uses the real Cambridge municipal polygon; unsupported surroundings are muted without removing geographic context. At city scale, only large parks are labelled, street labels wait until neighbourhood zoom, and tree dots become smaller and lighter. This avoids the dense label/vegetation clutter found during screenshot review. Detailed walking zoom keeps the original cartographic hierarchy.

Native apps open directly to the planner, share the same icon and launch artwork, replace browser installation guidance with an app information view, and respect OS safe areas. They preserve the responsive bottom-sheet composition and ordinary text zoom. Native and physical-device verification is documented separately from browser viewport captures.

## Offline atlas

The download manager uses the same paper/forest palette and practical sans-serif headings, with city-labelled cards, readable pack sizes and explicit saved/included states. Coverage and source details expand in place. Native and browser downloads share progress, cancellation, recovery and removal controls with 44 px targets. The compact Munich area uses the ordinary map and route comparison; its smaller boundary is visible and labelled. Actual desktop, phone, tablet error-state and native Android screenshots were inspected. Checks include the dialog's automated accessibility scan, a downloaded-area map render and preservation of the open walk after removal.

## German and calmer-street mode

A compact EN/DE select sits beside the city selector on desktop and phone. It changes interface text and numeric formatting without moving the map or resetting the trip. German copy wraps naturally in controls, source dialogs and comparisons; route-local time stays explicit. Public German pages retain the same typography and spacing, with their own metadata and links.

The Zurich calmer-street control uses an olive accent and a labelled street-cone icon. The selected comparison leads with metres near mapped main roads. Its bar shows known distance away from main roads over the whole route; a secondary line shows path/pedestrian/restricted-street share separately. Map amber dots become main-road proximity **only in this mode**, and the legend changes with them; outlined unknown dots and route selection casing remain distinct. The time helper states that street context is static. Water and calmer-street priorities are exclusive, and their limits are explained where selected.

Desktop/phone German entry and route screenshots, tablet unsupported/error states and native captures are retained with the existing English set. Screenshot inspection corrected placeholder interpolation, a German-only map conditional and clipping of the hidden skip link in full-page captures; keyboard focus keeps the skip link available.

## Historical count evidence

A compact disclosure below the selected route separates measured traffic evidence from green route scores. Numbered blue squares connect source measuring positions with direction-specific values; short leader lines keep labels clear of route endpoint markers on phones without relocating the source point. Values use historical-year and weekday/hour labels, measured-day denominators and a 24-hour profile with an explicitly independent vertical scale. Missing values use dashed outlines; no-counter routes state that traffic is unknown. The existing route/time controls remain the primary interaction. English desktop, German phone and tablet missing-data screenshots document the actual implementation.

## Zurich focus · 0.7

The city selector, coverage view and downloads now prioritize Switzerland; every other integrated city has a visible Beta label. Zurich keeps the existing atlas identity, with a clearer address-first trip form. Map pickers have visible text labels, a cancellable prompt, and a compact contextual card for start/destination/stops when the map is tapped. Long official address labels truncate only in the compact trip summary; the editing field and suggestion list preserve the name. Outside-area addresses remain visible and are marked honestly. The phone map remains visible above the route sheet. Timeline tick contrast was strengthened after an actual phone accessibility scan.

## Zurich north and west · 0.8

The existing atlas design now displays the larger, municipality-clipped Zurich boundary. The whole-area control exposes the reach to Oerlikon and Altstetten; detailed planning retains readable street labels, separate tree positions and route casing. The coverage label is translated in both languages. Actual desktop Altstetten, German phone Oerlikon and tablet outside-area screenshots were inspected; the existing spacing and controls remain usable. Unknown open structures and municipal-edge gaps stay visually distinct from sun and shade.

For the expanded extent, neighbourhood labels use actual OSM names. Individual tree dots appear at street scale (zoom 14+) and load only around the viewport; the complete inventory still informs route greenery. This keeps phone maps lighter without moving or inventing trees. Map and route workers release resources explicitly during reload.

City overview maps show neighbourhoods, waterways, parks and the street structure. Building footprints, individual trees and minor paths appear from zoom 14. This reduces clutter and expensive full-city geometry rendering; detailed route views and the complete routing/shadow model retain all data. The Linux coverage-view check exposed the need for this map hierarchy.

## Arrival-aware shadows · 0.9.0

Route cards now include a compact clock row with estimated arrival in the route city’s time zone. The arrival label includes a date when the walk crosses midnight. The existing warm/green visual hierarchy and map gestures stay intact. A distinct low-sun/night transition message replaces unsupported sun/shade comparisons; the timeline explains the changing-light state. Method copy in both languages explains cumulative walking time through stops without suggesting pauses or crossing waits are modelled. Desktop, German phone and tablet transition captures are linked from the README.

## Detailed-model coverage · 0.10.0

A dotted plum line (`#776075`) marks the central Zurich 3D pilot separately from the green walking boundary and sun/shade encoding. Route cards show the share inside this pilot as a small secondary line, alongside overall model coverage. The phone map label is shorter and fit padding leaves the start marker clear. Method text distinguishes roof geometry, LiDAR receiver heights and unsupported foliage/hill effects in English and German. Actual desktop/phone planner and tablet method captures are in `docs/screenshots/*-3d-*.png`.

## Street breakdown · 0.11.0

A compact disclosure under the selected calmer route shows six street-context distances, from paths/restricted streets to unknown segments. A proportional bar supplements the text; labels and hatching make colour unnecessary. Tempo-30 and Begegnungszone streets stay separate from pedestrian paths. The visible field-validation note and expanded explanation distinguish mapped access regimes from observed vehicle volume. Keyboard users open the native disclosure with Enter. Nearby counter cards now show their own estimated passing time and corresponding historical weekday/hour. Actual 1440 px desktop, 390 px phone and 768 px tablet views were inspected in English/German; automated contrast and overflow checks pass.

## Plain language and simpler layouts · 0.12.0

Use short, concrete language in both English and German. Name the action or the information: “Plan a route” / “Route planen”, “Departure” / “Startzeit”, “Offline maps” / “Offline-Karten”. Avoid conversational invitations, slogans above headings and poetic introductions to ordinary controls. The public headline explains the purpose; the planner begins with the trip. Help and Privacy follow the same approach.

The public entry now has one headline, one paragraph, one main action and a computed map example. The redundant promotional section is removed. Serif type remains on the public headline and city name; utility headings use DM Sans.

Each route card leads with duration, distance, arrival and the metric for the chosen preference. Coverage and model limitations remain visible; extra street/water figures and the number of evaluated candidates sit in the route details. Traffic evidence uses flat disclosures rather than another stack of filled cards.

On phones, the departure control sits immediately above the comparison. A single “Edit” / “Ändern” button opens the trip editor. There is no decorative drag handle. The shorter map has compact city labels and revised route framing; endpoint markers must stay clear of the header and legend. Resizing preserves the departure and renders exactly one time control. The warm palette, labelled controls, large touch targets and visible keyboard focus remain.

## Expanded Zurich 3D coverage · 0.13.0

The detailed model now shares the existing walking boundary. Removed the smaller plum boundary and retained a compact “3D buildings · experimental” key. Route details keep geographic model share separate from classified sun/shade coverage. A failed tile download offers a plain-language retry that preserves the trip; Help and Privacy explain the on-demand tiles in EN/DE.

## Official zone layer · 6 October 2026

The Zurich map's 30/20 button controls a separate optional layer. Muted violet (`#8272ae`) identifies Tempo 30 and rose (`#aa657d`) Begegnungszonen; fills stay at 17% below buildings, streets and route strokes. Solid outlines mean implemented city zones; dashed outlines mean cantonal legal orders with unknown implementation. Text labels and clicked-zone details carry the distinction independently of colour. The layer never recolours a route's exposure or changes its scores.

Desktop keeps a compact horizontal key beneath the departure control; tablet reserves more space beneath that control. On phones, enabling the layer expands the map slightly and adjusts route fitting so both endpoints remain above the legend. The button has a visible 30/20 label, an EN/DE accessible name, keyboard operation and pressed state. Older downloaded maps without polygons disable it with an update hint.

## Pavement pilot · 0.14.0

A compact **Try pavement pilot / Trottoir-Pilot testen** action opens the bounded street-side network and clearly labels Talacker–Bahnhofstrasse. Thin teal source paths and dashed crossings sit beneath narrower selected/alternative route strokes, retaining separate sun/unknown encoding. Cards name municipal crossing sections without implying signal counts. Phones offer **Enlarge map / Karte vergrössern** so the two pavements can be inspected; the map scrolls into view and refits the route. Normal planning returns through **Zurich map / Zürich-Karte**. Screenshots cover English desktop, German phone, enlarged phone map, tablet and an outside-area error.

## Tree pilot · 0.16.0

An optional leaf control uses the existing form and green palette. The small lakeshore source boundary is dotted and separately labelled. Route summaries say “potential shade” / “möglicher Schatten” and show model coverage beside the percentage; the full-foliage assumption remains visible when the phone editor is collapsed. Detailed building and additional tree lengths live under “About this walk”. Missing source data retains an explicit retry/error state. Desktop, phone, tablet and error screenshots are linked in [platform.md](platform.md).

## Partial tree-shade coverage · 0.17.0

Below 95% known coverage, tree-scenario cards display estimated shaded/sunny distance instead of a percentage of a shrinking known denominator. Exposure bars use the whole walk: shade/sun are solid, unknown is hatched and labelled in metres, and any night portion is neutral. The source/coverage caption and recommendation gate remain visible. The change is shared by English, German, website, PWA and native clients.

## Pavement endpoint selection · 0.18.0

The optional municipal network now retains the user's trip instead of opening a demo. Address or map anchors use a compact numbered list paired with 44 px map buttons. Forest/petrol markers distinguish the walking choices from a small amber location anchor. The map zooms to street width while the user chooses, and returns to the calculated route afterwards. Text names the selected address and explains that access from it is outside the route. Source paths remain visible, including mapped crossing sections. The control uses the network's name rather than a generic pilot label; model uncertainty remains in method/coverage notes.

## Elevation preference · 0.19.0

A single optional “Prefer flatter routes / Flachere Wege bevorzugen” row follows the existing route preferences. Enabling it clears water/calm ranking and briefly explains the priority. Cards show rounded ascent/descent beside a mountain symbol; an expandable profile below the results keeps phone planning compact. A thin forest-green line shows known terrain only, with gaps instead of invented bridge heights. Both controls and detailed explanations have EN/DE text. Unknown coverage and the fixed-speed walking-time limitation stay explicit. Source-method detail lives in the information view and project documentation.

## 0.21.0: light modes and simpler planning

Two adjacent 50 px Shade/Sun buttons replace the priority selector and stay visible on mobile results. The cool shade surface is `#f1f5ee` with forest `#214e3a`; sunlight uses `#fff8e9` and selected amber `#efc36f`. Both keep dark, legible text and identical map exposure semantics. Colour transitions respect reduced motion. The 0/5/10/15 minute presets sit above one uncluttered native range input with a live numeric value; keyboard arrows adjust one minute and clicking the track jumps directly.

Optional wishes use a compact two-column checkbox layout inside one disclosure. Numbered ranks and arrow sequences are removed. Trees and municipal pavement routing are standard in Zurich, removing two setup controls. Access restrictions stay distinct from aesthetic wishes, with concise limitations beside the option and results. Desktop, phone and tablet captures are in `docs/screenshots/*simple*`; screenshots verify layout, while browser/Android interaction checks are recorded separately.

## 0.21.1: make the light choice's effect visible

A small live status directly under Shade/Sun states the available recommendation's estimated benefit, or explains why the choice cannot guide this trip. Incomplete exposure, night, low sun and dawn/dusk receive a restrained vertical rule rather than a large alert. Zero detour and no useful alternative are explained in the same place. These states stay visible with Calm streets and in the collapsed phone results view. Method details and coverage figures remain beside the route cards. Actual inspected captures are in `docs/screenshots/light-choice-*`.

## 0.22.0: usable light choices with a visible model basis

The two light buttons now control useful autumn routes, including partial observations. A short second status line names missing tree coverage when the comparison uses buildings. The result caption, card denominator and map legend agree on that basis. Partial comparisons show sun-distance/share ranges instead of hiding uncertainty in a single figure; hatched map/card segments remain unknown. Tree evidence for a building-only path is retained in the expandable route details. No new planning controls are required. See [the routing repair](shade-routing-recovery.md).

## Munich expansion · 0.24.0

The larger city uses the same compact planner. Desktop/phone route views, public entry, tablet method view and a missing-data state were rendered and inspected. The whole-coverage screenshot revealed that fixed map-pan margins overrode fit padding for larger areas; margins now scale with the city extent so the boundary fits above the departure card. Routing coverage remains defined by source geometry. Screenshots: `munich-expanded-*.png`.
