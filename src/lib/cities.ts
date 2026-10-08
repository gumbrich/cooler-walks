import type { Bounds, City, Point } from './types';
import cambridgeCoverage from './coverage/cambridge.json';
import zurichExtract from './coverage/zurich-extract.json';
import zurichCoverage from './coverage/zurich.json';
import canopyCatalog from '../generated/canopy-catalog.json';
export const cities: City[] = [
  {
    id: 'ch-zurich',
    name: 'Zurich',
    localName: 'Zürich',
    country: 'Switzerland',
    region: 'Zürich',
    center: [8.541, 47.374],
    bounds: zurichExtract.routeBounds as Bounds,
    coverage: zurichCoverage as Point[][][],
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
      trafficCalming: true,
      trafficZones: true,
      vehicleCounts: true,
      addresses: true,
    },
    dataVersion: zurichExtract.version,
    dataUrl: '/data/zurich.json',
    mapUrl: '/data/zurich-map.geojson',
    elevation: { resolution: 2 },
    pavementPilot: {
      dataUrl: '/data/zurich-pavements.json',
      version: 'zurich-pavements-2026-10-06-v2',
    },
    canopyPilot: {
      ...canopyCatalog,
      format: 'library',
      coverage: zurichCoverage[0][0] as Point[],
    },
    detailedShade: {
      format: 'library',
      dataUrl: '/data/zurich-shade-library.json',
      version: 'zurich-roofs-dtm-library-2026-09-30-v2',
      crs: 'EPSG:2056',
      verticalDatum: 'LN02',
      coverage: zurichCoverage[0][0] as Point[],
    },
    providers: ['OpenStreetMap', 'City of Zurich', 'Kanton Zürich', 'swisstopo'],
    translatedNames: { en: 'Zurich', de: 'Zürich' },
    defaultJourney: ['Bahnhofquai', 'Bürkliplatz'],
    coverageLabel: 'Zurich · centre, north & west',
    coverageDescription:
      'From Altstetten and Oerlikon through Höngg, Wipkingen and the city centre to Wiedikon and Seefeld. The dashed boundary shows the supported walking area, not the entire municipality. Building-model gaps and long shadows at the edge remain unknown.',
    treeNotes:
      'The inventory uses 2021 positions from surveys, screen entry and aerial data. Removals and replacements may be missing. Markers are positions, not measured crowns.',
    buildingNotes:
      '3D roofs and facades with LiDAR ground elevations cover the supported Zurich walking area. Buildings date from 2019; ground elevations from 2021–2022. Missing ground and bridge heights stay unknown. These estimates still need field validation.',
    sourceSummary:
      'Walking network, tree extract and official addresses fetched 30 September 2026. Building tiles: 2019; tree locations: 2021, prepared 2022. City traffic zones fetched 29 September 2026; cantonal zone orders 6 October 2026. Fetch dates are not observation dates.',
    sources: [
      {
        label: 'Kanton Zürich classified LiDAR · canopy pilot',
        url: 'https://geolion.zh.ch/geodatensatz/4289',
      },
      {
        label: 'Zurich pavement and crossing network · CC0',
        url: 'https://data.stadt-zuerich.ch/dataset/geo_fuss__und_velowegnetz',
      },
      {
        label: 'Zurich municipal boundary · CC0',
        url: 'https://data.stadt-zuerich.ch/dataset/ktzh_gemeindegrenzen__ogd_',
      },
      {
        label: 'Official Zurich building addresses',
        url: 'https://data.stadt-zuerich.ch/dataset/geo_adressen_stadt_zuerich',
      },
      {
        label: 'Zurich hourly vehicle counts · 2025 reference',
        url: 'https://data.stadt-zuerich.ch/dataset/sid_dav_verkehrszaehlung_miv_od2031',
      },
      {
        label: 'City of Zurich traffic zones',
        url: 'https://data.stadt-zuerich.ch/dataset/geo_verkehrszonen',
      },
      {
        label: 'Canton Zurich Tempo 30 / 20 zones · legal orders',
        url: 'https://geo.zh.ch/data/maps/845c3961-b036-49b3-a2b6-e23273917a25',
      },
      {
        label: 'City of Zurich tree inventory',
        url: 'https://data.stadt-zuerich.ch/dataset/geo_bauminventar',
      },
      {
        label: 'Kanton Zürich LiDAR ground model · open data',
        url: 'https://geolion.zh.ch/geodatensatz/4269.html',
      },
      {
        label: '© swisstopo building models',
        url: 'https://www.swisstopo.admin.ch/en/landscape-model-swissbuildings3d-3-0-beta',
      },
    ],
    mapAttribution:
      '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="https://data.stadt-zuerich.ch/dataset/geo_bauminventar" target="_blank" rel="noreferrer">Stadt Zürich</a> · <a href="https://geolion.zh.ch/geodatensatz/4269.html" target="_blank" rel="noreferrer">Kanton Zürich</a> · © swisstopo',
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
    beta: true,
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
    bounds: [11.558, 48.133, 11.601, 48.158],
    timeZone: 'Europe/Berlin',
    locale: 'de-DE',
    crs: '+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs',
    sourceCrs: ['EPSG:4326', 'EPSG:25832 / DHHN2016'],
    status: 'pilot',
    beta: true,
    capabilities: {
      greenery: true,
      buildingShade: true,
      treeShade: false,
      terrain: false,
      fountains: false,
      water: true,
    },
    dataVersion: 'munich-2026-09-29-v2',
    dataUrl: '/data/munich.json',
    mapUrl: '/data/munich-map.geojson',
    providers: ['OpenStreetMap', 'Bayerische Vermessungsverwaltung'],
    translatedNames: { en: 'Munich', de: 'München' },
    defaultJourney: ['Karlsplatz (Stachus)', 'Odeonsplatz'],
    mapAttribution:
      '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="https://geodaten.bayern.de/opengeodata/" target="_blank" rel="noreferrer">Bayerische Vermessungsverwaltung · CC BY 4.0</a>',
    coverageLabel: 'Old town, Lehel & gardens',
    coverageDescription:
      'An expanded central pilot from Karlsplatz across the old town to Lehel and the southern English Garden. Four adjacent 2 km building tiles support shade estimates; edge and long-shadow gaps remain unknown.',
    treeNotes:
      'Automatically detected individual-tree positions from Bavaria’s 2024 Munich dataset. False detections can occur near roof edges, shadows and power lines. These are not surveyed trunk centres or measured crowns.',
    buildingNotes:
      'Bavarian LoD2 ground surfaces and actual relative heights, simplified to flat-ground extrusions. Conflicting heights and unsupported elevated structures are masked as unknown; complex roofs and slopes remain limitations.',
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
    bounds: [-71.161, 42.352, -71.063, 42.405],
    coverage: cambridgeCoverage as Point[][][],
    timeZone: 'America/New_York',
    locale: 'en-US',
    crs: '+proj=utm +zone=19 +datum=WGS84 +units=m +no_defs',
    sourceCrs: ['EPSG:4326', 'EPSG:2249'],
    status: 'pilot',
    beta: true,
    capabilities: {
      greenery: true,
      buildingShade: false,
      treeShade: false,
      terrain: false,
      fountains: false,
      water: true,
    },
    dataVersion: 'cambridge-2026-09-29-v2',
    dataUrl: '/data/cambridge.json',
    mapUrl: '/data/cambridge-map.geojson',
    providers: ['OpenStreetMap / Geofabrik', 'City of Cambridge GIS'],
    translatedNames: { en: 'Cambridge, Massachusetts' },
    defaultJourney: ['Brattle Street', 'Cambridge Street'],
    mapAttribution:
      '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="https://www.cambridgema.gov/gis/gisdatadictionary/environmental/environmental_streettrees" target="_blank" rel="noreferrer">City of Cambridge GIS · PDDL</a>',
    coverageLabel: 'Cambridge city boundary',
    coverageDescription:
      'The municipal boundary now includes Harvard, Central and Kendall squares, North Cambridge and Fresh Pond. Routes stay on the Cambridge side of the boundary. Greenery uses recorded trees, not a complete canopy survey; shade is not yet enabled.',
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
    bounds: [7.576, 47.541, 7.611, 47.576],
    timeZone: 'Europe/Zurich',
    locale: 'de-CH',
    crs: cities[0].crs,
    sourceCrs: ['EPSG:4326', 'EPSG:2056'],
    status: 'pilot',
    beta: true,
    capabilities: {
      greenery: true,
      buildingShade: false,
      treeShade: false,
      terrain: false,
      fountains: false,
      water: true,
    },
    dataVersion: 'basel-2026-09-29-v2',
    dataUrl: '/data/basel.json',
    mapUrl: '/data/basel-map.geojson',
    providers: ['OpenStreetMap', 'Geodaten Kanton Basel-Stadt'],
    translatedNames: { en: 'Basel', de: 'Basel', fr: 'Bâle' },
    defaultJourney: ['Aeschenplatz', 'Mittlere Rheinbrücke'],
    mapAttribution:
      '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="https://data.bs.ch/explore/dataset/100052/" target="_blank" rel="noreferrer">Geodaten Kanton Basel-Stadt · CC BY 4.0</a>',
    coverageLabel: 'Central Basel & Kleinbasel',
    coverageDescription:
      'An expanded central pilot spanning Basel SBB, the old town, the Rhine and more of Kleinbasel. Greenery and water proximity are available within the dashed boundary; no sun/shade recommendations yet.',
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
export const cityOptions = [...cities].sort(
  (a, b) =>
    Number(a.status === 'review') - Number(b.status === 'review') ||
    Number(a.beta === true) - Number(b.beta === true) ||
    Number(b.country === 'Switzerland') - Number(a.country === 'Switzerland'),
);
