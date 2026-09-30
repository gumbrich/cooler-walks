import type { Place } from './types';

export function normalizePlaceQuery(text: string): string {
  return text
    .toLocaleLowerCase('de-CH')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/(\p{L})(\d)/gu, '$1 $2')
    .replace(/str\.?(?=\s|$)/g, 'strasse')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function indexPlaces(places: Place[], cityName: string) {
  return places.map((place) => ({
    place,
    name: normalizePlaceQuery(place.name),
    words: normalizePlaceQuery(
      `${place.name} ${place.postcode ?? ''} ${cityName} ${cityName === 'Zürich' ? 'Zurich Schweiz Switzerland' : ''}`,
    ).split(' '),
  }));
}

export function searchPlaces(
  index: ReturnType<typeof indexPlaces>,
  query: string,
  limit = 7,
): Place[] {
  const normalized = normalizePlaceQuery(query),
    tokens = normalized.split(' ').filter(Boolean);
  if (!tokens.length)
    return index
      .filter((p) => !p.place.address)
      .slice(0, limit)
      .map((p) => p.place);
  const hasNumber = tokens.some((t) => /^\d/.test(t));
  return index
    .filter((entry) =>
      tokens.every((token) =>
        entry.words.some((word) => (/^\d/.test(token) ? word === token : word.startsWith(token))),
      ),
    )
    .sort((a, b) => {
      const rank = (entry: typeof a) =>
        (entry.name === normalized ? 0 : entry.name.startsWith(normalized) ? 2 : 4) +
        (entry.place.address === hasNumber ? 0 : 1);
      return (
        rank(a) - rank(b) || a.place.name.localeCompare(b.place.name, 'de-CH', { numeric: true })
      );
    })
    .slice(0, limit)
    .map((entry) => entry.place);
}
