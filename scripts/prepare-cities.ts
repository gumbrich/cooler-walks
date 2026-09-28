import fs from 'node:fs';
import crypto from 'node:crypto';
import type { FeatureCollection, Feature } from 'geojson';
import { getCity } from '../src/lib/cities';
import { geographic, inBounds } from '../src/lib/geo';
import { isSurfaceWater } from '../src/lib/water';
import type { Bounds, Building, PilotData, Point, Tree } from '../src/lib/types';
import { prepareOSM, type OSMData } from './lib/osm';

const read = (name: string) => JSON.parse(fs.readFileSync(`data/raw/${name}`, 'utf8'));
const hash = (name: string) =>
  crypto
    .createHash('sha256')
    .update(fs.readFileSync(`data/raw/${name}`))
    .digest('hex');
const identifiers = { cambridge: 'us-cambridge-ma', basel: 'ch-basel', munich: 'de-munich' };
const chosen = process.argv[2];
for (const [slug, identifier] of Object.entries(identifiers)) {
  if (chosen && chosen !== slug) continue;
  const city = getCity(identifier);
  const raw = read(`${slug}-osm.json`) as OSMData;
  const extraAreas =
    slug === 'cambridge'
      ? (read('cambridge-areas.geojson') as FeatureCollection).features.map((f): Feature => ({
          ...f,
          properties: { ...f.properties, routeWater: isSurfaceWater(f.properties!.osmTags) },
        }))
      : [];
  const areas = slug === 'cambridge' ? { elements: [] } : read(`${slug}-areas.json`);
  const { nodes, edges, places, features, water } = prepareOSM(city, raw, areas, extraAreas);
  let trees: Tree[] = [],
    buildings: Building[] = [],
    modelBounds: Bounds = city.bounds;
  const manifest: Record<string, unknown> = {};
  const sourceFiles = [
    `${slug}-osm.json`,
    `${slug}-areas.${slug === 'cambridge' ? 'geojson' : 'json'}`,
  ];
  // Buffer tree positions around the route boundary for the 15 m proximity query.
  const treeBounds: Bounds = [
    city.bounds[0] - 0.001,
    city.bounds[1] - 0.001,
    city.bounds[2] + 0.001,
    city.bounds[3] + 0.001,
  ];
  if (slug === 'munich') {
    const env = read('munich-environment.json') as {
      trees: Tree[];
      buildings: Building[];
      tileBounds: Bounds;
      outlineDates: Record<string, number>;
      creationDates: Record<string, number>;
      methods: Record<string, number>;
      heightValidation: Record<string, number>;
      tileSha256: Record<string, string>;
    };
    const transform = (p: Point) => geographic(city, p).map((x) => +x.toFixed(7)) as Point;
    trees = env.trees.map((t) => ({ ...t, point: transform(t.point) }));
    buildings = env.buildings.map((b) => ({
      ...b,
      ring: b.ring.map(transform),
      holes: b.holes?.map((h) => h.map(transform)),
    }));
    const [w, s, e, n] = env.tileBounds;
    const [sw, se, nw, ne] = [
      [w, s],
      [e, s],
      [w, n],
      [e, n],
    ].map((p) => transform(p as Point));
    // Conservative WGS84 rectangle inside the actual rotated UTM tile, not its outer envelope.
    modelBounds = [
      Math.max(sw[0], nw[0]) + 0.00001,
      Math.max(sw[1], se[1]) + 0.00001,
      Math.min(se[0], ne[0]) - 0.00001,
      Math.min(nw[1], ne[1]) - 0.00001,
    ];
    Object.assign(manifest, {
      outlineDates: env.outlineDates,
      creationDates: env.creationDates,
      heightValidation: env.heightValidation,
      sourceMethods: env.methods,
      tileSha256: env.tileSha256,
      sourceTreeYear: 2024,
      sourceCrs: 'EPSG:25832 / DHHN2016',
    });
    sourceFiles.push(
      'munich-environment.json',
      ...Object.keys(env.tileSha256).map((tile) => `munich-${tile}.gml`),
      'munich-trees.gpkg',
      'munich-buildings.meta4',
    );
  } else {
    const treeData = read(`${slug}-trees.geojson`) as FeatureCollection;
    let excludedStatus = 0;
    trees = treeData.features.flatMap((f): Tree[] => {
      if (f.geometry.type !== 'Point') throw new Error('Unexpected tree geometry');
      if (slug === 'cambridge' && f.properties?.SiteType !== 'Tree') {
        excludedStatus++;
        return [];
      }
      return [
        {
          id: String(slug === 'cambridge' ? f.properties!.TreeID : f.properties!.ba_baumnr),
          point: f.geometry.coordinates.slice(0, 2) as Point,
          source:
            slug === 'cambridge'
              ? 'Cambridge Public Works — SiteType Tree'
              : 'Basel-Stadt maintained-tree register',
        },
      ];
    });
    Object.assign(manifest, {
      sourceRecords: treeData.features.length,
      excludedNonTreeStatus: excludedStatus,
    });
    sourceFiles.push(`${slug}-trees.geojson`);
    if (slug === 'cambridge') {
      sourceFiles.push('massachusetts-260927.osm.pbf', 'cambridge-boundary.geojson');
      // Record the inspection blocker; these buildings never enter the sunlight model.
      const inspected = read('cambridge-buildings.geojson') as FeatureCollection;
      manifest.buildingReview = {
        sourceRecords: inspected.features.length,
        missingOrNonPositiveHeight: inspected.features.filter((f) => !(f.properties?.TOP_GL > 0))
          .length,
        enabled: false,
        reason: 'Missing-height masks and municipal model-coverage geometry not implemented.',
      };
    }
  }
  trees = trees.filter((t) => inBounds(t.point, treeBounds));
  if (trees.length < 50 || nodes.length < 100 || edges.length < 100)
    throw new Error(`Insufficient ${slug} pilot data`);
  if (city.capabilities.buildingShade && buildings.length < 100)
    throw new Error('No usable building model');
  if (city.capabilities.water && !water.length) throw new Error('No mapped surface-water geometry');
  for (const name of city.defaultJourney!)
    if (!places.some((p) => p.name === name))
      throw new Error(
        `${slug}: default place missing: ${name}; select a verified named path before launch.`,
      );
  const data: PilotData = {
    version: city.dataVersion!,
    cityId: city.id,
    fetchedAt: '2026-09-28',
    preparedAt: '2026-09-29',
    bounds: city.bounds,
    modelBounds,
    nodes,
    edges,
    places,
    trees,
    buildings,
    water,
    provenance: {
      sourceSummary: city.sourceSummary,
      osmTimestamp: /^\d{4}-\d{2}-\d{2}T/.test(raw.osm3s?.timestamp_osm_base ?? '')
        ? raw.osm3s!.timestamp_osm_base
        : null,
      osmSourceStamp: raw.osm3s?.timestamp_osm_base ?? null,
      sha256: Object.fromEntries(sourceFiles.map((name) => [name, hash(name)])),
    },
  };
  fs.writeFileSync(`public/data/${slug}.json`, JSON.stringify(data));
  fs.writeFileSync(
    `public/data/${slug}-map.geojson`,
    JSON.stringify({ type: 'FeatureCollection', features }),
  );
  const counts = {
    nodes: nodes.length,
    edges: edges.length,
    places: places.length,
    trees: trees.length,
    buildings: buildings.length,
    waterAreas: water.length,
  };
  fs.writeFileSync(
    `docs/${slug}-data-manifest.json`,
    JSON.stringify(
      {
        cityId: city.id,
        version: data.version,
        fetchedAt: data.fetchedAt,
        modelBounds,
        routeBounds: city.bounds,
        coverageGeometry: city.coverage ? 'Official municipal MultiPolygon' : 'Pilot rectangle',
        preparedAt: data.preparedAt,
        ...data.provenance,
        ...manifest,
        counts,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(slug, counts, 'model bounds', modelBounds);
}
