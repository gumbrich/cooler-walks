// Injected into both app and route-worker builds from the actual data bytes.
// Development and Node data-preparation tools keep their ordinary file paths.
declare const __DATA_REVISIONS__: Record<string, string> | undefined;
export function dataUrl(input: string): string {
  if (typeof __DATA_REVISIONS__ === 'undefined') return input;
  const url = new URL(input, 'https://local.invalid');
  const revision = __DATA_REVISIONS__?.[url.pathname];
  if (!revision) return input;
  url.searchParams.set('v', revision);
  return input.startsWith('/') ? url.pathname + url.search : url.href;
}
