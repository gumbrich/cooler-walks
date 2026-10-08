import { ChevronDown, Mountain } from 'lucide-react';
import { useI18n } from '../i18n';
import { formatDistance } from '../lib/geo';
import { formatElevation } from '../lib/elevation';
import type { Route } from '../lib/types';

export function ElevationProfile({ route, units }: { route: Route; units: 'metric' | 'imperial' }) {
  const { t, locale } = useI18n();
  const terrain = route.terrain!;
  const heights = terrain.profile.flatMap((p) => (p.elevation === null ? [] : [p.elevation]));
  const low = Math.floor(Math.min(...heights) / 10) * 10;
  const high = Math.max(low + 20, Math.ceil(Math.max(...heights) / 10) * 10);
  let pen = false;
  const path = terrain.profile
    .map((p) => {
      if (p.elevation === null) {
        pen = false;
        return '';
      }
      const command = `${pen ? 'L' : 'M'}${((p.distance / route.distance) * 300).toFixed(2)},${(85 - ((p.elevation - low) / (high - low)) * 70).toFixed(2)}`;
      pen = true;
      return command;
    })
    .join(' ');
  return (
    <details className="elevation-profile">
      <summary>
        <Mountain size={17} />
        <span>{t('Elevation profile')}</span>
        <ChevronDown size={16} />
      </summary>
      <div className="elevation-content">
        {heights.length > 0 && (
          <div className="elevation-chart">
            <div className="elevation-axis">
              <span>{formatElevation(high, units, locale)}</span>
              <span>{formatElevation(low, units, locale)}</span>
            </div>
            <svg
              viewBox="0 0 300 100"
              role="img"
              aria-label={t('Estimated ground elevation along the route. Gaps are unknown.')}
            >
              <path d="M0,15H300 M0,85H300" className="elevation-grid" />
              <path d={path} className="elevation-line" />
            </svg>
            <div className="elevation-distance">
              <span>0</span>
              <span>{formatDistance(route.distance, units, locale)}</span>
            </div>
          </div>
        )}
        {heights.length > 0 && (
          <p>
            {t('↑ {up} ascent · ↓ {down} descent', {
              up: formatElevation(terrain.ascent, units, locale),
              down: formatElevation(terrain.descent, units, locale),
            })}
          </p>
        )}
        <p>
          {t('{distance} with elevation data · {unknown} unknown', {
            distance: formatDistance(terrain.knownMeters, units, locale),
            unknown: formatDistance(terrain.unknownMeters, units, locale),
          })}
        </p>
        <p>
          {t(
            'Ground model, 2021–2022. Bridge and tunnel heights may be unknown. Estimates need field checks; a flatter route can still include steps.',
          )}
        </p>
        <p>{t('Walking times do not yet account for slopes.')}</p>
      </div>
    </details>
  );
}
