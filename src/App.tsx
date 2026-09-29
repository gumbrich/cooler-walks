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
  Footprints,
  Globe2,
  Info,
  Leaf,
  LocateFixed,
  MapPin,
  Moon,
  PanelTopClose,
  Plus,
  Sun,
  Waves,
  X,
} from 'lucide-react';
import { cities, getCity } from './lib/cities';
import { formatDistance } from './lib/geo';
import { localNow, timeLabel, toInstant } from './lib/time';
import type { PilotData, Point, Route, RouteResult } from './lib/types';
import { PlaceSearch, type Endpoint } from './components/Search';
import { WalkingMap } from './components/Map';
import { currentLocation, isNativeApp } from './lib/platform';
import type { FeatureCollection } from 'geojson';
import { getArea, loadSavedArea, bundledAreas } from './lib/areas';
import { cityForArea } from './lib/area-specs';
import { AreaDownloads } from './components/AreaDownloads';

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
  const [cityId, setCityId] = useState(() => readPreference('cw-city', 'ch-zurich'));
  const [areaId, setAreaId] = useState(() => readPreference('cw-area', cityId));
  const area = getArea(areaId, cityId);
  const city = useMemo(() => (area ? cityForArea(area) : getCity(cityId)), [area, cityId]);
  const [mapData, setMapData] = useState<FeatureCollection | null>(null);
  const [view, setView] = useState(() =>
    isNativeApp ||
    new URLSearchParams(location.search).get('view') === 'planner' ||
    readPreference('cw-visited', '') === 'yes'
      ? 'planner'
      : 'home',
  );
  const [data, setData] = useState<PilotData | null>(null),
    [dataState, setDataState] = useState('loading'),
    [retry, setRetry] = useState(0);
  const [start, setStart] = useState<Endpoint | null>(null),
    [end, setEnd] = useState<Endpoint | null>(null);
  const [stops, setStops] = useState<{ id: number; value: Endpoint | null }[]>([]);
  const stopId = useRef(0);
  const [preferWater, setPreferWater] = useState(false);
  const [sunlight, setSunlight] = useState<'shade' | 'sun'>('shade');
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
    requestId = useRef(0),
    initialized = useRef(false);
  const locationRequest = useRef(0);
  useEffect(() => {
    locationRequest.current++;
    const controller = new AbortController();
    setData(null);
    setMapData(null);
    setResult(null);
    setStart(null);
    setEnd(null);
    setStops([]);
    setPreferWater(false);
    setSunlight('shade');
    setError('');
    setDataState('loading');
    setBusy(false);
    setPick(null);
    requestId.current++;
    worker.current?.terminate();
    worker.current = null;
    initialized.current = false;
    if (city.status !== 'pilot') {
      setDataState('review');
      return () => controller.abort();
    }
    (async () => {
      if (area) {
        const saved = await loadSavedArea(area);
        if (controller.signal.aborted) return;
        if (saved) {
          setMapData(saved.map);
          return saved.data;
        }
      }
      if (!city.dataUrl || (isNativeApp && !(await bundledAreas()).includes(area?.id ?? city.id))) {
        throw new Error('Download this walking area to open its map and plan offline.');
      }
      const r = await fetch(city.dataUrl, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
      });
      if (!r.ok)
        throw new Error('The pilot data could not load. Check your connection and try again.');
      return r.json();
    })()
      .then((d: PilotData) => {
        if (controller.signal.aborted) return;
        if (
          d.cityId !== city.id ||
          d.version !== city.dataVersion ||
          !Array.isArray(d.nodes) ||
          !Array.isArray(d.edges) ||
          !d.places?.length ||
          !Array.isArray(d.water)
        )
          throw new Error('Pilot data version mismatch');
        setData(d);
        setDataState('ready');
        // The first city request can precede worker activation. Save that city
        // explicitly once the production worker is ready, including after updates.
        if (!isNativeApp && city.dataUrl && import.meta.env.PROD && 'serviceWorker' in navigator) {
          const saveCity = (target: ServiceWorker | null) => {
            if (!controller.signal.aborted)
              target?.postMessage({ type: 'CACHE_CITY', urls: [city.dataUrl, city.mapUrl] });
          };
          navigator.serviceWorker.addEventListener(
            'controllerchange',
            () => saveCity(navigator.serviceWorker.controller),
            { signal: controller.signal },
          );
          void navigator.serviceWorker.ready.then((registration) => {
            saveCity(navigator.serviceWorker.controller ?? registration.active);
          });
        }
        const from = d.places.find((p) => p.name === city.defaultJourney?.[0]),
          to = d.places.find((p) => p.name === city.defaultJourney?.[1]);
        if (!from || !to) throw new Error('Reference places are missing from the city bundle');
        setStart({ name: from.name, point: from.point });
        setEnd({ name: to.name, point: to.point });
        const w = new Worker(new URL('./route-worker.ts', import.meta.url), { type: 'module' });
        worker.current = w;
        w.onmessage = (e) => {
          if (e.data.id !== requestId.current) return;
          setBusy(false);
          if (e.data.error) {
            setError(e.data.error);
            setResult(null);
          } else {
            setError('');
            setResult(e.data.result);
            setSelected(e.data.result.alternative?.id ?? 'fastest');
          }
        };
        w.onerror = () => {
          if (worker.current !== w) return;
          setBusy(false);
          setError('The route calculator could not start. Reload to try again.');
        };
      })
      .catch((e) => {
        if (!controller.signal.aborted && e.name !== 'AbortError') {
          setDataState('error');
          setError(
            e instanceof TypeError || e.name === 'TimeoutError'
              ? 'The pilot data could not load. Check your connection and try again.'
              : e instanceof Error
                ? e.message
                : 'The walking area could not load. Open downloads to try again.',
          );
        }
      });
    return () => {
      controller.abort();
      worker.current?.terminate();
    };
  }, [city, retry]);
  useEffect(() => {
    requestId.current++;
    setResult(null);
    if (!data || !start || !end || stops.some((stop) => !stop.value) || !worker.current) {
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
        ...(!initialized.current ? { data, city } : {}),
        start: start.point,
        end: end.point,
        departure: instant,
        extra,
        waypoints: stops.map((stop) => stop.value!.point),
        preferWater,
        sunlight,
      });
      initialized.current = true;
    }, 180);
    return () => clearTimeout(timer);
  }, [data, start, end, stops, preferWater, sunlight, departure, extra, city]);
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
    history.pushState({}, '', next === 'planner' ? '/?view=planner' : '/');
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
    setCityId(id);
    setAreaId(id);
    preference('cw-city', id);
    preference('cw-area', id);
    setDeparture(localNow(getCity(id).timeZone));
    setEditing(false);
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
  }, [modal, pick, editing, view]);
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
  const mapPick = (p: Point) => {
    const value = { name: `Map point · ${p[1].toFixed(4)}, ${p[0].toFixed(4)}`, point: p };
    if (pick === 'start') setStart(value);
    else if (pick === 'end') setEnd(value);
    else
      setStops((current) => current.map((stop) => (stop.id === pick ? { ...stop, value } : stop)));
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
  const showSun = isShade && sunlight === 'sun';
  const percentage = (r: Route) =>
    Math.round(
      isShade
        ? ((showSun ? r.sunMeters : r.shadeMeters) / Math.max(1, r.distance - r.unknownMeters)) *
            100
        : (r.greenMeters / r.distance) * 100,
    );
  const timeMinutes =
    Number(timeLabel(departure).split(':')[0]) * 60 + Number(timeLabel(departure).split(':')[1]);
  const timeControl = (
    <div className="time-control">
      <div className="time-heading">
        <span>
          <Sun size={18} /> Time of your walk
        </span>
        <strong>
          {timeLabel(departure)}{' '}
          <small>{city.timeZone.split('/')[1].replaceAll('_', ' ')} time</small>
        </strong>
      </div>
      <input
        aria-label="Departure time"
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
            ? 'Updating your walk…'
            : result?.mode === 'night'
              ? 'After dark · direct sun is not relevant'
              : result?.mode === 'low-sun'
                ? 'Low sun · building estimate unavailable'
                : isShade
                  ? `Move time. See the estimated ${showSun ? 'sun' : 'shade'} change.`
                  : 'Tree proximity stays the same throughout the day.'}
        </span>
        <label className="date-label">
          Date
          <input
            aria-label="Departure date"
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
      className={`route-card ${selected === route.id ? 'selected' : ''} ${showSun ? 'sun-route' : ''}`}
      onClick={() => setSelected(route.id)}
      aria-pressed={selected === route.id}
    >
      <div className="route-card-top">
        <span className="route-icon">
          {index ? (
            result?.preference === 'water' ? (
              <Waves size={20} />
            ) : result?.preference === 'sun' ? (
              <Sun size={20} />
            ) : (
              <Leaf size={20} />
            )
          ) : (
            <Footprints size={20} />
          )}
        </span>
        <span className="route-name">
          {index
            ? result?.preference === 'water'
              ? 'More time near water'
              : result?.preference === 'sun'
                ? 'More estimated sun'
                : isShade
                  ? 'More estimated shade'
                  : 'Greener route'
            : 'Fastest walk'}
          <small>
            {index
              ? `+${(route.minutes - result!.fastest.minutes).toFixed(1)} min · best of ${result!.candidateCount} evaluated`
              : stops.length
                ? 'The shortest walk through all stops'
                : 'The shortest walk on this network'}
          </small>
        </span>
        <span className="route-radio">{selected === route.id && <Check size={12} />}</span>
      </div>
      <div className="route-numbers">
        <strong>
          {Math.ceil(route.minutes)}
          <small> min</small>
        </strong>
        <span>{formatDistance(route.distance, units)}</span>
        <span className="exposure-number">
          {percentage(route)}%
          <small>{isShade ? (showSun ? 'estimated sun' : 'estimated shade') : 'near trees'}</small>
        </span>
      </div>
      <div className="exposure-bar" aria-hidden="true">
        <span style={{ width: `${percentage(route)}%` }} />
      </div>
      <div className="route-card-caption">
        {isShade
          ? `${Math.round((1 - route.unknownMeters / route.distance) * 100)}% model coverage · buildings only`
          : 'Within 15 m of a recorded tree · not canopy shade'}
      </div>
      {city.capabilities.water && (
        <div className="route-water">
          <Waves size={14} />
          <span>
            <strong>{Math.round((route.waterMeters / route.distance) * 100)}%</strong> near mapped
            water · {formatDistance(route.waterMeters, units)}
          </span>
        </div>
      )}
    </button>
  );
  const mapProps = {
    city,
    data,
    mapData,
    result,
    selected,
    onSelect: setSelected,
    pick:
      typeof pick === 'number' ? `stop ${stops.findIndex((stop) => stop.id === pick) + 1}` : pick,
    onPick: mapPick,
    showCoverage: coverage,
    onCoverage: () => setCoverage(!coverage),
  };
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="header">
        <button className="brand" onClick={() => navigate('home')} aria-label="Cooler Walks home">
          <img src="/icon.svg" alt="" />
          <span>
            cooler walks<span className="brand-dot">.</span>
          </span>
        </button>
        <nav aria-label="Main navigation">
          <button
            className={view === 'planner' ? 'active' : ''}
            onClick={() => navigate('planner')}
          >
            Plan a walk
          </button>
          <button onClick={() => setModal('method')}>Our approach</button>
        </nav>
        <div className="header-right">
          <div className="city-select">
            <MapPin size={16} />
            <label className="sr-only" htmlFor="city">
              City
            </label>
            <select id="city" value={city.id} onChange={(e) => changeCity(e.target.value)}>
              {[...cities]
                .sort((a, b) => Number(a.status === 'review') - Number(b.status === 'review'))
                .map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.localName}, {c.country}
                    {c.status === 'review' ? ' · under review' : ''}
                  </option>
                ))}
            </select>
            <ChevronDown size={14} />
          </div>
          <button
            className="icon-button install-button"
            aria-label={isNativeApp ? 'About this app' : 'Install Cooler Walks'}
            onClick={() => setModal('install')}
          >
            {isNativeApp ? <Info size={19} /> : <Download size={19} />}
          </button>
        </div>
      </header>
      {!online && (
        <div className="offline-banner" role="status">
          Offline ·{' '}
          {isNativeApp
            ? 'Included and downloaded areas work without a connection.'
            : data
              ? 'Using previously downloaded pilot data. Source dates are in the method view.'
              : 'Open a previously saved pilot or reconnect to load data.'}
        </div>
      )}
      {view === 'home' ? (
        <main id="main" className="home">
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow">
                <span className="tiny-sun">✳</span> A city is better on foot
              </div>
              <h1>
                {sunlight === 'sun' ? 'A little more sun.' : 'A little less sun.'}
                <br />A better <em>walk.</em>
              </h1>
              <p>
                Take a different path through the city. Find more greenery, choose sun or shade
                where estimates are available, and see what a few extra minutes can change.
              </p>
              <button className="primary hero-cta" onClick={() => navigate('planner')}>
                Find a cooler walk <ArrowRight size={21} />
              </button>
              <div className="pilot-note">
                <span className="pilot-dot" /> Starting small. Walking {city.name}.
                <button onClick={() => setModal('coverage')}>
                  Explore the pilot <ArrowRight size={14} />
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
                  <p>Data under review</p>
                </div>
              )}
              <div className="atlas-title">
                <span>THE WALKING ATLAS</span>
                <strong>
                  {city.localName}
                  <sup>{String(cities.indexOf(city) + 1).padStart(2, '0')}</sup>
                </strong>
              </div>
              <div className="atlas-coordinate">
                {Math.abs(city.center[1]).toFixed(3)}° {city.center[1] < 0 ? 'S' : 'N'} &nbsp;{' '}
                {Math.abs(city.center[0]).toFixed(3)}° {city.center[0] < 0 ? 'W' : 'E'}
              </div>
              {result && (
                <div className="hero-route-note">
                  <span className="route-note-icon">
                    <Leaf size={23} />
                  </span>
                  <div>
                    <strong>
                      {result.alternative
                        ? result.preference === 'water'
                          ? 'A little closer to the water.'
                          : result.preference === 'sun'
                            ? 'A little more sunshine along the way.'
                            : isShade
                              ? 'A little more shade along the way.'
                              : 'A little more green along the way.'
                        : 'Your city. A walk worth taking.'}
                    </strong>
                    <span>
                      {start?.name} → {end?.name}
                    </span>
                    <small>Computed pilot route · {timeLabel(departure)} local time</small>
                  </div>
                  <ArrowRight size={20} />
                </div>
              )}
            </div>
          </section>
          <section className="home-bottom" aria-label="How Cooler Walks works">
            <div className="home-intro">
              <span className="eyebrow">Good walks. Open data.</span>
              <h2>
                A fresh way to
                <br />
                read the city.
              </h2>
            </div>
            <article>
              <span className="number">01 /</span>
              <h3>Find your way</h3>
              <p>
                Real pedestrian paths, with a little room to wander. You decide how much longer to
                walk.
              </p>
            </article>
            <article>
              <span className="number">02 /</span>
              <h3>Follow the light</h3>
              <p>
                Explore how buildings change direct sunlight through the day. An estimate, with its
                limits in view.
              </p>
            </article>
            <article>
              <span className="number">03 /</span>
              <h3>Know the ground</h3>
              <p>
                See the coverage and sources behind your walk. Each city starts with a carefully
                bounded pilot.
              </p>
            </article>
          </section>
          <footer className="home-footer">
            <span>Made for the everyday walk.</span>
            <button onClick={() => setModal('method')}>
              Method, sources & privacy <ArrowRight size={14} />
            </button>
            <span>
              <a href="/support/index.html">Help & feedback</a> ·{' '}
              <a href="/privacy/index.html">Privacy</a>
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
              <span className="eyebrow">The next chapter</span>
              <h1>
                {city.localName},<br />
                <em>under review.</em>
              </h1>
              <p>{city.reviewSummary}</p>
              <div className="review-tags">
                <span>France</span>
                <span>{city.timeZone}</span>
                <span>Routing unavailable</span>
              </div>
              <button className="primary" onClick={() => changeCity('ch-zurich')}>
                Explore the Zurich pilot <ArrowRight size={18} />
              </button>
              <button className="text-button" onClick={() => setModal('coverage')}>
                See coverage & next steps
              </button>
            </section>
          ) : (
            <>
              <aside className="planner-panel" aria-label="Plan and compare walks">
                <div className="sheet-handle" />
                <div className="panel-title">
                  <div>
                    <span className="eyebrow">A different way there</span>
                    <h1>Let’s take a walk.</h1>
                  </div>
                  <button
                    className="mobile-edit icon-button"
                    aria-label={editing ? 'Close trip editor' : 'Edit trip'}
                    onClick={() => setEditing(!editing)}
                  >
                    {editing ? <PanelTopClose size={21} /> : <MapPin size={21} />}
                  </button>
                </div>
                <div className="trip-compact">
                  <span>
                    <b>A</b>
                    {start?.name ?? 'Choose start'}
                    <ArrowRight size={15} />
                    <b>B</b>
                    {end?.name ?? 'Choose destination'}
                  </span>
                  <button onClick={() => setEditing(true)}>Edit</button>
                </div>
                {!!stops.length && (
                  <p className="trip-stop-summary">
                    Via{' '}
                    {stops.map((stop, i) => stop.value?.name ?? `choose stop ${i + 1}`).join(' → ')}
                  </p>
                )}
                <form
                  className="trip-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setEditing(false);
                  }}
                >
                  <div className="endpoint-fields">
                    <span className="endpoint-track">
                      <i>A</i>
                      <span />
                      <i>B</i>
                    </span>
                    <div className="fields">
                      <PlaceSearch
                        key={`start-${city.id}`}
                        label="From"
                        value={start}
                        places={data?.places ?? []}
                        onChange={setStart}
                        onPick={() => chooseMap('start')}
                      />
                      <div className="waypoint-editor">
                        {stops.map((stop, index) => (
                          <div className="waypoint-row" key={stop.id}>
                            <span className="stop-number" aria-hidden="true">
                              {index + 1}
                            </span>
                            <PlaceSearch
                              label={`Stop ${index + 1}`}
                              value={stop.value}
                              places={data?.places ?? []}
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
                                    aria-label={`Move stop ${index + 1} earlier`}
                                    disabled={index === 0}
                                    onClick={() => moveStop(index, -1)}
                                  >
                                    <ArrowUp size={15} />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`Move stop ${index + 1} later`}
                                    disabled={index === stops.length - 1}
                                    onClick={() => moveStop(index, 1)}
                                  >
                                    <ArrowDown size={15} />
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                aria-label={`Remove stop ${index + 1}`}
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
                          <p className="stop-help">Time spent at stops is not included.</p>
                        )}
                      </div>
                      <PlaceSearch
                        key={`end-${city.id}`}
                        label="To"
                        value={end}
                        places={data?.places ?? []}
                        onChange={setEnd}
                        onPick={() => chooseMap('end')}
                      />
                    </div>
                    <button
                      type="button"
                      className="swap-button"
                      aria-label="Swap start and destination"
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
                      <LocateFixed size={14} /> Use my location
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
                        <Plus size={16} /> Add a stop
                      </button>
                    )}
                  </div>
                  <fieldset className="detour">
                    <legend>
                      Room for a detour{' '}
                      <span>{stops.length ? 'For the whole trip' : 'Extra walking time'}</span>
                    </legend>
                    <div className="segmented">
                      {[0, 5, 10].map((n) => (
                        <button
                          key={n}
                          type="button"
                          aria-pressed={extra === n}
                          onClick={() => setExtra(n)}
                        >
                          {n === 0 ? 'Direct' : `+${n} min`}
                          {extra === n && <Check size={14} />}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  {city.capabilities.buildingShade && (
                    <fieldset className="sunlight-preference">
                      <legend>Find your light</legend>
                      <div className="sunlight-options">
                        {(['shade', 'sun'] as const).map((value) => (
                          <label
                            key={value}
                            className={sunlight === value ? `active ${value}` : ''}
                          >
                            <input
                              type="radio"
                              name="sunlight"
                              value={value}
                              checked={sunlight === value}
                              onChange={() => setSunlight(value)}
                            />
                            {value === 'sun' ? <Sun size={18} /> : <Leaf size={18} />}
                            Prefer {value}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  {city.capabilities.water && (
                    <label className={`water-preference ${preferWater ? 'active' : ''}`}>
                      <Waves size={21} />
                      <span>
                        <strong>Prefer waterside</strong>
                        <small>More of your walk near mapped water</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={preferWater}
                        onChange={(e) => setPreferWater(e.target.checked)}
                      />
                    </label>
                  )}
                  {preferWater && (
                    <p className="preference-help">
                      Water proximity takes priority over your{' '}
                      {city.capabilities.buildingShade ? 'sunlight' : 'greenery'} preference.
                    </p>
                  )}
                  <button className="primary mobile-save" type="submit">
                    Show my walk <ArrowRight size={17} />
                  </button>
                </form>
                <div className="results" aria-busy={busy}>
                  <div className="results-heading">
                    <span className="eyebrow">Your ways there</span>
                    <button className="icon-text" onClick={() => setModal('method')}>
                      <Info size={14} /> How we estimate
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
                        Finding your way through the city…
                      </>
                    ) : error ? (
                      <>
                        <Info size={20} />
                        <div>
                          <strong>Let’s adjust this walk.</strong>
                          <p>{error}</p>
                          {dataState === 'error' && (
                            <>
                              <button onClick={() => setRetry(retry + 1)}>Try loading again</button>{' '}
                              <button onClick={() => setModal('areas')}>Open downloads</button>
                            </>
                          )}
                        </div>
                      </>
                    ) : null}
                  </div>
                  {!busy && !error && dataState === 'loading' && (
                    <div className="status loading">
                      <span className="spinner" />
                      Unfolding the {city.name} map…
                    </div>
                  )}
                  {!start || !end || stops.some((stop) => !stop.value) ? (
                    <div className="empty-hint">
                      <MapPin size={22} />
                      <p>Choose a start, destination and any added stops to find your walk.</p>
                    </div>
                  ) : null}
                  {city.status === 'pilot' && !city.capabilities.buildingShade && (
                    <p className="capability-note">
                      <Leaf size={16} /> Greenery prototype · sun/shade estimates are not enabled.
                    </p>
                  )}
                  {result && (
                    <>
                      {[result.fastest, ...(result.alternative ? [result.alternative] : [])].map(
                        routeCard,
                      )}
                      {!result.alternative && (
                        <p className="result-note">
                          {extra === 0
                            ? 'With no extra walking time, the fastest walk through your chosen points is your route.'
                            : sunlight === 'sun' && !preferWater && !isShade
                              ? 'A sun-based recommendation is unavailable for this time or coverage. The fastest walk is shown.'
                              : preferWater
                                ? 'No route with meaningfully more water proximity was found within your time limit.'
                                : sunlight === 'sun'
                                  ? 'No meaningfully sunnier alternative was found within your time limit.'
                                  : 'No meaningfully better alternative was found within your time limit.'}
                        </p>
                      )}
                      {result.mode === 'night' && (
                        <p className="result-note">
                          <Moon size={15} /> Direct sun is not relevant after dark. Greenery is
                          shown separately.
                        </p>
                      )}
                      {result.mode === 'low-sun' && (
                        <p className="result-note">
                          The sun is too low for this bounded building model. Tree proximity is
                          shown instead.
                        </p>
                      )}
                      {result.mode === 'greenery' && city.capabilities.buildingShade && (
                        <p className="result-note">
                          Building-shade coverage is insufficient for comparison. These are greenery
                          indicators.
                        </p>
                      )}
                    </>
                  )}
                  {chosen && (
                    <details className="walk-details">
                      <summary>
                        About this walk <ChevronDown size={15} />
                      </summary>
                      <p>
                        Departure: {departure.replace('T', ' ')} · {city.timeZone}.
                      </p>
                      {!!stops.length && (
                        <p>
                          Stops:{' '}
                          {stops
                            .map((stop, index) => stop.value?.name ?? `Choose stop ${index + 1}`)
                            .join(' → ')}
                          . Time spent at stops is not included.
                        </p>
                      )}
                      <p>
                        {chosen.streets
                          .filter((s, i, a) => s !== 'Walking path' && a.indexOf(s) === i)
                          .slice(0, 12)
                          .join(' → ')}
                      </p>
                      <p>
                        {chosen.steps ? 'Includes mapped steps. ' : ''}Walking time assumes 4.8
                        km/h; crossing waits are not included.{' '}
                        {result &&
                          `Start and destination snap ${Math.round(result.startSnap)} m and ${Math.round(result.endSnap)} m to the mapped network.`}
                      </p>
                      {result?.waypoints.length ? (
                        <p>
                          Stop snapping:{' '}
                          {result.waypoints
                            .map((stop, index) => `${index + 1}: ${Math.round(stop.snap)} m`)
                            .join(' · ')}
                          .
                        </p>
                      ) : null}
                      {city.capabilities.water && (
                        <p>
                          Near water: within 50 m of mapped surface water, including bridges.
                          Proximity does not establish a view, access to the bank, drinking water or
                          a cooling benefit.
                        </p>
                      )}
                      {isShade && (
                        <p>
                          Direct sun: about {Math.round(chosen.sunMeters / 80)} min. Unknown:{' '}
                          {formatDistance(chosen.unknownMeters, units)}. Percentage uses modelled
                          distance only. Flat-ground buildings; no clouds, trees or terrain shadows.
                        </p>
                      )}
                    </details>
                  )}
                </div>
                <button className="downloads-link" onClick={() => setModal('areas')}>
                  <Download size={17} /> Offline maps <ArrowRight size={16} />
                </button>
                <div className="panel-footer">
                  <button onClick={() => setModal('coverage')}>
                    <span className="pilot-dot" /> {city.coverageLabel} pilot <Info size={13} />
                  </button>
                  <button
                    onClick={() => {
                      const next = units === 'metric' ? 'imperial' : 'metric';
                      setUnits(next);
                      preference('cw-units', next);
                    }}
                    aria-label={`Switch to ${units === 'metric' ? 'imperial' : 'metric'} units`}
                  >
                    {units === 'metric' ? 'km' : 'mi'}
                  </button>
                </div>
              </aside>
              <section className="planner-map" aria-label="Walking route map">
                <WalkingMap key={`${city.id}:${retry}`} {...mapProps} />
                <div className="map-top-pill">
                  <Leaf size={15} /> A little more green. A little less rush.
                </div>
              </section>
              <div className="timeline-wrap">{timeControl}</div>
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
            aria-label="Close information"
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
              <span className="eyebrow">A little transparency</span>
              <h2 id="dialog-title">
                A model of sunlight.
                <br />
                <em>A clearer choice.</em>
              </h2>
              <p>
                Cooler Walks compares the fastest mapped walking route with the best of a small set
                of alternatives within your extra-time limit.
              </p>
              <div className="method-item">
                <Sun size={24} />
                <div>
                  <h3>Estimated building shade</h3>
                  <p>
                    {city.buildingNotes} Where enabled, we sample paths every 8 metres at your
                    selected departure instant. This is a flat-ground snapshot, not a measurement of
                    heat or a weather forecast.
                  </p>
                </div>
              </div>
              <div className="method-item">
                <Leaf size={24} />
                <div>
                  <h3>Greenery is a separate measure</h3>
                  <p>
                    “Near trees” is the share of a walk within 15 metres of a recorded tree. It is
                    not canopy coverage or shade. Tree crowns, foliage, clouds and terrain shadows
                    are not modelled.
                  </p>
                  <p>{city.treeNotes}</p>
                </div>
              </div>
              <div className="method-item">
                <Waves size={24} />
                <div>
                  <h3>Water is a separate preference</h3>
                  <p>
                    We measure the share of the walk within 50 metres of mapped surface water.
                    “Prefer waterside” chooses the greatest share among the distinct alternatives
                    evaluated within your total detour budget; walking time breaks ties. It may
                    trade shade for water proximity. Mapped proximity does not guarantee access,
                    visibility or a temperature benefit.
                  </p>
                </div>
              </div>
              <div className="method-item">
                <Info size={24} />
                <div>
                  <h3>Know the limits</h3>
                  <p>
                    At least 95% model coverage is required to compare shade or sun. “Prefer sun”
                    ranks the known sunny share of the whole walk; unknown data cannot improve that
                    score. It stays your choice in every season. Low sun below 10° is withheld.
                    Streets may follow centrelines; we cannot identify the shadier pavement. Access
                    restrictions, closures and walking speed may differ on the ground. No
                    wheelchair-suitability claim is made.
                  </p>
                </div>
              </div>
              <h3>Sources & privacy</h3>
              <p>
                <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                  OpenStreetMap contributors
                </a>
                {city.sources.map((source) => (
                  <span key={source.url}>
                    {' '}
                    ·{' '}
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.label}
                    </a>
                  </span>
                ))}
              </p>
              <p>{city.sourceSummary}</p>
              <p>
                Search and route calculation use the downloaded pilot data on your device. We save
                only city, selected area, units, downloaded maps and whether you’ve opened the
                planner. Location is requested only when you choose it; your browser’s location
                service may contact its own provider. We do not save your precise journeys.
              </p>
              <p>
                <a href="/privacy/index.html">Read the privacy notice</a> ·{' '}
                <a href="/support/index.html">Help & feedback</a>
              </p>
            </>
          ) : modal === 'coverage' ? (
            <>
              <span className="eyebrow">The walking atlas</span>
              <h2 id="dialog-title">
                Small beginnings.
                <br />
                <em>Room to grow.</em>
              </h2>
              {cities.map((coveredCity) => (
                <div className="coverage-city" key={coveredCity.id}>
                  <div>
                    <h3>
                      {coveredCity.name}, {coveredCity.country}
                    </h3>
                    <span
                      className={`status-badge ${coveredCity.status === 'review' ? 'muted' : ''}`}
                    >
                      {coveredCity.status === 'pilot' ? 'Pilot area' : 'Data under review'}
                    </span>
                  </div>
                  <p>{coveredCity.coverageDescription}</p>
                  {coveredCity.status === 'pilot' ? (
                    <>
                      <dl>
                        <div>
                          <dt>Greenery</dt>
                          <dd>
                            {coveredCity.capabilities.greenery
                              ? 'Recorded tree proximity'
                              : 'Unavailable'}
                          </dd>
                        </div>
                        <div>
                          <dt>Sun & shade</dt>
                          <dd>
                            {coveredCity.capabilities.buildingShade
                              ? 'Buildings only · experimental'
                              : 'Not enabled'}
                          </dd>
                        </div>
                        <div>
                          <dt>Water</dt>
                          <dd>
                            {coveredCity.capabilities.water
                              ? 'Mapped surface-water proximity'
                              : 'Unavailable'}
                          </dd>
                        </div>
                        <div>
                          <dt>Not included</dt>
                          <dd>Tree shade, terrain, fountains</dd>
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
                        Explore {coveredCity.name} <ArrowRight size={16} />
                      </button>
                    </>
                  ) : (
                    <p>{coveredCity.reviewSummary}</p>
                  )}
                </div>
              ))}
              <p className="small-copy">
                A city appears here when we investigate it. Each capability launches only after its
                local data and routes are checked.
              </p>
            </>
          ) : isNativeApp ? (
            <>
              <span className="eyebrow">Your pocket walking atlas</span>
              <h2 id="dialog-title">
                Ready for
                <br />
                <em>a little exploring.</em>
              </h2>
              <p>
                Keep a walking atlas in your pocket with included and downloaded areas. Planning
                works offline.
              </p>
              <button className="primary" onClick={() => setModal('areas')}>
                Manage offline maps <Download size={18} />
              </button>
              <div className="install-instructions">
                <h3>Keep your data in view</h3>
                <p>
                  Source dates and coverage are shown in “How estimates work”. Data updates arrive
                  with app updates; live closures and turn-by-turn navigation are not included.
                </p>
                <h3>Location stays your choice</h3>
                <p>
                  Location is requested only when you tap “Use my location”. Journeys are calculated
                  on your device and are not saved as a history. This app does not track you in the
                  background.
                </p>
              </div>
              <p className="small-copy">
                Development preview · version 0.4.0. This build has not been submitted to the App
                Store or Google Play.
              </p>
            </>
          ) : (
            <>
              <span className="eyebrow">Ready when you are</span>
              <h2 id="dialog-title">
                A place on your
                <br />
                <em>home screen.</em>
              </h2>
              <p>
                Keep Cooler Walks close for your next walk. Installation is optional; the same
                planner works in your browser.
              </p>
              {installEvent ? (
                <button
                  className="primary"
                  onClick={async () => {
                    await installEvent.prompt();
                    await installEvent.userChoice;
                    setInstallEvent(null);
                  }}
                >
                  Install Cooler Walks <Download size={18} />
                </button>
              ) : (
                <div className="install-instructions">
                  <h3>On iPhone or iPad</h3>
                  <p>Open in Safari, use Share, then “Add to Home Screen”.</p>
                  <h3>On Android or a computer</h3>
                  <p>
                    Open in Chrome or Edge and use the browser’s install action or menu. The action
                    appears when supported.
                  </p>
                </div>
              )}
              <p className="small-copy">
                After a successful online load and cache installation, the saved interface and
                visited city’s map and route data can work offline. Saved data keeps its source
                dates; closures and live navigation are not provided.
              </p>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
