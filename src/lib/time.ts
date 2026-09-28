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
