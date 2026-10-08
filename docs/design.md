# Design direction

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
