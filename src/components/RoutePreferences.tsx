import { useI18n } from '../i18n';
import { goalLabels, goalsOf } from '../lib/preferences';
import type { City, RouteGoal, RoutePreferences as Preferences } from '../lib/types';

export function RoutePreferences({
  city,
  pavements,
  value,
  onChange,
}: {
  city: City;
  pavements: boolean;
  value: Preferences;
  onChange: (value: Preferences) => void;
}) {
  const { t } = useI18n();
  const available: RouteGoal[] = [
    ...(city.capabilities.buildingShade ? (['shade', 'sun'] as const) : (['greenery'] as const)),
    ...(city.capabilities.trafficCalming && !pavements ? (['calm'] as const) : []),
    ...(city.elevation ? (['flat'] as const) : []),
    ...(city.capabilities.water ? (['water'] as const) : []),
  ];
  const compatible = (goal: RouteGoal, primary: RouteGoal) =>
    goal !== primary && !(['shade', 'sun'].includes(goal) && ['shade', 'sun'].includes(primary));
  const additional = available.filter((goal) => compatible(goal, value.primary));
  return (
    <section className="route-preferences" aria-label={t('Route preferences')}>
      <label className="priority-label" htmlFor="route-priority">
        {t('Main priority')}
      </label>
      <select
        id="route-priority"
        value={value.primary}
        onChange={(e) => {
          const primary = e.target.value as RouteGoal;
          onChange({
            primary,
            secondary: value.secondary.filter((goal) => compatible(goal, primary)),
          });
        }}
      >
        {available.map((goal) => (
          <option key={goal} value={goal}>
            {t(goalLabels[goal])}
          </option>
        ))}
      </select>
      <details className="additional-preferences">
        <summary>
          {t('More preferences')}
          {value.secondary.length > 0 && (
            <span className="preference-count">{value.secondary.length}</span>
          )}
        </summary>
        <p className="preference-help">
          {t('Used in the order selected, when routes are similar for your main priority.')}
        </p>
        {additional.map((goal) => (
          <label className="optional-preference" key={goal}>
            <input
              type="checkbox"
              checked={value.secondary.includes(goal)}
              onChange={(e) =>
                onChange({
                  primary: value.primary,
                  secondary: e.target.checked
                    ? [...value.secondary.filter((g) => compatible(g, goal)), goal]
                    : value.secondary.filter((g) => g !== goal),
                })
              }
            />
            <span>{t(goalLabels[goal])}</span>
            {value.secondary.includes(goal) && (
              <small aria-hidden="true">{value.secondary.indexOf(goal) + 2}</small>
            )}
          </label>
        ))}
        {pavements && city.capabilities.trafficCalming && (
          <p className="preference-help">
            {t('Calmer-street comparison is available on the standard network.')}
          </p>
        )}
      </details>
      {value.secondary.length > 0 && (
        <p className="preference-order" aria-live="polite">
          {goalsOf(value).map((goal, i) => (
            <span key={goal}>
              {i > 0 && ' → '}
              {t(goalLabels[goal])}
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
