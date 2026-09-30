import { ChevronDown, Footprints } from 'lucide-react';
import { useI18n } from '../i18n';
import { formatDistance } from '../lib/geo';
import { summarizeTraffic } from '../lib/traffic';
import type { Route } from '../lib/types';

export function TrafficProfile({ route, units }: { route: Route; units: 'metric' | 'imperial' }) {
  const { t, locale } = useI18n();
  const b = route.trafficBreakdown ?? summarizeTraffic(route.samples);
  const rows = [
    {
      id: 'pedestrian',
      label: 'Paths & restricted streets',
      meters: b.path + b.pedestrian + b.restricted,
    },
    { id: 'encounter', label: 'Begegnungszone streets', meters: b.encounter },
    { id: 'tempo30', label: 'Tempo-30 streets', meters: b.tempo30 },
    { id: 'other', label: 'Other streets & crossings', meters: b.other },
    { id: 'major', label: 'Near main roads', meters: b.major },
    { id: 'unknown', label: 'Unknown street context', meters: b.unknown },
  ];
  return (
    <details className="traffic-profile">
      <summary>
        <Footprints size={18} />
        <span>
          {t('Streets along this walk')}
          <small>{t('Mapped context · field validation pending')}</small>
        </span>
        <ChevronDown size={16} />
      </summary>
      <div className="traffic-profile-body">
        <div className="traffic-profile-bar" aria-hidden="true">
          {rows
            .filter((row) => row.meters > 0)
            .map((row) => (
              <span
                key={row.id}
                className={`traffic-swatch ${row.id}`}
                style={{ flexGrow: row.meters / route.distance }}
              />
            ))}
        </div>
        <dl>
          {rows.map((row) => (
            <div key={row.id}>
              <dt>
                <span className={`traffic-swatch ${row.id}`} aria-hidden="true" />
                {t(row.label)}
              </dt>
              <dd>{formatDistance(row.meters, units, locale)}</dd>
            </div>
          ))}
        </dl>
        <p>
          {t(
            'Tempo 30 limits speed, not vehicle volume. Pedestrian areas can still have deliveries. Missing data stays unknown; this is not a noise or safety score.',
          )}
        </p>
      </div>
    </details>
  );
}
