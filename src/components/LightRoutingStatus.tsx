import { useI18n } from '../i18n';
import { goalCovered, goalImproves } from '../lib/preferences';
import type { RouteResult } from '../lib/types';

/** Keep the light preference's effect visible, including when another wish is enabled. */
export function LightRoutingStatus({
  result,
  busy,
  goal,
  extra,
}: {
  result: RouteResult | null;
  busy: boolean;
  goal: 'shade' | 'sun';
  extra: number;
}) {
  const { t, number } = useI18n();
  let text: string;
  let unavailable = false;
  if (busy)
    text = t(goal === 'shade' ? 'Finding a route with less sun…' : 'Finding a sunnier route…');
  else if (!result)
    text = t(goal === 'shade' ? 'Less time in direct sun.' : 'More of the walk in direct sun.');
  else if (result.mode !== 'shade') {
    unavailable = true;
    text = t(
      result.mode === 'night'
        ? 'It is dark at this departure time. Sun or shade cannot affect the route.'
        : result.mode === 'low-sun'
          ? 'The sun is too low for this model. Sun or shade cannot affect the route.'
          : result.mode === 'transition'
            ? 'This walk reaches dusk or dawn. Sun and shade cannot be compared.'
            : 'Not enough shade data for this route. Your sun or shade choice cannot be applied.',
    );
  } else if (extra === 0) text = t('No extra walking time allowed. The fastest route is shown.');
  else if (
    result.alternative &&
    goalCovered(goal, result.alternative, result.fastest, result.mode) &&
    goalImproves(goal, result.alternative, result.fastest)
  ) {
    const r = result.alternative;
    text =
      goal === 'shade'
        ? t(
            result.treeShadeFallback
              ? 'Building shade: about {minutes} min less sun.'
              : 'Shadier option: about {minutes} min less direct sun.',
            {
              // Durations use the router's fixed walking speed; no new speed assumption here.
              minutes: number(
                (result.fastest.minutes * result.fastest.sunMeters) / result.fastest.distance -
                  (r.minutes * (r.sunMeters + r.unknownMeters)) / r.distance,
                1,
              ),
            },
          )
        : t(
            result.treeShadeFallback
              ? 'Without building shade: about {share}% of the walk.'
              : 'Sunnier option: about {share}% of the walk in direct sun.',
            {
              share: Math.round((100 * r.sunMeters) / r.distance),
            },
          );
  } else
    text = t(
      goal === 'shade'
        ? 'No meaningfully shadier route found within your extra walking time.'
        : 'No meaningfully sunnier route found within your extra walking time.',
    );
  return (
    <p className={`light-routing-status${unavailable ? ' unavailable' : ''}`} role="status">
      {text}
      {result?.treeShadeFallback && !busy && (
        <small className="light-model-note">{t('Buildings used; tree data has gaps here.')}</small>
      )}
    </p>
  );
}
