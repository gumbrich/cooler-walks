import { dataUrl } from './lib/data-url';
import { version as appVersion } from '../package.json';
import { useI18n } from './i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownUp,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  Download,
  Globe2,
  Info,
  Leaf,
  LocateFixed,
  MapPin,
  Moon,
  Mountain,
  PanelTopClose,
  Plus,
  Sun,
  Waves,
  TrafficCone,
  X,
} from 'lucide-react';
import { cities, cityOptions, getCity } from './lib/cities';
import { inCoverage } from './lib/coverage';
import { formatDistance } from './lib/geo';
import { arrivalLabel, localNow, timeLabel, toInstant } from './lib/time';
import type { PlannerData, Point, Route, RouteResult } from './lib/types';
import { PlaceSearch, type Endpoint } from './components/Search';
import { WalkingMap } from './components/Map';
import { currentLocation, isNativeApp } from './lib/platform';
import type { FeatureCollection } from 'geojson';
import { getArea, readSavedAreaBytes, bundledAreas } from './lib/areas';
import { cityForArea } from './lib/area-specs';
import { AreaDownloads } from './components/AreaDownloads';
import { TrafficCounts } from './components/TrafficCounts';
import { TrafficProfile } from './components/TrafficProfile';
import { ElevationProfile } from './components/ElevationProfile';
import { RoutePreferences, LightChoice } from './components/RoutePreferences';
import { LightRoutingStatus } from './components/LightRoutingStatus';
import { PreferenceComparison } from './components/PreferenceComparison';
import type { RoutePreferences as Preferences } from './lib/types';
import { goalsOf } from './lib/preferences';
import { formatElevation, terrainComplete } from './lib/elevation';
import { trafficCost } from './lib/traffic';
import { nearbyCounts } from './lib/vehicle-counts';
import { pavementChoices, type PavementChoice } from './lib/pavement-selection';
import { PavementPicker } from './components/PavementPicker';

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
const readPreference = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const preference = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Private browsing may disable storage. */
  }
};
export default function App() {
  const { t, language, setLanguage, locale, number, localPath } = useI18n();
  const [cityId, setCityId] = useState(() =>
    new URLSearchParams(location.search).get('network') === 'pavements'
      ? (cityOptions.find((city) => city.pavementPilot)?.id ?? 'ch-zurich')
      : readPreference('cw-city', 'ch-zurich'),
  );
  const [areaId, setAreaId] = useState(() => readPreference('cw-area', cityId));
  const area = getArea(areaId, cityId);
  const city = useMemo(() => (area ? cityForArea(area) : getCity(cityId)), [area, cityId]);
  const [mapData, setMapData] = useState<FeatureCollection | null>(null);
  // Indexing the full basemap while loading 3D routing geometry competes for
  // CPU and memory on phones and smaller desktop machines. Finish the first
  // route before starting the planner renderer. Explicit map picking and
  // errors still reveal the map immediately; subsequent edits keep it mounted.
  const [mapReady, setMapReady] = useState(false);
  const [view, setView] = useState(() =>
    isNativeApp ||
    new URLSearchParams(location.search).get('view') === 'planner' ||
    readPreference('cw-visited', '') === 'yes'
      ? 'planner'
      : 'home',
  );
  const [data, setData] = useState<PlannerData | null>(null),
    [dataState, setDataState] = useState('loading'),
    [retry, setRetry] = useState(0),
    [routeRetry, setRouteRetry] = useState(0);
  const [start, setStart] = useState<Endpoint | null>(null),
    [end, setEnd] = useState<Endpoint | null>(null);
  const [stops, setStops] = useState<{ id: number; value: Endpoint | null }[]>([]);
  const stopId = useRef(0);
  const [compactScreen, setCompactScreen] = useState(
    () => matchMedia('(max-width: 620px)').matches,
  );
  useEffect(() => {
    const query = matchMedia('(max-width: 620px)');
    const update = () => setCompactScreen(matchMedia('(max-width: 620px)').matches);
    query.addEventListener('change', update);
    window.addEventListener('resize', update);
    update();
    return () => {
      query.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  const [preferences, setPreferences] = useState<Preferences>({
    primary: city.capabilities.buildingShade ? 'shade' : 'greenery',
    secondary: [],
  });
  const activeGoals = goalsOf(preferences);
  const preferCalm = activeGoals.includes('calm');
  const preferFlat = activeGoals.includes('flat') || !!preferences.avoidSteps;
  const preferWater = activeGoals.includes('water');
  const sunlight = activeGoals.includes('sun') ? 'sun' : 'shade';
  useEffect(() => {
    document.documentElement.dataset.walkMode = sunlight;
    return () => {
      delete document.documentElement.dataset.walkMode;
    };
  }, [sunlight]);
  const [pavements, setPavements] = useState(false);
  const canopyScenario = !!city.canopyPilot;
  const [countsExpanded, setCountsExpanded] = useState(false);
  const [departure, setDeparture] = useState(() => localNow(city.timeZone)),
    [extra, setExtra] = useState(5);
  const [result, setResult] = useState<RouteResult | null>(null),
    [selected, setSelected] = useState('fastest'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [pick, setPick] = useState<'start' | 'end' | number | null>(null),
    [coverage, setCoverage] = useState(true),
    [editing, setEditing] = useState(false);
  const [units, setUnits] = useState<'metric' | 'imperial'>(() =>
    readPreference('cw-units', 'metric') === 'imperial' ? 'imperial' : 'metric',
  );
  const [modal, setModal] = useState<'method' | 'coverage' | 'install' | 'areas' | null>(null),
    dialog = useRef<HTMLDialogElement>(null);
  const [online, setOnline] = useState(navigator.onLine),
    [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const worker = useRef<Worker | null>(null),
    requestId = useRef(0);
  const locationRequest = useRef(0);
  useEffect(() => {
    locationRequest.current++;
    const controller = new AbortController();
    setData(null);
    setMapData(null);
    setMapReady(false);
    setResult(null);
    setStart(null);
    setEnd(null);
    setStops([]);
    setPreferences({
      primary: city.capabilities.buildingShade ? 'shade' : 'greenery',
      secondary: [],
    });
    setPavements(false);
    setCountsExpanded(false);
    setError('');
    setDataState('loading');
    setBusy(false);
    setPick(null);
    requestId.current++;
    worker.current?.terminate();
    worker.current = null;
    if (city.status !== 'pilot') {
      setDataState('review');
      return () => controller.abort();
    }
    const w = new Worker(new URL('./route-worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    let planner: PlannerData | null = null;
    const loadError = (e: unknown) => {
      if (controller.signal.aborted) return;
      setMapReady(true);
      setDataState('error');
      setError(e instanceof Error ? e.message : String(e));
    };
    w.onmessage = (e) => {
      if (controller.signal.aborted) return;
      if (e.data.type === 'planner') {
        planner = e.data.data;
        if (e.data.map) setMapData(e.data.map);
      } else if (e.data.type === 'ready' && planner) {
        const pilot = planner.pavementNetwork;
        const from = pilot
            ? pilot.places[0]
            : planner.places.find((p) => p.name === city.defaultJourney?.[0]),
          to = pilot
            ? pilot.places[1]
            : planner.places.find((p) => p.name === city.defaultJourney?.[1]);
        if (!from || !to) return loadError('Reference places are missing from the city bundle');
        setData(planner);
        planner = null;
        setDataState('ready');
        setPavements(!!pilot);
        setStart({
          name: from.name,
          point: from.point,
          ...(pilot ? { pavement: { point: from.point } } : {}),
        });
        setEnd({
          name: to.name,
          point: to.point,
          ...(pilot ? { pavement: { point: to.point } } : {}),
        });
        if (!isNativeApp && city.dataUrl && import.meta.env.PROD && 'serviceWorker' in navigator) {
          const saveCity = (target: ServiceWorker | null) => {
            if (!controller.signal.aborted)
              target?.postMessage({
                type: 'CACHE_CITY',
                urls: [
                  city.dataUrl,
                  city.mapUrl,
                  city.detailedShade?.dataUrl,
                  city.pavementPilot?.dataUrl,
                ]
                  .filter((url): url is string => !!url)
                  .map(dataUrl),
              });
          };
          navigator.serviceWorker.addEventListener(
            'controllerchange',
            () => saveCity(navigator.serviceWorker.controller),
            { signal: controller.signal },
          );
          void navigator.serviceWorker.ready.then((registration) =>
            saveCity(navigator.serviceWorker.controller ?? registration.active),
          );
        }
      } else if (e.data.type === 'load-error') {
        loadError(e.data.error);
      } else if (e.data.id === requestId.current) {
        setBusy(false);
        setMapReady(true);
        if (e.data.error) {
          setError(e.data.error);
          setResult(null);
        } else {
          setError('');
          if (
            !isNativeApp &&
            import.meta.env.PROD &&
            'serviceWorker' in navigator &&
            e.data.cacheUrls?.length
          ) {
            void navigator.serviceWorker.ready.then((registration) => {
              if (!controller.signal.aborted)
                (navigator.serviceWorker.controller ?? registration.active)?.postMessage({
                  type: 'CACHE_CITY',
                  urls: e.data.cacheUrls,
                });
            });
          }
          setResult(e.data.result);
          setSelected(e.data.result.alternative?.id ?? 'fastest');
        }
      }
    };
    w.onerror = () => {
      if (controller.signal.aborted) return;
      setBusy(false);
      loadError('The route calculator could not start. Reload to try again.');
    };
    void (async () => {
      const bytes = area ? await readSavedAreaBytes(area) : null;
      if (controller.signal.aborted) return;
      if (bytes && area) {
        w.postMessage({ type: 'initialize', city, area, bytes }, [bytes.buffer]);
      } else {
        if (!city.dataUrl || (isNativeApp && !(await bundledAreas()).includes(area?.id ?? city.id)))
          throw new Error('Download this walking area to open its map and plan offline.');
        if (!controller.signal.aborted)
          w.postMessage({
            type: 'initialize',
            city,
            url: new URL(city.dataUrl, location.href).href,
          });
      }
    })().catch(loadError);
    const dispose = () => {
      controller.abort();
      w.terminate();
    };
    const leaving = (event: PageTransitionEvent) => {
      if (!event.persisted) dispose();
    };
    window.addEventListener('pagehide', leaving);
    return () => {
      window.removeEventListener('pagehide', leaving);
      dispose();
    };
  }, [city, retry]);
  useEffect(() => {
    // Map picking and an incomplete/invalid trip must never wait for a result.
    if (data && (!start || !end || pick !== null || error)) setMapReady(true);
  }, [data, start, end, pick, error]);
  useEffect(() => {
    requestId.current++;
    setResult(null);
    // Stop obsolete CPU work immediately, including while an address is incomplete.
    // Initialization is separate and must finish before we send cancellation.
    if (data) worker.current?.postMessage({ type: 'cancel' });
    if (
      !data ||
      !start ||
      !end ||
      stops.some((stop) => !stop.value) ||
      !worker.current ||
      (pavements && [start, ...stops.map((s) => s.value), end].some((value) => !value?.pavement))
    ) {
      setBusy(false);
      if (data) setError('');
      return;
    }
    setError('');
    let instant: string;
    try {
      instant = toInstant(departure, city.timeZone);
    } catch {
      setError(
        'This local time is invalid or repeats during a daylight-saving change. Choose another time.',
      );
      setBusy(false);
      return;
    }
    setBusy(true);
    const id = requestId.current;
    const timer = setTimeout(() => {
      worker.current?.postMessage({
        id,
        start: pavements ? start.pavement!.point : start.point,
        end: pavements ? end.pavement!.point : end.point,
        departure: instant,
        extra,
        waypoints: stops.map((stop) =>
          pavements ? stop.value!.pavement!.point : stop.value!.point,
        ),
        preferWater,
        preferCalm,
        preferFlat,
        preferences,
        sunlight,
        pavements,
        canopyScenario,
        pavementSources: pavements
          ? [start, ...stops.map((s) => s.value!), end].map((value) => value.pavement?.sourceId)
          : undefined,
      });
    }, 180);
    return () => clearTimeout(timer);
  }, [
    data,
    start,
    end,
    stops,
    preferWater,
    preferCalm,
    preferFlat,
    preferences,
    sunlight,
    pavements,
    canopyScenario,
    departure,
    extra,
    city,
    routeRetry,
  ]);
  useEffect(() => {
    const a = () => setOnline(true),
      b = () => setOnline(false),
      p = (e: Event) => {
        e.preventDefault();
        setInstallEvent(e as InstallEvent);
      };
    window.addEventListener('online', a);
    window.addEventListener('offline', b);
    window.addEventListener('beforeinstallprompt', p);
    return () => {
      window.removeEventListener('online', a);
      window.removeEventListener('offline', b);
      window.removeEventListener('beforeinstallprompt', p);
    };
  }, []);
  useEffect(() => {
    if (modal) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modal]);
  const navigate = (next: string) => {
    setView(next);
    history.pushState({}, '', localPath(next === 'planner' ? '/?view=planner' : '/'));
    if (next === 'planner') preference('cw-visited', 'yes');
    window.scrollTo({ top: 0 });
  };
  useEffect(() => {
    const pop = () =>
      setView(new URLSearchParams(location.search).get('view') === 'planner' ? 'planner' : 'home');
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  const changeCity = (id: string) => {
    const url = new URL(location.href);
    url.searchParams.delete('network');
    history.replaceState({}, '', url);
    setCityId(id);
    setAreaId(id);
    preference('cw-city', id);
    preference('cw-area', id);
    setDeparture(localNow(getCity(id).timeZone));
    setEditing(false);
  };
  const searchPlaces = useMemo(
    () =>
      pavements
        ? [
            ...(data?.pavementNetwork?.places ?? []),
            ...(data?.places ?? []).filter((p) => p.address),
          ]
        : (data?.places ?? []),
    [pavements, data],
  );
  const pendingPavement = useMemo(() => {
    if (!pavements || !data?.pavementNetwork) return null;
    const endpoints: { target: 'start' | 'end' | number; value: Endpoint | null }[] = [
      { target: 'start', value: start },
      ...stops.map((s) => ({ target: s.id, value: s.value })),
      { target: 'end', value: end },
    ];
    const next = endpoints.find((e) => e.value && !e.value.pavement);
    return next?.value
      ? {
          ...next,
          value: next.value,
          choices: pavementChoices(city, data.pavementNetwork.lines, next.value.point),
        }
      : null;
  }, [pavements, data, city, start, end, stops]);
  useEffect(() => {
    if (pendingPavement) {
      setMapReady(true);
      setEditing(false);
    }
  }, [pendingPavement]);
  const selectPavement = (choice: PavementChoice) => {
    if (!pendingPavement) return;
    const value = { ...pendingPavement.value, pavement: choice };
    if (pendingPavement.target === 'start') setStart(value);
    else if (pendingPavement.target === 'end') setEnd(value);
    else
      setStops((current) =>
        current.map((s) => (s.id === pendingPavement.target ? { ...s, value } : s)),
      );
    setPick(null);
  };
  useEffect(() => {
    if (!isNativeApp) return;
    const listener = import('@capacitor/app').then(({ App: NativeApp }) =>
      NativeApp.addListener('backButton', () => {
        if (modal) setModal(null);
        else if (pick !== null) setPick(null);
        else if (editing) setEditing(false);
        else if (view !== 'planner') navigate('planner');
        else void NativeApp.minimizeApp();
      }),
    );
    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, [modal, pick, editing, view, language]);
  const locate = async () => {
    const id = ++locationRequest.current;
    setError('Finding your location…');
    try {
      const point = await currentLocation();
      if (id === locationRequest.current) {
        setStart({ name: 'Your location', point });
        setError('');
      }
    } catch {
      if (id === locationRequest.current)
        setError(
          'Location access was unavailable. Your trip is preserved; search a street or choose a point on the map.',
        );
    }
  };
  const mapPick = (p: Point, target = pick) => {
    if (!inCoverage(city, p)) {
      setError('Outside walking coverage. Choose a point inside the dashed boundary.');
      return;
    }
    const value = { name: `Map point · ${p[1].toFixed(4)}, ${p[0].toFixed(4)}`, point: p };
    if (target === 'start') setStart(value);
    else if (target === 'end') setEnd(value);
    else
      setStops((current) =>
        current.map((stop) => (stop.id === target ? { ...stop, value } : stop)),
      );
    setPick(null);
  };
  const chooseMap = (target: 'start' | 'end' | number) => {
    setPick(target);
    setEditing(false);
    window.scrollTo({
      top: 0,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  };
  const moveStop = (index: number, direction: number) => {
    setStops((current) => {
      const next = [...current];
      [next[index], next[index + direction]] = [next[index + direction], next[index]];
      return next;
    });
    setPick(null);
  };
  const chosen = result
    ? selected === result.fastest.id
      ? result.fastest
      : (result.alternative ?? result.fastest)
    : null;
  const isShade = result?.mode === 'shade';
  const counterObservations = useMemo(
    () =>
      nearbyCounts(data?.vehicleCounts, city, chosen, result?.departure ?? '2000-01-01T00:00:00Z'),
    [data, city, chosen, result?.departure],
  );
  const canopyResult = !!result?.canopyVersion;
  const hasExposure = isShade || (canopyResult && result?.mode === 'greenery');
  const showWater = result?.preference === 'water';
  const showCalm = result?.preference === 'calm';
  const showShade = hasExposure && !showWater && !showCalm;
  const showSun = showShade && sunlight === 'sun';
  const percentage = (r: Route) =>
    Math.round(
      result?.preference === 'calm'
        ? ((r.distance - r.majorRoadMeters - r.trafficUnknownMeters) / r.distance) * 100
        : showWater
          ? (r.waterMeters / r.distance) * 100
          : hasExposure
            ? ((showSun ? r.sunMeters : r.shadeMeters) / Math.max(1, r.shadeMeters + r.sunMeters)) *
              100
            : (r.greenMeters / r.distance) * 100,
    );
  const timeMinutes =
    Number(timeLabel(departure).split(':')[0]) * 60 + Number(timeLabel(departure).split(':')[1]);
  const timeControl = (
    <div className="time-control">
      <div className="time-heading">
        <span>
          <Sun size={18} />
          {t(' Departure')}
        </span>
        <strong>
          {timeLabel(departure)}{' '}
          <small>
            {t('{zone} time', { zone: t(city.timeZone.split('/')[1].replaceAll('_', ' ')) })}
          </small>
        </strong>
      </div>
      <input
        aria-label={t('Departure time')}
        type="range"
        min="0"
        max="1425"
        step="15"
        value={Number.isFinite(timeMinutes) ? timeMinutes : 720}
        onChange={(e) => {
          const n = +e.target.value;
          setDeparture(
            `${departure.slice(0, 10)}T${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`,
          );
        }}
      />
      <div className="time-ticks">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>23:45</span>
      </div>
      <div className="time-foot">
        <span>
          {busy
            ? t('Updating…')
            : preferences.secondary.some((g) => g === 'shade' || g === 'sun')
              ? t('Estimates change with departure time.')
              : preferences.primary === 'flat'
                ? t('Elevation does not depend on the time.')
                : preferences.primary === 'calm'
                  ? t('Street context is fixed. Counter profiles change with time.')
                  : preferences.primary === 'water'
                    ? t('Water proximity does not depend on the time.')
                    : result?.mode === 'night'
                      ? t('After dark · direct sun is not relevant')
                      : result?.mode === 'low-sun'
                        ? t('Low sun · building estimate unavailable')
                        : result?.mode === 'transition'
                          ? t('Light changes during this walk · comparison unavailable')
                          : hasExposure || (!result && city.capabilities.buildingShade)
                            ? t('Estimates change with departure time.')
                            : t('Tree proximity does not depend on the time.')}
        </span>
        <label className="date-label">
          {t('Date')}
          <input
            aria-label={t('Departure date')}
            type="date"
            value={departure.slice(0, 10)}
            onChange={(e) => {
              if (e.target.value) setDeparture(e.target.value + 'T' + timeLabel(departure));
            }}
          />
        </label>
      </div>
    </div>
  );
  const routeCard = (route: Route, index: number) => (
    <button
      key={route.id}
      className={`route-card ${selected === route.id ? 'selected' : ''} ${showSun ? 'sun-route' : ''} ${showWater ? 'water-route' : ''}`}
      onClick={() => setSelected(route.id)}
      aria-pressed={selected === route.id}
    >
      <div className="route-card-top">
        <span className="route-name">
          {index
            ? result?.preferences && goalsOf(result.preferences).length > 1
              ? t('Alternative')
              : result?.preference === 'flat'
                ? t('Flatter route')
                : result?.preference === 'calm'
                  ? t('Calmer streets')
                  : result?.preference === 'water'
                    ? t('More time near water')
                    : result?.preference === 'sun'
                      ? canopyResult
                        ? t('More potential sun')
                        : t('More estimated sun')
                      : isShade
                        ? canopyResult
                          ? t('More potential shade')
                          : t('More estimated shade')
                        : t('Greener route')
            : t('Fastest walk')}
          {index > 0 && (
            <small>
              {t('+{extra} min', { extra: number(route.minutes - result!.fastest.minutes, 1) })}
            </small>
          )}
        </span>
        <span className="route-radio">{selected === route.id && <Check size={12} />}</span>
      </div>
      <div className="route-numbers">
        <strong>
          {Math.ceil(route.minutes)}
          <small> min</small>
        </strong>
        <span className="route-distance">
          {formatDistance(route.distance, units, locale)}{' '}
          <span className="route-arrival">
            <Clock3 size={14} />
            {t('Arrive around {time}', {
              time: arrivalLabel(route.arrival, result!.departure, city.timeZone, locale),
            })}
          </span>
        </span>
        <span className="exposure-number">
          {result?.preference === 'calm'
            ? formatDistance(route.majorRoadMeters, units, locale)
            : showShade && route.shadeMeters + route.sunMeters < 1
              ? '—'
              : showShade &&
                  canopyResult &&
                  (route.shadeMeters + route.sunMeters) / route.distance < 0.95
                ? formatDistance(showSun ? route.sunMeters : route.shadeMeters, units, locale)
                : `${percentage(route)}%`}
          <small>
            {result?.preference === 'calm'
              ? t('near main roads')
              : showWater
                ? t('near water')
                : hasExposure
                  ? showSun
                    ? canopyResult
                      ? t('potential sun')
                      : t('estimated sun')
                    : canopyResult
                      ? t('potential shade')
                      : t('estimated shade')
                  : t('near trees')}
          </small>
        </span>
      </div>
      {route.terrain && (
        <div className="route-elevation">
          <Mountain size={15} aria-hidden="true" />
          {route.terrain.knownMeters > 0 ? (
            <span>
              {t('↑ {up} · ↓ {down}', {
                up: formatElevation(route.terrain.ascent, units, locale),
                down: formatElevation(route.terrain.descent, units, locale),
              })}
            </span>
          ) : (
            <span>{t('Elevation unknown')}</span>
          )}
          <small>{t(terrainComplete(route.terrain) ? 'estimated' : 'known sections only')}</small>
        </div>
      )}
      <div className="exposure-bar" aria-hidden="true">
        <span
          style={{
            width: `${showShade ? (100 * (showSun ? route.sunMeters : route.shadeMeters)) / route.distance : percentage(route)}%`,
          }}
        />
        {showShade && route.unknownMeters > 0 && (
          <i
            className="exposure-unknown"
            style={{
              width: `${(100 * route.unknownMeters) / route.distance}%`,
              right: `${(100 * route.nightMeters) / route.distance}%`,
            }}
          />
        )}
        {showShade && route.nightMeters > 0 && (
          <i
            className="exposure-night"
            style={{ width: `${(100 * route.nightMeters) / route.distance}%` }}
          />
        )}
      </div>
      <div className="route-card-caption">
        {result?.preference === 'calm'
          ? t('{share}% away from main roads · street context', { share: percentage(route) })
          : showWater
            ? t('Within 50 m of mapped water')
            : hasExposure
              ? t(
                  canopyResult
                    ? '{coverage}% coverage · buildings + trees'
                    : '{coverage}% model coverage · buildings only',
                  {
                    coverage: Math.round(
                      ((route.shadeMeters + route.sunMeters) / route.distance) * 100,
                    ),
                  },
                )
              : t('Within 15 m of a recorded tree · not canopy shade')}
      </div>
      {showShade && canopyResult && route.unknownMeters / route.distance > 0.05 && (
        <div className="route-unknown-note">
          <i className="unknown-swatch" aria-hidden="true" />
          {t('{distance} unknown', {
            distance: formatDistance(route.unknownMeters, units, locale),
          })}
        </div>
      )}
      {showShade && !!route.detailedMeters && (
        <div className="route-model-note">
          <span className="model-swatch" aria-hidden="true" />
          {t('3D roofs + ground elevation · {share}% of walk', {
            share: Math.round((route.detailedMeters / route.distance) * 100),
          })}
        </div>
      )}
      {result?.pavementVersion && (
        <div className="route-pavement-note">
          {route.crossingCount === 1
            ? t('Mapped paths · 1 crossing section')
            : t('Mapped paths · {count} crossing sections', { count: route.crossingCount ?? 0 })}
        </div>
      )}
    </button>
  );
  const pavementSelection = useMemo(
    () =>
      pick === null && pendingPavement
        ? { point: pendingPavement.value.point, choices: pendingPavement.choices }
        : undefined,
    [pick, pendingPavement],
  );
  const mapProps = {
    city,
    data,
    mapData,
    pavements,
    canopyScenario,
    pavementSelection,
    onChoosePavement: selectPavement,
    result,
    pending: busy,
    selected,
    onSelect: setSelected,
    pick:
      typeof pick === 'number' ? `stop ${stops.findIndex((stop) => stop.id === pick) + 1}` : pick,
    onPick: mapPick,
    onCancelPick: () => {
      setPick(null);
      if (error === 'Outside walking coverage. Choose a point inside the dashed boundary.')
        setError('');
    },
    onChoosePoint: (target: 'start' | 'end' | 'stop', point: Point) => {
      if (target === 'stop') {
        if (stops.length >= 3) return;
        const id = ++stopId.current;
        setStops((current) => [
          ...current,
          {
            id,
            value: { name: `Map point · ${point[1].toFixed(4)}, ${point[0].toFixed(4)}`, point },
          },
        ]);
        setPick(null);
      } else mapPick(point, target);
      setEditing(false);
    },
    canAddStop: stops.length < 3,
    showCoverage: coverage,
    onCoverage: () => setCoverage(!coverage),
    counterObservations: countsExpanded ? counterObservations : [],
  };
  return (
    <>
      <a className="skip-link" href="#main">
        {t('Skip to content')}
      </a>
      <header className="header">
        <button
          className="brand"
          onClick={() => navigate('home')}
          aria-label={t('Cooler Walks home')}
        >
          <img src="/icon.svg" alt="" />
          <span>
            cooler walks<span className="brand-dot">.</span>
          </span>
        </button>
        <nav aria-label={t('Main navigation')}>
          <button
            className={view === 'planner' ? 'active' : ''}
            onClick={() => navigate('planner')}
          >
            {t('Plan a walk')}
          </button>
          <button onClick={() => setModal('method')}>{t('Our approach')}</button>
        </nav>
        <div className="header-right">
          <label className="language-select">
            <span className="sr-only">{t('Language')}</span>
            <select
              aria-label={t('Language')}
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'en' | 'de')}
            >
              <option value="en" lang="en">
                EN
              </option>
              <option value="de" lang="de">
                DE
              </option>
            </select>
          </label>
          <div className="city-select">
            <MapPin size={16} />
            <label className="sr-only" htmlFor="city">
              {t('City')}
            </label>
            <select id="city" value={city.id} onChange={(e) => changeCity(e.target.value)}>
              {cityOptions.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.localName}, {t(c.country ?? '')}
                  {c.beta && c.status !== 'review' ? ' · Beta' : ''}
                  {c.status === 'review' ? t(' · under review') : ''}
                </option>
              ))}
            </select>
            <span className="city-current" aria-hidden="true">
              {city.localName}
              {city.beta ? ' · Beta' : ''}
            </span>
            <ChevronDown size={14} />
          </div>
          <button
            className="icon-button install-button"
            aria-label={isNativeApp ? t('About this app') : t('Install Cooler Walks')}
            onClick={() => setModal('install')}
          >
            {isNativeApp ? <Info size={19} /> : <Download size={19} />}
          </button>
        </div>
      </header>
      {!online && (
        <div className="offline-banner" role="status">
          {t('Offline ·')}{' '}
          {isNativeApp
            ? t('Included and downloaded areas work without a connection.')
            : data
              ? t('Using previously downloaded pilot data. Source dates are in the method view.')
              : t('Open a previously saved pilot or reconnect to load data.')}
        </div>
      )}
      {view === 'home' ? (
        <main id="main" className="home">
          <section className="hero">
            <div className="hero-copy">
              <h1>{t('Walking routes')}</h1>
              <p>
                {t('Choose a start and destination, compare routes and set your maximum detour.')}
              </p>
              <button className="primary hero-cta" onClick={() => navigate('planner')}>
                {t('Plan a route ')}
                <ArrowRight size={21} />
              </button>
              <div className="pilot-note">
                <span className="pilot-dot" />
                {city.beta
                  ? t('Beta · {city}', { city: t(city.name) })
                  : t('Zurich pilot · experimental estimates')}
                <button onClick={() => setModal('coverage')}>
                  {t('Check coverage ')}
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
            <div className="hero-atlas">
              {city.status === 'pilot' ? (
                <WalkingMap key={`${city.id}:${retry}`} {...mapProps} hero />
              ) : (
                <div className="review-visual">
                  <Globe2 size={90} />
                  <h2>{city.localName}</h2>
                  <p>{t('Data under review')}</p>
                </div>
              )}
              <div className="atlas-title">
                <span>{t(city.country ?? '')}</span>
                <strong>{city.localName}</strong>
              </div>
              {result && (
                <div className="hero-route-note">
                  <div>
                    <strong>
                      {Math.ceil(chosen!.minutes)} min ·{' '}
                      {formatDistance(chosen!.distance, units, locale)}
                    </strong>
                    <span>
                      {t(start?.name ?? '')} → {t(end?.name ?? '')}
                    </span>
                    <small>
                      {t('Example route · ')}
                      {timeLabel(departure)}
                      {t(' local time')}
                    </small>
                  </div>
                </div>
              )}
            </div>
          </section>
          <footer className="home-footer">
            {import.meta.env.VITE_PRIVATE_SITE === '1' && !isNativeApp && (
              <form method="post" action="/_access/logout">
                <button>{t('Lock website')}</button>
              </form>
            )}
            <span>{t('No account needed.')}</span>
            <button onClick={() => setModal('method')}>
              {t('Method, sources & privacy ')}
              <ArrowRight size={14} />
            </button>
            <span>
              <a href={localPath('/support/index.html')}>{t('Help & feedback')}</a> ·{' '}
              <a href={localPath('/privacy/index.html')}>{t('Privacy')}</a>
            </span>
          </footer>
        </main>
      ) : (
        <main id="main" className={`planner ${editing ? 'editing' : ''}`}>
          {city.status === 'review' ? (
            <section className="unsupported">
              <div className="unsupported-icon">
                <Globe2 size={46} />
              </div>
              <h1>
                {city.localName},<br />
                <em>{t('under review.')}</em>
              </h1>
              <p>{t(city.reviewSummary ?? '')}</p>
              <div className="review-tags">
                <span>{t('France')}</span>
                <span>{city.timeZone}</span>
                <span>{t('Routing unavailable')}</span>
              </div>
              <button className="primary" onClick={() => changeCity('ch-zurich')}>
                {t('Plan in Zurich ')}
                <ArrowRight size={18} />
              </button>
              <button className="text-button" onClick={() => setModal('coverage')}>
                {t('See coverage & next steps')}
              </button>
            </section>
          ) : (
            <>
              <aside className="planner-panel" aria-label={t('Plan and compare walks')}>
                <div className="sheet-handle" />
                <div className="panel-title">
                  <h1>{t('Plan a route')}</h1>
                  <button
                    className="mobile-edit icon-button"
                    aria-label={editing ? t('Close trip editor') : t('Edit trip')}
                    onClick={() => setEditing(!editing)}
                  >
                    {editing ? <PanelTopClose size={21} /> : <MapPin size={21} />}
                  </button>
                </div>

                <LightChoice city={city} value={preferences} onChange={setPreferences} />
                {city.capabilities.buildingShade && (
                  <LightRoutingStatus
                    result={error ? null : result}
                    busy={busy}
                    goal={sunlight}
                    extra={extra}
                  />
                )}
                {pendingPavement && pick === null && (
                  <PavementPicker
                    name={pendingPavement.value.name}
                    choices={pendingPavement.choices}
                    onChoose={selectPavement}
                    onMap={() => chooseMap(pendingPavement.target)}
                    units={units}
                  />
                )}
                <div className="trip-compact">
                  <span>
                    <b>A</b>
                    {start ? t(start.name) : t('Choose start')}
                    <ArrowRight size={15} />
                    <b>B</b>
                    {end ? t(end.name) : t('Choose destination')}
                  </span>
                  <button aria-label={t('Edit trip')} onClick={() => setEditing(true)}>
                    {t('Edit')}
                  </button>
                </div>
                {!!stops.length && (
                  <p className="trip-stop-summary">
                    {t('Via')}{' '}
                    {stops
                      .map((stop, i) => stop.value?.name ?? t('Choose stop {n}', { n: i + 1 }))
                      .join(' → ')}
                  </p>
                )}
                <form
                  className="trip-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setEditing(false);
                  }}
                >
                  {city.beta && (
                    <p className="beta-notice">
                      {t('Beta city · Zurich is our main focus. Coverage and features vary here.')}
                    </p>
                  )}
                  <p className="search-guidance">
                    {pavements
                      ? t(
                          'Enter an address or choose a point on the map, then select the side you can reach.',
                        )
                      : t(
                          city.capabilities.addresses
                            ? 'Enter an address or choose a point on the map.'
                            : 'Enter a street or place, or choose a point on the map.',
                        )}
                  </p>
                  <div className="endpoint-fields">
                    <span className="endpoint-track">
                      <i>A</i>
                      <span />
                      <i>B</i>
                    </span>
                    <div className="fields">
                      <PlaceSearch
                        key={`start-${city.id}`}
                        city={city}
                        label={t('From')}
                        value={start}
                        places={searchPlaces}
                        addresses={city.capabilities.addresses}
                        onChange={setStart}
                        onChoosePavement={
                          pavements && start
                            ? () => setStart({ ...start, pavement: undefined })
                            : undefined
                        }
                        onPick={() => chooseMap('start')}
                      />
                      <div className="waypoint-editor">
                        {stops.map((stop, index) => (
                          <div className="waypoint-row" key={stop.id}>
                            <span className="stop-number" aria-hidden="true">
                              {index + 1}
                            </span>
                            <PlaceSearch
                              city={city}
                              label={t('Stop {n}', { n: index + 1 })}
                              value={stop.value}
                              places={searchPlaces}
                              addresses={city.capabilities.addresses}
                              onChoosePavement={
                                pavements && stop.value
                                  ? () =>
                                      setStops((current) =>
                                        current.map((s) =>
                                          s.id === stop.id
                                            ? { ...s, value: { ...s.value!, pavement: undefined } }
                                            : s,
                                        ),
                                      )
                                  : undefined
                              }
                              onChange={(value) =>
                                setStops((current) =>
                                  current.map((item) =>
                                    item.id === stop.id ? { ...item, value } : item,
                                  ),
                                )
                              }
                              onPick={() => chooseMap(stop.id)}
                            />
                            <div className={`stop-actions ${stops.length === 1 ? 'single' : ''}`}>
                              {stops.length > 1 && (
                                <>
                                  <button
                                    type="button"
                                    aria-label={t('Move stop {n} earlier', { n: index + 1 })}
                                    disabled={index === 0}
                                    onClick={() => moveStop(index, -1)}
                                  >
                                    <ArrowUp size={15} />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={t('Move stop {n} later', { n: index + 1 })}
                                    disabled={index === stops.length - 1}
                                    onClick={() => moveStop(index, 1)}
                                  >
                                    <ArrowDown size={15} />
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                aria-label={t('Remove stop {n}', { n: index + 1 })}
                                onClick={() => {
                                  setStops((current) =>
                                    current.filter((item) => item.id !== stop.id),
                                  );
                                  setPick(null);
                                }}
                              >
                                <X size={16} />
                              </button>
                            </div>
                          </div>
                        ))}
                        {!!stops.length && (
                          <p className="stop-help">{t('Time spent at stops is not included.')}</p>
                        )}
                      </div>
                      <PlaceSearch
                        key={`end-${city.id}`}
                        city={city}
                        label={t('To')}
                        value={end}
                        places={searchPlaces}
                        addresses={city.capabilities.addresses}
                        onChange={setEnd}
                        onChoosePavement={
                          pavements && end
                            ? () => setEnd({ ...end, pavement: undefined })
                            : undefined
                        }
                        onPick={() => chooseMap('end')}
                      />
                    </div>
                    <button
                      type="button"
                      className="swap-button"
                      aria-label={t('Swap start and destination')}
                      onClick={() => {
                        setStart(end);
                        setEnd(start);
                        setStops((current) => [...current].reverse());
                        setPick(null);
                      }}
                    >
                      <ArrowDownUp size={17} />
                    </button>
                  </div>
                  <div className="form-utilities">
                    <button type="button" onClick={locate}>
                      <LocateFixed size={14} />
                      {t(' Use my location')}
                    </button>
                    {stops.length < 3 && (
                      <button
                        className="add-stop"
                        type="button"
                        onClick={() => {
                          const id = ++stopId.current;
                          setStops((current) => [...current, { id, value: null }]);
                        }}
                      >
                        <Plus size={16} />
                        {t(' Add a stop')}
                      </button>
                    )}
                  </div>
                  <fieldset className="detour">
                    <legend>{t('Extra walking time')}</legend>
                    <div className="segmented">
                      {[0, 5, 10, 15].map((n) => (
                        <button
                          key={n}
                          type="button"
                          aria-pressed={extra === n}
                          onClick={() => setExtra(n)}
                        >
                          {`+${n} min`}
                          {extra === n && <Check size={14} />}
                        </button>
                      ))}
                    </div>
                    <div className="detour-range">
                      <input
                        id="detour-minutes"
                        type="range"
                        min="0"
                        max="15"
                        step="1"
                        aria-label={t('Extra walking time')}
                        aria-valuetext={t('{minutes} extra minutes', { minutes: extra })}
                        value={extra}
                        onChange={(e) => setExtra(Number(e.target.value))}
                      />
                      <output htmlFor="detour-minutes">+{extra} min</output>
                    </div>
                  </fieldset>
                  <RoutePreferences city={city} value={preferences} onChange={setPreferences} />
                  <button className="primary mobile-save" type="submit">
                    {t('Show routes ')}
                    <ArrowRight size={17} />
                  </button>
                </form>
                {compactScreen && <div className="mobile-time">{timeControl}</div>}
                <div className="results" aria-busy={busy}>
                  <div className="results-heading">
                    <span className="eyebrow">{t('Routes')}</span>
                    <button className="icon-text" onClick={() => setModal('method')}>
                      <Info size={14} />
                      {t(' How we estimate')}
                    </button>
                  </div>
                  <div
                    role="status"
                    aria-live="polite"
                    className={busy ? 'status loading' : error ? 'status error' : ''}
                  >
                    {busy ? (
                      <>
                        <span className="spinner" />
                        {t('Calculating routes…')}
                      </>
                    ) : error ? (
                      <>
                        <Info size={20} />
                        <div>
                          <strong>{t('Route unavailable')}</strong>
                          <p>{t(error)}</p>
                          {dataState === 'ready' && (
                            <button onClick={() => setRouteRetry((n) => n + 1)}>
                              {t('Try again')}
                            </button>
                          )}
                          {dataState === 'error' && (
                            <>
                              <button onClick={() => setRetry(retry + 1)}>
                                {t('Try loading again')}
                              </button>{' '}
                              <button onClick={() => setModal('areas')}>
                                {t('Open downloads')}
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    ) : null}
                  </div>
                  {!busy && !error && dataState === 'loading' && (
                    <div className="status loading">
                      <span className="spinner" />
                      {t('Loading the {city} map…', { city: t(city.name) })}
                    </div>
                  )}
                  {!start || !end || stops.some((stop) => !stop.value) ? (
                    <div className="empty-hint">
                      <MapPin size={22} />
                      <p>
                        {t('Choose a start, destination and any added stops to find your walk.')}
                      </p>
                    </div>
                  ) : null}
                  {city.status === 'pilot' && !city.capabilities.buildingShade && (
                    <p className="capability-note">
                      <Leaf size={16} />
                      {t(' Greenery prototype · sun/shade estimates are not enabled.')}
                    </p>
                  )}
                  {result && (
                    <>
                      {result.preferences?.avoidSteps && (
                        <p className="accessibility-result-note">
                          {t(
                            'Mapped stairs and barriers avoided. Accessibility is not verified throughout.',
                          )}
                        </p>
                      )}
                      {canopyResult && (
                        <p className="canopy-result-note">
                          {t('Tree shade included · foliage assumed')}
                        </p>
                      )}
                      {[result.fastest, ...(result.alternative ? [result.alternative] : [])].map(
                        routeCard,
                      )}
                      <PreferenceComparison result={result} units={units} />
                      {!result.alternative && !['shade', 'sun'].includes(preferences.primary) && (
                        <p className="result-note">
                          {extra === 0
                            ? t(
                                'With no extra walking time, the fastest walk through your chosen points is your route.',
                              )
                            : preferences.primary === 'flat'
                              ? !terrainComplete(result.fastest.terrain)
                                ? t(
                                    'Some walking heights are unknown. A flatter comparison is unavailable; the fastest walk is shown.',
                                  )
                                : t(
                                    'No meaningfully flatter route was found within your time limit.',
                                  )
                              : preferences.primary === 'calm'
                                ? result.fastest.trafficUnknownMeters / result.fastest.distance >
                                  0.05
                                  ? t(
                                      'Street-context coverage is insufficient for comparison. The fastest walk is shown.',
                                    )
                                  : t(
                                      'No meaningfully calmer alternative was found within your time limit.',
                                    )
                                : sunlight === 'sun' && !preferWater && !isShade
                                  ? t(
                                      'A sun-based recommendation is unavailable for this time or coverage. The fastest walk is shown.',
                                    )
                                  : preferences.primary === 'water'
                                    ? t(
                                        'No route with meaningfully more water proximity was found within your time limit.',
                                      )
                                    : sunlight === 'sun'
                                      ? t(
                                          'No meaningfully sunnier alternative was found within your time limit.',
                                        )
                                      : t(
                                          'No meaningfully better alternative was found within your time limit.',
                                        )}
                        </p>
                      )}
                      {result.mode === 'night' && (
                        <p className="result-note">
                          <Moon size={15} />
                          {t(
                            preferCalm
                              ? 'Direct sun is not relevant after dark.'
                              : 'Direct sun is not relevant after dark. Greenery is shown separately.',
                          )}
                        </p>
                      )}
                      {result.mode === 'low-sun' && (
                        <p className="result-note">
                          {t(
                            'The sun is too low for this bounded building model. Tree proximity is shown instead.',
                          )}
                        </p>
                      )}
                      {result.mode === 'transition' && (
                        <p className="result-note">
                          {t(
                            'This walk crosses low sun or night. A shade or sun comparison is unavailable; tree proximity is shown separately.',
                          )}
                        </p>
                      )}
                      {result.mode === 'greenery' && city.capabilities.buildingShade && (
                        <p className="result-note">
                          {t(
                            canopyResult
                              ? 'Tree-scenario coverage is below 95%. No shade comparison; estimates cover only the known part of the walk.'
                              : 'Building-shade coverage is insufficient for comparison. These are greenery indicators.',
                          )}
                        </p>
                      )}
                    </>
                  )}
                  {chosen?.terrain && <ElevationProfile route={chosen} units={units} />}
                  {chosen && preferCalm && city.capabilities.trafficCalming && (
                    <TrafficProfile route={chosen} units={units} />
                  )}
                  {chosen && result && data?.vehicleCounts && city.capabilities.vehicleCounts && (
                    <TrafficCounts
                      data={data.vehicleCounts}
                      observations={counterObservations}
                      expanded={countsExpanded}
                      onExpanded={setCountsExpanded}
                    />
                  )}
                  {chosen && (
                    <details className="walk-details">
                      <summary>
                        {t('About this walk ')}
                        <ChevronDown size={15} />
                      </summary>
                      {canopyResult && (
                        <p className="canopy-breakdown">
                          {t(
                            'Building shade: {buildings}. Additional potential tree shade: {trees}. Full foliage assumed; not field-validated.',
                            {
                              buildings: formatDistance(
                                chosen.shadeMeters - (chosen.canopyShadeMeters ?? 0),
                                units,
                                locale,
                              ),
                              trees: formatDistance(chosen.canopyShadeMeters ?? 0, units, locale),
                            },
                          )}
                        </p>
                      )}
                      {city.capabilities.trafficCalming && (
                        <div className="route-traffic">
                          <TrafficCone size={14} />
                          <span>
                            <strong>{formatDistance(chosen.majorRoadMeters, units, locale)}</strong>
                            {t(' near main roads ·')}{' '}
                            <strong>
                              {Math.round(
                                ((chosen.distance - trafficCost(chosen).motor) / chosen.distance) *
                                  100,
                              )}
                              %
                            </strong>
                            {t(' paths & restricted streets')}
                          </span>
                        </div>
                      )}
                      {city.capabilities.water && (
                        <div className="route-water">
                          <Waves size={14} />
                          <span>
                            <strong>
                              {Math.round((chosen.waterMeters / chosen.distance) * 100)}%
                            </strong>
                            {t(' near mapped water · ')}
                            {formatDistance(chosen.waterMeters, units, locale)}
                          </span>
                        </div>
                      )}
                      <p>
                        {t('Compared {count} routes within your time limit.', {
                          count: result!.candidateCount,
                        })}
                      </p>
                      <p>
                        {t('Departure: ')}
                        {departure.replace('T', ' ')} · {city.timeZone}.
                      </p>
                      {!!stops.length && (
                        <p>
                          {t('Stops:')}{' '}
                          {stops
                            .map(
                              (stop, index) =>
                                stop.value?.name ?? t('Choose stop {n}', { n: index + 1 }),
                            )
                            .join(' → ')}
                          {t('. Time spent at stops is not included.')}
                        </p>
                      )}
                      <p>
                        {chosen.streets
                          .filter((s, i, a) => s !== 'Walking path' && a.indexOf(s) === i)
                          .slice(0, 12)
                          .join(' → ')}
                      </p>
                      {result?.pavementVersion && (
                        <p>
                          {t(
                            'Routes follow municipal pavements and footpaths. Crossing distances count; signal waits are unknown. Shade is withheld where walking height is uncertain, including identified bridges and underpasses. Check access on site.',
                          )}
                        </p>
                      )}
                      <p>
                        {(start?.address ||
                          end?.address ||
                          stops.some((s) => s.value?.address)) && (
                          <>
                            {t(
                              'Address markers locate buildings, not verified entrances. The walk starts and ends on the nearby mapped path; check the final access on site.',
                            )}{' '}
                          </>
                        )}
                        {chosen.steps ? t('Includes mapped steps. ') : ''}
                        {t('Walking time assumes 4.8 km/h; crossing waits are not included.')}{' '}
                        {result &&
                          t(
                            'Start and destination snap {start} m and {end} m to the mapped network.',
                            {
                              start: Math.round(result.startSnap),
                              end: Math.round(result.endSnap),
                            },
                          )}
                      </p>
                      {result?.waypoints.length ? (
                        <p>
                          {t('Stop snapping:')}{' '}
                          {result.waypoints
                            .map((stop, index) => `${index + 1}: ${Math.round(stop.snap)} m`)
                            .join(' · ')}
                          .
                        </p>
                      ) : null}
                      {city.capabilities.water && (
                        <p>
                          {t(
                            'Near water: within 50 m of mapped surface water, including bridges. Proximity does not establish a view, access to the bank, drinking water or a cooling benefit.',
                          )}
                        </p>
                      )}
                      {city.capabilities.trafficCalming && (
                        <p>
                          {t(
                            'Paths & restricted streets: mapped pedestrian areas, motor-restricted streets and separate paths away from main roads. Begegnungszone and Tempo-30 streets remain separate because they allow motor traffic. Unknown street context:',
                          )}{' '}
                          {formatDistance(chosen.trafficUnknownMeters, units, locale)}.
                        </p>
                      )}
                      {hasExposure && (
                        <p>
                          {t(
                            canopyResult
                              ? 'Potential direct sun: about {minutes} min. Unknown: {distance}. The percentage covers modelled daylight distance only, using arrival time at 4.8 km/h. Buildings and the opaque tree scenario are included; clouds and hill shadows are not.'
                              : 'Direct sun: about {minutes} min. Unknown: {distance}. Shadows follow your expected arrival along the walk at 4.8 km/h. Percentage uses modelled daylight distance only. Buildings obstruct sunlight; tree shade, hill shadows and clouds are not included.',
                            {
                              minutes: Math.round(chosen.sunMeters / 80),
                              distance: formatDistance(chosen.unknownMeters, units, locale),
                            },
                          )}
                        </p>
                      )}
                      {!!chosen.detailedMeters && (
                        <p>
                          {t(
                            '3D roofs and LiDAR ground elevations cover {share}% of this walk. Bridges, tunnels and missing ground elevations stay unknown. The model has not been field-validated.',
                            { share: Math.round((chosen.detailedMeters / chosen.distance) * 100) },
                          )}
                        </p>
                      )}
                      {!!chosen.nightMeters && (
                        <p>
                          {t(
                            'After dark: about {minutes} min. Darkness is kept separate from building shade.',
                            {
                              minutes: Math.round(chosen.nightMeters / 80),
                            },
                          )}
                        </p>
                      )}
                    </details>
                  )}
                </div>
                <button className="downloads-link" onClick={() => setModal('areas')}>
                  <Download size={17} />
                  {t(' Offline maps ')}
                  <ArrowRight size={16} />
                </button>
                <div className="panel-footer">
                  {import.meta.env.VITE_PRIVATE_SITE === '1' && !isNativeApp && (
                    <form method="post" action="/_access/logout">
                      <button>{t('Lock website')}</button>
                    </form>
                  )}
                  <button onClick={() => setModal('coverage')}>
                    <span className="pilot-dot" />{' '}
                    {pavements
                      ? t('Pavements & crossings')
                      : t('{area} pilot', { area: t(city.coverageLabel) })}
                    <Info size={13} />
                  </button>
                  <button
                    onClick={() => {
                      const next = units === 'metric' ? 'imperial' : 'metric';
                      setUnits(next);
                      preference('cw-units', next);
                    }}
                    aria-label={t(
                      units === 'metric' ? 'Switch to imperial units' : 'Switch to metric units',
                    )}
                  >
                    {units === 'metric' ? 'km' : 'mi'}
                  </button>
                </div>
              </aside>
              <section className="planner-map" aria-label={t('Walking route map')}>
                {mapReady ? (
                  <WalkingMap key={`${city.id}:${retry}`} {...mapProps} />
                ) : (
                  <div className="native-map-loading" role="status">
                    {t('Loading the {city} map…', { city: t(city.name) })}
                  </div>
                )}
              </section>
              {!compactScreen && <div className="timeline-wrap">{timeControl}</div>}
            </>
          )}
        </main>
      )}
      <dialog
        ref={dialog}
        className="info-dialog"
        onCancel={() => setModal(null)}
        onClick={(e) => {
          if (e.target === dialog.current) setModal(null);
        }}
        aria-labelledby="dialog-title"
      >
        <div className="dialog-content">
          <button
            className="dialog-close icon-button"
            aria-label={t('Close information')}
            onClick={() => setModal(null)}
          >
            <X size={22} />
          </button>
          {modal === 'areas' ? (
            <AreaDownloads
              activeId={area?.id}
              onUse={(next) => {
                setCityId(next.cityId);
                setAreaId(next.id);
                preference('cw-city', next.cityId);
                preference('cw-area', next.id);
                setDeparture(localNow(getCity(next.cityId).timeZone));
                setRetry((n) => n + 1);
                setEditing(false);
                setModal(null);
                navigate('planner');
              }}
            />
          ) : modal === 'method' ? (
            <>
              <h2 id="dialog-title">{t('How estimates work')}</h2>
              <p>
                {t(
                  'Cooler Walks compares the fastest mapped walking route with the best of a small set of alternatives within your extra-time limit.',
                )}
              </p>
              <div className="method-item">
                <Sun size={24} />
                <div>
                  <h3>{t('Estimated building shade')}</h3>
                  <p>
                    {t(city.buildingNotes ?? '')}
                    {t(
                      ' Where enabled, we sample paths at intervals of at most 8 metres, using the sun position when you are expected to reach each point. Each route uses its own walking time at 4.8 km/h, including all legs through your stops. Pauses and crossing waits are not included. This estimates obstruction of direct sunlight; it is not a heat measurement or weather forecast.',
                    )}
                  </p>
                </div>
              </div>
              <div className="method-item">
                <Leaf size={24} />
                <div>
                  <h3>{t('Greenery is a separate measure')}</h3>
                  <p>
                    {t(
                      '“Near trees” is the share of a walk within 15 metres of a recorded tree. It is not canopy coverage or shade. Clouds and terrain shadows are not modelled.',
                    )}
                  </p>
                  <p>{t(city.treeNotes ?? '')}</p>
                  {city.canopyPilot && (
                    <>
                      <h3>{t('Tree shade')}</h3>
                      <p>
                        {t(
                          'Tree shade is included across the supported Zurich map. It traces sunlight through 1 m vegetation columns from the 2021–2022 LiDAR survey, using the lowest and highest observed returns. It assumes opaque foliage between those heights. The survey was mainly leaf-off: summer crowns, gaps and light transmission remain uncertain. This is a full-foliage scenario, not a prediction of seasonal leaf cover. It is included by default. Winter leaf loss is not predicted; field validation remains pending.',
                        )}
                      </p>
                    </>
                  )}
                </div>
              </div>
              <div className="method-item">
                <Waves size={24} />
                <div>
                  <h3>{t('Water is a separate preference')}</h3>
                  <p>
                    {t(
                      'We measure the share of the walk within 50 metres of mapped surface water. Waterside is considered alongside your other wishes within the detour limit. Proximity does not guarantee access, visibility or a temperature benefit.',
                    )}
                  </p>
                </div>
              </div>
              <div className="method-item">
                <Info size={24} />
                <div>
                  <h3>{t('Know the limits')}</h3>
                  <p>
                    {t(
                      'Shade and sun comparisons need at least 95% known exposure. Unknown sections cannot improve a recommendation; low sun below 10° is withheld. Zurich uses municipal pavements and crossings by default. Beta cities may use street centrelines. Uncertain walking heights stay unknown. Access, closures and shade still need field checks. The accessibility option avoids mapped barriers; it does not certify wheelchair suitability.',
                    )}
                  </p>
                </div>
              </div>
              <div className="method-item">
                <Mountain size={24} />
                <div>
                  <h3>{t('Flatter routes')}</h3>
                  <p>
                    {t(
                      'In Zurich, the cantonal ground model estimates ascent and descent. Flatter routes are considered alongside your other wishes within the detour limit. Comparisons require complete walking-height coverage. This does not guarantee a level or step-free path.',
                    )}
                  </p>
                  <p>{t('Walking times do not yet account for slopes.')}</p>
                </div>
              </div>
              <div className="method-item">
                <TrafficCone size={24} />
                <div>
                  <h3>{t('Calmer streets, starting in Zurich')}</h3>
                  <p>
                    {t(
                      'Zurich pavement sections are associated with nearby mapped streets and implemented traffic zones. Within 20 metres of a main road at ground level, that proximity takes precedence. Calmer streets considers main-road and motor-access distances alongside your other wishes. Tempo-30 streets are separate from pedestrian paths. At least 95% classified context is needed for comparison; unknown sections cannot improve a route. This estimates street context, not live traffic, noise or safety. Field validation is pending.',
                    )}
                  </p>
                </div>
              </div>
              {city.capabilities.vehicleCounts && (
                <p>
                  {t(
                    'Nearby counters show measured 2025 weekday/hour averages for your estimated passing time. Missing coverage stays explicit. These are historical point observations, not live traffic or whole-route vehicle totals. Street-context ranking stays separate.',
                  )}
                </p>
              )}
              {city.capabilities.trafficZones && (
                <p>
                  {t(
                    'The 30/20 map button shows official zone boundaries. Solid outlines: implemented city zones. Dashed outlines: cantonal legal orders, with implementation unconfirmed. The canton source excludes Zurich and Winterthur; Zurich uses the city’s implemented-zone dataset. Cantonal orders are shown for context only and do not affect route ranking. Boundaries do not establish every street’s speed limit or traffic volume. Signs on the street take precedence.',
                  )}
                </p>
              )}
              <h3>{t('Sources & privacy')}</h3>
              <p>
                <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                  {t('OpenStreetMap contributors')}
                </a>
                {city.sources.map((source) => (
                  <span key={source.url}>
                    {' '}
                    ·{' '}
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {t(source.label ?? '')}
                    </a>
                  </span>
                ))}
              </p>
              <p>{t(city.sourceSummary ?? '')}</p>
              <p>
                {t(
                  'Search and route calculation use the downloaded pilot data on your device. We save only city, selected area, language, units, downloaded maps and whether you’ve opened the planner. Location is requested only when you choose it; your browser’s location service may contact its own provider. We do not save your precise journeys.',
                )}
              </p>
              <p>
                <a href={localPath('/privacy/index.html')}>{t('Read the privacy notice')}</a> ·{' '}
                <a href={localPath('/support/index.html')}>{t('Help & feedback')}</a>
              </p>
            </>
          ) : modal === 'coverage' ? (
            <>
              <h2 id="dialog-title">{t('Coverage')}</h2>
              {cityOptions.map((coveredCity) => (
                <div className="coverage-city" key={coveredCity.id}>
                  <div>
                    <h3>
                      {t(coveredCity.name ?? '')}, {t(coveredCity.country ?? '')}
                    </h3>
                    <span
                      className={`status-badge ${coveredCity.status === 'review' ? 'muted' : ''}`}
                    >
                      {coveredCity.status === 'review'
                        ? t('Data under review')
                        : coveredCity.beta
                          ? t('Beta · pilot area')
                          : t('Zurich focus')}
                    </span>
                  </div>
                  <p>{t(coveredCity.coverageDescription ?? '')}</p>
                  {coveredCity.status === 'pilot' ? (
                    <>
                      <dl>
                        <div>
                          <dt>{t('Greenery')}</dt>
                          <dd>
                            {coveredCity.capabilities.greenery
                              ? t('Recorded tree proximity')
                              : t('Unavailable')}
                          </dd>
                        </div>
                        <div>
                          <dt>{t('Sun & shade')}</dt>
                          <dd>
                            {coveredCity.capabilities.buildingShade
                              ? coveredCity.detailedShade
                                ? t('3D roofs + ground elevations · experimental')
                                : t('Buildings only · experimental')
                              : t('Not enabled')}
                          </dd>
                        </div>
                        {coveredCity.canopyPilot && (
                          <div>
                            <dt>{t('Tree shade')}</dt>
                            <dd>{t('Full foliage assumption · Zurich map')}</dd>
                          </div>
                        )}
                        <div>
                          <dt>{t('Water')}</dt>
                          <dd>
                            {coveredCity.capabilities.water
                              ? t('Mapped surface-water proximity')
                              : t('Unavailable')}
                          </dd>
                        </div>
                        <div>
                          <dt>{t('Calmer streets')}</dt>
                          <dd>
                            {coveredCity.capabilities.trafficCalming
                              ? t('Street types & official zones · experimental')
                              : t('Not enabled')}
                          </dd>
                        </div>
                        <div>
                          <dt>{t('Not included')}</dt>
                          <dd>
                            {coveredCity.canopyPilot
                              ? t('Hill shadows, fountains')
                              : t('Tree shade, hill shadows, fountains')}
                          </dd>
                        </div>
                      </dl>
                      <button
                        className="text-button"
                        onClick={() => {
                          changeCity(coveredCity.id);
                          setCoverage(true);
                          navigate('planner');
                          setModal(null);
                        }}
                      >
                        {t('Explore ')}
                        {t(coveredCity.name ?? '')} <ArrowRight size={16} />
                      </button>
                    </>
                  ) : (
                    <p>{t(coveredCity.reviewSummary ?? '')}</p>
                  )}
                </div>
              ))}
              <p className="small-copy">{t('Coverage and available features vary by city.')}</p>
            </>
          ) : isNativeApp ? (
            <>
              <h2 id="dialog-title">{t('About Cooler Walks')}</h2>
              <p>{t('Included and downloaded maps work offline.')}</p>
              <button className="primary" onClick={() => setModal('areas')}>
                {t('Manage offline maps ')}
                <Download size={18} />
              </button>
              <div className="install-instructions">
                <h3>{t('Map data')}</h3>
                <p>
                  {t(
                    'Source dates and coverage are shown in “How estimates work”. Data updates arrive with app updates; live closures and turn-by-turn navigation are not included.',
                  )}
                </p>
                <h3>{t('Location')}</h3>
                <p>
                  {t(
                    'Location is requested only when you tap “Use my location”. Journeys are calculated on your device and are not saved as a history. This app does not track you in the background.',
                  )}
                </p>
              </div>
              <p className="small-copy">
                {t(
                  'Development preview · version {version}. This build has not been submitted to the App Store or Google Play.',
                  { version: appVersion },
                )}
              </p>
            </>
          ) : (
            <>
              <h2 id="dialog-title">{t('Install Cooler Walks')}</h2>
              <p>{t('Add Cooler Walks to your home screen, or keep using it in your browser.')}</p>
              {installEvent ? (
                <button
                  className="primary"
                  onClick={async () => {
                    await installEvent.prompt();
                    await installEvent.userChoice;
                    setInstallEvent(null);
                  }}
                >
                  {t('Install Cooler Walks ')}
                  <Download size={18} />
                </button>
              ) : (
                <div className="install-instructions">
                  <h3>{t('On iPhone or iPad')}</h3>
                  <p>{t('Open in Safari, use Share, then “Add to Home Screen”.')}</p>
                  <h3>{t('On Android or a computer')}</h3>
                  <p>
                    {t(
                      'Open in Chrome or Edge and use the browser’s install action or menu. The action appears when supported.',
                    )}
                  </p>
                </div>
              )}
              <p className="small-copy">
                {t(
                  'Download a map for complete offline planning. Without a download, the app may only have the map and 3D tiles used on previous trips. Saved data keeps its source dates; closures and live navigation are not provided.',
                )}
              </p>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
