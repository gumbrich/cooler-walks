import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Download, Map, Trash2, WifiOff } from 'lucide-react';
import {
  areas,
  areaDownloadURL,
  bundledAreas,
  installedStatus,
  installArea,
  sizeLabel,
} from '../lib/areas';
import { areaStore } from '../lib/area-store';
import { getCity } from '../lib/cities';
import { isNativeApp } from '../lib/platform';
import type { AreaDescriptor, SavedArea } from '../lib/area-types';

export function AreaDownloads({
  activeId,
  onUse,
}: {
  activeId?: string;
  onUse: (area: AreaDescriptor) => void;
}) {
  const [saved, setSaved] = useState<SavedArea[]>([]);
  const [bundled, setBundled] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState(false);
  const request = useRef<AbortController | null>(null);
  const refresh = async () => {
    const [stored, included] = await Promise.all([areaStore().list(), bundledAreas()]);
    setSaved(stored);
    setBundled(included);
  };
  useEffect(() => {
    void refresh()
      .catch(() => {
        setFailure(true);
        setMessage('Map storage is unavailable. Your current walk is still open.');
      })
      .finally(() => setLoading(false));
    return () => request.current?.abort();
  }, []);
  const download = async (area: AreaDescriptor) => {
    const controller = new AbortController();
    request.current = controller;
    setWorking(area.id);
    setProgress(0);
    setMessage('');
    setFailure(false);
    try {
      await installArea(area, { signal: controller.signal, progress: setProgress });
      await refresh();
      setMessage(`${area.label} is ready for offline walks.`);
      // Persistence may be declined by the browser. Never imply a guarantee.
      if (!isNativeApp) void navigator.storage?.persist?.().catch(() => {});
    } catch (error) {
      setFailure(!controller.signal.aborted);
      setMessage(
        controller.signal.aborted
          ? 'Download cancelled. Previously saved maps are unchanged.'
          : (error as DOMException)?.name === 'QuotaExceededError'
            ? 'Not enough storage. Remove a saved area or free space, then try again.'
            : error instanceof Error
              ? error.message
              : 'The download could not finish. Previously saved maps are unchanged.',
      );
    } finally {
      request.current = null;
      setWorking(null);
    }
  };
  const remove = async (area: AreaDescriptor) => {
    setWorking(area.id);
    setProgress(1);
    setMessage('');
    setFailure(false);
    try {
      await areaStore().remove(area.id);
      await refresh();
      setMessage(
        `${area.label} removed from downloads. Your open walk stays available until you leave it.`,
      );
    } catch {
      setFailure(true);
      setMessage('This download could not be removed. Try again.');
    } finally {
      setWorking(null);
    }
  };
  return (
    <div className="area-manager">
      <span className="eyebrow">
        <Map size={15} /> Your pocket atlas
      </span>
      <h2 id="dialog-title">
        A little preparation.
        <br />
        <em>A lot of exploring.</em>
      </h2>
      <p>
        Save a walking area before you go. Its map, paths and environmental data stay together,
        ready without a connection.
      </p>
      <div className="storage-strip">
        <WifiOff size={19} />
        <span>
          <strong>
            {saved.length
              ? `${sizeLabel(saved.reduce((n, a) => n + a.bytes, 0))} saved`
              : 'Ready when you are'}
          </strong>
          <small>
            {isNativeApp
              ? `${bundled.length} areas included in this build`
              : 'Downloads saved on this browser'}
          </small>
        </span>
      </div>
      <div
        role="status"
        aria-live="polite"
        className={message ? `download-notice ${failure ? 'is-error' : ''}` : ''}
      >
        {message}
      </div>
      {loading ? (
        <p>Checking your maps…</p>
      ) : (
        <div className="area-list">
          {[...areas]
            .sort(
              (a, b) =>
                areas.findIndex((item) => item.cityId === a.cityId) -
                areas.findIndex((item) => item.cityId === b.cityId),
            )
            .map((area) => {
              const city = getCity(area.cityId),
                status = installedStatus(area, saved, bundled);
              const ready = status === 'saved' || status === 'included';
              const active = activeId === area.id;
              const downloading = working === area.id;
              const available = !!areaDownloadURL(area);
              return (
                <article
                  className={`area-card ${active ? 'is-active' : ''}`}
                  key={area.id}
                  data-area-id={area.id}
                >
                  <div className="area-card-top">
                    <span className="eyebrow">
                      {city.localName} · {city.country}
                    </span>
                    <span className="area-state">
                      {ready && <Check size={13} />}
                      {status === 'included'
                        ? 'Included'
                        : status === 'saved'
                          ? 'Saved'
                          : status === 'update'
                            ? 'Update needed'
                            : 'Available'}
                    </span>
                  </div>
                  <h3>{area.label}</h3>
                  <p className="area-facts">
                    {area.areaKm2} km² · {sizeLabel(area.bytes)} download ·{' '}
                    {city.capabilities.buildingShade
                      ? 'Building shade estimates'
                      : 'Greenery prototype'}
                  </p>
                  <details>
                    <summary>Coverage & source dates</summary>
                    <p>{area.description}</p>
                    <p>
                      Prepared {area.preparedAt.slice(0, 10)}. Observation dates differ by source;
                      see “Our approach”.{' '}
                      {area.bounds
                        ? 'Routes must stay within this smaller area.'
                        : 'The map shows the supported boundary.'}{' '}
                      Tree shade and live closures are not included.
                    </p>
                  </details>
                  {downloading && (
                    <div className="download-progress">
                      <progress aria-label={`Downloading ${area.label}`} max={1} value={progress} />
                      <span>
                        {progress >= 0.97
                          ? 'Saving verified map…'
                          : `${Math.round(progress * 100)}% · keep this view open`}
                      </span>
                    </div>
                  )}
                  <div className="area-actions">
                    {ready ? (
                      <button
                        className="area-primary"
                        disabled={!!working}
                        onClick={() => onUse(area)}
                      >
                        {active ? 'Open this area' : 'Use this area'} <ArrowRight size={16} />
                      </button>
                    ) : downloading ? (
                      <button
                        className="area-primary"
                        disabled={progress >= 0.97}
                        onClick={() => request.current?.abort()}
                      >
                        Cancel download
                      </button>
                    ) : (
                      <button
                        className="area-primary"
                        disabled={!!working || !available}
                        onClick={() => void download(area)}
                      >
                        <Download size={16} />
                        {status === 'update' ? 'Update area' : 'Download area'}
                      </button>
                    )}
                    {(status === 'saved' || status === 'update') && (
                      <button
                        className="area-remove"
                        disabled={!!working}
                        aria-label={`Remove ${area.label} download`}
                        onClick={() => void remove(area)}
                      >
                        <Trash2 size={17} />
                      </button>
                    )}
                  </div>
                  {!ready && !available && (
                    <p className="area-unavailable">
                      This development build needs a download service configured. Included areas
                      remain available.
                    </p>
                  )}
                </article>
              );
            })}
        </div>
      )}
      <p className="small-copy">
        Downloads contain public map data, never your journey history.{' '}
        {isNativeApp
          ? 'Included areas are part of the app and cannot be removed here.'
          : 'Browsers may clear saved maps when storage is low. Recently opened maps may also remain in the browser cache.'}{' '}
        Source updates are reviewed and released with compatible app versions.
      </p>
    </div>
  );
}
