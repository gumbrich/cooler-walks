import { useI18n } from '../i18n';
import { useId, useMemo, useState } from 'react';
import { MapPin, Search as SearchIcon } from 'lucide-react';
import type { City, Place, Point } from '../lib/types';
import { inCoverage } from '../lib/coverage';
import { indexPlaces, searchPlaces } from '../lib/place-search';
export interface Endpoint {
  name: string;
  point: Point;
  address?: boolean;
  pavement?: { point: Point; sourceId?: number; name?: string };
}
export function PlaceSearch({
  label,
  city,
  value,
  places,
  addresses = false,
  onChange,
  onPick,
  onChoosePavement,
}: {
  label: string;
  city: City;
  value: Endpoint | null;
  places: Place[];
  addresses?: boolean;
  onChange: (v: Endpoint | null) => void;
  onPick: () => void;
  onChoosePavement?: () => void;
}) {
  const { t } = useI18n();
  const cityName = city.localName;
  const id = useId(),
    [query, setQuery] = useState(value?.name ?? ''),
    [open, setOpen] = useState(false),
    [cursor, setCursor] = useState(0);
  const index = useMemo(() => indexPlaces(places, cityName), [places, cityName]);
  const options = searchPlaces(index, query);
  const select = (p: Place) => {
    onChange({
      name: p.name,
      point: p.point,
      address: p.address,
      ...(p.kind === 'pavement' ? { pavement: { point: p.point, name: p.name } } : {}),
    });
    setQuery(p.name);
    setOpen(false);
  };
  return (
    <div
      className="place-field"
      onBlur={(e) => {
        // Keep options open when focus moves to a result button. Closing a field
        // must not leave a timer that can close it again after the user returns.
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={id}>{label}</label>
      <div className="place-input">
        <SearchIcon size={16} />
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && options.length ? `${id}-${cursor}` : undefined}
          autoComplete="off"
          placeholder={t(
            addresses ? 'Street, house number or place' : 'Search pilot streets & places',
          )}
          value={open ? query : value ? t(value.name) : query}
          onFocus={() => {
            setQuery(value ? t(value.name) : query);
            setOpen(true);
            setCursor(0);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(null);
            setCursor(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setCursor((cursor + 1) % Math.max(options.length, 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setCursor((cursor - 1 + options.length) % Math.max(options.length, 1));
            }
            if (e.key === 'Enter' && open && options[cursor]) {
              e.preventDefault();
              e.stopPropagation();
              select(options[cursor]);
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setOpen(false);
            }
          }}
        />
        <button
          type="button"
          className="map-pick"
          aria-label={t('Choose {label} on map', { label: label.toLowerCase() })}
          title={t('Choose on map')}
          onClick={() => {
            setOpen(false);
            onPick();
          }}
        >
          <MapPin size={18} />
          <span>{t('Map')}</span>
        </button>
      </div>
      {value?.pavement && onChoosePavement && (
        <button type="button" className="pavement-reselect" onClick={onChoosePavement}>
          {t('Change walking point')}
        </button>
      )}
      {open && (
        <ul id={`${id}-list`} role="listbox" className="search-options">
          {options.map((p, i) => (
            <li key={p.id} id={`${id}-${i}`} role="option" aria-selected={i === cursor}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(p)}
              >
                <MapPin size={15} />
                <span>
                  {p.name}
                  <small>
                    {p.kind === 'pavement' ? t('Path junction') : t(p.kind)} ·{' '}
                    {p.postcode ? `${p.postcode} ` : ''}
                    {cityName}
                    {p.address && !inCoverage(city, p.point)
                      ? ` · ${t('Outside walking coverage')}`
                      : ''}
                  </small>
                </span>
              </button>
            </li>
          ))}
          {!options.length && (
            <li className="search-empty">
              {t(
                addresses
                  ? 'No matching Zurich address. Try the street and house number, or choose on the map.'
                  : 'No match in this pilot. Search another street or choose a point on the map.',
              )}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
