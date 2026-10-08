import { useI18n } from '../i18n';
import { goalLabels, goalsOf, goalCovered } from '../lib/preferences';
import type { Route, RouteGoal, RouteResult } from '../lib/types';
import { formatDistance } from '../lib/geo';
import { formatElevation } from '../lib/elevation';

export function PreferenceComparison({
  result,
  units,
}: {
  result: RouteResult;
  units: 'metric' | 'imperial';
}) {
  const { t, locale } = useI18n();
  if (!result.preferences?.secondary.length || !result.alternative) return null;
  const metric = (goal: RouteGoal, r: Route) => {
    if (!goalCovered(goal, r, result.fastest, result.mode)) return t('Unavailable');
    if (goal === 'flat')
      return `↑ ${formatElevation(r.terrain!.ascent, units, locale)} · ↓ ${formatElevation(r.terrain!.descent, units, locale)}`;
    if (goal === 'calm') return formatDistance(r.majorRoadMeters, units, locale);
    if (goal === 'shade') return `${Math.round(r.sunMeters / 80)} min`;
    const share = goal === 'sun' ? r.sunMeters : goal === 'water' ? r.waterMeters : r.greenMeters;
    return `${Math.round((100 * share) / r.distance)}%`;
  };
  return (
    <details className="preference-comparison" open>
      <summary>{t('Compare preferences')}</summary>
      <table>
        <caption className="sr-only">{t('Fastest walk and alternative, by preference')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('Preference')}</th>
            <th scope="col">{t('Fastest')}</th>
            <th scope="col">{t('Alternative')}</th>
          </tr>
        </thead>
        <tbody>
          {goalsOf(result.preferences).map((goal) => (
            <tr key={goal}>
              <th scope="row">
                {t(
                  goal === 'shade'
                    ? 'Time in direct sun'
                    : goal === 'calm'
                      ? 'Near main roads'
                      : goalLabels[goal],
                )}
              </th>
              <td>{metric(goal, result.fastest)}</td>
              <td>{metric(goal, result.alternative!)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>{t('Estimates. The main priority comes first; other choices may involve a trade-off.')}</p>
      {!!result.unavailableSecondary?.length && (
        <p>
          {t('Not compared: {goals}. Data coverage is insufficient.', {
            goals: result.unavailableSecondary.map((g) => t(goalLabels[g])).join(', '),
          })}
        </p>
      )}
    </details>
  );
}
