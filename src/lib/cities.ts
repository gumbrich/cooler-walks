import type { City } from './types';
export const cities: City[] = [
  {
    id: 'ch-zurich',
    name: 'Zurich',
    localName: 'Zürich',
    country: 'Switzerland',
    region: 'Zürich',
    center: [8.541, 47.374],
    bounds: [8.529, 47.362, 8.552, 47.385],
    timeZone: 'Europe/Zurich',
    locale: 'de-CH',
    crs: '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs',
    sourceCrs: ['EPSG:4326', 'EPSG:2056 / LN02'],
    status: 'pilot',
    capabilities: {
      greenery: true,
      buildingShade: true,
      treeShade: false,
      terrain: false,
      fountains: false,
      water: true,
    },
    dataVersion: 'zurich-2026-09-28-v2',
    dataUrl: '/data/zurich.json',
    mapUrl: '/data/zurich-map.geojson',
    providers: ['OpenStreetMap', 'City of Zurich', 'swisstopo'],
    translatedNames: { en: 'Zurich', de: 'Zürich' },
    defaultJourney: ['Bahnhofquai', 'Bürkliplatz'],
    coverageLabel: 'Limmat corridor',
    coverageDescription:
      'Central Zurich, from the main station area along the Limmat towards the lake. The boundary is a pilot area, not the whole city.',
    treeNotes:
      'The inventory uses 2021 positions from surveys, screen entry and aerial data. Removals and replacements may be missing. Markers are positions, not measured crowns.',
    buildingNotes:
      'Actual swisstopo footprints and roof-to-ground heights, simplified to flat-ground extrusions. Historical geometry and roof simplification affect the estimate.',
    sourceSummary:
      'Fetched 28 September 2026. Building tiles: 2019; tree locations: 2021, prepared 2022. Fetch dates are not observation dates.',
    sources: [
      {
        label: 'City of Zurich tree inventory',
        url: 'https://data.stadt-zuerich.ch/dataset/geo_bauminventar',
      },
      {
        label: '© swisstopo building models',
        url: 'https://www.swisstopo.admin.ch/en/landscape-model-swissbuildings3d-3-0-beta',
      },
    ],
    mapAttribution:
      '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="https://data.stadt-zuerich.ch/dataset/geo_bauminventar" target="_blank" rel="noreferrer">Stadt Zürich</a> · © swisstopo',
  },
  {
    id: 'fr-paris',
    name: 'Paris',
    localName: 'Paris',
    country: 'France',
    region: 'Île-de-France',
    center: [2.347, 48.855],
    bounds: [2.33, 48.847, 2.366, 48.868],
    timeZone: 'Europe/Paris',
    locale: 'fr-FR',
    crs: 'EPSG:32631',
    sourceCrs: ['EPSG:4326', 'EPSG:2154'],
    status: 'review',
    capabilities: {
      greenery: false,
      buildingShade: false,
      treeShade: false,
      terrain: false,
      fountains: false,
      water: false,
    },
    dataVersion: null,
    dataUrl: null,
    mapUrl: null,
    providers: ['Ville de Paris', 'IGN', 'OpenStreetMap'],
    translatedNames: { en: 'Paris', fr: 'Paris' },
    defaultJourney: null,
    mapAttribution: '',
    coverageLabel: 'Under review',
    coverageDescription: 'A central Paris pilot is under investigation.',
    treeNotes:
      'A sample of the municipal tree inventory has been checked; no runtime data is integrated.',
    buildingNotes: 'Building geometry has not yet been integrated.',
    sourceSummary: 'Research only. No route recommendations are available.',
    sources: [
      {
        label: 'Ville de Paris trees',
        url: 'https://opendata.paris.fr/explore/dataset/les-arbres/',
      },
    ],
    reviewSummary:
      'We’ve verified a sample of Paris’s public tree inventory. Pedestrian routes and building geometry still need integration and validation before we can recommend a walk here.',
  },
];
// Each pilot advertises only the capabilities validated with its own sources.
cities.push(
  {
    id: 'de-munich',
    name: 'Munich',
    localName: 'München',
    country: 'Germany',
    region: 'Bavaria',
    center: [11.572, 48.1405],
    bounds: [11.56, 48.135, 11.582, 48.146],
    timeZone: 'Europe/Berlin',
    locale: 'de-DE',
    crs: '+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs',
    sourceCrs: ['EPSG:4326', 'EPSG:25832 / DHHN2016'],
    status: 'pilot',
    capabilities: {
      greenery: true,
      buildingShade: true,
      treeShade: false,
      terrain: false,
      fountains: false,
      water: true,
    },
    dataVersion: 'munich-2026-09-28-v1',
    dataUrl: '/data/munich.json',
    mapUrl: '/data/munich-map.geojson',
    providers: ['OpenStreetMap', 'Bayerische Vermessungsverwaltung'],
    translatedNames: { en: 'Munich', de: 'München' },
    defaultJourney: ['Karlsplatz (Stachus)', 'Odeonsplatz'],
    mapAttribution:
      '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="https://geodaten.bayern.de/opengeodata/" target="_blank" rel="noreferrer">Bayerische Vermessungsverwaltung · CC BY 4.0</a>',
    coverageLabel: 'Old town west',
    coverageDescription:
      'A bounded old-town pilot around Karlsplatz, Frauenkirche and Odeonsplatz. Building coverage comes from one 2 km tile; edge and long-shadow gaps remain unknown.',
    treeNotes:
      'Automatically detected individual-tree positions from Bavaria’s 2024 Munich dataset. False detections can occur near roof edges, shadows and power lines. These are not surveyed trunk centres or measured crowns.',
    buildingNotes:
      'Bavarian LoD2 ground surfaces and actual relative heights, simplified to flat-ground extrusions. Data dates differ by building; complex roofs are generalized.',
    sourceSummary:
      'Fetched 28 September 2026. Munich tree product: 2024. Building index published 22 September 2026; per-building creation and outline dates are retained in the data manifest. Publication is not observation date.',
    sources: [
      {
        label: 'Bavaria individual trees',
        url: 'https://geodaten.bayern.de/opengeodata/OpenDataDetail.html?pn=einzelbaeume',
      },
      {
        label: 'Bavaria LoD2 buildings · CC BY 4.0',
        url: 'https://geodaten.bayern.de/opengeodata/OpenDataDetail.html?pn=lod2',
      },
    ],
  },
  {
    id: 'us-cambridge-ma',
    name: 'Cambridge, MA',
    localName: 'Cambridge, MA',
    country: 'United States',
    region: 'Massachusetts',
    center: [-71.12, 42.375],
    bounds: [-71.132, 42.367, -71.108, 42.384],
    timeZone: 'America/New_York',
    locale: 'en-US',
    crs: '+proj=utm +zone=19 +datum=WGS84 +units=m +no_defs',
    sourceCrs: ['EPSG:4326', 'EPSG:2249'],
    status: 'pilot',
    capabilities: {
      greenery: true,
      buildingShade: false,
      treeShade: false,
      terrain: false,
      fountains: false,
      water: true,
    },
    dataVersion: 'cambridge-2026-09-28-v1',
    dataUrl: '/data/cambridge.json',
    mapUrl: '/data/cambridge-map.geojson',
    providers: ['OpenStreetMap / Geofabrik', 'City of Cambridge GIS'],
    translatedNames: { en: 'Cambridge, Massachusetts' },
    defaultJourney: ['Brattle Street', 'Cambridge Street'],
    mapAttribution:
      '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="https://www.cambridgema.gov/gis/gisdatadictionary/environmental/environmental_streettrees" target="_blank" rel="noreferrer">City of Cambridge GIS · PDDL</a>',
    coverageLabel: 'Harvard Square area',
    coverageDescription:
      'Harvard Square and nearby Cambridge streets within the displayed boundary. Greenery and water proximity are available; sun and shade estimates are not yet enabled.',
    treeNotes:
      'City-maintained tree records include municipal, university and other sites. Only records explicitly marked “Tree” are retained; stumps, vacant sites and unknown status are excluded. Private trees may be missing.',
    buildingNotes:
      'Building footprints and height attributes were inspected, but missing heights and coverage near the municipal boundary need explicit masks before sun/shade estimates can be enabled.',
    sourceSummary:
      'Fetched 28 September 2026. Municipal tree catalogue modified 6 July 2026; individual survey dates vary. OSM uses the dated 27 September 2026 Geofabrik extract. No time-dependent environmental estimate is advertised here.',
    sources: [
      {
        label: 'Cambridge trees · public domain',
        url: 'https://www.cambridgema.gov/gis/gisdatadictionary/environmental/environmental_streettrees',
      },
      {
        label: 'Cambridge building data under review',
        url: 'https://www.cambridgema.gov/gis/gisdatadictionary/basemap/basemap_buildings',
      },
      {
        label: 'Geofabrik Massachusetts extract',
        url: 'https://download.geofabrik.de/north-america/us/massachusetts.html',
      },
    ],
  },
  {
    id: 'ch-basel',
    name: 'Basel',
    localName: 'Basel',
    country: 'Switzerland',
    region: 'Basel-Stadt',
    center: [7.59, 47.559],
    bounds: [7.58, 47.547, 7.606, 47.569],
    timeZone: 'Europe/Zurich',
    locale: 'de-CH',
    crs: cities[0].crs,
    sourceCrs: ['EPSG:4326', 'EPSG:2056'],
    status: 'pilot',
    capabilities: {
      greenery: true,
      buildingShade: false,
      treeShade: false,
      terrain: false,
      fountains: false,
      water: true,
    },
    dataVersion: 'basel-2026-09-28-v1',
    dataUrl: '/data/basel.json',
    mapUrl: '/data/basel-map.geojson',
    providers: ['OpenStreetMap', 'Geodaten Kanton Basel-Stadt'],
    translatedNames: { en: 'Basel', de: 'Basel', fr: 'Bâle' },
    defaultJourney: ['Aeschenplatz', 'Mittlere Rheinbrücke'],
    mapAttribution:
      '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="https://data.bs.ch/explore/dataset/100052/" target="_blank" rel="noreferrer">Geodaten Kanton Basel-Stadt · CC BY 4.0</a>',
    coverageLabel: 'Old town & Rhine',
    coverageDescription:
      'The central old town and Rhine corridor inside the pilot boundary. Greenery and water proximity only; no sun/shade recommendations yet.',
    treeNotes:
      'The cantonal register covers trees maintained by Basel’s Stadtgärtnerei and Riehen. The pilot uses actual point locations; private and otherwise unrecorded trees may be absent. Planting dates are not survey dates.',
    buildingNotes:
      'A local building-height extract has not yet been integrated. Basemap building shapes are not used as shade geometry.',
    sourceSummary:
      'Fetched 28 September 2026. Tree catalogue modified 26 September 2026, with daily processing; those dates do not establish when each tree was observed.',
    sources: [
      {
        label: 'Basel-Stadt tree register · CC BY 4.0',
        url: 'https://data.bs.ch/explore/dataset/100052/',
      },
    ],
  },
);
export const getCity = (id: string) => cities.find((c) => c.id === id) ?? cities[0];
