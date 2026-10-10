import { CloudSun, Sun, Waves, Mountain, Footprints, Accessibility } from 'lucide-react';
import { useI18n } from '../i18n';
import { goalLabels } from '../lib/preferences';
import type { City, RouteGoal, RoutePreferences as Preferences } from '../lib/types';

export function LightChoice({
  city,
  value,
  onChange,
}: {
  city: City;
  value: Preferences;
  onChange: (value: Preferences) => void;
}) {
  const { t } = useI18n();
  if (!city.capabilities.buildingShade) return null;
  return (
    <div className="light-choice" role="group" aria-label={t('Sun or shade')}>
      {(['shade', 'sun'] as const).map((mode) => {
        const Icon = mode === 'shade' ? CloudSun : Sun;
        return (
          <button
            key={mode}
            type="button"
            className={mode}
            aria-pressed={value.primary === mode}
            onClick={() => onChange({ ...value, primary: mode })}
          >
            <Icon size={22} aria-hidden="true" />
            {t(goalLabels[mode])}
          </button>
        );
      })}
    </div>
  );
}
export function RoutePreferences({
  city,
  value,
  onChange,
}: {
  city: City;
  value: Preferences;
  onChange: (value: Preferences) => void;
}) {
  const { t } = useI18n();
  const available: { goal: RouteGoal; icon: typeof Waves }[] = [
    ...(city.capabilities.trafficCalming ? [{ goal: 'calm' as const, icon: Footprints }] : []),
    ...(city.capabilities.water ? [{ goal: 'water' as const, icon: Waves }] : []),
    ...(city.elevation ? [{ goal: 'flat' as const, icon: Mountain }] : []),
  ];
  const count = value.secondary.length + (value.avoidSteps ? 1 : 0);
  return (
    <section className="route-preferences" aria-label={t('Route preferences')}>
      <details className="additional-preferences">
        <summary>
          {t('More preferences')}
          {count > 0 && <span className="preference-count">{count}</span>}
        </summary>
        <div className="preference-grid">
          {available.map(({ goal, icon: Icon }) => (
            <label className="optional-preference" key={goal}>
              <Icon size={18} aria-hidden="true" />
              <span>{t(goalLabels[goal])}</span>
              <input
                type="checkbox"
                checked={value.secondary.includes(goal)}
                onChange={(e) =>
                  onChange({
                    ...value,
                    secondary: e.target.checked
                      ? [...value.secondary, goal]
                      : value.secondary.filter((g) => g !== goal),
                  })
                }
              />
            </label>
          ))}
          {city.pavementPilot && (
            <label className="optional-preference">
              <Accessibility size={18} aria-hidden="true" />
              <span>{t('Accessibility')}</span>
              <input
                type="checkbox"
                checked={!!value.avoidSteps}
                aria-describedby="accessibility-help"
                onChange={(e) => onChange({ ...value, avoidSteps: e.target.checked })}
              />
            </label>
          )}
        </div>
        {value.avoidSteps && (
          <p className="preference-help" id="accessibility-help">
            {t(
              'Avoids mapped stairs and barriers; prefers gentler routes. Kerbs, widths and surfaces still need checking.',
            )}
          </p>
        )}
        <p className="preference-help">
          {t('Your wishes are considered together, within the extra walking time.')}
        </p>
      </details>
    </section>
  );
}
