import { Temporal } from '@js-temporal/polyfill';
export function localNow(zone: string) {
  return Temporal.Now.zonedDateTimeISO(zone).toPlainDateTime().toString().slice(0, 16);
}
export function toInstant(local: string, zone: string) {
  // Reject both skipped and repeated wall times instead of silently choosing an offset.
  return Temporal.PlainDateTime.from(local)
    .toZonedDateTime(zone, { disambiguation: 'reject' })
    .toInstant()
    .toString();
}
export function timeLabel(local: string) {
  return local.split('T')[1]?.slice(0, 5) ?? '';
}
export function arrivalLabel(instant: string, departure: string, zone: string, locale: string) {
  // Match the whole-minute walking-time display, and include the date if the
  // walk crosses local midnight. Elapsed time is added in UTC, including DST.
  const rounded = Math.ceil(Date.parse(instant) / 60000) * 60000;
  const day = (ms: number) =>
    Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(zone).toPlainDate().toString();
  return new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    ...(day(rounded) !== day(Date.parse(departure))
      ? ({ day: 'numeric', month: 'short' } as const)
      : {}),
  }).format(rounded);
}
