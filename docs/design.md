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

Phone: the map stays above an intentionally compact sheet. Route endpoints collapse to a readable trip summary, with an explicit editor control. Time controls sit immediately after the route sheet; the page can scroll rather than hide content behind a fixed-height sheet. There is no sheet-drag gesture to conflict with map gestures. Safe-area padding protects the bottom controls.

Search supports keyboard arrows, Enter and Escape. Route results remain available as text without WebGL. Geolocation is opt-in, errors preserve input, and the unsupported city has a designed state. Method and coverage use a native modal dialog with focus handling.

Screenshots at phone, tablet and desktop sizes are retained in `docs/screenshots/`. Their review and browser-interaction results are recorded in `docs/platform.md`. Screenshots alone do not establish physical-device usability or field accuracy.

## Sun preference and international pilots

The sunlight selector pairs labelled leaf/sun icons with native radio inputs. Forest green signals shade, warm amber signals sun; selected cards carry a checkmark and explicit metric labels. Sun/shade does not change route-selection casing on the map. Cambridge and Basel display a greenery capability note and omit unsupported sunlight controls. Source views and map signatures follow the selected city.

Additional cities share the atlas palette while displaying their actual streets, waterways, buildings and source tree points. The city picker identifies Cambridge as MA; its time control uses New York local time. Immediate route reframing on viewport changes keeps phone endpoints visible, while departure-time scrubbing preserves the map position.

## Larger areas and native phones

A “Show whole coverage” control fits the full supported extent. The dashed boundary uses the real Cambridge municipal polygon; unsupported surroundings are muted without removing geographic context. At city scale, only large parks are labelled, street labels wait until neighbourhood zoom, and tree dots become smaller and lighter. This avoids the dense label/vegetation clutter found during screenshot review. Detailed walking zoom keeps the original cartographic hierarchy.

Native apps open directly to the planner, share the same icon and launch artwork, replace browser installation guidance with an app information view, and respect OS safe areas. They preserve the responsive bottom-sheet composition and ordinary text zoom. Native and physical-device verification is documented separately from browser viewport captures.
