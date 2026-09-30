import { CarFront, ChevronDown } from 'lucide-react';
import { useI18n } from '../i18n';
import type { CounterObservation } from '../lib/vehicle-counts';
import type { VehicleCounts } from '../lib/types';

export function TrafficCounts({
  data,
  observations,
  expanded,
  onExpanded,
}: {
  data: VehicleCounts;
  observations: CounterObservation[];
  expanded: boolean;
  onExpanded: (open: boolean) => void;
}) {
  const { t, number, locale } = useI18n();
  return (
    <details
      className="traffic-counts"
      open={expanded}
      onToggle={(event) => onExpanded(event.currentTarget.open)}
    >
      <summary>
        <CarFront size={18} />
        <span>
          {t('Vehicle counts nearby')}
          <small>{t('{year} observations · partial coverage', { year: data.year })}</small>
        </span>
        <ChevronDown size={16} />
      </summary>
      <div className="counts-body">
        <p className="counts-intro">
          {t(
            'Measured at individual counters within 40 m of this walk. These are nearby observations, not a traffic total for your route.',
          )}
        </p>
        <p className="counts-slot">
          <strong>{t('Profiles follow your estimated passing time')}</strong>
          <span>{data.timeZone}</span>
        </p>
        <p>
          {t(
            'Mean for the weekday and hour you reach each counter, using {year} observations. Historical reference, not live traffic or a forecast.',
            { year: data.year },
          )}
        </p>
        {observations.length ? (
          <ol className="counter-list">
            {observations.map(
              ({ counter, mean, days, expectedDays, arrival, weekday, hour }, index) => {
                const hours = counter.profile.slice(weekday * 24, weekday * 24 + 24);
                const maximum = Math.max(1, ...hours.map((v) => v?.[0] ?? 0));
                const day = new Intl.DateTimeFormat(locale, {
                  weekday: 'long',
                  timeZone: data.timeZone,
                }).format(new Date(arrival));
                const passing = new Intl.DateTimeFormat(locale, {
                  hour: '2-digit',
                  minute: '2-digit',
                  hourCycle: 'h23',
                  timeZone: data.timeZone,
                }).format(new Date(arrival));
                const slot = `${day}, ${String(hour).padStart(2, '0')}:00–${String((hour + 1) % 24).padStart(2, '0')}:00`;
                return (
                  <li key={counter.id} data-counter-id={counter.id}>
                    <div className="counter-heading">
                      <span className="counter-number">{index + 1}</span>
                      <div>
                        <strong>{counter.street}</strong>
                        <small>
                          {t('Direction: {direction}', { direction: counter.direction })}
                        </small>
                      </div>
                    </div>
                    <p className="counter-slot">
                      <strong>{t('Passing around {time}', { time: passing })}</strong>
                      <span>{slot}</span>
                    </p>
                    <div className="counter-value">
                      {mean === null ? (
                        <strong>{t('Insufficient measured data')}</strong>
                      ) : (
                        <>
                          <strong>
                            ≈ {mean < 10 ? number(mean, 1) : number(Math.round(mean / 10) * 10)}
                          </strong>
                          <span>{t('vehicles/hour')}</span>
                        </>
                      )}
                    </div>
                    <small className="counter-pattern-label">
                      {t('Daily pattern · each chart has its own scale')}
                    </small>
                    <div className="counter-hours" aria-hidden="true">
                      {hours.map((value, i) => (
                        <span
                          key={i}
                          className={`${i === hour ? 'current' : ''} ${value?.[0] == null ? 'missing' : ''}`}
                          style={{
                            height:
                              value?.[0] == null
                                ? '10%'
                                : `${Math.max(3, (value[0] / maximum) * 100)}%`,
                          }}
                        />
                      ))}
                    </div>
                    <div className="counter-axis" aria-hidden="true">
                      <span>00</span>
                      <span>12</span>
                      <span>23</span>
                    </div>
                    <small>
                      {t('{days}/{expected} measured days · {id}', {
                        days,
                        expected: expectedDays,
                        id: counter.id,
                      })}
                    </small>
                  </li>
                );
              },
            )}
          </ol>
        ) : (
          <p className="counts-empty">
            {t(
              'No supported counter within 40 m of this walk. Traffic volume is unknown here; this does not mean zero traffic.',
            )}
          </p>
        )}
        <p className="counts-limit">
          {t(
            'Counts are too sparse to rank whole routes. Calmer-street recommendations still use mapped street types and official zones. Opposite directions are shown separately; missing and imputed hours are excluded.',
          )}
        </p>
        <a
          href="https://data.stadt-zuerich.ch/dataset/sid_dav_verkehrszaehlung_miv_od2031"
          target="_blank"
          rel="noreferrer"
        >
          {t('Zurich vehicle-count source')}
        </a>
      </div>
    </details>
  );
}
