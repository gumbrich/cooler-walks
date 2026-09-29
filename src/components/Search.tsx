import { useI18n } from '../i18n';
import { useId, useState } from 'react';
import { MapPin, Search as SearchIcon } from 'lucide-react';
import type { Place, Point } from '../lib/types';
export interface Endpoint {
  name: string;
  point: Point;
}
export function PlaceSearch({
  label,
  cityName,
  value,
  places,
  onChange,
  onPick,
}: {
  label: string;
  cityName: string;
  value: Endpoint | null;
  places: Place[];
  onChange: (v: Endpoint | null) => void;
  onPick: () => void;
}) {
  const { t } = useI18n();
  const id = useId(),
    [query, setQuery] = useState(value?.name ?? ''),
    [open, setOpen] = useState(false),
    [cursor, setCursor] = useState(0);
  const options = places
    .filter((p) => p.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    .slice(0, 6);
  const select = (p: Place) => {
    onChange({ name: p.name, point: p.point });
    setQuery(p.name);
    setOpen(false);
  };
  return (
    <div className="place-field">
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
          placeholder={t('Search pilot streets & places')}
          value={open ? query : value ? t(value.name) : query}
          onFocus={() => {
            setQuery(value ? t(value.name) : query);
            setOpen(true);
            setCursor(0);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
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
              select(options[cursor]);
            }
            if (e.key === 'Escape') setOpen(false);
          }}
        />
        <button
          type="button"
          className="map-pick"
          aria-label={t('Choose {label} on map', { label: label.toLowerCase() })}
          onClick={() => {
            setOpen(false);
            onPick();
          }}
        >
          <MapPin size={18} />
        </button>
      </div>
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
                    {t(p.kind)} · {cityName}
                  </small>
                </span>
              </button>
            </li>
          ))}
          {!options.length && (
            <li className="search-empty">
              {t('No match in this pilot. Search another street or choose a point on the map.')}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
