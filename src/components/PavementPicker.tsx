import { useI18n } from '../i18n';
import type { PavementChoice } from '../lib/pavement-selection';

export function PavementPicker({
  name,
  choices,
  onChoose,
  onMap,
  units,
}: {
  name: string;
  choices: PavementChoice[];
  onChoose: (choice: PavementChoice) => void;
  onMap: () => void;
  units: 'metric' | 'imperial';
}) {
  const { t, locale } = useI18n();
  return (
    <section className="pavement-picker" aria-label={t('Choose a walking point')}>
      <div aria-live="polite">
        <h2>{t('Choose a walking point')}</h2>
        <p className="pavement-address">{t(name)}</p>
        <p>
          {t(
            'Choose the side you can reach. The route starts or ends on the selected path; access from the address is not included.',
          )}
        </p>
      </div>
      <div className="pavement-options">
        {choices.map((choice, i) => (
          <button
            type="button"
            className="pavement-option"
            key={choice.sourceId}
            onClick={() => onChoose(choice)}
          >
            <b>{i + 1}</b>
            <span>
              {choice.name || t('Unnamed path')}
              <small>
                {t('{distance} from selected location', {
                  distance: `${new Intl.NumberFormat(locale).format(Math.round(choice.distance * (units === 'imperial' ? 3.28084 : 1)))} ${units === 'imperial' ? 'ft' : 'm'}`,
                })}
              </small>
            </span>
          </button>
        ))}
      </div>
      {!choices.length && (
        <p>
          {t('No mapped walking point nearby. Choose a path inside the supported area on the map.')}
        </p>
      )}
      <button type="button" className="text-button" onClick={onMap}>
        {t('Choose another point on map')}
      </button>
    </section>
  );
}
